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
//! - The closure initializes the connection, opens one ACP session, then drives
//!   prompts concurrently with out-of-band cancel and shutdown signals.
//! - Streaming notifications (assistant/thought chunks, tool calls, plans, usage)
//!   arrive on the SDK's notification handler and are forwarded out as
//!   [`AcpEvent`]s.
//! - Permission requests arrive on the SDK's request handler; the handler emits
//!   an [`AcpEvent::Permission`] carrying a one-shot reply channel and awaits the
//!   host's decision before responding — so approval gating stays in the host.
//!
//! Process spawning is owned here so inherited authentication variables can be
//! removed before launch. The whole tree is then owned by a kill-on-close Job
//! Object on Windows and an independent process group on Unix.

use std::collections::{HashMap, VecDeque};
use std::future::Future;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use agent_client_protocol::schema::v1::{
    ClientCapabilities, ContentBlock, CreateTerminalRequest, CreateTerminalResponse, EnvVariable,
    FileSystemCapabilities, ImageContent, InitializeRequest, KillTerminalRequest,
    KillTerminalResponse, LoadSessionRequest, McpServer, McpServerStdio, NewSessionRequest,
    PromptRequest, PromptResponse, ReadTextFileRequest, ReadTextFileResponse,
    ReleaseTerminalRequest, ReleaseTerminalResponse, RequestPermissionOutcome,
    RequestPermissionRequest, RequestPermissionResponse, ResumeSessionRequest,
    SelectedPermissionOutcome, SessionNotification, SessionUpdate, SetSessionModeRequest,
    StopReason, TerminalExitStatus, TerminalId, TerminalOutputRequest, TerminalOutputResponse,
    WaitForTerminalExitRequest, WaitForTerminalExitResponse, WriteTextFileRequest,
    WriteTextFileResponse,
};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::{Agent, Client, ConnectTo, ConnectionTo, Lines, Responder};
use futures::channel::oneshot;
use futures::{AsyncBufReadExt, AsyncReadExt as FuturesAsyncReadExt, AsyncWriteExt};
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::sync::mpsc;
use tracing::instrument::WithSubscriber;

const DEFAULT_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_SHUTDOWN_GRACE: Duration = Duration::from_secs(5);
const SAFE_PROTOCOL_FAILURE: &str = "ACP protocol request failed";
const PROCESS_TERMINATION_FAILURE: &str = "ACP process tree termination failed";
const STDERR_TAIL_CAPACITY: usize = 64 * 1024;
const STDERR_DIAGNOSTIC_PREFIX: &str = "\nACP stderr tail:\n";
const ACP_COMMAND_CHANNEL_CAPACITY: usize = 1;
const ACP_EVENT_CHANNEL_CAPACITY: usize = 256;

/// A launchable external ACP agent: the command to run and the environment to
/// run it in.
///
/// This is ZeroWall's own profile shape (not an SDK type) so the desktop can
/// persist it and inject secrets into `env` at spawn time. `env` values are
/// materialized from the OS keychain by the caller immediately before launch
/// and MUST NOT be logged or persisted (see AGENTS.md).
#[derive(Clone)]
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
    /// Parent-process environment variables that must not reach the adapter or
    /// CLI. Used to remove vendor OAuth and alternate-provider routing state.
    pub env_remove: Vec<String>,
    /// Non-secret ACP session metadata controlled by the host. Built-in
    /// profiles use this to disable adapter-specific settings inheritance.
    pub session_meta: Option<serde_json::Map<String, serde_json::Value>>,
    /// Vetted stdio MCP servers chosen by the native host. This is deliberately
    /// not part of the frontend launch request: only the host may choose an
    /// executable or environment for an ACP child session.
    pub mcp_servers: Vec<AcpMcpServer>,
}

/// A native-host controlled stdio MCP declaration for one ACP session.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AcpMcpServer {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
}

impl std::fmt::Debug for AcpAgentProfile {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let environment_names = self
            .env
            .iter()
            .map(|(name, _)| name.as_str())
            .collect::<Vec<_>>();
        let removed_environment_names = self
            .env_remove
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>();
        f.debug_struct("AcpAgentProfile")
            .field("id", &self.id)
            .field("label", &self.label)
            .field("command", &self.command)
            .field("args_count", &self.args.len())
            .field("environment_names", &environment_names)
            .field("removed_environment_names", &removed_environment_names)
            .field("has_session_meta", &self.session_meta.is_some())
            .field("mcp_server_count", &self.mcp_servers.len())
            .finish()
    }
}

/// Context-window occupancy for the session, mapped from ACP
/// `session/update` `UsageUpdate`. ACP does not expose per-turn input/output
/// token counts here, so these fields must never be used as billed totals.
#[derive(Debug, Clone)]
pub struct AcpUsageUpdate {
    /// Tokens currently in the context window.
    pub used: u64,
    /// Total context-window size in tokens.
    pub size: u64,
    /// Optional provider token counters attached by an adapter in ACP `_meta`.
    /// These are kept separate from `used`, which is only context occupancy.
    pub token_usage: Option<AcpTokenUsage>,
}

/// Cumulative token usage reported by ACP at the end of a prompt turn.
///
/// ACP exposes these counters as session totals, rather than per-turn deltas.
/// The desktop layer is responsible for subtracting the previous successful
/// turn before persisting a usage row. Keeping the wire shape explicit prevents
/// the context-window `UsageUpdate` above from being mistaken for billed token
/// counts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AcpTokenUsage {
    pub total_tokens: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub thought_tokens: u64,
    pub cached_read_tokens: u64,
    pub cached_write_tokens: u64,
}

/// A permission option offered by the agent for a `session/request_permission`.
#[derive(Debug, Clone)]
pub struct AcpPermissionOption {
    /// Opaque id to echo back when this option is chosen.
    pub option_id: String,
    /// Human-readable label to show the user.
    pub name: String,
}

/// A phase of the ACP startup handshake.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AcpHandshakeStage {
    /// Protocol capability negotiation.
    Initialize,
    /// Creation of the workspace-rooted session.
    SessionNew,
    /// Loading a persisted workspace-rooted session with its history.
    SessionLoad,
    /// Resuming a persisted workspace-rooted session without replaying history.
    SessionResume,
}

/// A structured runtime error surfaced as an [`AcpEvent::Error`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AcpEventErrorKind {
    /// The named handshake phase exceeded the launch timeout.
    HandshakeTimeout {
        /// Phase that was still pending at the deadline.
        stage: AcpHandshakeStage,
    },
    /// The named handshake phase returned a protocol error.
    HandshakeFailed {
        /// Phase that failed.
        stage: AcpHandshakeStage,
        /// Sanitized protocol diagnostic. It never includes a prompt or environment.
        message: String,
    },
    /// A prompt arrived before the session became ready.
    PromptNotReady,
    /// A second prompt arrived while the session already had one in flight.
    PromptBusy,
    /// The in-flight prompt returned a protocol error.
    PromptFailed {
        /// Sanitized protocol diagnostic. It never includes the prompt body.
        message: String,
    },
}

/// Launch timing controls. Production callers normally use [`Default`]; tests
/// may choose shorter bounds.
#[derive(Debug, Clone, Copy)]
pub struct AcpLaunchOptions {
    /// Maximum total duration of initialize plus session/new.
    pub handshake_timeout: Duration,
    /// Maximum graceful process-tree shutdown time before force termination.
    pub shutdown_grace: Duration,
}

impl Default for AcpLaunchOptions {
    fn default() -> Self {
        Self {
            handshake_timeout: DEFAULT_HANDSHAKE_TIMEOUT,
            shutdown_grace: DEFAULT_SHUTDOWN_GRACE,
        }
    }
}

/// ACP session lifecycle operation to run after initialize succeeds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AcpSessionStart {
    /// Create a new session.
    New,
    /// Load a persisted session and replay its history through notifications.
    Load { session_id: String },
    /// Resume a persisted session without replaying its history.
    Resume { session_id: String },
}

/// Events emitted by a running ACP session, forwarded to the host.
#[derive(Debug)]
pub enum AcpEvent {
    /// The driver started the named startup handshake phase.
    HandshakeStarted {
        /// Phase now in progress.
        stage: AcpHandshakeStage,
    },
    /// Initialize and session/new both succeeded. This is the only ready signal.
    Ready {
        /// Session identifier allocated by the agent.
        session_id: String,
    },
    /// A structured startup or prompt error.
    Error {
        /// Machine-matchable error category and safe diagnostic fields.
        kind: AcpEventErrorKind,
    },
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
        /// Optional cumulative token counters returned by `session/prompt`.
        /// Agents using an older ACP adapter leave this unset.
        usage: Option<AcpTokenUsage>,
    },
    /// The session ended. `error` is `None` on a clean shutdown, otherwise a
    /// human-readable reason (process exit, transport error).
    Exited {
        /// Failure reason, if the session did not end cleanly.
        error: Option<String>,
    },
}

/// Bounded stream of normalized events emitted by one ACP session.
pub type AcpEventReceiver = mpsc::Receiver<AcpEvent>;

async fn emit_event(sender: &mpsc::Sender<AcpEvent>, event: AcpEvent) -> bool {
    sender.send(event).await.is_ok()
}

/// Errors from launching or driving an ACP session.
#[derive(Debug)]
pub enum AcpError {
    /// The session's command channel is closed (the agent task has exited).
    Closed,
    /// The bounded command queue already contains a request.
    Busy,
    /// An error surfaced by the SDK or transport.
    Protocol(String),
}

impl std::fmt::Display for AcpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AcpError::Closed => write!(f, "ACP session is closed"),
            AcpError::Busy => write!(f, "ACP session command queue is busy"),
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
#[derive(Clone)]
pub struct AcpClient {
    prompts: mpsc::Sender<PromptCommand>,
    model: mpsc::Sender<SetModelCommand>,
    mode: mpsc::Sender<SetModeCommand>,
    mode_supported: Arc<AtomicBool>,
    cancel: tokio::sync::watch::Sender<u64>,
    cancel_generation: Arc<AtomicU64>,
    shutdown: tokio::sync::watch::Sender<bool>,
    diagnostics: ProcessDiagnostics,
}

impl std::fmt::Debug for AcpClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AcpClient")
            .field("prompt_channel_closed", &self.prompts.is_closed())
            .field("mode_channel_closed", &self.mode.is_closed())
            .field("mode_supported", &self.supports_mode())
            .field(
                "cancel_generation",
                &self.cancel_generation.load(Ordering::Relaxed),
            )
            .field("cancel_channel_closed", &self.cancel.is_closed())
            .field("shutdown_channel_closed", &self.shutdown.is_closed())
            .finish()
    }
}

#[derive(Debug)]
struct PromptCommand {
    content: Vec<ContentBlock>,
    cancel_generation: u64,
}

struct SetModelCommand {
    model_id: String,
    reply: oneshot::Sender<Result<(), AcpError>>,
}

struct SetModeCommand {
    mode_id: String,
    reply: oneshot::Sender<Result<(), AcpError>>,
}

/// One media or document attachment supplied with a user prompt. Images are
/// forwarded as native ACP image blocks; extracted document text is carried in
/// a normal text block, which every ACP agent is required to understand.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PromptAttachment {
    pub filename: String,
    pub mime: String,
    pub base64: String,
    pub extracted_text: Option<String>,
}

struct SessionControl {
    prompt_rx: mpsc::Receiver<PromptCommand>,
    model_rx: mpsc::Receiver<SetModelCommand>,
    mode_rx: mpsc::Receiver<SetModeCommand>,
    mode_supported: Arc<AtomicBool>,
    cancel_rx: tokio::sync::watch::Receiver<u64>,
    shutdown_rx: tokio::sync::watch::Receiver<bool>,
    event_tx: mpsc::Sender<AcpEvent>,
    diagnostics: ProcessDiagnostics,
}

#[derive(Clone)]
struct ProcessDiagnostics {
    stderr: Arc<Mutex<BoundedByteTail>>,
    environment_values: Arc<Vec<String>>,
    session_prompts: Arc<Mutex<Vec<String>>>,
}

impl ProcessDiagnostics {
    fn new(profile: &AcpAgentProfile) -> Self {
        Self {
            stderr: Arc::new(Mutex::new(BoundedByteTail::default())),
            environment_values: Arc::new(
                profile
                    .env
                    .iter()
                    .map(|(_, value)| value.clone())
                    .filter(|value| !value.is_empty())
                    .collect(),
            ),
            session_prompts: Arc::new(Mutex::new(Vec::new())),
        }
    }

    fn push_stderr(&self, bytes: &[u8]) {
        self.stderr.lock().unwrap().push(bytes);
    }

    fn remember_prompt(&self, prompt: &str) {
        if prompt.is_empty() {
            return;
        }
        let mut prompts = self.session_prompts.lock().unwrap();
        if !prompts.iter().any(|known| known == prompt) {
            prompts.push(prompt.to_string());
        }
    }

    fn remember_content(&self, content: &[ContentBlock]) {
        for block in content {
            match block {
                ContentBlock::Text(text) => self.remember_prompt(&text.text),
                // Some third-party adapters echo invalid request payloads to
                // stderr. Retain the value only as a redaction target; it is
                // never written to the app log.
                ContentBlock::Image(image) => self.remember_prompt(&image.data),
                _ => {}
            }
        }
    }

    fn sanitized_stderr_tail(&self) -> String {
        let bytes = self.stderr.lock().unwrap().snapshot();
        let prompts = self.session_prompts.lock().unwrap();
        sanitize_stderr_tail(
            &String::from_utf8_lossy(&bytes),
            self.environment_values
                .iter()
                .map(String::as_str)
                .chain(prompts.iter().map(String::as_str)),
        )
    }
}

#[derive(Debug, Default)]
struct BoundedByteTail {
    bytes: VecDeque<u8>,
}

impl BoundedByteTail {
    fn push(&mut self, bytes: &[u8]) {
        if bytes.len() >= STDERR_TAIL_CAPACITY {
            self.bytes.clear();
            self.bytes
                .extend(bytes[bytes.len() - STDERR_TAIL_CAPACITY..].iter().copied());
            return;
        }
        let overflow = self
            .bytes
            .len()
            .saturating_add(bytes.len())
            .saturating_sub(STDERR_TAIL_CAPACITY);
        self.bytes.drain(..overflow);
        self.bytes.extend(bytes.iter().copied());
    }

    fn snapshot(&self) -> Vec<u8> {
        self.bytes.iter().copied().collect()
    }
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
        AcpEventReceiver,
        impl std::future::Future<Output = ()> + Send,
    ) {
        Self::launch_with_options(profile, cwd, AcpLaunchOptions::default())
    }

    /// Launch an agent and restore a specific ACP session lifecycle state.
    pub fn launch_session(
        profile: &AcpAgentProfile,
        cwd: PathBuf,
        start: AcpSessionStart,
    ) -> (
        AcpClient,
        AcpEventReceiver,
        impl std::future::Future<Output = ()> + Send,
    ) {
        Self::launch_session_with_options(profile, cwd, start, AcpLaunchOptions::default())
    }

    /// Launch with explicit timing bounds. This is primarily useful for tests
    /// and hosts that impose a stricter startup policy.
    pub fn launch_with_options(
        profile: &AcpAgentProfile,
        cwd: PathBuf,
        options: AcpLaunchOptions,
    ) -> (AcpClient, AcpEventReceiver, impl Future<Output = ()> + Send) {
        Self::launch_session_with_options(profile, cwd, AcpSessionStart::New, options)
    }

    /// Launch with an explicit session lifecycle operation and timing bounds.
    pub fn launch_session_with_options(
        profile: &AcpAgentProfile,
        cwd: PathBuf,
        start: AcpSessionStart,
        options: AcpLaunchOptions,
    ) -> (AcpClient, AcpEventReceiver, impl Future<Output = ()> + Send) {
        let (prompt_tx, prompt_rx) = mpsc::channel::<PromptCommand>(ACP_COMMAND_CHANNEL_CAPACITY);
        let (model_tx, model_rx) = mpsc::channel::<SetModelCommand>(ACP_COMMAND_CHANNEL_CAPACITY);
        let (mode_tx, mode_rx) = mpsc::channel::<SetModeCommand>(ACP_COMMAND_CHANNEL_CAPACITY);
        let mode_supported = Arc::new(AtomicBool::new(false));
        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(0_u64);
        let cancel_generation = Arc::new(AtomicU64::new(0));
        let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
        let (event_tx, event_rx) = mpsc::channel::<AcpEvent>(ACP_EVENT_CHANNEL_CAPACITY);
        let diagnostics = ProcessDiagnostics::new(profile);
        let session_meta = profile.session_meta.clone();
        let mcp_servers = profile.mcp_servers.clone();
        let agent =
            ManagedAcpAgent::new(profile.clone(), options.shutdown_grace, diagnostics.clone());

        // The ACP SDK logs full JSON-RPC messages at debug/trace. Scope a no-op
        // subscriber to this future so protocol payloads cannot reach the app's
        // subscriber, while unrelated Tauri diagnostics remain available.
        let driver = run_session(
            agent,
            cwd,
            SessionControl {
                prompt_rx,
                model_rx,
                mode_rx,
                mode_supported: Arc::clone(&mode_supported),
                cancel_rx,
                shutdown_rx,
                event_tx,
                diagnostics: diagnostics.clone(),
            },
            options.handshake_timeout,
            session_meta,
            mcp_servers,
            start,
        )
        .with_subscriber(tracing::subscriber::NoSubscriber::default());

        (
            AcpClient {
                prompts: prompt_tx,
                model: model_tx,
                mode: mode_tx,
                mode_supported,
                cancel: cancel_tx,
                cancel_generation,
                shutdown: shutdown_tx,
                diagnostics,
            },
            event_rx,
            driver,
        )
    }

    /// Send a user prompt as one turn.
    pub fn prompt(&self, text: impl Into<String>) -> Result<(), AcpError> {
        let text = text.into();
        self.prompt_with_attachments(text, Vec::new())
    }

    /// Send one prompt with structured image and document context.
    pub fn prompt_with_attachments(
        &self,
        text: impl Into<String>,
        attachments: Vec<PromptAttachment>,
    ) -> Result<(), AcpError> {
        let content = prompt_content(text.into(), attachments);
        self.diagnostics.remember_content(&content);
        self.prompts
            .try_send(PromptCommand {
                content,
                cancel_generation: self.cancel_generation.load(Ordering::SeqCst),
            })
            .map_err(|error| match error {
                mpsc::error::TrySendError::Closed(_) => AcpError::Closed,
                mpsc::error::TrySendError::Full(_) => AcpError::Busy,
            })
    }

    /// Change the model for the existing ACP session without restarting the
    /// adapter, CLI, MCP servers, or workspace session.
    pub async fn set_model(&self, model_id: impl Into<String>) -> Result<(), AcpError> {
        if self.model.is_closed() {
            return Err(AcpError::Closed);
        }
        let (reply_tx, reply_rx) = oneshot::channel();
        self.model
            .send(SetModelCommand {
                model_id: model_id.into(),
                reply: reply_tx,
            })
            .await
            .map_err(|_| AcpError::Closed)?;
        reply_rx.await.map_err(|_| AcpError::Closed)?
    }

    /// Change the mode for the existing ACP session using `session/set_mode`.
    pub async fn set_mode(&self, mode_id: impl Into<String>) -> Result<(), AcpError> {
        if self.mode.is_closed() {
            return Err(AcpError::Closed);
        }
        let (reply_tx, reply_rx) = oneshot::channel();
        self.mode
            .send(SetModeCommand {
                mode_id: mode_id.into(),
                reply: reply_tx,
            })
            .await
            .map_err(|_| AcpError::Closed)?;
        reply_rx.await.map_err(|_| AcpError::Closed)?
    }

    /// Whether the active session advertised ACP session modes.
    pub fn supports_mode(&self) -> bool {
        self.mode_supported.load(Ordering::Acquire)
    }

    /// Cancel the in-flight turn.
    pub fn cancel(&self) -> Result<(), AcpError> {
        if self.cancel.is_closed() {
            return Err(AcpError::Closed);
        }
        let next = self.cancel_generation.fetch_add(1, Ordering::SeqCst) + 1;
        self.cancel.send_replace(next);
        Ok(())
    }

    /// Shut the session down and terminate the agent.
    pub fn shutdown(&self) -> Result<(), AcpError> {
        if self.shutdown.is_closed() {
            return Err(AcpError::Closed);
        }
        self.shutdown.send_replace(true);
        Ok(())
    }
}

/// Drive one ACP session end-to-end. Resolves when the session ends.
async fn run_session(
    agent: ManagedAcpAgent,
    cwd: PathBuf,
    control: SessionControl,
    handshake_timeout: Duration,
    session_meta: Option<serde_json::Map<String, serde_json::Value>>,
    mcp_servers: Vec<AcpMcpServer>,
    start: AcpSessionStart,
) {
    let event_tx = control.event_tx.clone();
    let diagnostics = control.diagnostics.clone();
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
                    forward_notification(&tx, notification.update).await;
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
            move |request: ReadTextFileRequest, responder: Responder<ReadTextFileResponse>, _cx| {
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
                    match handle_write(&root, &tx, request).await {
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
            move |request: KillTerminalRequest, responder: Responder<KillTerminalResponse>, _cx| {
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
        .connect_with(agent, |cx: ConnectionTo<Agent>| async move {
            drive(
                cx,
                cwd,
                control,
                handshake_timeout,
                session_meta,
                mcp_servers,
                start,
            )
            .await
        })
        .await;

    // `event_tx` was moved into the closure; the closure already emitted
    // `Exited`. If the connection itself failed before the closure ran, report
    // it on a sender clone that outlives the builder.
    if let Err(err) = result {
        let _ = emit_event(
            &fallback_tx,
            AcpEvent::Exited {
                error: Some(safe_protocol_error(&err, &diagnostics)),
            },
        )
        .await;
    }
}

/// The foreground closure: initialize, open a session, then pump commands.
async fn drive(
    cx: ConnectionTo<Agent>,
    cwd: PathBuf,
    control: SessionControl,
    handshake_timeout: Duration,
    session_meta: Option<serde_json::Map<String, serde_json::Value>>,
    mcp_servers: Vec<AcpMcpServer>,
    start: AcpSessionStart,
) -> Result<(), agent_client_protocol::Error> {
    let SessionControl {
        mut prompt_rx,
        mut model_rx,
        mut mode_rx,
        mode_supported,
        mut cancel_rx,
        mut shutdown_rx,
        event_tx,
        diagnostics: _,
    } = control;
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
    let deadline = tokio::time::Instant::now() + handshake_timeout;
    let _ = emit_event(
        &event_tx,
        AcpEvent::HandshakeStarted {
            stage: AcpHandshakeStage::Initialize,
        },
    )
    .await;
    let initialize = cx
        .send_request(InitializeRequest::new(ProtocolVersion::V1).client_capabilities(capabilities))
        .block_task();
    let initialize = await_handshake_stage(
        initialize,
        AcpHandshakeStage::Initialize,
        deadline,
        &mut prompt_rx,
        &mut shutdown_rx,
        &event_tx,
    )
    .await?;
    let Some(initialize) = initialize else {
        return Ok(());
    };

    let unsupported_restore = match &start {
        AcpSessionStart::Load { .. } if !initialize.agent_capabilities.load_session => Some((
            AcpHandshakeStage::SessionLoad,
            "ACP agent does not advertise session/load",
        )),
        AcpSessionStart::Resume { .. }
            if initialize
                .agent_capabilities
                .session_capabilities
                .resume
                .is_none() =>
        {
            Some((
                AcpHandshakeStage::SessionResume,
                "ACP agent does not advertise session/resume",
            ))
        }
        _ => None,
    };
    if let Some((stage, message)) = unsupported_restore {
        let _ = emit_event(
            &event_tx,
            AcpEvent::Error {
                kind: AcpEventErrorKind::HandshakeFailed {
                    stage,
                    message: message.to_string(),
                },
            },
        )
        .await;
        return Ok(());
    }

    // 2. One session, rooted at the workspace.
    let mcp_servers: Vec<McpServer> = mcp_servers
        .into_iter()
        .map(|server| {
            McpServer::Stdio(
                McpServerStdio::new(server.name, server.command)
                    .args(server.args)
                    .env(
                        server
                            .env
                            .into_iter()
                            .map(|(name, value)| EnvVariable::new(name, value))
                            .collect(),
                    ),
            )
        })
        .collect();
    let (session_id, supports_mode) = match start {
        AcpSessionStart::New => {
            let stage = AcpHandshakeStage::SessionNew;
            let _ = emit_event(&event_tx, AcpEvent::HandshakeStarted { stage }).await;
            let session_request = NewSessionRequest::new(cwd.clone())
                .mcp_servers(mcp_servers.clone())
                .meta(session_meta.clone());
            let session = cx.send_request(session_request).block_task();
            let session_result = await_handshake_stage(
                session,
                stage,
                std::cmp::min(
                    deadline,
                    tokio::time::Instant::now() + Duration::from_secs(5),
                ),
                &mut prompt_rx,
                &mut shutdown_rx,
                &event_tx,
            )
            .await;
            let session = match session_result {
                Ok(Some(session)) => session,
                Ok(None) => return Ok(()),
                Err(_) if !mcp_servers.is_empty() => {
                    // A slow or broken MCP must never prevent the primary ACP session
                    // from becoming usable. Retry session/new once without MCP.
                    let fallback = cx
                        .send_request(
                            NewSessionRequest::new(cwd)
                                .mcp_servers(Vec::new())
                                .meta(session_meta),
                        )
                        .block_task();
                    match await_handshake_stage(
                        fallback,
                        stage,
                        deadline,
                        &mut prompt_rx,
                        &mut shutdown_rx,
                        &event_tx,
                    )
                    .await?
                    {
                        Some(session) => session,
                        None => return Ok(()),
                    }
                }
                Err(error) => return Err(error),
            };
            (session.session_id.to_string(), session.modes.is_some())
        }
        AcpSessionStart::Load { session_id } => {
            let stage = AcpHandshakeStage::SessionLoad;
            let _ = emit_event(&event_tx, AcpEvent::HandshakeStarted { stage }).await;
            let request = LoadSessionRequest::new(session_id.clone(), cwd.clone())
                .mcp_servers(mcp_servers.clone())
                .meta(session_meta.clone());
            let result = await_handshake_stage(
                cx.send_request(request).block_task(),
                stage,
                std::cmp::min(
                    deadline,
                    tokio::time::Instant::now() + Duration::from_secs(5),
                ),
                &mut prompt_rx,
                &mut shutdown_rx,
                &event_tx,
            )
            .await;
            match result {
                Ok(Some(session)) => (session_id, session.modes.is_some()),
                Ok(None) => return Ok(()),
                Err(_) if !mcp_servers.is_empty() => {
                    let fallback = LoadSessionRequest::new(session_id.clone(), cwd)
                        .mcp_servers(Vec::new())
                        .meta(session_meta);
                    match await_handshake_stage(
                        cx.send_request(fallback).block_task(),
                        stage,
                        deadline,
                        &mut prompt_rx,
                        &mut shutdown_rx,
                        &event_tx,
                    )
                    .await?
                    {
                        Some(session) => (session_id, session.modes.is_some()),
                        None => return Ok(()),
                    }
                }
                Err(error) => return Err(error),
            }
        }
        AcpSessionStart::Resume { session_id } => {
            let stage = AcpHandshakeStage::SessionResume;
            let _ = emit_event(&event_tx, AcpEvent::HandshakeStarted { stage }).await;
            let request = ResumeSessionRequest::new(session_id.clone(), cwd.clone())
                .mcp_servers(mcp_servers.clone())
                .meta(session_meta.clone());
            let result = await_handshake_stage(
                cx.send_request(request).block_task(),
                stage,
                std::cmp::min(
                    deadline,
                    tokio::time::Instant::now() + Duration::from_secs(5),
                ),
                &mut prompt_rx,
                &mut shutdown_rx,
                &event_tx,
            )
            .await;
            match result {
                Ok(Some(session)) => (session_id, session.modes.is_some()),
                Ok(None) => return Ok(()),
                Err(_) if !mcp_servers.is_empty() => {
                    let fallback = ResumeSessionRequest::new(session_id.clone(), cwd)
                        .mcp_servers(Vec::new())
                        .meta(session_meta);
                    match await_handshake_stage(
                        cx.send_request(fallback).block_task(),
                        stage,
                        deadline,
                        &mut prompt_rx,
                        &mut shutdown_rx,
                        &event_tx,
                    )
                    .await?
                    {
                        Some(session) => (session_id, session.modes.is_some()),
                        None => return Ok(()),
                    }
                }
                Err(error) => return Err(error),
            }
        }
    };
    mode_supported.store(supports_mode, Ordering::Release);
    let _ = emit_event(
        &event_tx,
        AcpEvent::Ready {
            session_id: session_id.to_string(),
        },
    )
    .await;
    cancel_rx.borrow_and_update();

    // 3. Pump prompts while cancellation and shutdown remain out-of-band.
    // Keep the protocol request in an abortable task. Some adapters/MCP
    // servers never answer the original session/prompt after receiving
    // session/cancel; retaining that future would leave the host permanently
    // busy even though the UI already reported Interrupted.
    let mut in_flight: Option<
        tokio::task::JoinHandle<Result<PromptResponse, agent_client_protocol::Error>>,
    > = None;
    loop {
        let prompt_result = async {
            match in_flight.as_mut() {
                Some(prompt) => Some(prompt.await),
                None => std::future::pending().await,
            }
        };
        tokio::pin!(prompt_result);

        tokio::select! {
            biased;
            _ = shutdown_rx.changed() => {
                if let Some(prompt) = in_flight.take() {
                    prompt.abort();
                }
                break;
            }
            _ = cancel_rx.changed() => {
                if in_flight.is_some() {
                    use agent_client_protocol::schema::v1::CancelNotification;
                    let _ = cx.send_notification(CancelNotification::new(session_id.clone()));
                    if let Some(prompt) = in_flight.take() {
                        prompt.abort();
                    }
                    let _ = emit_event(
                        &event_tx,
                        AcpEvent::TurnEnded {
                            stop_reason: "cancelled".to_string(),
                            usage: None,
                        },
                    )
                    .await;
                }
            }
            model = model_rx.recv() => {
                let Some(model) = model else {
                    break;
                };
                let result = if in_flight.is_some() {
                    Err(AcpError::Protocol(
                        "cannot change ACP model while a prompt is in flight".to_string(),
                    ))
                } else {
                    let params = serde_json::value::to_raw_value(&serde_json::json!({
                        "sessionId": session_id.clone(),
                        "modelId": model.model_id,
                    }))
                    .map(Arc::from)
                    .map_err(|error| AcpError::Protocol(error.to_string()));
                    match params {
                        Ok(params) => {
                            let request = agent_client_protocol::schema::v1::ClientRequest::ExtMethodRequest(
                                agent_client_protocol::schema::v1::ExtRequest::new(
                                    "session/set_model",
                                    params,
                                ),
                            );
                            cx.send_request(request)
                                .block_task()
                                .await
                                .map(|_| ())
                                .map_err(|error| AcpError::Protocol(error.to_string()))
                        }
                        Err(error) => Err(error),
                    }
                };
                let _ = model.reply.send(result);
            }
            mode = mode_rx.recv() => {
                let Some(mode) = mode else {
                    break;
                };
                let result = if in_flight.is_some() {
                    Err(AcpError::Protocol(
                        "cannot change ACP mode while a prompt is in flight".to_string(),
                    ))
                } else {
                    cx.send_request(SetSessionModeRequest::new(
                        session_id.clone(),
                        mode.mode_id,
                    ))
                    .block_task()
                    .await
                    .map(|_| ())
                    .map_err(|error| AcpError::Protocol(error.to_string()))
                };
                let _ = mode.reply.send(result);
            }
            prompt = prompt_rx.recv() => {
                let Some(prompt) = prompt else {
                    break;
                };
                if in_flight.is_some() {
                    let _ = emit_event(
                        &event_tx,
                        AcpEvent::Error {
                            kind: AcpEventErrorKind::PromptBusy,
                        },
                    )
                    .await;
                    continue;
                }
                if prompt.cancel_generation < *cancel_rx.borrow() {
                    let _ = emit_event(
                        &event_tx,
                        AcpEvent::TurnEnded {
                            stop_reason: "cancelled".to_string(),
                            usage: None,
                        },
                    )
                    .await;
                    continue;
                }
                let prompt_cx = cx.clone();
                let request = PromptRequest::new(session_id.clone(), prompt.content);
                in_flight = Some(tokio::spawn(async move {
                    prompt_cx.send_request(request).block_task().await
                }));
            }
            response = &mut prompt_result => {
                in_flight = None;
                match response.expect("prompt completion is only polled while present") {
                    Ok(Ok(response)) => {
                        let _ = emit_event(
                            &event_tx,
                            AcpEvent::TurnEnded {
                                stop_reason: stop_reason_str(response.stop_reason).to_string(),
                                usage: response.usage.as_ref().map(token_usage_from_acp),
                            },
                        )
                        .await;
                    }
                    Ok(Err(err)) => {
                        let message = "ACP prompt request failed".to_string();
                        let _ = emit_event(
                            &event_tx,
                            AcpEvent::Error {
                                kind: AcpEventErrorKind::PromptFailed {
                                    message,
                                },
                            },
                        )
                        .await;
                        return Err(err);
                    }
                    Err(_) => {
                        let message = "ACP prompt task stopped unexpectedly".to_string();
                        let _ = emit_event(
                            &event_tx,
                            AcpEvent::Error {
                                kind: AcpEventErrorKind::PromptFailed {
                                    message,
                                },
                            },
                        )
                        .await;
                        return Err(agent_client_protocol::util::internal_error(
                            "ACP prompt task stopped unexpectedly",
                        ));
                    }
                }
            }
        }
    }

    let _ = emit_event(&event_tx, AcpEvent::Exited { error: None }).await;
    Ok(())
}

async fn await_handshake_stage<T>(
    future: impl Future<Output = Result<T, agent_client_protocol::Error>>,
    stage: AcpHandshakeStage,
    deadline: tokio::time::Instant,
    prompt_rx: &mut mpsc::Receiver<PromptCommand>,
    shutdown_rx: &mut tokio::sync::watch::Receiver<bool>,
    event_tx: &mpsc::Sender<AcpEvent>,
) -> Result<Option<T>, agent_client_protocol::Error> {
    tokio::pin!(future);
    loop {
        tokio::select! {
            biased;
            _ = shutdown_rx.changed() => {
                let _ = emit_event(event_tx, AcpEvent::Exited { error: None }).await;
                return Ok(None);
            }
            result = &mut future => {
                return match result {
                    Ok(value) => Ok(Some(value)),
                    Err(err) => {
                        let _ = emit_event(
                            event_tx,
                            AcpEvent::Error {
                                kind: AcpEventErrorKind::HandshakeFailed {
                                    stage,
                                    message: SAFE_PROTOCOL_FAILURE.to_string(),
                                },
                            },
                        )
                        .await;
                        Err(err)
                    }
                };
            }
            _ = tokio::time::sleep_until(deadline) => {
                let _ = emit_event(
                    event_tx,
                    AcpEvent::Error {
                        kind: AcpEventErrorKind::HandshakeTimeout { stage },
                    },
                )
                .await;
                return Err(agent_client_protocol::util::internal_error(format!(
                    "ACP {stage:?} handshake timed out"
                )));
            }
            prompt = prompt_rx.recv() => {
                if prompt.is_none() {
                    let _ = emit_event(event_tx, AcpEvent::Exited { error: None }).await;
                    return Ok(None);
                }
                let _ = emit_event(
                    event_tx,
                    AcpEvent::Error {
                        kind: AcpEventErrorKind::PromptNotReady,
                    },
                )
                .await;
            }
        }
    }
}

fn safe_protocol_error(
    error: &agent_client_protocol::Error,
    diagnostics: &ProcessDiagnostics,
) -> String {
    // Adapter-controlled messages can echo prompts, headers, or environment
    // values. Only preserve diagnostics generated from our own fixed strings.
    let base = if error.message.trim() == PROCESS_TERMINATION_FAILURE {
        PROCESS_TERMINATION_FAILURE
    } else {
        SAFE_PROTOCOL_FAILURE
    };
    failure_message(base, diagnostics)
}

fn failure_message(base: &str, diagnostics: &ProcessDiagnostics) -> String {
    let tail = diagnostics.sanitized_stderr_tail();
    if tail.trim().is_empty() {
        return base.to_string();
    }
    let available =
        STDERR_TAIL_CAPACITY.saturating_sub(base.len() + STDERR_DIAGNOSTIC_PREFIX.len());
    let tail = utf8_tail(&tail, available);
    format!("{base}{STDERR_DIAGNOSTIC_PREFIX}{tail}")
}

fn sanitize_stderr_tail<'a>(
    stderr: &str,
    sensitive_values: impl Iterator<Item = &'a str>,
) -> String {
    let sensitive_values = sensitive_values
        .flat_map(|value| value.lines())
        .filter(|value| !value.is_empty())
        .flat_map(|value| {
            let mut variants = vec![value.to_string()];
            if let Ok(encoded) = serde_json::to_string(value) {
                variants.push(encoded[1..encoded.len() - 1].to_string());
            }
            variants
        })
        .collect::<Vec<_>>();
    let mut sanitized = String::with_capacity(stderr.len());
    for line in stderr.lines() {
        let clean = line
            .chars()
            .map(|character| {
                if character == '\t' || !character.is_control() {
                    character
                } else {
                    ' '
                }
            })
            .collect::<String>();
        let lower = clean.to_ascii_lowercase();
        if is_sensitive_stderr_line(&lower) {
            sanitized.push_str("[redacted sensitive diagnostic]\n");
            continue;
        }
        let mut clean = clean;
        for value in &sensitive_values {
            clean = clean.replace(value, "[REDACTED]");
        }
        sanitized.push_str(&clean);
        sanitized.push('\n');
    }
    sanitized.trim_end().to_string()
}

fn is_sensitive_stderr_line(lower: &str) -> bool {
    let trimmed = lower.trim_start();
    let json_fragment = matches!(trimmed, "{" | "}" | "[" | "]")
        || trimmed.starts_with('"')
        || trimmed.starts_with("[{")
        || trimmed.starts_with("[\"");
    json_fragment
        || lower.contains("\"jsonrpc\"")
        || lower.contains("\"method\"")
        || lower.contains("\"params\"")
        || [
            "bearer ",
            "api_key",
            "api-key",
            "apikey",
            "authorization",
            "password",
            "secret",
            "token",
            "prompt",
        ]
        .iter()
        .any(|keyword| lower.contains(keyword))
}

fn utf8_tail(value: &str, max_bytes: usize) -> &str {
    if value.len() <= max_bytes {
        return value;
    }
    let mut start = value.len() - max_bytes;
    while !value.is_char_boundary(start) {
        start += 1;
    }
    &value[start..]
}

/// ACP stdio transport whose process lifetime is owned by ZeroWall rather than
/// the SDK's platform-default child guard.
struct ManagedAcpAgent {
    profile: AcpAgentProfile,
    shutdown_grace: Duration,
    diagnostics: ProcessDiagnostics,
}

impl ManagedAcpAgent {
    fn new(
        profile: AcpAgentProfile,
        shutdown_grace: Duration,
        diagnostics: ProcessDiagnostics,
    ) -> Self {
        Self {
            profile,
            shutdown_grace,
            diagnostics,
        }
    }
}

impl ConnectTo<Client> for ManagedAcpAgent {
    async fn connect_to(
        self,
        client: impl ConnectTo<Agent>,
    ) -> Result<(), agent_client_protocol::Error> {
        let mut owner =
            ProcessTreeOwner::new().map_err(agent_client_protocol::Error::into_internal_error)?;
        let (stdin, stdout, mut stderr, mut child) = owner.spawn(&self.profile)?;

        let stderr_diagnostics = self.diagnostics.clone();
        let mut stderr_task = tokio::spawn(async move {
            let mut buffer = [0_u8; 8192];
            loop {
                match FuturesAsyncReadExt::read(&mut stderr, &mut buffer).await {
                    Ok(0) | Err(_) => break,
                    Ok(read) => stderr_diagnostics.push_stderr(&buffer[..read]),
                }
            }
        });

        let incoming = futures::io::BufReader::new(stdout).lines();
        let outgoing = futures::sink::unfold(stdin, async move |mut writer, line: String| {
            writer.write_all(line.as_bytes()).await?;
            writer.write_all(b"\n").await?;
            writer.flush().await?;
            Ok::<_, std::io::Error>(writer)
        });
        let protocol = ConnectTo::<Client>::connect_to(Lines::new(outgoing, incoming), client);
        tokio::pin!(protocol);
        let child_wait = child.status();
        tokio::pin!(child_wait);

        let result = tokio::select! {
            protocol_result = &mut protocol => {
                match protocol_result {
                    Err(error) => {
                        match terminate_or_error(&mut owner) {
                            Ok(()) => Err(error),
                            Err(termination_error) => Err(termination_error),
                        }
                    }
                    Ok(()) => {
                        if tokio::time::timeout(self.shutdown_grace, &mut child_wait).await.is_err() {
                            let termination = terminate_or_error(&mut owner);
                            let _ = tokio::time::timeout(Duration::from_secs(1), &mut child_wait).await;
                            termination
                        } else {
                            Ok(())
                        }
                    }
                }
            }
            status = &mut child_wait => {
                match terminate_or_error(&mut owner) {
                    Err(termination_error) => Err(termination_error),
                    Ok(()) => match status {
                        Ok(status) if status.success() => Ok(()),
                        Ok(_) => Err(agent_client_protocol::util::internal_error("ACP agent process exited unsuccessfully")),
                        Err(error) => Err(agent_client_protocol::Error::into_internal_error(error)),
                    },
                }
            }
        };

        if tokio::time::timeout(Duration::from_secs(1), &mut stderr_task)
            .await
            .is_err()
        {
            stderr_task.abort();
        }
        result
    }
}

fn terminate_or_error(owner: &mut ProcessTreeOwner) -> Result<(), agent_client_protocol::Error> {
    owner
        .terminate()
        .map_err(|_| agent_client_protocol::util::internal_error(PROCESS_TERMINATION_FAILURE))
}

struct ProcessTreeOwner {
    pid: Option<u32>,
    #[cfg(windows)]
    job: WindowsJob,
}

impl ProcessTreeOwner {
    fn new() -> std::io::Result<Self> {
        Ok(Self {
            pid: None,
            #[cfg(windows)]
            job: WindowsJob::new()?,
        })
    }

    fn spawn(
        &mut self,
        profile: &AcpAgentProfile,
    ) -> Result<
        (
            async_process::ChildStdin,
            async_process::ChildStdout,
            async_process::ChildStderr,
            async_process::Child,
        ),
        agent_client_protocol::Error,
    > {
        #[cfg(windows)]
        let result = self.job.spawn_suspended(profile)?;
        #[cfg(unix)]
        let result = spawn_unix_process_group(profile)?;

        self.pid = Some(result.3.id());
        Ok(result)
    }

    fn terminate(&mut self) -> std::io::Result<()> {
        let Some(_pid) = self.pid.take() else {
            return Ok(());
        };
        #[cfg(unix)]
        let result = terminate_unix_process_group(_pid);
        #[cfg(windows)]
        let result = self.job.terminate();
        if result.is_err() {
            self.pid = Some(_pid);
        }
        result
    }
}

#[cfg(unix)]
fn spawn_unix_process_group(
    profile: &AcpAgentProfile,
) -> Result<
    (
        async_process::ChildStdin,
        async_process::ChildStdout,
        async_process::ChildStderr,
        async_process::Child,
    ),
    agent_client_protocol::Error,
> {
    use std::os::unix::process::CommandExt;

    let mut command = std::process::Command::new(&profile.command);
    command.args(&profile.args).process_group(0);
    for name in &profile.env_remove {
        command.env_remove(name);
    }
    for (name, value) in &profile.env {
        command.env(name, value);
    }
    let mut command = async_process::Command::from(command);
    command
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(agent_client_protocol::Error::into_internal_error)?;
    let stdin = child.stdin.take().ok_or_else(|| {
        agent_client_protocol::util::internal_error("failed to open ACP agent stdin")
    })?;
    let stdout = child.stdout.take().ok_or_else(|| {
        agent_client_protocol::util::internal_error("failed to open ACP agent stdout")
    })?;
    let stderr = child.stderr.take().ok_or_else(|| {
        agent_client_protocol::util::internal_error("failed to open ACP agent stderr")
    })?;
    Ok((stdin, stdout, stderr, child))
}

impl Drop for ProcessTreeOwner {
    fn drop(&mut self) {
        let _ = self.terminate();
    }
}

#[cfg(unix)]
fn terminate_unix_process_group(pid: u32) -> std::io::Result<()> {
    unsafe extern "C" {
        fn kill(pid: i32, signal: i32) -> i32;
    }
    const SIGKILL: i32 = 9;
    if unsafe { kill(-(pid as i32), SIGKILL) } == 0 {
        return Ok(());
    }
    let error = std::io::Error::last_os_error();
    if error.raw_os_error() == Some(3) {
        return Ok(());
    }
    Err(error)
}

#[cfg(windows)]
struct WindowsJob(*mut std::ffi::c_void);

#[cfg(windows)]
unsafe impl Send for WindowsJob {}

#[cfg(windows)]
impl WindowsJob {
    fn new() -> std::io::Result<Self> {
        use std::mem::{size_of, zeroed};

        const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x0000_2000;
        const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: i32 = 9;
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err(std::io::Error::last_os_error());
            }
            let mut info: JobObjectExtendedLimitInformation = zeroed();
            info.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job,
                JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
                &info as *const _ as *const std::ffi::c_void,
                size_of::<JobObjectExtendedLimitInformation>() as u32,
            ) == 0
            {
                let error = std::io::Error::last_os_error();
                CloseHandle(job);
                return Err(error);
            }
            Ok(Self(job))
        }
    }

    fn spawn_suspended(
        &self,
        profile: &AcpAgentProfile,
    ) -> Result<
        (
            async_process::ChildStdin,
            async_process::ChildStdout,
            async_process::ChildStderr,
            async_process::Child,
        ),
        agent_client_protocol::Error,
    > {
        use std::os::windows::io::AsRawHandle;
        use std::os::windows::process::CommandExt;

        const CREATE_SUSPENDED: u32 = 0x0000_0004;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        let mut command = std::process::Command::new(&profile.command);
        command
            .args(&profile.args)
            .creation_flags(CREATE_SUSPENDED | CREATE_NO_WINDOW);
        for name in &profile.env_remove {
            command.env_remove(name);
        }
        for (name, value) in &profile.env {
            command.env(name, value);
        }

        let mut command = async_process::Command::from(command);
        command
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        let mut child = command.spawn().map_err(|error| {
            agent_client_protocol::util::internal_error(format!(
                "failed to create suspended ACP agent process: {error}"
            ))
        })?;
        let process = child.as_raw_handle();

        unsafe {
            if AssignProcessToJobObject(self.0, process) == 0 {
                let error = std::io::Error::last_os_error();
                let _ = child.kill();
                return Err(agent_client_protocol::util::internal_error(format!(
                    "failed to assign ACP agent process to Job Object: {error}"
                )));
            }
            let resume_status = NtResumeProcess(process);
            if resume_status < 0 {
                let _ = self.terminate();
                let _ = child.kill();
                return Err(agent_client_protocol::util::internal_error(format!(
                    "failed to resume ACP agent after assigning its process tree: NTSTATUS {resume_status:#x}"
                )));
            }
        }

        let stdin = child.stdin.take().ok_or_else(|| {
            let _ = self.terminate();
            agent_client_protocol::util::internal_error("failed to open ACP agent stdin")
        })?;
        let stdout = child.stdout.take().ok_or_else(|| {
            let _ = self.terminate();
            agent_client_protocol::util::internal_error("failed to open ACP agent stdout")
        })?;
        let stderr = child.stderr.take().ok_or_else(|| {
            let _ = self.terminate();
            agent_client_protocol::util::internal_error("failed to open ACP agent stderr")
        })?;
        Ok((stdin, stdout, stderr, child))
    }

    fn terminate(&self) -> std::io::Result<()> {
        if unsafe { TerminateJobObject(self.0, 1) } == 0 {
            Err(std::io::Error::last_os_error())
        } else {
            Ok(())
        }
    }
}

#[cfg(windows)]
impl Drop for WindowsJob {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

#[cfg(windows)]
#[repr(C)]
struct IoCounters {
    read_operation_count: u64,
    write_operation_count: u64,
    other_operation_count: u64,
    read_transfer_count: u64,
    write_transfer_count: u64,
    other_transfer_count: u64,
}

#[cfg(windows)]
#[repr(C)]
struct JobObjectBasicLimitInformation {
    per_process_user_time_limit: i64,
    per_job_user_time_limit: i64,
    limit_flags: u32,
    minimum_working_set_size: usize,
    maximum_working_set_size: usize,
    active_process_limit: u32,
    affinity: usize,
    priority_class: u32,
    scheduling_class: u32,
}

#[cfg(windows)]
#[repr(C)]
struct JobObjectExtendedLimitInformation {
    basic_limit_information: JobObjectBasicLimitInformation,
    io_info: IoCounters,
    process_memory_limit: usize,
    job_memory_limit: usize,
    peak_process_memory_used: usize,
    peak_job_memory_used: usize,
}

#[cfg(windows)]
unsafe extern "system" {
    fn CreateJobObjectW(
        job_attributes: *const std::ffi::c_void,
        name: *const u16,
    ) -> *mut std::ffi::c_void;
    fn SetInformationJobObject(
        job: *mut std::ffi::c_void,
        info_class: i32,
        info: *const std::ffi::c_void,
        info_length: u32,
    ) -> i32;
    fn AssignProcessToJobObject(job: *mut std::ffi::c_void, process: *mut std::ffi::c_void) -> i32;
    fn TerminateJobObject(job: *mut std::ffi::c_void, exit_code: u32) -> i32;
    fn CloseHandle(object: *mut std::ffi::c_void) -> i32;
}

#[cfg(windows)]
#[link(name = "ntdll")]
unsafe extern "system" {
    fn NtResumeProcess(process: *mut std::ffi::c_void) -> i32;
}

/// Map a `SessionUpdate` to the host-facing event, if it carries one we surface.
async fn forward_notification(tx: &mpsc::Sender<AcpEvent>, update: SessionUpdate) {
    let event = match update {
        SessionUpdate::AgentMessageChunk(chunk) => Some(AcpEvent::AgentMessage {
            message_id: chunk.message_id.map(|id| id.to_string()),
            text: content_block_text(&chunk.content),
        }),
        SessionUpdate::AgentThoughtChunk(chunk) => Some(AcpEvent::AgentThought {
            message_id: chunk.message_id.map(|id| id.to_string()),
            text: content_block_text(&chunk.content),
        }),
        SessionUpdate::ToolCall(tool_call) => serde_json::to_value(&tool_call)
            .ok()
            .map(AcpEvent::ToolCall),
        SessionUpdate::ToolCallUpdate(tool_call) => serde_json::to_value(&tool_call)
            .ok()
            .map(AcpEvent::ToolCall),
        SessionUpdate::Plan(plan) => serde_json::to_value(&plan).ok().map(AcpEvent::Plan),
        SessionUpdate::UsageUpdate(usage) => Some(AcpEvent::Usage(AcpUsageUpdate {
            used: usage.used,
            size: usage.size,
            token_usage: usage.meta.as_ref().and_then(token_usage_from_meta),
        })),
        // User-message echoes, command lists, mode/config/session-info updates,
        // and any future non-exhaustive variants are not surfaced here.
        _ => None,
    };
    if let Some(event) = event {
        let _ = emit_event(tx, event).await;
    }
}

/// Extract provider usage from an ACP extension metadata object without
/// retaining arbitrary metadata. Claude/Anthropic adapters use
/// `input_tokens`/`output_tokens`, while OpenAI-compatible adapters commonly
/// use `prompt_tokens`/`completion_tokens`; both may be nested under a vendor
/// key. Only numeric token counters are accepted.
fn token_usage_from_meta(meta: &agent_client_protocol::schema::v1::Meta) -> Option<AcpTokenUsage> {
    fn number(value: &serde_json::Value, keys: &[&str]) -> Option<u64> {
        keys.iter()
            .find_map(|key| value.get(*key))
            .and_then(|value| {
                value
                    .as_u64()
                    .or_else(|| value.as_i64().and_then(|v| u64::try_from(v).ok()))
            })
    }

    fn walk(value: &serde_json::Value) -> Option<AcpTokenUsage> {
        let object = value.as_object()?;
        let input = number(
            value,
            &[
                "input_tokens",
                "prompt_tokens",
                "inputTokens",
                "promptTokens",
            ],
        );
        let output = number(
            value,
            &[
                "output_tokens",
                "completion_tokens",
                "outputTokens",
                "completionTokens",
            ],
        );
        if let (Some(input_tokens), Some(output_tokens)) = (input, output) {
            let thought_tokens = number(
                value,
                &[
                    "thought_tokens",
                    "reasoning_tokens",
                    "thoughtTokens",
                    "reasoningTokens",
                ],
            )
            .unwrap_or(0);
            let cached_read_tokens = number(
                value,
                &[
                    "cached_read_tokens",
                    "cache_read_input_tokens",
                    "prompt_cache_hit_tokens",
                    "cachedReadTokens",
                    "cacheReadInputTokens",
                ],
            )
            .unwrap_or(0);
            let cached_write_tokens = number(
                value,
                &[
                    "cached_write_tokens",
                    "cache_creation_input_tokens",
                    "cachedWriteTokens",
                    "cacheCreationInputTokens",
                ],
            )
            .unwrap_or(0);
            let total_tokens = number(value, &["total_tokens", "totalTokens"])
                .unwrap_or_else(|| input_tokens.saturating_add(output_tokens));
            return Some(AcpTokenUsage {
                total_tokens,
                input_tokens,
                output_tokens,
                thought_tokens,
                cached_read_tokens,
                cached_write_tokens,
            });
        }
        object.values().find_map(walk)
    }

    walk(&serde_json::Value::Object(meta.clone()))
}

/// Emit a `Permission` event and await the host's decision.
async fn ask_permission(
    tx: &mpsc::Sender<AcpEvent>,
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
    if !emit_event(
        tx,
        AcpEvent::Permission {
            request: request_json,
            options,
            reply: reply_tx,
        },
    )
    .await
    {
        // Host is gone: fail closed.
        return RequestPermissionOutcome::Cancelled;
    }

    match reply_rx.await {
        Ok(Some(option_id)) => {
            RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(option_id))
        }
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
fn comparable_sandbox_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        let display = path.as_os_str().to_string_lossy();
        if let Some(unc) = display.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{unc}"));
        }
        if let Some(regular) = display.strip_prefix(r"\\?\") {
            return PathBuf::from(regular);
        }
    }
    path.to_path_buf()
}

fn sandbox_path(root: &Path, requested: &Path) -> Result<PathBuf, String> {
    // `canonicalize` emits Windows verbatim paths (`\\?\C:\...`) while ACP
    // adapters typically send ordinary drive paths. Compare one lexical form;
    // this changes representation only, never the sandbox boundary.
    let requested = comparable_sandbox_path(requested);
    let root = comparable_sandbox_path(root);
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
                    return Err(format!("path escapes its root: {}", requested.display()));
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
    let path =
        sandbox_path(root, &request.path).map_err(agent_client_protocol::util::internal_error)?;
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
        Some(n) => out.take(n as usize).collect::<Vec<_>>().join("\n"),
        None => out.collect::<Vec<_>>().join("\n"),
    }
}

/// Handle an `fs/write_text_file` request: sandbox the path, create parents,
/// write, and emit `FileWritten` so the host records provenance. A rejected or
/// failed write becomes a protocol error.
async fn handle_write(
    root: &Path,
    event_tx: &mpsc::Sender<AcpEvent>,
    request: WriteTextFileRequest,
) -> Result<WriteTextFileResponse, agent_client_protocol::Error> {
    let path =
        sandbox_path(root, &request.path).map_err(agent_client_protocol::util::internal_error)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(agent_client_protocol::util::internal_error)?;
    }
    std::fs::write(&path, &request.content).map_err(agent_client_protocol::util::internal_error)?;
    let _ = emit_event(
        event_tx,
        AcpEvent::FileWritten {
            path: path.to_string_lossy().to_string(),
        },
    )
    .await;
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

/// Native Windows does not execute POSIX shell programs or their flags. Do not
/// guess at a translation: quoting, pipes, and globbing differ across shells.
/// Returning an explicit protocol error gives the agent a chance to retry with
/// the correct PowerShell command before any unrelated executable is started.
#[cfg(windows)]
fn unsupported_windows_shell_command(command: &str, args: &[String]) -> Option<String> {
    let executable = Path::new(command)
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or(command)
        .to_ascii_lowercase();
    let posix_only = matches!(
        executable.as_str(),
        "head" | "tail" | "sed" | "awk" | "grep" | "pwd" | "ls" | "cat"
    );
    let posix_find = executable == "find"
        && args.iter().any(|arg| {
            matches!(
                arg.as_str(),
                "-maxdepth" | "-mindepth" | "-type" | "-name" | "-iname"
            )
        });
    if !(posix_only || posix_find) {
        return None;
    }
    Some(
        "This ZeroWall terminal runs on Windows. Use PowerShell through `powershell.exe -NoProfile -Command ...`, not POSIX shell commands. For a file listing use `Get-ChildItem -Recurse -File | Select-Object -First 50`; use Get-Content and Select-String for file reads and search."
            .to_string(),
    )
}

#[cfg(not(windows))]
fn unsupported_windows_shell_command(_command: &str, _args: &[String]) -> Option<String> {
    None
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
    event_tx: &mpsc::Sender<AcpEvent>,
    request: CreateTerminalRequest,
) -> Result<CreateTerminalResponse, agent_client_protocol::Error> {
    // Resolve and sandbox the working directory before asking for approval, so
    // the user is shown the real cwd and an escaping cwd never reaches spawn.
    let cwd = match &request.cwd {
        Some(dir) => {
            sandbox_path(root, dir).map_err(agent_client_protocol::util::internal_error)?
        }
        None => root.to_path_buf(),
    };

    if let Some(message) = unsupported_windows_shell_command(&request.command, &request.args) {
        return Err(agent_client_protocol::util::internal_error(message));
    }

    // Approval gate: command execution requires an explicit host decision.
    let (reply_tx, reply_rx) = oneshot::channel::<bool>();
    if !emit_event(
        event_tx,
        AcpEvent::ExecApproval {
            command: request.command.clone(),
            args: request.args.clone(),
            cwd: request
                .cwd
                .as_ref()
                .map(|_| cwd.to_string_lossy().to_string()),
            reply: reply_tx,
        },
    )
    .await
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

/// Build a capability-neutral ACP prompt. Text and resource links are baseline
/// protocol features; images use ACP's native image block, while documents use
/// their locally extracted text so no adapter-specific filesystem convention is
/// required for ordinary PDF, DOCX, TXT, Markdown, or CSV attachments.
fn prompt_content(text: String, attachments: Vec<PromptAttachment>) -> Vec<ContentBlock> {
    let mut content = Vec::new();
    if !text.trim().is_empty() {
        content.push(ContentBlock::from(text));
    }
    for attachment in attachments {
        if attachment.mime.starts_with("image/") {
            content.push(ContentBlock::from(format!(
                "[Attached image: {}]",
                attachment.filename
            )));
            content.push(ContentBlock::Image(ImageContent::new(
                attachment.base64,
                attachment.mime,
            )));
            continue;
        }
        let extracted = attachment.extracted_text.unwrap_or_default();
        let body = if extracted.trim().is_empty() {
            format!(
                "[Attached file: {}]\nThe file is available in the workspace. Read it when its contents are needed.",
                attachment.filename
            )
        } else {
            format!("[Attached file: {}]\n{}", attachment.filename, extracted)
        };
        content.push(ContentBlock::from(body));
    }
    if content.is_empty() {
        content.push(ContentBlock::from(String::new()));
    }
    content
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

fn token_usage_from_acp(usage: &agent_client_protocol::schema::v1::Usage) -> AcpTokenUsage {
    AcpTokenUsage {
        total_tokens: usage.total_tokens,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        thought_tokens: usage.thought_tokens.unwrap_or(0),
        cached_read_tokens: usage.cached_read_tokens.unwrap_or(0),
        cached_write_tokens: usage.cached_write_tokens.unwrap_or(0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_client_protocol::schema::v1::SessionId;

    #[cfg(windows)]
    #[test]
    fn windows_rejects_posix_listing_commands_with_a_powershell_hint() {
        let error = unsupported_windows_shell_command(
            "find",
            &[".".to_string(), "-maxdepth".to_string(), "2".to_string()],
        )
        .expect("POSIX find flags must not be executed by Windows find.exe");
        assert!(error.contains("PowerShell"));
        assert!(error.contains("Get-ChildItem"));
        assert!(
            unsupported_windows_shell_command("powershell.exe", &["-Command".to_string()])
                .is_none()
        );
    }

    #[test]
    fn stderr_sanitizer_redacts_json_escaped_sensitive_values() {
        let sensitive = "quoted\"value\\path";
        let encoded = serde_json::to_string(sensitive).unwrap();
        let escaped = encoded.trim_matches('"');
        let stderr = format!("direct={sensitive}\nescaped={escaped}\nordinary tail");
        let sanitized = sanitize_stderr_tail(&stderr, std::iter::once(sensitive));

        assert!(sanitized.contains("ordinary tail"));
        assert!(!sanitized.contains(sensitive));
        assert!(!sanitized.contains(escaped));
    }

    #[test]
    fn stderr_sanitizer_drops_pretty_printed_json_rpc_fragments() {
        let stderr = "{\n  \"jsonrpc\": \"2.0\",\n  \"id\": 7,\n  \"result\": {\"status\": \"failed\"}\n}\nordinary tail";
        let sanitized = sanitize_stderr_tail(stderr, std::iter::empty());

        assert!(sanitized.contains("ordinary tail"));
        assert!(!sanitized.contains("jsonrpc"));
        assert!(!sanitized.contains("\"id\""));
        assert!(!sanitized.contains("\"result\""));
    }

    #[test]
    fn stderr_tail_keeps_only_the_fixed_capacity_suffix() {
        let mut tail = BoundedByteTail::default();
        tail.push(b"old-prefix");
        tail.push(&vec![b'x'; STDERR_TAIL_CAPACITY]);
        tail.push(b"ordinary-tail");
        let snapshot = tail.snapshot();

        assert_eq!(snapshot.len(), STDERR_TAIL_CAPACITY);
        assert!(!snapshot
            .windows(b"old-prefix".len())
            .any(|w| w == b"old-prefix"));
        assert!(snapshot.ends_with(b"ordinary-tail"));
    }

    #[test]
    fn stderr_sanitizer_remembers_every_prompt_for_the_session() {
        let profile = AcpAgentProfile {
            id: "codex".to_string(),
            label: "Codex".to_string(),
            command: "codex-acp".to_string(),
            args: vec![],
            env: vec![],
            env_remove: vec![],
            session_meta: None,
            mcp_servers: vec![],
        };
        let diagnostics = ProcessDiagnostics::new(&profile);
        for index in 0..9 {
            diagnostics.remember_prompt(&format!("private phrase number {index}"));
        }
        diagnostics.push_stderr(b"adapter echoed private phrase number 0\nordinary tail");

        let sanitized = diagnostics.sanitized_stderr_tail();
        assert!(!sanitized.contains("private phrase number 0"));
        assert!(sanitized.contains("ordinary tail"));
    }

    #[test]
    fn debug_output_never_contains_profile_secrets_or_prompts() {
        const SECRET: &str = "debug-secret-must-not-surface";
        const PROMPT: &str = "debug-prompt-must-not-surface";
        let profile = AcpAgentProfile {
            id: "codex".to_string(),
            label: "Codex".to_string(),
            command: "codex-acp".to_string(),
            args: vec![SECRET.to_string()],
            env: vec![("CODEX_API_KEY".to_string(), SECRET.to_string())],
            env_remove: vec!["OPENAI_API_KEY".to_string()],
            session_meta: None,
            mcp_servers: vec![],
        };
        let profile_debug = format!("{profile:?}");
        assert!(!profile_debug.contains(SECRET));

        let (client, _events, _driver) = AcpClient::launch(&profile, std::env::temp_dir());
        client.prompt(PROMPT).unwrap();
        let client_debug = format!("{client:?}");
        assert!(!client_debug.contains(SECRET));
        assert!(!client_debug.contains(PROMPT));
    }

    #[test]
    fn stop_reasons_have_stable_strings() {
        assert_eq!(stop_reason_str(StopReason::EndTurn), "end_turn");
        assert_eq!(stop_reason_str(StopReason::Cancelled), "cancelled");
        assert_eq!(stop_reason_str(StopReason::MaxTokens), "max_tokens");
        assert_eq!(stop_reason_str(StopReason::Refusal), "refusal");
    }

    #[test]
    fn prompt_usage_maps_all_cumulative_token_counters() {
        let usage = agent_client_protocol::schema::v1::Usage::new(250, 100, 150)
            .thought_tokens(12)
            .cached_read_tokens(8)
            .cached_write_tokens(3);
        assert_eq!(
            token_usage_from_acp(&usage),
            AcpTokenUsage {
                total_tokens: 250,
                input_tokens: 100,
                output_tokens: 150,
                thought_tokens: 12,
                cached_read_tokens: 8,
                cached_write_tokens: 3,
            }
        );
    }

    #[tokio::test]
    async fn usage_update_extracts_provider_counters_from_meta() {
        use agent_client_protocol::schema::v1::{SessionUpdate, UsageUpdate};

        let mut provider = serde_json::Map::new();
        provider.insert("prompt_tokens".into(), serde_json::json!(120));
        provider.insert("completion_tokens".into(), serde_json::json!(37));
        provider.insert("reasoning_tokens".into(), serde_json::json!(5));
        provider.insert("prompt_cache_hit_tokens".into(), serde_json::json!(20));
        let mut meta = serde_json::Map::new();
        meta.insert("provider_usage".into(), serde_json::Value::Object(provider));

        let update = SessionUpdate::UsageUpdate(UsageUpdate::new(157, 200_000).meta(meta));
        let (tx, mut rx) = mpsc::channel(1);
        forward_notification(&tx, update).await;
        let event = rx.recv().await.expect("usage event");
        match event {
            AcpEvent::Usage(usage) => {
                assert_eq!(usage.used, 157);
                assert_eq!(usage.size, 200_000);
                assert_eq!(
                    usage.token_usage.map(|u| (
                        u.input_tokens,
                        u.output_tokens,
                        u.thought_tokens,
                        u.cached_read_tokens
                    )),
                    Some((120, 37, 5, 20))
                );
            }
            other => panic!("expected usage event, got {other:?}"),
        }
    }

    #[test]
    fn text_content_block_renders_text() {
        let block = ContentBlock::from("hello".to_string());
        assert_eq!(content_block_text(&block), "hello");
    }

    #[test]
    fn prompt_content_keeps_images_structured_and_documents_readable() {
        let content = prompt_content(
            "Please analyze the attachments".to_string(),
            vec![
                PromptAttachment {
                    filename: "floor-plan.png".to_string(),
                    mime: "image/png".to_string(),
                    base64: "cGl4ZWxz".to_string(),
                    extracted_text: None,
                },
                PromptAttachment {
                    filename: "notes.txt".to_string(),
                    mime: "text/plain".to_string(),
                    base64: "bm90ZXM=".to_string(),
                    extracted_text: Some("The sample document text".to_string()),
                },
            ],
        );

        assert!(matches!(
            &content[1],
            ContentBlock::Text(text) if text.text == "[Attached image: floor-plan.png]"
        ));
        assert!(matches!(
            &content[2],
            ContentBlock::Image(image)
                if image.mime_type == "image/png" && image.data == "cGl4ZWxz"
        ));
        assert!(matches!(
            &content[3],
            ContentBlock::Text(text)
                if text.text == "[Attached file: notes.txt]\nThe sample document text"
        ));
    }

    #[test]
    fn prompt_content_keeps_a_workspace_hint_for_unextractable_files() {
        let content = prompt_content(
            String::new(),
            vec![PromptAttachment {
                filename: "scan.pdf".to_string(),
                mime: "application/pdf".to_string(),
                base64: "cGRm".to_string(),
                extracted_text: None,
            }],
        );

        assert_eq!(content.len(), 1);
        assert!(matches!(
            &content[0],
            ContentBlock::Text(text)
                if text.text.contains("scan.pdf") && text.text.contains("workspace")
        ));
    }

    #[test]
    fn prompt_after_close_reports_closed() {
        let profile = AcpAgentProfile {
            id: "x".to_string(),
            label: "X".to_string(),
            command: "true".to_string(),
            args: vec![],
            env: vec![],
            env_remove: vec![],
            session_meta: None,
            mcp_servers: vec![],
        };
        let (client, _events, _driver) = AcpClient::launch(&profile, PathBuf::from("."));
        // Drop the driver without running it; the receiver side of commands is
        // inside `_driver`, so sends still succeed until it is dropped. Drop it:
        drop(_driver);
        // After the driver (and its command_rx) is dropped, sends fail.
        assert!(matches!(client.prompt("hi"), Err(AcpError::Closed)));
    }

    #[test]
    fn prompt_channel_rejects_more_than_one_queued_turn() {
        let profile = AcpAgentProfile {
            id: "missing".into(),
            label: "Missing".into(),
            command: "definitely-not-a-real-acp-agent".into(),
            args: Vec::new(),
            env: Vec::new(),
            env_remove: Vec::new(),
            session_meta: None,
            mcp_servers: Vec::new(),
        };
        let (client, _events, _driver) = AcpClient::launch(&profile, PathBuf::from("."));

        assert!(client.prompt("first").is_ok());
        assert!(client.prompt("second").is_err());
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

    #[cfg(windows)]
    #[test]
    fn sandbox_treats_verbatim_and_regular_drive_paths_as_the_same_root() {
        let root = PathBuf::from(r"\\?\C:\work\space");
        let requested = PathBuf::from(r"C:\work\space\AGENTS.md");

        assert_eq!(
            sandbox_path(&root, &requested).unwrap(),
            PathBuf::from(r"C:\work\space\AGENTS.md")
        );
        assert!(sandbox_path(&root, &PathBuf::from(r"C:\work\secret.txt")).is_err());
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
        let (event_tx, mut event_rx) = mpsc::channel::<AcpEvent>(1);
        let root = std::env::temp_dir();

        #[cfg(windows)]
        let request = CreateTerminalRequest::new(SessionId::new("s"), "cmd")
            .args(vec!["/C".into(), "echo hi".into()]);
        #[cfg(not(windows))]
        let request = CreateTerminalRequest::new(SessionId::new("s"), "sh")
            .args(vec!["-c".into(), "echo hi".into()]);

        // Approve out-of-band: consume the ExecApproval event and answer true.
        let approver = tokio::spawn(async move {
            if let Some(AcpEvent::ExecApproval { reply, .. }) = event_rx.recv().await {
                let _ = reply.send(true);
            }
        });

        let created = handle_create_terminal(&manager, &root, &event_tx, request)
            .await
            .expect("approved command should spawn");
        approver.await.unwrap();

        let wait_req =
            WaitForTerminalExitRequest::new(SessionId::new("s"), created.terminal_id.clone());
        let exit = handle_wait_for_exit(&manager, wait_req).await.unwrap();
        assert_eq!(exit.exit_status.exit_code, Some(0));

        let out_req = TerminalOutputRequest::new(SessionId::new("s"), created.terminal_id);
        let output = handle_terminal_output(&manager, out_req).unwrap();
        assert!(output.output.contains("hi"));
    }

    #[tokio::test]
    async fn rejected_command_never_spawns() {
        let manager = TerminalManager::default();
        let (event_tx, mut event_rx) = mpsc::channel::<AcpEvent>(1);
        let root = std::env::temp_dir();

        #[cfg(windows)]
        let request = CreateTerminalRequest::new(SessionId::new("s"), "cmd")
            .args(vec!["/C".into(), "echo nope".into()]);
        #[cfg(not(windows))]
        let request = CreateTerminalRequest::new(SessionId::new("s"), "sh")
            .args(vec!["-c".into(), "echo nope".into()]);

        let rejecter = tokio::spawn(async move {
            if let Some(AcpEvent::ExecApproval { reply, .. }) = event_rx.recv().await {
                let _ = reply.send(false);
            }
        });

        let result = handle_create_terminal(&manager, &root, &event_tx, request).await;
        rejecter.await.unwrap();
        assert!(result.is_err(), "rejected command must not spawn");
        assert!(manager.terminals.lock().unwrap().is_empty());
    }
}
