use base64::Engine as _;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Manager;

const RELEASES_API_URL: &str = "https://zerowall.chengxunkeji.cn/releases/latest.json";
const UPDATE_CANCEL_POLL_INTERVAL: Duration = Duration::from_millis(100);
const APP_UPDATE_ENVELOPE_SCHEMA: &str = "zerowall.science/app-update-envelope/v1";
const APP_UPDATE_SCHEMA: &str = "zerowall.science/app-update/v1";

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateAsset {
    pub name: String,
    pub url: String,
    pub sha256: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateManifest {
    pub schema: String,
    pub version: String,
    pub target: String,
    pub asset: AppUpdateAsset,
}

#[derive(Debug, Deserialize)]
struct SignedAppUpdateEnvelope {
    schema: String,
    payload: String,
    signature: String,
}

pub fn verify_app_update_manifest_with_public_key(
    envelope_json: &str,
    public_key: &[u8; 32],
) -> Result<AppUpdateManifest, String> {
    let envelope: SignedAppUpdateEnvelope = serde_json::from_str(envelope_json)
        .map_err(|error| format!("invalid application update envelope: {error}"))?;
    if envelope.schema != APP_UPDATE_ENVELOPE_SCHEMA {
        return Err("unsupported application update envelope schema".into());
    }
    let signature_bytes = base64::engine::general_purpose::STANDARD
        .decode(envelope.signature)
        .map_err(|_| "invalid application update signature".to_string())?;
    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|_| "invalid application update signature".to_string())?;
    let verifying_key = VerifyingKey::from_bytes(public_key)
        .map_err(|_| "invalid application update public key".to_string())?;
    verifying_key
        .verify(envelope.payload.as_bytes(), &signature)
        .map_err(|_| "application update signature is invalid".to_string())?;
    let manifest: AppUpdateManifest = serde_json::from_str(&envelope.payload)
        .map_err(|error| format!("invalid application update manifest: {error}"))?;
    validate_app_update_manifest(manifest)
}

fn validate_app_update_manifest(manifest: AppUpdateManifest) -> Result<AppUpdateManifest, String> {
    if manifest.schema != APP_UPDATE_SCHEMA {
        return Err("unsupported application update manifest schema".into());
    }
    validate_update_segment("version", &manifest.version)?;
    validate_update_segment("target", &manifest.target)?;
    validate_update_asset_name(&manifest.asset.name)?;
    if manifest.asset.size_bytes == 0 {
        return Err("application update asset size must be positive".into());
    }
    let url = reqwest::Url::parse(&manifest.asset.url)
        .map_err(|_| "application update asset URL is invalid".to_string())?;
    if url.scheme() != "https" || url.host_str().is_none() {
        return Err("application update asset URL must use HTTPS".into());
    }
    if manifest.asset.sha256.len() != 64
        || !manifest
            .asset
            .sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("application update asset SHA-256 is invalid".into());
    }
    Ok(manifest)
}

fn validate_update_segment(label: &str, value: &str) -> Result<(), String> {
    if value.is_empty()
        || value == "."
        || value == ".."
        || value.len() > 256
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err(format!("application update {label} is unsafe"));
    }
    Ok(())
}

fn validate_update_asset_name(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value == "."
        || value == ".."
        || value.len() > 256
        || value.contains(['/', '\\', ':'])
        || value.chars().any(char::is_control)
    {
        return Err("application update asset name is unsafe".into());
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AppUpdatePhase {
    Idle,
    Downloading,
    Verifying,
    Ready,
    RestartRequired,
    Failed,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateSnapshot {
    pub phase: AppUpdatePhase,
    pub message: Option<String>,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub target_path: Option<String>,
}

impl Default for AppUpdateSnapshot {
    fn default() -> Self {
        Self {
            phase: AppUpdatePhase::Idle,
            message: None,
            downloaded_bytes: 0,
            total_bytes: None,
            target_path: None,
        }
    }
}

#[derive(Default)]
struct AppUpdateOperation {
    active_cancel: Option<Arc<AtomicBool>>,
}

pub struct AppUpdateControl {
    operation: Mutex<AppUpdateOperation>,
    status: Arc<Mutex<AppUpdateSnapshot>>,
}

impl Default for AppUpdateControl {
    fn default() -> Self {
        Self {
            operation: Mutex::new(AppUpdateOperation::default()),
            status: Arc::new(Mutex::new(AppUpdateSnapshot::default())),
        }
    }
}

pub struct AppUpdateGuard<'a> {
    operation: &'a Mutex<AppUpdateOperation>,
    cancel_requested: Arc<AtomicBool>,
}

impl Drop for AppUpdateGuard<'_> {
    fn drop(&mut self) {
        self.operation
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .active_cancel = None;
    }
}

impl AppUpdateGuard<'_> {
    fn cancel_requested(&self) -> bool {
        self.cancel_requested.load(Ordering::Acquire)
    }
}

impl AppUpdateControl {
    fn try_begin(&self) -> Result<AppUpdateGuard<'_>, String> {
        let mut operation = self
            .operation
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if operation.active_cancel.is_some() {
            return Err("an application update download is already running".into());
        }
        let cancel_requested = Arc::new(AtomicBool::new(false));
        operation.active_cancel = Some(Arc::clone(&cancel_requested));
        Ok(AppUpdateGuard {
            operation: &self.operation,
            cancel_requested,
        })
    }

    fn request_cancel(&self) -> bool {
        self.operation
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .active_cancel
            .as_ref()
            .is_some_and(|cancel| {
                cancel.store(true, Ordering::Release);
                true
            })
    }

    fn set_status(&self, status: AppUpdateSnapshot) {
        *self
            .status
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = status;
    }

    fn status(&self) -> AppUpdateSnapshot {
        self.status
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    pub version: String,
    pub url: String,
    pub name: Option<String>,
    pub published_at: Option<String>,
    pub asset_url: Option<String>,
    pub asset_name: Option<String>,
    pub asset_sha256: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QiniuRelease {
    version: Option<String>,
    url: Option<String>,
    name: Option<String>,
    #[serde(rename = "publishedAt")]
    published_at: Option<String>,
    #[serde(rename = "assetUrl")]
    asset_url: Option<String>,
    #[serde(rename = "assetName")]
    asset_name: Option<String>,
    #[serde(rename = "assetSha256")]
    asset_sha256: Option<String>,
}

#[tauri::command]
pub async fn latest_release() -> Result<ReleaseInfo, String> {
    tauri::async_runtime::spawn_blocking(fetch_latest_release)
        .await
        .map_err(|e| format!("update check task failed: {e}"))?
}

fn fetch_latest_release() -> Result<ReleaseInfo, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("ZeroWall Science update checker")
        .build()
        .map_err(|e| format!("could not create HTTP client: {e}"))?;
    let text = client
        .get(RELEASES_API_URL)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("could not fetch Qiniu release metadata: {e}"))?
        .text()
        .map_err(|e| format!("could not read Qiniu release metadata: {e}"))?;
    let body: QiniuRelease = serde_json::from_str(&text)
        .map_err(|e| format!("could not parse Qiniu release metadata: {e}"))?;
    let version = body
        .version
        .filter(|value| !value.trim().is_empty())
        .ok_or("Qiniu metadata had no release version")?;
    let url = body
        .url
        .filter(|value| !value.trim().is_empty())
        .ok_or("Qiniu metadata had no release URL")?;
    let public_key_text =
        option_env!("ZEROWALL_APP_UPDATE_PUBLIC_KEY").filter(|value| !value.trim().is_empty());
    if let Some(public_key_text) = public_key_text {
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(public_key_text.trim())
            .map_err(|_| "application update public key is invalid".to_string())?;
        let public_key: [u8; 32] = decoded
            .try_into()
            .map_err(|_| "application update public key is invalid".to_string())?;
        let manifest_url = format!(
            "https://zerowall.chengxunkeji.cn/releases/latest/zerowall-app-manifest-{}.json",
            target_triple()
        );
        let envelope = client
            .get(&manifest_url)
            .send()
            .and_then(|response| response.error_for_status())
            .map_err(|error| format!("could not fetch application update manifest: {error}"))?
            .text()
            .map_err(|error| format!("could not read application update manifest: {error}"))?;
        let manifest = verify_app_update_manifest_with_public_key(&envelope, &public_key)?;
        validate_manifest_binding(&manifest, &version, target_triple())?;
        return Ok(ReleaseInfo {
            version: manifest.version,
            url,
            name: body.name,
            published_at: body.published_at,
            asset_url: Some(manifest.asset.url),
            asset_name: Some(manifest.asset.name),
            asset_sha256: Some(manifest.asset.sha256),
        });
    }
    let asset_url = body
        .asset_url
        .filter(|value| !value.trim().is_empty())
        .ok_or("Qiniu metadata had no installer URL")?;
    let asset_name = body
        .asset_name
        .filter(|value| !value.trim().is_empty())
        .ok_or("Qiniu metadata had no installer name")?;
    let asset_sha256 = body
        .asset_sha256
        .filter(|value| is_sha256(value))
        .ok_or("Qiniu metadata had no valid installer SHA-256")?;
    Ok(ReleaseInfo {
        version,
        url,
        name: body.name,
        published_at: body.published_at,
        asset_url: Some(asset_url),
        asset_name: Some(asset_name),
        asset_sha256: Some(asset_sha256.to_lowercase()),
    })
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn validate_manifest_binding(
    manifest: &AppUpdateManifest,
    release_version: &str,
    expected_target: &str,
) -> Result<(), String> {
    if manifest.version != release_version {
        return Err("signed application update version does not match the release tag".into());
    }
    if manifest.target != expected_target {
        return Err("signed application update target does not match this platform".into());
    }
    Ok(())
}

fn target_triple() -> &'static str {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "x86_64-pc-windows-msvc"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "x86_64-apple-darwin"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-unknown-linux-gnu"
    } else {
        "unsupported"
    }
}

#[tauri::command]
pub fn app_update_status(control: tauri::State<'_, AppUpdateControl>) -> AppUpdateSnapshot {
    control.status()
}

#[tauri::command]
pub fn app_update_cancel(
    control: tauri::State<'_, AppUpdateControl>,
) -> Result<AppUpdateSnapshot, String> {
    if !control.request_cancel() {
        return Err("no application update download is running".into());
    }
    let mut status = control.status();
    status.message = Some("Cancelling application update...".into());
    control.set_status(status.clone());
    Ok(status)
}

#[tauri::command]
pub async fn download_update(
    app: tauri::AppHandle,
    control: tauri::State<'_, AppUpdateControl>,
    url: String,
    filename: String,
    sha256: Option<String>,
) -> Result<String, String> {
    let guard = control.try_begin()?;
    let result = download_update_inner(&app, &control, &guard, url, filename, sha256).await;
    if let Err(error) = &result {
        let cancelled = guard.cancel_requested();
        let previous = control.status();
        control.set_status(AppUpdateSnapshot {
            phase: if cancelled {
                AppUpdatePhase::Idle
            } else {
                AppUpdatePhase::Failed
            },
            message: Some(if cancelled {
                "Application update cancelled. Retry to continue.".into()
            } else {
                error.clone()
            }),
            downloaded_bytes: previous.downloaded_bytes,
            total_bytes: previous.total_bytes,
            target_path: None,
        });
    }
    result
}

async fn download_update_inner(
    app: &tauri::AppHandle,
    control: &AppUpdateControl,
    guard: &AppUpdateGuard<'_>,
    url: String,
    filename: String,
    sha256: Option<String>,
) -> Result<String, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "update URL is invalid".to_string())?;
    if parsed.scheme() != "https" || parsed.host_str().is_none() {
        return Err("updates require an HTTPS URL".to_string());
    }
    let safe_name = PathBuf::from(filename)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty() && *name != "." && *name != "..")
        .ok_or_else(|| "update filename is invalid".to_string())?
        .to_string();
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve update directory: {error}"))?
        .join("updates");
    std::fs::create_dir_all(&dir).map_err(|error| format!("create update directory: {error}"))?;
    let staging = dir.join(format!("{safe_name}.download"));
    let target = dir.join(&safe_name);
    let expected = sha256
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "the application installer has no SHA-256 digest".to_string())?;
    let expected = expected
        .trim()
        .trim_start_matches("sha256:")
        .to_ascii_lowercase();
    if expected.len() != 64 || !expected.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("the application installer has an invalid SHA-256 digest".into());
    }

    let existing_bytes = std::fs::metadata(&staging)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    control.set_status(AppUpdateSnapshot {
        phase: AppUpdatePhase::Downloading,
        message: None,
        downloaded_bytes: existing_bytes,
        total_bytes: None,
        target_path: None,
    });

    let client = reqwest::Client::builder()
        .user_agent("ZeroWall Science updater")
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(30 * 60))
        .build()
        .map_err(|error| format!("create update client: {error}"))?;
    let mut request = client.get(parsed);
    if existing_bytes > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={existing_bytes}-"));
    }
    let send = request.send();
    tokio::pin!(send);
    let response = loop {
        tokio::select! {
            result = &mut send => break result.map_err(|error| format!("download update: {error}"))?,
            _ = tokio::time::sleep(UPDATE_CANCEL_POLL_INTERVAL) => {
                if guard.cancel_requested() {
                    return Err("application update cancelled".into());
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
    let (mut downloaded_bytes, append, total_bytes) = download_write_plan(
        existing_bytes,
        response.status(),
        content_range.as_deref(),
        content_length,
    )?;
    let mut response = response
        .error_for_status()
        .map_err(|error| format!("download update: {error}"))?;
    let mut options = OpenOptions::new();
    options.create(true).write(true);
    if append {
        options.append(true);
    } else {
        options.truncate(true);
    }
    let mut output = options
        .open(&staging)
        .map_err(|error| format!("stage update: {error}"))?;
    loop {
        let next = response.chunk();
        tokio::pin!(next);
        let chunk = loop {
            tokio::select! {
                result = &mut next => break result.map_err(|error| format!("read update: {error}"))?,
                _ = tokio::time::sleep(UPDATE_CANCEL_POLL_INTERVAL) => {
                    if guard.cancel_requested() {
                        output.sync_all().map_err(|error| format!("stage update: {error}"))?;
                        return Err("application update cancelled".into());
                    }
                }
            }
        };
        let Some(chunk) = chunk else { break };
        output
            .write_all(&chunk)
            .map_err(|error| format!("stage update: {error}"))?;
        downloaded_bytes = downloaded_bytes.saturating_add(chunk.len() as u64);
        control.set_status(AppUpdateSnapshot {
            phase: AppUpdatePhase::Downloading,
            message: None,
            downloaded_bytes,
            total_bytes,
            target_path: None,
        });
    }
    output
        .sync_all()
        .map_err(|error| format!("stage update: {error}"))?;
    if total_bytes.is_some_and(|total| total != downloaded_bytes) {
        return Err("application installer download is incomplete".into());
    }

    control.set_status(AppUpdateSnapshot {
        phase: AppUpdatePhase::Verifying,
        message: None,
        downloaded_bytes,
        total_bytes,
        target_path: None,
    });
    let actual = sha256_file(&staging)?;
    if actual != expected {
        let _ = std::fs::remove_file(&staging);
        return Err(format!(
            "update SHA-256 mismatch: expected {expected}, got {actual}"
        ));
    }
    if target.exists() {
        std::fs::remove_file(&target)
            .map_err(|error| format!("replace downloaded update: {error}"))?;
    }
    std::fs::rename(&staging, &target)
        .map_err(|error| format!("commit downloaded update: {error}"))?;
    let target_path = target.to_string_lossy().into_owned();
    control.set_status(AppUpdateSnapshot {
        phase: AppUpdatePhase::Ready,
        message: None,
        downloaded_bytes,
        total_bytes,
        target_path: Some(target_path.clone()),
    });
    Ok(target_path)
}

fn download_write_plan(
    existing_bytes: u64,
    status: reqwest::StatusCode,
    content_range: Option<&str>,
    content_length: Option<u64>,
) -> Result<(u64, bool, Option<u64>), String> {
    if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
        return Err("server rejected the application update resume range".into());
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
            return Err("server returned an invalid application update resume range".into());
        };
        let range_length = end
            .checked_sub(start)
            .and_then(|value| value.checked_add(1));
        if start != existing_bytes
            || end >= total
            || range_length.is_none()
            || content_length.is_some_and(|length| Some(length) != range_length)
        {
            return Err("server returned an invalid application update resume range".into());
        }
        return Ok((existing_bytes, existing_bytes > 0, Some(total)));
    }
    Ok((0, false, content_length))
}

fn sha256_file(path: &PathBuf) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| format!("verify update: {error}"))?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|error| format!("verify update: {error}"))?;
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

#[tauri::command]
pub fn open_downloaded_update(
    app: tauri::AppHandle,
    control: tauri::State<'_, AppUpdateControl>,
    path: String,
) -> Result<(), String> {
    let updates_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve update directory: {error}"))?
        .join("updates")
        .canonicalize()
        .map_err(|error| format!("resolve update directory: {error}"))?;
    let target = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| format!("resolve downloaded update: {error}"))?;
    if !target.starts_with(&updates_dir) || !target.is_file() {
        return Err("downloaded update path is outside the update directory".to_string());
    }
    #[cfg(windows)]
    {
        std::process::Command::new(&target)
            .spawn()
            .map_err(|error| format!("open installer: {error}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&target)
            .spawn()
            .map_err(|error| format!("open installer: {error}"))?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map_err(|error| format!("open installer: {error}"))?;
    }
    let mut status = control.status();
    status.phase = AppUpdatePhase::RestartRequired;
    status.message = Some("Installer opened. Restart ZeroWall Science after installation.".into());
    control.set_status(status);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resumes_only_from_a_matching_partial_response() {
        assert_eq!(
            download_write_plan(
                4,
                reqwest::StatusCode::PARTIAL_CONTENT,
                Some("bytes 4-9/10"),
                Some(6),
            )
            .unwrap(),
            (4, true, Some(10)),
        );

        assert!(download_write_plan(
            4,
            reqwest::StatusCode::PARTIAL_CONTENT,
            Some("bytes 3-9/10"),
            Some(7),
        )
        .is_err());
    }

    #[test]
    fn restarts_when_a_server_ignores_the_range_header() {
        assert_eq!(
            download_write_plan(4, reqwest::StatusCode::OK, None, Some(10)).unwrap(),
            (0, false, Some(10)),
        );
    }

    #[test]
    fn update_control_cancels_only_an_active_download() {
        let control = AppUpdateControl::default();
        assert!(!control.request_cancel());
        let guard = control.try_begin().unwrap();
        assert!(control.request_cancel());
        assert!(guard.cancel_requested());
        drop(guard);
        assert!(!control.request_cancel());
    }

    #[test]
    fn verifies_a_signed_application_manifest_before_using_its_asset() {
        use ed25519_dalek::{Signer, SigningKey};
        let signing_key = SigningKey::from_bytes(&[7_u8; 32]);
        let payload = r#"{"schema":"zerowall.science/app-update/v1","version":"v0.4.58","target":"x86_64-pc-windows-msvc","asset":{"name":"ZeroWall_x64-setup.exe","url":"https://downloads.example/ZeroWall_x64-setup.exe","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sizeBytes":10}}"#;
        let signature = base64::engine::general_purpose::STANDARD
            .encode(signing_key.sign(payload.as_bytes()).to_bytes());
        let envelope = format!(
            r#"{{"schema":"zerowall.science/app-update-envelope/v1","payload":{payload:?},"signature":"{signature}"}}"#
        );
        let manifest = verify_app_update_manifest_with_public_key(
            &envelope,
            &signing_key.verifying_key().to_bytes(),
        )
        .unwrap();
        assert_eq!(manifest.version, "v0.4.58");
        assert_eq!(manifest.asset.name, "ZeroWall_x64-setup.exe");
    }

    #[test]
    fn rejects_a_signed_application_manifest_with_a_tampered_payload() {
        use ed25519_dalek::{Signer, SigningKey};
        let signing_key = SigningKey::from_bytes(&[8_u8; 32]);
        let payload = r#"{"schema":"zerowall.science/app-update/v1","version":"v0.4.58","target":"x86_64-pc-windows-msvc","asset":{"name":"ZeroWall_x64-setup.exe","url":"https://downloads.example/ZeroWall_x64-setup.exe","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sizeBytes":10}}"#;
        let signature = base64::engine::general_purpose::STANDARD
            .encode(signing_key.sign(payload.as_bytes()).to_bytes());
        let envelope = format!(
            r#"{{"schema":"zerowall.science/app-update-envelope/v1","payload":{payload:?},"signature":"{signature}"}}"#
        )
        .replace("v0.4.58", "v0.4.59");
        assert!(verify_app_update_manifest_with_public_key(
            &envelope,
            &signing_key.verifying_key().to_bytes(),
        )
        .is_err());
    }

    #[test]
    fn qiniu_manifest_path_is_platform_specific() {
        let path = format!(
            "https://zerowall.chengxunkeji.cn/releases/latest/zerowall-app-manifest-{}.json",
            target_triple()
        );
        assert!(path.ends_with(&format!("{}.json", target_triple())));
    }

    #[test]
    fn signed_manifest_must_match_the_release_tag_and_platform() {
        let manifest = AppUpdateManifest {
            schema: APP_UPDATE_SCHEMA.into(),
            version: "v0.4.58".into(),
            target: "x86_64-pc-windows-msvc".into(),
            asset: AppUpdateAsset {
                name: "ZeroWall_x64-setup.exe".into(),
                url: "https://downloads.example/ZeroWall_x64-setup.exe".into(),
                sha256: "a".repeat(64),
                size_bytes: 10,
            },
        };
        assert!(validate_manifest_binding(&manifest, "v0.4.59", &manifest.target).is_err());
        assert!(
            validate_manifest_binding(&manifest, &manifest.version, "aarch64-apple-darwin")
                .is_err()
        );
        assert!(validate_manifest_binding(&manifest, &manifest.version, &manifest.target).is_ok());
    }

    #[test]
    fn validates_qiniu_installer_sha256() {
        assert!(is_sha256(&"a".repeat(64)));
        assert!(!is_sha256("not-a-sha256"));
    }
}
