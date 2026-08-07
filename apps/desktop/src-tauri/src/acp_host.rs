use std::collections::HashMap;
use std::future::Future;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use zerowall_acp::AcpAgentProfile;
use zerowall_acp_host::acp_process::AcpProcessDriver;
use zerowall_acp_host::opencode::{
    CustomProviderRequest, HttpOpenCodeTransport, McpConfig, McpServer, McpServerRequest,
    OpenCodeDriver, OpenCodeMcpControl, OpenCodeProviderControl, ProviderCatalog, ProviderInfo,
};
use zerowall_acp_host::{
    normalize_mcp_allow_list, normalize_skill_snapshots, AcpHost, AcpHostDriver, AgentBinding,
    AgentEvent, CredentialRef, HostDriverKind, HostError, NewSessionRequest, PromptAttachment,
    PromptResponse, SessionState, SessionStatus, SkillSnapshot,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    credential: Option<CredentialRef>,
    resumable: bool,
    #[serde(default = "inactive_session_status")]
    state: SessionStatus,
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

fn inactive_session_status() -> SessionStatus {
    SessionStatus::Closed
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

fn write_catalog(
    app: &AppHandle,
    catalog: &HashMap<String, PersistedSession>,
) -> Result<(), String> {
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
    std::fs::rename(staging, path).map_err(|error| format!("commit ACP session catalog: {error}"))
}

fn persist_session(
    app: &AppHandle,
    state: &SessionState,
    request: Option<&AcpHostLaunchRequest>,
) -> Result<(), String> {
    let mut catalog = read_catalog(app)?;
    let previous = catalog.get(&state.id);
    let base_url = request
        .map(|request| request.base_url.clone())
        .or_else(|| previous.and_then(|entry| entry.base_url.clone()));
    let credential = request
        .map(|request| request.credential.clone())
        .or_else(|| previous.and_then(|entry| entry.credential.clone()));
    catalog.insert(
        state.id.clone(),
        PersistedSession {
            id: state.id.clone(),
            binding: state.binding.clone(),
            base_url,
            credential,
            resumable: state.resumable,
            state: state.state,
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AcpHostLaunchRequest {
    pub engine: HostDriverKind,
    pub profile_id: String,
    pub session_id: String,
    pub model: String,
    pub provider_id: String,
    pub base_url: String,
    pub project_root: String,
    #[serde(default)]
    pub variant: Option<String>,
    pub profile_fingerprint: String,
    pub credential: CredentialRef,
    #[serde(default)]
    pub mcp_allow_list: Option<Vec<String>>,
    #[serde(default)]
    pub skills_snapshot: Option<Vec<SkillSnapshot>>,
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

fn validate_request(request: &AcpHostLaunchRequest) -> Result<AcpHostLaunchRequest, String> {
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
        ("project_root", request.project_root.as_str()),
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
    validate_base_url(&request.base_url)?;
    let mut normalized = request.clone();
    normalized.mcp_allow_list = request
        .mcp_allow_list
        .as_ref()
        .map(|values| normalize_mcp_allow_list(values.clone()));
    normalized.skills_snapshot = request
        .skills_snapshot
        .as_ref()
        .map(|values| normalize_skill_snapshots(values.clone()).map_err(error_string))
        .transpose()?;
    Ok(normalized)
}

pub(crate) fn validate_project_root(requested: &str, workspace: &Path) -> Result<(), String> {
    let requested = Path::new(requested)
        .canonicalize()
        .map_err(|error| format!("could not resolve requested project root: {error}"))?;
    if requested != workspace {
        return Err("project_root does not match the active workspace".into());
    }
    Ok(())
}

async fn close_catalog_only_session<F, Fut>(
    catalog: &mut HashMap<String, PersistedSession>,
    session_id: &str,
    workspace: &Path,
    close_opencode: F,
) -> Result<(), String>
where
    F: FnOnce(AgentBinding, String) -> Fut,
    Fut: Future<Output = Result<(), String>>,
{
    let persisted = catalog.get(session_id).cloned().ok_or_else(|| {
        error_string(HostError::SessionNotFound {
            session_id: session_id.to_owned(),
        })
    })?;
    validate_project_root(&persisted.binding.project_root, workspace)?;
    match persisted.binding.engine {
        HostDriverKind::OpenCode => {
            close_opencode(persisted.binding, session_id.to_owned()).await?
        }
        HostDriverKind::Codex | HostDriverKind::ClaudeCode => {
            // After restart there is no recoverable vendor process handle for
            // these adapters. Explicit deletion can only remove the local
            // catalog entry; remote/vendor cleanup is not available.
        }
    }
    catalog.remove(session_id);
    Ok(())
}

fn retain_workspace_sessions(sessions: &mut Vec<SessionState>, workspace: &Path) {
    sessions
        .retain(|session| validate_project_root(&session.binding.project_root, workspace).is_ok());
}

fn merge_discovered_sessions(
    catalog: &mut HashMap<String, PersistedSession>,
    discovered: Vec<SessionState>,
    workspace: &Path,
) -> Vec<SessionState> {
    let mut sessions = Vec::with_capacity(discovered.len());
    for mut session in discovered {
        let belongs_to_workspace = session
            .directory
            .as_deref()
            .is_some_and(|directory| validate_project_root(directory, workspace).is_ok());
        if !belongs_to_workspace {
            continue;
        }
        if let Some(existing) = catalog.get_mut(&session.id) {
            if validate_project_root(&existing.binding.project_root, workspace).is_err() {
                continue;
            }
            session.binding = existing.binding.clone();
            session.resumable = existing.resumable;
            session.state = existing.state;
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
                    base_url: None,
                    credential: None,
                    resumable: session.resumable,
                    state: session.state,
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
    sessions
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

fn adapter_runtime_env_name(engine: HostDriverKind) -> Option<&'static str> {
    match engine {
        HostDriverKind::Codex => Some("CODEX_PATH"),
        HostDriverKind::ClaudeCode => Some("CLAUDE_CODE_EXECUTABLE"),
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

fn adapter_candidates(
    environment_root: Option<&Path>,
    resource_dir: Option<&Path>,
    executable: &Path,
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(root) = environment_root {
        candidates.push(root.join(executable));
        candidates.push(root.join("binaries").join(executable));
    }
    if let Some(root) = resource_dir {
        candidates.push(root.join("binaries").join(executable));
        candidates.push(root.join(executable));
    }
    candidates
}

fn resolve_adapter_path(app: &AppHandle, engine: HostDriverKind) -> Result<PathBuf, String> {
    let name =
        adapter_name(engine).ok_or_else(|| "OpenCode has no ACP child adapter".to_owned())?;
    let executable = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_owned()
    };
    let environment_root = crate::environment_update::active_environment_root(app)?;
    let resource_dir = app.path().resource_dir().ok();
    let mut candidates = adapter_candidates(
        environment_root.as_deref(),
        resource_dir.as_deref(),
        Path::new(&executable),
    );
    #[cfg(debug_assertions)]
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!(
                "{name}-{}{}",
                target_triple(),
                if cfg!(windows) { ".exe" } else { "" }
            )),
    );
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| format!("{} adapter is not installed", name))
}

fn resolve_runtime_cli_path(app: &AppHandle, engine: HostDriverKind) -> Result<PathBuf, String> {
    let profile_id = match engine {
        HostDriverKind::Codex => "codex",
        HostDriverKind::ClaudeCode => "claude-code",
        HostDriverKind::OpenCode => {
            return Err("OpenCode has no ACP child runtime executable".to_owned())
        }
    };
    let mut roots = Vec::new();
    if let Some(root) = crate::environment_update::active_environment_root(app)? {
        roots.push(root);
    }
    if let Ok(root) = app.path().resource_dir() {
        roots.push(root);
    }
    #[cfg(debug_assertions)]
    roots.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")));

    roots
        .into_iter()
        .flat_map(|root| crate::acp_consumer::bundled_cli_candidates(&root, profile_id))
        .find(|path| path.is_file())
        .ok_or_else(|| format!("{profile_id} runtime is not installed"))
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
    let runtime_cli = resolve_runtime_cli_path(app, request.engine)?;
    let runtime_home = process_runtime_home(workspace, request);
    std::fs::create_dir_all(&runtime_home)
        .map_err(|error| format!("create ACP runtime directory: {error}"))?;
    let snapshots = request.skills_snapshot.as_deref().unwrap_or_default();
    let skill_store = workspace.join(".zerowall").join("skills-store");
    if !snapshots.is_empty() {
        crate::runtime::deploy_bundled_skills_to(app, &skill_store)?;
    }
    crate::runtime::materialize_skill_snapshots(
        &skill_store,
        &runtime_home.join("skills"),
        snapshots,
    )?;
    // MCP discovery is best-effort: an unavailable optional connector must not
    // prevent the unified ACP Host from starting the primary session.
    let mut mcp_servers = crate::science_mcp::acp_mcp_servers(app).unwrap_or_default();
    if let Some(allow_list) = &request.mcp_allow_list {
        if !allow_list.iter().any(|entry| entry == "*") {
            mcp_servers.retain(|server| allow_list.iter().any(|entry| entry == &server.name));
        }
    }
    let runtime_selector = adapter_runtime_env_name(request.engine)
        .expect("process profiles are created only for process-backed engines");
    let mut env = vec![
        ("ZERO_WALL_MODEL".into(), request.model.clone()),
        (
            runtime_selector.into(),
            runtime_cli.to_string_lossy().into_owned(),
        ),
    ];
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
    let mut env_remove = crate::acp_consumer::conflicting_parent_environment(&request.profile_id);
    env_remove.extend([
        "OPENAI_API_KEY".into(),
        "ANTHROPIC_API_KEY".into(),
        "ANTHROPIC_AUTH_TOKEN".into(),
        "CODEX_HOME".into(),
        "CODEX_PATH".into(),
        "CLAUDE_CONFIG_DIR".into(),
        "CLAUDE_CODE_EXECUTABLE".into(),
    ]);
    env_remove.sort();
    env_remove.dedup();
    Ok(AcpAgentProfile {
        id: request.profile_id.clone(),
        label: format!("{:?}", request.engine),
        command: adapter.to_string_lossy().into_owned(),
        args: Vec::new(),
        env,
        env_remove,
        session_meta: None,
        mcp_servers,
    })
}

fn process_runtime_home(workspace: &Path, request: &AcpHostLaunchRequest) -> PathBuf {
    let engine = match request.engine {
        HostDriverKind::Codex => "codex",
        HostDriverKind::ClaudeCode => "claude-code",
        HostDriverKind::OpenCode => "opencode",
    };
    let session = format!("{:x}", Sha256::digest(request.session_id.as_bytes()));
    workspace
        .join(".zerowall")
        .join("acp")
        .join(engine)
        .join(session)
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
        mcp_allow_list: request.mcp_allow_list.clone().unwrap_or_default(),
        skills_snapshot: request.skills_snapshot.clone().unwrap_or_default(),
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
            .map_err(error_string)?,
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

fn build_provider_control(
    app: &AppHandle,
) -> Result<OpenCodeProviderControl<HttpOpenCodeTransport>, String> {
    let runtime = app.state::<crate::runtime::RuntimeState>();
    let base_url = crate::runtime::sidecar_url(runtime.inner())
        .ok_or_else(|| "OpenCode runtime is not running".to_owned())?;
    Ok(OpenCodeProviderControl::new(
        HttpOpenCodeTransport::new(),
        base_url,
        "opencode",
        crate::runtime::server_password(),
    ))
}

fn build_mcp_control(app: &AppHandle) -> Result<OpenCodeMcpControl<HttpOpenCodeTransport>, String> {
    let runtime = app.state::<crate::runtime::RuntimeState>();
    let base_url = crate::runtime::sidecar_url(runtime.inner())
        .ok_or_else(|| "OpenCode runtime is not running".to_owned())?;
    Ok(OpenCodeMcpControl::new(
        HttpOpenCodeTransport::new(),
        base_url,
        "opencode",
        crate::runtime::server_password(),
    ))
}

fn validate_provider_id(value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err("provider_id is required".into());
    }
    if !value
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    {
        return Err("provider_id contains unsupported characters".into());
    }
    Ok(())
}

fn validate_custom_provider(request: &CustomProviderRequest) -> Result<(), String> {
    validate_provider_id(&request.id)?;
    for (name, value) in [
        ("name", request.name.as_str()),
        ("npm", request.npm.as_str()),
        ("base_url", request.base_url.as_str()),
    ] {
        if value.trim().is_empty() {
            return Err(format!("{name} is required"));
        }
    }
    validate_base_url(&request.base_url)?;
    if request.models.is_empty() || request.models.iter().any(|model| model.trim().is_empty()) {
        return Err("at least one non-empty model is required".into());
    }
    Ok(())
}

fn validate_mcp_name(value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err("MCP server name is required".into());
    }
    if !value
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    {
        return Err("MCP server name contains unsupported characters".into());
    }
    Ok(())
}

fn validate_mcp_request(request: &McpServerRequest) -> Result<(), String> {
    validate_mcp_name(&request.name)?;
    match &request.config {
        McpConfig::Local {
            command,
            environment,
            ..
        } => {
            if command.is_empty() || command.iter().any(|part| part.trim().is_empty()) {
                return Err("local MCP command must contain non-empty arguments".into());
            }
            validate_mcp_environment(environment)?;
        }
        McpConfig::Remote { url, headers, .. } => {
            validate_base_url(url)?;
            validate_mcp_environment(headers)?;
        }
    }
    Ok(())
}

fn validate_provider_region(value: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("provider region is required".into());
    }
    if !value
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    {
        return Err("provider region contains unsupported characters".into());
    }
    let normalized = value.to_ascii_lowercase();
    if normalized.contains("token") || normalized.contains("key") {
        return Err("provider region contains reserved credential text".into());
    }
    Ok(())
}

fn validate_mcp_environment(
    values: &std::collections::BTreeMap<String, String>,
) -> Result<(), String> {
    for (name, value) in values {
        if name.trim().is_empty() {
            return Err("MCP environment/header name is required".into());
        }
        if is_sensitive_mcp_field(name) && !is_mcp_secret_placeholder(value) {
            return Err(format!(
                "MCP secret field {name} must use a keychain environment placeholder"
            ));
        }
    }
    Ok(())
}

fn is_mcp_secret_placeholder(value: &str) -> bool {
    let Some(name) = value
        .strip_prefix("{env:")
        .and_then(|v| v.strip_suffix('}'))
    else {
        return false;
    };
    !name.is_empty()
        && name.chars().all(|character| {
            character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
        })
}

fn is_sensitive_mcp_field(name: &str) -> bool {
    let normalized = name.trim().to_ascii_uppercase().replace('-', "_");
    normalized == "AUTHORIZATION"
        || normalized == "COOKIE"
        || normalized.ends_with("_API_KEY")
        || normalized.ends_with("_TOKEN")
        || normalized.ends_with("_SECRET")
        || normalized.ends_with("_PASSWORD")
        || normalized.ends_with("_CREDENTIAL")
}

#[tauri::command]
pub async fn acp_host_list_providers(app: AppHandle) -> Result<Vec<ProviderInfo>, String> {
    build_provider_control(&app)?
        .list_providers()
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_list_provider_catalog(app: AppHandle) -> Result<ProviderCatalog, String> {
    build_provider_control(&app)?
        .list_provider_catalog()
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_list_custom_provider_ids(app: AppHandle) -> Result<Vec<String>, String> {
    build_provider_control(&app)?
        .list_custom_provider_ids()
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_get_default_model(app: AppHandle) -> Result<Option<String>, String> {
    build_provider_control(&app)?
        .get_default_model()
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_set_default_model(app: AppHandle, model: String) -> Result<(), String> {
    if model.trim().is_empty() || !model.contains('/') {
        return Err("model must use provider/model format".into());
    }
    build_provider_control(&app)?
        .set_default_model(&model)
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_get_provider_region(
    app: AppHandle,
    provider_id: String,
) -> Result<Option<String>, String> {
    validate_provider_id(&provider_id)?;
    build_provider_control(&app)?
        .get_provider_region(&provider_id)
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_set_provider_region(
    app: AppHandle,
    provider_id: String,
    region: String,
) -> Result<(), String> {
    validate_provider_id(&provider_id)?;
    validate_provider_region(&region)?;
    build_provider_control(&app)?
        .set_provider_region(&provider_id, region.trim())
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_add_custom_provider(
    app: AppHandle,
    request: CustomProviderRequest,
) -> Result<(), String> {
    validate_custom_provider(&request)?;
    build_provider_control(&app)?
        .add_custom_provider(request)
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_remove_custom_provider(
    app: AppHandle,
    provider_id: String,
) -> Result<(), String> {
    validate_provider_id(&provider_id)?;
    build_provider_control(&app)?
        .remove_custom_provider(&provider_id)
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_clear_default_custom_model_context_limits(
    app: AppHandle,
) -> Result<(), String> {
    build_provider_control(&app)?
        .clear_default_custom_model_context_limits()
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_remove_legacy_provider_entries(app: AppHandle) -> Result<(), String> {
    build_provider_control(&app)?
        .remove_legacy_provider_entries()
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_ensure_custom_providers_image_capable(app: AppHandle) -> Result<(), String> {
    build_provider_control(&app)?
        .ensure_custom_providers_image_capable()
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_list_mcp_servers(app: AppHandle) -> Result<Vec<McpServer>, String> {
    build_mcp_control(&app)?
        .list_mcp_servers()
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_add_mcp_server(
    app: AppHandle,
    request: McpServerRequest,
) -> Result<(), String> {
    validate_mcp_request(&request)?;
    build_mcp_control(&app)?
        .add_mcp_server(request)
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_remove_mcp_server(app: AppHandle, name: String) -> Result<(), String> {
    validate_mcp_name(&name)?;
    build_mcp_control(&app)?
        .remove_mcp_server(&name)
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_reconnect_mcp_server(app: AppHandle, name: String) -> Result<(), String> {
    validate_mcp_name(&name)?;
    build_mcp_control(&app)?
        .reconnect_mcp_server(&name)
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_ensure_mcp_environment(
    app: AppHandle,
    name: String,
    environment: std::collections::BTreeMap<String, String>,
) -> Result<(), String> {
    validate_mcp_name(&name)?;
    validate_mcp_environment(&environment)?;
    build_mcp_control(&app)?
        .ensure_mcp_environment(&name, environment)
        .await
        .map_err(error_string)
}

fn jupyter_mcp_request(
    server: zerowall_acp::AcpMcpServer,
) -> Result<(McpServerRequest, String), String> {
    let token = server
        .env
        .iter()
        .find(|(name, _)| name == "JUPYTER_TOKEN")
        .map(|(_, value)| value.clone())
        .ok_or_else(|| "Jupyter token is unavailable".to_owned())?;
    let mut environment = std::collections::BTreeMap::new();
    for (name, value) in server.env {
        environment.insert(
            name.clone(),
            if name == "JUPYTER_TOKEN" {
                "{env:JUPYTER_TOKEN}".to_owned()
            } else {
                value
            },
        );
    }
    let mut command = vec![server.command];
    command.extend(server.args);
    let request = McpServerRequest {
        name: "jupyter".to_owned(),
        config: McpConfig::Local {
            command,
            enabled: Some(true),
            environment,
        },
    };
    validate_mcp_request(&request)?;
    Ok((request, token))
}

/// Register app-managed Jupyter without returning its token to the renderer.
#[tauri::command]
pub async fn acp_host_register_jupyter_mcp(
    app: AppHandle,
    state: State<'_, crate::runtime::RuntimeState>,
) -> Result<(), String> {
    let server = crate::jupyter::acp_mcp_server(&app)
        .ok_or_else(|| "Jupyter is not installed and running".to_owned())?;
    let (request, token) = jupyter_mcp_request(server)?;
    crate::secret_store::persist_connector_secret_for_app(
        &app,
        "jupyter",
        "JUPYTER_TOKEN",
        &token,
    )?;
    build_mcp_control(&app)?
        .add_mcp_server(request)
        .await
        .map_err(error_string)?;
    crate::runtime::restart_sidecar_if_running(&app, &state)
        .map(|_| ())
        .map_err(|error| format!("restart OpenCode after Jupyter registration: {error}"))
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
                match resolve_adapter_path(&app, engine)
                    .and_then(|_| resolve_runtime_cli_path(&app, engine))
                {
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
    start_host_session(app, state, request, SessionLaunchRoute::Compatibility).await
}

#[derive(Clone, Copy)]
enum SessionLaunchRoute {
    Compatibility,
    ExplicitNew,
}

async fn route_registered_session(
    host: &mut AcpHost,
    request: &AcpHostLaunchRequest,
    session_binding: AgentBinding,
    route: SessionLaunchRoute,
    has_persisted_catalog_entry: bool,
) -> Result<SessionState, String> {
    // `acp_host_launch` is the compatibility entry used when the app opens a
    // persisted conversation. All process-backed drivers must restore through
    // `load_existing_session`; routing only OpenCode here silently created a
    // fresh Codex/Claude session after restart. Explicit workflow/session-new
    // calls remain on the new-session path regardless of the id shape.
    let should_load = matches!(route, SessionLaunchRoute::Compatibility)
        && (has_persisted_catalog_entry || request.session_id != request.profile_id);
    if should_load {
        host.load_existing_session(
            zerowall_acp_host::LoadSessionRequest {
                session_id: request.session_id.clone(),
            },
            session_binding,
        )
        .await
        .map_err(error_string)
    } else {
        host.new_session(
            NewSessionRequest {
                session_id: request.session_id.clone(),
            },
            session_binding,
        )
        .await
        .map_err(error_string)
    }
}

async fn start_host_session(
    app: AppHandle,
    state: State<'_, AcpHostState>,
    request: AcpHostLaunchRequest,
    route: SessionLaunchRoute,
) -> Result<SessionState, String> {
    let request = validate_request(&request)?;
    let workspace = workspace_root(&app)?;
    validate_project_root(&request.project_root, &workspace)?;
    let requested_binding = binding(&request, &workspace);
    let catalog = read_catalog(&app)?;
    let has_persisted_catalog_entry = catalog.contains_key(&request.session_id);
    let session_binding = if let Some(persisted) = catalog.get(&request.session_id) {
        persisted
            .binding
            .ensure_compatible(&requested_binding)
            .map_err(error_string)?;
        persisted
            .binding
            .clone()
            .normalized()
            .map_err(error_string)?
    } else {
        requested_binding
    };
    let driver = build_driver(&app, &request, &workspace, session_binding.clone())?;
    let mut host = state.host.lock().await;
    host.register_driver(request.engine, driver);
    let result = route_registered_session(
        &mut host,
        &request,
        session_binding,
        route,
        has_persisted_catalog_entry,
    )
    .await;
    drop(host);
    if let Ok(ref state) = result {
        persist_session(&app, state, Some(&request))?;
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
    start_host_session(app, state, request, SessionLaunchRoute::ExplicitNew).await
}

#[tauri::command]
pub async fn acp_host_sessions(
    app: AppHandle,
    state: State<'_, AcpHostState>,
) -> Result<Vec<SessionState>, String> {
    let workspace = workspace_root(&app)?;
    let mut sessions = state.host.lock().await.list_sessions();
    retain_workspace_sessions(&mut sessions, &workspace);
    let active = sessions
        .iter()
        .map(|session| session.id.clone())
        .collect::<std::collections::HashSet<_>>();
    for persisted in read_catalog(&app)?.into_values() {
        if !active.contains(&persisted.id)
            && validate_project_root(&persisted.binding.project_root, &workspace).is_ok()
        {
            sessions.push(SessionState {
                id: persisted.id,
                binding: persisted.binding,
                state: persisted.state,
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
    let request = validate_request(&request)?;
    if request.engine != HostDriverKind::OpenCode {
        return Err("session discovery is currently supported only by OpenCode".into());
    }
    let workspace = workspace_root(&app)?;
    validate_project_root(&request.project_root, &workspace)?;
    let mut driver = build_opencode_driver(&app, binding(&request, &workspace))?;
    let discovered = driver.list_sessions().await.map_err(error_string)?;
    let mut catalog = read_catalog(&app)?;
    let sessions = merge_discovered_sessions(&mut catalog, discovered, &workspace);
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
    let workspace = workspace_root(&app)?;
    let request = request.as_ref().map(validate_request).transpose()?;
    if let Some(request) = request.as_ref() {
        validate_project_root(&request.project_root, &workspace)?;
    }
    let mut host = state.host.lock().await;
    let active = host
        .list_sessions()
        .into_iter()
        .find(|session| session.id == session_id);
    if let Some(active) = active {
        validate_project_root(&active.binding.project_root, &workspace)?;
        if let Some(request) = request.as_ref() {
            let expected = binding(request, &workspace);
            active
                .binding
                .ensure_compatible(&expected)
                .map_err(error_string)?;
        }
        let requires_reload = host
            .session_requires_reload(&session_id)
            .map_err(error_string)?;
        if requires_reload {
            if !active.resumable {
                return Err(error_string(HostError::SessionTerminated {
                    session_id,
                    resumable: false,
                }));
            }
            let request = request.as_ref().ok_or_else(|| {
                "terminated session requires its original launch profile to reload".to_owned()
            })?;
            let driver = build_driver(&app, request, &workspace, active.binding.clone())?;
            host.register_driver(active.binding.engine, driver);
        }
        let result = host
            .load_session(session_id.clone())
            .await
            .map_err(error_string)?;
        drop(host);
        persist_session(&app, &result, request.as_ref())?;
        return Ok(result);
    }
    drop(host);

    let request = request
        .ok_or_else(|| "session is not active and no launch profile was supplied".to_owned())?;
    if request.session_id != session_id {
        return Err("load request session_id does not match session_id".into());
    }
    validate_project_root(&request.project_root, &workspace)?;
    let expected = binding(&request, &workspace);
    let effective_binding = if let Some(persisted) = read_catalog(&app)?.get(&session_id) {
        persisted
            .binding
            .ensure_compatible(&expected)
            .map_err(error_string)?;
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
    persist_session(&app, &result, Some(&request))?;
    Ok(result)
}

fn process_resume_request(persisted: &PersistedSession) -> Result<AcpHostLaunchRequest, String> {
    let session_id = persisted.id.as_str();
    let binding = &persisted.binding;
    if binding.engine == HostDriverKind::OpenCode {
        return Err(error_string(HostError::UnsupportedCapability {
            kind: HostDriverKind::OpenCode,
            operation: "resume_session",
        }));
    }
    let binding = binding.clone().normalized().map_err(error_string)?;
    let model = binding
        .model
        .clone()
        .ok_or_else(|| "persisted process binding is missing its model".to_owned())?;
    let provider = binding
        .provider
        .clone()
        .ok_or_else(|| "persisted process binding is missing its provider".to_owned())?;
    let legacy_base_url = if persisted.base_url.is_none() {
        let fingerprint = binding.profile_fingerprint.split('|').collect::<Vec<_>>();
        let [profile_id, fingerprint_provider, base_url, fingerprint_model] =
            fingerprint.as_slice()
        else {
            return Err("persisted process profile fingerprint cannot restore its gateway".into());
        };
        for (field, matches) in [
            ("profile", *profile_id == binding.profile),
            ("provider", *fingerprint_provider == provider),
            ("model", *fingerprint_model == model),
        ] {
            if !matches {
                return Err(error_string(HostError::BindingConflict {
                    field: field.into(),
                }));
            }
        }
        Some(*base_url)
    } else {
        None
    };
    let base_url = persisted
        .base_url
        .as_deref()
        .or(legacy_base_url)
        .ok_or_else(|| "persisted process session is missing its gateway URL".to_owned())?;
    validate_base_url(base_url)?;
    let credential = persisted.credential.clone().unwrap_or(CredentialRef {
        keychain_id: provider.clone(),
    });
    Ok(AcpHostLaunchRequest {
        engine: binding.engine,
        profile_id: binding.profile,
        session_id: session_id.to_owned(),
        model,
        provider_id: provider.clone(),
        base_url: base_url.to_owned(),
        project_root: binding.project_root,
        variant: binding.variant,
        profile_fingerprint: binding.profile_fingerprint,
        credential,
        mcp_allow_list: Some(binding.mcp_allow_list),
        skills_snapshot: Some(binding.skills_snapshot),
    })
}

async fn resume_persisted_session(
    host: &mut AcpHost,
    persisted: &PersistedSession,
    driver: Box<dyn AcpHostDriver>,
) -> Result<SessionState, String> {
    if !persisted.resumable {
        return Err(error_string(HostError::SessionTerminated {
            session_id: persisted.id.clone(),
            resumable: false,
        }));
    }
    host.register_driver(persisted.binding.engine, driver);
    host.resume_existing_session(
        zerowall_acp_host::ResumeSessionRequest {
            session_id: persisted.id.clone(),
        },
        persisted.binding.clone(),
    )
    .await
    .map_err(error_string)
}

async fn resume_active_session(
    host: &mut AcpHost,
    session_id: &str,
    workspace: &Path,
) -> Result<Option<SessionState>, String> {
    let Some(active) = host
        .list_sessions()
        .into_iter()
        .find(|session| session.id == session_id)
    else {
        return Ok(None);
    };
    validate_project_root(&active.binding.project_root, workspace)?;
    host.resume_session(session_id.to_owned())
        .await
        .map(Some)
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_resume(
    app: AppHandle,
    state: State<'_, AcpHostState>,
    session_id: String,
) -> Result<SessionState, String> {
    let workspace = workspace_root(&app)?;
    let mut host = state.host.lock().await;
    if let Some(session) = resume_active_session(&mut host, &session_id, &workspace).await? {
        drop(host);
        persist_session(&app, &session, None)?;
        return Ok(session);
    }
    drop(host);

    let persisted = read_catalog(&app)?
        .get(&session_id)
        .cloned()
        .ok_or_else(|| error_string(HostError::SessionNotFound { session_id }))?;
    validate_project_root(&persisted.binding.project_root, &workspace)?;
    if persisted.binding.engine == HostDriverKind::OpenCode {
        return Err(error_string(HostError::UnsupportedCapability {
            kind: HostDriverKind::OpenCode,
            operation: "resume_session",
        }));
    }
    let request = process_resume_request(&persisted)?;
    let driver = build_driver(&app, &request, &workspace, persisted.binding.clone())?;
    let mut host = state.host.lock().await;
    let session = resume_persisted_session(&mut host, &persisted, driver).await?;
    drop(host);
    persist_session(&app, &session, None)?;
    Ok(session)
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
pub async fn acp_host_mode(
    state: State<'_, AcpHostState>,
    session_id: String,
    mode: String,
) -> Result<(), String> {
    state
        .host
        .lock()
        .await
        .set_mode(&session_id, &mode)
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_events(
    app: AppHandle,
    state: State<'_, AcpHostState>,
    session_id: String,
) -> Result<Vec<AgentEvent>, String> {
    let mut host = state.host.lock().await;
    let events = host.drain_events(&session_id).map_err(error_string)?;
    let session = host
        .list_sessions()
        .into_iter()
        .find(|session| session.id == session_id);
    drop(host);
    if !events.is_empty() {
        if let Some(session) = session {
            persist_session(&app, &session, None)?;
        }
    }
    Ok(events)
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
pub async fn acp_host_question(
    state: State<'_, AcpHostState>,
    session_id: String,
    request_id: String,
    answers: Option<Vec<Vec<String>>>,
) -> Result<(), String> {
    state
        .host
        .lock()
        .await
        .respond_question(&session_id, &request_id, answers)
        .await
        .map_err(error_string)
}

#[tauri::command]
pub async fn acp_host_close(
    app: AppHandle,
    state: State<'_, AcpHostState>,
    session_id: String,
) -> Result<(), String> {
    let workspace = workspace_root(&app)?;
    let mut host = state.host.lock().await;
    let active_binding = host
        .list_sessions()
        .into_iter()
        .find(|session| session.id == session_id)
        .map(|session| session.binding);
    if let Some(binding) = active_binding {
        validate_project_root(&binding.project_root, &workspace)?;
        host.close_session(&session_id)
            .await
            .map_err(error_string)?;
        drop(host);
        return remove_persisted_session(&app, &session_id);
    }
    drop(host);

    let mut catalog = read_catalog(&app)?;
    close_catalog_only_session(
        &mut catalog,
        &session_id,
        &workspace,
        |binding, session_id| async {
            let mut driver = build_opencode_driver(&app, binding)?;
            driver.close_session(session_id).await.map_err(error_string)
        },
    )
    .await?;
    write_catalog(&app, &catalog)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use zerowall_acp_host::{DriverCall, DriverCapabilities, FakeDriver, SkillScope};

    fn test_binding(engine: HostDriverKind, root: &Path) -> AgentBinding {
        AgentBinding {
            engine,
            profile: match engine {
                HostDriverKind::Codex => "codex",
                HostDriverKind::ClaudeCode => "claude-code",
                HostDriverKind::OpenCode => "opencode",
            }
            .into(),
            model: Some("model".into()),
            provider: Some("provider".into()),
            variant: None,
            project_root: root.to_string_lossy().into_owned(),
            profile_fingerprint: "fp".into(),
            resolved_at: "now".into(),
            mcp_allow_list: Vec::new(),
            skills_snapshot: Vec::new(),
        }
    }

    fn test_session(id: &str, binding: AgentBinding, directory: Option<&Path>) -> SessionState {
        SessionState {
            id: id.into(),
            binding,
            state: SessionStatus::Ready,
            resumable: true,
            title: None,
            directory: directory.map(|path| path.to_string_lossy().into_owned()),
            parent_id: None,
            created: None,
            updated: None,
        }
    }

    fn test_persisted_session(id: &str, engine: HostDriverKind, root: &Path) -> PersistedSession {
        PersistedSession {
            id: id.into(),
            binding: test_binding(engine, root),
            base_url: None,
            credential: None,
            resumable: true,
            state: SessionStatus::Ready,
            title: None,
            directory: Some(root.to_string_lossy().into_owned()),
            parent_id: None,
            created: None,
            updated: None,
        }
    }

    fn test_launch_request(
        engine: HostDriverKind,
        root: &Path,
        session_id: &str,
    ) -> AcpHostLaunchRequest {
        AcpHostLaunchRequest {
            engine,
            profile_id: match engine {
                HostDriverKind::Codex => "codex",
                HostDriverKind::ClaudeCode => "claude-code",
                HostDriverKind::OpenCode => "opencode",
            }
            .into(),
            session_id: session_id.into(),
            model: "model".into(),
            provider_id: "provider".into(),
            base_url: "https://example.invalid/v1".into(),
            project_root: root.to_string_lossy().into_owned(),
            variant: None,
            profile_fingerprint: "fp".into(),
            credential: CredentialRef {
                keychain_id: "provider".into(),
            },
            mcp_allow_list: None,
            skills_snapshot: None,
        }
    }

    #[test]
    fn launch_request_normalizes_capability_snapshots() {
        let root = std::env::current_dir().unwrap();
        let mut request = test_launch_request(HostDriverKind::Codex, &root, "session-1");
        request.mcp_allow_list = Some(vec![
            " papers ".into(),
            String::new(),
            "datasets".into(),
            "papers".into(),
        ]);
        request.skills_snapshot = Some(vec![
            SkillSnapshot {
                id: " review ".into(),
                version: " 1 ".into(),
                scope: SkillScope::Conversation,
                sha256: " abc ".into(),
            },
            SkillSnapshot {
                id: "review".into(),
                version: "1".into(),
                scope: SkillScope::Conversation,
                sha256: "abc".into(),
            },
        ]);

        let normalized = validate_request(&request).unwrap();
        assert_eq!(
            normalized.mcp_allow_list,
            Some(vec!["datasets".into(), "papers".into()])
        );
        assert_eq!(
            normalized.skills_snapshot,
            Some(vec![SkillSnapshot {
                id: "review".into(),
                version: "1".into(),
                scope: SkillScope::Conversation,
                sha256: "abc".into(),
            }])
        );
        let session_binding = binding(&normalized, &root);
        assert_eq!(session_binding.mcp_allow_list, vec!["datasets", "papers"]);
        assert_eq!(session_binding.skills_snapshot.len(), 1);
    }

    #[test]
    fn process_runtime_home_is_session_isolated_and_uses_no_raw_session_path() {
        let root = PathBuf::from("C:/science");
        let first = test_launch_request(HostDriverKind::Codex, &root, "../unsafe/session");
        let second = test_launch_request(HostDriverKind::Codex, &root, "other-session");

        let first_home = process_runtime_home(&root, &first);
        let second_home = process_runtime_home(&root, &second);

        assert!(first_home.starts_with(root.join(".zerowall/acp/codex")));
        assert_ne!(first_home, second_home);
        assert!(!first_home.to_string_lossy().contains("unsafe"));
        assert!(!first_home.to_string_lossy().contains(".."));
    }

    #[test]
    fn launch_request_rejects_invalid_skill_snapshot_and_legacy_catalog_defaults_empty() {
        let root = std::env::current_dir().unwrap();
        let mut request = test_launch_request(HostDriverKind::Codex, &root, "session-1");
        request.skills_snapshot = Some(vec![SkillSnapshot {
            id: "review".into(),
            version: "1".into(),
            scope: SkillScope::Conversation,
            sha256: " ".into(),
        }]);
        assert_eq!(
            validate_request(&request).unwrap_err(),
            "skill snapshot sha256 is required"
        );

        let legacy: PersistedSession = serde_json::from_value(serde_json::json!({
            "id": "legacy",
            "binding": {
                "engine": "codex",
                "profile": "codex",
                "model": "model",
                "provider": "provider",
                "variant": null,
                "projectRoot": root.to_string_lossy(),
                "profileFingerprint": "fp",
                "resolvedAt": "now"
            },
            "resumable": true
        }))
        .unwrap();
        assert!(legacy.binding.mcp_allow_list.is_empty());
        assert!(legacy.binding.skills_snapshot.is_empty());
    }

    fn test_driver(
        calls: Arc<Mutex<Vec<DriverCall>>>,
    ) -> Box<dyn zerowall_acp_host::AcpHostDriver> {
        Box::new(FakeDriver::with_calls(
            DriverCapabilities {
                new_session: true,
                load_session: true,
                resume_session: true,
                ..Default::default()
            },
            calls,
        ))
    }

    #[test]
    fn mcp_request_rejects_raw_secret_material_but_accepts_keychain_placeholders() {
        let raw = McpServerRequest {
            name: "papers".into(),
            config: McpConfig::Local {
                command: vec!["python".into(), "-m".into(), "papers".into()],
                enabled: Some(true),
                environment: std::collections::BTreeMap::from([(
                    "PAPERS_API_KEY".into(),
                    "secret-value".into(),
                )]),
            },
        };
        assert!(validate_mcp_request(&raw).is_err());

        let placeholder = McpServerRequest {
            name: "papers".into(),
            config: McpConfig::Local {
                command: vec!["python".into(), "-m".into(), "papers".into()],
                enabled: Some(true),
                environment: std::collections::BTreeMap::from([(
                    "PAPERS_API_KEY".into(),
                    "{env:PAPERS_API_KEY}".into(),
                )]),
            },
        };
        assert!(validate_mcp_request(&placeholder).is_ok());

        let raw_header = McpServerRequest {
            name: "remote".into(),
            config: McpConfig::Remote {
                url: "https://mcp.example.test".into(),
                enabled: Some(true),
                headers: std::collections::BTreeMap::from([(
                    "Authorization".into(),
                    "Bearer secret-value".into(),
                )]),
            },
        };
        assert!(validate_mcp_request(&raw_header).is_err());
    }

    #[test]
    fn provider_region_validation_accepts_region_ids_and_rejects_secret_material() {
        assert!(validate_provider_region("eu-central-1").is_ok());
        assert!(validate_provider_region("us_gov.west-1").is_ok());
        assert!(validate_provider_region("").is_err());
        assert!(validate_provider_region("eu west 1").is_err());
        assert!(validate_provider_region("token-eu-west-1").is_err());
        assert!(validate_provider_region("api-key-eu-west-1").is_err());
        assert!(validate_provider_id("amazon/bedrock").is_err());
    }

    #[test]
    fn jupyter_registration_separates_keychain_secret_from_public_mcp_config() {
        let (request, token) = jupyter_mcp_request(zerowall_acp::AcpMcpServer {
            name: "jupyter".into(),
            command: "jupyter-mcp-server".into(),
            args: vec!["serve".into()],
            env: vec![
                ("JUPYTER_URL".into(), "http://127.0.0.1:9000".into()),
                ("JUPYTER_TOKEN".into(), "secret-value".into()),
            ],
        })
        .unwrap();
        assert_eq!(token, "secret-value");
        let config = serde_json::to_string(&request.config).unwrap();
        assert!(config.contains("{env:JUPYTER_TOKEN}"));
        assert!(!config.contains("secret-value"));
    }

    #[test]
    fn explicit_new_command_routes_opencode_workflow_ids_to_driver_new() {
        let workspace = std::env::current_dir().unwrap().canonicalize().unwrap();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let mut host = AcpHost::default();
        host.register_driver(HostDriverKind::OpenCode, test_driver(calls.clone()));
        let request = test_launch_request(
            HostDriverKind::OpenCode,
            &workspace,
            "workflow:review:session-1",
        );

        futures::executor::block_on(route_registered_session(
            &mut host,
            &request,
            test_binding(HostDriverKind::OpenCode, &workspace),
            SessionLaunchRoute::ExplicitNew,
            false,
        ))
        .unwrap();

        assert_eq!(
            *calls.lock().unwrap(),
            [DriverCall::New {
                session_id: "workflow:review:session-1".into()
            }]
        );
    }

    #[test]
    fn compatibility_launch_restores_process_backed_engines() {
        let workspace = std::env::current_dir().unwrap().canonicalize().unwrap();
        for engine in [HostDriverKind::Codex, HostDriverKind::ClaudeCode] {
            let calls = Arc::new(Mutex::new(Vec::new()));
            let mut host = AcpHost::default();
            host.register_driver(engine, test_driver(calls.clone()));
            let profile = match engine {
                HostDriverKind::Codex => "codex",
                HostDriverKind::ClaudeCode => "claude-code",
                HostDriverKind::OpenCode => unreachable!(),
            };
            let request = test_launch_request(engine, &workspace, &format!("{profile}-restored"));

            futures::executor::block_on(route_registered_session(
                &mut host,
                &request,
                test_binding(engine, &workspace),
                SessionLaunchRoute::Compatibility,
                false,
            ))
            .unwrap();

            assert_eq!(
                *calls.lock().unwrap(),
                [DriverCall::Load {
                    session_id: format!("{profile}-restored")
                }]
            );
        }
    }

    #[test]
    fn compatibility_launch_loads_a_persisted_profile_id_session() {
        let workspace = std::env::current_dir().unwrap().canonicalize().unwrap();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let mut host = AcpHost::default();
        host.register_driver(HostDriverKind::Codex, test_driver(calls.clone()));
        let request = test_launch_request(HostDriverKind::Codex, &workspace, "codex");

        futures::executor::block_on(route_registered_session(
            &mut host,
            &request,
            test_binding(HostDriverKind::Codex, &workspace),
            SessionLaunchRoute::Compatibility,
            true,
        ))
        .unwrap();

        assert_eq!(
            *calls.lock().unwrap(),
            [DriverCall::Load {
                session_id: "codex".into()
            }]
        );
    }

    #[test]
    fn persisted_process_resume_request_uses_only_the_immutable_binding() {
        let workspace = std::env::current_dir().unwrap().canonicalize().unwrap();
        let mut persisted = test_persisted_session(
            "persisted-session",
            HostDriverKind::Codex,
            &workspace,
        );
        persisted.binding.model = Some("persisted-model".into());
        persisted.binding.provider = Some("persisted-provider".into());
        persisted.binding.profile_fingerprint = "opaque-fingerprint".into();
        persisted.base_url = Some("https://persisted.example/v1".into());
        persisted.credential = Some(CredentialRef {
            keychain_id: "keychain:original-profile".into(),
        });

        let request = process_resume_request(&persisted).unwrap();

        assert_eq!(request.engine, HostDriverKind::Codex);
        assert_eq!(request.profile_id, "codex");
        assert_eq!(request.session_id, "persisted-session");
        assert_eq!(request.model, "persisted-model");
        assert_eq!(request.provider_id, "persisted-provider");
        assert_eq!(request.base_url, "https://persisted.example/v1");
        assert_eq!(request.project_root, persisted.binding.project_root);
        assert_eq!(
            request.profile_fingerprint,
            persisted.binding.profile_fingerprint
        );
        assert_eq!(request.credential.keychain_id, "keychain:original-profile");
    }

    #[test]
    fn catalog_only_opencode_resume_is_explicitly_unsupported() {
        let workspace = std::env::current_dir().unwrap().canonicalize().unwrap();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let persisted = PersistedSession {
            id: "remote".into(),
            binding: test_binding(HostDriverKind::OpenCode, &workspace),
            base_url: None,
            credential: None,
            resumable: true,
            state: SessionStatus::Closed,
            title: None,
            directory: None,
            parent_id: None,
            created: None,
            updated: None,
        };
        let driver = Box::new(FakeDriver::with_calls(
            DriverCapabilities::default(),
            calls.clone(),
        ));
        let mut host = AcpHost::default();

        let error =
            futures::executor::block_on(resume_persisted_session(&mut host, &persisted, driver))
                .unwrap_err();

        assert_eq!(error, "driver OpenCode does not support resume_session");
        assert!(calls.lock().unwrap().is_empty());
    }

    #[test]
    fn active_cross_workspace_resume_rejects_before_calling_the_driver() {
        let workspace = std::env::current_dir().unwrap().canonicalize().unwrap();
        let other = workspace.parent().unwrap().canonicalize().unwrap();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let mut host = AcpHost::default();
        host.register_driver(HostDriverKind::OpenCode, test_driver(calls.clone()));
        futures::executor::block_on(host.new_session(
            NewSessionRequest {
                session_id: "foreign-active".into(),
            },
            test_binding(HostDriverKind::OpenCode, &other),
        ))
        .unwrap();
        calls.lock().unwrap().clear();

        let error = futures::executor::block_on(resume_active_session(
            &mut host,
            "foreign-active",
            &workspace,
        ))
        .unwrap_err();

        assert!(error.contains("active workspace"));
        assert!(calls.lock().unwrap().is_empty());
    }

    #[test]
    fn active_environment_adapter_candidate_precedes_bundled_resource() {
        let candidates = adapter_candidates(
            Some(Path::new("C:/app-data/environment/versions/v1")),
            Some(Path::new("C:/app/resources")),
            Path::new("codex-acp.exe"),
        );
        assert_eq!(
            candidates.first(),
            Some(&PathBuf::from(
                "C:/app-data/environment/versions/v1/codex-acp.exe"
            ))
        );
    }

    #[test]
    fn adapter_runtime_env_names_are_engine_specific() {
        assert_eq!(
            adapter_runtime_env_name(HostDriverKind::Codex),
            Some("CODEX_PATH")
        );
        assert_eq!(
            adapter_runtime_env_name(HostDriverKind::ClaudeCode),
            Some("CLAUDE_CODE_EXECUTABLE")
        );
        assert_eq!(adapter_runtime_env_name(HostDriverKind::OpenCode), None);
    }

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
                mcp_allow_list: Vec::new(),
                skills_snapshot: Vec::new(),
            },
            base_url: Some("https://api.example.invalid/v1".into()),
            credential: Some(CredentialRef {
                keychain_id: "keychain:provider-profile".into(),
            }),
            resumable: true,
            state: SessionStatus::Closed,
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
        assert!(encoded.contains("\"state\":\"closed\""));
        assert!(encoded.contains("keychain:provider-profile"));
        for secret in ["api_key", "token", "secret_value", "api-key"] {
            assert!(!encoded.contains(secret));
        }
    }

    #[test]
    fn legacy_persisted_session_defaults_to_closed_until_reloaded() {
        let value = serde_json::json!({
            "id": "legacy",
            "binding": {
                "engine": "opencode",
                "profile": "opencode",
                "model": "model",
                "provider": "provider",
                "variant": null,
                "projectRoot": "C:/science",
                "profileFingerprint": "fp",
                "resolvedAt": "now"
            },
            "resumable": true
        });
        let persisted: PersistedSession = serde_json::from_value(value).unwrap();
        assert_eq!(persisted.state, SessionStatus::Closed);
        assert!(persisted.resumable);
    }

    #[test]
    fn project_root_validation_rejects_cross_workspace_requests() {
        let workspace = std::env::current_dir().unwrap().canonicalize().unwrap();
        let requested = workspace.to_string_lossy().into_owned();
        assert!(validate_project_root(&requested, &workspace).is_ok());

        let other = workspace.parent().unwrap().canonicalize().unwrap();
        let requested = other.to_string_lossy().into_owned();
        let error = validate_project_root(&requested, &workspace).unwrap_err();
        assert!(error.contains("active workspace"));
    }

    #[test]
    fn session_listing_keeps_only_bindings_from_the_active_workspace() {
        let workspace = std::env::current_dir().unwrap().canonicalize().unwrap();
        let other = workspace.parent().unwrap().canonicalize().unwrap();
        let mut sessions = vec![
            test_session(
                "active-current",
                test_binding(HostDriverKind::OpenCode, &workspace),
                Some(&workspace),
            ),
            test_session(
                "catalog-current",
                test_binding(HostDriverKind::Codex, &workspace),
                Some(&workspace),
            ),
            test_session(
                "active-other",
                test_binding(HostDriverKind::OpenCode, &other),
                Some(&other),
            ),
            test_session(
                "catalog-other",
                test_binding(HostDriverKind::ClaudeCode, &other),
                Some(&other),
            ),
        ];

        retain_workspace_sessions(&mut sessions, &workspace);

        assert_eq!(
            sessions
                .iter()
                .map(|session| session.id.as_str())
                .collect::<Vec<_>>(),
            ["active-current", "catalog-current"]
        );
    }

    #[test]
    fn discovery_drops_and_does_not_persist_sessions_from_other_workspaces() {
        let workspace = std::env::current_dir().unwrap().canonicalize().unwrap();
        let other = workspace.parent().unwrap().canonicalize().unwrap();
        let current_binding = test_binding(HostDriverKind::OpenCode, &workspace);
        let mut catalog = HashMap::new();
        let discovered = vec![
            test_session("current", current_binding.clone(), Some(&workspace)),
            // OpenCode discovery reuses the driver's current binding, so the
            // original directory is the authoritative workspace discriminator.
            test_session("other", current_binding, Some(&other)),
        ];

        let sessions = merge_discovered_sessions(&mut catalog, discovered, &workspace);

        assert_eq!(
            sessions
                .iter()
                .map(|session| session.id.as_str())
                .collect::<Vec<_>>(),
            ["current"]
        );
        assert!(catalog.contains_key("current"));
        assert!(!catalog.contains_key("other"));
    }

    #[test]
    fn discovery_does_not_rebind_a_cross_workspace_catalog_collision() {
        let workspace = std::env::current_dir().unwrap().canonicalize().unwrap();
        let other = workspace.parent().unwrap().canonicalize().unwrap();
        let mut catalog = HashMap::from([(
            "collision".into(),
            test_persisted_session("collision", HostDriverKind::OpenCode, &other),
        )]);
        let discovered = vec![test_session(
            "collision",
            test_binding(HostDriverKind::OpenCode, &workspace),
            Some(&workspace),
        )];

        let sessions = merge_discovered_sessions(&mut catalog, discovered, &workspace);

        assert!(sessions.is_empty());
        assert_eq!(
            catalog["collision"].binding.project_root,
            other.to_string_lossy()
        );
    }

    #[test]
    fn catalog_only_opencode_close_removes_after_remote_success() {
        let workspace = std::env::current_dir().unwrap().canonicalize().unwrap();
        let mut catalog = HashMap::from([(
            "remote".into(),
            test_persisted_session("remote", HostDriverKind::OpenCode, &workspace),
        )]);

        futures::executor::block_on(close_catalog_only_session(
            &mut catalog,
            "remote",
            &workspace,
            |binding, session_id| async move {
                assert_eq!(binding.engine, HostDriverKind::OpenCode);
                assert_eq!(session_id, "remote");
                Ok(())
            },
        ))
        .unwrap();

        assert!(!catalog.contains_key("remote"));
    }

    #[test]
    fn catalog_only_opencode_close_keeps_catalog_after_remote_failure() {
        let workspace = std::env::current_dir().unwrap().canonicalize().unwrap();
        let mut catalog = HashMap::from([(
            "remote".into(),
            test_persisted_session("remote", HostDriverKind::OpenCode, &workspace),
        )]);

        let error = futures::executor::block_on(close_catalog_only_session(
            &mut catalog,
            "remote",
            &workspace,
            |_, _| async { Err("remote close failed".into()) },
        ))
        .unwrap_err();

        assert!(error.contains("remote close failed"));
        assert!(catalog.contains_key("remote"));
    }

    #[test]
    fn catalog_only_process_sessions_allow_explicit_local_catalog_deletion() {
        let workspace = std::env::current_dir().unwrap().canonicalize().unwrap();
        for engine in [HostDriverKind::Codex, HostDriverKind::ClaudeCode] {
            let mut catalog = HashMap::from([(
                "local".into(),
                test_persisted_session("local", engine, &workspace),
            )]);

            futures::executor::block_on(close_catalog_only_session(
                &mut catalog,
                "local",
                &workspace,
                |_, _| async { panic!("process catalog cleanup must not call OpenCode") },
            ))
            .unwrap();

            assert!(!catalog.contains_key("local"));
        }
    }

    #[test]
    fn catalog_only_close_rejects_cross_workspace_sessions() {
        let workspace = std::env::current_dir().unwrap().canonicalize().unwrap();
        let other = workspace.parent().unwrap().canonicalize().unwrap();
        let mut catalog = HashMap::from([(
            "other".into(),
            test_persisted_session("other", HostDriverKind::OpenCode, &other),
        )]);

        let error = futures::executor::block_on(close_catalog_only_session(
            &mut catalog,
            "other",
            &workspace,
            |_, _| async { panic!("cross-workspace close must stop before remote cleanup") },
        ))
        .unwrap_err();

        assert!(error.contains("active workspace"));
        assert!(catalog.contains_key("other"));
    }
}
