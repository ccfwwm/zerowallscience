//! ZeroWall Science ACP client.
//!
//! An original implementation of an Agent Client Protocol (ACP) *client* built
//! directly on the Zed `agent-client-protocol` SDK (Apache-2.0). ZeroWall acts
//! as the ACP client and drives external ACP-compliant coding agents (Codex,
//! Claude Code, or any conforming agent) as local child processes over stdio
//! JSON-RPC.
//!
//! This crate is MIT-licensed and is not derived from any other ACP client
//! implementation; it is written against the SDK's public API. See NOTICE for
//! the Apache-2.0 attribution of the SDK dependency.
//!
//! # Model
//!
//! The SDK's connection API is *callback-scoped*: [`Client::connect_with`] owns
//! the connection for the lifetime of an async closure. A desktop host, though,
//! needs a session it can hold across many IPC turns and feed prompts to at
//! arbitrary later times. This crate bridges the two:
//!
//! - [`AcpClient::launch`] spawns the agent process and, on a background task,
//!   drives one long-lived `connect_with` closure.
//! - The closure initializes the connection, opens one ACP session, then loops
//!   over an inbound [`AcpCommand`] channel (`prompt` / `cancel` / `shutdown`),
//!   issuing the matching JSON-RPC request for each.
//! - Streaming notifications (assistant/thought chunks, tool calls, plans, usage)
//!   arrive on the SDK's notification handler and are forwarded out as
//!   [`AcpEvent`]s.
//! - Permission requests arrive on the SDK's request handler; the handler emits
//!   an [`AcpEvent::Permission`] carrying a one-shot reply channel and awaits the
//!   host's decision before responding — so approval gating stays in the host.
//!
//! Process spawning, environment injection, `CREATE_NO_WINDOW` on Windows, and
//! kill-on-drop teardown are all provided by the SDK's [`AcpAgent`]/`ConnectTo`
//! layer; this crate does not reimplement them.

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use agent_client_protocol::schema::v1::{
    ClientCapabilities, ContentBlock, CreateTerminalRequest, CreateTerminalResponse, EnvVariable,
    FileSystemCapabilities, InitializeRequest, KillTerminalRequest, KillTerminalResponse, McpServer,
    McpServerStdio, NewSessionRequest, PromptRequest, ReadTextFileRequest, ReadTextFileResponse,
    ReleaseTerminalRequest, ReleaseTerminalResponse, RequestPermissionOutcome,
    RequestPermissionRequest, RequestPermissionResponse, SelectedPermissionOutcome,
    SessionNotification, SessionUpdate, StopReason, TerminalExitStatus, TerminalId,
    TerminalOutputRequest, TerminalOutputResponse, WaitForTerminalExitRequest,
    WaitForTerminalExitResponse, WriteTextFileRequest, WriteTextFileResponse,
};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::{AcpAgent, Agent, ConnectionTo, Responder};
use futures::channel::{mpsc, oneshot};
use futures::StreamExt;
use tokio::io::{AsyncRead, AsyncReadExt};

/// A launchable external ACP agent: the command to run and the environment to
/// run it in.
///
/// This is ZeroWall's own profile shape (not an SDK type) so the desktop can
/// persist it and inject secrets into `env` at spawn time. `env` values are
/// materialized from the OS keychain by the caller immediately before launch
/// and MUST NOT be logged or persisted (see AGENTS.md).
#[derive(Debug, Clone)]
pub struct AcpAgentProfile {
    /// Stable identifier (e.g. `"codex"`, `"claude-code"`).
    pub id: String,
    /// Human-readable label for the runtime switcher.
    pub label: String,
    /// Executable to run (absolute path or a name resolved on PATH).
    pub command: String,
    /// Arguments passed to the executable.
    pub args: Vec<String>,
    /// Environment variables for the child process. Secret values (API keys)
    /// belong here and are never logged.
    pub env: Vec<(String, String)>,
}

impl AcpAgentProfile {
    /// Build the SDK agent descriptor (stdio transport) for this profile.
    ///
    /// The SDK owns the actual spawn, including `CREATE_NO_WINDOW` on Windows
    /// and process-group teardown on Unix.
    fn to_acp_agent(&self) -> AcpAgent {
        let env = self
            .env
            .iter()
            .map(|(name, value)| EnvVariable::new(name.clone(), value.clone()))
            .collect::<Vec<_>>();
        let server = McpServer::Stdio(
            McpServerStdio::new(self.id.clone(), PathBuf::from(&self.command))
                .args(self.args.clone())
                .env(env),
        );
        AcpAgent::new(server)
    }
}

/// Token / cost / context-window usage for the session, mapped from the ACP
/// `session/update` `UsageUpdate`.
///
/// Shape chosen to feed ZeroWall's Part T usage accounting directly: `cost` is
/// optional (an agent that does not price its turns leaves it `None`, which the
/// UI renders as `—`, distinct from a real `$0.00`).
#[derive(Debug, Clone)]
pub struct AcpUsageUpdate {
    /// Tokens currently in the context window.
    pub used: u64,
    /// Total context-window size in tokens.
    pub size: u64,
    /// Cumulative session cost, if the agent reports one.
    pub cost: Option<AcpUsageCost>,
}

/// A monetary cost reported by the agent.
#[derive(Debug, Clone)]
pub struct AcpUsageCost {
    /// Cumulative amount.
    pub amount: f64,
    /// ISO 4217 currency code (e.g. `"USD"`).
    pub currency: String,
}

/// A permission option offered by the agent for a `session/request_permission`.
#[derive(Debug, Clone)]
pub struct AcpPermissionOption {
    /// Opaque id to echo back when this option is chosen.
    pub option_id: String,
    /// Human-readable label to show the user.
    pub name: String,
}

/// Events emitted by a running ACP session, forwarded to the host.
#[derive(Debug)]
pub enum AcpEvent {
    /// A chunk of the agent's visible response. `message_id` groups chunks that
    /// belong to the same assistant message (a change starts a new message).
    AgentMessage {
        /// Message this chunk belongs to, if the agent supplies one.
        message_id: Option<String>,
        /// The chunk's text (non-text content blocks are rendered to a short
        /// placeholder).
        text: String,
    },
    /// A chunk of the agent's internal reasoning.
    AgentThought {
        /// Message this chunk belongs to, if the agent supplies one.
        message_id: Option<String>,
        /// The reasoning text.
        text: String,
    },
    /// A tool call was initiated or updated. Carried as raw JSON so the host can
    /// render whatever the agent reports without this crate modeling every field.
    ToolCall(serde_json::Value),
    /// The agent's execution plan, as raw JSON.
    Plan(serde_json::Value),
    /// Context-window / cost usage update.
    Usage(AcpUsageUpdate),
    /// The agent wrote a file inside the workspace (a client-hosted
    /// `fs/write_text_file` the sandbox allowed). The host records this to
    /// `provenance.jsonl`. Carried after the write succeeds.
    FileWritten {
        /// Absolute path of the written file (already sandbox-validated).
        path: String,
    },
    /// The agent is asking permission to act. The host decides, then sends the
    /// chosen `option_id` (or `None` to reject/cancel) back on `reply`.
    Permission {
        /// Raw permission request JSON (tool call, explanation, etc.).
        request: serde_json::Value,
        /// The options the agent offers.
        options: Vec<AcpPermissionOption>,
        /// One-shot reply: `Some(option_id)` selects an option; `None` cancels.
        reply: oneshot::Sender<Option<String>>,
    },
    /// The agent wants to run a command in a client-hosted terminal
    /// (`terminal/create`). Command execution is a non-negotiable approval gate
    /// (see AGENTS.md): the host must approve before the process is spawned. The
    /// host sends `true` to allow or `false` to reject; a dropped channel rejects
    /// (fail-closed).
    ExecApproval {
        /// The executable the agent wants to run.
        command: String,
        /// Arguments to the executable.
        args: Vec<String>,
        /// Working directory (already sandboxed to the workspace), if the agent
        /// specified one; otherwise the workspace root is used.
        cwd: Option<String>,
        /// One-shot reply: `true` allows the spawn, `false` rejects it.
        reply: oneshot::Sender<bool>,
    },
    /// A prompt turn finished with the given stop reason (`"end_turn"`,
    /// `"cancelled"`, `"max_tokens"`, `"refusal"`, `"max_turn_requests"`).
    TurnEnded {
        /// The turn's stop reason.
        stop_reason: String,
    },
    /// The session ended. `error` is `None` on a clean shutdown, otherwise a
    /// human-readable reason (process exit, transport error).
    Exited {
        /// Failure reason, if the session did not end cleanly.
        error: Option<String>,
    },
}

/// A command sent from the host into a running ACP session.
#[derive(Debug)]
enum AcpCommand {
    /// Send a user prompt (plain text) as one turn.
    Prompt(String),
    /// Cancel the in-flight turn for this session.
    Cancel,
    /// Shut the session down and terminate the agent.
    Shutdown,
}

/// Errors from launching or driving an ACP session.
#[derive(Debug)]
pub enum AcpError {
    /// The session's command channel is closed (the agent task has exited).
    Closed,
    /// An error surfaced by the SDK or transport.
    Protocol(String),
}

impl std::fmt::Display for AcpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AcpError::Closed => write!(f, "ACP session is closed"),
            AcpError::Protocol(msg) => write!(f, "ACP protocol error: {msg}"),
        }
    }
}

impl std::error::Error for AcpError {}

/// A handle to a running ACP session.
///
/// Holds the outbound command channel; the agent process and connection live on
/// a background task. Dropping the handle (closing the channel) lets the session
/// task observe the closure and tear the agent down.
#[derive(Debug)]
pub struct AcpClient {
    commands: mpsc::UnboundedSender<AcpCommand>,
}

impl AcpClient {
    /// Launch `profile` with its session rooted at `cwd`, returning a handle and
    /// the stream of [`AcpEvent`]s.
    ///
    /// The agent runs on a background task driven by the provided async
    /// executor via [`ConnectionTo::spawn`]-style scheduling inside the SDK. The
    /// event receiver closes when the session ends.
    ///
    /// The caller is responsible for `spawn`ing the returned future on its
    /// runtime (Tauri's tokio). This keeps the crate runtime-agnostic.
    pub fn launch(
        profile: &AcpAgentProfile,
        cwd: PathBuf,
    ) -> (
        AcpClient,
        mpsc::UnboundedReceiver<AcpEvent>,
        impl std::future::Future<Output = ()> + Send,
    ) {
        let (command_tx, command_rx) = mpsc::unbounded::<AcpCommand>();
        let (event_tx, event_rx) = mpsc::unbounded::<AcpEvent>();
        let agent = profile.to_acp_agent();

        let driver = run_session(agent, cwd, command_rx, event_tx);

        (
            AcpClient {
                commands: command_tx,
            },
            event_rx,
            driver,
        )
    }

    /// Send a user prompt as one turn.
    pub fn prompt(&self, text: impl Into<String>) -> Result<(), AcpError> {
        self.commands
            .unbounded_send(AcpCommand::Prompt(text.into()))
            .map_err(|_| AcpError::Closed)
    }

    /// Cancel the in-flight turn.
    pub fn cancel(&self) -> Result<(), AcpError> {
        self.commands
            .unbounded_send(AcpCommand::Cancel)
            .map_err(|_| AcpError::Closed)
    }

    /// Shut the session down and terminate the agent.
    pub fn shutdown(&self) -> Result<(), AcpError> {
        self.commands
            .unbounded_send(AcpCommand::Shutdown)
            .map_err(|_| AcpError::Closed)
    }
}

/// Drive one ACP session end-to-end. Resolves when the session ends.
async fn run_session(
    agent: AcpAgent,
    cwd: PathBuf,
    command_rx: mpsc::UnboundedReceiver<AcpCommand>,
    event_tx: mpsc::UnboundedSender<AcpEvent>,
) {
    let notify_tx = event_tx.clone();
    let permission_tx = event_tx.clone();
    let write_tx = event_tx.clone();
    // Reserved for reporting a connection-level failure that happens before the
    // foreground closure runs (and thus before it can emit `Exited`).
    let fallback_tx = event_tx.clone();

    // The workspace root each client-hosted fs request is sandboxed against.
    // The agent may only read/write inside this directory (fail-closed).
    let read_root = cwd.clone();
    let write_root = cwd.clone();

    // Client-hosted terminals. Each `terminal/*` request routes through here so
    // command execution stays gated by the host's approval UI and rooted in the
    // workspace. The manager is shared across all five terminal handlers.
    let terminals = Arc::new(TerminalManager::default());
    let create_terminals = terminals.clone();
    let create_root = cwd.clone();
    let create_tx = event_tx.clone();
    let output_terminals = terminals.clone();
    let wait_terminals = terminals.clone();
    let kill_terminals = terminals.clone();
    let release_terminals = terminals.clone();

    let result = agent_client_protocol::Client
        .builder()
        .name("zerowall-science")
        .on_receive_notification(
            move |notification: SessionNotification, _cx| {
                let tx = notify_tx.clone();
                async move {
                    forward_notification(&tx, notification.update);
                    Ok(())
                }
            },
            agent_client_protocol::on_receive_notification!(),
        )
        .on_receive_request(
            move |request: RequestPermissionRequest,
                  responder: Responder<RequestPermissionResponse>,
                  _cx| {
                let tx = permission_tx.clone();
                async move {
                    let outcome = ask_permission(&tx, request).await;
                    responder.respond(RequestPermissionResponse::new(outcome))
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            move |request: ReadTextFileRequest,
                  responder: Responder<ReadTextFileResponse>,
                  _cx| {
                let root = read_root.clone();
                async move {
                    match handle_read(&root, request) {
                        Ok(response) => responder.respond(response),
                        Err(err) => Err(err),
                    }
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            move |request: WriteTextFileRequest,
                  responder: Responder<WriteTextFileResponse>,
                  _cx| {
                let root = write_root.clone();
                let tx = write_tx.clone();
                async move {
                    match handle_write(&root, &tx, request) {
                        Ok(response) => responder.respond(response),
                        Err(err) => Err(err),
                    }
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            move |request: CreateTerminalRequest,
                  responder: Responder<CreateTerminalResponse>,
                  _cx| {
                let manager = create_terminals.clone();
                let root = create_root.clone();
                let tx = create_tx.clone();
                async move {
                    match handle_create_terminal(&manager, &root, &tx, request).await {
                        Ok(response) => responder.respond(response),
                        Err(err) => Err(err),
                    }
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            move |request: TerminalOutputRequest,
                  responder: Responder<TerminalOutputResponse>,
                  _cx| {
                let manager = output_terminals.clone();
                async move {
                    match handle_terminal_output(&manager, request) {
                        Ok(response) => responder.respond(response),
                        Err(err) => Err(err),
                    }
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            move |request: WaitForTerminalExitRequest,
                  responder: Responder<WaitForTerminalExitResponse>,
                  _cx| {
                let manager = wait_terminals.clone();
                async move {
                    match handle_wait_for_exit(&manager, request).await {
                        Ok(response) => responder.respond(response),
                        Err(err) => Err(err),
                    }
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            move |request: KillTerminalRequest,
                  responder: Responder<KillTerminalResponse>,
                  _cx| {
                let manager = kill_terminals.clone();
                async move {
                    match handle_kill_terminal(&manager, request) {
                        Ok(response) => responder.respond(response),
                        Err(err) => Err(err),
                    }
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            move |request: ReleaseTerminalRequest,
                  responder: Responder<ReleaseTerminalResponse>,
                  _cx| {
                let manager = release_terminals.clone();
                async move {
                    match handle_release_terminal(&manager, request) {
                        Ok(response) => responder.respond(response),
                        Err(err) => Err(err),
                    }
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .connect_with(agent, |cx: ConnectionTo<Agent>| {
            let event_tx = event_tx.clone();
            async move { drive(cx, cwd, command_rx, event_tx).await }
        })
        .await;

    // `event_tx` was moved into the closure; the closure already emitted
    // `Exited`. If the connection itself failed before the closure ran, report
    // it on a sender clone that outlives the builder.
    if let Err(err) = result {
        let _ = fallback_tx.unbounded_send(AcpEvent::Exited {
            error: Some(format!("{err}")),
        });
    }
}

/// The foreground closure: initialize, open a session, then pump commands.
async fn drive(
    cx: ConnectionTo<Agent>,
    cwd: PathBuf,
    mut command_rx: mpsc::UnboundedReceiver<AcpCommand>,
    event_tx: mpsc::UnboundedSender<AcpEvent>,
) -> Result<(), agent_client_protocol::Error> {
    // 1. Handshake. Advertise client-hosted filesystem (read + write) and
    //    terminal support so the agent routes file and command execution back
    //    through us. Terminal is safe to advertise now because every
    //    `terminal/create` is gated by an `ExecApproval` the host must answer
    //    before the process spawns (see `handle_create_terminal`). Capabilities
    //    are the security lever: an unadvertised capability is never requested.
    let capabilities = ClientCapabilities::new()
        .fs(FileSystemCapabilities::new()
            .read_text_file(true)
            .write_text_file(true))
        .terminal(true);
    cx.send_request(InitializeRequest::new(ProtocolVersion::V1).client_capabilities(capabilities))
        .block_task()
        .await?;

    // 2. One session, rooted at the workspace.
    let session = cx
        .send_request(NewSessionRequest::new(cwd))
        .block_task()
        .await?;
    let session_id = session.session_id;

    // 3. Pump host commands until the channel closes or a shutdown arrives.
    let mut exit_error: Option<String> = None;
    while let Some(command) = command_rx.next().await {
        match command {
            AcpCommand::Prompt(text) => {
                let request = PromptRequest::new(
                    session_id.clone(),
                    vec![ContentBlock::from(text)],
                );
                match cx.send_request(request).block_task().await {
                    Ok(response) => {
                        let _ = event_tx.unbounded_send(AcpEvent::TurnEnded {
                            stop_reason: stop_reason_str(response.stop_reason).to_string(),
                        });
                    }
                    Err(err) => {
                        exit_error = Some(format!("{err}"));
                        break;
                    }
                }
            }
            AcpCommand::Cancel => {
                use agent_client_protocol::schema::v1::CancelNotification;
                let _ = cx.send_notification(CancelNotification::new(session_id.clone()));
            }
            AcpCommand::Shutdown => break,
        }
    }

    let _ = event_tx.unbounded_send(AcpEvent::Exited { error: exit_error });
    Ok(())
}

/// Map a `SessionUpdate` to the host-facing event, if it carries one we surface.
fn forward_notification(tx: &mpsc::UnboundedSender<AcpEvent>, update: SessionUpdate) {
    let event = match update {
        SessionUpdate::AgentMessageChunk(chunk) => Some(AcpEvent::AgentMessage {
            message_id: chunk.message_id.map(|id| id.to_string()),
            text: content_block_text(&chunk.content),
        }),
        SessionUpdate::AgentThoughtChunk(chunk) => Some(AcpEvent::AgentThought {
            message_id: chunk.message_id.map(|id| id.to_string()),
            text: content_block_text(&chunk.content),
        }),
        SessionUpdate::ToolCall(tool_call) => {
            serde_json::to_value(&tool_call).ok().map(AcpEvent::ToolCall)
        }
        SessionUpdate::ToolCallUpdate(tool_call) => {
            serde_json::to_value(&tool_call).ok().map(AcpEvent::ToolCall)
        }
        SessionUpdate::Plan(plan) => serde_json::to_value(&plan).ok().map(AcpEvent::Plan),
        SessionUpdate::UsageUpdate(usage) => Some(AcpEvent::Usage(AcpUsageUpdate {
            used: usage.used,
            size: usage.size,
            cost: usage.cost.map(|c| AcpUsageCost {
                amount: c.amount,
                currency: c.currency,
            }),
        })),
        // User-message echoes, command lists, mode/config/session-info updates,
        // and any future non-exhaustive variants are not surfaced here.
        _ => None,
    };
    if let Some(event) = event {
        let _ = tx.unbounded_send(event);
    }
}

/// Emit a `Permission` event and await the host's decision.
async fn ask_permission(
    tx: &mpsc::UnboundedSender<AcpEvent>,
    request: RequestPermissionRequest,
) -> RequestPermissionOutcome {
    let options = request
        .options
        .iter()
        .map(|opt| AcpPermissionOption {
            option_id: opt.option_id.to_string(),
            name: opt.name.clone(),
        })
        .collect::<Vec<_>>();
    let request_json = serde_json::to_value(&request).unwrap_or(serde_json::Value::Null);

    let (reply_tx, reply_rx) = oneshot::channel::<Option<String>>();
    if tx
        .unbounded_send(AcpEvent::Permission {
            request: request_json,
            options,
            reply: reply_tx,
        })
        .is_err()
    {
        // Host is gone: fail closed.
        return RequestPermissionOutcome::Cancelled;
    }

    match reply_rx.await {
        Ok(Some(option_id)) => RequestPermissionOutcome::Selected(
            SelectedPermissionOutcome::new(option_id),
        ),
        // Rejected by the host, or the host dropped the channel: fail closed.
        Ok(None) | Err(_) => RequestPermissionOutcome::Cancelled,
    }
}

/// Resolve `requested` against the workspace `root`, returning the sandboxed
/// absolute path or an error if it escapes the workspace. Fail-closed.
///
/// The path is normalized *lexically* (no filesystem access) so it also works
/// for writes whose target does not yet exist: absolute paths only, and every
/// `..` must be balanced by a prior real segment so it can never climb above
/// `root`. If a symlink-based escape were a concern the host also confirms the
/// canonical parent, but the lexical check alone rejects the classic
/// `../../etc/passwd` traversal.
///
/// `root` is assumed already absolute (it is the workspace dir the host owns).
fn sandbox_path(root: &Path, requested: &Path) -> Result<PathBuf, String> {
    if !requested.is_absolute() {
        return Err(format!("path must be absolute: {}", requested.display()));
    }
    // Lexically normalize: drop `.`, resolve `..` against accumulated segments,
    // reject any `..` that would pop above the path's own root.
    let mut normalized = PathBuf::new();
    for component in requested.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    return Err(format!(
                        "path escapes its root: {}",
                        requested.display()
                    ));
                }
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    // Normalize the root the same way (it may contain `.`/symlink-free `..`).
    let mut root_norm = PathBuf::new();
    for component in root.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                let _ = root_norm.pop();
            }
            other => root_norm.push(other.as_os_str()),
        }
    }
    if !normalized.starts_with(&root_norm) {
        return Err(format!(
            "path is outside the workspace: {}",
            requested.display()
        ));
    }
    Ok(normalized)
}

/// Handle an `fs/read_text_file` request: sandbox the path, read (optionally a
/// line range), and return the content. Rejected reads become a protocol error
/// the agent sees, not a silent empty read.
fn handle_read(
    root: &Path,
    request: ReadTextFileRequest,
) -> Result<ReadTextFileResponse, agent_client_protocol::Error> {
    let path = sandbox_path(root, &request.path)
        .map_err(agent_client_protocol::util::internal_error)?;
    let content =
        std::fs::read_to_string(&path).map_err(agent_client_protocol::util::internal_error)?;
    let sliced = slice_lines(&content, request.line, request.limit);
    Ok(ReadTextFileResponse::new(sliced))
}

/// Apply the 1-based `line` offset and `limit` of a read request.
fn slice_lines(content: &str, line: Option<u32>, limit: Option<u32>) -> String {
    if line.is_none() && limit.is_none() {
        return content.to_string();
    }
    let start = line.unwrap_or(1).max(1) as usize - 1;
    let out = content.lines().skip(start);
    match limit {
        Some(n) => out
            .take(n as usize)
            .collect::<Vec<_>>()
            .join("\n"),
        None => out.collect::<Vec<_>>().join("\n"),
    }
}

/// Handle an `fs/write_text_file` request: sandbox the path, create parents,
/// write, and emit `FileWritten` so the host records provenance. A rejected or
/// failed write becomes a protocol error.
fn handle_write(
    root: &Path,
    event_tx: &mpsc::UnboundedSender<AcpEvent>,
    request: WriteTextFileRequest,
) -> Result<WriteTextFileResponse, agent_client_protocol::Error> {
    let path = sandbox_path(root, &request.path)
        .map_err(agent_client_protocol::util::internal_error)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(agent_client_protocol::util::internal_error)?;
    }
    std::fs::write(&path, &request.content)
        .map_err(agent_client_protocol::util::internal_error)?;
    let _ = event_tx.unbounded_send(AcpEvent::FileWritten {
        path: path.to_string_lossy().to_string(),
    });
    Ok(WriteTextFileResponse::new())
}

// --- Client-hosted terminals -------------------------------------------------
//
// The agent runs commands by asking the client to host a terminal. ZeroWall is
// the client, so every `terminal/create` is a command-execution request that
// MUST clear the host's approval gate (see AGENTS.md) before a process spawns.
// Once approved, the child runs in the workspace; its stdout+stderr are streamed
// into a bounded buffer the agent polls via `terminal/output` and awaits via
// `terminal/wait_for_exit`.

/// Default cap on retained terminal output when the agent sets no limit. Keeps a
/// runaway command from growing the buffer without bound; the oldest bytes are
/// dropped past the cap (truncation reported to the agent).
const DEFAULT_OUTPUT_BYTE_LIMIT: usize = 1024 * 1024;

/// One live terminal: the running child plus its shared output buffer.
struct TerminalEntry {
    /// The spawned process. `None` once released.
    child: Mutex<Option<tokio::process::Child>>,
    /// Accumulated stdout+stderr, bounded to `byte_limit` (oldest bytes dropped).
    output: Arc<Mutex<TerminalOutput>>,
    /// Set once the process exits; carries its status.
    exit: Arc<Mutex<Option<TerminalExitStatus>>>,
    /// Resolves when the reader task finishes (process exited and pipes drained).
    finished: Arc<AtomicBool>,
}

/// A byte-bounded output buffer. When appending would exceed `limit`, the
/// oldest bytes are dropped from the front (matching the ACP truncation rule)
/// and `truncated` latches true.
#[derive(Default)]
struct TerminalOutput {
    buf: Vec<u8>,
    limit: usize,
    truncated: bool,
}

impl TerminalOutput {
    fn push(&mut self, bytes: &[u8]) {
        self.buf.extend_from_slice(bytes);
        if self.limit > 0 && self.buf.len() > self.limit {
            let overflow = self.buf.len() - self.limit;
            self.buf.drain(0..overflow);
            self.truncated = true;
        }
    }
}

/// Owns all terminals for one session, keyed by a client-allocated id.
#[derive(Default)]
struct TerminalManager {
    terminals: Mutex<HashMap<String, Arc<TerminalEntry>>>,
    next_id: AtomicU64,
}

impl TerminalManager {
    fn get(&self, id: &TerminalId) -> Option<Arc<TerminalEntry>> {
        self.terminals.lock().unwrap().get(id.0.as_ref()).cloned()
    }
}

/// Handle `terminal/create`: gate on host approval, then spawn the command in
/// the workspace and start streaming its output into a bounded buffer. A
/// rejected command becomes a protocol error the agent sees (not a silent
/// no-op). The agent's requested `cwd`, if any, is sandboxed to the workspace.
async fn handle_create_terminal(
    manager: &TerminalManager,
    root: &Path,
    event_tx: &mpsc::UnboundedSender<AcpEvent>,
    request: CreateTerminalRequest,
) -> Result<CreateTerminalResponse, agent_client_protocol::Error> {
    // Resolve and sandbox the working directory before asking for approval, so
    // the user is shown the real cwd and an escaping cwd never reaches spawn.
    let cwd = match &request.cwd {
        Some(dir) => sandbox_path(root, dir).map_err(agent_client_protocol::util::internal_error)?,
        None => root.to_path_buf(),
    };

    // Approval gate: command execution requires an explicit host decision.
    let (reply_tx, reply_rx) = oneshot::channel::<bool>();
    if event_tx
        .unbounded_send(AcpEvent::ExecApproval {
            command: request.command.clone(),
            args: request.args.clone(),
            cwd: request.cwd.as_ref().map(|_| cwd.to_string_lossy().to_string()),
            reply: reply_tx,
        })
        .is_err()
    {
        return Err(agent_client_protocol::util::internal_error(
            "host unavailable for command approval",
        ));
    }
    match reply_rx.await {
        Ok(true) => {}
        // Rejected, or the host dropped the channel: fail closed.
        Ok(false) | Err(_) => {
            return Err(agent_client_protocol::util::internal_error(
                "command execution was not approved",
            ));
        }
    }

    // Approved. Spawn the child with piped stdout/stderr, no window on Windows.
    let byte_limit = request
        .output_byte_limit
        .map(|n| n as usize)
        .unwrap_or(DEFAULT_OUTPUT_BYTE_LIMIT);

    let mut cmd = tokio::process::Command::new(&request.command);
    cmd.args(&request.args)
        .current_dir(&cwd)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    for env in &request.env {
        cmd.env(&env.name, &env.value);
    }
    #[cfg(windows)]
    {
        // tokio::process::Command exposes creation_flags inherently on Windows.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(agent_client_protocol::util::internal_error)?;

    // Take the pipes before the child is moved onto the entry.
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let entry = Arc::new(TerminalEntry {
        child: Mutex::new(Some(child)),
        output: Arc::new(Mutex::new(TerminalOutput {
            buf: Vec::new(),
            limit: byte_limit,
            truncated: false,
        })),
        exit: Arc::new(Mutex::new(None)),
        finished: Arc::new(AtomicBool::new(false)),
    });

    let id = self_alloc_id(manager);
    manager
        .terminals
        .lock()
        .unwrap()
        .insert(id.clone(), entry.clone());

    // Drain stdout and stderr concurrently into the shared buffer, then reap the
    // child and record its exit status. Runs until both pipes close.
    tokio::spawn(async move {
        let out_task = pipe_into(stdout, entry.output.clone());
        let err_task = pipe_into(stderr, entry.output.clone());
        let _ = futures::future::join(out_task, err_task).await;
        // Both pipes closed → the process has exited; reap it (unless kill/
        // release already took the handle).
        let child = entry.child.lock().unwrap().take();
        if let Some(mut c) = child {
            if let Ok(status) = c.wait().await {
                *entry.exit.lock().unwrap() = Some(exit_status_of(&status));
            }
        }
        entry.finished.store(true, Ordering::SeqCst);
    });

    Ok(CreateTerminalResponse::new(TerminalId::new(id)))
}

/// Allocate a fresh, session-unique terminal id.
fn self_alloc_id(manager: &TerminalManager) -> String {
    let n = manager.next_id.fetch_add(1, Ordering::Relaxed);
    format!("term-{n}")
}

/// Copy everything from an optional async pipe into the shared output buffer.
async fn pipe_into<R>(reader: Option<R>, output: Arc<Mutex<TerminalOutput>>)
where
    R: AsyncRead + Unpin,
{
    let Some(mut reader) = reader else {
        return;
    };
    let mut chunk = [0u8; 8192];
    loop {
        match reader.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(n) => output.lock().unwrap().push(&chunk[..n]),
        }
    }
}

/// Map a `std::process::ExitStatus` to the ACP exit-status shape.
fn exit_status_of(status: &std::process::ExitStatus) -> TerminalExitStatus {
    let mut out = TerminalExitStatus::new();
    if let Some(code) = status.code() {
        out = out.exit_code(code as u32);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        if let Some(sig) = status.signal() {
            out = out.signal(format!("{sig}"));
        }
    }
    out
}

/// Handle `terminal/output`: snapshot the current buffer and exit status.
fn handle_terminal_output(
    manager: &TerminalManager,
    request: TerminalOutputRequest,
) -> Result<TerminalOutputResponse, agent_client_protocol::Error> {
    let entry = manager
        .get(&request.terminal_id)
        .ok_or_else(|| agent_client_protocol::util::internal_error("unknown terminal"))?;
    let (text, truncated) = {
        let out = entry.output.lock().unwrap();
        (String::from_utf8_lossy(&out.buf).to_string(), out.truncated)
    };
    let mut response = TerminalOutputResponse::new(text, truncated);
    if let Some(status) = entry.exit.lock().unwrap().clone() {
        response = response.exit_status(status);
    }
    Ok(response)
}

/// Handle `terminal/wait_for_exit`: poll until the reader task signals the
/// process has exited, then return its status.
async fn handle_wait_for_exit(
    manager: &TerminalManager,
    request: WaitForTerminalExitRequest,
) -> Result<WaitForTerminalExitResponse, agent_client_protocol::Error> {
    let entry = manager
        .get(&request.terminal_id)
        .ok_or_else(|| agent_client_protocol::util::internal_error("unknown terminal"))?;
    while !entry.finished.load(Ordering::SeqCst) {
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }
    let status = entry
        .exit
        .lock()
        .unwrap()
        .clone()
        .unwrap_or_else(TerminalExitStatus::new);
    Ok(WaitForTerminalExitResponse::new(status))
}

/// Handle `terminal/kill`: terminate the process without releasing the terminal
/// (its output stays readable).
fn handle_kill_terminal(
    manager: &TerminalManager,
    request: KillTerminalRequest,
) -> Result<KillTerminalResponse, agent_client_protocol::Error> {
    let entry = manager
        .get(&request.terminal_id)
        .ok_or_else(|| agent_client_protocol::util::internal_error("unknown terminal"))?;
    if let Some(child) = entry.child.lock().unwrap().as_mut() {
        let _ = child.start_kill();
    }
    Ok(KillTerminalResponse::new())
}

/// Handle `terminal/release`: kill the process if still running and drop the
/// terminal from the manager, freeing its buffer.
fn handle_release_terminal(
    manager: &TerminalManager,
    request: ReleaseTerminalRequest,
) -> Result<ReleaseTerminalResponse, agent_client_protocol::Error> {
    if let Some(entry) = manager
        .terminals
        .lock()
        .unwrap()
        .remove(request.terminal_id.0.as_ref())
    {
        if let Some(mut child) = entry.child.lock().unwrap().take() {
            let _ = child.start_kill();
        }
    }
    Ok(ReleaseTerminalResponse::new())
}

/// Render a content block to text for streaming. Non-text blocks become a short
/// bracketed placeholder rather than being dropped silently.
fn content_block_text(block: &ContentBlock) -> String {
    match block {
        ContentBlock::Text(text) => text.text.clone(),
        ContentBlock::Image(_) => "[image]".to_string(),
        ContentBlock::Audio(_) => "[audio]".to_string(),
        ContentBlock::Resource(_) => "[resource]".to_string(),
        ContentBlock::ResourceLink(_) => "[resource link]".to_string(),
        _ => String::new(),
    }
}

/// Stable string form of a stop reason for the host.
fn stop_reason_str(reason: StopReason) -> &'static str {
    match reason {
        StopReason::EndTurn => "end_turn",
        StopReason::MaxTokens => "max_tokens",
        StopReason::MaxTurnRequests => "max_turn_requests",
        StopReason::Refusal => "refusal",
        StopReason::Cancelled => "cancelled",
        _ => "unknown",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_client_protocol::schema::v1::SessionId;

    #[test]
    fn profile_maps_to_stdio_agent_with_env() {
        let profile = AcpAgentProfile {
            id: "codex".to_string(),
            label: "Codex".to_string(),
            command: "codex-acp".to_string(),
            args: vec!["--flag".to_string()],
            env: vec![("OPENAI_API_KEY".to_string(), "sk-secret".to_string())],
        };
        let agent = profile.to_acp_agent();
        match agent.server() {
            McpServer::Stdio(stdio) => {
                assert_eq!(stdio.name, "codex");
                assert_eq!(stdio.command, PathBuf::from("codex-acp"));
                assert_eq!(stdio.args, vec!["--flag".to_string()]);
                assert_eq!(stdio.env.len(), 1);
                assert_eq!(stdio.env[0].name, "OPENAI_API_KEY");
                assert_eq!(stdio.env[0].value, "sk-secret");
            }
            _ => panic!("expected stdio transport"),
        }
    }

    #[test]
    fn stop_reasons_have_stable_strings() {
        assert_eq!(stop_reason_str(StopReason::EndTurn), "end_turn");
        assert_eq!(stop_reason_str(StopReason::Cancelled), "cancelled");
        assert_eq!(stop_reason_str(StopReason::MaxTokens), "max_tokens");
        assert_eq!(stop_reason_str(StopReason::Refusal), "refusal");
    }

    #[test]
    fn text_content_block_renders_text() {
        let block = ContentBlock::from("hello".to_string());
        assert_eq!(content_block_text(&block), "hello");
    }

    #[test]
    fn prompt_after_close_reports_closed() {
        let profile = AcpAgentProfile {
            id: "x".to_string(),
            label: "X".to_string(),
            command: "true".to_string(),
            args: vec![],
            env: vec![],
        };
        let (client, _events, _driver) = AcpClient::launch(&profile, PathBuf::from("."));
        // Drop the driver without running it; the receiver side of commands is
        // inside `_driver`, so sends still succeed until it is dropped. Drop it:
        drop(_driver);
        // After the driver (and its command_rx) is dropped, sends fail.
        assert!(matches!(client.prompt("hi"), Err(AcpError::Closed)));
    }

    #[cfg(test)]
    /// An absolute path built from `segments` under a platform-appropriate root
    /// (`C:\` on Windows, `/` elsewhere) so sandbox tests use real absolute paths.
    fn abs(segments: &[&str]) -> PathBuf {
        #[cfg(windows)]
        let mut p = PathBuf::from("C:\\");
        #[cfg(not(windows))]
        let mut p = PathBuf::from("/");
        for s in segments {
            p.push(s);
        }
        p
    }

    #[test]
    fn sandbox_allows_paths_inside_workspace() {
        let root = abs(&["work", "space"]);
        let target = abs(&["work", "space", "sub", "file.txt"]);
        let ok = sandbox_path(&root, &target).unwrap();
        assert_eq!(ok, target);
        // The root itself is inside the root.
        assert!(sandbox_path(&root, &root).is_ok());
    }

    #[test]
    fn sandbox_rejects_traversal_and_outside_paths() {
        let root = abs(&["work", "space"]);
        // Classic traversal that climbs above the workspace.
        assert!(sandbox_path(&root, &abs(&["work", "space", "..", "secret"])).is_err());
        // A sibling directory sharing a prefix but not under root.
        assert!(sandbox_path(&root, &abs(&["work", "spacex", "file"])).is_err());
        // An unrelated absolute path.
        assert!(sandbox_path(&root, &abs(&["etc", "passwd"])).is_err());
    }

    #[test]
    fn sandbox_rejects_relative_paths() {
        let root = abs(&["work", "space"]);
        assert!(sandbox_path(&root, &PathBuf::from("relative/file")).is_err());
    }

    #[test]
    fn slice_lines_applies_line_and_limit() {
        let text = "a\nb\nc\nd\ne";
        assert_eq!(slice_lines(text, None, None), text);
        assert_eq!(slice_lines(text, Some(2), None), "b\nc\nd\ne");
        assert_eq!(slice_lines(text, Some(2), Some(2)), "b\nc");
        assert_eq!(slice_lines(text, None, Some(1)), "a");
    }

    #[test]
    fn terminal_output_truncates_from_front_at_limit() {
        let mut out = TerminalOutput {
            buf: Vec::new(),
            limit: 4,
            truncated: false,
        };
        out.push(b"ab");
        assert_eq!(&out.buf, b"ab");
        assert!(!out.truncated);
        // Exceeding the limit drops the oldest bytes and latches truncated.
        out.push(b"cdef");
        assert_eq!(&out.buf, b"cdef");
        assert!(out.truncated);
    }

    #[test]
    fn terminal_output_zero_limit_is_unbounded() {
        let mut out = TerminalOutput {
            buf: Vec::new(),
            limit: 0,
            truncated: false,
        };
        out.push(&[0u8; 10_000]);
        assert_eq!(out.buf.len(), 10_000);
        assert!(!out.truncated);
    }

    #[tokio::test]
    async fn approved_command_runs_and_reports_exit() {
        // A rejecting host would fail-close; here we approve and verify the
        // command actually spawns, streams output, and reports a clean exit.
        let manager = TerminalManager::default();
        let (event_tx, mut event_rx) = mpsc::unbounded::<AcpEvent>();
        let root = std::env::temp_dir();

        #[cfg(windows)]
        let request = CreateTerminalRequest::new(SessionId::new("s"), "cmd")
            .args(vec!["/C".into(), "echo hi".into()]);
        #[cfg(not(windows))]
        let request = CreateTerminalRequest::new(SessionId::new("s"), "sh")
            .args(vec!["-c".into(), "echo hi".into()]);

        // Approve out-of-band: consume the ExecApproval event and answer true.
        let approver = tokio::spawn(async move {
            if let Some(AcpEvent::ExecApproval { reply, .. }) = event_rx.next().await {
                let _ = reply.send(true);
            }
        });

        let created = handle_create_terminal(&manager, &root, &event_tx, request)
            .await
            .expect("approved command should spawn");
        approver.await.unwrap();

        let wait_req = WaitForTerminalExitRequest::new(SessionId::new("s"), created.terminal_id.clone());
        let exit = handle_wait_for_exit(&manager, wait_req).await.unwrap();
        assert_eq!(exit.exit_status.exit_code, Some(0));

        let out_req = TerminalOutputRequest::new(SessionId::new("s"), created.terminal_id);
        let output = handle_terminal_output(&manager, out_req).unwrap();
        assert!(output.output.contains("hi"));
    }

    #[tokio::test]
    async fn rejected_command_never_spawns() {
        let manager = TerminalManager::default();
        let (event_tx, mut event_rx) = mpsc::unbounded::<AcpEvent>();
        let root = std::env::temp_dir();

        #[cfg(windows)]
        let request = CreateTerminalRequest::new(SessionId::new("s"), "cmd")
            .args(vec!["/C".into(), "echo nope".into()]);
        #[cfg(not(windows))]
        let request = CreateTerminalRequest::new(SessionId::new("s"), "sh")
            .args(vec!["-c".into(), "echo nope".into()]);

        let rejecter = tokio::spawn(async move {
            if let Some(AcpEvent::ExecApproval { reply, .. }) = event_rx.next().await {
                let _ = reply.send(false);
            }
        });

        let result = handle_create_terminal(&manager, &root, &event_tx, request).await;
        rejecter.await.unwrap();
        assert!(result.is_err(), "rejected command must not spawn");
        assert!(manager.terminals.lock().unwrap().is_empty());
    }
}
