use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use flate2::read::GzDecoder;
use reqwest::header::{CONTENT_RANGE, RANGE};
use reqwest::StatusCode;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{BufReader, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

const ENVELOPE_SCHEMA: &str = "zerowall.science/environment-envelope/v1";
const PAYLOAD_SCHEMA: &str = "zerowall.science/environment/v1";
const EMBEDDED_MANIFEST_URL: Option<&str> = option_env!("ZEROWALL_ENV_MANIFEST_URL");
const EMBEDDED_PUBLIC_KEY: Option<&str> = option_env!("ZEROWALL_ENV_UPDATE_PUBLIC_KEY");
const COMPONENT_DOWNLOAD_ATTEMPTS: usize = 5;
const COMPONENT_DOWNLOAD_RETRY_DELAY: std::time::Duration = std::time::Duration::from_secs(1);

#[derive(Debug, Error)]
enum BootstrapError {
    #[error("usage: zerowall-environment-bootstrapper [--manifest URL] [--public-key BASE64] [--app-data PATH]")]
    Usage,
    #[error("environment update public key is not configured")]
    MissingPublicKey,
    #[error("environment update public key is invalid")]
    InvalidPublicKey,
    #[error("environment update signature is invalid")]
    InvalidSignature,
    #[error("invalid manifest: {0}")]
    InvalidManifest(String),
    #[error("download failed: {0}")]
    Download(String),
    #[error("checksum mismatch: expected {expected}, got {actual}")]
    ChecksumMismatch { expected: String, actual: String },
    #[error("unsafe archive path: {0}")]
    UnsafeArchivePath(String),
    #[error("health check failed: {0}")]
    Health(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Envelope {
    schema: String,
    payload: String,
    signature: String,
}

#[derive(Debug, serde::Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    schema: String,
    version: String,
    target: String,
    components: Vec<ComponentSpec>,
    health_checks: Vec<HealthCheck>,
}

#[derive(Debug, serde::Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ComponentSpec {
    id: String,
    url: String,
    sha256: String,
    archive: String,
    size_bytes: Option<u64>,
}

#[derive(Debug, serde::Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HealthCheck {
    executable: String,
    args: Vec<String>,
}

#[derive(serde::Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurrentEnvironment {
    current_version: String,
    previous_version: Option<String>,
    installed_at: u64,
}

struct BootstrapConfig {
    manifest_url: String,
    public_key: String,
    app_data: PathBuf,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EnvironmentIndex {
    schema: String,
    version: String,
    targets: std::collections::HashMap<String, EnvironmentIndexTarget>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EnvironmentIndexTarget {
    manifest_url: String,
    #[serde(default)]
    manifest_sha256: Option<String>,
}

fn verify_envelope(raw: &str, key_text: &str) -> Result<Manifest, BootstrapError> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(key_text.trim())
        .map_err(|_| BootstrapError::InvalidPublicKey)?;
    let key_bytes: [u8; 32] = bytes
        .try_into()
        .map_err(|_| BootstrapError::InvalidPublicKey)?;
    let key = VerifyingKey::from_bytes(&key_bytes).map_err(|_| BootstrapError::InvalidPublicKey)?;
    let envelope: Envelope = serde_json::from_str(raw)?;
    if envelope.schema != ENVELOPE_SCHEMA {
        return Err(BootstrapError::InvalidManifest(
            "unsupported envelope schema".into(),
        ));
    }
    let signature = base64::engine::general_purpose::STANDARD
        .decode(envelope.signature)
        .map_err(|_| BootstrapError::InvalidSignature)?;
    key.verify(
        envelope.payload.as_bytes(),
        &Signature::from_slice(&signature).map_err(|_| BootstrapError::InvalidSignature)?,
    )
    .map_err(|_| BootstrapError::InvalidSignature)?;
    let manifest: Manifest = serde_json::from_str(&envelope.payload)?;
    validate_manifest(manifest)
}

fn verify_index(raw: &str, key_text: &str) -> Result<EnvironmentIndex, BootstrapError> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(key_text.trim())
        .map_err(|_| BootstrapError::InvalidPublicKey)?;
    let key_bytes: [u8; 32] = bytes
        .try_into()
        .map_err(|_| BootstrapError::InvalidPublicKey)?;
    let key = VerifyingKey::from_bytes(&key_bytes).map_err(|_| BootstrapError::InvalidPublicKey)?;
    let envelope: Envelope = serde_json::from_str(raw)?;
    if envelope.schema != ENVELOPE_SCHEMA {
        return Err(BootstrapError::InvalidManifest(
            "unsupported index envelope schema".into(),
        ));
    }
    let signature = base64::engine::general_purpose::STANDARD
        .decode(envelope.signature)
        .map_err(|_| BootstrapError::InvalidSignature)?;
    key.verify(
        envelope.payload.as_bytes(),
        &Signature::from_slice(&signature).map_err(|_| BootstrapError::InvalidSignature)?,
    )
    .map_err(|_| BootstrapError::InvalidSignature)?;
    let index: EnvironmentIndex = serde_json::from_str(&envelope.payload)?;
    if index.schema != "zerowall.science/environment-index/v1" || index.version.is_empty() {
        return Err(BootstrapError::InvalidManifest(
            "unsupported environment index".into(),
        ));
    }
    for target in index.targets.values() {
        let url = reqwest::Url::parse(&target.manifest_url)
            .map_err(|_| BootstrapError::InvalidManifest("invalid target manifest URL".into()))?;
        if url.scheme() != "https" {
            return Err(BootstrapError::InvalidManifest(
                "target manifest URL must use HTTPS".into(),
            ));
        }
        if let Some(hash) = target.manifest_sha256.as_deref() {
            if hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                return Err(BootstrapError::InvalidManifest(
                    "invalid target manifest SHA-256".into(),
                ));
            }
        }
    }
    Ok(index)
}

fn validate_manifest(manifest: Manifest) -> Result<Manifest, BootstrapError> {
    if manifest.schema != PAYLOAD_SCHEMA || manifest.version.is_empty() {
        return Err(BootstrapError::InvalidManifest(
            "unsupported schema or version".into(),
        ));
    }
    if manifest.components.len() != 1 {
        return Err(BootstrapError::InvalidManifest(
            "exactly one environment bundle is required".into(),
        ));
    }
    for value in [
        &manifest.version,
        &manifest.target,
        &manifest.components[0].id,
    ] {
        validate_path_segment(value)?;
    }
    let target = current_target()?;
    if manifest.target != target {
        return Err(BootstrapError::InvalidManifest(format!(
            "manifest target {} does not match {target}",
            manifest.target
        )));
    }
    let component = &manifest.components[0];
    let url = reqwest::Url::parse(&component.url)
        .map_err(|_| BootstrapError::InvalidManifest("invalid component URL".into()))?;
    if url.scheme() != "https" || url.host_str().is_none() || component.archive != "tarGz" {
        return Err(BootstrapError::InvalidManifest(
            "HTTPS tarGz component required".into(),
        ));
    }
    if component.sha256.len() != 64
        || !component
            .sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(BootstrapError::InvalidManifest("invalid SHA-256".into()));
    }
    if manifest.health_checks.is_empty() {
        return Err(BootstrapError::InvalidManifest(
            "at least one health check is required".into(),
        ));
    }
    for check in &manifest.health_checks {
        validate_relative_path(Path::new(&check.executable))?;
    }
    Ok(manifest)
}

fn validate_path_segment(value: &str) -> Result<(), BootstrapError> {
    if value.is_empty() || value.contains(['/', '\\', ':']) || value == "." || value == ".." {
        return Err(BootstrapError::InvalidManifest(
            "unsafe path segment".into(),
        ));
    }
    Ok(())
}

fn validate_relative_path(path: &Path) -> Result<(), BootstrapError> {
    if path.is_absolute()
        || path.to_string_lossy().contains(':')
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(BootstrapError::UnsafeArchivePath(
            path.display().to_string(),
        ));
    }
    Ok(())
}

fn hash_file(path: &Path) -> Result<String, BootstrapError> {
    let mut input = BufReader::new(File::open(path)?);
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = input.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(digest
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn verify_checksum(path: &Path, expected: &str) -> Result<(), BootstrapError> {
    let actual = hash_file(path)?;
    if actual != expected.to_lowercase() {
        return Err(BootstrapError::ChecksumMismatch {
            expected: expected.into(),
            actual,
        });
    }
    Ok(())
}

fn partial_download_path(
    app_data: &Path,
    version: &str,
    component: &ComponentSpec,
) -> Result<PathBuf, BootstrapError> {
    validate_path_segment(version)?;
    validate_path_segment(&component.id)?;
    Ok(app_data
        .join("environment")
        .join("staging")
        .join("downloads")
        .join(format!("{version}-{}.download", component.id)))
}

fn content_range_start(response: &reqwest::blocking::Response) -> Result<u64, BootstrapError> {
    let value = response
        .headers()
        .get(CONTENT_RANGE)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| {
            BootstrapError::Download("partial response is missing Content-Range".into())
        })?;
    let range = value
        .strip_prefix("bytes ")
        .and_then(|value| value.split_once('/').map(|pair| pair.0))
        .and_then(|value| value.split_once('-').map(|pair| pair.0))
        .ok_or_else(|| BootstrapError::Download("invalid Content-Range".into()))?;
    range
        .parse()
        .map_err(|_| BootstrapError::Download("invalid Content-Range".into()))
}

fn download_component(
    client: &reqwest::blocking::Client,
    app_data: &Path,
    version: &str,
    component: &ComponentSpec,
) -> Result<PathBuf, BootstrapError> {
    let partial = partial_download_path(app_data, version, component)?;
    if let Some(parent) = partial.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut last_error = None;
    for attempt in 0..COMPONENT_DOWNLOAD_ATTEMPTS {
        match download_component_attempt(client, &partial, component) {
            Ok(()) => {
                last_error = None;
                break;
            }
            Err(error @ BootstrapError::Download(_))
                if attempt + 1 < COMPONENT_DOWNLOAD_ATTEMPTS =>
            {
                last_error = Some(error);
                std::thread::sleep(COMPONENT_DOWNLOAD_RETRY_DELAY);
            }
            Err(error) => return Err(error),
        }
    }
    if let Some(error) = last_error {
        return Err(error);
    }

    if let Err(error) = verify_checksum(&partial, &component.sha256) {
        if matches!(error, BootstrapError::ChecksumMismatch { .. }) {
            let _ = fs::remove_file(&partial);
        }
        return Err(error);
    }
    Ok(partial)
}

fn download_component_attempt(
    client: &reqwest::blocking::Client,
    partial: &Path,
    component: &ComponentSpec,
) -> Result<(), BootstrapError> {
    let mut existing = fs::metadata(partial)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    if component
        .size_bytes
        .is_some_and(|expected| existing > expected)
    {
        fs::remove_file(partial)?;
        existing = 0;
    }

    let mut request = client.get(&component.url);
    if existing > 0 {
        request = request.header(RANGE, format!("bytes={existing}-"));
    }
    let mut response = request
        .send()
        .map_err(|error| BootstrapError::Download(error.to_string()))?;
    let status = response.status();

    if status == StatusCode::RANGE_NOT_SATISFIABLE
        && component.size_bytes == Some(existing)
        && existing > 0
    {
        // The local file already has the signed manifest's expected size.
    } else {
        let append = if status == StatusCode::PARTIAL_CONTENT {
            let start = content_range_start(&response)?;
            if start != existing {
                return Err(BootstrapError::Download(format!(
                    "partial response starts at {start}, expected {existing}"
                )));
            }
            existing > 0
        } else if status.is_success() {
            false
        } else {
            return Err(BootstrapError::Download(format!(
                "component request failed with {status}"
            )));
        };

        let mut options = OpenOptions::new();
        options
            .create(true)
            .write(true)
            .append(append)
            .truncate(!append);
        let mut output = open_with_retry(&options, partial).map_err(|error| {
            BootstrapError::Download(format!(
                "open partial download {}: {error}",
                partial.display()
            ))
        })?;
        std::io::copy(&mut response, &mut output).map_err(|error| {
            BootstrapError::Download(format!("component stream interrupted: {error}"))
        })?;
        output.flush()?;
        output.sync_all()?;
    }

    if let Some(expected) = component.size_bytes {
        let actual = fs::metadata(partial)?.len();
        if actual != expected {
            return Err(BootstrapError::Download(format!(
                "component size mismatch: expected {expected}, got {actual}"
            )));
        }
    }
    Ok(())
}

fn extract_archive(archive: &Path, destination: &Path) -> Result<(), BootstrapError> {
    let mut tar = tar::Archive::new(GzDecoder::new(File::open(archive)?));
    for item in tar.entries()? {
        let mut entry = item?;
        let relative = entry.path()?.into_owned();
        validate_relative_path(&relative)?;
        if entry.header().entry_type().is_symlink() || entry.header().entry_type().is_hard_link() {
            return Err(BootstrapError::UnsafeArchivePath(
                relative.display().to_string(),
            ));
        }
        let target = destination.join(&relative);
        if entry.header().entry_type().is_dir() {
            create_dir_all_with_retry(&target).map_err(|error| {
                BootstrapError::Download(format!(
                    "extract directory {}: {error}",
                    relative.display()
                ))
            })?;
        } else if entry.header().entry_type().is_file() {
            if let Some(parent) = target.parent() {
                create_dir_all_with_retry(parent).map_err(|error| {
                    BootstrapError::Download(format!(
                        "extract parent {}: {error}",
                        parent.display()
                    ))
                })?;
            }
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            let mut output = open_with_retry(&options, &target).map_err(|error| {
                BootstrapError::Download(format!("extract {}: {error}", relative.display()))
            })?;
            std::io::copy(&mut entry, &mut output).map_err(|error| {
                BootstrapError::Download(format!("extract file {}: {error}", relative.display()))
            })?;
        } else {
            return Err(BootstrapError::UnsafeArchivePath(
                relative.display().to_string(),
            ));
        }
    }
    Ok(())
}

fn run_health_checks(
    version_dir: &Path,
    health_checks: &[HealthCheck],
) -> Result<(), BootstrapError> {
    for check in health_checks {
        let executable = version_dir.join(&check.executable);
        if !executable.is_file() {
            return Err(BootstrapError::Health(format!(
                "{} is missing",
                check.executable
            )));
        }
        let mut command = Command::new(&executable);
        command.args(&check.args).current_dir(version_dir);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        if !command
            .output()
            .map_err(|error| BootstrapError::Health(format!("{}: {error}", executable.display())))?
            .status
            .success()
        {
            return Err(BootstrapError::Health(check.executable.clone()));
        }
    }
    Ok(())
}

fn activate_current(environment: &Path, version: &str) -> Result<(), BootstrapError> {
    let current = environment.join("current.json");
    let previous = fs::read(&current)
        .ok()
        .and_then(|raw| serde_json::from_slice::<CurrentEnvironment>(&raw).ok());
    let previous_version = previous
        .as_ref()
        .filter(|state| state.current_version != version)
        .map(|state| state.current_version.clone())
        .or_else(|| previous.and_then(|state| state.previous_version));
    let state = CurrentEnvironment {
        current_version: version.to_owned(),
        previous_version,
        installed_at: timestamp(),
    };
    let temp = environment.join(format!("current-{}.json.tmp", timestamp()));
    write_file_with_retry(&temp, &serde_json::to_vec_pretty(&state)?).map_err(|error| {
        BootstrapError::Download(format!("write current state {}: {error}", temp.display()))
    })?;
    replace_file_with_retry(&temp, &current).map_err(|error| {
        BootstrapError::Download(format!(
            "activate current state {}: {error}",
            current.display()
        ))
    })?;
    Ok(())
}

fn install(app_data: &Path, manifest: &Manifest, archive: &Path) -> Result<(), BootstrapError> {
    let environment = app_data.join("environment");
    let versions = environment.join("versions");
    let staging = environment
        .join("staging")
        .join(format!("{}-{}", manifest.version, timestamp()));
    let version_dir = versions.join(&manifest.version);
    create_dir_all_with_retry(&versions).map_err(|error| {
        BootstrapError::Download(format!("create versions {}: {error}", versions.display()))
    })?;
    if version_dir.exists() {
        let metadata_path = version_dir.join(".environment-manifest.json");
        let persisted = fs::read(&metadata_path).map_err(|error| {
            BootstrapError::Download(format!(
                "read existing environment manifest {}: {error}",
                metadata_path.display()
            ))
        })?;
        let persisted = validate_manifest(serde_json::from_slice(&persisted)?)?;
        if persisted.version != manifest.version {
            return Err(BootstrapError::InvalidManifest(format!(
                "existing environment version {} does not match {}",
                persisted.version, manifest.version
            )));
        }
        run_health_checks(&version_dir, &persisted.health_checks)?;
        return activate_current(&environment, &manifest.version);
    }
    create_dir_all_with_retry(&staging).map_err(|error| {
        BootstrapError::Download(format!("create staging {}: {error}", staging.display()))
    })?;
    let staged = (|| {
        extract_archive(archive, &staging)
            .map_err(|error| BootstrapError::Download(format!("extract archive: {error}")))?;
        let metadata_path = staging.join(".environment-manifest.json");
        write_file_with_retry(&metadata_path, &serde_json::to_vec_pretty(manifest)?).map_err(
            |error| {
                BootstrapError::Download(format!(
                    "write environment manifest {}: {error}",
                    metadata_path.display()
                ))
            },
        )?;
        run_health_checks(&staging, &manifest.health_checks)?;
        rename_with_retry(&staging, &version_dir)
            .map_err(|error| BootstrapError::Download(format!("activate environment: {error}")))?;
        Ok(())
    })();
    if let Err(error) = staged {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    activate_current(&environment, &manifest.version)
}

fn replace_file(source: &Path, target: &Path) -> Result<(), BootstrapError> {
    #[cfg(not(windows))]
    {
        fs::rename(source, target)?;
    }
    #[cfg(windows)]
    {
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
            return Err(std::io::Error::last_os_error().into());
        }
    }
    Ok(())
}

fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or(0)
}

fn replace_file_with_retry(source: &Path, target: &Path) -> Result<(), BootstrapError> {
    for attempt in 0..60 {
        match replace_file(source, target) {
            Ok(()) => return Ok(()),
            Err(error)
                if cfg!(windows)
                    && matches!(&error, BootstrapError::Io(error) if error.kind() == std::io::ErrorKind::PermissionDenied)
                    && attempt < 59 =>
            {
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
            Err(error) => return Err(error),
        }
    }
    unreachable!()
}

fn rename_with_retry(source: &Path, target: &Path) -> std::io::Result<()> {
    retry_windows_permission(|| fs::rename(source, target))
}

fn retry_windows_permission_with_policy<F, T, S>(
    mut operation: F,
    max_attempts: usize,
    mut sleep: S,
) -> std::io::Result<T>
where
    F: FnMut() -> std::io::Result<T>,
    S: FnMut(std::time::Duration),
{
    assert!(max_attempts > 0, "max_attempts must be positive");
    for attempt in 0..max_attempts {
        match operation() {
            Ok(value) => return Ok(value),
            Err(error)
                if cfg!(windows)
                    && error.kind() == std::io::ErrorKind::PermissionDenied
                    && attempt + 1 < max_attempts =>
            {
                sleep(std::time::Duration::from_millis(500));
            }
            Err(error) => return Err(error),
        }
    }
    unreachable!()
}

fn retry_windows_permission<F, T>(operation: F) -> std::io::Result<T>
where
    F: FnMut() -> std::io::Result<T>,
{
    retry_windows_permission_with_policy(operation, 60, std::thread::sleep)
}

fn create_dir_all_with_retry(path: &Path) -> std::io::Result<()> {
    retry_windows_permission(|| fs::create_dir_all(path))
}

fn open_with_retry(options: &OpenOptions, path: &Path) -> std::io::Result<File> {
    retry_windows_permission(|| options.open(path))
}

fn write_file_with_retry(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    retry_windows_permission(|| fs::write(path, bytes))
}

fn default_app_data() -> PathBuf {
    #[cfg(windows)]
    if let Some(value) = std::env::var_os("APPDATA") {
        return PathBuf::from(value).join("com.zerowall.science");
    }
    #[cfg(target_os = "macos")]
    if let Some(value) = std::env::var_os("HOME") {
        return PathBuf::from(value).join("Library/Application Support/com.zerowall.science");
    }
    if let Some(value) = std::env::var_os("XDG_DATA_HOME") {
        return PathBuf::from(value).join("com.zerowall.science");
    }
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".local/share/com.zerowall.science")
}

fn current_target() -> Result<&'static str, BootstrapError> {
    match (std::env::consts::ARCH, std::env::consts::OS) {
        ("x86_64", "windows") => Ok("x86_64-pc-windows-msvc"),
        ("aarch64", "macos") => Ok("aarch64-apple-darwin"),
        ("x86_64", "macos") => Ok("x86_64-apple-darwin"),
        ("x86_64", "linux") => Ok("x86_64-unknown-linux-gnu"),
        _ => Err(BootstrapError::InvalidManifest(
            "unsupported platform target".into(),
        )),
    }
}

fn arg(args: &[String], name: &str) -> Option<String> {
    args.windows(2)
        .find(|pair| pair[0] == name)
        .map(|pair| pair[1].clone())
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|candidate| !candidate.trim().is_empty())
}

fn resolve_config(
    args: &[String],
    runtime_public_key: Option<String>,
    embedded_manifest_url: Option<&str>,
    embedded_public_key: Option<&str>,
    default_app_data: PathBuf,
) -> Result<BootstrapConfig, BootstrapError> {
    let manifest_url = non_empty(arg(args, "--manifest"))
        .or_else(|| {
            embedded_manifest_url
                .map(str::to_owned)
                .and_then(|value| non_empty(Some(value)))
        })
        .ok_or(BootstrapError::Usage)?;
    let public_key = non_empty(arg(args, "--public-key"))
        .or_else(|| non_empty(runtime_public_key))
        .or_else(|| {
            embedded_public_key
                .map(str::to_owned)
                .and_then(|value| non_empty(Some(value)))
        })
        .ok_or(BootstrapError::MissingPublicKey)?;
    let app_data = non_empty(arg(args, "--app-data"))
        .map(PathBuf::from)
        .unwrap_or(default_app_data);
    Ok(BootstrapConfig {
        manifest_url,
        public_key,
        app_data,
    })
}

fn run() -> Result<(), BootstrapError> {
    let args = std::env::args().collect::<Vec<_>>();
    let config = resolve_config(
        &args,
        std::env::var("ZEROWALL_ENV_UPDATE_PUBLIC_KEY").ok(),
        EMBEDDED_MANIFEST_URL,
        EMBEDDED_PUBLIC_KEY,
        default_app_data(),
    )?;
    let client = reqwest::blocking::Client::builder()
        .user_agent("ZeroWall Science environment bootstrapper")
        .build()
        .map_err(|error| BootstrapError::Download(error.to_string()))?;
    let index_raw = client
        .get(&config.manifest_url)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| BootstrapError::Download(error.to_string()))?
        .text()
        .map_err(|error| BootstrapError::Download(error.to_string()))?;
    let index = verify_index(&index_raw, &config.public_key)?;
    let target = current_target()?;
    let target_manifest = index.targets.get(target).ok_or_else(|| {
        BootstrapError::InvalidManifest(format!("target {target} is not published"))
    })?;
    let manifest_bytes = client
        .get(&target_manifest.manifest_url)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| BootstrapError::Download(error.to_string()))?
        .bytes()
        .map_err(|error| BootstrapError::Download(error.to_string()))?;
    if let Some(expected) = target_manifest.manifest_sha256.as_deref() {
        let actual = Sha256::digest(&manifest_bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        if !actual.eq_ignore_ascii_case(expected) {
            return Err(BootstrapError::ChecksumMismatch {
                expected: expected.into(),
                actual,
            });
        }
    }
    let envelope = String::from_utf8(manifest_bytes.to_vec())
        .map_err(|error| BootstrapError::Download(error.to_string()))?;
    let manifest = verify_envelope(&envelope, &config.public_key)?;
    let component = &manifest.components[0];
    let archive = download_component(&client, &config.app_data, &manifest.version, component)?;
    install(&config.app_data, &manifest, &archive)?;
    let _ = fs::remove_file(archive);
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use flate2::{write::GzEncoder, Compression};

    fn test_target() -> &'static str {
        match (std::env::consts::ARCH, std::env::consts::OS) {
            ("x86_64", "windows") => "x86_64-pc-windows-msvc",
            ("aarch64", "macos") => "aarch64-apple-darwin",
            ("x86_64", "macos") => "x86_64-apple-darwin",
            ("x86_64", "linux") => "x86_64-unknown-linux-gnu",
            _ => "unsupported-test-target",
        }
    }

    fn valid_payload() -> String {
        let target = test_target();
        format!(
            r#"{{"schema":"zerowall.science/environment/v1","version":"v1","target":"{target}","components":[{{"id":"bundle","url":"https://example.test/bundle.tar.gz","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","archive":"tarGz"}}],"healthChecks":[{{"executable":"opencode.exe","args":["--version"]}}]}}"#
        )
    }

    fn signed_envelope(payload: &str, key: &SigningKey) -> String {
        let signature = key.sign(payload.as_bytes());
        serde_json::json!({
            "schema": ENVELOPE_SCHEMA,
            "payload": payload,
            "signature": base64::engine::general_purpose::STANDARD.encode(signature.to_bytes())
        })
        .to_string()
    }

    fn temp_root(label: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("zerowall-bootstrapper-{label}-{}", timestamp()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn tar_gz_with_entry(path: &Path, name: &str, content: &[u8]) {
        let output = File::create(path).unwrap();
        let encoder = GzEncoder::new(output, Compression::fast());
        let mut builder = tar::Builder::new(encoder);
        let mut header = tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(0o644);
        let name_bytes = name.as_bytes();
        header.as_mut_bytes()[..name_bytes.len()].copy_from_slice(name_bytes);
        header.set_cksum();
        builder.append(&header, content).unwrap();
        builder.into_inner().unwrap().finish().unwrap();
    }

    fn tar_gz_with_symlink(path: &Path, name: &str, target: &str) {
        let output = File::create(path).unwrap();
        let encoder = GzEncoder::new(output, Compression::fast());
        let mut builder = tar::Builder::new(encoder);
        let mut header = tar::Header::new_gnu();
        header.set_entry_type(tar::EntryType::symlink());
        header.set_size(0);
        header.set_mode(0o777);
        header.set_link_name(target).unwrap();
        header.set_cksum();
        builder
            .append_data(&mut header, name, std::io::empty())
            .unwrap();
        builder.into_inner().unwrap().finish().unwrap();
    }

    #[test]
    fn verifies_exact_payload_signature() {
        let key = SigningKey::from_bytes(&[3; 32]);
        let payload = valid_payload();
        let envelope = signed_envelope(&payload, &key);
        let manifest = verify_envelope(
            &envelope,
            &base64::engine::general_purpose::STANDARD.encode(key.verifying_key().to_bytes()),
        )
        .unwrap();
        assert_eq!(manifest.version, "v1");
    }

    #[test]
    fn rejects_payload_tampering_after_signature() {
        let key = SigningKey::from_bytes(&[3; 32]);
        let envelope = signed_envelope(&valid_payload(), &key);
        let mut value: serde_json::Value = serde_json::from_str(&envelope).unwrap();
        value["payload"] = serde_json::Value::String(valid_payload().replace("\"v1\"", "\"v2\""));
        let error = verify_envelope(
            &value.to_string(),
            &base64::engine::general_purpose::STANDARD.encode(key.verifying_key().to_bytes()),
        )
        .unwrap_err();
        assert!(matches!(error, BootstrapError::InvalidSignature));
    }

    #[test]
    fn rejects_a_manifest_for_a_different_platform_target() {
        let key = SigningKey::from_bytes(&[3; 32]);
        let payload = valid_payload().replace(
            &format!("\"target\":\"{}\"", test_target()),
            "\"target\":\"different-platform\"",
        );
        let error = verify_envelope(
            &signed_envelope(&payload, &key),
            &base64::engine::general_purpose::STANDARD.encode(key.verifying_key().to_bytes()),
        )
        .unwrap_err();
        assert!(matches!(error, BootstrapError::InvalidManifest(_)));
    }

    #[test]
    fn rejects_unsafe_manifest_paths() {
        let key = SigningKey::from_bytes(&[3; 32]);
        for replacement in [
            ("\"version\":\"v1\"", "\"version\":\"../v1\""),
            ("\"id\":\"bundle\"", "\"id\":\"..\\\\bundle\""),
            (
                "\"executable\":\"opencode.exe\"",
                "\"executable\":\"tools/../opencode.exe\"",
            ),
        ] {
            let payload = valid_payload().replace(replacement.0, replacement.1);
            let error = verify_envelope(
                &signed_envelope(&payload, &key),
                &base64::engine::general_purpose::STANDARD.encode(key.verifying_key().to_bytes()),
            )
            .unwrap_err();
            assert!(
                matches!(
                    error,
                    BootstrapError::InvalidManifest(_) | BootstrapError::UnsafeArchivePath(_)
                ),
                "{error:?}"
            );
        }
    }

    #[test]
    fn rejects_tar_path_traversal_without_writing_outside_destination() {
        let root = temp_root("traversal");
        let archive = root.join("bundle.tar.gz");
        let destination = root.join("destination");
        fs::create_dir_all(&destination).unwrap();
        tar_gz_with_entry(&archive, "../escaped.txt", b"escape");
        let error = extract_archive(&archive, &destination).unwrap_err();
        assert!(matches!(error, BootstrapError::UnsafeArchivePath(_)));
        assert!(!root.join("escaped.txt").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_tar_symlink_entries() {
        let root = temp_root("symlink");
        let archive = root.join("bundle.tar.gz");
        let destination = root.join("destination");
        fs::create_dir_all(&destination).unwrap();
        tar_gz_with_symlink(&archive, "link", "../../outside");
        let error = extract_archive(&archive, &destination).unwrap_err();
        assert!(matches!(error, BootstrapError::UnsafeArchivePath(_)));
        assert!(!destination.join("link").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_checksum_mismatch() {
        let root = temp_root("checksum");
        let file = root.join("bundle.tar.gz");
        fs::write(&file, b"actual").unwrap();
        let error = verify_checksum(&file, &"00".repeat(32)).unwrap_err();
        assert!(matches!(error, BootstrapError::ChecksumMismatch { .. }));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn resolves_one_click_defaults_from_the_signed_release_build() {
        let app_data = temp_root("one-click-defaults");
        let config = resolve_config(
            &["zerowall-environment-bootstrapper".into()],
            None,
            Some("https://zerowall.chengxunkeji.cn/environment/latest/index.json"),
            Some("embedded-public-key"),
            app_data.clone(),
        )
        .unwrap();

        assert_eq!(
            config.manifest_url,
            "https://zerowall.chengxunkeji.cn/environment/latest/index.json"
        );
        assert_eq!(config.public_key, "embedded-public-key");
        assert_eq!(config.app_data, app_data);
        let _ = fs::remove_dir_all(config.app_data);
    }

    #[test]
    fn explicit_bootstrapper_arguments_override_embedded_defaults() {
        let default_app_data = temp_root("default-app-data");
        let explicit_app_data = temp_root("explicit-app-data");
        let args = vec![
            "zerowall-environment-bootstrapper".into(),
            "--manifest".into(),
            "https://updates.example.test/environment.json".into(),
            "--public-key".into(),
            "explicit-public-key".into(),
            "--app-data".into(),
            explicit_app_data.to_string_lossy().into_owned(),
        ];

        let config = resolve_config(
            &args,
            Some("runtime-public-key".into()),
            Some("https://embedded.example.test/environment.json"),
            Some("embedded-public-key"),
            default_app_data.clone(),
        )
        .unwrap();

        assert_eq!(
            config.manifest_url,
            "https://updates.example.test/environment.json"
        );
        assert_eq!(config.public_key, "explicit-public-key");
        assert_eq!(config.app_data, explicit_app_data);
        let _ = fs::remove_dir_all(default_app_data);
        let _ = fs::remove_dir_all(config.app_data);
    }

    #[test]
    fn usage_explains_that_release_defaults_are_optional_overrides() {
        assert_eq!(
            BootstrapError::Usage.to_string(),
            "usage: zerowall-environment-bootstrapper [--manifest URL] [--public-key BASE64] [--app-data PATH]"
        );
    }

    #[test]
    fn resumes_a_partial_environment_download_with_http_range() {
        use std::io::{Read as _, Write as _};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 4096];
            let read = stream.read(&mut request).unwrap();
            let request = String::from_utf8_lossy(&request[..read]);
            assert!(
                request.to_ascii_lowercase().contains("range: bytes=3-"),
                "{request}"
            );
            stream
                .write_all(
                    b"HTTP/1.1 206 Partial Content\r\nContent-Length: 3\r\nContent-Range: bytes 3-5/6\r\nConnection: close\r\n\r\ndef",
                )
                .unwrap();
        });
        let root = temp_root("resume-download");
        let component = ComponentSpec {
            id: "environment-bundle".into(),
            url: format!("http://{address}/bundle.tar.gz"),
            sha256: {
                let file = root.join("expected");
                fs::write(&file, b"abcdef").unwrap();
                hash_file(&file).unwrap()
            },
            archive: "tarGz".into(),
            size_bytes: Some(6),
        };
        let partial = partial_download_path(&root, "v1", &component).unwrap();
        fs::create_dir_all(partial.parent().unwrap()).unwrap();
        fs::write(&partial, b"abc").unwrap();

        let downloaded =
            download_component(&reqwest::blocking::Client::new(), &root, "v1", &component).unwrap();

        server.join().unwrap();
        assert_eq!(downloaded, partial);
        assert_eq!(fs::read(&downloaded).unwrap(), b"abcdef");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn retries_an_interrupted_environment_download_and_resumes_the_partial_file() {
        use std::io::{Read as _, Write as _};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            for attempt in 0..2 {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0_u8; 4096];
                let read = stream.read(&mut request).unwrap();
                let request = String::from_utf8_lossy(&request[..read]).to_ascii_lowercase();
                if attempt == 0 {
                    assert!(!request.contains("range:"), "{request}");
                    stream
                        .write_all(
                            b"HTTP/1.1 200 OK\r\nContent-Length: 6\r\nConnection: close\r\n\r\nabc",
                        )
                        .unwrap();
                } else {
                    assert!(request.contains("range: bytes=3-"), "{request}");
                    stream
                        .write_all(
                            b"HTTP/1.1 206 Partial Content\r\nContent-Length: 3\r\nContent-Range: bytes 3-5/6\r\nConnection: close\r\n\r\ndef",
                        )
                        .unwrap();
                }
            }
        });
        let root = temp_root("retry-interrupted-download");
        let expected = root.join("expected");
        fs::write(&expected, b"abcdef").unwrap();
        let component = ComponentSpec {
            id: "environment-bundle".into(),
            url: format!("http://{address}/bundle.tar.gz"),
            sha256: hash_file(&expected).unwrap(),
            archive: "tarGz".into(),
            size_bytes: Some(6),
        };

        let downloaded =
            download_component(&reqwest::blocking::Client::new(), &root, "v1", &component).unwrap();

        server.join().unwrap();
        assert_eq!(fs::read(&downloaded).unwrap(), b"abcdef");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn removes_install_staging_after_a_failed_health_check() {
        let root = temp_root("health-cleanup");
        let archive = root.join("bundle.tar.gz");
        tar_gz_with_entry(&archive, "payload.txt", b"ready");
        let manifest = Manifest {
            schema: PAYLOAD_SCHEMA.into(),
            version: "v1".into(),
            target: test_target().into(),
            components: vec![ComponentSpec {
                id: "environment-bundle".into(),
                url: "https://example.test/bundle.tar.gz".into(),
                sha256: hash_file(&archive).unwrap(),
                archive: "tarGz".into(),
                size_bytes: Some(fs::metadata(&archive).unwrap().len()),
            }],
            health_checks: vec![HealthCheck {
                executable: "missing-runtime".into(),
                args: vec!["--version".into()],
            }],
        };

        let error = install(&root, &manifest, &archive).unwrap_err();

        assert!(matches!(error, BootstrapError::Health(_)));
        let staging = root.join("environment/staging");
        assert_eq!(fs::read_dir(staging).unwrap().count(), 0);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reuses_an_existing_complete_environment_version() {
        let root = temp_root("reuse-existing-version");
        let archive = root.join("bundle.tar.gz");
        tar_gz_with_entry(&archive, "payload.txt", b"replacement");
        #[cfg(windows)]
        let (health_source, health_name, health_args) = (
            PathBuf::from(std::env::var_os("WINDIR").unwrap()).join("System32/where.exe"),
            "health-check.exe",
            vec!["cmd".into()],
        );
        #[cfg(not(windows))]
        let (health_source, health_name, health_args) =
            (PathBuf::from("/bin/true"), "health-check", Vec::new());
        let manifest = Manifest {
            schema: PAYLOAD_SCHEMA.into(),
            version: "v1".into(),
            target: test_target().into(),
            components: vec![ComponentSpec {
                id: "environment-bundle".into(),
                url: "https://example.test/bundle.tar.gz".into(),
                sha256: hash_file(&archive).unwrap(),
                archive: "tarGz".into(),
                size_bytes: Some(fs::metadata(&archive).unwrap().len()),
            }],
            health_checks: vec![HealthCheck {
                executable: health_name.into(),
                args: health_args,
            }],
        };
        let version_dir = root.join("environment/versions/v1");
        fs::create_dir_all(&version_dir).unwrap();
        fs::write(version_dir.join("payload.txt"), b"running-version").unwrap();
        fs::copy(health_source, version_dir.join(health_name)).unwrap();
        fs::write(
            version_dir.join(".environment-manifest.json"),
            serde_json::to_vec_pretty(&manifest).unwrap(),
        )
        .unwrap();

        install(&root, &manifest, &archive).unwrap();

        assert_eq!(
            fs::read(version_dir.join("payload.txt")).unwrap(),
            b"running-version"
        );
        let current: CurrentEnvironment =
            serde_json::from_slice(&fs::read(root.join("environment/current.json")).unwrap())
                .unwrap();
        assert_eq!(current.current_version, "v1");
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(windows)]
    #[test]
    fn retries_transient_windows_permission_denied_without_sleeping_in_tests() {
        let mut attempts = 0;
        let result = retry_windows_permission_with_policy(
            || {
                attempts += 1;
                if attempts < 3 {
                    Err(std::io::Error::from(std::io::ErrorKind::PermissionDenied))
                } else {
                    Ok("installed")
                }
            },
            3,
            |_| {},
        )
        .unwrap();

        assert_eq!(result, "installed");
        assert_eq!(attempts, 3);
    }

    #[cfg(windows)]
    #[test]
    fn does_not_retry_non_permission_install_errors() {
        let mut attempts = 0;
        let error = retry_windows_permission_with_policy(
            || {
                attempts += 1;
                Err::<(), _>(std::io::Error::from(std::io::ErrorKind::NotFound))
            },
            3,
            |_| {},
        )
        .unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::NotFound);
        assert_eq!(attempts, 1);
    }
}
