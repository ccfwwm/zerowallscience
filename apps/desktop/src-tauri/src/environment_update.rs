use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{BufReader, Read, Write};
use std::path::{Component as PathComponent, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Manager;
use thiserror::Error;

pub const ENVIRONMENT_ENVELOPE_SCHEMA: &str = "zerowall.science/environment-envelope/v1";
pub const ENVIRONMENT_SCHEMA: &str = "zerowall.science/environment/v1";
const VERSION_METADATA: &str = ".environment-manifest.json";
const MAX_ARCHIVE_FILES: usize = 10_000;
const MAX_EXTRACTED_BYTES: u64 = 512 * 1024 * 1024;
const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;
const HTTP_CANCEL_POLL_INTERVAL: Duration = Duration::from_millis(100);
const HEALTH_CHECK_POLL_INTERVAL: Duration = Duration::from_millis(50);
const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(60);
const ENVIRONMENT_RELEASE_LATEST_BASE: &str = "https://zerowall.chengxunkeji.cn/releases/latest";
static NONCE: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Error)]
pub enum EnvironmentUpdateError {
    #[error("environment update public key is not configured")]
    PublicKeyNotConfigured,
    #[error("environment update public key is invalid")]
    InvalidPublicKey,
    #[error("environment update signature is invalid")]
    InvalidSignature,
    #[error("invalid environment update manifest: {0}")]
    InvalidManifest(String),
    #[error("download failed: {0}")]
    Download(String),
    #[error("environment update cancelled")]
    Cancelled,
    #[error("checksum mismatch for {component}: expected {expected}, got {actual}")]
    ChecksumMismatch {
        component: String,
        expected: String,
        actual: String,
    },
    #[error("unsafe archive path: {0}")]
    UnsafeArchivePath(String),
    #[error("unsupported archive entry: {0}")]
    UnsupportedArchiveEntry(String),
    #[error("archive exceeds extraction limits")]
    ArchiveLimitExceeded,
    #[error("health check failed: {0}")]
    HealthCheck(String),
    #[error("no previous environment version is available")]
    NoPreviousVersion,
    #[error("environment version already exists but is incomplete: {0}")]
    IncompleteVersion(String),
    #[error("an environment update operation is already in progress")]
    OperationInProgress,
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SignedEnvironmentEnvelope {
    schema: String,
    payload: String,
    signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EnvironmentManifest {
    pub schema: String,
    pub version: String,
    pub components: Vec<EnvironmentComponent>,
    pub health_checks: Vec<EnvironmentHealthCheck>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EnvironmentComponent {
    pub id: String,
    pub url: String,
    pub sha256: String,
    pub archive: EnvironmentArchive,
    #[serde(default)]
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EnvironmentArchive {
    File,
    Zip,
    TarGz,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EnvironmentHealthCheck {
    pub executable: String,
    #[serde(default)]
    pub args: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentEnvironment {
    pub current_version: String,
    pub previous_version: Option<String>,
    pub installed_at: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EnvironmentUpdatePhase {
    Idle,
    Checking,
    Available,
    Downloading,
    Verifying,
    Installing,
    RestartRequired,
    Failed,
    RolledBack,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentUpdateStatus {
    pub phase: EnvironmentUpdatePhase,
    pub version: Option<String>,
    pub message: Option<String>,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub current_component: Option<String>,
}

impl Default for EnvironmentUpdateStatus {
    fn default() -> Self {
        Self {
            phase: EnvironmentUpdatePhase::Idle,
            version: None,
            message: None,
            downloaded_bytes: 0,
            total_bytes: None,
            current_component: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentUpdateSnapshot {
    pub phase: EnvironmentUpdatePhase,
    pub current_version: Option<String>,
    pub previous_version: Option<String>,
    pub target_version: Option<String>,
    pub message: Option<String>,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub current_component: Option<String>,
}

pub struct EnvironmentUpdateControl {
    operation: Mutex<EnvironmentOperationState>,
    status: Arc<Mutex<EnvironmentUpdateStatus>>,
}

#[derive(Default)]
struct EnvironmentOperationState {
    generation: u64,
    active: Option<ActiveEnvironmentOperation>,
}

struct ActiveEnvironmentOperation {
    generation: u64,
    cancel_requested: Arc<AtomicBool>,
}

impl Default for EnvironmentUpdateControl {
    fn default() -> Self {
        Self {
            operation: Mutex::new(EnvironmentOperationState::default()),
            status: Arc::new(Mutex::new(EnvironmentUpdateStatus::default())),
        }
    }
}

pub struct EnvironmentOperationGuard<'a> {
    operation: &'a Mutex<EnvironmentOperationState>,
    generation: u64,
    cancel_requested: Arc<AtomicBool>,
}

impl Drop for EnvironmentOperationGuard<'_> {
    fn drop(&mut self) {
        let mut state = self
            .operation
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if state
            .active
            .as_ref()
            .is_some_and(|active| active.generation == self.generation)
        {
            state.active = None;
        }
    }
}

impl EnvironmentOperationGuard<'_> {
    fn cancel_token(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.cancel_requested)
    }
}

impl EnvironmentUpdateControl {
    pub fn try_begin(&self) -> Result<EnvironmentOperationGuard<'_>, EnvironmentUpdateError> {
        let mut state = self
            .operation
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if state.active.is_some() {
            return Err(EnvironmentUpdateError::OperationInProgress);
        }
        state.generation = state.generation.wrapping_add(1).max(1);
        let generation = state.generation;
        let cancel_requested = Arc::new(AtomicBool::new(false));
        state.active = Some(ActiveEnvironmentOperation {
            generation,
            cancel_requested: Arc::clone(&cancel_requested),
        });
        Ok(EnvironmentOperationGuard {
            operation: &self.operation,
            generation,
            cancel_requested,
        })
    }

    pub fn request_cancel(&self) -> bool {
        let state = self
            .operation
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.active.as_ref().is_some_and(|active| {
            active.cancel_requested.store(true, Ordering::Release);
            true
        })
    }

    pub fn cancellation_requested(&self) -> bool {
        let state = self
            .operation
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state
            .active
            .as_ref()
            .is_some_and(|active| active.cancel_requested.load(Ordering::Acquire))
    }

    fn set_status(&self, status: EnvironmentUpdateStatus) {
        *self
            .status
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = status;
    }

    fn status(&self) -> EnvironmentUpdateStatus {
        self.status
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
}

pub fn verify_environment_envelope(
    envelope_json: &str,
) -> Result<EnvironmentManifest, EnvironmentUpdateError> {
    verify_envelope_with_key_text(envelope_json, option_env!("ZEROWALL_ENV_UPDATE_PUBLIC_KEY"))
}

fn verify_envelope_with_key_text(
    envelope_json: &str,
    key_text: Option<&str>,
) -> Result<EnvironmentManifest, EnvironmentUpdateError> {
    let key_text = key_text
        .filter(|value| !value.trim().is_empty())
        .ok_or(EnvironmentUpdateError::PublicKeyNotConfigured)?;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(key_text.trim())
        .map_err(|_| EnvironmentUpdateError::InvalidPublicKey)?;
    let key: [u8; 32] = decoded
        .try_into()
        .map_err(|_| EnvironmentUpdateError::InvalidPublicKey)?;
    verify_envelope_with_public_key(envelope_json, &key)
}

fn verify_envelope_with_public_key(
    envelope_json: &str,
    public_key: &[u8; 32],
) -> Result<EnvironmentManifest, EnvironmentUpdateError> {
    let envelope: SignedEnvironmentEnvelope = serde_json::from_str(envelope_json)?;
    if envelope.schema != ENVIRONMENT_ENVELOPE_SCHEMA {
        return Err(EnvironmentUpdateError::InvalidManifest(
            "unsupported envelope schema".into(),
        ));
    }
    let signature_bytes = base64::engine::general_purpose::STANDARD
        .decode(envelope.signature)
        .map_err(|_| EnvironmentUpdateError::InvalidSignature)?;
    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|_| EnvironmentUpdateError::InvalidSignature)?;
    let verifying_key = VerifyingKey::from_bytes(public_key)
        .map_err(|_| EnvironmentUpdateError::InvalidPublicKey)?;
    verifying_key
        .verify(envelope.payload.as_bytes(), &signature)
        .map_err(|_| EnvironmentUpdateError::InvalidSignature)?;
    let manifest: EnvironmentManifest = serde_json::from_str(&envelope.payload)?;
    validate_manifest(manifest)
}

fn validate_manifest(
    manifest: EnvironmentManifest,
) -> Result<EnvironmentManifest, EnvironmentUpdateError> {
    if manifest.schema != ENVIRONMENT_SCHEMA {
        return Err(EnvironmentUpdateError::InvalidManifest(
            "unsupported payload schema".into(),
        ));
    }
    validate_safe_segment("version", &manifest.version)?;
    let mut component_ids = HashSet::new();
    for component in &manifest.components {
        validate_safe_segment("component id", &component.id)?;
        if !component_ids.insert(component.id.as_str()) {
            return Err(EnvironmentUpdateError::InvalidManifest(format!(
                "duplicate component id {}",
                component.id
            )));
        }
        let url = reqwest::Url::parse(&component.url).map_err(|_| {
            EnvironmentUpdateError::InvalidManifest(format!(
                "component {} has an invalid URL",
                component.id
            ))
        })?;
        if url.scheme() != "https" || url.host_str().is_none() {
            return Err(EnvironmentUpdateError::InvalidManifest(format!(
                "component {} requires an HTTPS URL",
                component.id
            )));
        }
        if component.sha256.len() != 64
            || !component
                .sha256
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(EnvironmentUpdateError::InvalidManifest(format!(
                "component {} has an invalid SHA-256",
                component.id
            )));
        }
    }
    for check in &manifest.health_checks {
        validate_relative_path(Path::new(&check.executable))?;
    }
    Ok(manifest)
}

fn validate_safe_segment(label: &str, value: &str) -> Result<(), EnvironmentUpdateError> {
    if value.is_empty()
        || value == "."
        || value == ".."
        || value.len() > 128
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err(EnvironmentUpdateError::InvalidManifest(format!(
            "{label} is not a safe path segment"
        )));
    }
    Ok(())
}

fn validate_relative_path(path: &Path) -> Result<(), EnvironmentUpdateError> {
    let text = path.to_string_lossy();
    if text.is_empty()
        || path.is_absolute()
        || text.starts_with(['/', '\\'])
        || text.contains(':')
        || path.components().any(|component| {
            matches!(
                component,
                PathComponent::ParentDir | PathComponent::RootDir | PathComponent::Prefix(_)
            )
        })
    {
        return Err(EnvironmentUpdateError::UnsafeArchivePath(text.into_owned()));
    }
    Ok(())
}

#[derive(Debug, Clone)]
pub struct EnvironmentLayout {
    root: PathBuf,
}

impl EnvironmentLayout {
    pub fn new(app_data_root: impl AsRef<Path>) -> Self {
        Self {
            root: app_data_root.as_ref().join("environment"),
        }
    }

    fn versions(&self) -> PathBuf {
        self.root.join("versions")
    }

    fn staging(&self) -> PathBuf {
        self.root.join("staging")
    }

    fn current(&self) -> PathBuf {
        self.root.join("current.json")
    }

    fn prepare(&self) -> Result<(), EnvironmentUpdateError> {
        fs::create_dir_all(self.versions())?;
        fs::create_dir_all(self.staging())?;
        Ok(())
    }

    pub fn read_current(&self) -> Result<Option<CurrentEnvironment>, EnvironmentUpdateError> {
        let path = self.current();
        if !path.is_file() {
            return Ok(None);
        }
        Ok(Some(serde_json::from_slice(&fs::read(path)?)?))
    }

    pub fn active_root(&self) -> Result<Option<PathBuf>, EnvironmentUpdateError> {
        let Some(current) = self.read_current()? else {
            return Ok(None);
        };
        let version_dir = self.versions().join(current.current_version);
        if version_dir.is_dir() {
            Ok(Some(version_dir))
        } else {
            Ok(None)
        }
    }
}

pub trait PackageDownloader {
    fn download_to(
        &mut self,
        url: &str,
        target: &Path,
        expected_size: Option<u64>,
    ) -> Result<(), EnvironmentUpdateError>;
}

pub trait HealthRunner {
    fn run(
        &mut self,
        version_dir: &Path,
        executable: &Path,
        args: &[String],
        cancel_requested: Option<&AtomicBool>,
    ) -> Result<(), EnvironmentUpdateError>;
}

pub struct HttpPackageDownloader {
    client: reqwest::Client,
    status: Option<Arc<Mutex<EnvironmentUpdateStatus>>>,
    cancel_requested: Option<Arc<AtomicBool>>,
}

impl HttpPackageDownloader {
    pub fn new() -> Result<Self, EnvironmentUpdateError> {
        let client = reqwest::Client::builder()
            .user_agent("ZeroWall Science environment installer")
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(30 * 60))
            .build()
            .map_err(|error| EnvironmentUpdateError::Download(error.to_string()))?;
        Ok(Self {
            client,
            status: None,
            cancel_requested: None,
        })
    }

    fn with_control(
        status: Arc<Mutex<EnvironmentUpdateStatus>>,
        cancel_requested: Arc<AtomicBool>,
    ) -> Result<Self, EnvironmentUpdateError> {
        let mut downloader = Self::new()?;
        downloader.status = Some(status);
        downloader.cancel_requested = Some(cancel_requested);
        Ok(downloader)
    }

    fn is_cancelled(&self) -> bool {
        self.cancel_requested
            .as_ref()
            .is_some_and(|cancel| cancel.load(Ordering::Acquire))
    }

    fn report_progress(
        &self,
        phase: EnvironmentUpdatePhase,
        component: &str,
        downloaded_bytes: u64,
        total_bytes: Option<u64>,
    ) {
        let Some(status) = &self.status else {
            return;
        };
        let mut status = status
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        status.phase = phase;
        status.current_component = Some(component.to_owned());
        status.downloaded_bytes = downloaded_bytes;
        status.total_bytes = total_bytes;
    }

    async fn download_to_async(
        &self,
        url: &str,
        target: &Path,
        expected_size: Option<u64>,
    ) -> Result<(), EnvironmentUpdateError> {
        if self.is_cancelled() {
            return Err(EnvironmentUpdateError::Cancelled);
        }
        let existing_bytes = fs::metadata(target)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        let mut request = self.client.get(url);
        if existing_bytes > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={existing_bytes}-"));
        }
        let send = request.send();
        tokio::pin!(send);
        let response = loop {
            tokio::select! {
                result = &mut send => {
                    break result.map_err(|error| EnvironmentUpdateError::Download(error.to_string()))?;
                }
                _ = tokio::time::sleep(HTTP_CANCEL_POLL_INTERVAL) => {
                    if self.is_cancelled() {
                        return Err(EnvironmentUpdateError::Cancelled);
                    }
                }
            }
        };
        let content_range = response
            .headers()
            .get(reqwest::header::CONTENT_RANGE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let content_length = response.content_length();
        let (mut downloaded_bytes, append, range_total, response_end) = download_write_plan(
            existing_bytes,
            response.status(),
            content_range.as_deref(),
            content_length,
            expected_size,
        )?;
        let mut response = response
            .error_for_status()
            .map_err(|error| EnvironmentUpdateError::Download(error.to_string()))?;
        let total_bytes = expected_size.or(range_total).or_else(|| {
            response
                .content_length()
                .map(|remaining| downloaded_bytes.saturating_add(remaining))
        });
        let component = target
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("environment")
            .trim_end_matches(".package");
        self.report_progress(
            EnvironmentUpdatePhase::Downloading,
            component,
            downloaded_bytes,
            total_bytes,
        );

        let mut options = OpenOptions::new();
        options.create(true).write(true);
        if append {
            options.append(true);
        } else {
            options.truncate(true);
        }
        let mut output = options.open(target)?;
        loop {
            let next = response.chunk();
            tokio::pin!(next);
            let chunk = loop {
                tokio::select! {
                    result = &mut next => {
                        break result.map_err(|error| EnvironmentUpdateError::Download(error.to_string()))?;
                    }
                    _ = tokio::time::sleep(HTTP_CANCEL_POLL_INTERVAL) => {
                        if self.is_cancelled() {
                            output.sync_all()?;
                            return Err(EnvironmentUpdateError::Cancelled);
                        }
                    }
                }
            };
            let Some(chunk) = chunk else {
                break;
            };
            output.write_all(&chunk)?;
            downloaded_bytes = downloaded_bytes.saturating_add(chunk.len() as u64);
            self.report_progress(
                EnvironmentUpdatePhase::Downloading,
                component,
                downloaded_bytes,
                total_bytes,
            );
        }
        output.sync_all()?;
        if response_end
            .or(expected_size)
            .is_some_and(|expected| expected != downloaded_bytes)
        {
            return Err(EnvironmentUpdateError::Download(
                "server returned an incomplete response body".into(),
            ));
        }
        self.report_progress(
            EnvironmentUpdatePhase::Verifying,
            component,
            downloaded_bytes,
            total_bytes,
        );
        Ok(())
    }
}

fn download_write_plan(
    existing_bytes: u64,
    status: reqwest::StatusCode,
    content_range: Option<&str>,
    content_length: Option<u64>,
    expected_size: Option<u64>,
) -> Result<(u64, bool, Option<u64>, Option<u64>), EnvironmentUpdateError> {
    if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
        return Err(EnvironmentUpdateError::Download(
            "server rejected the resume range".into(),
        ));
    }
    if status == reqwest::StatusCode::PARTIAL_CONTENT {
        let parsed = content_range
            .and_then(|value| value.strip_prefix("bytes "))
            .and_then(|value| value.split_once('/'))
            .and_then(|(range, total)| {
                let (start, end) = range.split_once('-')?;
                Some((
                    start.parse::<u64>().ok()?,
                    end.parse::<u64>().ok()?,
                    total.parse::<u64>().ok()?,
                ))
            });
        let Some((start, end, total)) = parsed else {
            return Err(EnvironmentUpdateError::Download(
                "server returned an invalid resume range".into(),
            ));
        };
        let range_length = end
            .checked_sub(start)
            .and_then(|value| value.checked_add(1));
        if start != existing_bytes
            || end >= total
            || range_length.is_none()
            || content_length.is_some_and(|length| Some(length) != range_length)
            || expected_size.is_some_and(|expected| expected != total)
        {
            return Err(EnvironmentUpdateError::Download(
                "server returned an invalid resume range".into(),
            ));
        }
        return Ok((
            existing_bytes,
            existing_bytes > 0,
            Some(total),
            end.checked_add(1),
        ));
    }
    Ok((0, false, content_length, content_length))
}

impl PackageDownloader for HttpPackageDownloader {
    fn download_to(
        &mut self,
        url: &str,
        target: &Path,
        expected_size: Option<u64>,
    ) -> Result<(), EnvironmentUpdateError> {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()?;
        runtime.block_on(self.download_to_async(url, target, expected_size))
    }
}

pub struct ProcessHealthRunner;

impl HealthRunner for ProcessHealthRunner {
    fn run(
        &mut self,
        version_dir: &Path,
        executable: &Path,
        args: &[String],
        cancel_requested: Option<&AtomicBool>,
    ) -> Result<(), EnvironmentUpdateError> {
        let mut command = Command::new(executable);
        command
            .args(args)
            .current_dir(version_dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        let mut child = command
            .spawn()
            .map_err(|error| EnvironmentUpdateError::HealthCheck(error.to_string()))?;
        let started = Instant::now();
        loop {
            if cancellation_requested(cancel_requested) {
                child.kill().map_err(|error| {
                    EnvironmentUpdateError::HealthCheck(format!(
                        "could not stop {}: {error}",
                        executable.display()
                    ))
                })?;
                child.wait().map_err(|error| {
                    EnvironmentUpdateError::HealthCheck(format!(
                        "could not reap {}: {error}",
                        executable.display()
                    ))
                })?;
                return Err(EnvironmentUpdateError::Cancelled);
            }
            if started.elapsed() >= HEALTH_CHECK_TIMEOUT {
                let _ = child.kill();
                let _ = child.wait();
                return Err(EnvironmentUpdateError::HealthCheck(format!(
                    "{} timed out after {} seconds",
                    executable.display(),
                    HEALTH_CHECK_TIMEOUT.as_secs()
                )));
            }
            match child
                .try_wait()
                .map_err(|error| EnvironmentUpdateError::HealthCheck(error.to_string()))?
            {
                Some(status) if status.success() => return Ok(()),
                Some(status) => {
                    return Err(EnvironmentUpdateError::HealthCheck(format!(
                        "{} exited with {}",
                        executable.display(),
                        status
                    )))
                }
                None => thread::sleep(HEALTH_CHECK_POLL_INTERVAL),
            }
        }
    }
}

pub struct EnvironmentInstaller<D, H> {
    layout: EnvironmentLayout,
    downloader: D,
    health: H,
    status: EnvironmentUpdateStatus,
    control: Option<EnvironmentInstallControl>,
}

struct EnvironmentInstallControl {
    status: Arc<Mutex<EnvironmentUpdateStatus>>,
    cancel_requested: Arc<AtomicBool>,
}

impl<D: PackageDownloader, H: HealthRunner> EnvironmentInstaller<D, H> {
    pub fn new(layout: EnvironmentLayout, downloader: D, health: H) -> Self {
        Self {
            layout,
            downloader,
            health,
            status: EnvironmentUpdateStatus::default(),
            control: None,
        }
    }

    fn with_control(
        mut self,
        status: Arc<Mutex<EnvironmentUpdateStatus>>,
        cancel_requested: Arc<AtomicBool>,
    ) -> Self {
        self.control = Some(EnvironmentInstallControl {
            status,
            cancel_requested,
        });
        self
    }

    fn ensure_not_cancelled(&self) -> Result<(), EnvironmentUpdateError> {
        if cancellation_requested(
            self.control
                .as_ref()
                .map(|control| control.cancel_requested.as_ref()),
        ) {
            return Err(EnvironmentUpdateError::Cancelled);
        }
        Ok(())
    }

    fn report_phase(&mut self, phase: EnvironmentUpdatePhase, component: Option<&str>) {
        self.status.phase = phase;
        let Some(control) = &self.control else {
            return;
        };
        let mut status = control
            .status
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        status.phase = phase;
        if let Some(component) = component {
            status.current_component = Some(component.to_owned());
        }
    }

    pub fn status(&self) -> &EnvironmentUpdateStatus {
        &self.status
    }

    pub fn health_mut(&mut self) -> &mut H {
        &mut self.health
    }

    pub fn current(&self) -> Result<Option<CurrentEnvironment>, EnvironmentUpdateError> {
        self.layout.read_current()
    }

    pub fn install(
        &mut self,
        manifest: &EnvironmentManifest,
    ) -> Result<CurrentEnvironment, EnvironmentUpdateError> {
        let manifest = validate_manifest(manifest.clone())?;
        self.layout.prepare()?;
        let staging = self.layout.staging().join(&manifest.version);
        fs::create_dir_all(&staging)?;
        self.status = EnvironmentUpdateStatus {
            phase: EnvironmentUpdatePhase::Downloading,
            version: Some(manifest.version.clone()),
            message: None,
            ..EnvironmentUpdateStatus::default()
        };
        let result = self.install_inner(&manifest, &staging);
        match result {
            Ok(state) => {
                let _ = fs::remove_dir_all(&staging);
                self.status = EnvironmentUpdateStatus {
                    phase: EnvironmentUpdatePhase::RestartRequired,
                    version: Some(state.current_version.clone()),
                    message: None,
                    ..EnvironmentUpdateStatus::default()
                };
                Ok(state)
            }
            Err(error) => {
                if !matches!(
                    error,
                    EnvironmentUpdateError::Download(_) | EnvironmentUpdateError::Cancelled
                ) {
                    let _ = fs::remove_dir_all(&staging);
                }
                self.status = EnvironmentUpdateStatus {
                    phase: EnvironmentUpdatePhase::Failed,
                    version: Some(manifest.version),
                    message: Some(error.to_string()),
                    ..EnvironmentUpdateStatus::default()
                };
                Err(error)
            }
        }
    }

    pub fn install_signed(
        &mut self,
        envelope_json: &str,
    ) -> Result<CurrentEnvironment, EnvironmentUpdateError> {
        let manifest = verify_environment_envelope(envelope_json)?;
        self.install(&manifest)
    }

    fn install_inner(
        &mut self,
        manifest: &EnvironmentManifest,
        staging: &Path,
    ) -> Result<CurrentEnvironment, EnvironmentUpdateError> {
        self.ensure_not_cancelled()?;
        let version_dir = self.layout.versions().join(&manifest.version);
        if version_dir.exists() {
            let persisted = read_version_manifest(&version_dir)?;
            self.report_phase(EnvironmentUpdatePhase::Installing, None);
            self.run_health_checks(&version_dir, &persisted.health_checks)?;
            self.ensure_not_cancelled()?;
            return self.switch_current(&manifest.version);
        }

        let payload = staging.join("payload");
        let downloads = staging.join("downloads");
        let cancel_requested = self
            .control
            .as_ref()
            .map(|control| Arc::clone(&control.cancel_requested));
        if payload.exists() {
            fs::remove_dir_all(&payload)?;
        }
        fs::create_dir(&payload)?;
        fs::create_dir_all(&downloads)?;
        for component in &manifest.components {
            self.ensure_not_cancelled()?;
            let package = downloads.join(format!("{}.package", component.id));
            if !package_matches_component(&package, component, cancel_requested.as_deref())? {
                if component.size_bytes.is_some_and(|expected| {
                    fs::metadata(&package)
                        .map(|metadata| metadata.len() >= expected)
                        .unwrap_or(false)
                }) {
                    fs::remove_file(&package)?;
                }
                self.downloader
                    .download_to(&component.url, &package, component.size_bytes)?;
            }
            self.ensure_not_cancelled()?;
            if let Some(expected_size) = component.size_bytes {
                let actual_size = fs::metadata(&package)?.len();
                if actual_size != expected_size {
                    return Err(EnvironmentUpdateError::Download(format!(
                        "component {} size mismatch",
                        component.id
                    )));
                }
            }
            self.report_phase(EnvironmentUpdatePhase::Verifying, Some(&component.id));
            let actual = hash_file_cancellable(&package, cancel_requested.as_deref())?;
            self.ensure_not_cancelled()?;
            if !actual.eq_ignore_ascii_case(&component.sha256) {
                return Err(EnvironmentUpdateError::ChecksumMismatch {
                    component: component.id.clone(),
                    expected: component.sha256.clone(),
                    actual,
                });
            }
            self.report_phase(EnvironmentUpdatePhase::Installing, Some(&component.id));
            self.ensure_not_cancelled()?;
            extract_component(component, &package, &payload, cancel_requested.as_deref())?;
            self.ensure_not_cancelled()?;
        }
        self.ensure_not_cancelled()?;
        fs::write(
            payload.join(VERSION_METADATA),
            serde_json::to_vec_pretty(manifest)?,
        )?;
        self.report_phase(EnvironmentUpdatePhase::Installing, None);
        self.run_health_checks(&payload, &manifest.health_checks)?;
        self.ensure_not_cancelled()?;
        fs::rename(&payload, &version_dir)?;
        self.ensure_not_cancelled()?;
        self.switch_current(&manifest.version)
    }

    pub fn rollback(&mut self) -> Result<CurrentEnvironment, EnvironmentUpdateError> {
        self.layout.prepare()?;
        let current = self
            .current()?
            .ok_or(EnvironmentUpdateError::NoPreviousVersion)?;
        let target = current
            .previous_version
            .clone()
            .ok_or(EnvironmentUpdateError::NoPreviousVersion)?;
        let version_dir = self.layout.versions().join(&target);
        let manifest = read_version_manifest(&version_dir)?;
        self.run_health_checks(&version_dir, &manifest.health_checks)?;
        let state = CurrentEnvironment {
            current_version: target.clone(),
            previous_version: Some(current.current_version),
            installed_at: now_epoch_millis(),
        };
        write_current_atomic(&self.layout.current(), &state)?;
        self.status = EnvironmentUpdateStatus {
            phase: EnvironmentUpdatePhase::RolledBack,
            version: Some(target),
            message: None,
            ..EnvironmentUpdateStatus::default()
        };
        Ok(state)
    }

    fn run_health_checks(
        &mut self,
        version_dir: &Path,
        checks: &[EnvironmentHealthCheck],
    ) -> Result<(), EnvironmentUpdateError> {
        let cancel_requested = self
            .control
            .as_ref()
            .map(|control| Arc::clone(&control.cancel_requested));
        for check in checks {
            self.ensure_not_cancelled()?;
            let relative = Path::new(&check.executable);
            validate_relative_path(relative)?;
            let executable = version_dir.join(relative);
            if !executable.is_file() {
                return Err(EnvironmentUpdateError::HealthCheck(format!(
                    "{} is not a file",
                    check.executable
                )));
            }
            self.health.run(
                version_dir,
                &executable,
                &check.args,
                cancel_requested.as_deref(),
            )?;
            self.ensure_not_cancelled()?;
        }
        Ok(())
    }

    fn switch_current(&self, version: &str) -> Result<CurrentEnvironment, EnvironmentUpdateError> {
        self.ensure_not_cancelled()?;
        let previous = self.current()?;
        let previous_version = previous
            .as_ref()
            .filter(|current| current.current_version != version)
            .map(|current| current.current_version.clone())
            .or_else(|| previous.and_then(|current| current.previous_version));
        let state = CurrentEnvironment {
            current_version: version.to_owned(),
            previous_version,
            installed_at: now_epoch_millis(),
        };
        write_current_atomic(&self.layout.current(), &state)?;
        Ok(state)
    }
}

fn update_snapshot(
    layout: &EnvironmentLayout,
    status: EnvironmentUpdateStatus,
) -> Result<EnvironmentUpdateSnapshot, EnvironmentUpdateError> {
    let current = layout.read_current()?;
    Ok(EnvironmentUpdateSnapshot {
        phase: status.phase,
        current_version: current.as_ref().map(|value| value.current_version.clone()),
        previous_version: current.and_then(|value| value.previous_version),
        target_version: status.version,
        message: status.message,
        downloaded_bytes: status.downloaded_bytes,
        total_bytes: status.total_bytes,
        current_component: status.current_component,
    })
}

fn app_environment_layout(app: &tauri::AppHandle) -> Result<EnvironmentLayout, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data directory: {error}"))?;
    Ok(EnvironmentLayout::new(root))
}

pub fn active_environment_root(app: &tauri::AppHandle) -> Result<Option<PathBuf>, String> {
    app_environment_layout(app)
        .and_then(|layout| layout.active_root().map_err(|error| error.to_string()))
}

pub fn environment_executable_candidates(root: &Path, executable: &str) -> [PathBuf; 2] {
    [
        root.join(executable),
        root.join("binaries").join(executable),
    ]
}

pub fn active_environment_executable(
    app: &tauri::AppHandle,
    executable: &str,
) -> Result<Option<PathBuf>, String> {
    let Some(root) = active_environment_root(app)? else {
        return Ok(None);
    };
    Ok(environment_executable_candidates(&root, executable)
        .into_iter()
        .find(|path| path.is_file()))
}

pub fn environment_target_triple() -> Result<&'static str, String> {
    match (std::env::consts::ARCH, std::env::consts::OS) {
        ("x86_64", "windows") => Ok("x86_64-pc-windows-msvc"),
        ("aarch64", "macos") => Ok("aarch64-apple-darwin"),
        ("x86_64", "macos") => Ok("x86_64-apple-darwin"),
        ("x86_64", "linux") => Ok("x86_64-unknown-linux-gnu"),
        (architecture, operating_system) => Err(format!(
            "environment updates are not published for {architecture}-{operating_system}"
        )),
    }
}

fn environment_manifest_asset_name(target: &str) -> String {
    format!("ZeroWall-Environment-{target}.tar.gz.json")
}

fn fetch_environment_manifest() -> Result<String, EnvironmentUpdateError> {
    let asset = environment_manifest_asset_name(
        environment_target_triple().map_err(EnvironmentUpdateError::InvalidManifest)?,
    );
    let url = format!("{ENVIRONMENT_RELEASE_LATEST_BASE}/{asset}");
    let client = reqwest::blocking::Client::builder()
        .user_agent("ZeroWall Science environment updater")
        .build()
        .map_err(|error| EnvironmentUpdateError::Download(error.to_string()))?;
    let response = client
        .get(url)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| EnvironmentUpdateError::Download(error.to_string()))?;
    if response
        .content_length()
        .is_some_and(|length| length > MAX_MANIFEST_BYTES)
    {
        return Err(EnvironmentUpdateError::Download(
            "environment manifest exceeds the size limit".into(),
        ));
    }
    let mut limited = response.take(MAX_MANIFEST_BYTES + 1);
    let mut envelope = String::new();
    limited
        .read_to_string(&mut envelope)
        .map_err(|error| EnvironmentUpdateError::Download(error.to_string()))?;
    if envelope.len() as u64 > MAX_MANIFEST_BYTES {
        return Err(EnvironmentUpdateError::Download(
            "environment manifest exceeds the size limit".into(),
        ));
    }
    Ok(envelope)
}

#[tauri::command]
pub async fn environment_update_manifest() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(fetch_environment_manifest)
        .await
        .map_err(|error| format!("environment manifest download task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn environment_update_status(
    app: tauri::AppHandle,
    control: tauri::State<'_, EnvironmentUpdateControl>,
) -> Result<EnvironmentUpdateSnapshot, String> {
    update_snapshot(&app_environment_layout(&app)?, control.status())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn environment_update_check(
    app: tauri::AppHandle,
    control: tauri::State<'_, EnvironmentUpdateControl>,
    envelope_json: String,
) -> Result<EnvironmentUpdateSnapshot, String> {
    let _operation = control.try_begin().map_err(|error| error.to_string())?;
    control.set_status(EnvironmentUpdateStatus {
        phase: EnvironmentUpdatePhase::Checking,
        version: None,
        message: None,
        ..EnvironmentUpdateStatus::default()
    });
    let verified =
        tauri::async_runtime::spawn_blocking(move || verify_environment_envelope(&envelope_json))
            .await
            .map_err(|error| format!("environment manifest verification task failed: {error}"))?;
    match verified {
        Ok(manifest) => {
            control.set_status(EnvironmentUpdateStatus {
                phase: EnvironmentUpdatePhase::Available,
                version: Some(manifest.version),
                message: None,
                ..EnvironmentUpdateStatus::default()
            });
        }
        Err(error) => {
            control.set_status(EnvironmentUpdateStatus {
                phase: EnvironmentUpdatePhase::Failed,
                version: None,
                message: Some(error.to_string()),
                ..EnvironmentUpdateStatus::default()
            });
            return Err(error.to_string());
        }
    }
    update_snapshot(&app_environment_layout(&app)?, control.status())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn environment_update_install(
    app: tauri::AppHandle,
    control: tauri::State<'_, EnvironmentUpdateControl>,
    envelope_json: String,
) -> Result<EnvironmentUpdateSnapshot, String> {
    let operation = control.try_begin().map_err(|error| error.to_string())?;
    let layout = app_environment_layout(&app)?;
    control.set_status(EnvironmentUpdateStatus {
        phase: EnvironmentUpdatePhase::Downloading,
        version: None,
        message: None,
        ..EnvironmentUpdateStatus::default()
    });
    let task_layout = layout.clone();
    let shared_status = Arc::clone(&control.status);
    let cancel_requested = operation.cancel_token();
    let installed = tauri::async_runtime::spawn_blocking(move || {
        let manifest = verify_environment_envelope(&envelope_json)?;
        {
            let mut status = shared_status
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            status.version = Some(manifest.version.clone());
        }
        let downloader = HttpPackageDownloader::with_control(
            Arc::clone(&shared_status),
            Arc::clone(&cancel_requested),
        )?;
        let mut installer = EnvironmentInstaller::new(task_layout, downloader, ProcessHealthRunner)
            .with_control(shared_status, cancel_requested);
        installer.install(&manifest)
    })
    .await
    .map_err(|error| format!("environment install task failed: {error}"))?;
    match installed {
        Ok(current) => control.set_status(EnvironmentUpdateStatus {
            phase: EnvironmentUpdatePhase::RestartRequired,
            version: Some(current.current_version),
            message: None,
            ..EnvironmentUpdateStatus::default()
        }),
        Err(EnvironmentUpdateError::Cancelled) => {
            let mut status = control.status();
            status.phase = EnvironmentUpdatePhase::Available;
            status.message = Some("Environment update cancelled.".into());
            control.set_status(status);
        }
        Err(error) => {
            control.set_status(EnvironmentUpdateStatus {
                phase: EnvironmentUpdatePhase::Failed,
                version: None,
                message: Some(error.to_string()),
                ..EnvironmentUpdateStatus::default()
            });
            return Err(error.to_string());
        }
    }
    update_snapshot(&layout, control.status()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn environment_update_cancel(
    app: tauri::AppHandle,
    control: tauri::State<'_, EnvironmentUpdateControl>,
) -> Result<EnvironmentUpdateSnapshot, String> {
    if !control.request_cancel() {
        return Err("no environment update operation is running".into());
    }
    let mut status = control.status();
    status.message = Some("Cancelling environment update...".into());
    control.set_status(status);
    update_snapshot(&app_environment_layout(&app)?, control.status())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn environment_update_rollback(
    app: tauri::AppHandle,
    control: tauri::State<'_, EnvironmentUpdateControl>,
) -> Result<EnvironmentUpdateSnapshot, String> {
    let _operation = control.try_begin().map_err(|error| error.to_string())?;
    let layout = app_environment_layout(&app)?;
    control.set_status(EnvironmentUpdateStatus {
        phase: EnvironmentUpdatePhase::Installing,
        version: None,
        message: None,
        ..EnvironmentUpdateStatus::default()
    });
    let task_layout = layout.clone();
    let rolled_back = tauri::async_runtime::spawn_blocking(move || {
        let downloader = HttpPackageDownloader::new()?;
        let mut installer = EnvironmentInstaller::new(task_layout, downloader, ProcessHealthRunner);
        installer.rollback()
    })
    .await
    .map_err(|error| format!("environment rollback task failed: {error}"))?;
    match rolled_back {
        Ok(current) => control.set_status(EnvironmentUpdateStatus {
            phase: EnvironmentUpdatePhase::RolledBack,
            version: Some(current.current_version),
            message: None,
            ..EnvironmentUpdateStatus::default()
        }),
        Err(error) => {
            control.set_status(EnvironmentUpdateStatus {
                phase: EnvironmentUpdatePhase::Failed,
                version: None,
                message: Some(error.to_string()),
                ..EnvironmentUpdateStatus::default()
            });
            return Err(error.to_string());
        }
    }
    update_snapshot(&layout, control.status()).map_err(|error| error.to_string())
}

fn read_version_manifest(
    version_dir: &Path,
) -> Result<EnvironmentManifest, EnvironmentUpdateError> {
    let path = version_dir.join(VERSION_METADATA);
    if !path.is_file() {
        return Err(EnvironmentUpdateError::IncompleteVersion(
            version_dir.display().to_string(),
        ));
    }
    let manifest: EnvironmentManifest = serde_json::from_slice(&fs::read(path)?)?;
    validate_manifest(manifest)
}

fn cancellation_requested(cancel_requested: Option<&AtomicBool>) -> bool {
    cancel_requested.is_some_and(|cancel| cancel.load(Ordering::Acquire))
}

fn ensure_operation_active(
    cancel_requested: Option<&AtomicBool>,
) -> Result<(), EnvironmentUpdateError> {
    if cancellation_requested(cancel_requested) {
        Err(EnvironmentUpdateError::Cancelled)
    } else {
        Ok(())
    }
}

fn hash_file_cancellable(
    path: &Path,
    cancel_requested: Option<&AtomicBool>,
) -> Result<String, EnvironmentUpdateError> {
    let mut reader = BufReader::new(File::open(path)?);
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        ensure_operation_active(cancel_requested)?;
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(digest
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn package_matches_component(
    package: &Path,
    component: &EnvironmentComponent,
    cancel_requested: Option<&AtomicBool>,
) -> Result<bool, EnvironmentUpdateError> {
    if !package.is_file() {
        return Ok(false);
    }
    if component.size_bytes.is_some_and(|expected| {
        fs::metadata(package).map(|value| value.len()).ok() != Some(expected)
    }) {
        return Ok(false);
    }
    Ok(hash_file_cancellable(package, cancel_requested)?.eq_ignore_ascii_case(&component.sha256))
}

fn extract_component(
    component: &EnvironmentComponent,
    package: &Path,
    payload: &Path,
    cancel_requested: Option<&AtomicBool>,
) -> Result<(), EnvironmentUpdateError> {
    match component.archive {
        EnvironmentArchive::File => {
            let target = payload.join(&component.id);
            copy_new(package, &target, cancel_requested)?;
        }
        EnvironmentArchive::Zip => extract_zip(package, payload, cancel_requested)?,
        EnvironmentArchive::TarGz => extract_tar_gz(package, payload, cancel_requested)?,
    }
    Ok(())
}

fn copy_new(
    source: &Path,
    target: &Path,
    cancel_requested: Option<&AtomicBool>,
) -> Result<(), EnvironmentUpdateError> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut input = File::open(source)?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)?;
    copy_stream(&mut input, &mut output, cancel_requested)?;
    output.sync_all()?;
    Ok(())
}

fn copy_stream<R: Read, W: Write>(
    input: &mut R,
    output: &mut W,
    cancel_requested: Option<&AtomicBool>,
) -> Result<u64, EnvironmentUpdateError> {
    let mut copied = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        ensure_operation_active(cancel_requested)?;
        let count = input.read(&mut buffer)?;
        if count == 0 {
            return Ok(copied);
        }
        output.write_all(&buffer[..count])?;
        copied = copied.saturating_add(count as u64);
    }
}

fn extract_zip(
    package: &Path,
    payload: &Path,
    cancel_requested: Option<&AtomicBool>,
) -> Result<(), EnvironmentUpdateError> {
    let mut archive = zip::ZipArchive::new(File::open(package)?)
        .map_err(|error| EnvironmentUpdateError::Download(error.to_string()))?;
    let mut total = 0_u64;
    if archive.len() > MAX_ARCHIVE_FILES {
        return Err(EnvironmentUpdateError::ArchiveLimitExceeded);
    }
    for index in 0..archive.len() {
        ensure_operation_active(cancel_requested)?;
        let mut entry = archive
            .by_index(index)
            .map_err(|error| EnvironmentUpdateError::Download(error.to_string()))?;
        let raw_name = entry.name().to_owned();
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| EnvironmentUpdateError::UnsafeArchivePath(raw_name.clone()))?;
        validate_relative_path(&relative)?;
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(EnvironmentUpdateError::UnsupportedArchiveEntry(raw_name));
        }
        total = total
            .checked_add(entry.size())
            .ok_or(EnvironmentUpdateError::ArchiveLimitExceeded)?;
        if total > MAX_EXTRACTED_BYTES {
            return Err(EnvironmentUpdateError::ArchiveLimitExceeded);
        }
        let target = payload.join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(target)?;
        } else if entry.is_file() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut output = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(target)?;
            copy_stream(&mut entry, &mut output, cancel_requested)?;
        } else {
            return Err(EnvironmentUpdateError::UnsupportedArchiveEntry(raw_name));
        }
    }
    Ok(())
}

fn extract_tar_gz(
    package: &Path,
    payload: &Path,
    cancel_requested: Option<&AtomicBool>,
) -> Result<(), EnvironmentUpdateError> {
    let decoder = GzDecoder::new(File::open(package)?);
    let mut archive = tar::Archive::new(decoder);
    let mut count = 0_usize;
    let mut total = 0_u64;
    for item in archive.entries()? {
        ensure_operation_active(cancel_requested)?;
        count += 1;
        if count > MAX_ARCHIVE_FILES {
            return Err(EnvironmentUpdateError::ArchiveLimitExceeded);
        }
        let mut entry = item?;
        let relative = entry.path()?.into_owned();
        validate_relative_path(&relative)?;
        let entry_type = entry.header().entry_type();
        if entry_type.is_symlink() || entry_type.is_hard_link() {
            return Err(EnvironmentUpdateError::UnsupportedArchiveEntry(
                relative.display().to_string(),
            ));
        }
        let size = entry.header().size()?;
        total = total
            .checked_add(size)
            .ok_or(EnvironmentUpdateError::ArchiveLimitExceeded)?;
        if total > MAX_EXTRACTED_BYTES {
            return Err(EnvironmentUpdateError::ArchiveLimitExceeded);
        }
        let target = payload.join(&relative);
        if entry_type.is_dir() {
            fs::create_dir_all(target)?;
        } else if entry_type.is_file() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut output = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(target)?;
            copy_stream(&mut entry, &mut output, cancel_requested)?;
        } else {
            return Err(EnvironmentUpdateError::UnsupportedArchiveEntry(
                relative.display().to_string(),
            ));
        }
    }
    Ok(())
}

fn write_current_atomic(
    path: &Path,
    state: &CurrentEnvironment,
) -> Result<(), EnvironmentUpdateError> {
    let parent = path.parent().ok_or_else(|| {
        EnvironmentUpdateError::InvalidManifest("current path has no parent".into())
    })?;
    fs::create_dir_all(parent)?;
    let staging = parent.join(format!("current-{}.json.tmp", unique_nonce()));
    {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&staging)?;
        file.write_all(&serde_json::to_vec_pretty(state)?)?;
        file.sync_all()?;
    }
    if let Err(error) = replace_file_atomic(&staging, path) {
        let _ = fs::remove_file(&staging);
        return Err(error.into());
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_file_atomic(source: &Path, target: &Path) -> std::io::Result<()> {
    fs::rename(source, target)
}

#[cfg(windows)]
fn replace_file_atomic(source: &Path, target: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let target = target
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let result = unsafe {
        MoveFileExW(
            source.as_ptr(),
            target.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

fn unique_nonce() -> String {
    format!(
        "{}-{}",
        now_epoch_millis(),
        NONCE.fetch_add(1, Ordering::Relaxed)
    )
}

fn now_epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use ed25519_dalek::{Signer, SigningKey};
    use sha2::{Digest, Sha256};
    use std::collections::{HashMap, HashSet};
    use std::fs;
    use std::io::Write;
    use std::net::TcpListener;
    use std::path::{Path, PathBuf};
    use std::thread;
    use std::time::{Duration, Instant};

    fn temp_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "zerowall-env-update-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn sha256(bytes: &[u8]) -> String {
        Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    }

    fn payload(version: &str, components: serde_json::Value, checks: serde_json::Value) -> String {
        serde_json::json!({
            "schema": ENVIRONMENT_SCHEMA,
            "version": version,
            "components": components,
            "healthChecks": checks,
        })
        .to_string()
    }

    fn signed_envelope(payload: &str, key: &SigningKey) -> String {
        let signature = key.sign(payload.as_bytes());
        serde_json::json!({
            "schema": ENVIRONMENT_ENVELOPE_SCHEMA,
            "payload": payload,
            "signature": base64::engine::general_purpose::STANDARD.encode(signature.to_bytes()),
        })
        .to_string()
    }

    fn verified_manifest(version: &str, bytes: &[u8]) -> EnvironmentManifest {
        let signing = SigningKey::from_bytes(&[7; 32]);
        let body = payload(
            version,
            serde_json::json!([{
                "id": "tool.exe",
                "url": "https://updates.example.test/tool.exe",
                "sha256": sha256(bytes),
                "archive": "file",
                "sizeBytes": bytes.len(),
            }]),
            serde_json::json!([{"executable":"tool.exe","args":["--version"]}]),
        );
        let envelope = signed_envelope(&body, &signing);
        verify_envelope_with_public_key(&envelope, &signing.verifying_key().to_bytes()).unwrap()
    }

    fn verified_multi_manifest(version: &str, first: &[u8], second: &[u8]) -> EnvironmentManifest {
        let signing = SigningKey::from_bytes(&[8; 32]);
        let body = payload(
            version,
            serde_json::json!([
                {
                    "id": "first.exe",
                    "url": "https://updates.example.test/first.exe",
                    "sha256": sha256(first),
                    "archive": "file",
                    "sizeBytes": first.len(),
                },
                {
                    "id": "second.exe",
                    "url": "https://updates.example.test/second.exe",
                    "sha256": sha256(second),
                    "archive": "file",
                    "sizeBytes": second.len(),
                }
            ]),
            serde_json::json!([]),
        );
        let envelope = signed_envelope(&body, &signing);
        verify_envelope_with_public_key(&envelope, &signing.verifying_key().to_bytes()).unwrap()
    }

    #[derive(Default)]
    struct FakeDownloader {
        content: HashMap<String, Vec<u8>>,
    }

    impl PackageDownloader for FakeDownloader {
        fn download_to(
            &mut self,
            url: &str,
            target: &Path,
            _expected_size: Option<u64>,
        ) -> Result<(), EnvironmentUpdateError> {
            let bytes = self
                .content
                .get(url)
                .ok_or_else(|| EnvironmentUpdateError::Download("missing fake response".into()))?;
            let mut file = fs::File::create(target)?;
            for chunk in bytes.chunks(3) {
                file.write_all(chunk)?;
            }
            Ok(())
        }
    }

    struct InterruptOnceDownloader {
        bytes: Vec<u8>,
        interrupted: bool,
    }

    impl PackageDownloader for InterruptOnceDownloader {
        fn download_to(
            &mut self,
            _url: &str,
            target: &Path,
            _expected_size: Option<u64>,
        ) -> Result<(), EnvironmentUpdateError> {
            if !self.interrupted {
                self.interrupted = true;
                let mut file = File::create(target)?;
                file.write_all(&self.bytes[..3])?;
                file.sync_all()?;
                return Err(EnvironmentUpdateError::Download("interrupted".into()));
            }

            let offset = fs::metadata(target)?.len() as usize;
            let mut file = OpenOptions::new().append(true).open(target)?;
            file.write_all(&self.bytes[offset..])?;
            file.sync_all()?;
            Ok(())
        }
    }

    struct InterruptSecondDownloader {
        content: HashMap<String, Vec<u8>>,
        calls: HashMap<String, usize>,
        interrupted: bool,
    }

    struct CancelAfterDownload {
        bytes: Vec<u8>,
        cancel_requested: Arc<AtomicBool>,
    }

    struct CancelAfterFirstRead {
        bytes: std::io::Cursor<Vec<u8>>,
        cancel_requested: Arc<AtomicBool>,
        reads: usize,
    }

    impl Read for CancelAfterFirstRead {
        fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
            let count = self.bytes.read(buffer)?;
            self.reads += 1;
            if self.reads == 1 {
                self.cancel_requested.store(true, Ordering::Release);
            }
            Ok(count)
        }
    }

    impl PackageDownloader for CancelAfterDownload {
        fn download_to(
            &mut self,
            _url: &str,
            target: &Path,
            _expected_size: Option<u64>,
        ) -> Result<(), EnvironmentUpdateError> {
            fs::write(target, &self.bytes)?;
            self.cancel_requested.store(true, Ordering::Release);
            Ok(())
        }
    }

    impl PackageDownloader for InterruptSecondDownloader {
        fn download_to(
            &mut self,
            url: &str,
            target: &Path,
            _expected_size: Option<u64>,
        ) -> Result<(), EnvironmentUpdateError> {
            *self.calls.entry(url.to_owned()).or_default() += 1;
            let bytes = self.content.get(url).unwrap();
            if url.ends_with("second.exe") && !self.interrupted {
                self.interrupted = true;
                fs::write(target, &bytes[..3])?;
                return Err(EnvironmentUpdateError::Download("interrupted".into()));
            }
            fs::write(target, bytes)?;
            Ok(())
        }
    }

    #[derive(Default)]
    struct FakeHealth {
        fail_versions: HashSet<String>,
        fail_all: bool,
        calls: Vec<PathBuf>,
    }

    impl HealthRunner for FakeHealth {
        fn run(
            &mut self,
            version_dir: &Path,
            executable: &Path,
            _args: &[String],
            _cancel_requested: Option<&AtomicBool>,
        ) -> Result<(), EnvironmentUpdateError> {
            self.calls.push(executable.to_path_buf());
            if self.fail_all
                || self
                    .fail_versions
                    .iter()
                    .any(|version| version_dir.ends_with(version))
            {
                return Err(EnvironmentUpdateError::HealthCheck("probe failed".into()));
            }
            Ok(())
        }
    }

    struct SharedStatusHealth {
        status: Arc<Mutex<EnvironmentUpdateStatus>>,
        observed: Arc<Mutex<Vec<EnvironmentUpdatePhase>>>,
    }

    impl HealthRunner for SharedStatusHealth {
        fn run(
            &mut self,
            _version_dir: &Path,
            _executable: &Path,
            _args: &[String],
            _cancel_requested: Option<&AtomicBool>,
        ) -> Result<(), EnvironmentUpdateError> {
            let phase = self
                .status
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .phase;
            self.observed
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(phase);
            Ok(())
        }
    }

    fn installer(
        root: &Path,
        bytes: &[u8],
        health: FakeHealth,
    ) -> EnvironmentInstaller<FakeDownloader, FakeHealth> {
        let mut downloader = FakeDownloader::default();
        downloader.content.insert(
            "https://updates.example.test/tool.exe".into(),
            bytes.to_vec(),
        );
        EnvironmentInstaller::new(EnvironmentLayout::new(root), downloader, health)
    }

    #[test]
    fn verifies_signature_over_the_exact_payload_string() {
        let signing = SigningKey::from_bytes(&[3; 32]);
        let raw_payload = "{\"schema\":\"zerowall.science/environment/v1\",\"version\":\"v1\",\"components\":[],\"healthChecks\":[]}";
        let envelope = signed_envelope(raw_payload, &signing);
        let manifest =
            verify_envelope_with_public_key(&envelope, &signing.verifying_key().to_bytes())
                .unwrap();
        assert_eq!(manifest.version, "v1");

        let tampered = envelope.replace("\\\"version\\\":\\\"v1\\\"", "\\\"version\\\":\\\"v2\\\"");
        assert!(matches!(
            verify_envelope_with_public_key(&tampered, &signing.verifying_key().to_bytes()),
            Err(EnvironmentUpdateError::InvalidSignature)
        ));
    }

    #[test]
    fn rejects_a_missing_or_invalid_configured_public_key() {
        let signing = SigningKey::from_bytes(&[4; 32]);
        let envelope = signed_envelope(
            &payload("v1", serde_json::json!([]), serde_json::json!([])),
            &signing,
        );
        assert!(matches!(
            verify_envelope_with_key_text(&envelope, None),
            Err(EnvironmentUpdateError::PublicKeyNotConfigured)
        ));
        assert!(matches!(
            verify_envelope_with_key_text(&envelope, Some("invalid")),
            Err(EnvironmentUpdateError::InvalidPublicKey)
        ));
    }

    #[test]
    fn rejects_unsafe_manifest_fields() {
        let hash = "a".repeat(64);
        for (version, components, checks) in [
            ("../v1", serde_json::json!([]), serde_json::json!([])),
            (
                "v1",
                serde_json::json!([{"id":"../tool","url":"https://x.test/a","sha256":hash,"archive":"file"}]),
                serde_json::json!([]),
            ),
            (
                "v1",
                serde_json::json!([{"id":"tool","url":"http://x.test/a","sha256":hash,"archive":"file"}]),
                serde_json::json!([]),
            ),
            (
                "v1",
                serde_json::json!([{"id":"tool","url":"https://x.test/a","sha256":"bad","archive":"file"}]),
                serde_json::json!([]),
            ),
            (
                "v1",
                serde_json::json!([{"id":"tool","url":"https://x.test/a","sha256":hash,"archive":"file"},{"id":"tool","url":"https://x.test/b","sha256":hash,"archive":"file"}]),
                serde_json::json!([]),
            ),
            (
                "v1",
                serde_json::json!([]),
                serde_json::json!([{"executable":"../tool","args":[]}]),
            ),
        ] {
            let raw = payload(version, components, checks);
            assert!(
                serde_json::from_str::<EnvironmentManifest>(&raw)
                    .map_err(EnvironmentUpdateError::from)
                    .and_then(validate_manifest)
                    .is_err(),
                "unsafe payload unexpectedly accepted: {raw}"
            );
        }
    }

    #[test]
    fn installs_verified_components_and_atomically_switches_current() {
        let root = temp_root("install");
        let bytes = b"tool-v1";
        let mut installer = installer(&root, bytes, FakeHealth::default());
        let state = installer.install(&verified_manifest("v1", bytes)).unwrap();
        assert_eq!(state.current_version, "v1");
        assert_eq!(state.previous_version, None);
        assert_eq!(
            fs::read(root.join("environment/versions/v1/tool.exe")).unwrap(),
            bytes
        );
        assert!(!root
            .join("environment/staging")
            .read_dir()
            .unwrap()
            .next()
            .is_some());
        assert_eq!(
            installer.status().phase,
            EnvironmentUpdatePhase::RestartRequired
        );
        assert_eq!(
            installer
                .layout
                .active_root()
                .unwrap()
                .unwrap()
                .file_name()
                .and_then(|value| value.to_str()),
            Some("v1")
        );
        let persisted: CurrentEnvironment =
            serde_json::from_slice(&fs::read(root.join("environment/current.json")).unwrap())
                .unwrap();
        assert_eq!(persisted.current_version, "v1");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn keeps_partial_downloads_and_resumes_from_the_stable_version_staging_directory() {
        let root = temp_root("resume");
        let bytes = b"tool-v1";
        let mut installer = EnvironmentInstaller::new(
            EnvironmentLayout::new(&root),
            InterruptOnceDownloader {
                bytes: bytes.to_vec(),
                interrupted: false,
            },
            FakeHealth::default(),
        );
        let manifest = verified_manifest("v1", bytes);

        assert!(matches!(
            installer.install(&manifest),
            Err(EnvironmentUpdateError::Download(_))
        ));
        let partial = root.join("environment/staging/v1/downloads/tool.exe.package");
        assert_eq!(fs::read(&partial).unwrap(), &bytes[..3]);

        let installed = installer.install(&manifest).unwrap();
        assert_eq!(installed.current_version, "v1");
        assert_eq!(
            fs::read(root.join("environment/versions/v1/tool.exe")).unwrap(),
            bytes
        );
        assert!(!root.join("environment/staging/v1").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn retry_skips_verified_packages_before_resuming_a_later_component() {
        let root = temp_root("resume-multiple");
        let first = b"first-tool";
        let second = b"second-tool";
        let first_url = "https://updates.example.test/first.exe".to_owned();
        let second_url = "https://updates.example.test/second.exe".to_owned();
        let mut installer = EnvironmentInstaller::new(
            EnvironmentLayout::new(&root),
            InterruptSecondDownloader {
                content: HashMap::from([
                    (first_url.clone(), first.to_vec()),
                    (second_url.clone(), second.to_vec()),
                ]),
                calls: HashMap::new(),
                interrupted: false,
            },
            FakeHealth::default(),
        );
        let manifest = verified_multi_manifest("v1", first, second);

        assert!(matches!(
            installer.install(&manifest),
            Err(EnvironmentUpdateError::Download(_))
        ));
        installer.install(&manifest).unwrap();

        assert_eq!(installer.downloader.calls.get(&first_url), Some(&1));
        assert_eq!(installer.downloader.calls.get(&second_url), Some(&2));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn cancellation_after_download_stops_before_verification_and_switch() {
        let root = temp_root("cancel-after-download");
        let bytes = b"tool-v1";
        let cancel_requested = Arc::new(AtomicBool::new(false));
        let shared_status = Arc::new(Mutex::new(EnvironmentUpdateStatus::default()));
        let mut installer = EnvironmentInstaller::new(
            EnvironmentLayout::new(&root),
            CancelAfterDownload {
                bytes: bytes.to_vec(),
                cancel_requested: Arc::clone(&cancel_requested),
            },
            FakeHealth::default(),
        )
        .with_control(shared_status, cancel_requested);

        assert!(matches!(
            installer.install(&verified_manifest("v1", bytes)),
            Err(EnvironmentUpdateError::Cancelled)
        ));
        assert!(!root.join("environment/versions/v1").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn cancellation_interrupts_a_large_component_hash() {
        let root = temp_root("cancel-hash");
        let package = root.join("large.bin");
        File::create(&package)
            .unwrap()
            .set_len(64 * 1024 * 1024)
            .unwrap();
        let cancel_requested = Arc::new(AtomicBool::new(false));
        let hash_cancel = Arc::clone(&cancel_requested);
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(10));
            hash_cancel.store(true, Ordering::Release);
        });

        let started = Instant::now();
        assert!(matches!(
            hash_file_cancellable(&package, Some(&cancel_requested)),
            Err(EnvironmentUpdateError::Cancelled)
        ));
        assert!(
            started.elapsed() < Duration::from_millis(100),
            "cancellation waited for the complete hash: {:?}",
            started.elapsed()
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn cancellation_interrupts_archive_entry_copying() {
        let cancel_requested = Arc::new(AtomicBool::new(false));
        let mut input = CancelAfterFirstRead {
            bytes: std::io::Cursor::new(vec![7_u8; 128 * 1024]),
            cancel_requested: Arc::clone(&cancel_requested),
            reads: 0,
        };
        let mut output = Vec::new();

        assert!(matches!(
            copy_stream(&mut input, &mut output, Some(&cancel_requested)),
            Err(EnvironmentUpdateError::Cancelled)
        ));
        assert_eq!(output.len(), 64 * 1024);
    }

    #[test]
    fn cancellation_terminates_a_running_health_check() {
        let root = temp_root("cancel-health");
        #[cfg(windows)]
        let executable = PathBuf::from(
            std::env::var_os("ComSpec").unwrap_or_else(|| "C:\\Windows\\System32\\cmd.exe".into()),
        );
        #[cfg(windows)]
        let args = vec!["/D".into(), "/C".into(), "ping 127.0.0.1 -n 3 >NUL".into()];
        #[cfg(not(windows))]
        let executable = PathBuf::from("/bin/sh");
        #[cfg(not(windows))]
        let args = vec!["-c".into(), "sleep 2".into()];
        let cancel_requested = Arc::new(AtomicBool::new(false));
        let runner_cancel = Arc::clone(&cancel_requested);
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(50));
            cancel_requested.store(true, Ordering::Release);
        });

        let started = Instant::now();
        let mut runner = ProcessHealthRunner;
        assert!(matches!(
            runner.run(&root, &executable, &args, Some(&runner_cancel)),
            Err(EnvironmentUpdateError::Cancelled)
        ));
        assert!(
            started.elapsed() < Duration::from_millis(500),
            "cancellation waited for the health check to exit: {:?}",
            started.elapsed()
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn cancellation_interrupts_a_stalled_http_body() {
        let root = temp_root("cancel-http");
        let target = root.join("component.package");
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 1024];
            let _ = stream.read(&mut request).unwrap();
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 1\r\nConnection: close\r\n\r\n")
                .unwrap();
            stream.flush().unwrap();
            thread::sleep(Duration::from_millis(750));
            let _ = stream.write_all(b"x");
        });
        let cancel_requested = Arc::new(AtomicBool::new(false));
        let mut downloader = HttpPackageDownloader {
            client: reqwest::Client::builder()
                .no_proxy()
                .timeout(Duration::from_secs(5))
                .build()
                .unwrap(),
            status: Some(Arc::new(Mutex::new(EnvironmentUpdateStatus::default()))),
            cancel_requested: Some(Arc::clone(&cancel_requested)),
        };
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(50));
            cancel_requested.store(true, Ordering::Release);
        });

        let started = Instant::now();
        let result = downloader.download_to(&format!("http://{address}"), &target, Some(1));
        assert!(
            matches!(result, Err(EnvironmentUpdateError::Cancelled)),
            "unexpected download result: {result:?}"
        );
        assert!(
            started.elapsed() < Duration::from_millis(300),
            "cancellation waited for the HTTP body: {:?}",
            started.elapsed()
        );
        server.join().unwrap();
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reports_installing_to_shared_status_before_health_checks() {
        let root = temp_root("shared-install-status");
        let bytes = b"tool-v1";
        let shared_status = Arc::new(Mutex::new(EnvironmentUpdateStatus::default()));
        let observed = Arc::new(Mutex::new(Vec::new()));
        let cancel_requested = Arc::new(AtomicBool::new(false));
        let mut downloader = FakeDownloader::default();
        downloader.content.insert(
            "https://updates.example.test/tool.exe".into(),
            bytes.to_vec(),
        );
        let mut installer = EnvironmentInstaller::new(
            EnvironmentLayout::new(&root),
            downloader,
            SharedStatusHealth {
                status: Arc::clone(&shared_status),
                observed: Arc::clone(&observed),
            },
        )
        .with_control(Arc::clone(&shared_status), cancel_requested);

        installer.install(&verified_manifest("v1", bytes)).unwrap();

        assert_eq!(
            *observed
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()),
            vec![EnvironmentUpdatePhase::Installing]
        );
        assert_eq!(
            shared_status
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .phase,
            EnvironmentUpdatePhase::Installing
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn checksum_or_health_failure_does_not_switch_current() {
        let root = temp_root("failure");
        let bytes = b"tool-v1";
        let mut installer = installer(&root, bytes, FakeHealth::default());
        installer.install(&verified_manifest("v1", bytes)).unwrap();

        let mut wrong = verified_manifest("v2", b"different");
        wrong.components[0].size_bytes = Some(bytes.len() as u64);
        assert!(matches!(
            installer.install(&wrong),
            Err(EnvironmentUpdateError::ChecksumMismatch { .. })
        ));
        assert_eq!(installer.current().unwrap().unwrap().current_version, "v1");
        assert!(!root.join("environment/versions/v2").exists());

        installer.health_mut().fail_all = true;
        let failed_health = verified_manifest("v2", bytes);
        assert!(matches!(
            installer.install(&failed_health),
            Err(EnvironmentUpdateError::HealthCheck(_))
        ));
        assert_eq!(installer.current().unwrap().unwrap().current_version, "v1");
        assert!(!root.join("environment/versions/v2").exists());
        assert!(!root
            .join("environment/staging")
            .read_dir()
            .unwrap()
            .next()
            .is_some());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rollback_rechecks_and_swaps_current_and_previous() {
        let root = temp_root("rollback");
        let bytes = b"tool";
        let mut installer = installer(&root, bytes, FakeHealth::default());
        installer.install(&verified_manifest("v1", bytes)).unwrap();
        installer.install(&verified_manifest("v2", bytes)).unwrap();
        let rolled_back = installer.rollback().unwrap();
        assert_eq!(rolled_back.current_version, "v1");
        assert_eq!(rolled_back.previous_version.as_deref(), Some("v2"));
        assert_eq!(installer.status().phase, EnvironmentUpdatePhase::RolledBack);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn update_control_rejects_overlapping_operations_and_releases_after_drop() {
        let control = EnvironmentUpdateControl::default();
        let first = control.try_begin().unwrap();
        assert!(matches!(
            control.try_begin(),
            Err(EnvironmentUpdateError::OperationInProgress)
        ));
        drop(first);
        assert!(control.try_begin().is_ok());
    }

    #[test]
    fn update_control_accepts_cancel_only_while_an_operation_is_running() {
        let control = EnvironmentUpdateControl::default();
        assert!(!control.request_cancel());

        let operation = control.try_begin().unwrap();
        assert!(control.request_cancel());
        assert!(control.cancellation_requested());

        drop(operation);
        assert!(!control.cancellation_requested());
        assert!(!control.request_cancel());
    }

    #[test]
    fn stale_cancel_token_cannot_cancel_the_next_operation() {
        let control = EnvironmentUpdateControl::default();
        let first = control.try_begin().unwrap();
        let stale_token = first.cancel_token();
        drop(first);

        let second = control.try_begin().unwrap();
        stale_token.store(true, Ordering::Release);

        assert!(!control.cancellation_requested());
        assert!(!second.cancel_token().load(Ordering::Acquire));
    }

    #[test]
    fn http_resume_plan_appends_only_when_the_server_honors_the_range() {
        assert_eq!(
            download_write_plan(
                5,
                reqwest::StatusCode::PARTIAL_CONTENT,
                Some("bytes 5-9/10"),
                Some(5),
                Some(10),
            )
            .unwrap(),
            (5, true, Some(10), Some(10))
        );
        assert_eq!(
            download_write_plan(5, reqwest::StatusCode::OK, None, None, None).unwrap(),
            (0, false, None, None)
        );
        assert!(download_write_plan(
            5,
            reqwest::StatusCode::PARTIAL_CONTENT,
            Some("bytes 4-9/10"),
            Some(6),
            None,
        )
        .is_err());
        assert!(
            download_write_plan(5, reqwest::StatusCode::PARTIAL_CONTENT, None, Some(5), None,)
                .is_err()
        );
        assert!(download_write_plan(
            5,
            reqwest::StatusCode::PARTIAL_CONTENT,
            Some("bytes 5-invalid"),
            None,
            None,
        )
        .is_err());
        assert!(download_write_plan(
            5,
            reqwest::StatusCode::PARTIAL_CONTENT,
            Some("bytes 5-4/10"),
            None,
            None,
        )
        .is_err());
        assert!(download_write_plan(
            5,
            reqwest::StatusCode::PARTIAL_CONTENT,
            Some("bytes 5-9/9"),
            Some(5),
            None,
        )
        .is_err());
        assert!(download_write_plan(
            5,
            reqwest::StatusCode::PARTIAL_CONTENT,
            Some("bytes 5-9/10"),
            Some(4),
            None,
        )
        .is_err());
        assert!(download_write_plan(
            5,
            reqwest::StatusCode::RANGE_NOT_SATISFIABLE,
            Some("bytes */5"),
            None,
            None,
        )
        .is_err());
    }

    #[test]
    fn http_resume_rejects_a_total_that_disagrees_with_the_manifest() {
        let root = temp_root("wrong-http-total");
        let target = root.join("component.package");
        fs::write(&target, b"first").unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 1024];
            let _ = stream.read(&mut request).unwrap();
            stream
                .write_all(
                    b"HTTP/1.1 206 Partial Content\r\nContent-Range: bytes 5-9/10\r\nContent-Length: 5\r\nConnection: close\r\n\r\nnext!",
                )
                .unwrap();
        });
        let mut downloader = HttpPackageDownloader {
            client: reqwest::Client::builder()
                .no_proxy()
                .timeout(Duration::from_secs(5))
                .build()
                .unwrap(),
            status: None,
            cancel_requested: None,
        };

        let result = downloader.download_to(&format!("http://{address}"), &target, Some(11));

        assert!(matches!(result, Err(EnvironmentUpdateError::Download(_))));
        server.join().unwrap();
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn http_resume_rejects_a_short_body_without_content_length() {
        let root = temp_root("short-http-resume");
        let target = root.join("component.package");
        fs::write(&target, b"first").unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 1024];
            let _ = stream.read(&mut request).unwrap();
            stream
                .write_all(
                    b"HTTP/1.1 206 Partial Content\r\nContent-Range: bytes 5-9/10\r\nConnection: close\r\n\r\nnext",
                )
                .unwrap();
        });
        let mut downloader = HttpPackageDownloader {
            client: reqwest::Client::builder()
                .no_proxy()
                .timeout(Duration::from_secs(5))
                .build()
                .unwrap(),
            status: None,
            cancel_requested: None,
        };

        let result = downloader.download_to(&format!("http://{address}"), &target, Some(10));

        assert!(matches!(result, Err(EnvironmentUpdateError::Download(_))));
        server.join().unwrap();
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn active_environment_executable_candidates_cover_flat_and_bundled_layouts() {
        let root = Path::new("C:/environment/versions/v1");
        assert_eq!(
            environment_executable_candidates(root, "uv.exe"),
            [root.join("uv.exe"), root.join("binaries/uv.exe")]
        );
    }

    fn traversal_zip() -> Vec<u8> {
        let mut cursor = std::io::Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut cursor);
            writer
                .start_file("../escape.txt", zip::write::SimpleFileOptions::default())
                .unwrap();
            writer.write_all(b"escape").unwrap();
            writer.finish().unwrap();
        }
        cursor.into_inner()
    }

    fn traversal_tar_gz() -> Vec<u8> {
        let mut output = Vec::new();
        {
            let encoder =
                flate2::write::GzEncoder::new(&mut output, flate2::Compression::default());
            let mut builder = tar::Builder::new(encoder);
            let mut header = tar::Header::new_gnu();
            let name = b"../escape.txt";
            header.as_mut_bytes()[..name.len()].copy_from_slice(name);
            header.set_size(6);
            header.set_cksum();
            builder.append(&header, &b"escape"[..]).unwrap();
            let encoder = builder.into_inner().unwrap();
            encoder.finish().unwrap();
        }
        output
    }

    #[test]
    fn rejects_archive_traversal_without_writing_outside_payload() {
        let root = temp_root("traversal");
        let archive = traversal_zip();
        let signing = SigningKey::from_bytes(&[9; 32]);
        let body = payload(
            "v1",
            serde_json::json!([{
                "id":"bundle",
                "url":"https://updates.example.test/bundle.zip",
                "sha256":sha256(&archive),
                "archive":"zip"
            }]),
            serde_json::json!([]),
        );
        let manifest = verify_envelope_with_public_key(
            &signed_envelope(&body, &signing),
            &signing.verifying_key().to_bytes(),
        )
        .unwrap();
        let mut downloader = FakeDownloader::default();
        downloader
            .content
            .insert("https://updates.example.test/bundle.zip".into(), archive);
        let mut installer = EnvironmentInstaller::new(
            EnvironmentLayout::new(&root),
            downloader,
            FakeHealth::default(),
        );
        assert!(matches!(
            installer.install(&manifest),
            Err(EnvironmentUpdateError::UnsafeArchivePath(_))
        ));
        assert!(!root.join("escape.txt").exists());
        assert!(installer.current().unwrap().is_none());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_tar_gz_traversal() {
        let root = temp_root("tar-traversal");
        let archive = traversal_tar_gz();
        let signing = SigningKey::from_bytes(&[10; 32]);
        let body = payload(
            "v1",
            serde_json::json!([{
                "id":"bundle",
                "url":"https://updates.example.test/bundle.tar.gz",
                "sha256":sha256(&archive),
                "archive":"tarGz"
            }]),
            serde_json::json!([]),
        );
        let manifest = verify_envelope_with_public_key(
            &signed_envelope(&body, &signing),
            &signing.verifying_key().to_bytes(),
        )
        .unwrap();
        let mut downloader = FakeDownloader::default();
        downloader
            .content
            .insert("https://updates.example.test/bundle.tar.gz".into(), archive);
        let mut installer = EnvironmentInstaller::new(
            EnvironmentLayout::new(&root),
            downloader,
            FakeHealth::default(),
        );
        assert!(matches!(
            installer.install(&manifest),
            Err(EnvironmentUpdateError::UnsafeArchivePath(_))
        ));
        assert!(!root.join("escape.txt").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn builds_the_target_specific_manifest_asset_name() {
        assert_eq!(
            environment_manifest_asset_name("x86_64-pc-windows-msvc"),
            "ZeroWall-Environment-x86_64-pc-windows-msvc.tar.gz.json"
        );
    }

    #[test]
    fn reports_a_supported_release_target() {
        let target = environment_target_triple().expect("current test platform is supported");
        assert!(matches!(
            target,
            "x86_64-pc-windows-msvc"
                | "aarch64-apple-darwin"
                | "x86_64-apple-darwin"
                | "x86_64-unknown-linux-gnu"
        ));
    }
}
