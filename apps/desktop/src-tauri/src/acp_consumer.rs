// Phase 2 of the ACP runtime (see docs/rfc/agent-runtime.md): the consumer that
// launches an external ACP agent through the `zerowall-acp` crate, owns its
// lifecycle, forwards its event stream to the frontend as Tauri events, and
// bridges permission requests back to the host's approval UI.
//
// One session at a time (like the Jupyter integration): a runtime switch shuts
// the previous agent down before starting the next. The agent child process is
// spawned and torn down by the SDK inside `zerowall-acp`; this module holds the
// `AcpClient` command handle and drives the event receiver.
//
// Key injection (keychain -> spawn env) is Phase 4; the launch path here builds
// the profile with an empty env and marks the seam.
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use futures::channel::oneshot;
use futures::StreamExt;
use tauri::{AppHandle, Emitter, Manager, State};
use zerowall_acp::{AcpAgentProfile, AcpClient, AcpEvent};

use crate::runtime::workspace_dir;

/// Held while a session is live. Dropping `client` closes its command channel,
/// which the driver task observes and tears the agent down.
struct ActiveSession {
    /// Generation of this session. A relaunch bumps it; a stale driver task
    /// that reports `Exited` after the switch must not clear the newer session.
    epoch: u64,
    /// Profile id of the running agent, echoed back in status.
    profile_id: String,
    /// Command handle into the running session.
    client: AcpClient,
}

#[derive(Default)]
pub struct AcpConsumerState {
    /// The single live session, if any.
    session: Mutex<Option<ActiveSession>>,
    /// Serializes launch / shutdown so overlapping runtime switches can never
    /// leave two agents running.
    lifecycle: Mutex<()>,
    /// Permission requests awaiting a host decision, keyed by a monotonic id.
    /// The oneshot sender is not clonable and lives only here between the
    /// `acp:permission` event and the `acp_reply_permission` reply.
    pending: Mutex<HashMap<u64, oneshot::Sender<Option<String>>>>,
    /// Command-execution approvals awaiting a host decision, keyed by a
    /// monotonic id. Separate from `pending` because the reply is a boolean
    /// allow/reject rather than a chosen option id.
    pending_exec: Mutex<HashMap<u64, oneshot::Sender<bool>>>,
    /// Source of permission ids.
    next_permission_id: AtomicU64,
    /// Source of session epochs.
    next_epoch: AtomicU64,
}

/// A launch request from the frontend. The agent profile (`{id, label, command,
/// args}`) plus secret *references* — never secret values. Each reference names
/// an env var to set and the provider whose keychain-stored key supplies it;
/// `acp_launch` materializes the key server-side at spawn time (see AGENTS.md:
/// "API keys go to the OS keychain ... never into ... exported projects").
#[derive(serde::Deserialize)]
pub struct AcpLaunchRequest {
    pub id: String,
    pub label: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    /// Extra environment variables the agent needs that are NOT secrets (model
    /// selection, base URLs, feature flags). Secret values are rejected here —
    /// use `secrets` instead so the key stays in the keychain.
    #[serde(default)]
    pub env: Vec<(String, String)>,
    /// Secret injections: `{ env_var, provider_id }`. The key is read from the
    /// keychain at launch and set as `env_var`; a missing key is a hard error so
    /// the agent never starts silently unauthenticated.
    #[serde(default)]
    pub secrets: Vec<AcpSecretRef>,
}

/// A single keychain-backed environment injection for an ACP agent.
#[derive(serde::Deserialize)]
pub struct AcpSecretRef {
    /// Environment variable name the agent reads (e.g. `OPENAI_API_KEY`).
    pub env_var: String,
    /// Provider id whose stored key backs this variable (e.g. `openai`).
    pub provider_id: String,
}

#[derive(serde::Serialize, Clone)]
pub struct AcpStatus {
    pub running: bool,
    pub profile_id: Option<String>,
}

fn status_of(state: &AcpConsumerState) -> AcpStatus {
    let session = state.session.lock().unwrap();
    AcpStatus {
        running: session.is_some(),
        profile_id: session.as_ref().map(|s| s.profile_id.clone()),
    }
}

#[tauri::command]
pub fn acp_status(state: State<'_, AcpConsumerState>) -> AcpStatus {
    status_of(&state)
}

/// Launch `request` as the active ACP session, rooted at the current workspace.
/// If a session is already running it is shut down first (runtime switch).
///
/// `async`: shutting the previous agent down and spawning a child must not block
/// the UI thread.
#[tauri::command(async)]
pub fn acp_launch(
    app: AppHandle,
    state: State<'_, AcpConsumerState>,
    request: AcpLaunchRequest,
) -> Result<AcpStatus, String> {
    let _guard = state.lifecycle.lock().unwrap();

    // Replace any existing session (runtime switch or relaunch).
    shutdown_locked(&state);

    let cwd = workspace_dir(&app)?;

    // Materialize secret env vars from the keychain. Reserved names (PATH, HOME,
    // OPENCODE_*, ...) are refused so a profile can't shadow the host environment.
    let mut env = request.env.clone();
    for secret in &request.secrets {
        crate::secret_store::validate_acp_env_name(&secret.env_var)?;
        let key = crate::secret_store::provider_api_key(&app, &secret.provider_id)?
            .ok_or_else(|| format!("no stored key for provider {}", secret.provider_id))?;
        env.push((secret.env_var.clone(), key));
    }

    let profile = AcpAgentProfile {
        id: request.id.clone(),
        label: request.label,
        command: request.command,
        args: request.args,
        // Values materialized from the OS keychain above; never logged or persisted.
        env,
    };

    let (client, events, driver) = AcpClient::launch(&profile, cwd);
    let epoch = state.next_epoch.fetch_add(1, Ordering::Relaxed);

    // The SDK-owned connection future drives the agent; run it on tokio.
    tauri::async_runtime::spawn(driver);
    // Forward the event stream to the frontend.
    pump_events(app.clone(), events, epoch);

    *state.session.lock().unwrap() = Some(ActiveSession {
        epoch,
        profile_id: request.id,
        client,
    });
    Ok(status_of(&state))
}

/// Send a user prompt as one turn to the active session.
#[tauri::command]
pub fn acp_prompt(state: State<'_, AcpConsumerState>, text: String) -> Result<(), String> {
    let session = state.session.lock().unwrap();
    let session = session.as_ref().ok_or("no active ACP session")?;
    session.client.prompt(text).map_err(|e| e.to_string())
}

/// Cancel the in-flight turn of the active session.
#[tauri::command]
pub fn acp_cancel(state: State<'_, AcpConsumerState>) -> Result<(), String> {
    let session = state.session.lock().unwrap();
    let session = session.as_ref().ok_or("no active ACP session")?;
    session.client.cancel().map_err(|e| e.to_string())
}

/// Shut the active session down and terminate the agent.
#[tauri::command(async)]
pub fn acp_shutdown(state: State<'_, AcpConsumerState>) -> Result<AcpStatus, String> {
    let _guard = state.lifecycle.lock().unwrap();
    shutdown_locked(&state);
    Ok(status_of(&state))
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

/// Terminate the active session if present. Caller holds `lifecycle`.
fn shutdown_locked(state: &AcpConsumerState) {
    if let Some(session) = state.session.lock().unwrap().take() {
        // Best-effort graceful shutdown; dropping the client also closes the
        // command channel, which tears the agent down.
        let _ = session.client.shutdown();
    }
    // Drop any permission requests that were awaiting a decision: their senders
    // close, and the crate fails those permissions closed.
    state.pending.lock().unwrap().clear();
    // Same for pending command-execution approvals: dropping the sender rejects
    // the exec (fail-closed), so no orphaned command spawns after teardown.
    state.pending_exec.lock().unwrap().clear();
}

/// Called on app exit to guarantee the agent child is not orphaned.
pub fn kill_acp(state: &AcpConsumerState) {
    let _guard = state.lifecycle.lock().unwrap();
    shutdown_locked(state);
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
    cost: Option<CostPayload>,
}

#[derive(serde::Serialize, Clone)]
struct CostPayload {
    amount: f64,
    currency: String,
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
) {
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.next().await {
            match event {
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
                            cost: usage.cost.map(|c| CostPayload {
                                amount: c.amount,
                                currency: c.currency,
                            }),
                        },
                    );
                }
                AcpEvent::FileWritten { path } => {
                    // The agent wrote a workspace file (already sandbox-checked
                    // in the crate). Record provenance so the write is auditable
                    // like any other agent write, then notify the frontend.
                    if let Ok(root) = workspace_dir(&app) {
                        let _ = crate::provenance::append_record(
                            &root, &path, "acp-write", None, None, None, None, None, None, None,
                        );
                    }
                    let _ = app.emit("acp:file-written", path);
                }
                AcpEvent::Permission { request, options, reply } => {
                    let state = app.state::<AcpConsumerState>();
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
                AcpEvent::ExecApproval { command, args, cwd, reply } => {
                    let state = app.state::<AcpConsumerState>();
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
                AcpEvent::TurnEnded { stop_reason } => {
                    let _ = app.emit("acp:turn-ended", stop_reason);
                }
                AcpEvent::Exited { error } => {
                    let _ = app.emit("acp:exited", error);
                    // Only clear if this task still owns the active session; a
                    // relaunch may have replaced it while our agent was exiting.
                    let state = app.state::<AcpConsumerState>();
                    let mut session = state.session.lock().unwrap();
                    if session.as_ref().map(|s| s.epoch) == Some(epoch) {
                        *session = None;
                        state.pending.lock().unwrap().clear();
                        state.pending_exec.lock().unwrap().clear();
                    }
                    break;
                }
            }
        }
    });
}
