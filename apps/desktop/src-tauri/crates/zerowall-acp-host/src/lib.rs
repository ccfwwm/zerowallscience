use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use thiserror::Error;

pub mod acp_process;
pub mod opencode;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum HostDriverKind {
    Codex,
    ClaudeCode,
    #[serde(rename = "opencode")]
    OpenCode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SkillScope {
    Global,
    Project,
    Conversation,
    WorkflowNode,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSnapshot {
    pub id: String,
    pub version: String,
    pub scope: SkillScope,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentBinding {
    pub engine: HostDriverKind,
    pub profile: String,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub variant: Option<String>,
    pub project_root: String,
    pub profile_fingerprint: String,
    pub resolved_at: String,
    #[serde(default)]
    pub mcp_allow_list: Vec<String>,
    #[serde(default)]
    pub skills_snapshot: Vec<SkillSnapshot>,
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
        let existing = self.clone().normalized()?;
        let requested = requested.clone().normalized()?;
        let checks = [
            ("engine", existing.engine == requested.engine),
            ("profile", existing.profile == requested.profile),
            ("model", existing.model == requested.model),
            ("provider", existing.provider == requested.provider),
            ("variant", existing.variant == requested.variant),
            (
                "project_root",
                existing.project_root == requested.project_root,
            ),
            (
                "profile_fingerprint",
                existing.profile_fingerprint == requested.profile_fingerprint,
            ),
            (
                "mcp_allow_list",
                existing.mcp_allow_list == requested.mcp_allow_list,
            ),
            (
                "skills_snapshot",
                existing.skills_snapshot == requested.skills_snapshot,
            ),
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

    pub fn normalized(mut self) -> Result<Self, HostError> {
        self.mcp_allow_list = normalize_mcp_allow_list(self.mcp_allow_list);
        self.skills_snapshot = normalize_skill_snapshots(self.skills_snapshot)?;
        Ok(self)
    }
}

pub fn normalize_mcp_allow_list(values: Vec<String>) -> Vec<String> {
    let mut normalized = values
        .into_iter()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    normalized.sort();
    normalized.dedup();
    normalized
}

pub fn normalize_skill_snapshots(
    mut snapshots: Vec<SkillSnapshot>,
) -> Result<Vec<SkillSnapshot>, HostError> {
    for skill in &mut snapshots {
        skill.id = required_skill_field(&skill.id, "id")?;
        skill.version = required_skill_field(&skill.version, "version")?;
        skill.sha256 = required_skill_field(&skill.sha256, "sha256")?;
    }
    snapshots.sort();
    snapshots.dedup();
    Ok(snapshots)
}

fn required_skill_field(value: &str, field: &'static str) -> Result<String, HostError> {
    let value = value.trim();
    if value.is_empty() {
        Err(HostError::InvalidSkillSnapshot {
            field: field.into(),
        })
    } else {
        Ok(value.into())
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct DriverCapabilities {
    pub new_session: bool,
    pub load_session: bool,
    pub resume_session: bool,
    pub history: bool,
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
    #[error("skill snapshot {field} is required")]
    InvalidSkillSnapshot { field: String },
    #[error("session {session_id} is terminated (resumable: {resumable})")]
    SessionTerminated { session_id: String, resumable: bool },
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
        session_id: String,
        tool_call_id: String,
        status: String,
        title: Option<String>,
        tool: Option<String>,
        input: Option<serde_json::Value>,
        output: Option<String>,
        partial_output: Option<String>,
        diff: Option<String>,
        started_at: Option<u64>,
        ended_at: Option<u64>,
        child_session_id: Option<String>,
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
        action: Option<String>,
        resources: Vec<String>,
        options: Vec<PermissionOption>,
    },
    #[serde(rename = "question.requested")]
    QuestionRequested {
        session_id: String,
        request_id: String,
        questions: Vec<QuestionItem>,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PermissionOption {
    pub id: String,
    pub label: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOption {
    pub label: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionItem {
    pub question: String,
    pub header: String,
    pub options: Vec<QuestionOption>,
    pub multiple: Option<bool>,
    pub custom: Option<bool>,
}

#[derive(Debug, Clone, Default)]
pub struct InitializeRequest;
#[derive(Debug, Clone, Serialize)]
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
    pub attachments: Vec<PromptAttachment>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PromptAttachment {
    pub filename: String,
    pub mime: String,
    pub base64: String,
    pub extracted_text: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
pub struct PromptResponse {
    pub completed: bool,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    New,
    #[default]
    Ready,
    Busy,
    Waiting,
    Error,
    Closed,
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
pub struct QuestionResponseRequest {
    pub session_id: String,
    pub request_id: String,
    pub answers: Option<Vec<Vec<String>>>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    pub id: String,
    pub binding: AgentBinding,
    pub state: SessionStatus,
    pub resumable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub directory: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated: Option<u64>,
}

#[async_trait]
pub trait AcpHostDriver: Send {
    fn capabilities(&self) -> DriverCapabilities;
    fn drain_events(&mut self) -> Vec<AgentEvent>;
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
    async fn history(&mut self, session_id: String) -> Result<serde_json::Value, HostError> {
        let _ = session_id;
        Err(HostError::UnsupportedCapability {
            kind: HostDriverKind::Codex,
            operation: "history",
        })
    }
    async fn prompt(&mut self, request: PromptRequest) -> Result<PromptResponse, HostError>;
    async fn cancel(&mut self, session_id: String) -> Result<(), HostError>;
    async fn respond_permission(
        &mut self,
        request_id: String,
        option_id: Option<String>,
    ) -> Result<(), HostError>;
    async fn respond_question(
        &mut self,
        _request: QuestionResponseRequest,
    ) -> Result<(), HostError> {
        Err(HostError::UnsupportedCapability {
            kind: HostDriverKind::Codex,
            operation: "question",
        })
    }
    async fn set_config(&mut self, request: SetConfigRequest) -> Result<SessionState, HostError>;
    async fn set_mode(&mut self, request: SetModeRequest) -> Result<(), HostError>;
    async fn close_session(&mut self, session_id: String) -> Result<(), HostError>;
}

struct SessionEntry {
    kind: HostDriverKind,
    binding: AgentBinding,
    driver: Option<Box<dyn AcpHostDriver>>,
    state: SessionStatus,
    turn_started: bool,
    resumable: bool,
    title: Option<String>,
    directory: Option<String>,
    parent_id: Option<String>,
    created: Option<u64>,
    updated: Option<u64>,
}

#[derive(Default)]
pub struct AcpHost {
    pending_drivers: HashMap<HostDriverKind, Box<dyn AcpHostDriver>>,
    sessions: HashMap<String, SessionEntry>,
}

impl AcpHost {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn register_driver(&mut self, kind: HostDriverKind, driver: Box<dyn AcpHostDriver>) {
        self.pending_drivers.insert(kind, driver);
    }
    fn require(
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
        if let Some(driver) = self.pending_drivers.get_mut(&kind) {
            return driver.initialize(InitializeRequest).await;
        }
        Ok(InitializeResponse {
            capabilities: declared_capabilities(kind),
        })
    }
    pub async fn new_session(
        &mut self,
        request: NewSessionRequest,
        binding: AgentBinding,
    ) -> Result<SessionState, HostError> {
        if let Some(existing) = self.sessions.get(&request.session_id) {
            existing.binding.ensure_compatible(&binding)?;
        }
        let kind = binding.engine;
        let supported = self
            .pending_drivers
            .get(&kind)
            .ok_or(HostError::DriverNotRegistered { kind })?
            .capabilities()
            .new_session;
        Self::require(kind, "new_session", supported)?;
        let mut driver = self
            .pending_drivers
            .remove(&kind)
            .ok_or(HostError::DriverNotRegistered { kind })?;
        let state = driver.new_session(request.clone()).await?;
        let state = SessionState {
            id: state.id.clone(),
            binding: binding.clone(),
            state: SessionStatus::Ready,
            resumable: state.resumable,
            title: state.title.clone(),
            directory: state.directory.clone(),
            parent_id: state.parent_id.clone(),
            created: state.created,
            updated: state.updated,
        };
        self.sessions.insert(
            state.id.clone(),
            SessionEntry {
                kind,
                binding,
                driver: Some(driver),
                state: SessionStatus::Ready,
                turn_started: false,
                resumable: state.resumable,
                title: state.title.clone(),
                directory: state.directory.clone(),
                parent_id: state.parent_id.clone(),
                created: state.created,
                updated: state.updated,
            },
        );
        Ok(state)
    }
    /// Attach a newly constructed Driver to an existing vendor session. This
    /// is intentionally separate from `load_session`, which only operates on
    /// sessions already owned by this Host instance.
    pub async fn load_existing_session(
        &mut self,
        request: LoadSessionRequest,
        binding: AgentBinding,
    ) -> Result<SessionState, HostError> {
        if let Some(existing) = self.sessions.get(&request.session_id) {
            existing.binding.ensure_compatible(&binding)?;
        }
        let kind = binding.engine;
        let supported = self
            .pending_drivers
            .get(&kind)
            .ok_or(HostError::DriverNotRegistered { kind })?
            .capabilities()
            .load_session;
        Self::require(kind, "load_session", supported)?;
        let mut driver = self
            .pending_drivers
            .remove(&kind)
            .ok_or(HostError::DriverNotRegistered { kind })?;
        let state = driver.load_session(request.clone()).await?;
        let state = SessionState {
            id: state.id.clone(),
            binding: binding.clone(),
            state: SessionStatus::Ready,
            resumable: state.resumable,
            title: state.title.clone(),
            directory: state.directory.clone(),
            parent_id: state.parent_id.clone(),
            created: state.created,
            updated: state.updated,
        };
        self.sessions.insert(
            state.id.clone(),
            SessionEntry {
                kind,
                binding,
                driver: Some(driver),
                state: SessionStatus::Ready,
                turn_started: false,
                resumable: state.resumable,
                title: state.title.clone(),
                directory: state.directory.clone(),
                parent_id: state.parent_id.clone(),
                created: state.created,
                updated: state.updated,
            },
        );
        Ok(state)
    }
    /// Attach a newly constructed Driver to an existing resumable vendor
    /// session while preserving the Host catalog's immutable binding.
    pub async fn resume_existing_session(
        &mut self,
        request: ResumeSessionRequest,
        binding: AgentBinding,
    ) -> Result<SessionState, HostError> {
        if let Some(existing) = self.sessions.get(&request.session_id) {
            existing.binding.ensure_compatible(&binding)?;
        }
        let kind = binding.engine;
        let supported = self
            .pending_drivers
            .get(&kind)
            .ok_or(HostError::DriverNotRegistered { kind })?
            .capabilities()
            .resume_session;
        Self::require(kind, "resume_session", supported)?;
        let mut driver = self
            .pending_drivers
            .remove(&kind)
            .ok_or(HostError::DriverNotRegistered { kind })?;
        let state = driver.resume_session(request).await?;
        let state = SessionState {
            id: state.id.clone(),
            binding: binding.clone(),
            state: SessionStatus::Ready,
            resumable: state.resumable,
            title: state.title.clone(),
            directory: state.directory.clone(),
            parent_id: state.parent_id.clone(),
            created: state.created,
            updated: state.updated,
        };
        self.sessions.insert(
            state.id.clone(),
            SessionEntry {
                kind,
                binding,
                driver: Some(driver),
                state: SessionStatus::Ready,
                turn_started: false,
                resumable: state.resumable,
                title: state.title.clone(),
                directory: state.directory.clone(),
                parent_id: state.parent_id.clone(),
                created: state.created,
                updated: state.updated,
            },
        );
        Ok(state)
    }
    pub async fn resume_session(&mut self, session_id: String) -> Result<SessionState, HostError> {
        let (kind, binding, resumable, detached) = self
            .sessions
            .get(&session_id)
            .map(|entry| {
                (
                    entry.kind,
                    entry.binding.clone(),
                    entry.resumable,
                    entry.driver.is_none(),
                )
            })
            .ok_or_else(|| HostError::SessionNotFound {
                session_id: session_id.clone(),
            })?;
        if detached && !resumable {
            return Err(HostError::SessionTerminated {
                session_id,
                resumable,
            });
        }
        let state = if detached {
            let mut driver = self
                .pending_drivers
                .remove(&kind)
                .ok_or(HostError::DriverNotRegistered { kind })?;
            Self::require(kind, "resume_session", driver.capabilities().resume_session)?;
            let state = driver
                .resume_session(ResumeSessionRequest {
                    session_id: session_id.clone(),
                })
                .await?;
            self.sessions.get_mut(&session_id).unwrap().driver = Some(driver);
            state
        } else {
            let entry = self.sessions.get_mut(&session_id).unwrap();
            let driver = entry.driver.as_mut().unwrap();
            Self::require(kind, "resume_session", driver.capabilities().resume_session)?;
            driver
                .resume_session(ResumeSessionRequest {
                    session_id: session_id.clone(),
                })
                .await?
        };
        let entry = self.sessions.get_mut(&session_id).unwrap();
        entry.state = SessionStatus::Ready;
        entry.resumable = state.resumable;
        Ok(SessionState {
            binding,
            state: SessionStatus::Ready,
            ..state
        })
    }
    pub async fn load_session(&mut self, session_id: String) -> Result<SessionState, HostError> {
        let (kind, binding, resumable, detached) = self
            .sessions
            .get(&session_id)
            .map(|entry| {
                (
                    entry.kind,
                    entry.binding.clone(),
                    entry.resumable,
                    entry.driver.is_none(),
                )
            })
            .ok_or_else(|| HostError::SessionNotFound {
                session_id: session_id.clone(),
            })?;
        if detached && !resumable {
            return Err(HostError::SessionTerminated {
                session_id,
                resumable,
            });
        }
        let state = if detached {
            let mut driver = self
                .pending_drivers
                .remove(&kind)
                .ok_or(HostError::DriverNotRegistered { kind })?;
            Self::require(kind, "load_session", driver.capabilities().load_session)?;
            let state = driver
                .load_session(LoadSessionRequest {
                    session_id: session_id.clone(),
                })
                .await?;
            self.sessions.get_mut(&session_id).unwrap().driver = Some(driver);
            state
        } else {
            let entry = self.sessions.get_mut(&session_id).unwrap();
            let driver = entry.driver.as_mut().unwrap();
            Self::require(kind, "load_session", driver.capabilities().load_session)?;
            driver
                .load_session(LoadSessionRequest {
                    session_id: session_id.clone(),
                })
                .await?
        };
        let entry = self.sessions.get_mut(&session_id).unwrap();
        entry.state = SessionStatus::Ready;
        entry.resumable = state.resumable;
        entry.title = state.title.clone().or(entry.title.clone());
        entry.directory = state.directory.clone().or(entry.directory.clone());
        entry.parent_id = state.parent_id.clone().or(entry.parent_id.clone());
        entry.created = state.created.or(entry.created);
        entry.updated = state.updated.or(entry.updated);
        Ok(SessionState {
            binding,
            state: SessionStatus::Ready,
            title: entry.title.clone(),
            directory: entry.directory.clone(),
            parent_id: entry.parent_id.clone(),
            created: entry.created,
            updated: entry.updated,
            ..state
        })
    }

    pub fn session_requires_reload(&self, session_id: &str) -> Result<bool, HostError> {
        self.sessions
            .get(session_id)
            .map(|entry| entry.driver.is_none())
            .ok_or_else(|| HostError::SessionNotFound {
                session_id: session_id.into(),
            })
    }
    pub fn list_sessions(&self) -> Vec<SessionState> {
        self.sessions
            .iter()
            .map(|(id, entry)| SessionState {
                id: id.clone(),
                binding: entry.binding.clone(),
                state: entry.state,
                resumable: entry.resumable,
                title: entry.title.clone(),
                directory: entry.directory.clone(),
                parent_id: entry.parent_id.clone(),
                created: entry.created,
                updated: entry.updated,
            })
            .collect()
    }
    pub async fn history(&mut self, session_id: &str) -> Result<serde_json::Value, HostError> {
        let entry =
            self.sessions
                .get_mut(session_id)
                .ok_or_else(|| HostError::SessionNotFound {
                    session_id: session_id.into(),
                })?;
        let driver = entry
            .driver
            .as_mut()
            .ok_or_else(|| HostError::SessionTerminated {
                session_id: session_id.into(),
                resumable: entry.resumable,
            })?;
        let caps = driver.capabilities();
        Self::require(entry.kind, "history", caps.history)?;
        driver.history(session_id.into()).await
    }
    pub async fn prompt(
        &mut self,
        session_id: String,
        prompt: String,
        attachments: Vec<PromptAttachment>,
    ) -> Result<PromptResponse, HostError> {
        let entry =
            self.sessions
                .get_mut(&session_id)
                .ok_or_else(|| HostError::SessionNotFound {
                    session_id: session_id.clone(),
                })?;
        let driver = entry
            .driver
            .as_mut()
            .ok_or_else(|| HostError::SessionTerminated {
                session_id: session_id.clone(),
                resumable: entry.resumable,
            })?;
        let caps = driver.capabilities();
        Self::require(entry.kind, "prompt", caps.prompt)?;
        let response = driver
            .prompt(PromptRequest {
                session_id,
                prompt,
                attachments,
            })
            .await?;
        entry.turn_started = true;
        entry.state = SessionStatus::Busy;
        Ok(response)
    }
    pub async fn set_config(
        &mut self,
        session_id: &str,
        config: serde_json::Value,
    ) -> Result<SessionState, HostError> {
        let entry =
            self.sessions
                .get_mut(session_id)
                .ok_or_else(|| HostError::SessionNotFound {
                    session_id: session_id.into(),
                })?;
        let driver = entry
            .driver
            .as_mut()
            .ok_or_else(|| HostError::SessionTerminated {
                session_id: session_id.into(),
                resumable: entry.resumable,
            })?;
        if entry.turn_started {
            return Err(HostError::BindingConflict {
                field: "model".into(),
            });
        }
        let mut binding = entry.binding.clone();
        let old_metadata = (
            entry.title.clone(),
            entry.directory.clone(),
            entry.parent_id.clone(),
            entry.created,
            entry.updated,
        );
        apply_config_to_binding(&mut binding, &config);
        let caps = driver.capabilities();
        Self::require(entry.kind, "config", caps.config)?;
        let state = driver
            .set_config(SetConfigRequest {
                session_id: session_id.into(),
                config,
            })
            .await?;
        entry.binding = binding.clone();
        entry.title = state.title.clone().or(old_metadata.0.clone());
        entry.directory = state.directory.clone().or(old_metadata.1.clone());
        entry.parent_id = state.parent_id.clone().or(old_metadata.2.clone());
        entry.created = state.created.or(old_metadata.3);
        entry.updated = state.updated.or(old_metadata.4);
        entry.state = SessionStatus::Ready;
        Ok(SessionState {
            binding,
            state: SessionStatus::Ready,
            title: entry.title.clone(),
            directory: entry.directory.clone(),
            parent_id: entry.parent_id.clone(),
            created: entry.created,
            updated: entry.updated,
            ..state
        })
    }
    pub async fn set_mode(&mut self, session_id: &str, mode: &str) -> Result<(), HostError> {
        let entry =
            self.sessions
                .get_mut(session_id)
                .ok_or_else(|| HostError::SessionNotFound {
                    session_id: session_id.into(),
                })?;
        let driver = entry
            .driver
            .as_mut()
            .ok_or_else(|| HostError::SessionTerminated {
                session_id: session_id.into(),
                resumable: entry.resumable,
            })?;
        let caps = driver.capabilities();
        Self::require(entry.kind, "mode", caps.mode)?;
        driver
            .set_mode(SetModeRequest {
                session_id: session_id.into(),
                mode: mode.into(),
            })
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
        let entry =
            self.sessions
                .get_mut(session_id)
                .ok_or_else(|| HostError::SessionNotFound {
                    session_id: session_id.into(),
                })?;
        let driver = entry
            .driver
            .as_mut()
            .ok_or_else(|| HostError::SessionTerminated {
                session_id: session_id.into(),
                resumable: entry.resumable,
            })?;
        let caps = driver.capabilities();
        Self::require(entry.kind, "permission", caps.permission)?;
        driver
            .respond_permission(request_id.into(), option_id)
            .await
    }
    pub async fn respond_question(
        &mut self,
        session_id: &str,
        request_id: &str,
        answers: Option<Vec<Vec<String>>>,
    ) -> Result<(), HostError> {
        let entry =
            self.sessions
                .get_mut(session_id)
                .ok_or_else(|| HostError::SessionNotFound {
                    session_id: session_id.into(),
                })?;
        let driver = entry
            .driver
            .as_mut()
            .ok_or_else(|| HostError::SessionTerminated {
                session_id: session_id.into(),
                resumable: entry.resumable,
            })?;
        driver
            .respond_question(QuestionResponseRequest {
                session_id: session_id.into(),
                request_id: request_id.into(),
                answers,
            })
            .await
    }
    pub async fn cancel(&mut self, session_id: &str) -> Result<(), HostError> {
        let entry =
            self.sessions
                .get_mut(session_id)
                .ok_or_else(|| HostError::SessionNotFound {
                    session_id: session_id.into(),
                })?;
        let driver = entry
            .driver
            .as_mut()
            .ok_or_else(|| HostError::SessionTerminated {
                session_id: session_id.into(),
                resumable: entry.resumable,
            })?;
        let caps = driver.capabilities();
        Self::require(entry.kind, "cancel", caps.cancel)?;
        driver.cancel(session_id.into()).await
    }
    pub async fn close_session(&mut self, session_id: &str) -> Result<(), HostError> {
        let entry =
            self.sessions
                .get_mut(session_id)
                .ok_or_else(|| HostError::SessionNotFound {
                    session_id: session_id.into(),
                })?;
        if let Some(driver) = entry.driver.as_mut() {
            let caps = driver.capabilities();
            Self::require(entry.kind, "close_session", caps.close_session)?;
            driver.close_session(session_id.into()).await?;
        }
        self.sessions.remove(session_id);
        Ok(())
    }
    pub fn drain_events(&mut self, session_id: &str) -> Result<Vec<AgentEvent>, HostError> {
        let entry =
            self.sessions
                .get_mut(session_id)
                .ok_or_else(|| HostError::SessionNotFound {
                    session_id: session_id.into(),
                })?;
        let Some(driver) = entry.driver.as_mut() else {
            return Ok(Vec::new());
        };
        let events = driver.drain_events();
        let mut terminal = false;
        for event in &events {
            match event {
                AgentEvent::SessionStarted { .. } | AgentEvent::SessionIdle { .. } => {
                    entry.state = SessionStatus::Ready;
                }
                AgentEvent::PermissionRequested { .. } | AgentEvent::QuestionRequested { .. } => {
                    entry.state = SessionStatus::Waiting;
                }
                AgentEvent::Error { .. } => entry.state = SessionStatus::Error,
                AgentEvent::SessionClosed { .. } => {
                    entry.state = SessionStatus::Closed;
                    terminal = true;
                }
                AgentEvent::TextDelta { .. }
                | AgentEvent::ThoughtDelta { .. }
                | AgentEvent::ToolUpdated { .. }
                | AgentEvent::PlanUpdated { .. }
                | AgentEvent::UsageUpdated { .. }
                | AgentEvent::ArtifactCreated { .. } => {}
            }
        }
        if terminal {
            entry.driver = None;
        }
        Ok(events)
    }
}

fn declared_capabilities(kind: HostDriverKind) -> DriverCapabilities {
    match kind {
        HostDriverKind::Codex | HostDriverKind::ClaudeCode => DriverCapabilities {
            new_session: true,
            load_session: true,
            resume_session: true,
            prompt: true,
            cancel: true,
            permission: true,
            config: true,
            close_session: true,
            ..Default::default()
        },
        HostDriverKind::OpenCode => DriverCapabilities {
            new_session: true,
            load_session: true,
            history: true,
            prompt: true,
            cancel: true,
            permission: true,
            config: true,
            close_session: true,
            ..Default::default()
        },
    }
}

fn apply_config_to_binding(binding: &mut AgentBinding, config: &serde_json::Value) {
    if let Some(model) = config.get("model").and_then(|value| value.as_str()) {
        binding.model = Some(model.to_owned());
    }
    if let Some(provider) = config.get("provider").and_then(|value| value.as_str()) {
        binding.provider = Some(provider.to_owned());
    }
    if let Some(variant) = config.get("variant").and_then(|value| value.as_str()) {
        binding.variant = Some(variant.to_owned());
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DriverCall {
    Prompt {
        session_id: String,
        attachment_count: usize,
    },
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
    Config {
        session_id: String,
    },
    Mode {
        session_id: String,
        mode: String,
    },
}

pub struct FakeDriver {
    caps: DriverCapabilities,
    calls: Arc<Mutex<Vec<DriverCall>>>,
    events: Vec<AgentEvent>,
}
impl FakeDriver {
    pub fn with_calls(caps: DriverCapabilities, calls: Arc<Mutex<Vec<DriverCall>>>) -> Self {
        Self {
            caps,
            calls,
            events: Vec::new(),
        }
    }
    pub fn with_events(
        caps: DriverCapabilities,
        calls: Arc<Mutex<Vec<DriverCall>>>,
        events: Vec<AgentEvent>,
    ) -> Self {
        Self {
            caps,
            calls,
            events,
        }
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
                mcp_allow_list: Vec::new(),
                skills_snapshot: Vec::new(),
            },
            state: SessionStatus::Ready,
            resumable: true,
            title: None,
            directory: None,
            parent_id: None,
            created: None,
            updated: None,
        }
    }
}
#[async_trait]
impl AcpHostDriver for FakeDriver {
    fn capabilities(&self) -> DriverCapabilities {
        self.caps
    }
    fn drain_events(&mut self) -> Vec<AgentEvent> {
        std::mem::take(&mut self.events)
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
                mcp_allow_list: Vec::new(),
                skills_snapshot: Vec::new(),
            },
            state: SessionStatus::Ready,
            resumable: false,
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
    async fn prompt(&mut self, request: PromptRequest) -> Result<PromptResponse, HostError> {
        self.record(DriverCall::Prompt {
            session_id: request.session_id,
            attachment_count: request.attachments.len(),
        });
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
    async fn set_config(&mut self, request: SetConfigRequest) -> Result<SessionState, HostError> {
        self.record(DriverCall::Config {
            session_id: request.session_id.clone(),
        });
        Ok(Self::placeholder_state(request.session_id))
    }
    async fn set_mode(&mut self, request: SetModeRequest) -> Result<(), HostError> {
        self.record(DriverCall::Mode {
            session_id: request.session_id,
            mode: request.mode,
        });
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
            json!({"kind":"codex","credential":{"keychainId":"kc-1"}})
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
            mcp_allow_list: Vec::new(),
            skills_snapshot: Vec::new(),
        }
    }

    #[test]
    fn legacy_binding_defaults_capability_snapshots_to_empty() {
        let binding: AgentBinding = serde_json::from_value(json!({
            "engine": "codex",
            "profile": "codex",
            "model": "gpt",
            "provider": "cloud",
            "variant": null,
            "projectRoot": "C:/project",
            "profileFingerprint": "fp",
            "resolvedAt": "now"
        }))
        .unwrap();
        assert!(binding.mcp_allow_list.is_empty());
        assert!(binding.skills_snapshot.is_empty());
    }

    #[test]
    fn binding_normalizes_and_validates_capability_snapshots() {
        let mut value = binding(HostDriverKind::Codex, "gpt", "C:/project");
        value.mcp_allow_list = vec![
            " papers ".into(),
            String::new(),
            "datasets".into(),
            "papers".into(),
        ];
        value.skills_snapshot = vec![
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
            SkillSnapshot {
                id: "search".into(),
                version: "2".into(),
                scope: SkillScope::Project,
                sha256: "def".into(),
            },
        ];

        let normalized = value.normalized().unwrap();
        assert_eq!(normalized.mcp_allow_list, vec!["datasets", "papers"]);
        assert_eq!(
            normalized.skills_snapshot,
            vec![
                SkillSnapshot {
                    id: "review".into(),
                    version: "1".into(),
                    scope: SkillScope::Conversation,
                    sha256: "abc".into(),
                },
                SkillSnapshot {
                    id: "search".into(),
                    version: "2".into(),
                    scope: SkillScope::Project,
                    sha256: "def".into(),
                },
            ]
        );

        let mut invalid = normalized.clone();
        invalid.skills_snapshot[0].sha256 = " ".into();
        assert!(matches!(
            invalid.normalized(),
            Err(HostError::InvalidSkillSnapshot { field }) if field == "sha256"
        ));
        assert!(serde_json::from_value::<SkillSnapshot>(json!({
            "id": "review",
            "version": "1",
            "scope": "session",
            "sha256": "abc"
        }))
        .is_err());
    }

    #[test]
    fn binding_capability_compatibility_is_order_insensitive_but_content_immutable() {
        let mut first = binding(HostDriverKind::Codex, "gpt", "C:/project");
        first.mcp_allow_list = vec!["papers".into(), "datasets".into()];
        first.skills_snapshot = vec![SkillSnapshot {
            id: "review".into(),
            version: "1".into(),
            scope: SkillScope::Conversation,
            sha256: "abc".into(),
        }];
        let mut reordered = first.clone();
        reordered.mcp_allow_list.reverse();
        assert!(first.ensure_compatible(&reordered).is_ok());

        let mut changed = first.clone();
        changed.skills_snapshot[0].sha256 = "changed".into();
        assert!(matches!(
            first.ensure_compatible(&changed),
            Err(HostError::BindingConflict { field }) if field == "skills_snapshot"
        ));
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
                && !caps.history
                && !caps.prompt
                && !caps.cancel
                && !caps.permission
                && !caps.config
                && !caps.mode
                && !caps.close_session
        );
    }

    #[test]
    fn initialize_declares_static_capabilities_before_a_driver_is_registered() {
        let mut host = AcpHost::new();
        let result = block_on(host.initialize(HostDriverKind::OpenCode)).unwrap();
        assert!(result.capabilities.new_session);
        assert!(result.capabilities.prompt);
        assert!(result.capabilities.cancel);
        assert!(result.capabilities.close_session);

        let codex = block_on(host.initialize(HostDriverKind::Codex)).unwrap();
        assert!(codex.capabilities.load_session);
        assert!(codex.capabilities.resume_session);
        assert!(!codex.capabilities.mode);
    }

    #[test]
    fn events_have_stable_vendor_neutral_tags() {
        let event = AgentEvent::ToolUpdated {
            session_id: "session-1".into(),
            tool_call_id: "tool-1".into(),
            status: "running".into(),
            title: None,
            tool: None,
            input: None,
            output: None,
            partial_output: None,
            diff: None,
            started_at: None,
            ended_at: None,
            child_session_id: None,
        };
        let value = serde_json::to_value(event).unwrap();
        assert_eq!(value["type"], "tool.updated");
        assert_eq!(value["data"]["tool_call_id"], "tool-1");
    }

    #[test]
    fn binding_compatibility_ignores_resolution_timestamp() {
        let first = binding(HostDriverKind::Codex, "gpt", "C:/project");
        let mut refreshed = first.clone();
        refreshed.resolved_at = "2026-08-06T00:01:00Z".into();
        assert!(first.ensure_compatible(&refreshed).is_ok());
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
        let mut original = binding(HostDriverKind::Codex, "gpt", "C:/project");
        original.skills_snapshot = vec![SkillSnapshot {
            id: "review".into(),
            version: "1".into(),
            scope: SkillScope::Conversation,
            sha256: "abc".into(),
        }];
        block_on(host.new_session(
            NewSessionRequest {
                session_id: "s1".into(),
            },
            original.clone(),
        ))
        .unwrap();
        let before = calls.lock().unwrap().len();
        let mut changed = binding(HostDriverKind::Codex, "gpt", "C:/project");
        changed.project_root = "C:/other".into();
        assert!(matches!(
            block_on(host.bind_session("s1", changed)),
            Err(HostError::BindingConflict { .. })
        ));
        let mut changed_skills = original;
        changed_skills.skills_snapshot[0].sha256 = "changed".into();
        assert!(matches!(
            block_on(host.bind_session("s1", changed_skills)),
            Err(HostError::BindingConflict { field }) if field == "skills_snapshot"
        ));
        assert_eq!(calls.lock().unwrap().len(), before);
    }

    #[test]
    fn host_routes_config_and_mode_through_the_bound_driver() {
        let (driver, calls) = fake(DriverCapabilities {
            new_session: true,
            config: true,
            mode: true,
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
        block_on(host.set_config("s1", serde_json::json!({"model":"gpt-5"}))).unwrap();
        block_on(host.set_mode("s1", "planning")).unwrap();
        let calls = calls.lock().unwrap();
        assert!(calls
            .iter()
            .any(|call| matches!(call, DriverCall::Config { session_id } if session_id == "s1")));
        assert!(calls.iter().any(|call| matches!(call, DriverCall::Mode { session_id, mode } if session_id == "s1" && mode == "planning")));
    }

    #[test]
    fn host_rejects_mode_before_calling_a_driver_that_does_not_advertise_it() {
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
        calls.lock().unwrap().clear();

        assert_eq!(
            block_on(host.set_mode("s1", "planning")),
            Err(HostError::UnsupportedCapability {
                kind: HostDriverKind::Codex,
                operation: "mode",
            })
        );
        assert!(calls.lock().unwrap().is_empty());
    }

    #[test]
    fn host_updates_model_before_first_prompt_and_rejects_changes_afterward() {
        let (driver, _calls) = fake(DriverCapabilities {
            new_session: true,
            prompt: true,
            config: true,
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

        let updated = block_on(host.set_config("s1", json!({"model":"gpt-5"}))).unwrap();
        assert_eq!(updated.binding.model.as_deref(), Some("gpt-5"));

        block_on(host.prompt("s1".into(), "hello".into(), Vec::new())).unwrap();
        assert!(matches!(
            block_on(host.set_config("s1", json!({"model":"gpt-5.4"}))),
            Err(HostError::BindingConflict { field }) if field == "model"
        ));
    }

    #[test]
    fn host_routes_prompt_attachments_without_exposing_the_payload_to_the_binding() {
        let (driver, calls) = fake(DriverCapabilities {
            new_session: true,
            prompt: true,
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
        block_on(host.prompt(
            "s1".into(),
            "inspect".into(),
            vec![PromptAttachment {
                filename: "figure.png".into(),
                mime: "image/png".into(),
                base64: "cGl4ZWxz".into(),
                extracted_text: None,
            }],
        ))
        .unwrap();
        assert!(calls.lock().unwrap().iter().any(|call| matches!(
            call,
            DriverCall::Prompt { session_id, attachment_count }
                if session_id == "s1" && *attachment_count == 1
        )));
    }

    #[test]
    fn sessions_of_the_same_engine_keep_their_own_driver_instances() {
        let (first_driver, first_calls) = fake(DriverCapabilities {
            new_session: true,
            prompt: true,
            ..Default::default()
        });
        let (second_driver, second_calls) = fake(DriverCapabilities {
            new_session: true,
            prompt: true,
            ..Default::default()
        });
        let mut host = AcpHost::new();
        host.register_driver(HostDriverKind::Codex, Box::new(first_driver));
        block_on(host.new_session(
            NewSessionRequest {
                session_id: "s1".into(),
            },
            binding(HostDriverKind::Codex, "gpt-1", "C:/project"),
        ))
        .unwrap();
        host.register_driver(HostDriverKind::Codex, Box::new(second_driver));
        block_on(host.new_session(
            NewSessionRequest {
                session_id: "s2".into(),
            },
            binding(HostDriverKind::Codex, "gpt-2", "C:/project"),
        ))
        .unwrap();

        block_on(host.prompt("s1".into(), "first".into(), Vec::new())).unwrap();

        assert!(first_calls.lock().unwrap().iter().any(
            |call| matches!(call, DriverCall::Prompt { session_id, .. } if session_id == "s1")
        ));
        assert!(!second_calls.lock().unwrap().iter().any(
            |call| matches!(call, DriverCall::Prompt { session_id, .. } if session_id == "s1")
        ));
    }

    #[test]
    fn host_lists_each_session_with_its_own_immutable_binding() {
        let (first_driver, _) = fake(DriverCapabilities {
            new_session: true,
            ..Default::default()
        });
        let (second_driver, _) = fake(DriverCapabilities {
            new_session: true,
            ..Default::default()
        });
        let mut host = AcpHost::new();
        host.register_driver(HostDriverKind::OpenCode, Box::new(first_driver));
        block_on(host.new_session(
            NewSessionRequest {
                session_id: "s1".into(),
            },
            binding(HostDriverKind::OpenCode, "model-a", "C:/project"),
        ))
        .unwrap();
        host.register_driver(HostDriverKind::OpenCode, Box::new(second_driver));
        block_on(host.new_session(
            NewSessionRequest {
                session_id: "s2".into(),
            },
            binding(HostDriverKind::OpenCode, "model-b", "C:/project"),
        ))
        .unwrap();

        let mut sessions = host.list_sessions();
        sessions.sort_by(|left, right| left.id.cmp(&right.id));
        assert_eq!(sessions[0].binding.model.as_deref(), Some("model-a"));
        assert_eq!(sessions[1].binding.model.as_deref(), Some("model-b"));
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

    #[test]
    fn resume_existing_session_attaches_a_driver_with_the_persisted_binding() {
        let (driver, calls) = fake(DriverCapabilities {
            resume_session: true,
            ..Default::default()
        });
        let mut host = AcpHost::new();
        host.register_driver(HostDriverKind::Codex, Box::new(driver));
        let persisted = binding(HostDriverKind::Codex, "persisted-model", "C:/project");

        let resumed = block_on(host.resume_existing_session(
            ResumeSessionRequest {
                session_id: "persisted-session".into(),
            },
            persisted.clone(),
        ))
        .unwrap();

        assert_eq!(resumed.binding, persisted);
        assert_eq!(
            *calls.lock().unwrap(),
            [DriverCall::Resume {
                session_id: "persisted-session".into()
            }]
        );
    }

    #[test]
    fn host_drains_vendor_neutral_events_from_the_bound_driver() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let events = vec![AgentEvent::TextDelta {
            session_id: "s1".into(),
            delta: "hello".into(),
        }];
        let driver = FakeDriver::with_events(
            DriverCapabilities {
                new_session: true,
                ..Default::default()
            },
            calls,
            events,
        );
        let mut host = AcpHost::new();
        host.register_driver(HostDriverKind::Codex, Box::new(driver));
        block_on(host.new_session(
            NewSessionRequest {
                session_id: "s1".into(),
            },
            binding(HostDriverKind::Codex, "gpt", "C:/project"),
        ))
        .unwrap();
        let drained = host.drain_events("s1").unwrap();
        assert!(
            matches!(drained.as_slice(), [AgentEvent::TextDelta { delta, .. }] if delta == "hello")
        );
        assert!(host.drain_events("s1").unwrap().is_empty());
    }

    #[test]
    fn terminal_session_detaches_the_driver_and_rejects_runtime_calls() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let driver = FakeDriver::with_events(
            DriverCapabilities {
                new_session: true,
                prompt: true,
                cancel: true,
                permission: true,
                config: true,
                mode: true,
                close_session: true,
                ..Default::default()
            },
            calls.clone(),
            vec![
                AgentEvent::Error {
                    session_id: Some("s1".into()),
                    message: "adapter crashed".into(),
                },
                AgentEvent::SessionClosed {
                    session_id: "s1".into(),
                },
            ],
        );
        let mut host = AcpHost::new();
        host.register_driver(HostDriverKind::Codex, Box::new(driver));
        block_on(host.new_session(
            NewSessionRequest {
                session_id: "s1".into(),
            },
            binding(HostDriverKind::Codex, "gpt", "C:/project"),
        ))
        .unwrap();

        let drained = host.drain_events("s1").unwrap();
        assert!(matches!(
            drained.as_slice(),
            [AgentEvent::Error { .. }, AgentEvent::SessionClosed { .. }]
        ));
        assert!(host.drain_events("s1").unwrap().is_empty());
        let call_count = calls.lock().unwrap().len();

        assert!(block_on(host.prompt("s1".into(), "late".into(), Vec::new())).is_err());
        assert!(block_on(host.cancel("s1")).is_err());
        assert!(block_on(host.respond_permission("s1", "permission-1", None)).is_err());
        assert!(block_on(host.set_config("s1", json!({"model":"other"}))).is_err());
        assert!(block_on(host.set_mode("s1", "planning")).is_err());
        assert_eq!(calls.lock().unwrap().len(), call_count);

        let listed = host.list_sessions();
        assert_eq!(listed.len(), 1);
        assert_eq!(serde_json::to_value(&listed[0]).unwrap()["state"], "closed");
        assert!(!listed[0].resumable);

        let mut changed = listed[0].binding.clone();
        changed.project_root = "C:/other".into();
        assert!(matches!(
            block_on(host.bind_session("s1", changed)),
            Err(HostError::BindingConflict { field }) if field == "project_root"
        ));
        let mut changed = listed[0].binding.clone();
        changed.profile_fingerprint = "other-fingerprint".into();
        assert!(matches!(
            block_on(host.bind_session("s1", changed)),
            Err(HostError::BindingConflict { field }) if field == "profile_fingerprint"
        ));
    }

    #[test]
    fn terminal_resumable_session_loads_through_a_new_driver() {
        let first_calls = Arc::new(Mutex::new(Vec::new()));
        let first = FakeDriver::with_events(
            DriverCapabilities {
                load_session: true,
                ..Default::default()
            },
            first_calls.clone(),
            vec![AgentEvent::SessionClosed {
                session_id: "persisted".into(),
            }],
        );
        let mut host = AcpHost::new();
        let original = binding(HostDriverKind::OpenCode, "model-a", "C:/project");
        host.register_driver(HostDriverKind::OpenCode, Box::new(first));
        block_on(host.load_existing_session(
            LoadSessionRequest {
                session_id: "persisted".into(),
            },
            original.clone(),
        ))
        .unwrap();
        assert!(matches!(
            host.drain_events("persisted").unwrap().as_slice(),
            [AgentEvent::SessionClosed { .. }]
        ));
        let first_call_count = first_calls.lock().unwrap().len();

        let replacement_calls = Arc::new(Mutex::new(Vec::new()));
        let replacement = FakeDriver::with_calls(
            DriverCapabilities {
                load_session: true,
                ..Default::default()
            },
            replacement_calls.clone(),
        );
        host.register_driver(HostDriverKind::OpenCode, Box::new(replacement));
        let loaded = block_on(host.load_session("persisted".into())).unwrap();

        assert_eq!(loaded.binding, original);
        assert_eq!(serde_json::to_value(&loaded).unwrap()["state"], "ready");
        assert_eq!(first_calls.lock().unwrap().len(), first_call_count);
        assert!(replacement_calls.lock().unwrap().iter().any(
            |call| matches!(call, DriverCall::Load { session_id } if session_id == "persisted")
        ));
    }
}
