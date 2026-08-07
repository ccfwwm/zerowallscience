use crate::{AgentEvent, HostError, PermissionOption};
use futures::channel::oneshot;
use std::collections::HashMap;
use std::path::PathBuf;
use zerowall_acp::{
    AcpAgentProfile, AcpClient, AcpEvent, AcpEventReceiver, AcpSessionStart, AcpTokenUsage,
};

use crate::{
    AcpHostDriver, AgentBinding, DriverCapabilities, HostDriverKind, InitializeRequest,
    InitializeResponse, LoadSessionRequest, NewSessionRequest, PromptRequest, PromptResponse,
    ResumeSessionRequest, SessionState, SetConfigRequest, SetModeRequest,
};

const STARTUP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(35);

/// ACP process-backed driver used by Codex and Claude Code. The child process
/// and its protocol task remain owned by `zerowall-acp`; this type only routes
/// lifecycle calls and translates events into the host-neutral contract.
pub struct AcpProcessDriver {
    profile: AcpAgentProfile,
    cwd: PathBuf,
    binding: AgentBinding,
    client: Option<AcpClient>,
    events: Option<AcpEventReceiver>,
    driver_task: Option<tokio::task::JoinHandle<()>>,
    mapper: AcpEventMapper,
    session_id: Option<String>,
}

impl AcpProcessDriver {
    pub fn new(
        kind: HostDriverKind,
        profile: AcpAgentProfile,
        cwd: PathBuf,
        binding: AgentBinding,
    ) -> Result<Self, HostError> {
        if kind == HostDriverKind::OpenCode || binding.engine != kind {
            return Err(HostError::BindingConflict {
                field: "engine".into(),
            });
        }
        let expected_id = match kind {
            HostDriverKind::Codex => "codex",
            HostDriverKind::ClaudeCode => "claude-code",
            HostDriverKind::OpenCode => unreachable!(),
        };
        if profile.id != expected_id {
            return Err(HostError::Driver(format!(
                "ACP profile id {:?} does not match {:?}",
                profile.id, kind
            )));
        }
        Ok(Self {
            profile,
            cwd,
            binding,
            client: None,
            events: None,
            driver_task: None,
            mapper: AcpEventMapper::new(String::new()),
            session_id: None,
        })
    }

    fn process_error(error: impl std::fmt::Display) -> HostError {
        HostError::Driver(error.to_string())
    }

    async fn next_event(&mut self) -> Option<AcpEvent> {
        self.events.as_mut()?.recv().await
    }

    async fn wait_for_ready(&mut self) -> Result<String, HostError> {
        let wait = async {
            while let Some(event) = self.next_event().await {
                let ready_id = match &event {
                    AcpEvent::Ready { session_id } => Some(session_id.clone()),
                    _ => None,
                };
                let exited = matches!(&event, AcpEvent::Exited { .. });
                let error = match &event {
                    AcpEvent::Error { kind } => Some(format!("ACP startup error: {kind:?}")),
                    AcpEvent::Exited {
                        error: Some(message),
                    } => Some(message.clone()),
                    _ => None,
                };
                self.mapper.push(event);
                if let Some(error) = error {
                    return Err(HostError::Driver(error));
                }
                if let Some(session_id) = ready_id {
                    return Ok(session_id);
                }
                if exited {
                    return Err(HostError::Driver("ACP process exited before ready".into()));
                }
            }
            Err(HostError::Driver(
                "ACP event stream closed before ready".into(),
            ))
        };
        tokio::time::timeout(STARTUP_TIMEOUT, wait)
            .await
            .map_err(|_| HostError::Driver("ACP startup timed out".into()))?
    }

    async fn launch_session(&mut self, start: AcpSessionStart) -> Result<String, HostError> {
        if self.client.is_some() {
            return Err(HostError::Driver("ACP session already exists".into()));
        }
        if !matches!(start, AcpSessionStart::New) {
            self.mapper = AcpEventMapper::new(String::new());
        }
        let (client, events, driver) =
            AcpClient::launch_session(&self.profile, self.cwd.clone(), start);
        self.client = Some(client);
        self.events = Some(events);
        self.driver_task = Some(tokio::spawn(driver));
        match self.wait_for_ready().await {
            Ok(session_id) => {
                self.session_id = Some(session_id.clone());
                Ok(session_id)
            }
            Err(error) => {
                self.detach_process();
                Err(error)
            }
        }
    }

    fn require_session(&self, requested: &str) -> Result<&AcpClient, HostError> {
        if self.session_id.as_deref() != Some(requested) {
            return Err(HostError::SessionNotFound {
                session_id: requested.to_owned(),
            });
        }
        self.client
            .as_ref()
            .ok_or_else(|| HostError::Driver("ACP process is not running".into()))
    }

    fn detach_process(&mut self) {
        self.client = None;
        self.events = None;
        if let Some(task) = self.driver_task.take() {
            task.abort();
        }
    }
}

impl Drop for AcpProcessDriver {
    fn drop(&mut self) {
        if let Some(client) = self.client.take() {
            let _ = client.shutdown();
        }
        self.events = None;
        if let Some(task) = self.driver_task.take() {
            task.abort();
        }
    }
}

#[async_trait::async_trait]
impl AcpHostDriver for AcpProcessDriver {
    fn capabilities(&self) -> DriverCapabilities {
        DriverCapabilities {
            new_session: true,
            load_session: true,
            resume_session: true,
            prompt: true,
            cancel: true,
            permission: true,
            config: true,
            mode: self
                .client
                .as_ref()
                .is_some_and(zerowall_acp::AcpClient::supports_mode),
            close_session: true,
            ..Default::default()
        }
    }

    fn drain_events(&mut self) -> Vec<AgentEvent> {
        if let Some(events) = self.events.as_mut() {
            while let Ok(event) = events.try_recv() {
                self.mapper.push(event);
            }
        }
        if !self.mapper.is_terminated()
            && self
                .driver_task
                .as_ref()
                .is_some_and(tokio::task::JoinHandle::is_finished)
        {
            self.mapper.push(AcpEvent::Exited {
                error: Some("ACP driver task exited unexpectedly".into()),
            });
        }
        let terminal = self.mapper.is_terminated();
        let events = self.mapper.drain_events();
        if terminal {
            self.detach_process();
        }
        events
    }

    async fn initialize(&mut self, _: InitializeRequest) -> Result<InitializeResponse, HostError> {
        Ok(InitializeResponse {
            capabilities: self.capabilities(),
        })
    }

    async fn new_session(
        &mut self,
        _request: NewSessionRequest,
    ) -> Result<SessionState, HostError> {
        let actual_id = self.launch_session(AcpSessionStart::New).await?;
        Ok(SessionState {
            id: actual_id,
            binding: self.binding.clone(),
            state: crate::SessionStatus::Ready,
            resumable: true,
            title: None,
            directory: None,
            parent_id: None,
            created: None,
            updated: None,
        })
    }

    async fn resume_session(
        &mut self,
        request: ResumeSessionRequest,
    ) -> Result<SessionState, HostError> {
        self.detach_process();
        let session_id = self
            .launch_session(AcpSessionStart::Resume {
                session_id: request.session_id.clone(),
            })
            .await?;
        Ok(SessionState {
            id: session_id,
            binding: self.binding.clone(),
            state: crate::SessionStatus::Ready,
            resumable: true,
            title: None,
            directory: None,
            parent_id: None,
            created: None,
            updated: None,
        })
    }

    async fn load_session(
        &mut self,
        request: LoadSessionRequest,
    ) -> Result<SessionState, HostError> {
        self.detach_process();
        let session_id = self
            .launch_session(AcpSessionStart::Load {
                session_id: request.session_id.clone(),
            })
            .await?;
        Ok(SessionState {
            id: session_id,
            binding: self.binding.clone(),
            state: crate::SessionStatus::Ready,
            resumable: true,
            title: None,
            directory: None,
            parent_id: None,
            created: None,
            updated: None,
        })
    }

    async fn prompt(&mut self, request: PromptRequest) -> Result<PromptResponse, HostError> {
        let attachments = request
            .attachments
            .into_iter()
            .map(|attachment| zerowall_acp::PromptAttachment {
                filename: attachment.filename,
                mime: attachment.mime,
                base64: attachment.base64,
                extracted_text: attachment.extracted_text,
            })
            .collect();
        self.require_session(&request.session_id)?
            .prompt_with_attachments(request.prompt, attachments)
            .map_err(Self::process_error)?;
        Ok(PromptResponse { completed: false })
    }

    async fn cancel(&mut self, session_id: String) -> Result<(), HostError> {
        self.require_session(&session_id)?
            .cancel()
            .map_err(Self::process_error)
    }

    async fn respond_permission(
        &mut self,
        request_id: String,
        option_id: Option<String>,
    ) -> Result<(), HostError> {
        self.mapper.respond_permission(&request_id, option_id).await
    }

    async fn set_config(&mut self, request: SetConfigRequest) -> Result<SessionState, HostError> {
        let model = request
            .config
            .get("model")
            .and_then(|value| value.as_str())
            .ok_or_else(|| HostError::Driver("ACP config requires a string model".into()))?;
        self.require_session(&request.session_id)?
            .set_model(model.to_owned())
            .await
            .map_err(Self::process_error)?;
        self.binding.model = Some(model.to_owned());
        Ok(SessionState {
            id: request.session_id,
            binding: self.binding.clone(),
            state: crate::SessionStatus::Ready,
            resumable: false,
            title: None,
            directory: None,
            parent_id: None,
            created: None,
            updated: None,
        })
    }

    async fn set_mode(&mut self, request: SetModeRequest) -> Result<(), HostError> {
        self.require_session(&request.session_id)?
            .set_mode(request.mode)
            .await
            .map_err(Self::process_error)
    }

    async fn close_session(&mut self, session_id: String) -> Result<(), HostError> {
        let client = self.require_session(&session_id)?.clone();
        client.shutdown().map_err(Self::process_error)?;
        self.client = None;
        self.session_id = None;
        if let Some(task) = self.driver_task.take() {
            let _ = task.await;
        }
        Ok(())
    }
}

enum PendingPermission {
    Acp {
        allowed: Vec<String>,
        reply: oneshot::Sender<Option<String>>,
    },
    Exec {
        reply: oneshot::Sender<bool>,
    },
}

pub struct AcpEventMapper {
    session_id: String,
    events: Vec<AgentEvent>,
    pending: HashMap<String, PendingPermission>,
    next_permission_id: u64,
    terminated: bool,
}

impl AcpEventMapper {
    pub fn new(session_id: impl Into<String>) -> Self {
        Self {
            session_id: session_id.into(),
            events: Vec::new(),
            pending: HashMap::new(),
            next_permission_id: 1,
            terminated: false,
        }
    }

    pub fn push(&mut self, event: AcpEvent) {
        if self.terminated {
            return;
        }
        match event {
            AcpEvent::HandshakeStarted { .. } => {}
            AcpEvent::Ready { session_id } => {
                self.session_id = session_id.clone();
                self.events.push(AgentEvent::SessionStarted { session_id });
            }
            AcpEvent::Error { kind } => self.events.push(AgentEvent::Error {
                session_id: Some(self.session_id.clone()),
                message: format!("ACP runtime error: {kind:?}"),
            }),
            AcpEvent::AgentMessage { text, .. } => self.events.push(AgentEvent::TextDelta {
                session_id: self.session_id.clone(),
                delta: text,
            }),
            AcpEvent::AgentThought { text, .. } => self.events.push(AgentEvent::ThoughtDelta {
                session_id: self.session_id.clone(),
                delta: text,
            }),
            AcpEvent::ToolCall(tool) => {
                let tool_call_id = string_field(&tool, &["toolCallId", "tool_call_id", "id"])
                    .unwrap_or_else(|| "unknown-tool".into());
                let status = string_field(&tool, &["status"]).unwrap_or_else(|| "updated".into());
                let title = string_field(&tool, &["title", "name"]);
                self.events.push(AgentEvent::ToolUpdated {
                    session_id: self.session_id.clone(),
                    tool_call_id,
                    status,
                    title,
                    tool: string_field(&tool, &["kind", "tool", "name"]),
                    input: tool
                        .get("rawInput")
                        .cloned()
                        .filter(|value| !value.is_null()),
                    output: tool
                        .get("rawOutput")
                        .and_then(serde_json::Value::as_str)
                        .map(str::to_owned),
                    partial_output: None,
                    diff: None,
                    started_at: None,
                    ended_at: None,
                    child_session_id: None,
                });
            }
            AcpEvent::Plan(plan) => self.events.push(AgentEvent::PlanUpdated {
                session_id: self.session_id.clone(),
                plan,
            }),
            AcpEvent::Usage(usage) => {
                if let Some(usage) = usage.token_usage {
                    self.push_usage(usage);
                }
            }
            AcpEvent::FileWritten { path } => self.events.push(AgentEvent::ArtifactCreated {
                session_id: self.session_id.clone(),
                artifact_id: path,
            }),
            AcpEvent::Permission {
                request,
                options,
                reply,
            } => {
                let request_id = string_field(&request, &["requestId", "request_id", "id"])
                    .unwrap_or_else(|| self.allocate_permission_id());
                let options = options
                    .into_iter()
                    .map(|option| PermissionOption {
                        id: option.option_id,
                        label: Some(option.name),
                    })
                    .collect::<Vec<_>>();
                self.pending.insert(
                    request_id.clone(),
                    PendingPermission::Acp {
                        allowed: options.iter().map(|option| option.id.clone()).collect(),
                        reply,
                    },
                );
                self.events.push(AgentEvent::PermissionRequested {
                    session_id: self.session_id.clone(),
                    request_id,
                    action: None,
                    resources: Vec::new(),
                    options,
                });
            }
            AcpEvent::ExecApproval {
                command,
                args,
                cwd: _,
                reply,
            } => {
                let request_id = self.allocate_permission_id();
                self.pending
                    .insert(request_id.clone(), PendingPermission::Exec { reply });
                self.events.push(AgentEvent::PermissionRequested {
                    session_id: self.session_id.clone(),
                    request_id,
                    action: Some("shell".into()),
                    resources: vec![format!("{} {}", command, args.join(" ")).trim().to_owned()],
                    options: vec![
                        PermissionOption {
                            id: "allow_once".into(),
                            label: Some(
                                format!("Run {} {}", command, args.join(" ")).trim().into(),
                            ),
                        },
                        PermissionOption {
                            id: "reject".into(),
                            label: Some("Reject".into()),
                        },
                    ],
                });
            }
            AcpEvent::TurnEnded { usage, .. } => {
                if let Some(usage) = usage {
                    self.push_usage(usage);
                }
                self.events.push(AgentEvent::SessionIdle {
                    session_id: self.session_id.clone(),
                });
            }
            AcpEvent::Exited { error } => {
                self.terminated = true;
                self.pending.clear();
                self.events.push(AgentEvent::Error {
                    session_id: Some(self.session_id.clone()),
                    message: error.unwrap_or_else(|| "ACP process exited unexpectedly".into()),
                });
                self.events.push(AgentEvent::SessionClosed {
                    session_id: self.session_id.clone(),
                });
            }
        }
    }

    pub fn drain_events(&mut self) -> Vec<AgentEvent> {
        std::mem::take(&mut self.events)
    }

    pub fn is_terminated(&self) -> bool {
        self.terminated
    }

    pub async fn respond_permission(
        &mut self,
        request_id: &str,
        option_id: Option<String>,
    ) -> Result<(), HostError> {
        let pending = self.pending.get(request_id).ok_or_else(|| {
            HostError::Driver(format!("unknown permission request: {request_id}"))
        })?;
        match pending {
            PendingPermission::Acp { allowed, .. } => {
                if let Some(option_id) = option_id.as_ref() {
                    if !allowed.contains(option_id) {
                        return Err(HostError::Driver("invalid permission option".into()));
                    }
                }
            }
            PendingPermission::Exec { .. } => {
                if option_id
                    .as_deref()
                    .is_some_and(|option| !matches!(option, "allow_once" | "reject"))
                {
                    return Err(HostError::Driver("invalid permission option".into()));
                }
            }
        }
        let pending = self
            .pending
            .remove(request_id)
            .expect("pending permission exists");
        match pending {
            PendingPermission::Acp { allowed, reply } => {
                debug_assert!(option_id
                    .as_ref()
                    .is_none_or(|option_id| allowed.contains(option_id)));
                reply
                    .send(option_id)
                    .map_err(|_| HostError::Driver("permission request closed".into()))
            }
            PendingPermission::Exec { reply } => reply
                .send(option_id.as_deref() == Some("allow_once"))
                .map_err(|_| HostError::Driver("execution approval closed".into())),
        }
    }

    fn push_usage(&mut self, usage: AcpTokenUsage) {
        self.events.push(AgentEvent::UsageUpdated {
            session_id: self.session_id.clone(),
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
        });
    }

    fn allocate_permission_id(&mut self) -> String {
        let id = format!("permission-{}", self.next_permission_id);
        self.next_permission_id += 1;
        id
    }
}

fn string_field(value: &serde_json::Value, names: &[&str]) -> Option<String> {
    names
        .iter()
        .find_map(|name| value.get(*name).and_then(|value| value.as_str()))
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AgentEvent;
    use futures::channel::oneshot;
    use futures::executor::block_on;
    use serde_json::json;
    use zerowall_acp::{AcpEvent, AcpPermissionOption, AcpTokenUsage};

    fn binding(engine: crate::HostDriverKind) -> crate::AgentBinding {
        crate::AgentBinding {
            engine,
            profile: "default".into(),
            model: Some("model".into()),
            provider: Some("provider".into()),
            variant: None,
            project_root: ".".into(),
            profile_fingerprint: "fingerprint".into(),
            resolved_at: "now".into(),
            mcp_allow_list: Vec::new(),
            skills_snapshot: Vec::new(),
        }
    }

    fn missing_profile() -> zerowall_acp::AcpAgentProfile {
        zerowall_acp::AcpAgentProfile {
            id: "codex".into(),
            label: "Codex".into(),
            command: "zerowall-adapter-that-does-not-exist".into(),
            args: Vec::new(),
            env: Vec::new(),
            env_remove: Vec::new(),
            session_meta: None,
            mcp_servers: Vec::new(),
        }
    }

    #[test]
    fn maps_acp_events_and_preserves_permission_option_ids() {
        let (reply, response) = oneshot::channel();
        let mut mapper = AcpEventMapper::new("session-1");
        mapper.push(AcpEvent::AgentMessage {
            message_id: Some("message-1".into()),
            text: "hello".into(),
        });
        mapper.push(AcpEvent::ToolCall(json!({
            "toolCallId": "tool-1",
            "status": "in_progress",
            "title": "Search"
        })));
        mapper.push(AcpEvent::Permission {
            request: json!({"requestId":"permission-1"}),
            options: vec![
                AcpPermissionOption {
                    option_id: "allow_once".into(),
                    name: "Allow once".into(),
                },
                AcpPermissionOption {
                    option_id: "reject".into(),
                    name: "Reject".into(),
                },
            ],
            reply,
        });
        mapper.push(AcpEvent::TurnEnded {
            stop_reason: "end_turn".into(),
            usage: Some(AcpTokenUsage {
                total_tokens: 9,
                input_tokens: 5,
                output_tokens: 4,
                thought_tokens: 0,
                cached_read_tokens: 0,
                cached_write_tokens: 0,
            }),
        });

        let events = mapper.drain_events();
        assert!(events
            .iter()
            .any(|event| matches!(event, AgentEvent::TextDelta { delta, .. } if delta == "hello")));
        assert!(events.iter().any(|event| matches!(event, AgentEvent::ToolUpdated { tool_call_id, .. } if tool_call_id == "tool-1")));
        assert!(events.iter().any(|event| matches!(event, AgentEvent::PermissionRequested { request_id, options, .. } if request_id == "permission-1" && options.iter().map(|option| option.id.as_str()).eq(["allow_once", "reject"]))));
        assert!(events.iter().any(|event| matches!(
            event,
            AgentEvent::UsageUpdated {
                input_tokens: 5,
                output_tokens: 4,
                ..
            }
        )));
        assert!(events
            .iter()
            .any(|event| matches!(event, AgentEvent::SessionIdle { .. })));

        block_on(mapper.respond_permission("permission-1", Some("allow_once".into()))).unwrap();
        assert_eq!(block_on(response).unwrap().as_deref(), Some("allow_once"));
    }

    #[test]
    fn rejects_unknown_permission_request_ids() {
        let mut mapper = AcpEventMapper::new("session-1");
        assert!(block_on(mapper.respond_permission("missing", None)).is_err());
    }

    #[test]
    fn invalid_permission_option_keeps_the_request_pending() {
        let (reply, response) = oneshot::channel();
        let mut mapper = AcpEventMapper::new("session-1");
        mapper.push(AcpEvent::Permission {
            request: json!({"requestId":"permission-1"}),
            options: vec![AcpPermissionOption {
                option_id: "allow_once".into(),
                name: "Allow once".into(),
            }],
            reply,
        });

        assert!(
            block_on(mapper.respond_permission("permission-1", Some("invalid".into()))).is_err()
        );
        block_on(mapper.respond_permission("permission-1", Some("allow_once".into()))).unwrap();
        assert_eq!(block_on(response).unwrap().as_deref(), Some("allow_once"));
    }

    #[test]
    fn process_exit_is_terminal_once_and_drops_pending_permissions() {
        let (reply, response) = oneshot::channel();
        let (exec_reply, exec_response) = oneshot::channel();
        let mut mapper = AcpEventMapper::new("session-1");
        mapper.push(AcpEvent::Permission {
            request: json!({"requestId":"permission-1"}),
            options: vec![AcpPermissionOption {
                option_id: "allow_once".into(),
                name: "Allow once".into(),
            }],
            reply,
        });
        mapper.push(AcpEvent::ExecApproval {
            command: "python".into(),
            args: vec!["analysis.py".into()],
            cwd: Some(".".into()),
            reply: exec_reply,
        });
        mapper.push(AcpEvent::Exited {
            error: Some("adapter crashed".into()),
        });
        mapper.push(AcpEvent::Exited {
            error: Some("duplicate exit".into()),
        });
        mapper.push(AcpEvent::AgentMessage {
            message_id: None,
            text: "late output".into(),
        });

        let events = mapper.drain_events();
        assert_eq!(
            events
                .iter()
                .filter(|event| matches!(event, AgentEvent::Error { .. }))
                .count(),
            1
        );
        assert_eq!(
            events
                .iter()
                .filter(|event| matches!(event, AgentEvent::SessionClosed { .. }))
                .count(),
            1
        );
        assert!(!events.iter().any(
            |event| matches!(event, AgentEvent::TextDelta { delta, .. } if delta == "late output")
        ));
        assert!(mapper.drain_events().is_empty());
        assert!(
            block_on(mapper.respond_permission("permission-1", Some("allow_once".into()))).is_err()
        );
        assert!(block_on(response).is_err());
        assert!(block_on(exec_response).is_err());
    }

    #[test]
    fn process_driver_declares_only_supported_lifecycle() {
        let driver = AcpProcessDriver::new(
            crate::HostDriverKind::Codex,
            missing_profile(),
            std::path::PathBuf::from("."),
            binding(crate::HostDriverKind::Codex),
        )
        .unwrap();
        let capabilities = crate::AcpHostDriver::capabilities(&driver);
        assert!(capabilities.new_session);
        assert!(capabilities.prompt);
        assert!(capabilities.cancel);
        assert!(capabilities.permission);
        assert!(capabilities.config);
        assert!(capabilities.close_session);
        assert!(capabilities.resume_session);
        assert!(capabilities.load_session);
        assert!(!capabilities.mode);
    }

    #[test]
    fn process_driver_does_not_advertise_mode_before_a_session_declares_it() {
        let mut driver = AcpProcessDriver::new(
            crate::HostDriverKind::Codex,
            missing_profile(),
            std::path::PathBuf::from("."),
            binding(crate::HostDriverKind::Codex),
        )
        .unwrap();

        assert!(matches!(
            block_on(crate::AcpHostDriver::set_mode(
                &mut driver,
                crate::SetModeRequest {
                    session_id: "session-1".into(),
                    mode: "planning".into(),
                },
            )),
            Err(crate::HostError::SessionNotFound { session_id }) if session_id == "session-1"
        ));
        assert!(!crate::AcpHostDriver::capabilities(&driver).mode);
    }

    #[test]
    fn process_driver_rejects_mismatched_engine_binding() {
        let result = AcpProcessDriver::new(
            crate::HostDriverKind::Codex,
            missing_profile(),
            std::path::PathBuf::from("."),
            binding(crate::HostDriverKind::ClaudeCode),
        );
        assert!(result.is_err());
    }

    #[test]
    fn finished_driver_task_becomes_terminal_without_an_exit_event() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let mut driver = AcpProcessDriver::new(
                crate::HostDriverKind::Codex,
                missing_profile(),
                std::path::PathBuf::from("."),
                binding(crate::HostDriverKind::Codex),
            )
            .unwrap();
            driver.session_id = Some("session-1".into());
            driver.mapper = AcpEventMapper::new("session-1");
            driver.driver_task = Some(tokio::spawn(async {}));
            while !driver
                .driver_task
                .as_ref()
                .expect("driver task")
                .is_finished()
            {
                tokio::task::yield_now().await;
            }

            let events = crate::AcpHostDriver::drain_events(&mut driver);
            assert!(matches!(
                events.as_slice(),
                [AgentEvent::Error { .. }, AgentEvent::SessionClosed { .. }]
            ));
            assert!(crate::AcpHostDriver::drain_events(&mut driver).is_empty());
            assert!(driver.driver_task.is_none());
        });
    }

    #[test]
    fn missing_adapter_fails_new_session() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let mut driver = AcpProcessDriver::new(
                crate::HostDriverKind::Codex,
                missing_profile(),
                std::path::PathBuf::from("."),
                binding(crate::HostDriverKind::Codex),
            )
            .unwrap();
            let result = crate::AcpHostDriver::new_session(
                &mut driver,
                crate::NewSessionRequest {
                    session_id: "local".into(),
                },
            )
            .await;
            assert!(result.is_err());
        });
    }
}
