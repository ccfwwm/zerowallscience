use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use zerowall_acp::AcpAgentProfile;
use zerowall_acp_host::acp_process::AcpProcessDriver;
use zerowall_acp_host::opencode::{HttpOpenCodeTransport, OpenCodeDriver};
use zerowall_acp_host::{
    AcpHost, AgentBinding, AgentEvent, CredentialRef, HostDriverKind, HostError,
    NewSessionRequest, PromptAttachment, PromptResponse, SessionState,
};

#[derive(Default)]
pub struct AcpHostState {
    host: tokio::sync::Mutex<AcpHost>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedSession {
    id: String,
    binding: AgentBinding,
    resumable: bool,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    directory: Option<String>,
    #[serde(default)]
    parent_id: Option<String>,
    #[serde(default)]
    created: Option<u64>,
    #[serde(default)]
    updated: Option<u64>,
}

fn catalog_path(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve ACP catalog directory: {error}"))?
        .join("acp-host");
    std::fs::create_dir_all(&root)
        .map_err(|error| format!("create ACP catalog directory: {error}"))?;
    Ok(root.join("sessions.json"))
}

fn read_catalog(app: &AppHandle) -> Result<HashMap<String, PersistedSession>, String> {
    let path = catalog_path(app)?;
    if !path.is_file() {
        return Ok(HashMap::new());
    }
    let text = std::fs::read_to_string(&path)
        .map_err(|error| format!("read ACP session catalog: {error}"))?;
    serde_json::from_str(&text).map_err(|error| format!("parse ACP session catalog: {error}"))
}

fn write_catalog(app: &AppHandle, catalog: &HashMap<String, PersistedSession>) -> Result<(), String> {
    let path = catalog_path(app)?;
    let staging = path.with_extension("json.staging");
    let body = serde_json::to_vec_pretty(catalog)
        .map_err(|error| format!("serialize ACP session catalog: {error}"))?;
    std::fs::write(&staging, body)
        .map_err(|error| format!("stage ACP session catalog: {error}"))?;
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|error| format!("replace ACP session catalog: {error}"))?;
    }
    std::fs::rename(staging, path)
        .map_err(|error| format!("commit ACP session catalog: {error}"))
}

fn persist_session(app: &AppHandle, state: &SessionState) -> Result<(), String> {
    let mut catalog = read_catalog(app)?;
    catalog.insert(
        state.id.clone(),
        PersistedSession {
            id: state.id.clone(),
            binding: state.binding.clone(),
            resumable: state.resumable,
            title: state.title.clone(),
            directory: state.directory.clone(),
            parent_id: state.parent_id.clone(),
            created: state.created,
            updated: state.updated,
        },
    );
    write_catalog(app, &catalog)
}

fn remove_persisted_session(app: &AppHandle, session_id: &str) -> Result<(), String> {
    let mut catalog = read_catalog(app)?;
    if catalog.remove(session_id).is_some() {
        write_catalog(app, &catalog)?;
    }
    Ok(())
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
    #[serde(default)]
    pub mcp_allow_list: Option<Vec<String>>,
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
    // MCP discovery is best-effort: an unavailable optional connector must not
    // prevent the unified ACP Host from starting the primary session.
    let mut mcp_servers = crate::science_mcp::acp_mcp_servers(app).unwrap_or_default();
    if let Some(allow_list) = &request.mcp_allow_list {
        if !allow_list.iter().any(|entry| entry == "*") {
            mcp_servers.retain(|server| allow_list.iter().any(|entry| entry == &server.name));
        }
    }
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
        mcp_servers,
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

fn build_driver(
    app: &AppHandle,
    request: &AcpHostLaunchRequest,
    workspace: &Path,
    session_binding: AgentBinding,
) -> Result<Box<dyn zerowall_acp_host::AcpHostDriver>, String> {
    Ok(match request.engine {
        HostDriverKind::Codex | HostDriverKind::ClaudeCode => Box::new(
            AcpProcessDriver::new(
                request.engine,
                process_profile(app, request, workspace)?,
                workspace.to_path_buf(),
                session_binding,
            )
            .map_err(error_string)?
        ),
        HostDriverKind::OpenCode => Box::new(build_opencode_driver(app, session_binding)?),
    })
}

fn build_opencode_driver(
    app: &AppHandle,
    session_binding: AgentBinding,
) -> Result<OpenCodeDriver<HttpOpenCodeTransport>, String> {
    let runtime = app.state::<crate::runtime::RuntimeState>();
    let base_url = crate::runtime::sidecar_url(runtime.inner())
        .ok_or_else(|| "OpenCode runtime is not running".to_owned())?;
    Ok(OpenCodeDriver::new(
        HttpOpenCodeTransport::new(),
        base_url,
        "opencode",
        crate::runtime::server_password(),
        session_binding,
    ))
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
    let driver = build_driver(&app, &request, &workspace, session_binding.clone())?;
    let mut host = state.host.lock().await;
    host.register_driver(request.engine, driver);
    let result = if request.engine == HostDriverKind::OpenCode && request.session_id != request.profile_id {
        host.load_existing_session(
            zerowall_acp_host::LoadSessionRequest {
                session_id: request.session_id,
            },
            session_binding,
        )
        .await
        .map_err(error_string)
    } else {
        host.new_session(
            NewSessionRequest {
                session_id: request.session_id,
            },
            session_binding,
        )
        .await
        .map_err(error_string)
    };
    drop(host);
    if let Ok(ref state) = result {
        persist_session(&app, state)?;
    }
    result
}

/// Explicit new-session alias used by the multi-session Host client. Keeping
/// launch as the compatibility command avoids changing older desktop builds.
#[tauri::command]
pub async fn acp_host_new(
    app: AppHandle,
    state: State<'_, AcpHostState>,
    request: AcpHostLaunchRequest,
) -> Result<SessionState, String> {
    acp_host_launch(app, state, request).await
}

#[tauri::command]
pub async fn acp_host_sessions(
    app: AppHandle,
    state: State<'_, AcpHostState>,
) -> Result<Vec<SessionState>, String> {
    let mut sessions = state.host.lock().await.list_sessions();
    let active = sessions.iter().map(|session| session.id.clone()).collect::<std::collections::HashSet<_>>();
    for persisted in read_catalog(&app)?.into_values() {
        if !active.contains(&persisted.id) {
            sessions.push(SessionState {
                id: persisted.id,
                binding: persisted.binding,
                resumable: persisted.resumable,
                title: persisted.title,
                directory: persisted.directory,
                parent_id: persisted.parent_id,
                created: persisted.created,
                updated: persisted.updated,
            });
        }
    }
    Ok(sessions)
}

#[tauri::command]
pub async fn acp_host_discover(
    app: AppHandle,
    request: AcpHostLaunchRequest,
) -> Result<Vec<SessionState>, String> {
    validate_request(&request)?;
    if request.engine != HostDriverKind::OpenCode {
        return Err("session discovery is currently supported only by OpenCode".into());
    }
    let workspace = workspace_root(&app)?;
    let mut driver = build_opencode_driver(&app, binding(&request, &workspace))?;
    let discovered = driver.list_sessions().await.map_err(error_string)?;
    let mut catalog = read_catalog(&app)?;
    let mut sessions = Vec::with_capacity(discovered.len());
    for mut session in discovered {
        if let Some(existing) = catalog.get_mut(&session.id) {
            session.binding = existing.binding.clone();
            session.resumable = existing.resumable;
            existing.title = session.title.clone();
            existing.directory = session.directory.clone();
            existing.parent_id = session.parent_id.clone();
            existing.created = session.created;
            existing.updated = session.updated;
        } else {
            catalog.insert(
                session.id.clone(),
                PersistedSession {
                    id: session.id.clone(),
                    binding: session.binding.clone(),
                    resumable: session.resumable,
                    title: session.title.clone(),
                    directory: session.directory.clone(),
                    parent_id: session.parent_id.clone(),
                    created: session.created,
                    updated: session.updated,
                },
            );
        }
        sessions.push(session);
    }
    write_catalog(&app, &catalog)?;
    Ok(sessions)
}

#[tauri::command]
pub async fn acp_host_load(
    app: AppHandle,
    state: State<'_, AcpHostState>,
    session_id: String,
    request: Option<AcpHostLaunchRequest>,
) -> Result<SessionState, String> {
    let mut host = state.host.lock().await;
    match host.load_session(session_id.clone()).await {
        Ok(result) => {
            drop(host);
            persist_session(&app, &result)?;
            Ok(result)
        }
        Err(HostError::SessionNotFound { .. }) => {
            drop(host);
            let request = request.ok_or_else(|| "session is not active and no launch profile was supplied".to_owned())?;
            validate_request(&request)?;
            if request.session_id != session_id {
                return Err("load request session_id does not match session_id".into());
            }
            let workspace = workspace_root(&app)?;
            let expected = binding(&request, &workspace);
            let effective_binding = if let Some(persisted) = read_catalog(&app)?.get(&session_id) {
                if persisted.binding.engine != expected.engine
                    || persisted.binding.profile != expected.profile
                {
                    return Err("session binding conflicts on engine or profile".into());
                }
                persisted.binding.clone()
            } else {
                expected
            };
            let driver = build_driver(&app, &request, &workspace, effective_binding.clone())?;
            let mut host = state.host.lock().await;
            host.register_driver(request.engine, driver);
            let result = host
                .load_existing_session(
                    zerowall_acp_host::LoadSessionRequest { session_id },
                    effective_binding,
                )
                .await
                .map_err(error_string)?;
            drop(host);
            persist_session(&app, &result)?;
            Ok(result)
        }
        Err(error) => Err(error_string(error)),
    }
}

#[tauri::command]
pub async fn acp_host_history(
    state: State<'_, AcpHostState>,
    session_id: String,
) -> Result<serde_json::Value, String> {
    state
        .host
        .lock()
        .await
        .history(&session_id)
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
pub async fn acp_host_config(
    state: State<'_, AcpHostState>,
    session_id: String,
    config: serde_json::Value,
) -> Result<SessionState, String> {
    state
        .host
        .lock()
        .await
        .set_config(&session_id, config)
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
    app: AppHandle,
    state: State<'_, AcpHostState>,
    session_id: String,
) -> Result<(), String> {
    state
        .host
        .lock()
        .await
        .close_session(&session_id)
        .await
        .map_err(error_string)?;
    remove_persisted_session(&app, &session_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persisted_session_catalog_contains_binding_and_safe_metadata_only() {
        let entry = PersistedSession {
            id: "session-1".into(),
            binding: AgentBinding {
                engine: HostDriverKind::OpenCode,
                profile: "opencode".into(),
                model: Some("model-a".into()),
                provider: Some("provider".into()),
                variant: None,
                project_root: "C:/science".into(),
                profile_fingerprint: "fp".into(),
                resolved_at: "now".into(),
            },
            resumable: true,
            title: Some("Review".into()),
            directory: Some("C:/science".into()),
            parent_id: Some("parent".into()),
            created: Some(1),
            updated: Some(2),
        };
        let encoded = serde_json::to_string(&entry).unwrap();
        assert!(encoded.contains("session-1"));
        assert!(encoded.contains("model-a"));
        assert!(encoded.contains("Review"));
        assert!(encoded.contains("C:/science"));
        assert!(encoded.contains("parent"));
        assert!(encoded.contains("created"));
        assert!(encoded.contains("updated"));
        for secret in ["api_key", "token", "secret_value", "api-key"] {
            assert!(!encoded.contains(secret));
        }
    }
}
