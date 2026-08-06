use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{BufReader, Read, Write};
use std::path::{Component as PathComponent, Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use thiserror::Error;

pub const ENVIRONMENT_ENVELOPE_SCHEMA: &str = "zerowall.science/environment-envelope/v1";
pub const ENVIRONMENT_SCHEMA: &str = "zerowall.science/environment/v1";
const VERSION_METADATA: &str = ".environment-manifest.json";
const MAX_ARCHIVE_FILES: usize = 10_000;
const MAX_EXTRACTED_BYTES: u64 = 512 * 1024 * 1024;
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
}

impl Default for EnvironmentUpdateStatus {
    fn default() -> Self {
        Self {
            phase: EnvironmentUpdatePhase::Idle,
            version: None,
            message: None,
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
}

pub struct EnvironmentUpdateControl {
    busy: AtomicBool,
    status: Mutex<EnvironmentUpdateStatus>,
}

impl Default for EnvironmentUpdateControl {
    fn default() -> Self {
        Self {
            busy: AtomicBool::new(false),
            status: Mutex::new(EnvironmentUpdateStatus::default()),
        }
    }
}

pub struct EnvironmentOperationGuard<'a> {
    busy: &'a AtomicBool,
}

impl Drop for EnvironmentOperationGuard<'_> {
    fn drop(&mut self) {
        self.busy.store(false, Ordering::Release);
    }
}

impl EnvironmentUpdateControl {
    pub fn try_begin(&self) -> Result<EnvironmentOperationGuard<'_>, EnvironmentUpdateError> {
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| EnvironmentUpdateError::OperationInProgress)?;
        Ok(EnvironmentOperationGuard { busy: &self.busy })
    }

    fn set_status(&self, status: EnvironmentUpdateStatus) {
        *self.status.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = status;
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
}

pub trait PackageDownloader {
    fn download_to(&mut self, url: &str, target: &Path) -> Result<(), EnvironmentUpdateError>;
}

pub trait HealthRunner {
    fn run(
        &mut self,
        version_dir: &Path,
        executable: &Path,
        args: &[String],
    ) -> Result<(), EnvironmentUpdateError>;
}

pub struct HttpPackageDownloader {
    client: reqwest::blocking::Client,
}

impl HttpPackageDownloader {
    pub fn new() -> Result<Self, EnvironmentUpdateError> {
        let client = reqwest::blocking::Client::builder()
            .user_agent("ZeroWall Science environment installer")
            .build()
            .map_err(|error| EnvironmentUpdateError::Download(error.to_string()))?;
        Ok(Self { client })
    }
}

impl PackageDownloader for HttpPackageDownloader {
    fn download_to(&mut self, url: &str, target: &Path) -> Result<(), EnvironmentUpdateError> {
        let mut response = self
            .client
            .get(url)
            .send()
            .and_then(|response| response.error_for_status())
            .map_err(|error| EnvironmentUpdateError::Download(error.to_string()))?;
        let mut output = File::create(target)?;
        std::io::copy(&mut response, &mut output)?;
        output.sync_all()?;
        Ok(())
    }
}

pub struct ProcessHealthRunner;

impl HealthRunner for ProcessHealthRunner {
    fn run(
        &mut self,
        version_dir: &Path,
        executable: &Path,
        args: &[String],
    ) -> Result<(), EnvironmentUpdateError> {
        let mut command = Command::new(executable);
        command.args(args).current_dir(version_dir);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        let output = command
            .output()
            .map_err(|error| EnvironmentUpdateError::HealthCheck(error.to_string()))?;
        if !output.status.success() {
            return Err(EnvironmentUpdateError::HealthCheck(format!(
                "{} exited with {}",
                executable.display(),
                output.status
            )));
        }
        Ok(())
    }
}

pub struct EnvironmentInstaller<D, H> {
    layout: EnvironmentLayout,
    downloader: D,
    health: H,
    status: EnvironmentUpdateStatus,
}

impl<D: PackageDownloader, H: HealthRunner> EnvironmentInstaller<D, H> {
    pub fn new(layout: EnvironmentLayout, downloader: D, health: H) -> Self {
        Self {
            layout,
            downloader,
            health,
            status: EnvironmentUpdateStatus::default(),
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
        let staging =
            self.layout
                .staging()
                .join(format!("{}-{}", manifest.version, unique_nonce()));
        fs::create_dir(&staging)?;
        self.status = EnvironmentUpdateStatus {
            phase: EnvironmentUpdatePhase::Downloading,
            version: Some(manifest.version.clone()),
            message: None,
        };
        let result = self.install_inner(&manifest, &staging);
        let _ = fs::remove_dir_all(&staging);
        match result {
            Ok(state) => {
                self.status = EnvironmentUpdateStatus {
                    phase: EnvironmentUpdatePhase::RestartRequired,
                    version: Some(state.current_version.clone()),
                    message: None,
                };
                Ok(state)
            }
            Err(error) => {
                self.status = EnvironmentUpdateStatus {
                    phase: EnvironmentUpdatePhase::Failed,
                    version: Some(manifest.version),
                    message: Some(error.to_string()),
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
        let version_dir = self.layout.versions().join(&manifest.version);
        if version_dir.exists() {
            let persisted = read_version_manifest(&version_dir)?;
            self.run_health_checks(&version_dir, &persisted.health_checks)?;
            return self.switch_current(&manifest.version);
        }

        let payload = staging.join("payload");
        let downloads = staging.join("downloads");
        fs::create_dir(&payload)?;
        fs::create_dir(&downloads)?;
        for component in &manifest.components {
            let package = downloads.join(format!("{}.package", component.id));
            self.downloader.download_to(&component.url, &package)?;
            if let Some(expected_size) = component.size_bytes {
                let actual_size = fs::metadata(&package)?.len();
                if actual_size != expected_size {
                    return Err(EnvironmentUpdateError::Download(format!(
                        "component {} size mismatch",
                        component.id
                    )));
                }
            }
            self.status.phase = EnvironmentUpdatePhase::Verifying;
            let actual = hash_file(&package)?;
            if !actual.eq_ignore_ascii_case(&component.sha256) {
                return Err(EnvironmentUpdateError::ChecksumMismatch {
                    component: component.id.clone(),
                    expected: component.sha256.clone(),
                    actual,
                });
            }
            self.status.phase = EnvironmentUpdatePhase::Installing;
            extract_component(component, &package, &payload)?;
        }
        fs::write(
            payload.join(VERSION_METADATA),
            serde_json::to_vec_pretty(manifest)?,
        )?;
        self.run_health_checks(&payload, &manifest.health_checks)?;
        fs::rename(&payload, &version_dir)?;
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
        };
        Ok(state)
    }

    fn run_health_checks(
        &mut self,
        version_dir: &Path,
        checks: &[EnvironmentHealthCheck],
    ) -> Result<(), EnvironmentUpdateError> {
        for check in checks {
            let relative = Path::new(&check.executable);
            validate_relative_path(relative)?;
            let executable = version_dir.join(relative);
            if !executable.is_file() {
                return Err(EnvironmentUpdateError::HealthCheck(format!(
                    "{} is not a file",
                    check.executable
                )));
            }
            self.health.run(version_dir, &executable, &check.args)?;
        }
        Ok(())
    }

    fn switch_current(&self, version: &str) -> Result<CurrentEnvironment, EnvironmentUpdateError> {
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
    })
}

fn app_environment_layout(app: &tauri::AppHandle) -> Result<EnvironmentLayout, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data directory: {error}"))?;
    Ok(EnvironmentLayout::new(root))
}

#[tauri::command]
pub fn environment_update_status(
    app: tauri::AppHandle,
    control: tauri::State<'_, EnvironmentUpdateControl>,
) -> Result<EnvironmentUpdateSnapshot, String> {
    update_snapshot(&app_environment_layout(&app)?, control.status()).map_err(|error| error.to_string())
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
    });
    let verified = tauri::async_runtime::spawn_blocking(move || {
        verify_environment_envelope(&envelope_json)
    })
    .await
    .map_err(|error| format!("environment manifest verification task failed: {error}"))?;
    match verified {
        Ok(manifest) => {
            control.set_status(EnvironmentUpdateStatus {
                phase: EnvironmentUpdatePhase::Available,
                version: Some(manifest.version),
                message: None,
            });
        }
        Err(error) => {
            control.set_status(EnvironmentUpdateStatus {
                phase: EnvironmentUpdatePhase::Failed,
                version: None,
                message: Some(error.to_string()),
            });
            return Err(error.to_string());
        }
    }
    environment_update_status(app, control)
}

#[tauri::command]
pub async fn environment_update_install(
    app: tauri::AppHandle,
    control: tauri::State<'_, EnvironmentUpdateControl>,
    envelope_json: String,
) -> Result<EnvironmentUpdateSnapshot, String> {
    let _operation = control.try_begin().map_err(|error| error.to_string())?;
    let layout = app_environment_layout(&app)?;
    control.set_status(EnvironmentUpdateStatus {
        phase: EnvironmentUpdatePhase::Downloading,
        version: None,
        message: None,
    });
    let task_layout = layout.clone();
    let installed = tauri::async_runtime::spawn_blocking(move || {
        let manifest = verify_environment_envelope(&envelope_json)?;
        let downloader = HttpPackageDownloader::new()?;
        let mut installer = EnvironmentInstaller::new(task_layout, downloader, ProcessHealthRunner);
        installer.install(&manifest)
    })
    .await
    .map_err(|error| format!("environment install task failed: {error}"))?;
    match installed {
        Ok(current) => control.set_status(EnvironmentUpdateStatus {
            phase: EnvironmentUpdatePhase::RestartRequired,
            version: Some(current.current_version),
            message: None,
        }),
        Err(error) => {
            control.set_status(EnvironmentUpdateStatus {
                phase: EnvironmentUpdatePhase::Failed,
                version: None,
                message: Some(error.to_string()),
            });
            return Err(error.to_string());
        }
    }
    update_snapshot(&layout, control.status()).map_err(|error| error.to_string())
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
        }),
        Err(error) => {
            control.set_status(EnvironmentUpdateStatus {
                phase: EnvironmentUpdatePhase::Failed,
                version: None,
                message: Some(error.to_string()),
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

fn hash_file(path: &Path) -> Result<String, EnvironmentUpdateError> {
    let mut reader = BufReader::new(File::open(path)?);
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
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

fn extract_component(
    component: &EnvironmentComponent,
    package: &Path,
    payload: &Path,
) -> Result<(), EnvironmentUpdateError> {
    match component.archive {
        EnvironmentArchive::File => {
            let target = payload.join(&component.id);
            copy_new(package, &target)?;
        }
        EnvironmentArchive::Zip => extract_zip(package, payload)?,
        EnvironmentArchive::TarGz => extract_tar_gz(package, payload)?,
    }
    Ok(())
}

fn copy_new(source: &Path, target: &Path) -> Result<(), EnvironmentUpdateError> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut input = File::open(source)?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)?;
    std::io::copy(&mut input, &mut output)?;
    output.sync_all()?;
    Ok(())
}

fn extract_zip(package: &Path, payload: &Path) -> Result<(), EnvironmentUpdateError> {
    let mut archive = zip::ZipArchive::new(File::open(package)?)
        .map_err(|error| EnvironmentUpdateError::Download(error.to_string()))?;
    let mut total = 0_u64;
    if archive.len() > MAX_ARCHIVE_FILES {
        return Err(EnvironmentUpdateError::ArchiveLimitExceeded);
    }
    for index in 0..archive.len() {
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
            std::io::copy(&mut entry, &mut output)?;
        } else {
            return Err(EnvironmentUpdateError::UnsupportedArchiveEntry(raw_name));
        }
    }
    Ok(())
}

fn extract_tar_gz(package: &Path, payload: &Path) -> Result<(), EnvironmentUpdateError> {
    let decoder = GzDecoder::new(File::open(package)?);
    let mut archive = tar::Archive::new(decoder);
    let mut count = 0_usize;
    let mut total = 0_u64;
    for item in archive.entries()? {
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
            std::io::copy(&mut entry, &mut output)?;
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
    use std::path::{Path, PathBuf};

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

    #[derive(Default)]
    struct FakeDownloader {
        content: HashMap<String, Vec<u8>>,
    }

    impl PackageDownloader for FakeDownloader {
        fn download_to(&mut self, url: &str, target: &Path) -> Result<(), EnvironmentUpdateError> {
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
        let persisted: CurrentEnvironment =
            serde_json::from_slice(&fs::read(root.join("environment/current.json")).unwrap())
                .unwrap();
        assert_eq!(persisted.current_version, "v1");
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
}
