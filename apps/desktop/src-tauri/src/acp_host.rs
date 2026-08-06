use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use zerowall_acp::AcpAgentProfile;
use zerowall_acp_host::acp_process::AcpProcessDriver;
use zerowall_acp_host::opencode::{HttpOpenCodeTransport, OpenCodeDriver};
use zerowall_acp_host::{
    AcpHost, AgentBinding, AgentEvent, CredentialRef, HostDriverKind, NewSessionRequest,
    PromptAttachment, PromptResponse, SessionState,
};

#[derive(Default)]
pub struct AcpHostState {
    host: tokio::sync::Mutex<AcpHost>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AcpHostLaunchRequest {
    pub engine: HostDriverKind,
    pub profile_id: String,
    pub session_id: String,
    pub model: String,
    pub provider_id: String,
    pub base_url: String,
    #[serde(default)]
    pub variant: Option<String>,
    pub profile_fingerprint: String,
    pub credential: CredentialRef,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AcpHostPromptAttachment {
    pub filename: String,
    pub mime: String,
    pub base64: String,
    #[serde(default)]
    pub extracted_text: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpHostEngineInfo {
    pub engine: HostDriverKind,
    pub available: bool,
    pub reason: Option<String>,
}

fn error_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn validate_request(request: &AcpHostLaunchRequest) -> Result<(), String> {
    if request.session_id.trim().is_empty() {
        return Err("session_id is required".into());
    }
    if request.profile_id.trim().is_empty() {
        return Err("profile_id is required".into());
    }
    for (name, value) in [
        ("model", request.model.as_str()),
        ("provider_id", request.provider_id.as_str()),
        ("base_url", request.base_url.as_str()),
        ("profile_fingerprint", request.profile_fingerprint.as_str()),
    ] {
        if value.trim().is_empty() {
            return Err(format!("{name} is required"));
        }
    }
    if !matches!(request.engine, HostDriverKind::OpenCode)
        && request.credential.keychain_id.trim().is_empty()
    {
        return Err("credential.keychain_id is required".into());
    }
    validate_base_url(&request.base_url)
}

fn validate_base_url(value: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(value).map_err(|_| "base_url must be an absolute URL")?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("base_url must use http or https".into());
    }
    Ok(())
}

fn adapter_name(engine: HostDriverKind) -> Option<&'static str> {
    match engine {
        HostDriverKind::Codex => Some("codex-acp"),
        HostDriverKind::ClaudeCode => Some("claude-code-acp"),
        HostDriverKind::OpenCode => None,
    }
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

fn resolve_adapter_path(app: &AppHandle, engine: HostDriverKind) -> Result<PathBuf, String> {
    let name =
        adapter_name(engine).ok_or_else(|| "OpenCode has no ACP child adapter".to_owned())?;
    let executable = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_owned()
    };
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("binaries").join(&executable));
        candidates.push(resource_dir.join(&executable));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!(
                "{name}-{}{}",
                target_triple(),
                if cfg!(windows) { ".exe" } else { "" }
            )),
    );
    if let Some(path) = std::env::var_os("PATH").and_then(|path| {
        std::env::split_paths(&path)
            .map(|dir| dir.join(&executable))
            .find(|path| path.is_file())
    }) {
        candidates.push(path);
    }
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| format!("{} adapter is not installed", name))
}

fn workspace_root(app: &AppHandle) -> Result<PathBuf, String> {
    crate::runtime::workspace_dir(app)?
        .canonicalize()
        .map_err(|error| format!("could not resolve active workspace: {error}"))
}

fn process_profile(
    app: &AppHandle,
    request: &AcpHostLaunchRequest,
    workspace: &Path,
) -> Result<AcpAgentProfile, String> {
    let key = crate::secret_store::provider_api_key(app, &request.credential.keychain_id)?
        .ok_or_else(|| "provider credential is not available in the OS keychain".to_owned())?;
    let adapter = resolve_adapter_path(app, request.engine)?;
    let runtime_home = workspace
        .join(".zerowall")
        .join("acp")
        .join(&request.profile_id);
    std::fs::create_dir_all(&runtime_home)
        .map_err(|error| format!("create ACP runtime directory: {error}"))?;
    let mut env = vec![("ZERO_WALL_MODEL".into(), request.model.clone())];
    match request.engine {
        HostDriverKind::Codex => {
            env.extend([
                ("OPENAI_API_KEY".into(), key),
                ("OPENAI_BASE_URL".into(), request.base_url.clone()),
                (
                    "CODEX_HOME".into(),
                    runtime_home.to_string_lossy().into_owned(),
                ),
            ]);
        }
        HostDriverKind::ClaudeCode => {
            env.extend([
                ("ANTHROPIC_API_KEY".into(), key.clone()),
                ("ANTHROPIC_AUTH_TOKEN".into(), key),
                ("ANTHROPIC_BASE_URL".into(), request.base_url.clone()),
                ("ANTHROPIC_MODEL".into(), request.model.clone()),
                (
                    "CLAUDE_CONFIG_DIR".into(),
                    runtime_home.to_string_lossy().into_owned(),
                ),
            ]);
        }
        HostDriverKind::OpenCode => unreachable!(),
    }
    Ok(AcpAgentProfile {
        id: request.profile_id.clone(),
        label: format!("{:?}", request.engine),
        command: adapter.to_string_lossy().into_owned(),
        args: Vec::new(),
        env,
        env_remove: vec![
            "OPENAI_API_KEY".into(),
            "ANTHROPIC_API_KEY".into(),
            "ANTHROPIC_AUTH_TOKEN".into(),
            "CODEX_HOME".into(),
            "CLAUDE_CONFIG_DIR".into(),
        ],
        session_meta: None,
        mcp_servers: Vec::new(),
    })
}

fn binding(request: &AcpHostLaunchRequest, workspace: &Path) -> AgentBinding {
    AgentBinding {
        engine: request.engine,
        profile: request.profile_id.clone(),
        model: Some(request.model.clone()),
        provider: Some(request.provider_id.clone()),
        variant: request.variant.clone(),
        project_root: workspace.to_string_lossy().into_owned(),
        profile_fingerprint: request.profile_fingerprint.clone(),
        resolved_at: chrono_like_timestamp(),
    }
}

fn chrono_like_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}

#[tauri::command]
pub fn acp_host_engines(app: AppHandle) -> Vec<AcpHostEngineInfo> {
    let mut engines = Vec::new();
    for engine in [
        HostDriverKind::Codex,
        HostDriverKind::ClaudeCode,
        HostDriverKind::OpenCode,
    ] {
        let (available, reason) = match engine {
            HostDriverKind::OpenCode => {
                if app
                    .try_state::<crate::runtime::RuntimeState>()
                    .and_then(|state| crate::runtime::sidecar_url(state.inner()))
                    .is_some()
                {
                    (true, None)
                } else {
                    (false, Some("OpenCode runtime is not running".into()))
                }
            }
            HostDriverKind::Codex | HostDriverKind::ClaudeCode => {
                match resolve_adapter_path(&app, engine) {
                    Ok(_) => (true, None),
                    Err(error) => (false, Some(error)),
                }
            }
        };
        engines.push(AcpHostEngineInfo {
            engine,
            available,
            reason,
        });
    }
    engines
}

#[tauri::command]
pub async fn acp_host_initialize(
    state: State<'_, AcpHostState>,
    engine: HostDriverKind,
) -> Result<zerowall_acp_host::InitializeResponse, String> {
    state
        .host
        .lock()
        .await
        .initialize(engine)
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_launch(
    app: AppHandle,
    state: State<'_, AcpHostState>,
    request: AcpHostLaunchRequest,
) -> Result<SessionState, String> {
    validate_request(&request)?;
    let workspace = workspace_root(&app)?;
    let session_binding = binding(&request, &workspace);
    let driver: Box<dyn zerowall_acp_host::AcpHostDriver> = match request.engine {
        HostDriverKind::Codex | HostDriverKind::ClaudeCode => Box::new(
            AcpProcessDriver::new(
                request.engine,
                process_profile(&app, &request, &workspace)?,
                workspace,
                session_binding.clone(),
            )
            .map_err(error_string)?,
        ),
        HostDriverKind::OpenCode => {
            let runtime = app.state::<crate::runtime::RuntimeState>();
            let base_url = crate::runtime::sidecar_url(runtime.inner())
                .ok_or_else(|| "OpenCode runtime is not running".to_owned())?;
            Box::new(OpenCodeDriver::new(
                HttpOpenCodeTransport::new(),
                base_url,
                "opencode",
                crate::runtime::server_password(),
                session_binding.clone(),
            ))
        }
    };
    let mut host = state.host.lock().await;
    host.register_driver(request.engine, driver);
    host.new_session(
        NewSessionRequest {
            session_id: request.session_id,
        },
        session_binding,
    )
    .await
    .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_prompt(
    state: State<'_, AcpHostState>,
    session_id: String,
    prompt: String,
    attachments: Option<Vec<AcpHostPromptAttachment>>,
) -> Result<PromptResponse, String> {
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
    state
        .host
        .lock()
        .await
        .prompt(session_id, prompt, attachments)
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_events(
    state: State<'_, AcpHostState>,
    session_id: String,
) -> Result<Vec<AgentEvent>, String> {
    state
        .host
        .lock()
        .await
        .drain_events(&session_id)
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_cancel(
    state: State<'_, AcpHostState>,
    session_id: String,
) -> Result<(), String> {
    state
        .host
        .lock()
        .await
        .cancel(&session_id)
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_permission(
    state: State<'_, AcpHostState>,
    session_id: String,
    request_id: String,
    option_id: Option<String>,
) -> Result<(), String> {
    state
        .host
        .lock()
        .await
        .respond_permission(&session_id, &request_id, option_id)
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_close(
    state: State<'_, AcpHostState>,
    session_id: String,
) -> Result<(), String> {
    state
        .host
        .lock()
        .await
        .close_session(&session_id)
        .await
        .map_err(error_string)
}
