use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum HostDriverKind {
    Codex,
    ClaudeCode,
    #[serde(rename = "opencode")]
    OpenCode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CredentialRef {
    pub keychain_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DriverProfile {
    pub kind: HostDriverKind,
    pub credential: CredentialRef,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LaunchProfile {
    pub kind: HostDriverKind,
    pub credential: CredentialRef,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentBinding {
    pub engine: HostDriverKind,
    pub profile: String,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub variant: Option<String>,
    pub project_root: String,
    pub profile_fingerprint: String,
    pub resolved_at: String,
}

impl AgentBinding {
    pub fn validate_fingerprint(&self, resolved_fingerprint: &str) -> Result<(), HostError> {
        if self.profile_fingerprint == resolved_fingerprint {
            Ok(())
        } else {
            Err(HostError::BindingConflict {
                field: "profile_fingerprint".into(),
            })
        }
    }

    pub fn ensure_compatible(&self, requested: &Self) -> Result<(), HostError> {
        let checks = [
            ("engine", self.engine == requested.engine),
            ("profile", self.profile == requested.profile),
            ("model", self.model == requested.model),
            ("provider", self.provider == requested.provider),
            ("variant", self.variant == requested.variant),
            ("project_root", self.project_root == requested.project_root),
            (
                "profile_fingerprint",
                self.profile_fingerprint == requested.profile_fingerprint,
            ),
            ("resolved_at", self.resolved_at == requested.resolved_at),
        ];
        checks
            .iter()
            .find(|(_, same)| !same)
            .map_or(Ok(()), |(field, _)| {
                Err(HostError::BindingConflict {
                    field: (*field).into(),
                })
            })
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct DriverCapabilities {
    pub new_session: bool,
    pub load_session: bool,
    pub resume_session: bool,
    pub prompt: bool,
    pub cancel: bool,
    pub permission: bool,
    pub config: bool,
    pub mode: bool,
    pub close_session: bool,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum HostError {
    #[error("driver {kind:?} is not registered")]
    DriverNotRegistered { kind: HostDriverKind },
    #[error("session {session_id} is not registered")]
    SessionNotFound { session_id: String },
    #[error("driver {kind:?} does not support {operation}")]
    UnsupportedCapability {
        kind: HostDriverKind,
        operation: &'static str,
    },
    #[error("session binding conflicts on {field}")]
    BindingConflict { field: String },
    #[error("driver error: {0}")]
    Driver(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum AgentEvent {
    #[serde(rename = "session.started")]
    SessionStarted { session_id: String },
    #[serde(rename = "session.idle")]
    SessionIdle { session_id: String },
    #[serde(rename = "session.closed")]
    SessionClosed { session_id: String },
    #[serde(rename = "text.delta")]
    TextDelta { session_id: String, delta: String },
    #[serde(rename = "thought.delta")]
    ThoughtDelta { session_id: String, delta: String },
    #[serde(rename = "tool.updated")]
    ToolUpdated {
        tool_call_id: String,
        status: String,
        title: Option<String>,
    },
    #[serde(rename = "plan.updated")]
    PlanUpdated {
        session_id: String,
        plan: serde_json::Value,
    },
    #[serde(rename = "permission.requested")]
    PermissionRequested {
        session_id: String,
        request_id: String,
        option_id: String,
    },
    #[serde(rename = "question.requested")]
    QuestionRequested {
        session_id: String,
        question: String,
    },
    #[serde(rename = "usage.updated")]
    UsageUpdated {
        session_id: String,
        input_tokens: u64,
        output_tokens: u64,
    },
    #[serde(rename = "artifact.created")]
    ArtifactCreated {
        session_id: String,
        artifact_id: String,
    },
    #[serde(rename = "error")]
    Error {
        session_id: Option<String>,
        message: String,
    },
}

#[derive(Debug, Clone, Default)]
pub struct InitializeRequest;
#[derive(Debug, Clone)]
pub struct InitializeResponse {
    pub capabilities: DriverCapabilities,
}
#[derive(Debug, Clone)]
pub struct NewSessionRequest {
    pub session_id: String,
}
#[derive(Debug, Clone)]
pub struct ResumeSessionRequest {
    pub session_id: String,
}
#[derive(Debug, Clone)]
pub struct LoadSessionRequest {
    pub session_id: String,
}
#[derive(Debug, Clone)]
pub struct PromptRequest {
    pub session_id: String,
    pub prompt: String,
}
#[derive(Debug, Clone)]
pub struct PromptResponse {
    pub completed: bool,
}
#[derive(Debug, Clone)]
pub struct SetConfigRequest {
    pub session_id: String,
    pub config: serde_json::Value,
}
#[derive(Debug, Clone)]
pub struct SetModeRequest {
    pub session_id: String,
    pub mode: String,
}
#[derive(Debug, Clone)]
pub struct SessionState {
    pub id: String,
    pub binding: AgentBinding,
    pub resumable: bool,
}

#[async_trait]
pub trait AcpHostDriver: Send {
    fn capabilities(&self) -> DriverCapabilities;
    async fn initialize(
        &mut self,
        request: InitializeRequest,
    ) -> Result<InitializeResponse, HostError>;
    async fn new_session(&mut self, request: NewSessionRequest) -> Result<SessionState, HostError>;
    async fn resume_session(
        &mut self,
        request: ResumeSessionRequest,
    ) -> Result<SessionState, HostError>;
    async fn load_session(
        &mut self,
        request: LoadSessionRequest,
    ) -> Result<SessionState, HostError>;
    async fn prompt(&mut self, request: PromptRequest) -> Result<PromptResponse, HostError>;
    async fn cancel(&mut self, session_id: String) -> Result<(), HostError>;
    async fn respond_permission(
        &mut self,
        request_id: String,
        option_id: Option<String>,
    ) -> Result<(), HostError>;
    async fn set_config(&mut self, request: SetConfigRequest) -> Result<SessionState, HostError>;
    async fn set_mode(&mut self, request: SetModeRequest) -> Result<(), HostError>;
    async fn close_session(&mut self, session_id: String) -> Result<(), HostError>;
}

struct SessionEntry {
    kind: HostDriverKind,
    binding: AgentBinding,
}

#[derive(Default)]
pub struct AcpHost {
    drivers: HashMap<HostDriverKind, Box<dyn AcpHostDriver>>,
    sessions: HashMap<String, SessionEntry>,
}

impl AcpHost {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn register_driver(&mut self, kind: HostDriverKind, driver: Box<dyn AcpHostDriver>) {
        self.drivers.insert(kind, driver);
    }
    fn driver_mut(
        &mut self,
        kind: HostDriverKind,
    ) -> Result<&mut Box<dyn AcpHostDriver>, HostError> {
        self.drivers
            .get_mut(&kind)
            .ok_or(HostError::DriverNotRegistered { kind })
    }
    fn require(
        &self,
        kind: HostDriverKind,
        operation: &'static str,
        supported: bool,
    ) -> Result<(), HostError> {
        if supported {
            Ok(())
        } else {
            Err(HostError::UnsupportedCapability { kind, operation })
        }
    }
    pub async fn initialize(
        &mut self,
        kind: HostDriverKind,
    ) -> Result<InitializeResponse, HostError> {
        self.driver_mut(kind)?.initialize(InitializeRequest).await
    }
    pub async fn new_session(
        &mut self,
        request: NewSessionRequest,
        binding: AgentBinding,
    ) -> Result<SessionState, HostError> {
        let kind = binding.engine;
        let supported = self
            .drivers
            .get(&kind)
            .ok_or(HostError::DriverNotRegistered { kind })?
            .capabilities()
            .new_session;
        self.require(kind, "new_session", supported)?;
        let state = self.driver_mut(kind)?.new_session(request.clone()).await?;
        let state = SessionState {
            id: state.id.clone(),
            binding: binding.clone(),
            resumable: state.resumable,
        };
        self.sessions
            .insert(state.id.clone(), SessionEntry { kind, binding });
        Ok(state)
    }
    pub async fn resume_session(&mut self, session_id: String) -> Result<SessionState, HostError> {
        let kind = self.session_kind(&session_id)?;
        let binding = self
            .sessions
            .get(&session_id)
            .expect("session kind was resolved")
            .binding
            .clone();
        let caps = self
            .drivers
            .get(&kind)
            .ok_or(HostError::DriverNotRegistered { kind })?
            .capabilities();
        self.require(kind, "resume_session", caps.resume_session)?;
        let state = self
            .driver_mut(kind)?
            .resume_session(ResumeSessionRequest { session_id })
            .await?;
        Ok(SessionState { binding, ..state })
    }
    pub async fn load_session(&mut self, session_id: String) -> Result<SessionState, HostError> {
        let kind = self.session_kind(&session_id)?;
        let binding = self
            .sessions
            .get(&session_id)
            .expect("session kind was resolved")
            .binding
            .clone();
        let caps = self
            .drivers
            .get(&kind)
            .ok_or(HostError::DriverNotRegistered { kind })?
            .capabilities();
        self.require(kind, "load_session", caps.load_session)?;
        let state = self
            .driver_mut(kind)?
            .load_session(LoadSessionRequest { session_id })
            .await?;
        Ok(SessionState { binding, ..state })
    }
    pub async fn prompt(
        &mut self,
        session_id: String,
        prompt: String,
    ) -> Result<PromptResponse, HostError> {
        let kind = self.session_kind(&session_id)?;
        let caps = self.drivers[&kind].capabilities();
        self.require(kind, "prompt", caps.prompt)?;
        self.driver_mut(kind)?
            .prompt(PromptRequest { session_id, prompt })
            .await
    }
    pub async fn bind_session(
        &mut self,
        session_id: &str,
        binding: AgentBinding,
    ) -> Result<(), HostError> {
        let entry = self
            .sessions
            .get(session_id)
            .ok_or_else(|| HostError::SessionNotFound {
                session_id: session_id.into(),
            })?;
        entry.binding.ensure_compatible(&binding)
    }
    pub async fn respond_permission(
        &mut self,
        session_id: &str,
        request_id: &str,
        option_id: Option<String>,
    ) -> Result<(), HostError> {
        let kind = self.session_kind(session_id)?;
        let caps = self.drivers[&kind].capabilities();
        self.require(kind, "permission", caps.permission)?;
        self.driver_mut(kind)?
            .respond_permission(request_id.into(), option_id)
            .await
    }
    pub async fn cancel(&mut self, session_id: &str) -> Result<(), HostError> {
        let kind = self.session_kind(session_id)?;
        let caps = self.drivers[&kind].capabilities();
        self.require(kind, "cancel", caps.cancel)?;
        self.driver_mut(kind)?.cancel(session_id.into()).await
    }
    pub async fn close_session(&mut self, session_id: &str) -> Result<(), HostError> {
        let kind = self.session_kind(session_id)?;
        let caps = self.drivers[&kind].capabilities();
        self.require(kind, "close_session", caps.close_session)?;
        self.driver_mut(kind)?
            .close_session(session_id.into())
            .await?;
        self.sessions.remove(session_id);
        Ok(())
    }
    fn session_kind(&self, session_id: &str) -> Result<HostDriverKind, HostError> {
        self.sessions
            .get(session_id)
            .map(|s| s.kind)
            .ok_or_else(|| HostError::SessionNotFound {
                session_id: session_id.into(),
            })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DriverCall {
    Permission {
        request_id: String,
        option_id: Option<String>,
    },
    Cancel {
        session_id: String,
    },
    Close {
        session_id: String,
    },
    New {
        session_id: String,
    },
    Resume {
        session_id: String,
    },
    Load {
        session_id: String,
    },
}

pub struct FakeDriver {
    caps: DriverCapabilities,
    calls: Arc<Mutex<Vec<DriverCall>>>,
}
impl FakeDriver {
    pub fn with_calls(caps: DriverCapabilities, calls: Arc<Mutex<Vec<DriverCall>>>) -> Self {
        Self { caps, calls }
    }
    fn record(&self, call: DriverCall) {
        self.calls.lock().unwrap().push(call);
    }
    fn placeholder_state(session_id: String) -> SessionState {
        SessionState {
            id: session_id,
            binding: AgentBinding {
                engine: HostDriverKind::Codex,
                profile: String::new(),
                model: None,
                provider: None,
                variant: None,
                project_root: String::new(),
                profile_fingerprint: String::new(),
                resolved_at: String::new(),
            },
            resumable: true,
        }
    }
}
#[async_trait]
impl AcpHostDriver for FakeDriver {
    fn capabilities(&self) -> DriverCapabilities {
        self.caps
    }
    async fn initialize(&mut self, _: InitializeRequest) -> Result<InitializeResponse, HostError> {
        Ok(InitializeResponse {
            capabilities: self.caps,
        })
    }
    async fn new_session(&mut self, request: NewSessionRequest) -> Result<SessionState, HostError> {
        self.record(DriverCall::New {
            session_id: request.session_id.clone(),
        });
        Ok(SessionState {
            id: request.session_id,
            binding: AgentBinding {
                engine: HostDriverKind::Codex,
                profile: String::new(),
                model: None,
                provider: None,
                variant: None,
                project_root: String::new(),
                profile_fingerprint: String::new(),
                resolved_at: String::new(),
            },
            resumable: false,
        })
    }
    async fn resume_session(
        &mut self,
        request: ResumeSessionRequest,
    ) -> Result<SessionState, HostError> {
        self.record(DriverCall::Resume {
            session_id: request.session_id.clone(),
        });
        Ok(Self::placeholder_state(request.session_id))
    }
    async fn load_session(
        &mut self,
        request: LoadSessionRequest,
    ) -> Result<SessionState, HostError> {
        self.record(DriverCall::Load {
            session_id: request.session_id.clone(),
        });
        Ok(Self::placeholder_state(request.session_id))
    }
    async fn prompt(&mut self, _: PromptRequest) -> Result<PromptResponse, HostError> {
        Ok(PromptResponse { completed: true })
    }
    async fn cancel(&mut self, session_id: String) -> Result<(), HostError> {
        self.record(DriverCall::Cancel { session_id });
        Ok(())
    }
    async fn respond_permission(
        &mut self,
        request_id: String,
        option_id: Option<String>,
    ) -> Result<(), HostError> {
        self.record(DriverCall::Permission {
            request_id,
            option_id,
        });
        Ok(())
    }
    async fn set_config(&mut self, _: SetConfigRequest) -> Result<SessionState, HostError> {
        Err(HostError::Driver("fake config".into()))
    }
    async fn set_mode(&mut self, _: SetModeRequest) -> Result<(), HostError> {
        Ok(())
    }
    async fn close_session(&mut self, session_id: String) -> Result<(), HostError> {
        self.record(DriverCall::Close { session_id });
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures::executor::block_on;
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    #[test]
    fn driver_kind_uses_stable_kebab_case() {
        assert_eq!(
            serde_json::to_string(&HostDriverKind::ClaudeCode).unwrap(),
            "\"claude-code\""
        );
        assert_eq!(
            serde_json::from_str::<HostDriverKind>("\"opencode\"").unwrap(),
            HostDriverKind::OpenCode
        );
    }

    #[test]
    fn credential_serialization_contains_reference_only() {
        let profile = DriverProfile {
            kind: HostDriverKind::Codex,
            credential: CredentialRef {
                keychain_id: "kc-1".into(),
            },
        };
        let encoded = serde_json::to_value(&profile).unwrap();
        let text = encoded.to_string();
        for secret_name in ["api_key", "token", "secret_value"] {
            assert!(!text.contains(secret_name));
        }
        assert_eq!(
            encoded,
            json!({"kind":"codex","credential":{"keychain_id":"kc-1"}})
        );
    }

    fn binding(engine: HostDriverKind, model: &str, root: &str) -> AgentBinding {
        AgentBinding {
            engine,
            profile: "default".into(),
            model: Some(model.into()),
            provider: Some("p".into()),
            variant: None,
            project_root: root.into(),
            profile_fingerprint: "fp".into(),
            resolved_at: "2026-08-06T00:00:00Z".into(),
        }
    }

    #[test]
    fn binding_is_idempotent_but_immutable() {
        let first = binding(HostDriverKind::Codex, "gpt", "C:/project");
        assert!(first.ensure_compatible(&first).is_ok());
        assert!(first.validate_fingerprint("fp").is_ok());
        assert!(matches!(
            first.validate_fingerprint("changed"),
            Err(HostError::BindingConflict { .. })
        ));
        let mut changed = first.clone();
        changed.model = Some("other".into());
        assert!(matches!(
            first.ensure_compatible(&changed),
            Err(HostError::BindingConflict { .. })
        ));
    }

    #[test]
    fn capabilities_default_to_false() {
        let caps = DriverCapabilities::default();
        assert!(
            !caps.new_session
                && !caps.load_session
                && !caps.resume_session
                && !caps.prompt
                && !caps.cancel
                && !caps.permission
                && !caps.config
                && !caps.mode
                && !caps.close_session
        );
    }

    #[test]
    fn events_have_stable_vendor_neutral_tags() {
        let event = AgentEvent::ToolUpdated {
            tool_call_id: "tool-1".into(),
            status: "running".into(),
            title: None,
        };
        let value = serde_json::to_value(event).unwrap();
        assert_eq!(value["type"], "tool.updated");
        assert_eq!(value["data"]["tool_call_id"], "tool-1");
    }

    fn fake(caps: DriverCapabilities) -> (FakeDriver, Arc<Mutex<Vec<DriverCall>>>) {
        let calls = Arc::new(Mutex::new(Vec::new()));
        (FakeDriver::with_calls(caps, calls.clone()), calls)
    }

    #[test]
    fn host_routes_and_rejects_unsupported_capabilities() {
        let (codex, calls) = fake(DriverCapabilities {
            new_session: true,
            prompt: true,
            cancel: true,
            permission: true,
            close_session: true,
            ..Default::default()
        });
        let (claude, _) = fake(DriverCapabilities {
            new_session: true,
            ..Default::default()
        });
        let mut host = AcpHost::new();
        host.register_driver(HostDriverKind::Codex, Box::new(codex));
        host.register_driver(HostDriverKind::ClaudeCode, Box::new(claude));
        let b = binding(HostDriverKind::Codex, "gpt", "C:/project");
        let session = block_on(host.new_session(
            NewSessionRequest {
                session_id: "s1".into(),
            },
            b.clone(),
        ))
        .unwrap();
        assert_eq!(session.id, "s1");
        assert!(matches!(
            block_on(host.resume_session("s1".into())),
            Err(HostError::UnsupportedCapability { .. })
        ));
        block_on(host.respond_permission("s1", "req", Some("allow-once".into()))).unwrap();
        block_on(host.cancel("s1")).unwrap();
        block_on(host.close_session("s1")).unwrap();
        let calls = calls.lock().unwrap();
        assert!(calls.iter().any(|c| matches!(c, DriverCall::Permission { request_id, option_id } if request_id == "req" && option_id.as_deref() == Some("allow-once"))));
        assert!(calls
            .iter()
            .any(|c| matches!(c, DriverCall::Cancel { session_id } if session_id == "s1")));
        assert!(calls
            .iter()
            .any(|c| matches!(c, DriverCall::Close { session_id } if session_id == "s1")));
    }

    #[test]
    fn binding_conflict_does_not_call_driver() {
        let (driver, calls) = fake(DriverCapabilities {
            new_session: true,
            ..Default::default()
        });
        let mut host = AcpHost::new();
        host.register_driver(HostDriverKind::Codex, Box::new(driver));
        block_on(host.new_session(
            NewSessionRequest {
                session_id: "s1".into(),
            },
            binding(HostDriverKind::Codex, "gpt", "C:/project"),
        ))
        .unwrap();
        let before = calls.lock().unwrap().len();
        let mut changed = binding(HostDriverKind::Codex, "gpt", "C:/project");
        changed.project_root = "C:/other".into();
        assert!(matches!(
            block_on(host.bind_session("s1", changed)),
            Err(HostError::BindingConflict { .. })
        ));
        assert_eq!(calls.lock().unwrap().len(), before);
    }

    #[test]
    fn resume_preserves_the_original_immutable_binding() {
        let (driver, _) = fake(DriverCapabilities {
            new_session: true,
            resume_session: true,
            ..Default::default()
        });
        let mut host = AcpHost::new();
        host.register_driver(HostDriverKind::Codex, Box::new(driver));
        let original = binding(HostDriverKind::Codex, "gpt", "C:/project");
        block_on(host.new_session(
            NewSessionRequest {
                session_id: "s1".into(),
            },
            original.clone(),
        ))
        .unwrap();
        let resumed = block_on(host.resume_session("s1".into())).unwrap();
        assert_eq!(resumed.binding, original);
    }
}
