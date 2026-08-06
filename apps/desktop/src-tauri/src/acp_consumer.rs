// ACP runtime consumer: discovers the two bundled profiles, builds their
// keychain-backed gateway environment, serializes lifecycle transitions, and
// forwards protocol events without exposing prompts or credentials.
use std::collections::{HashMap, HashSet};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use futures::channel::oneshot;
use futures::StreamExt;
use tauri::{AppHandle, Emitter, Manager, State};
use sha2::{Digest, Sha256};
use zerowall_acp::{
    AcpAgentProfile, AcpClient, AcpEvent, AcpEventErrorKind, AcpHandshakeStage, AcpMcpServer,
    AcpTokenUsage, PromptAttachment,
};

const CLAUDE_PROFILE_ID: &str = "claude-code";
const CODEX_PROFILE_ID: &str = "codex";
const CLAUDE_ADAPTER_VERSION: &str = "0.16.1";
const CODEX_ADAPTER_VERSION: &str = "1.1.9";
const DRIVER_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_DIAGNOSTIC_CHARS: usize = 512;
const CLI_VERSION_PROBE_ATTEMPTS: usize = 2;
const CLI_VERSION_PROBE_RETRY_DELAY: Duration = Duration::from_millis(250);
const CLI_VERSION_PROBE_TIMEOUT: Duration = Duration::from_secs(5);
/// A turn may take a long time, but it must keep emitting agent/tool activity.
/// A silent adapter/MCP request beyond this bound is treated as wedged.
const PROMPT_IDLE_TIMEOUT: Duration = Duration::from_secs(120);
const PROMPT_CANCEL_GRACE: Duration = Duration::from_secs(5);
const PROMPT_WATCHDOG_POLL: Duration = Duration::from_secs(5);

/// Held while a session is live. Dropping `client` closes its command channel,
/// which the driver task observes and tears the agent down.
struct ActiveSession {
    epoch: u64,
    client: AcpClient,
    driver: tauri::async_runtime::JoinHandle<()>,
}

pub struct AcpConsumerState {
    inner: Mutex<ConsumerInner>,
    lifecycle: tokio::sync::Mutex<()>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Option<String>>>>,
    pending_exec: Mutex<HashMap<u64, oneshot::Sender<bool>>>,
    next_permission_id: AtomicU64,
    next_epoch: AtomicU64,
    prepared_profiles: Mutex<HashSet<String>>,
}

impl Default for AcpConsumerState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(ConsumerInner::default()),
            lifecycle: tokio::sync::Mutex::new(()),
            pending: Mutex::new(HashMap::new()),
            pending_exec: Mutex::new(HashMap::new()),
            next_permission_id: AtomicU64::new(0),
            next_epoch: AtomicU64::new(1),
            prepared_profiles: Mutex::new(HashSet::new()),
        }
    }
}

#[derive(Debug, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AcpLaunchRequest {
    pub profile_id: String,
    #[serde(default)]
    pub conversation_id: Option<String>,
    pub gateway: AcpGatewayConfig,
}

#[derive(Debug, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AcpGatewayConfig {
    pub provider_id: String,
    pub base_url: String,
    pub model: String,
    /// The Sub2API group's native wire family. This is metadata only: it never
    /// filters a model. Claude Code still speaks Anthropic Messages through the
    /// gateway, but non-Anthropic models must not receive Claude thinking
    /// parameters that their upstream adapter cannot translate.
    #[serde(default)]
    pub platform: Option<String>,
}

impl AcpLaunchRequest {
    fn validate(&self) -> Result<(), String> {
        profile_spec(&self.profile_id)?;
        for (name, value) in [
            ("provider_id", self.gateway.provider_id.as_str()),
            ("base_url", self.gateway.base_url.as_str()),
            ("model", self.gateway.model.as_str()),
        ] {
            if value.trim().is_empty() {
                return Err(format!("ACP gateway {name} is required"));
            }
        }
        Ok(())
    }
}

/// Untrusted frontend attachment payload for an ACP prompt. The consumer keeps
/// this shape deliberately narrow: no path, URI, command, or secret can cross
/// the bridge, only the selected attachment's display metadata and bytes.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AcpPromptAttachmentRequest {
    pub filename: String,
    pub mime: String,
    pub base64: String,
    pub extracted_text: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AcpPhase {
    Idle,
    Starting,
    Ready,
    Busy,
    Stopping,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AcpRuntimeAvailability {
    Available,
    CliNotFound,
    CliUnverified,
    AdapterNotFound,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct AcpRuntimeError {
    pub stage: String,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct AcpRuntimeInfo {
    pub profile_id: String,
    pub availability: AcpRuntimeAvailability,
    pub executable_path: Option<String>,
    pub cli_version: Option<String>,
    pub adapter_version: String,
    pub error: Option<AcpRuntimeError>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct AcpStatus {
    pub phase: AcpPhase,
    pub profile_id: Option<String>,
    pub runtime_info: Option<AcpRuntimeInfo>,
    pub last_error: Option<AcpRuntimeError>,
}

impl Default for AcpStatus {
    fn default() -> Self {
        Self {
            phase: AcpPhase::Idle,
            profile_id: None,
            runtime_info: None,
            last_error: None,
        }
    }
}

#[derive(serde::Serialize, Clone)]
struct AcpDiagnostic {
    stage: String,
    elapsed_ms: u64,
    outcome: String,
    code: Option<String>,
}

#[derive(Default)]
struct ConsumerInner {
    session: Option<ActiveSession>,
    active_epoch: Option<u64>,
    status: AcpStatus,
    first_turn_event_seen: bool,
    last_turn_activity: Option<Instant>,
    watchdog_cancel_requested_at: Option<Instant>,
}

impl ConsumerInner {
    fn begin_starting(&mut self, epoch: u64, profile_id: String, info: AcpRuntimeInfo) {
        self.active_epoch = Some(epoch);
        self.first_turn_event_seen = false;
        self.last_turn_activity = None;
        self.watchdog_cancel_requested_at = None;
        self.status = AcpStatus {
            phase: AcpPhase::Starting,
            profile_id: Some(profile_id),
            runtime_info: Some(info),
            last_error: None,
        };
    }

    fn begin_prompt(&mut self) -> Result<(), String> {
        match self.status.phase {
            AcpPhase::Ready => {
                self.status.phase = AcpPhase::Busy;
                self.first_turn_event_seen = false;
                self.last_turn_activity = Some(Instant::now());
                self.watchdog_cancel_requested_at = None;
                Ok(())
            }
            AcpPhase::Busy => Err("ACP runtime is busy".to_string()),
            _ => Err("ACP runtime is not ready".to_string()),
        }
    }

    fn apply_event(
        &mut self,
        epoch: u64,
        event: &AcpEvent,
        elapsed: Duration,
    ) -> Option<AcpDiagnostic> {
        if self.active_epoch != Some(epoch) {
            return None;
        }
        let elapsed_ms = elapsed.as_millis().min(u128::from(u64::MAX)) as u64;
        match event {
            AcpEvent::HandshakeStarted { stage } => Some(AcpDiagnostic {
                stage: handshake_stage(*stage).to_string(),
                elapsed_ms,
                outcome: "started".to_string(),
                code: None,
            }),
            AcpEvent::Ready { .. } => {
                self.status.phase = AcpPhase::Ready;
                self.status.last_error = None;
                self.last_turn_activity = None;
                self.watchdog_cancel_requested_at = None;
                Some(AcpDiagnostic {
                    stage: "ready".to_string(),
                    elapsed_ms,
                    outcome: "succeeded".to_string(),
                    code: None,
                })
            }
            AcpEvent::Error { kind } => {
                let (error, terminal) = event_error(kind);
                if terminal {
                    self.status.phase = AcpPhase::Error;
                    self.last_turn_activity = None;
                    self.watchdog_cancel_requested_at = None;
                }
                self.status.last_error = Some(error.clone());
                Some(AcpDiagnostic {
                    stage: error.stage,
                    elapsed_ms,
                    outcome: "failed".to_string(),
                    code: Some(error.code),
                })
            }
            AcpEvent::TurnEnded { .. } => {
                self.status.phase = AcpPhase::Ready;
                self.status.last_error = None;
                self.first_turn_event_seen = false;
                self.last_turn_activity = None;
                self.watchdog_cancel_requested_at = None;
                Some(AcpDiagnostic {
                    stage: "turn_ended".to_string(),
                    elapsed_ms,
                    outcome: "ended".to_string(),
                    code: None,
                })
            }
            AcpEvent::Exited { error } => {
                self.first_turn_event_seen = false;
                self.last_turn_activity = None;
                self.watchdog_cancel_requested_at = None;
                if let Some(message) = error {
                    let failure = runtime_error("driver", "driver_exited", message);
                    self.status.phase = AcpPhase::Error;
                    self.status.last_error = Some(failure.clone());
                    Some(AcpDiagnostic {
                        stage: "exit".to_string(),
                        elapsed_ms,
                        outcome: "failed".to_string(),
                        code: Some(failure.code),
                    })
                } else {
                    self.status.phase = AcpPhase::Idle;
                    self.status.profile_id = None;
                    self.status.last_error = None;
                    Some(AcpDiagnostic {
                        stage: "exit".to_string(),
                        elapsed_ms,
                        outcome: "stopped".to_string(),
                        code: None,
                    })
                }
            }
            event if is_turn_event(event) && self.status.phase == AcpPhase::Busy => {
                self.last_turn_activity = Some(Instant::now());
                if self.first_turn_event_seen {
                    None
                } else {
                    self.first_turn_event_seen = true;
                    Some(AcpDiagnostic {
                        stage: "first_event".to_string(),
                        elapsed_ms,
                        outcome: "observed".to_string(),
                        code: None,
                    })
                }
            }
            _ => None,
        }
    }

    /// Returns true exactly once when a busy turn has made no observable
    /// progress for the idle timeout. The caller sends protocol cancellation
    /// outside this mutex.
    fn request_watchdog_cancel(&mut self, now: Instant) -> bool {
        if self.status.phase != AcpPhase::Busy || self.watchdog_cancel_requested_at.is_some() {
            return false;
        }
        let Some(last_activity) = self.last_turn_activity else {
            return false;
        };
        if now.duration_since(last_activity) < PROMPT_IDLE_TIMEOUT {
            return false;
        }
        self.watchdog_cancel_requested_at = Some(now);
        true
    }

    /// After cancellation gets a short chance to produce turn-ended, the
    /// caller must terminate the owned driver/process tree and release the UI.
    fn force_watchdog_termination(&self, now: Instant) -> bool {
        self.status.phase == AcpPhase::Busy
            && self
                .watchdog_cancel_requested_at
                .is_some_and(|requested| now.duration_since(requested) >= PROMPT_CANCEL_GRACE)
    }
}

fn is_turn_event(event: &AcpEvent) -> bool {
    matches!(
        event,
        AcpEvent::AgentMessage { .. }
            | AcpEvent::AgentThought { .. }
            | AcpEvent::ToolCall(_)
            | AcpEvent::Plan(_)
            | AcpEvent::Usage(_)
            | AcpEvent::FileWritten { .. }
            | AcpEvent::Permission { .. }
            | AcpEvent::ExecApproval { .. }
    )
}

fn status_of(state: &AcpConsumerState) -> AcpStatus {
    state.inner.lock().unwrap().status.clone()
}

fn handshake_stage(stage: AcpHandshakeStage) -> &'static str {
    match stage {
        AcpHandshakeStage::Initialize => "initialize",
        AcpHandshakeStage::SessionNew => "session_new",
    }
}

fn event_error(kind: &AcpEventErrorKind) -> (AcpRuntimeError, bool) {
    match kind {
        AcpEventErrorKind::HandshakeTimeout { stage } => (
            runtime_error(
                handshake_stage(*stage),
                "handshake_timeout",
                "ACP handshake timed out",
            ),
            true,
        ),
        AcpEventErrorKind::HandshakeFailed { stage, message } => (
            runtime_error(handshake_stage(*stage), "handshake_failed", message),
            true,
        ),
        AcpEventErrorKind::PromptNotReady => (
            runtime_error("prompt", "not_ready", "ACP runtime is not ready"),
            false,
        ),
        AcpEventErrorKind::PromptBusy => (
            runtime_error("prompt", "busy", "ACP runtime is busy"),
            false,
        ),
        AcpEventErrorKind::PromptFailed { .. } => (
            runtime_error("prompt", "prompt_failed", "ACP prompt request failed"),
            true,
        ),
    }
}

fn runtime_error(stage: &str, code: &str, message: &str) -> AcpRuntimeError {
    AcpRuntimeError {
        stage: stage.to_string(),
        code: code.to_string(),
        message: sanitize_message(message),
    }
}

fn sanitize_message(message: &str) -> String {
    let normalized = message.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut chars = normalized.chars();
    let mut value = chars
        .by_ref()
        .take(MAX_DIAGNOSTIC_CHARS)
        .collect::<String>();
    if chars.next().is_some() {
        value.push_str("... [truncated]");
    }
    if value.is_empty() {
        "ACP runtime operation failed".to_string()
    } else {
        value
    }
}

struct ProfileSpec {
    id: &'static str,
    label: &'static str,
    adapter_version: &'static str,
    adapter_binary: &'static str,
}

fn profile_spec(profile_id: &str) -> Result<ProfileSpec, String> {
    match profile_id {
        CLAUDE_PROFILE_ID => Ok(ProfileSpec {
            id: CLAUDE_PROFILE_ID,
            label: "Claude Code",
            adapter_version: CLAUDE_ADAPTER_VERSION,
            adapter_binary: "claude-code-acp",
        }),
        CODEX_PROFILE_ID => Ok(ProfileSpec {
            id: CODEX_PROFILE_ID,
            label: "Codex",
            adapter_version: CODEX_ADAPTER_VERSION,
            adapter_binary: "codex-acp",
        }),
        _ => Err(format!(
            "unsupported ACP profile: {}",
            sanitize_message(profile_id)
        )),
    }
}

fn adapter_path(resource_root: &Path, profile_id: &str) -> Result<PathBuf, String> {
    let spec = profile_spec(profile_id)?;
    let binary = if cfg!(windows) {
        format!("{}.exe", spec.adapter_binary)
    } else {
        spec.adapter_binary.to_string()
    };
    Ok(resource_root.join(binary))
}

fn development_adapter_path(profile_id: &str) -> Result<PathBuf, String> {
    let spec = profile_spec(profile_id)?;
    let extension = if cfg!(windows) { ".exe" } else { "" };
    Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(format!(
            "{}-{}{extension}",
            spec.adapter_binary,
            target_triple()
        )))
}

fn target_triple() -> &'static str {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "x86_64-pc-windows-msvc"
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        "aarch64-pc-windows-msvc"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "x86_64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "aarch64-unknown-linux-gnu"
    } else {
        "unsupported-target"
    }
}

trait RuntimeProbeBackend {
    fn search_paths(&self) -> Vec<PathBuf>;
    fn is_file(&self, path: &Path) -> bool;
    fn cli_version(&self, path: &Path) -> Result<String, String>;
    fn resource_root(&self) -> PathBuf;
}

struct SystemProbeBackend {
    resource_root: PathBuf,
}

impl RuntimeProbeBackend for SystemProbeBackend {
    fn search_paths(&self) -> Vec<PathBuf> {
        let mut paths = std::env::var_os("PATH")
            .map(|value| std::env::split_paths(&value).collect::<Vec<_>>())
            .unwrap_or_default();
        #[cfg(windows)]
        if let Some(app_data) = std::env::var_os("APPDATA") {
            paths.push(PathBuf::from(app_data).join("npm"));
        }
        #[cfg(not(windows))]
        if let Some(home) = std::env::var_os("HOME") {
            paths.push(PathBuf::from(home).join(".local/bin"));
        }
        paths
    }

    fn is_file(&self, path: &Path) -> bool {
        path.is_file()
    }

    fn cli_version(&self, path: &Path) -> Result<String, String> {
        verify_cli_version(path)
    }

    fn resource_root(&self) -> PathBuf {
        self.resource_root.clone()
    }
}

#[derive(Clone)]
struct ResolvedRuntime {
    info: AcpRuntimeInfo,
    cli_path: PathBuf,
    adapter_path: PathBuf,
}

fn probe_runtime_with(
    profile_id: &str,
    backend: &dyn RuntimeProbeBackend,
) -> Result<ResolvedRuntime, String> {
    let spec = profile_spec(profile_id)?;
    let installed_adapter = adapter_path(&backend.resource_root(), profile_id)?;
    let development_adapter = development_adapter_path(profile_id)?;
    let adapter_path = if backend.is_file(&installed_adapter) {
        installed_adapter
    } else {
        development_adapter
    };
    let mut saw_candidate = false;
    let mut verified = None;
    // Installed builds carry a direct, app-private CLI for each built-in
    // profile. Prefer it before consulting PATH so a user's npm/global login
    // cannot change which runtime the app starts. Development builds may omit
    // this directory and continue through the host-path fallback below.
    for bundled in bundled_cli_candidates(&backend.resource_root(), profile_id) {
        if !backend.is_file(&bundled) || is_windows_apps_path(&bundled) {
            continue;
        }
        saw_candidate = true;
        if let Ok(version) = probe_cli_version_with_retries(|| backend.cli_version(&bundled)) {
            verified = Some((bundled, sanitize_version(&version)));
            break;
        }
    }
    if verified.is_none() {
    for directory in backend.search_paths() {
        if is_windows_apps_path(&directory) {
            continue;
        }
        for name in cli_names(profile_id) {
            let candidate = directory.join(name);
            if !backend.is_file(&candidate) {
                continue;
            }
            saw_candidate = true;
            let candidates = if profile_id == CODEX_PROFILE_ID {
                codex_executable_candidates(&candidate, backend)
            } else {
                vec![candidate]
            };
            for executable in candidates {
                if is_windows_apps_path(&executable) || !backend.is_file(&executable) {
                    continue;
                }
                if let Ok(version) =
                    probe_cli_version_with_retries(|| backend.cli_version(&executable))
                {
                    verified = Some((executable, sanitize_version(&version)));
                    break;
                }
            }
            if verified.is_some() {
                break;
            }
        }
        if verified.is_some() {
            break;
        }
    }
    }

    let (availability, cli_path, cli_version, error) = match verified {
        Some((path, version)) if !backend.is_file(&adapter_path) => (
            AcpRuntimeAvailability::AdapterNotFound,
            path,
            Some(version),
            Some(runtime_error(
                "adapter",
                "adapter_not_found",
                "Bundled ACP adapter is unavailable",
            )),
        ),
        Some((path, version)) => (AcpRuntimeAvailability::Available, path, Some(version), None),
        None if saw_candidate => (
            AcpRuntimeAvailability::CliUnverified,
            PathBuf::new(),
            None,
            Some(runtime_error(
                "cli_version",
                "cli_unverified",
                "ACP CLI version check failed",
            )),
        ),
        None => (
            AcpRuntimeAvailability::CliNotFound,
            PathBuf::new(),
            None,
            Some(runtime_error(
                "cli_discovery",
                "cli_not_found",
                "ACP CLI executable was not found",
            )),
        ),
    };
    let executable_path =
        (!cli_path.as_os_str().is_empty()).then(|| cli_path.to_string_lossy().to_string());
    Ok(ResolvedRuntime {
        info: AcpRuntimeInfo {
            profile_id: profile_id.to_string(),
            availability,
            executable_path,
            cli_version,
            adapter_version: spec.adapter_version.to_string(),
            error,
        },
        cli_path,
        adapter_path,
    })
}

fn bundled_cli_candidates(resource_root: &Path, profile_id: &str) -> Vec<PathBuf> {
    // The installed runtime directories are named after the ACP profile, but
    // their npm entry points use the actual CLI command name (claude/codex).
    // Keeping this mapping explicit prevents a profile id such as
    // `claude-code` from being turned into a non-existent `claude-code.cmd`.
    let cli_name = match profile_id {
        CLAUDE_PROFILE_ID => "claude",
        CODEX_PROFILE_ID => "codex",
        _ => profile_id,
    };
    let runtime_root = resource_root.join("acp-runtime").join(profile_id);
    #[cfg(windows)]
    let mut candidates = {
        let native_package = match profile_id {
            CLAUDE_PROFILE_ID => {
                let package = if cfg!(target_arch = "aarch64") {
                    "claude-code-win32-arm64"
                } else {
                    "claude-code-win32-x64"
                };
                runtime_root
                    .join("package/node_modules/@anthropic-ai")
                    .join(package)
                    .join("claude.exe")
            }
            CODEX_PROFILE_ID => {
                let package = if cfg!(target_arch = "aarch64") {
                    "codex-win32-arm64"
                } else {
                    "codex-win32-x64"
                };
                let triple = if cfg!(target_arch = "aarch64") {
                    "aarch64-pc-windows-msvc"
                } else {
                    "x86_64-pc-windows-msvc"
                };
                runtime_root
                    .join("package/node_modules/@openai")
                    .join(package)
                    .join("vendor")
                    .join(triple)
                    .join("bin/codex.exe")
            }
            _ => PathBuf::new(),
        };
        (!native_package.as_os_str().is_empty())
            .then_some(native_package)
            .into_iter()
            .collect::<Vec<_>>()
    };
    #[cfg(not(windows))]
    let mut candidates = Vec::new();
    let names: Vec<String> = if cfg!(windows) {
        // Release preparation emits a .cmd entry point around the private
        // Node runtime. Keep .exe first for a future native shim, then accept
        // the deterministic script without ever consulting the user's PATH.
        vec![format!("{cli_name}.exe"), format!("{cli_name}.cmd")]
    } else {
        vec![cli_name.to_string()]
    };
    candidates.extend(names.into_iter().flat_map(|name| {
        [runtime_root.join("bin").join(&name), runtime_root.join(&name)]
    }));
    candidates
}

fn cli_names(profile_id: &str) -> &'static [&'static str] {
    #[cfg(windows)]
    match profile_id {
        CLAUDE_PROFILE_ID => &["claude.exe", "claude"],
        CODEX_PROFILE_ID => &["codex.exe", "codex", "codex.cmd"],
        _ => &[],
    }
    #[cfg(not(windows))]
    match profile_id {
        CLAUDE_PROFILE_ID => &["claude"],
        CODEX_PROFILE_ID => &["codex"],
        _ => &[],
    }
}

fn is_windows_apps_path(path: &Path) -> bool {
    path.components().any(|component| {
        component
            .as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case("WindowsApps")
    })
}

fn codex_executable_candidates(
    candidate: &Path,
    backend: &dyn RuntimeProbeBackend,
) -> Vec<PathBuf> {
    if candidate.extension() != Some(OsStr::new("cmd")) {
        return vec![candidate.to_path_buf()];
    }
    let Some(npm_root) = candidate.parent() else {
        return vec![candidate.to_path_buf()];
    };
    let triple = if cfg!(target_arch = "aarch64") {
        "aarch64-pc-windows-msvc"
    } else {
        "x86_64-pc-windows-msvc"
    };
    let package = if cfg!(target_arch = "aarch64") {
        "codex-win32-arm64"
    } else {
        "codex-win32-x64"
    };
    let vendor = npm_root
        .join("node_modules/@openai/codex/node_modules/@openai")
        .join(package)
        .join("vendor")
        .join(triple)
        .join("bin/codex.exe");
    let legacy = npm_root
        .join("node_modules/@openai/codex/vendor")
        .join(triple)
        .join("bin/codex.exe");
    let mut candidates = [vendor, legacy]
        .into_iter()
        .filter(|path| backend.is_file(path))
        .collect::<Vec<_>>();
    candidates.push(candidate.to_path_buf());
    candidates
}

/// Windows npm shims can be cold for a few seconds while Node resolves their
/// real executable. A bounded retry absorbs that transient without masking a
/// genuinely missing or broken CLI.
fn probe_cli_version_with_retries<F>(mut check: F) -> Result<String, String>
where
    F: FnMut() -> Result<String, String>,
{
    let mut last_error = None;
    for attempt in 0..CLI_VERSION_PROBE_ATTEMPTS {
        match check() {
            Ok(version) => return Ok(version),
            Err(error) => {
                last_error = Some(error);
                if attempt + 1 < CLI_VERSION_PROBE_ATTEMPTS {
                    std::thread::sleep(CLI_VERSION_PROBE_RETRY_DELAY);
                }
            }
        }
    }
    Err(last_error.unwrap_or_else(|| "CLI version command failed".to_string()))
}

fn verify_cli_version(path: &Path) -> Result<String, String> {
    let mut command = if cfg!(windows) && path.extension() == Some(OsStr::new("cmd")) {
        let mut command = crate::runtime::quiet_command("cmd");
        command.arg("/D").arg("/C").arg(path).arg("--version");
        command
    } else {
        let mut command = crate::runtime::quiet_command(path);
        command.arg("--version");
        command
    };
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| "CLI version command could not start".to_string())?;
    let deadline = Instant::now() + CLI_VERSION_PROBE_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let output = child
                    .wait_with_output()
                    .map_err(|_| "CLI version output was unavailable".to_string())?;
                if !status.success() {
                    return Err("CLI version command failed".to_string());
                }
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                let version = if stdout.trim().is_empty() {
                    &stderr
                } else {
                    &stdout
                };
                let version = sanitize_version(version);
                if version.is_empty() {
                    return Err("CLI version was empty".to_string());
                }
                return Ok(version);
            }
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("CLI version command timed out".to_string());
            }
            Err(_) => return Err("CLI version command failed".to_string()),
        }
    }
}

fn sanitize_version(version: &str) -> String {
    version
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or_default()
        .trim()
        .chars()
        .take(128)
        .collect()
}

fn build_agent_profile(
    request: &AcpLaunchRequest,
    runtime: &ResolvedRuntime,
    api_key: &str,
    runtime_home: &Path,
    mcp_servers: Vec<AcpMcpServer>,
) -> Result<AcpAgentProfile, String> {
    request.validate()?;
    if runtime.info.availability != AcpRuntimeAvailability::Available {
        return Err("ACP runtime is unavailable".to_string());
    }
    let spec = profile_spec(&request.profile_id)?;
    let cli = runtime.cli_path.to_string_lossy().to_string();
    let env = match request.profile_id.as_str() {
        CLAUDE_PROFILE_ID => {
            claude_environment(request, api_key, cli, &runtime_home.join(".claude"))
        }
        CODEX_PROFILE_ID => codex_environment(request, api_key, cli, &runtime_home.join(".codex")),
        _ => unreachable!("validated profile"),
    };
    for (name, _) in &env {
        crate::secret_store::validate_acp_env_name(name)?;
    }
    Ok(AcpAgentProfile {
        id: spec.id.to_string(),
        label: spec.label.to_string(),
        command: runtime.adapter_path.to_string_lossy().to_string(),
        args: Vec::new(),
        env,
        env_remove: conflicting_parent_environment(&request.profile_id),
        session_meta: (request.profile_id == CLAUDE_PROFILE_ID).then(claude_session_meta),
        mcp_servers,
    })
}

fn acp_runtime_home(app: &AppHandle, profile_id: &str) -> Result<PathBuf, String> {
    profile_spec(profile_id)?;
    let workspace = crate::runtime::workspace_dir(app)?;
    crate::runtime::initialize_project_runtime_dirs(&workspace)?;
    Ok(workspace)
}

fn prepare_runtime_layout(runtime_home: &Path, profile_id: &str) -> Result<(), String> {
    profile_spec(profile_id)?;
    for directory in [
        runtime_home.join(".opencode"),
        runtime_home.join(if profile_id == CLAUDE_PROFILE_ID {
            ".claude"
        } else {
            ".codex"
        }),
        acp_skill_directory(runtime_home, profile_id)?,
    ] {
        std::fs::create_dir_all(&directory)
            .map_err(|error| format!("failed to prepare isolated ACP runtime home: {error}"))?;
    }
    Ok(())
}

/// Claude Code and Codex discover global skills under their isolated config
/// homes. Keeping the pack in a sibling directory lets the UI list it, but the
/// actual engine never sees it, so always deploy to this engine-owned path.
fn acp_skill_directory(runtime_home: &Path, profile_id: &str) -> Result<PathBuf, String> {
    let config_dir = match profile_id {
        CLAUDE_PROFILE_ID => ".claude",
        CODEX_PROFILE_ID => ".codex",
        _ => return Err(format!("unsupported ACP runtime: {profile_id}")),
    };
    Ok(runtime_home.join(config_dir).join("skills"))
}

/// Resolve the active project root used by one ACP session. This deliberately
/// accepts no renderer input: the native workspace selection is the sole
/// authority for ACP filesystem and terminal access.
fn acp_session_workspace(workspace: &Path) -> Result<PathBuf, String> {
    let canonical = workspace
        .canonicalize()
        .map_err(|error| format!("could not resolve active project directory: {error}"))?;
    if !canonical.is_dir() {
        return Err("active project directory does not exist".to_string());
    }
    Ok(canonical)
}

/// Prepare app-owned ACP tooling once per selected runtime. This syncs bundled
/// scientific skills and reads only the vetted, locally installed science MCP
/// descriptors; it never accepts commands, keys, or config from the frontend.
async fn prepare_environment(
    app: &AppHandle,
    state: &AcpConsumerState,
    profile_id: &str,
) -> Result<(), String> {
    profile_spec(profile_id)?;
    let workspace = crate::runtime::workspace_dir(app)?;
    let preparation_key = format!("{}::{}", profile_id, workspace.to_string_lossy());
    if state.prepared_profiles.lock().unwrap().contains(&preparation_key) {
        return Ok(());
    }
    let runtime_home = acp_runtime_home(app, profile_id)?;
    prepare_runtime_layout(&runtime_home, profile_id)?;
    crate::runtime::deploy_bundled_skills_for_acp(
        app,
        &acp_skill_directory(&runtime_home, profile_id)?,
        &runtime_home.join(".zerowall").join("skills-store"),
    )?;
    // MCP provisioning is independent from ACP readiness. Probe descriptors
    // opportunistically and let the supervisor retry failed servers later.
    let _ = managed_mcp_servers(app);
    state.prepared_profiles.lock().unwrap().insert(preparation_key);
    Ok(())
}

/// Every ACP session receives only host-owned descriptors. Jupyter is optional
/// and joins only after its managed environment and localhost server are ready.
fn managed_mcp_servers(app: &AppHandle) -> Result<Vec<AcpMcpServer>, String> {
    let mut servers = crate::science_mcp::acp_mcp_servers(app)?;
    if let Some(jupyter) = crate::jupyter::acp_mcp_server(app) {
        servers.push(jupyter);
    }
    Ok(servers)
}

#[tauri::command]
pub async fn acp_prepare_environment(
    app: AppHandle,
    state: State<'_, AcpConsumerState>,
    profile_id: String,
) -> Result<(), String> {
    prepare_environment(&app, &state, &profile_id).await
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AcpSkillInfo {
    pub name: String,
    pub description: String,
    pub location: String,
    pub sha256: String,
}

/// Enumerate the app-owned skills copied into an ACP runtime home. ACP does
/// not expose a skill-discovery request, so this makes the real loaded set
/// visible without querying or starting OpenCode.
#[tauri::command]
pub fn acp_list_skills(app: AppHandle, profile_id: String) -> Result<Vec<AcpSkillInfo>, String> {
    profile_spec(&profile_id)?;
    let root = crate::runtime::workspace_dir(&app)?;
    let root = acp_skill_directory(&root, &profile_id)?;
    let mut skills = Vec::new();
    collect_acp_skills(&root, &mut skills)?;
    skills.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(skills)
}

fn collect_acp_skills(root: &Path, skills: &mut Vec<AcpSkillInfo>) -> Result<(), String> {
    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("failed to read ACP skills: {error}")),
    };
    for entry in entries {
        let entry = entry.map_err(|error| format!("failed to read ACP skill entry: {error}"))?;
        let path = entry.path();
        if path.is_dir() {
            collect_acp_skills(&path, skills)?;
            continue;
        }
        if entry.file_name() != OsStr::new("SKILL.md") {
            continue;
        }
        let source = std::fs::read_to_string(&path)
            .map_err(|error| format!("failed to read ACP skill metadata: {error}"))?;
        let fallback = path
            .parent()
            .and_then(Path::file_name)
            .and_then(OsStr::to_str)
            .unwrap_or("skill");
        let (name, description) = acp_skill_metadata(&source, fallback);
        let mut digest = Sha256::new();
        digest.update(source.as_bytes());
        let sha256 = digest
            .finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        skills.push(AcpSkillInfo {
            name,
            description,
            location: path.to_string_lossy().to_string(),
            sha256,
        });
    }
    Ok(())
}

fn acp_skill_metadata(source: &str, fallback: &str) -> (String, String) {
    let header = source
        .strip_prefix("---")
        .and_then(|rest| rest.split_once("\n---").map(|(header, _)| header))
        .unwrap_or_default();
    let field = |name: &str| {
        header.lines().find_map(|line| {
            let value = line.strip_prefix(name)?.trim();
            Some(value.trim_matches(['\"', '\'']).to_string())
        })
    };
    let name = field("name:")
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.to_string());
    let description =
        field("description:").unwrap_or_else(|| "Bundled ZeroWall Science skill".to_string());
    (name, description)
}

fn claude_environment(
    request: &AcpLaunchRequest,
    api_key: &str,
    cli: String,
    claude_config_dir: &Path,
) -> Vec<(String, String)> {
    let model = request.gateway.model.trim().to_string();
    let base_url = anthropic_root(&request.gateway.base_url);
    let platform = request
        .gateway
        .platform
        .as_deref()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    // Claude Code's ACP adapter forwards MAX_THINKING_TOKENS to the official
    // SDK. A gateway may expose an OpenAI-compatible group through the
    // Anthropic Messages facade, but DeepSeek/Kimi/GPT backends commonly reject
    // the `thinking` parameter. Zero explicitly omits it for those groups while
    // preserving normal thinking for Anthropic models. Older descriptors without
    // platform metadata fall back to the model family, so upgrades are safe.
    let anthropic_model = platform == "anthropic"
        || (platform.is_empty() && model.to_ascii_lowercase().starts_with("claude"));
    let mut env = vec![
        ("CLAUDE_CODE_EXECUTABLE".to_string(), cli),
        (
            "CLAUDE_CONFIG_DIR".to_string(),
            claude_config_dir.to_string_lossy().to_string(),
        ),
        ("ANTHROPIC_BASE_URL".to_string(), base_url),
        ("ANTHROPIC_API_KEY".to_string(), api_key.to_string()),
        ("ANTHROPIC_AUTH_TOKEN".to_string(), api_key.to_string()),
        ("ANTHROPIC_MODEL".to_string(), model.clone()),
        ("ANTHROPIC_DEFAULT_SONNET_MODEL".to_string(), model.clone()),
        ("ANTHROPIC_DEFAULT_OPUS_MODEL".to_string(), model.clone()),
        ("ANTHROPIC_DEFAULT_HAIKU_MODEL".to_string(), model),
        // A non-first-party gateway cannot reliably handle deferred
        // tool_reference blocks. Load the app-owned MCP tools directly so all
        // runtimes see the same tools without waiting on tool search.
        ("ENABLE_TOOL_SEARCH".to_string(), "false".to_string()),
        // MCP calls are third-party network/process operations. Bound both
        // their total duration and silent idle period so one connector cannot
        // hold the ACP turn forever. The user can still cancel sooner.
        ("MCP_TOOL_TIMEOUT".to_string(), "120000".to_string()),
        ("MCP_TIMEOUT".to_string(), "120000".to_string()),
        ("MCP_CONNECT_TIMEOUT_MS".to_string(), "10000".to_string()),
        (
            "CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT".to_string(),
            "120000".to_string(),
        ),
    ];
    if !anthropic_model {
        env.push(("MAX_THINKING_TOKENS".to_string(), "0".to_string()));
    }
    env
}

fn conflicting_parent_environment(profile_id: &str) -> Vec<String> {
    let names: &[&str] = match profile_id {
        CLAUDE_PROFILE_ID => &[
            "CLAUDE_CODE_OAUTH_TOKEN",
            "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR",
            "CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR",
            "CLAUDE_CODE_HOST_AUTH_ENV_VAR",
            "CLAUDE_CODE_HOST_CREDS_FILE",
            "CLAUDE_CODE_SESSION_ACCESS_TOKEN",
            "CLAUDE_CODE_OAUTH_REFRESH_TOKEN",
            "CCR_OAUTH_TOKEN_FILE",
            "CLAUDE_CODE_USE_BEDROCK",
            "CLAUDE_CODE_USE_VERTEX",
            "CLAUDE_CODE_USE_FOUNDRY",
            "ANTHROPIC_BEDROCK_BASE_URL",
            "ANTHROPIC_VERTEX_BASE_URL",
            "ANTHROPIC_FOUNDRY_BASE_URL",
            "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY",
            "AWS_SESSION_TOKEN",
            "AWS_BEARER_TOKEN_BEDROCK",
            "AWS_PROFILE",
            "AWS_REGION",
            "AWS_DEFAULT_REGION",
            "GOOGLE_APPLICATION_CREDENTIALS",
            "ANTHROPIC_VERTEX_PROJECT_ID",
            "CLOUD_ML_REGION",
            "ANTHROPIC_FOUNDRY_RESOURCE",
            "ANTHROPIC_FOUNDRY_API_KEY",
            "ANTHROPIC_FOUNDRY_AUTH_TOKEN",
            "ANTHROPIC_AWS_API_KEY",
            "ANTHROPIC_PROFILE",
            "ANTHROPIC_CUSTOM_HEADERS",
            "ANTHROPIC_API_KEY_HELPER",
            "CLAUDE_CODE_ENABLE_PROXY_AUTH_HELPER",
            "AGENT_PROXY_AUTH_TOKEN",
        ],
        CODEX_PROFILE_ID => &[
            "OPENAI_API_KEY",
            "OPENAI_BASE_URL",
            "OPENAI_ORG_ID",
            "OPENAI_ORGANIZATION",
            "CHATGPT_AUTH_TOKEN",
            "CODEX_AUTH_TOKEN",
        ],
        _ => &[],
    };
    names.iter().map(|name| (*name).to_string()).collect()
}

fn claude_session_meta() -> serde_json::Map<String, serde_json::Value> {
    serde_json::json!({
        "claudeCode": {
            "options": {
                "settingSources": [],
                "extraArgs": {
                    "bare": null,
                    "no-session-persistence": null,
                }
            }
        }
    })
    .as_object()
    .expect("Claude ACP session metadata is an object")
    .clone()
}

fn anthropic_root(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    trimmed
        .strip_suffix("/v1")
        .unwrap_or(trimmed)
        .trim_end_matches('/')
        .to_string()
}

fn codex_environment(
    request: &AcpLaunchRequest,
    api_key: &str,
    cli: String,
    codex_home: &Path,
) -> Vec<(String, String)> {
    let config = serde_json::json!({
        "model": request.gateway.model.trim(),
        "model_provider": "zerowall-sub2api",
        "model_providers": {
            "zerowall-sub2api": {
                "name": "ZeroWall Sub2API",
                "base_url": request.gateway.base_url.trim(),
                "wire_api": "responses",
                "env_key": "CODEX_API_KEY",
                "requires_openai_auth": false,
            }
        }
    })
    .to_string();
    vec![
        ("CODEX_PATH".to_string(), cli),
        ("CODEX_API_KEY".to_string(), api_key.to_string()),
        ("MODEL_PROVIDER".to_string(), "zerowall-sub2api".to_string()),
        (
            "CODEX_HOME".to_string(),
            codex_home.to_string_lossy().to_string(),
        ),
        ("CODEX_CONFIG".to_string(), config),
    ]
}

/// Codex ACP calls `account/read` before it forwards `CODEX_CONFIG` into its
/// first `thread/start`. Put the same non-secret provider settings in the
/// isolated home upfront so preflight does not request a ChatGPT/OpenAI login.
fn write_codex_gateway_config(request: &AcpLaunchRequest, codex_home: &Path) -> Result<(), String> {
    let quote = |value: &str| serde_json::to_string(value).expect("string JSON serialization");
    let config = format!(
        "model = {model}\nmodel_provider = \"zerowall-sub2api\"\n\n[model_providers.zerowall-sub2api]\nname = \"ZeroWall Sub2API\"\nbase_url = {base_url}\nwire_api = \"responses\"\nenv_key = \"CODEX_API_KEY\"\nrequires_openai_auth = false\n\n[mcp_servers.biomcp]\nstartup_timeout_sec = 120\n[mcp_servers.spaceweather]\nstartup_timeout_sec = 120\n[mcp_servers.paper-search]\nstartup_timeout_sec = 120\n[mcp_servers.open-meteo]\nstartup_timeout_sec = 120\n",
        model = quote(request.gateway.model.trim()),
        base_url = quote(request.gateway.base_url.trim()),
    );
    std::fs::write(codex_home.join("config.toml"), config)
        .map_err(|error| format!("failed to write isolated Codex gateway config: {error}"))
}

#[tauri::command]
pub fn acp_status(state: State<'_, AcpConsumerState>) -> AcpStatus {
    status_of(&state)
}

#[tauri::command]
pub async fn acp_probe_runtime(
    app: AppHandle,
    profile_id: String,
) -> Result<AcpRuntimeInfo, String> {
    Ok(probe_for_app(&app, &profile_id).await?.info)
}

#[tauri::command]
pub async fn acp_launch(
    app: AppHandle,
    state: State<'_, AcpConsumerState>,
    request: AcpLaunchRequest,
) -> Result<AcpStatus, String> {
    request.validate()?;
    // The conversation id is owned by the frontend project/session store; the
    // native adapter session remains an implementation detail.
    let _conversation_id = request.conversation_id.as_deref();

    // A launch during desktop restore may be the first ACP action in this app
    // process. Runtime switching invokes this explicitly before teardown; a
    // model change reaches here with a prepared profile and is a no-op.
    prepare_environment(&app, &state, &request.profile_id).await?;

    // Probe and authenticate before touching the active session. A failed
    // switch therefore leaves the old runtime untouched.
    let runtime = probe_for_app(&app, &request.profile_id).await?;
    if runtime.info.availability != AcpRuntimeAvailability::Available {
        return Err(runtime
            .info
            .error
            .as_ref()
            .map(|error| error.message.clone())
            .unwrap_or_else(|| "ACP runtime is unavailable".to_string()));
    }
    let api_key = crate::secret_store::provider_api_key(&app, &request.gateway.provider_id)?
        .filter(|key| !key.trim().is_empty())
        .ok_or_else(|| "ACP gateway provider key is missing".to_string())?;
    let runtime_home = acp_runtime_home(&app, &request.profile_id)?;
    prepare_runtime_layout(&runtime_home, &request.profile_id)?;
    // Runtime configuration stays app-private, but the ACP session itself must
    // be rooted at the selected project so agent reads and terminal commands
    // operate on exactly the folder shown by the UI.
    let cwd = acp_session_workspace(&crate::runtime::workspace_dir(&app)?)?;
    if request.profile_id == CODEX_PROFILE_ID {
        write_codex_gateway_config(&request, &runtime_home.join(".codex"))?;
    }
    let mcp_servers = managed_mcp_servers(&app)?;
    let profile = build_agent_profile(
        &request,
        &runtime,
        &api_key,
        &runtime_home,
        mcp_servers.clone(),
    )?;

    let _lifecycle = state.lifecycle.lock().await;
    stop_active(&app, &state).await;

    let epoch = state.next_epoch.fetch_add(1, Ordering::Relaxed);
    {
        let mut inner = state.inner.lock().unwrap();
        inner.begin_starting(epoch, request.profile_id.clone(), runtime.info.clone());
    }
    emit_state(&app, &state);
    emit_diagnostic(
        &app,
        AcpDiagnostic {
            stage: "adapter".to_string(),
            elapsed_ms: 0,
            outcome: "started".to_string(),
            code: None,
        },
    );

    let (client, events, driver) = AcpClient::launch(&profile, cwd.clone());
    let driver = tauri::async_runtime::spawn(driver);
    {
        let mut inner = state.inner.lock().unwrap();
        if inner.active_epoch != Some(epoch) {
            let _ = client.shutdown();
            driver.abort();
            return Err("ACP launch was superseded".to_string());
        }
        inner.session = Some(ActiveSession {
            epoch,
            client,
            driver,
        });
    }
    let (ready_tx, ready_rx) = oneshot::channel::<Result<(), String>>();
    pump_events(
        app.clone(),
        events,
        epoch,
        cwd,
        Instant::now(),
        Some(ready_tx),
    );

    await_launch_ready(_lifecycle, ready_rx).await?;
    for server in mcp_servers {
        let _ = app.emit(
            "acp:mcp-state",
            AcpMcpServerInfo {
                name: server.name,
                status: "deferred".to_string(),
                command: server.command,
                args: server.args,
            },
        );
    }
    Ok(status_of(&state))
}

async fn await_launch_ready(
    lifecycle: tokio::sync::MutexGuard<'_, ()>,
    ready_rx: oneshot::Receiver<Result<(), String>>,
) -> Result<(), String> {
    drop(lifecycle);
    ready_rx
        .await
        .map_err(|_| "ACP driver exited before reporting readiness".to_string())?
}

#[tauri::command]
pub fn acp_prompt(
    app: AppHandle,
    state: State<'_, AcpConsumerState>,
    text: String,
    attachments: Option<Vec<AcpPromptAttachmentRequest>>,
) -> Result<(), String> {
    let text = acp_prompt_with_host_context(text, &crate::runtime::workspace_dir(&app)?);
    let attachments = attachments
        .unwrap_or_default()
        .into_iter()
        .map(|attachment| PromptAttachment {
            filename: attachment.filename,
            mime: attachment.mime,
            base64: attachment.base64,
            extracted_text: attachment.extracted_text,
        })
        .collect();
    let result = {
        let mut inner = state.inner.lock().unwrap();
        inner.begin_prompt()?;
        let session = inner
            .session
            .as_ref()
            .ok_or_else(|| "no active ACP session".to_string())?;
        session
            .client
            .prompt_with_attachments(text, attachments)
            .map_err(|error| error.to_string())
    };
    if result.is_err() {
        let mut inner = state.inner.lock().unwrap();
        inner.status.phase = AcpPhase::Error;
        inner.status.last_error = Some(runtime_error(
            "prompt",
            "prompt_send_failed",
            "ACP prompt could not be sent",
        ));
    }
    emit_state(&app, &state);
    if result.is_ok() {
        emit_diagnostic(
            &app,
            AcpDiagnostic {
                stage: "prompt".to_string(),
                elapsed_ms: 0,
                outcome: "started".to_string(),
                code: None,
            },
        );
        if let Some(epoch) = state.inner.lock().unwrap().active_epoch {
            spawn_prompt_watchdog(app.clone(), epoch);
        }
    }
    result
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AcpMcpServerInfo {
    pub name: String,
    pub status: String,
    pub command: String,
    pub args: Vec<String>,
}

/// Return host-vetted MCP descriptors without exposing environment values.
/// Descriptor discovery is read-only and never starts a server.
#[tauri::command]
pub fn acp_list_mcp_servers(app: AppHandle) -> Result<Vec<AcpMcpServerInfo>, String> {
    Ok(managed_mcp_servers(&app)?
        .into_iter()
        .map(|server| AcpMcpServerInfo {
            name: server.name,
            status: "deferred".to_string(),
            command: server.command,
            args: server.args,
        })
        .collect())
}

/// Change the model in the current ACP session. This command deliberately does
/// not acquire the lifecycle mutex and never calls launch/prepare/stop: model
/// selection is a session operation, not a runtime switch.
#[tauri::command]
pub async fn acp_set_model(
    app: AppHandle,
    state: State<'_, AcpConsumerState>,
    model: String,
) -> Result<(), String> {
    let client = {
        let inner = state.inner.lock().unwrap();
        if inner.status.phase != AcpPhase::Ready {
            return Err(match inner.status.phase {
                AcpPhase::Busy => "ACP runtime is busy".to_string(),
                _ => "ACP runtime is not ready".to_string(),
            });
        }
        inner
            .session
            .as_ref()
            .ok_or_else(|| "no active ACP session".to_string())?
            .client
            .clone()
    };
    client.set_model(model).await.map_err(|error| error.to_string())?;
    emit_diagnostic(
        &app,
        AcpDiagnostic {
            stage: "model_switch".to_string(),
            elapsed_ms: 0,
            outcome: "switched".to_string(),
            code: None,
        },
    );
    Ok(())
}

/// The ACP protocol has no portable per-request deadline. Watch the event
/// stream instead: active generation/tool work continuously refreshes
/// `last_turn_activity`; a completely silent turn is cancelled, then its owned
/// process tree is terminated after a short grace period.
fn spawn_prompt_watchdog(app: AppHandle, epoch: u64) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(PROMPT_WATCHDOG_POLL).await;
            let state = app.state::<AcpConsumerState>();
            let cancel_requested = {
                let mut inner = state.inner.lock().unwrap();
                if inner.active_epoch != Some(epoch) || inner.status.phase != AcpPhase::Busy {
                    return;
                }
                // Manual approval is intentional idle time, not a stalled
                // agent. Keep the watchdog armed for real protocol silence but
                // refresh it while the user can still answer a pending request.
                if !state.pending.lock().unwrap().is_empty()
                    || !state.pending_exec.lock().unwrap().is_empty()
                {
                    inner.last_turn_activity = Some(Instant::now());
                    false
                } else if inner.request_watchdog_cancel(Instant::now()) {
                    inner
                        .session
                        .as_ref()
                        .map(|session| session.client.cancel().is_ok())
                        .unwrap_or(false)
                } else {
                    false
                }
            };
            if cancel_requested {
                emit_diagnostic(
                    &app,
                    AcpDiagnostic {
                        stage: "prompt".to_string(),
                        elapsed_ms: PROMPT_IDLE_TIMEOUT.as_millis() as u64,
                        outcome: "cancelled_for_inactivity".to_string(),
                        code: Some("prompt_idle_timeout".to_string()),
                    },
                );
                continue;
            }
            let force = {
                let inner = state.inner.lock().unwrap();
                inner.active_epoch == Some(epoch) && inner.force_watchdog_termination(Instant::now())
            };
            if force {
                terminate_stalled_prompt(&app, &state, epoch).await;
                return;
            }
        }
    });
}

async fn terminate_stalled_prompt(app: &AppHandle, state: &AcpConsumerState, epoch: u64) {
    let _lifecycle = state.lifecycle.lock().await;
    let session = {
        let mut inner = state.inner.lock().unwrap();
        if inner.active_epoch != Some(epoch) || !inner.force_watchdog_termination(Instant::now()) {
            return;
        }
        let session = inner.session.take();
        inner.active_epoch = None;
        inner.first_turn_event_seen = false;
        inner.last_turn_activity = None;
        inner.watchdog_cancel_requested_at = None;
        inner.status.phase = AcpPhase::Error;
        inner.status.last_error = Some(runtime_error(
            "prompt",
            "prompt_idle_timeout",
            "ACP turn stopped after no activity; retry the message",
        ));
        session
    };
    let Some(mut session) = session else {
        return;
    };
    let _ = session.client.shutdown();
    if tokio::time::timeout(DRIVER_SHUTDOWN_TIMEOUT, &mut session.driver)
        .await
        .is_err()
    {
        session.driver.abort();
        let _ = session.driver.await;
    }
    state.pending.lock().unwrap().clear();
    state.pending_exec.lock().unwrap().clear();
    emit_state(app, state);
    emit_diagnostic(
        app,
        AcpDiagnostic {
            stage: "prompt".to_string(),
            elapsed_ms: (PROMPT_IDLE_TIMEOUT + PROMPT_CANCEL_GRACE).as_millis() as u64,
            outcome: "forced_stop".to_string(),
            code: Some("prompt_idle_timeout".to_string()),
        },
    );
}

/// ACP has no portable system-prompt field. Add only host facts that affect
/// tool execution to each user turn, without letting renderer input choose a
/// filesystem root. This is intentionally a directive rather than a shell
/// command conversion: translated commands can change semantics or quotes.
fn acp_prompt_with_host_context(text: String, workspace: &Path) -> String {
    #[cfg(windows)]
    {
        format!(
            "[ZeroWall host execution context — mandatory]\n\
             This is a Windows host. The selected project root is: {}\n\
             For terminal work, use PowerShell (for example `powershell.exe -NoProfile -Command ...`) and Windows paths.\n\
             do not use POSIX shell commands or POSIX-only flags such as `find -maxdepth`, `head`, `sed`, or `grep`; use PowerShell equivalents such as Get-ChildItem, Get-Content, and Select-String.\n\
             Work only inside the selected project root.\n\n\
             [User request]\n{}",
            workspace.display(),
            text
        )
    }
    #[cfg(not(windows))]
    {
        let _ = workspace;
        text
    }
}

#[tauri::command]
pub fn acp_cancel(app: AppHandle, state: State<'_, AcpConsumerState>) -> Result<(), String> {
    let result = {
        let inner = state.inner.lock().unwrap();
        if inner.status.phase != AcpPhase::Busy {
            return Err("ACP runtime is not busy".to_string());
        }
        let session = inner
            .session
            .as_ref()
            .ok_or_else(|| "no active ACP session".to_string())?;
        session.client.cancel().map_err(|error| error.to_string())
    };
    if result.is_ok() {
        emit_diagnostic(
            &app,
            AcpDiagnostic {
                stage: "cancel".to_string(),
                elapsed_ms: 0,
                outcome: "requested".to_string(),
                code: None,
            },
        );
    }
    result
}

#[tauri::command]
pub async fn acp_shutdown(
    app: AppHandle,
    state: State<'_, AcpConsumerState>,
) -> Result<AcpStatus, String> {
    let _lifecycle = state.lifecycle.lock().await;
    stop_active(&app, &state).await;
    Ok(status_of(&state))
}

async fn probe_for_app(_app: &AppHandle, profile_id: &str) -> Result<ResolvedRuntime, String> {
    let resource_root = std::env::current_exe()
        .map_err(|error| format!("failed to resolve application executable: {error}"))?
        .parent()
        .ok_or_else(|| "failed to resolve application executable directory".to_string())?
        .to_path_buf();
    let profile_id = profile_id.to_string();
    tokio::task::spawn_blocking(move || {
        probe_runtime_with(&profile_id, &SystemProbeBackend { resource_root })
    })
    .await
    .map_err(|_| "ACP runtime probe task failed".to_string())?
}

/// Answer a pending permission request. `option_id = None` rejects (fail-closed
/// in the crate). Unknown ids are ignored (the request already timed out or the
/// session ended).
#[tauri::command]
pub fn acp_reply_permission(
    state: State<'_, AcpConsumerState>,
    permission_id: u64,
    option_id: Option<String>,
) -> Result<(), String> {
    if let Some(reply) = state.pending.lock().unwrap().remove(&permission_id) {
        // The receiver may be gone if the turn was cancelled meanwhile; ignore.
        let _ = reply.send(option_id);
    }
    Ok(())
}

/// Answer a pending command-execution approval. `allow = false` (or an unknown
/// id) rejects; the crate fails the `terminal/create` closed so the command is
/// never spawned.
#[tauri::command]
pub fn acp_reply_exec(
    state: State<'_, AcpConsumerState>,
    exec_id: u64,
    allow: bool,
) -> Result<(), String> {
    if let Some(reply) = state.pending_exec.lock().unwrap().remove(&exec_id) {
        let _ = reply.send(allow);
    }
    Ok(())
}

async fn stop_active(app: &AppHandle, state: &AcpConsumerState) {
    let session = {
        let mut inner = state.inner.lock().unwrap();
        let session = inner.session.take();
        if session.is_some() {
            inner.status.phase = AcpPhase::Stopping;
            inner.active_epoch = None;
        }
        session
    };
    let Some(mut session) = session else {
        return;
    };
    emit_state(app, state);
    let _ = session.client.shutdown();
    let timed_out = tokio::time::timeout(DRIVER_SHUTDOWN_TIMEOUT, &mut session.driver)
        .await
        .is_err();
    if timed_out {
        session.driver.abort();
        let _ = session.driver.await;
        emit_diagnostic(
            app,
            AcpDiagnostic {
                stage: "shutdown".to_string(),
                elapsed_ms: DRIVER_SHUTDOWN_TIMEOUT.as_millis() as u64,
                outcome: "forced".to_string(),
                code: Some("driver_shutdown_timeout".to_string()),
            },
        );
    }
    state.pending.lock().unwrap().clear();
    state.pending_exec.lock().unwrap().clear();
    {
        let mut inner = state.inner.lock().unwrap();
        inner.status.phase = AcpPhase::Idle;
        inner.status.profile_id = None;
        inner.status.last_error = None;
    }
    emit_state(app, state);
}

pub fn kill_acp(state: &AcpConsumerState) {
    if let Some(session) = state.inner.lock().unwrap().session.take() {
        let _ = session.client.shutdown();
        session.driver.abort();
    }
    state.pending.lock().unwrap().clear();
    state.pending_exec.lock().unwrap().clear();
}

fn emit_state(app: &AppHandle, state: &AcpConsumerState) {
    let _ = app.emit("acp:state", status_of(state));
}

fn format_diagnostic(diagnostic: &AcpDiagnostic) -> String {
    format!(
        "[acp] stage={} elapsed_ms={} outcome={} code={}",
        diagnostic.stage,
        diagnostic.elapsed_ms,
        diagnostic.outcome,
        diagnostic.code.as_deref().unwrap_or("none")
    )
}

fn stderr_log_line(message: &str) -> Option<String> {
    const MARKER: &str = "ACP stderr tail:";
    const MAX_TAIL_BYTES: usize = 4 * 1024;
    let (_, tail) = message.split_once(MARKER)?;
    let tail = tail.trim();
    if tail.is_empty() {
        return None;
    }
    let start = tail.len().saturating_sub(MAX_TAIL_BYTES);
    let mut start = start;
    while !tail.is_char_boundary(start) {
        start += 1;
    }
    Some(format!("[acp stderr] {}", &tail[start..]))
}

fn event_stderr_log_line(event: &AcpEvent) -> Option<String> {
    let message = match event {
        AcpEvent::Error {
            kind:
                AcpEventErrorKind::HandshakeFailed { message, .. }
                | AcpEventErrorKind::PromptFailed { message },
        } => message.as_str(),
        AcpEvent::Exited {
            error: Some(message),
        } => message.as_str(),
        _ => return None,
    };
    stderr_log_line(message)
}

fn emit_diagnostic(app: &AppHandle, diagnostic: AcpDiagnostic) {
    crate::debug_log::append(app, &format_diagnostic(&diagnostic));
    let _ = app.emit("acp:diagnostic", diagnostic);
}

#[derive(serde::Serialize, Clone)]
struct MessagePayload {
    message_id: Option<String>,
    text: String,
}

#[derive(serde::Serialize, Clone)]
struct UsagePayload {
    used: u64,
    size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    token_usage: Option<TokenUsagePayload>,
}

#[derive(serde::Serialize, Clone)]
struct TokenUsagePayload {
    total_tokens: u64,
    input_tokens: u64,
    output_tokens: u64,
    thought_tokens: u64,
    cached_read_tokens: u64,
    cached_write_tokens: u64,
}

impl From<AcpTokenUsage> for TokenUsagePayload {
    fn from(usage: AcpTokenUsage) -> Self {
        Self {
            total_tokens: usage.total_tokens,
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            thought_tokens: usage.thought_tokens,
            cached_read_tokens: usage.cached_read_tokens,
            cached_write_tokens: usage.cached_write_tokens,
        }
    }
}

#[derive(serde::Serialize, Clone)]
struct TurnEndedPayload {
    stop_reason: String,
    usage: Option<TokenUsagePayload>,
}

#[derive(serde::Serialize, Clone)]
struct PermissionOptionPayload {
    option_id: String,
    name: String,
}

#[derive(serde::Serialize, Clone)]
struct PermissionPayload {
    permission_id: u64,
    request: serde_json::Value,
    options: Vec<PermissionOptionPayload>,
}

#[derive(serde::Serialize, Clone)]
struct ExecApprovalPayload {
    exec_id: u64,
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
}

/// Drive the session's event receiver on a background task, translating each
/// `AcpEvent` into a Tauri event. Permission requests stash their reply oneshot
/// in the consumer state keyed by a fresh id and emit that id to the frontend.
fn pump_events(
    app: AppHandle,
    mut events: futures::channel::mpsc::UnboundedReceiver<AcpEvent>,
    epoch: u64,
    tool_workspace: PathBuf,
    started: Instant,
    mut ready: Option<oneshot::Sender<Result<(), String>>>,
) {
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.next().await {
            let state = app.state::<AcpConsumerState>();
            let (current, diagnostic, status) = {
                let mut inner = state.inner.lock().unwrap();
                let current = inner.active_epoch == Some(epoch);
                if !current {
                    (false, None, inner.status.clone())
                } else {
                    let diagnostic = inner.apply_event(epoch, &event, started.elapsed());
                    if matches!(event, AcpEvent::Exited { .. }) {
                        if inner.session.as_ref().map(|session| session.epoch) == Some(epoch) {
                            inner.session = None;
                        }
                        inner.active_epoch = None;
                    }
                    (true, diagnostic, inner.status.clone())
                }
            };
            if !current {
                if matches!(event, AcpEvent::Exited { .. }) {
                    break;
                }
                continue;
            }
            if let Some(line) = event_stderr_log_line(&event) {
                crate::debug_log::append(&app, &line);
            }
            if let Some(diagnostic) = diagnostic {
                emit_diagnostic(&app, diagnostic);
            }
            if matches!(
                event,
                AcpEvent::HandshakeStarted { .. }
                    | AcpEvent::Ready { .. }
                    | AcpEvent::Error { .. }
                    | AcpEvent::TurnEnded { .. }
                    | AcpEvent::Exited { .. }
            ) {
                let _ = app.emit("acp:state", status.clone());
            }
            match &event {
                AcpEvent::Ready { .. } => {
                    if let Some(sender) = ready.take() {
                        let _ = sender.send(Ok(()));
                    }
                }
                AcpEvent::Error {
                    kind:
                        AcpEventErrorKind::HandshakeTimeout { .. }
                        | AcpEventErrorKind::HandshakeFailed { .. },
                } => {
                    if let Some(sender) = ready.take() {
                        let message = status
                            .last_error
                            .as_ref()
                            .map(|error| error.message.clone())
                            .unwrap_or_else(|| "ACP handshake failed".to_string());
                        let _ = sender.send(Err(message));
                    }
                }
                AcpEvent::Exited { error } => {
                    if let Some(sender) = ready.take() {
                        let _ = sender
                            .send(Err(error.as_deref().map(sanitize_message).unwrap_or_else(
                                || "ACP driver exited before readiness".to_string(),
                            )));
                    }
                }
                _ => {}
            }
            match event {
                AcpEvent::HandshakeStarted { .. }
                | AcpEvent::Ready { .. }
                | AcpEvent::Error { .. } => {}
                AcpEvent::AgentMessage { message_id, text } => {
                    let _ = app.emit("acp:message", MessagePayload { message_id, text });
                }
                AcpEvent::AgentThought { message_id, text } => {
                    let _ = app.emit("acp:thought", MessagePayload { message_id, text });
                }
                AcpEvent::ToolCall(value) => {
                    let _ = app.emit("acp:tool-call", value);
                }
                AcpEvent::Plan(value) => {
                    let _ = app.emit("acp:plan", value);
                }
                AcpEvent::Usage(usage) => {
                    let _ = app.emit(
                        "acp:usage",
                        UsagePayload {
                            used: usage.used,
                            size: usage.size,
                            token_usage: usage.token_usage.map(TokenUsagePayload::from),
                        },
                    );
                }
                AcpEvent::FileWritten { path } => {
                    // The agent wrote a workspace file (already sandbox-checked
                    // in the crate). Record provenance so the write is auditable
                    // like any other agent write, then notify the frontend.
                    let _ = crate::provenance::append_record(
                        &tool_workspace,
                        &path,
                        "acp-write",
                        None,
                        None,
                        None,
                        None,
                        None,
                        None,
                        None,
                    );
                    let _ = app.emit("acp:file-written", path);
                }
                AcpEvent::Permission {
                    request,
                    options,
                    reply,
                } => {
                    let id = state.next_permission_id.fetch_add(1, Ordering::Relaxed);
                    state.pending.lock().unwrap().insert(id, reply);
                    let _ = app.emit(
                        "acp:permission",
                        PermissionPayload {
                            permission_id: id,
                            request,
                            options: options
                                .into_iter()
                                .map(|o| PermissionOptionPayload {
                                    option_id: o.option_id,
                                    name: o.name,
                                })
                                .collect(),
                        },
                    );
                }
                AcpEvent::ExecApproval {
                    command,
                    args,
                    cwd,
                    reply,
                } => {
                    let id = state.next_permission_id.fetch_add(1, Ordering::Relaxed);
                    state.pending_exec.lock().unwrap().insert(id, reply);
                    let _ = app.emit(
                        "acp:exec-approval",
                        ExecApprovalPayload {
                            exec_id: id,
                            command,
                            args,
                            cwd,
                        },
                    );
                }
                AcpEvent::TurnEnded { stop_reason, usage } => {
                    let _ = app.emit(
                        "acp:turn-ended",
                        TurnEndedPayload {
                            stop_reason,
                            usage: usage.map(TokenUsagePayload::from),
                        },
                    );
                }
                AcpEvent::Exited { error } => {
                    let _ = app.emit("acp:exited", error);
                    state.pending.lock().unwrap().clear();
                    state.pending_exec.lock().unwrap().clear();
                    break;
                }
            }
        }
        if let Some(sender) = ready.take() {
            let _ = sender.send(Err("ACP event stream closed before readiness".to_string()));
        }
    });
}

#[cfg(test)]
mod tests {
    use std::collections::{HashMap, HashSet};
    use std::path::{Path, PathBuf};
    use std::time::Duration;

    use zerowall_acp::{AcpEvent, AcpEventErrorKind, AcpHandshakeStage};

    use super::*;

    const SECRET: &str = "key-must-never-enter-config";

    fn request(profile_id: &str) -> AcpLaunchRequest {
        AcpLaunchRequest {
            profile_id: profile_id.to_string(),
            conversation_id: None,
            gateway: AcpGatewayConfig {
                provider_id: "zerowall-provider".to_string(),
                base_url: "https://gateway.example/v1/".to_string(),
                model: "research-model".to_string(),
                platform: None,
            },
        }
    }

    fn resolved(profile_id: &str) -> ResolvedRuntime {
        let adapter_version = profile_spec(profile_id).unwrap().adapter_version;
        ResolvedRuntime {
            info: AcpRuntimeInfo {
                profile_id: profile_id.to_string(),
                availability: AcpRuntimeAvailability::Available,
                executable_path: Some(format!("C:\\tools\\{profile_id}.exe")),
                cli_version: Some("1.2.3".to_string()),
                adapter_version: adapter_version.to_string(),
                error: None,
            },
            cli_path: PathBuf::from(format!("C:\\tools\\{profile_id}.exe")),
            adapter_path: PathBuf::from(format!("C:\\adapters\\{profile_id}.exe")),
        }
    }

    fn env_map(profile: &AcpAgentProfile) -> HashMap<&str, &str> {
        profile
            .env
            .iter()
            .map(|(name, value)| (name.as_str(), value.as_str()))
            .collect()
    }

    #[test]
    fn runtime_layout_keeps_only_runtime_configuration_outside_the_project() {
        let root = std::env::temp_dir().join(format!(
            "zerowall-acp-layout-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        prepare_runtime_layout(&root, CLAUDE_PROFILE_ID).unwrap();

        assert!(!root.join("workspace").exists());
        assert!(root.join(".opencode").is_dir());
        assert!(root.join(".claude").is_dir());
        assert!(root.join(".claude").join("skills").is_dir());
        assert!(!root.join(".codex").exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn bundled_skills_are_deployed_to_each_engine_discovery_directory() {
        let root = PathBuf::from("C:\\app-data\\acp\\runtime");
        assert_eq!(
            acp_skill_directory(&root, CLAUDE_PROFILE_ID).unwrap(),
            root.join(".claude").join("skills")
        );
        assert_eq!(
            acp_skill_directory(&root, CODEX_PROFILE_ID).unwrap(),
            root.join(".codex").join("skills")
        );
    }

    #[test]
    fn acp_session_root_is_the_selected_project_directory() {
        let root = std::env::temp_dir().join(format!(
            "zerowall-acp-selected-project-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let project = root.join("教学大纲知识图谱");
        std::fs::create_dir_all(&project).unwrap();
        std::fs::write(project.join("README.md"), "original project\n").unwrap();

        assert_eq!(
            acp_session_workspace(&project).unwrap(),
            project.canonicalize().unwrap()
        );
        assert!(!root.join("workspace").exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(windows)]
    #[test]
    fn windows_prompts_declare_the_project_root_and_powershell_contract() {
        let root = PathBuf::from(r"C:\codekg\neo4jshowproject\教学大纲知识图谱");
        let prompt = acp_prompt_with_host_context("请分析这个项目".to_string(), &root);

        assert!(prompt.contains("Windows"));
        assert!(prompt.contains("PowerShell"));
        assert!(prompt.contains(root.to_string_lossy().as_ref()));
        assert!(prompt.contains("do not use POSIX shell commands"));
        assert!(prompt.ends_with("请分析这个项目"));
    }

    #[test]
    fn launch_request_accepts_only_profile_and_gateway_shape() {
        let parsed: AcpLaunchRequest = serde_json::from_value(serde_json::json!({
            "profile_id": "claude-code",
            "gateway": {
                "provider_id": "provider",
                "base_url": "https://gateway.example/v1",
                "model": "model"
            }
        }))
        .unwrap();
        assert_eq!(parsed.profile_id, "claude-code");

        for invalid in [
            serde_json::json!({
                "id": "codex",
                "label": "Codex",
                "command": "attacker.exe",
                "gateway": {"provider_id": "p", "base_url": "https://x", "model": "m"}
            }),
            serde_json::json!({
                "profile_id": "codex",
                "command": "attacker.exe",
                "gateway": {"provider_id": "p", "base_url": "https://x", "model": "m"}
            }),
            serde_json::json!({
                "profile_id": "codex",
                "gateway": {
                    "provider_id": "p",
                    "base_url": "https://x",
                    "model": "m",
                    "api_key": "secret"
                }
            }),
        ] {
            assert!(serde_json::from_value::<AcpLaunchRequest>(invalid).is_err());
        }
    }

    #[test]
    fn prompt_attachment_request_accepts_only_the_bridge_payload() {
        let parsed: AcpPromptAttachmentRequest = serde_json::from_value(serde_json::json!({
            "filename": "floor-plan.png",
            "mime": "image/png",
            "base64": "cGl4ZWxz",
            "extractedText": "optional text"
        }))
        .unwrap();
        assert_eq!(parsed.filename, "floor-plan.png");
        assert_eq!(parsed.extracted_text.as_deref(), Some("optional text"));
        assert!(
            serde_json::from_value::<AcpPromptAttachmentRequest>(serde_json::json!({
                "filename": "x.png",
                "mime": "image/png",
                "base64": "cGl4ZWxz",
                "path": "C:\\\\outside.png"
            }))
            .is_err()
        );
    }

    #[test]
    fn launch_request_rejects_unknown_profiles_and_blank_gateway_fields() {
        assert!(request("custom-agent").validate().is_err());
        for field in ["provider", "base", "model"] {
            let mut request = request("codex");
            match field {
                "provider" => request.gateway.provider_id = "  ".to_string(),
                "base" => request.gateway.base_url = "".to_string(),
                "model" => request.gateway.model = "\t".to_string(),
                _ => unreachable!(),
            }
            assert!(request.validate().is_err(), "blank {field} must fail");
        }
    }

    #[test]
    fn claude_profile_has_exact_gateway_environment() {
        let mut request = request("claude-code");
        request.gateway.platform = Some("anthropic".to_string());
        let profile = build_agent_profile(
            &request,
            &resolved("claude-code"),
            SECRET,
            Path::new("C:\\isolated"),
            Vec::new(),
        )
        .unwrap();
        let env = env_map(&profile);
        assert_eq!(profile.command, "C:\\adapters\\claude-code.exe");
        assert!(profile.args.is_empty());
        assert_eq!(env.len(), 14);
        assert_eq!(env["CLAUDE_CODE_EXECUTABLE"], "C:\\tools\\claude-code.exe");
        assert_eq!(env["CLAUDE_CONFIG_DIR"], "C:\\isolated\\.claude");
        assert_eq!(env["ANTHROPIC_BASE_URL"], "https://gateway.example");
        assert_eq!(env["ANTHROPIC_API_KEY"], SECRET);
        assert_eq!(env["ANTHROPIC_AUTH_TOKEN"], SECRET);
        for name in [
            "ANTHROPIC_MODEL",
            "ANTHROPIC_DEFAULT_SONNET_MODEL",
            "ANTHROPIC_DEFAULT_OPUS_MODEL",
            "ANTHROPIC_DEFAULT_HAIKU_MODEL",
        ] {
            assert_eq!(env[name], "research-model");
        }
        assert_eq!(env["MCP_TOOL_TIMEOUT"], "120000");
        assert_eq!(env["MCP_TIMEOUT"], "120000");
        assert_eq!(env["MCP_CONNECT_TIMEOUT_MS"], "10000");
        assert_eq!(env["CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT"], "120000");
        assert_eq!(env["ENABLE_TOOL_SEARCH"], "false");
        assert!(!env.contains_key("MAX_THINKING_TOKENS"));
        for forbidden in [
            "CLAUDE_CODE_OAUTH_TOKEN",
            "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR",
            "CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR",
            "CLAUDE_CODE_HOST_AUTH_ENV_VAR",
            "CLAUDE_CODE_HOST_CREDS_FILE",
            "CLAUDE_CODE_SESSION_ACCESS_TOKEN",
            "CLAUDE_CODE_OAUTH_REFRESH_TOKEN",
            "CCR_OAUTH_TOKEN_FILE",
            "CLAUDE_CODE_USE_BEDROCK",
            "CLAUDE_CODE_USE_VERTEX",
            "CLAUDE_CODE_USE_FOUNDRY",
            "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY",
            "AWS_SESSION_TOKEN",
            "AWS_BEARER_TOKEN_BEDROCK",
            "AWS_PROFILE",
            "AWS_REGION",
            "AWS_DEFAULT_REGION",
            "GOOGLE_APPLICATION_CREDENTIALS",
            "ANTHROPIC_VERTEX_PROJECT_ID",
            "CLOUD_ML_REGION",
            "ANTHROPIC_FOUNDRY_RESOURCE",
            "ANTHROPIC_FOUNDRY_API_KEY",
            "ANTHROPIC_FOUNDRY_AUTH_TOKEN",
            "ANTHROPIC_AWS_API_KEY",
            "ANTHROPIC_PROFILE",
            "ANTHROPIC_CUSTOM_HEADERS",
            "ANTHROPIC_API_KEY_HELPER",
            "CLAUDE_CODE_ENABLE_PROXY_AUTH_HELPER",
            "AGENT_PROXY_AUTH_TOKEN",
        ] {
            assert!(
                profile.env_remove.iter().any(|name| name == forbidden),
                "parent environment variable {forbidden} must be removed"
            );
        }
        assert_eq!(profile.session_meta, Some(claude_session_meta()),);
        assert_eq!(
            profile.session_meta.unwrap()["claudeCode"]["options"]["extraArgs"],
            serde_json::json!({
                "bare": null,
                "no-session-persistence": null,
            })
        );
    }

    #[test]
    fn claude_non_anthropic_group_disables_thinking_parameters() {
        let mut request = request("claude-code");
        request.gateway.model = "deepseek-v4-pro".to_string();
        request.gateway.platform = Some("openai".to_string());
        let profile = build_agent_profile(
            &request,
            &resolved("claude-code"),
            SECRET,
            Path::new("C:\\isolated"),
            Vec::new(),
        )
        .unwrap();
        let env = env_map(&profile);
        assert_eq!(env["MAX_THINKING_TOKENS"], "0");
        assert_eq!(env["ENABLE_TOOL_SEARCH"], "false");
    }

    #[test]
    fn codex_profile_has_isolated_nonsecret_config() {
        let profile = build_agent_profile(
            &request("codex"),
            &resolved("codex"),
            SECRET,
            Path::new("C:\\isolated\\codex"),
            Vec::new(),
        )
        .unwrap();
        let env = env_map(&profile);
        assert_eq!(env.len(), 5);
        assert_eq!(env["CODEX_PATH"], "C:\\tools\\codex.exe");
        assert_eq!(env["CODEX_API_KEY"], SECRET);
        assert_eq!(env["MODEL_PROVIDER"], "zerowall-sub2api");
        assert_eq!(env["CODEX_HOME"], "C:\\isolated\\codex\\.codex");
        let config = env["CODEX_CONFIG"];
        let parsed: serde_json::Value = serde_json::from_str(config).unwrap();
        assert_eq!(
            parsed,
            serde_json::json!({
                "model": "research-model",
                "model_provider": "zerowall-sub2api",
                "model_providers": {
                    "zerowall-sub2api": {
                        "name": "ZeroWall Sub2API",
                        "base_url": "https://gateway.example/v1/",
                        "wire_api": "responses",
                        "env_key": "CODEX_API_KEY",
                        "requires_openai_auth": false
                    }
                }
            })
        );
        assert!(!config.contains(SECRET));
        assert!(profile
            .env_remove
            .iter()
            .any(|name| name == "OPENAI_API_KEY"));
        assert!(profile.session_meta.is_none());
        for forbidden in ["DEFAULT_AUTH_REQUEST", "OPENAI_BASE_URL", "OPENAI_MODEL"] {
            assert!(!env.contains_key(forbidden));
            assert!(!config.contains(forbidden));
        }
    }

    #[test]
    fn codex_isolated_home_contains_the_nonsecret_gateway_config_before_launch() {
        let root = std::env::temp_dir().join(format!("zerowall-acp-test-{}", std::process::id()));
        if root.exists() {
            std::fs::remove_dir_all(&root).unwrap();
        }
        std::fs::create_dir_all(&root).unwrap();

        write_codex_gateway_config(&request("codex"), &root).unwrap();

        let config = std::fs::read_to_string(root.join("config.toml")).unwrap();
        assert!(config.contains("model_provider = \"zerowall-sub2api\""));
        assert!(config.contains("wire_api = \"responses\""));
        assert!(config.contains("env_key = \"CODEX_API_KEY\""));
        assert!(config.contains("requires_openai_auth = false"));
        assert!(!config.contains(SECRET));

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn phases_serialize_to_exact_wire_values() {
        for (phase, expected) in [
            (AcpPhase::Idle, "idle"),
            (AcpPhase::Starting, "starting"),
            (AcpPhase::Ready, "ready"),
            (AcpPhase::Busy, "busy"),
            (AcpPhase::Stopping, "stopping"),
            (AcpPhase::Error, "error"),
        ] {
            assert_eq!(serde_json::to_value(phase).unwrap(), expected);
        }
    }

    #[derive(Default)]
    struct FakeProbeBackend {
        paths: Vec<PathBuf>,
        files: HashSet<PathBuf>,
        versions: HashMap<PathBuf, Result<String, String>>,
        version_sequences: std::cell::RefCell<
            HashMap<PathBuf, std::collections::VecDeque<Result<String, String>>>,
        >,
        resource_root: PathBuf,
    }

    impl RuntimeProbeBackend for FakeProbeBackend {
        fn search_paths(&self) -> Vec<PathBuf> {
            self.paths.clone()
        }

        fn is_file(&self, path: &Path) -> bool {
            self.files.contains(path)
        }

        fn cli_version(&self, path: &Path) -> Result<String, String> {
            if let Some(sequence) = self.version_sequences.borrow_mut().get_mut(path) {
                if let Some(result) = sequence.pop_front() {
                    return result;
                }
            }
            self.versions
                .get(path)
                .cloned()
                .unwrap_or_else(|| Err("unverified".to_string()))
        }

        fn resource_root(&self) -> PathBuf {
            self.resource_root.clone()
        }
    }

    #[test]
    fn claude_probe_selects_verified_direct_cli() {
        let tools = PathBuf::from("C:\\tools");
        let root = PathBuf::from("C:\\resources");
        let adapter = adapter_path(&root, CLAUDE_PROFILE_ID).unwrap();
        let direct = tools.join(cli_names(CLAUDE_PROFILE_ID)[0]);
        let backend = FakeProbeBackend {
            paths: vec![tools],
            files: HashSet::from([direct.clone(), adapter]),
            versions: HashMap::from([(direct.clone(), Ok("claude 2.0.0".to_string()))]),
            resource_root: root,
            ..FakeProbeBackend::default()
        };

        let result = probe_runtime_with(CLAUDE_PROFILE_ID, &backend).unwrap();
        assert_eq!(result.cli_path, direct);
        assert_eq!(result.info.availability, AcpRuntimeAvailability::Available);
        assert_eq!(result.info.cli_version.as_deref(), Some("claude 2.0.0"));
        assert_eq!(result.info.adapter_version, CLAUDE_ADAPTER_VERSION);
    }

    #[test]
    fn probe_prefers_app_private_cli_over_host_path() {
        let tools = PathBuf::from("C:\\tools");
        let root = PathBuf::from("C:\\resources");
        let bundled = bundled_cli_candidates(&root, CLAUDE_PROFILE_ID)[0].clone();
        let host = tools.join("claude.exe");
        let adapter = adapter_path(&root, CLAUDE_PROFILE_ID).unwrap();
        let backend = FakeProbeBackend {
            paths: vec![tools],
            files: HashSet::from([bundled.clone(), host.clone(), adapter]),
            versions: HashMap::from([
                (bundled.clone(), Ok("claude 2.1.222".to_string())),
                (host, Ok("claude 2.0.0".to_string())),
            ]),
            resource_root: root,
            ..FakeProbeBackend::default()
        };

        let result = probe_runtime_with(CLAUDE_PROFILE_ID, &backend).unwrap();
        assert_eq!(result.cli_path, bundled);
        assert_eq!(result.info.cli_version.as_deref(), Some("claude 2.1.222"));
    }

    #[test]
    fn bundled_cli_uses_runtime_binary_name_not_profile_id() {
        let root = PathBuf::from("C:\\resources");
        let candidates = bundled_cli_candidates(&root, CLAUDE_PROFILE_ID);
        assert!(candidates.contains(
            &root
                .join("acp-runtime")
                .join("claude-code")
                .join("bin")
                .join("claude.cmd")
        ));
    }

    #[cfg(windows)]
    #[test]
    fn bundled_cli_prefers_native_binary_over_windows_cmd_shim() {
        let root = PathBuf::from("C:\\resources");
        let candidates = bundled_cli_candidates(&root, CLAUDE_PROFILE_ID);
        let native = root
            .join("acp-runtime")
            .join("claude-code")
            .join("package/node_modules/@anthropic-ai/claude-code-win32-x64/claude.exe");
        assert_eq!(candidates.first(), Some(&native));
    }

    #[test]
    fn probe_retries_a_transient_cli_version_failure() {
        let tools = PathBuf::from("C:\\tools");
        let root = PathBuf::from("C:\\resources");
        let adapter = adapter_path(&root, CLAUDE_PROFILE_ID).unwrap();
        let cli = tools.join(cli_names(CLAUDE_PROFILE_ID)[0]);
        let backend = FakeProbeBackend {
            paths: vec![tools],
            files: HashSet::from([cli.clone(), adapter]),
            version_sequences: std::cell::RefCell::new(HashMap::from([(
                cli.clone(),
                std::collections::VecDeque::from([
                    Err("cold shim timed out".to_string()),
                    Ok("claude 2.0.0".to_string()),
                ]),
            )])),
            resource_root: root,
            ..FakeProbeBackend::default()
        };

        let result = probe_runtime_with(CLAUDE_PROFILE_ID, &backend).unwrap();
        assert_eq!(result.info.availability, AcpRuntimeAvailability::Available);
        assert_eq!(result.info.cli_version.as_deref(), Some("claude 2.0.0"));
    }

    #[test]
    fn codex_probe_skips_windows_apps_and_selects_verified_direct_cli() {
        let windows_apps = PathBuf::from("C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps");
        let tools = PathBuf::from("C:\\tools");
        let root = PathBuf::from("C:\\resources");
        let adapter = adapter_path(&root, "codex").unwrap();
        let windows_alias = windows_apps.join("codex.exe");
        let direct = tools.join("codex.exe");
        let backend = FakeProbeBackend {
            paths: vec![windows_apps, tools],
            files: HashSet::from([windows_alias.clone(), direct.clone(), adapter]),
            versions: HashMap::from([
                (windows_alias, Ok("unusable-store-alias".to_string())),
                (direct.clone(), Ok("codex-cli 1.2.3".to_string())),
            ]),
            resource_root: root,
            ..FakeProbeBackend::default()
        };

        let result = probe_runtime_with("codex", &backend).unwrap();
        assert_eq!(result.cli_path, direct);
        assert_eq!(result.info.availability, AcpRuntimeAvailability::Available);
        assert_eq!(result.info.cli_version.as_deref(), Some("codex-cli 1.2.3"));
        assert_eq!(result.info.adapter_version, "1.1.9");
    }

    #[test]
    fn bundled_adapter_names_match_tauri_external_bins() {
        let root = PathBuf::from("C:\\app");
        assert_eq!(
            adapter_path(&root, "claude-code").unwrap(),
            root.join(if cfg!(windows) {
                "claude-code-acp.exe"
            } else {
                "claude-code-acp"
            })
        );
        assert_eq!(
            adapter_path(&root, "codex").unwrap(),
            root.join(if cfg!(windows) {
                "codex-acp.exe"
            } else {
                "codex-acp"
            })
        );
    }

    #[cfg(windows)]
    #[test]
    fn codex_npm_shim_resolves_the_native_vendor_binary() {
        let npm = PathBuf::from("C:\\node");
        let shim = npm.join("codex.cmd");
        let native = npm
            .join("node_modules/@openai/codex/node_modules/@openai/codex-win32-x64")
            .join("vendor/x86_64-pc-windows-msvc/bin/codex.exe");
        let backend = FakeProbeBackend {
            files: HashSet::from([native.clone()]),
            ..FakeProbeBackend::default()
        };
        assert_eq!(codex_executable_candidates(&shim, &backend)[0], native);
    }

    #[test]
    fn probe_reports_adapter_stage_without_exposing_paths_or_environment() {
        let tools = PathBuf::from("C:\\tools");
        let direct = tools.join("claude.exe");
        let backend = FakeProbeBackend {
            paths: vec![tools],
            files: HashSet::from([direct.clone()]),
            versions: HashMap::from([(direct, Ok("2.0.0".to_string()))]),
            resource_root: PathBuf::from("C:\\missing-resources"),
            ..FakeProbeBackend::default()
        };

        let result = probe_runtime_with("claude-code", &backend).unwrap();
        assert_eq!(
            result.info.availability,
            AcpRuntimeAvailability::AdapterNotFound
        );
        let error = result.info.error.unwrap();
        assert_eq!(error.stage, "adapter");
        assert_eq!(error.code, "adapter_not_found");
        assert!(!error.message.contains("PATH="));
    }

    #[test]
    fn state_becomes_ready_only_after_ready_event_and_rejects_duplicate_prompt() {
        let mut inner = ConsumerInner::default();
        inner.begin_starting(7, "codex".to_string(), resolved("codex").info);
        assert_eq!(inner.status.phase, AcpPhase::Starting);
        inner.apply_event(
            7,
            &AcpEvent::HandshakeStarted {
                stage: AcpHandshakeStage::SessionNew,
            },
            Duration::from_millis(12),
        );
        assert_eq!(inner.status.phase, AcpPhase::Starting);
        inner.apply_event(
            7,
            &AcpEvent::Ready {
                session_id: "session".to_string(),
            },
            Duration::from_millis(20),
        );
        assert_eq!(inner.status.phase, AcpPhase::Ready);
        inner.begin_prompt().unwrap();
        assert_eq!(inner.status.phase, AcpPhase::Busy);
        assert_eq!(inner.begin_prompt().unwrap_err(), "ACP runtime is busy");
    }

    #[test]
    fn prompt_diagnostics_report_first_event_once_and_turn_end() {
        let mut inner = ConsumerInner::default();
        inner.begin_starting(8, "codex".to_string(), resolved("codex").info);
        inner.apply_event(
            8,
            &AcpEvent::Ready {
                session_id: "session".to_string(),
            },
            Duration::ZERO,
        );
        inner.begin_prompt().unwrap();

        let first = inner
            .apply_event(
                8,
                &AcpEvent::AgentMessage {
                    message_id: Some("message".to_string()),
                    text: "safe response".to_string(),
                },
                Duration::from_millis(12),
            )
            .expect("first turn event diagnostic");
        assert_eq!(first.stage, "first_event");
        assert_eq!(first.outcome, "observed");

        assert!(inner
            .apply_event(
                8,
                &AcpEvent::AgentThought {
                    message_id: Some("message".to_string()),
                    text: "safe thought".to_string(),
                },
                Duration::from_millis(14),
            )
            .is_none());

        let ended = inner
            .apply_event(
                8,
                &AcpEvent::TurnEnded {
                    stop_reason: "end_turn".to_string(),
                    usage: None,
                },
                Duration::from_millis(20),
            )
            .expect("turn ended diagnostic");
        assert_eq!(ended.stage, "turn_ended");
        assert_eq!(ended.outcome, "ended");
    }

    #[test]
    fn cancellation_turn_returns_ready_and_handshake_error_records_stage() {
        let mut inner = ConsumerInner::default();
        inner.begin_starting(3, "claude-code".to_string(), resolved("claude-code").info);
        inner.apply_event(
            3,
            &AcpEvent::Ready {
                session_id: "session".to_string(),
            },
            Duration::ZERO,
        );
        inner.begin_prompt().unwrap();
        inner.apply_event(
            3,
            &AcpEvent::TurnEnded {
                stop_reason: "cancelled".to_string(),
                usage: None,
            },
            Duration::from_millis(5),
        );
        assert_eq!(inner.status.phase, AcpPhase::Ready);

        inner.apply_event(
            3,
            &AcpEvent::Error {
                kind: AcpEventErrorKind::HandshakeFailed {
                    stage: AcpHandshakeStage::Initialize,
                    message: "safe failure".to_string(),
                },
            },
            Duration::from_millis(8),
        );
        assert_eq!(inner.status.phase, AcpPhase::Error);
        let error = inner.status.last_error.unwrap();
        assert_eq!(error.stage, "initialize");
        assert!(!error.message.contains(SECRET));
    }

    #[test]
    fn cancellation_keeps_busy_slot_until_turn_ended_event() {
        let mut inner = ConsumerInner::default();
        inner.begin_starting(4, "codex".to_string(), resolved("codex").info);
        inner.apply_event(
            4,
            &AcpEvent::Ready {
                session_id: "session".to_string(),
            },
            Duration::ZERO,
        );
        inner.begin_prompt().unwrap();
        // Cancelling a JSON-RPC request is asynchronous. A second prompt must
        // remain blocked until the ACP driver confirms the prior turn ended.
        assert_eq!(inner.status.phase, AcpPhase::Busy);
        assert_eq!(inner.begin_prompt(), Err("ACP runtime is busy".to_string()));

        inner.apply_event(
            4,
            &AcpEvent::TurnEnded {
                stop_reason: "cancelled".to_string(),
                usage: None,
            },
            Duration::from_millis(1),
        );
        assert_eq!(inner.status.phase, AcpPhase::Ready);
        assert!(inner.begin_prompt().is_ok());
    }

    #[test]
    fn silent_busy_turn_requires_cancel_then_forced_termination() {
        let mut inner = ConsumerInner::default();
        inner.begin_starting(9, "codex".to_string(), resolved("codex").info);
        inner.apply_event(
            9,
            &AcpEvent::Ready {
                session_id: "session".to_string(),
            },
            Duration::ZERO,
        );
        inner.begin_prompt().unwrap();
        let now = Instant::now();
        inner.last_turn_activity = Some(now - PROMPT_IDLE_TIMEOUT);

        assert!(inner.request_watchdog_cancel(now));
        assert!(!inner.request_watchdog_cancel(now));
        assert!(inner.force_watchdog_termination(now + PROMPT_CANCEL_GRACE));
    }

    #[test]
    fn stale_epoch_cannot_overwrite_new_ready_session() {
        let mut inner = ConsumerInner::default();
        inner.begin_starting(11, "codex".to_string(), resolved("codex").info);
        inner.apply_event(
            11,
            &AcpEvent::Ready {
                session_id: "new".to_string(),
            },
            Duration::ZERO,
        );
        inner.apply_event(
            10,
            &AcpEvent::Exited {
                error: Some("old driver failed".to_string()),
            },
            Duration::from_secs(1),
        );
        assert_eq!(inner.status.phase, AcpPhase::Ready);
        assert_eq!(inner.status.profile_id.as_deref(), Some("codex"));
        assert!(inner.status.last_error.is_none());
    }

    #[test]
    fn diagnostic_log_line_contains_only_structured_safe_fields() {
        let diagnostic = AcpDiagnostic {
            stage: "session_new".to_string(),
            elapsed_ms: 321,
            outcome: "error".to_string(),
            code: Some("handshake_failed".to_string()),
        };
        let line = format_diagnostic(&diagnostic);
        assert_eq!(
            line,
            "[acp] stage=session_new elapsed_ms=321 outcome=error code=handshake_failed"
        );
        assert!(!line.contains(SECRET));
    }

    #[test]
    fn skill_metadata_reads_frontmatter_and_uses_a_safe_fallback() {
        assert_eq!(
            acp_skill_metadata(
                "---\nname: literature-review\ndescription: Search and synthesize papers\n---\n# Skill",
                "fallback",
            ),
            (
                "literature-review".to_string(),
                "Search and synthesize papers".to_string(),
            ),
        );
        assert_eq!(
            acp_skill_metadata("# Untitled", "workspace-skill"),
            (
                "workspace-skill".to_string(),
                "Bundled ZeroWall Science skill".to_string(),
            ),
        );
    }

    #[test]
    fn stderr_log_line_keeps_safe_tail_without_full_error_payload() {
        let message = format!(
            "ACP prompt request failed\nACP stderr tail:\n{}ordinary tail",
            "x".repeat(10_000)
        );
        let line = stderr_log_line(&message).unwrap();
        assert!(line.starts_with("[acp stderr] "));
        assert!(line.contains("ordinary tail"));
        assert!(!line.contains("ACP prompt request failed"));
        assert!(line.len() <= 4 * 1024 + 32);
    }

    #[tokio::test]
    async fn shutdown_can_take_lifecycle_lock_and_cancel_pending_readiness() {
        let lifecycle = tokio::sync::Mutex::new(());
        let guard = lifecycle.lock().await;
        let (ready_tx, ready_rx) = oneshot::channel();
        let launch = await_launch_ready(guard, ready_rx);
        let shutdown = async {
            let _guard = lifecycle.lock().await;
            drop(ready_tx);
        };

        let (launch_result, ()) = tokio::time::timeout(Duration::from_millis(100), async {
            tokio::join!(launch, shutdown)
        })
        .await
        .expect("shutdown was blocked by the pending readiness wait");
        assert_eq!(
            launch_result.unwrap_err(),
            "ACP driver exited before reporting readiness"
        );
    }
}
