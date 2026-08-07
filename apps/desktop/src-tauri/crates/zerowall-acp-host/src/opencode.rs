use crate::{
    AcpHostDriver, AgentBinding, DriverCapabilities, HostError, InitializeRequest,
    InitializeResponse, LoadSessionRequest, NewSessionRequest, PermissionOption, PromptRequest,
    PromptResponse, QuestionItem, QuestionOption, QuestionResponseRequest, ResumeSessionRequest,
    SessionState, SessionStatus, SetConfigRequest, SetModeRequest,
};
use async_trait::async_trait;
use futures::{future::FutureExt, stream, Stream, StreamExt};
use serde_json::json;
use std::pin::Pin;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransportResponse {
    pub status: u16,
    pub body: String,
}

pub type TransportEventStream =
    Pin<Box<dyn Stream<Item = Result<Vec<u8>, String>> + Send + 'static>>;

#[async_trait]
pub trait OpenCodeTransport: Send {
    async fn send(
        &mut self,
        method: &str,
        path: &str,
        headers: &[(String, String)],
        body: Option<&str>,
    ) -> Result<TransportResponse, String>;

    async fn stream(
        &mut self,
        method: &str,
        path: &str,
        headers: &[(String, String)],
    ) -> Result<(u16, TransportEventStream), String> {
        let response = self.send(method, path, headers, None).await?;
        Ok((
            response.status,
            Box::pin(stream::once(async move { Ok(response.body.into_bytes()) })),
        ))
    }
}

#[derive(Clone)]
pub struct HttpOpenCodeTransport {
    client: reqwest::Client,
}

impl HttpOpenCodeTransport {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }
}

impl Default for HttpOpenCodeTransport {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl OpenCodeTransport for HttpOpenCodeTransport {
    async fn send(
        &mut self,
        method: &str,
        path: &str,
        headers: &[(String, String)],
        body: Option<&str>,
    ) -> Result<TransportResponse, String> {
        let method = reqwest::Method::from_bytes(method.as_bytes())
            .map_err(|error| format!("invalid HTTP method: {error}"))?;
        let mut request = self.client.request(method, path);
        for (name, value) in headers {
            request = request.header(name, value);
        }
        if let Some(body) = body {
            request = request.body(body.to_owned());
        }
        let response = request
            .send()
            .await
            .map_err(|error| format!("OpenCode request failed: {error}"))?;
        let status = response.status().as_u16();
        let body = response
            .text()
            .await
            .map_err(|error| format!("OpenCode response read failed: {error}"))?;
        Ok(TransportResponse { status, body })
    }

    async fn stream(
        &mut self,
        method: &str,
        path: &str,
        headers: &[(String, String)],
    ) -> Result<(u16, TransportEventStream), String> {
        let method = reqwest::Method::from_bytes(method.as_bytes())
            .map_err(|error| format!("invalid HTTP method: {error}"))?;
        let mut request = self.client.request(method, path);
        for (name, value) in headers {
            request = request.header(name, value);
        }
        let response = request
            .send()
            .await
            .map_err(|error| format!("OpenCode event stream failed: {error}"))?;
        let status = response.status().as_u16();
        let stream = response.bytes_stream().map(|chunk| {
            chunk
                .map(|bytes| bytes.to_vec())
                .map_err(|error| format!("OpenCode event stream read failed: {error}"))
        });
        Ok((status, Box::pin(stream)))
    }
}

pub struct OpenCodeDriver<T> {
    transport: T,
    base_url: String,
    auth_header: String,
    binding: AgentBinding,
    events: Vec<crate::AgentEvent>,
    event_stream: Option<TransportEventStream>,
    event_buffer: Vec<u8>,
    event_session_id: Option<String>,
}

impl<T: OpenCodeTransport> OpenCodeDriver<T> {
    pub fn new(
        transport: T,
        base_url: impl Into<String>,
        username: &str,
        password: &str,
        binding: AgentBinding,
    ) -> Self {
        Self {
            transport,
            base_url: base_url.into().trim_end_matches('/').to_owned(),
            auth_header: format!("Basic {}", encode_base64(&format!("{username}:{password}"))),
            binding,
            events: Vec::new(),
            event_stream: None,
            event_buffer: Vec::new(),
            event_session_id: None,
        }
    }

    pub fn take_events(&mut self) -> Vec<crate::AgentEvent> {
        std::mem::take(&mut self.events)
    }

    /// Discover existing sessions inside the Host. OpenCode response DTOs are
    /// reduced to the same immutable SessionState used by every Driver.
    pub async fn list_sessions(&mut self) -> Result<Vec<SessionState>, HostError> {
        let path = self.with_directory("/experimental/session");
        let mut response = self.send("GET", &path, None).await?;
        if !(200..300).contains(&response.status) {
            let path = self.with_directory("/session");
            response = self.send("GET", &path, None).await?;
        }
        ensure_success(response.status, "session/list")?;
        let sessions =
            serde_json::from_str::<Vec<serde_json::Value>>(&response.body).map_err(|error| {
                HostError::Driver(format!("invalid OpenCode session list: {error}"))
            })?;
        Ok(sessions
            .into_iter()
            .filter_map(|value| {
                let id = value
                    .get("id")
                    .and_then(serde_json::Value::as_str)?
                    .to_owned();
                let time = value.get("time");
                Some(SessionState {
                    id,
                    binding: self.binding.clone(),
                    state: SessionStatus::Ready,
                    resumable: true,
                    title: value
                        .get("title")
                        .and_then(serde_json::Value::as_str)
                        .map(str::to_owned),
                    directory: value
                        .get("directory")
                        .and_then(serde_json::Value::as_str)
                        .map(str::to_owned),
                    parent_id: value
                        .get("parentID")
                        .or_else(|| value.get("parentId"))
                        .and_then(serde_json::Value::as_str)
                        .map(str::to_owned),
                    created: time
                        .and_then(|v| v.get("created"))
                        .and_then(serde_json::Value::as_u64),
                    updated: time
                        .and_then(|v| v.get("updated"))
                        .and_then(serde_json::Value::as_u64),
                })
            })
            .collect::<Vec<_>>())
    }
}

#[async_trait]
impl<T: OpenCodeTransport> AcpHostDriver for OpenCodeDriver<T> {
    fn capabilities(&self) -> DriverCapabilities {
        DriverCapabilities {
            new_session: true,
            load_session: true,
            prompt: true,
            history: true,
            cancel: true,
            permission: true,
            config: true,
            close_session: true,
            ..Default::default()
        }
    }

    fn drain_events(&mut self) -> Vec<crate::AgentEvent> {
        self.poll_event_stream();
        self.take_events()
    }

    async fn initialize(&mut self, _: InitializeRequest) -> Result<InitializeResponse, HostError> {
        Ok(InitializeResponse {
            capabilities: self.capabilities(),
        })
    }

    async fn new_session(&mut self, request: NewSessionRequest) -> Result<SessionState, HostError> {
        let body = json!({"title": request.session_id}).to_string();
        let path = self.with_directory("/session");
        let response = self.send("POST", &path, Some(&body)).await?;
        ensure_success(response.status, "session/new")?;
        let requested_id = request.session_id;
        let id = session_id(&response.body).unwrap_or_else(|| requested_id.clone());
        self.events.push(crate::AgentEvent::SessionStarted {
            session_id: id.clone(),
        });
        Ok(SessionState {
            id,
            binding: self.binding.clone(),
            state: SessionStatus::Ready,
            resumable: false,
            title: Some(requested_id),
            directory: Some(self.binding.project_root.clone()),
            parent_id: None,
            created: None,
            updated: None,
        })
    }

    async fn resume_session(&mut self, _: ResumeSessionRequest) -> Result<SessionState, HostError> {
        Err(HostError::UnsupportedCapability {
            kind: crate::HostDriverKind::OpenCode,
            operation: "resume_session",
        })
    }

    async fn load_session(
        &mut self,
        request: LoadSessionRequest,
    ) -> Result<SessionState, HostError> {
        let path = self.with_directory(&format!("/session/{}", encode_path(&request.session_id)));
        let response = self.send("GET", &path, None).await?;
        ensure_success(response.status, "session/load")?;
        let id = session_id(&response.body).unwrap_or(request.session_id);
        Ok(SessionState {
            id,
            binding: self.binding.clone(),
            state: SessionStatus::Ready,
            resumable: false,
            title: None,
            directory: Some(self.binding.project_root.clone()),
            parent_id: None,
            created: None,
            updated: None,
        })
    }

    async fn history(&mut self, session_id: String) -> Result<serde_json::Value, HostError> {
        let path = self.with_directory(&format!("/session/{}/message", encode_path(&session_id)));
        let response = self.send("GET", &path, None).await?;
        ensure_success(response.status, "session/history")?;
        let messages = serde_json::from_str::<Vec<serde_json::Value>>(&response.body)
            .map_err(|error| HostError::Driver(format!("invalid OpenCode history: {error}")))?;
        let normalized = messages
            .into_iter()
            .map(|message| {
                let info = message.get("info").cloned().unwrap_or_default();
                let mut output = serde_json::Map::new();
                if let Some(role) = info.get("role") {
                    output.insert("role".into(), role.clone());
                }
                for key in ["id", "agent"] {
                    if let Some(value) = info.get(key) {
                        output.insert(key.into(), value.clone());
                    }
                }
                if let Some(error) = info.get("error") {
                    let message = error
                        .as_str()
                        .map(str::to_owned)
                        .or_else(|| {
                            error
                                .pointer("/data/message")
                                .and_then(serde_json::Value::as_str)
                                .map(str::to_owned)
                        })
                        .unwrap_or_else(|| error.to_string());
                    output.insert("error".into(), serde_json::Value::String(message));
                }
                if let Some(completed) = info.pointer("/time/completed") {
                    output.insert("completed".into(), completed.clone());
                }
                if let Some(tokens) = info.get("tokens") {
                    let mut usage = serde_json::Map::from_iter([
                        (
                            "input".into(),
                            serde_json::json!(tokens
                                .get("input")
                                .and_then(serde_json::Value::as_u64)
                                .unwrap_or(0)),
                        ),
                        (
                            "output".into(),
                            serde_json::json!(tokens
                                .get("output")
                                .and_then(serde_json::Value::as_u64)
                                .unwrap_or(0)),
                        ),
                        (
                            "reasoning".into(),
                            serde_json::json!(tokens
                                .get("reasoning")
                                .and_then(serde_json::Value::as_u64)
                                .unwrap_or(0)),
                        ),
                        (
                            "cacheRead".into(),
                            serde_json::json!(tokens
                                .pointer("/cache/read")
                                .and_then(serde_json::Value::as_u64)
                                .unwrap_or(0)),
                        ),
                        (
                            "cacheWrite".into(),
                            serde_json::json!(tokens
                                .pointer("/cache/write")
                                .and_then(serde_json::Value::as_u64)
                                .unwrap_or(0)),
                        ),
                    ]);
                    if let Some(cost) = info.get("cost").filter(|value| value.is_number()) {
                        usage.insert("cost".into(), cost.clone());
                    }
                    output.insert("usage".into(), serde_json::Value::Object(usage));
                }
                output.insert(
                    "parts".into(),
                    message
                        .get("parts")
                        .cloned()
                        .unwrap_or_else(|| serde_json::json!([])),
                );
                serde_json::Value::Object(output)
            })
            .collect::<Vec<_>>();
        Ok(serde_json::Value::Array(normalized))
    }

    async fn prompt(&mut self, request: PromptRequest) -> Result<PromptResponse, HostError> {
        self.ensure_event_stream(&request.session_id).await?;
        let path = self.with_directory(&format!(
            "/session/{}/prompt_async",
            encode_path(&request.session_id)
        ));
        let mut parts = Vec::new();
        if !request.prompt.is_empty() || request.attachments.is_empty() {
            parts.push(json!({"type":"text","text":request.prompt}));
        }
        for attachment in request.attachments {
            parts.push(json!({
                "type": "file",
                "mime": attachment.mime,
                "filename": attachment.filename,
                "url": format!("data:{};base64,{}", attachment.mime, attachment.base64),
            }));
            if let Some(text) = attachment
                .extracted_text
                .filter(|text| !text.trim().is_empty())
            {
                parts.push(json!({
                    "type": "text",
                    "text": format!("[Attached file: {}]\n{}", attachment.filename, text),
                }));
            }
        }
        let mut body = json!({"parts": parts});
        if let (Some(provider), Some(model)) = (&self.binding.provider, &self.binding.model) {
            let model_id = model.strip_prefix(&format!("{provider}/")).unwrap_or(model);
            body["model"] = json!({"providerID": provider, "modelID": model_id});
        }
        if let Some(variant) = &self.binding.variant {
            body["variant"] = json!(variant);
        }
        let body = body.to_string();
        let response = self.send("POST", &path, Some(&body)).await?;
        ensure_success(response.status, "session/prompt")?;
        self.map_events(&request.session_id, &response.body);
        Ok(PromptResponse { completed: false })
    }

    async fn cancel(&mut self, session_id: String) -> Result<(), HostError> {
        let path = self.with_directory(&format!("/session/{}/abort", encode_path(&session_id)));
        let response = self.send("POST", &path, None).await?;
        ensure_success(response.status, "session/cancel")
    }

    async fn respond_permission(
        &mut self,
        request_id: String,
        option_id: Option<String>,
    ) -> Result<(), HostError> {
        let path = self.with_directory(&format!("/permission/{}/reply", encode_path(&request_id)));
        let body = json!({"reply": option_id.unwrap_or_else(|| "reject".into())}).to_string();
        let response = self.send("POST", &path, Some(&body)).await?;
        ensure_success(response.status, "permission")
    }

    async fn respond_question(
        &mut self,
        request: QuestionResponseRequest,
    ) -> Result<(), HostError> {
        let (suffix, body) = match request.answers {
            Some(answers) => ("reply", json!({"answers": answers}).to_string()),
            None => ("reject", "{}".into()),
        };
        let path = self.with_directory(&format!(
            "/question/{}/{}",
            encode_path(&request.request_id),
            suffix
        ));
        let response = self.send("POST", &path, Some(&body)).await?;
        ensure_success(response.status, "question")
    }

    async fn set_config(&mut self, request: SetConfigRequest) -> Result<SessionState, HostError> {
        let path = self.with_directory(&format!("/session/{}", encode_path(&request.session_id)));
        let body = request.config.to_string();
        let response = self.send("PATCH", &path, Some(&body)).await?;
        ensure_success(response.status, "session/config")?;
        crate::apply_config_to_binding(&mut self.binding, &request.config);
        Ok(SessionState {
            id: request.session_id,
            binding: self.binding.clone(),
            state: SessionStatus::Ready,
            resumable: false,
            title: None,
            directory: Some(self.binding.project_root.clone()),
            parent_id: None,
            created: None,
            updated: None,
        })
    }

    async fn set_mode(&mut self, _: SetModeRequest) -> Result<(), HostError> {
        Err(HostError::UnsupportedCapability {
            kind: crate::HostDriverKind::OpenCode,
            operation: "mode",
        })
    }

    async fn close_session(&mut self, session_id: String) -> Result<(), HostError> {
        let path = self.with_directory(&format!("/session/{}", encode_path(&session_id)));
        let response = self.send("DELETE", &path, None).await?;
        ensure_success(response.status, "session/close")?;
        self.event_stream = None;
        self.event_buffer.clear();
        self.event_session_id = None;
        Ok(())
    }
}

impl<T: OpenCodeTransport> OpenCodeDriver<T> {
    async fn ensure_event_stream(&mut self, session_id: &str) -> Result<(), HostError> {
        if self.event_stream.is_some() {
            return Ok(());
        }
        let path = self.with_directory(&format!("/event?sessionID={}", encode_query(session_id)));
        let url = format!("{}{}", self.base_url, path);
        let headers = self.headers();
        let (status, stream) = self
            .transport
            .stream("GET", &url, &headers)
            .await
            .map_err(HostError::Driver)?;
        ensure_success(status, "event")?;
        self.event_stream = Some(stream);
        self.event_session_id = Some(session_id.to_owned());
        Ok(())
    }

    fn poll_event_stream(&mut self) {
        loop {
            let next = self
                .event_stream
                .as_mut()
                .and_then(|stream| stream.next().now_or_never());
            match next {
                Some(Some(Ok(chunk))) => {
                    self.event_buffer.extend_from_slice(&chunk);
                    self.map_complete_frames();
                }
                Some(Some(Err(error))) => {
                    self.events.push(crate::AgentEvent::Error {
                        session_id: self.event_session_id.clone(),
                        message: error,
                    });
                    self.event_stream = None;
                    break;
                }
                Some(None) => {
                    self.map_remaining_buffer();
                    self.event_stream = None;
                    break;
                }
                None => break,
            }
        }
    }

    fn map_complete_frames(&mut self) {
        while let Some(end) = sse_frame_end(&self.event_buffer) {
            let frame = self.event_buffer.drain(..end).collect::<Vec<_>>();
            let session_id = self.event_session_id.clone().unwrap_or_default();
            self.map_events(&session_id, &String::from_utf8_lossy(&frame));
        }
    }

    fn map_remaining_buffer(&mut self) {
        if self.event_buffer.is_empty() {
            return;
        }
        let frame = std::mem::take(&mut self.event_buffer);
        let session_id = self.event_session_id.clone().unwrap_or_default();
        self.map_events(&session_id, &String::from_utf8_lossy(&frame));
    }

    fn headers(&self) -> Vec<(String, String)> {
        vec![
            ("Authorization".to_owned(), self.auth_header.clone()),
            (
                "Accept".to_owned(),
                "application/json, text/event-stream".to_owned(),
            ),
        ]
    }

    fn with_directory(&self, path: &str) -> String {
        let separator = if path.contains('?') { '&' } else { '?' };
        format!(
            "{path}{separator}directory={}",
            encode_query(&self.binding.project_root)
        )
    }

    async fn send(
        &mut self,
        method: &str,
        path: &str,
        body: Option<&str>,
    ) -> Result<TransportResponse, HostError> {
        let url = format!("{}{}", self.base_url, path);
        let headers = self.headers();
        self.transport
            .send(method, &url, &headers, body)
            .await
            .map_err(HostError::Driver)
    }

    fn map_events(&mut self, subscribed_session_id: &str, body: &str) {
        for data in sse_data(body) {
            let Ok(value) = serde_json::from_str::<serde_json::Value>(&data) else {
                continue;
            };
            let (value, directory) = event_payload(&value);
            if directory.is_some_and(|directory| directory != self.binding.project_root) {
                continue;
            }
            let Some(session_id) = event_session_id(value) else {
                continue;
            };
            if session_id != subscribed_session_id {
                continue;
            }
            let kind = value
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let props = value.get("properties").unwrap_or(value);
            if kind == "message.part.updated" {
                let part = props.get("part").unwrap_or(props);
                let part_kind = part
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default();
                match part_kind {
                    "text" => {
                        if let Some(text) = part.get("text").and_then(|v| v.as_str()) {
                            self.events.push(crate::AgentEvent::TextDelta {
                                session_id: session_id.into(),
                                delta: text.into(),
                            });
                        }
                    }
                    "reasoning" => {
                        if let Some(text) = part.get("text").and_then(|v| v.as_str()) {
                            self.events.push(crate::AgentEvent::ThoughtDelta {
                                session_id: session_id.into(),
                                delta: text.into(),
                            });
                        }
                    }
                    "tool" => {
                        let id = part
                            .get("callID")
                            .or_else(|| part.get("callId"))
                            .or_else(|| part.get("id"))
                            .and_then(|v| v.as_str())
                            .unwrap_or_default();
                        let status = part
                            .get("state")
                            .and_then(|v| v.get("status"))
                            .or_else(|| part.get("status"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("updated");
                        let state = part.get("state").unwrap_or(part);
                        let title = state
                            .get("title")
                            .or_else(|| part.get("title"))
                            .and_then(|v| v.as_str())
                            .map(str::to_owned);
                        self.events.push(crate::AgentEvent::ToolUpdated {
                            session_id: session_id.into(),
                            tool_call_id: id.into(),
                            status: status.into(),
                            title,
                            tool: part.get("tool").and_then(|v| v.as_str()).map(str::to_owned),
                            input: state
                                .get("input")
                                .cloned()
                                .filter(|value| value.is_object()),
                            output: state
                                .get("output")
                                .and_then(|v| v.as_str())
                                .map(str::to_owned),
                            partial_output: state
                                .pointer("/metadata/output")
                                .and_then(|v| v.as_str())
                                .map(str::to_owned),
                            diff: state
                                .pointer("/metadata/diff")
                                .and_then(|v| v.as_str())
                                .map(str::to_owned),
                            started_at: state.pointer("/time/start").and_then(|v| v.as_u64()),
                            ended_at: state.pointer("/time/end").and_then(|v| v.as_u64()),
                            child_session_id: state
                                .pointer("/metadata/sessionId")
                                .or_else(|| state.pointer("/metadata/sessionID"))
                                .and_then(|v| v.as_str())
                                .map(str::to_owned),
                        });
                    }
                    _ => {}
                }
                continue;
            }
            match kind {
                "session.idle" => {
                    self.events.push(crate::AgentEvent::SessionIdle {
                        session_id: session_id.into(),
                    });
                }
                "session.status" => {
                    let status = props
                        .get("status")
                        .and_then(|value| value.as_str())
                        .or_else(|| {
                            props
                                .get("status")
                                .and_then(|value| value.get("type"))
                                .and_then(|value| value.as_str())
                        });
                    if status == Some("idle") {
                        self.events.push(crate::AgentEvent::SessionIdle {
                            session_id: session_id.into(),
                        });
                    }
                }
                "text.updated" | "message.part.updated" => {
                    if let Some(text) = props
                        .get("delta")
                        .or_else(|| props.get("text"))
                        .and_then(|v| v.as_str())
                    {
                        self.events.push(crate::AgentEvent::TextDelta {
                            session_id: session_id.into(),
                            delta: text.into(),
                        });
                    }
                }
                "reasoning.updated" | "message.reasoning.updated" => {
                    if let Some(text) = props
                        .get("delta")
                        .or_else(|| props.get("text"))
                        .and_then(|v| v.as_str())
                    {
                        self.events.push(crate::AgentEvent::ThoughtDelta {
                            session_id: session_id.into(),
                            delta: text.into(),
                        });
                    }
                }
                "tool.updated" | "message.tool.updated" => {
                    let id = props
                        .get("callID")
                        .or_else(|| props.get("callId"))
                        .or_else(|| props.get("id"))
                        .and_then(|v| v.as_str())
                        .unwrap_or_default();
                    let status = props
                        .get("status")
                        .and_then(|v| v.as_str())
                        .unwrap_or("updated");
                    let title = props
                        .get("title")
                        .and_then(|v| v.as_str())
                        .map(str::to_owned);
                    self.events.push(crate::AgentEvent::ToolUpdated {
                        session_id: session_id.into(),
                        tool_call_id: id.into(),
                        status: status.into(),
                        title,
                        tool: props
                            .get("tool")
                            .and_then(|v| v.as_str())
                            .map(str::to_owned),
                        input: props
                            .get("input")
                            .cloned()
                            .filter(|value| value.is_object()),
                        output: props
                            .get("output")
                            .and_then(|v| v.as_str())
                            .map(str::to_owned),
                        partial_output: props
                            .get("partialOutput")
                            .and_then(|v| v.as_str())
                            .map(str::to_owned),
                        diff: props
                            .get("diff")
                            .and_then(|v| v.as_str())
                            .map(str::to_owned),
                        started_at: props.get("startedAt").and_then(|v| v.as_u64()),
                        ended_at: props.get("endedAt").and_then(|v| v.as_u64()),
                        child_session_id: props
                            .get("childSessionId")
                            .and_then(|v| v.as_str())
                            .map(str::to_owned),
                    });
                }
                "permission.asked" | "permission.requested" => {
                    let request_id = props
                        .get("id")
                        .or_else(|| props.get("requestID"))
                        .and_then(|v| v.as_str())
                        .unwrap_or_default();
                    let mut options: Vec<PermissionOption> = props
                        .get("options")
                        .and_then(|v| v.as_array())
                        .map(|items| {
                            items
                                .iter()
                                .filter_map(|item| {
                                    let id = item.get("id").and_then(|v| v.as_str())?.to_owned();
                                    Some(PermissionOption {
                                        id,
                                        label: item
                                            .get("label")
                                            .or_else(|| item.get("title"))
                                            .and_then(|v| v.as_str())
                                            .map(str::to_owned),
                                    })
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    if options.is_empty() {
                        options = vec![
                            PermissionOption {
                                id: "once".into(),
                                label: Some("Allow once".into()),
                            },
                            PermissionOption {
                                id: "always".into(),
                                label: Some("Always allow".into()),
                            },
                            PermissionOption {
                                id: "reject".into(),
                                label: Some("Reject".into()),
                            },
                        ];
                    }
                    let action = props
                        .get("permission")
                        .or_else(|| props.get("action"))
                        .and_then(|value| value.as_str())
                        .map(str::to_owned);
                    let resources = props
                        .get("patterns")
                        .or_else(|| props.get("resources"))
                        .and_then(|value| value.as_array())
                        .map(|values| {
                            values
                                .iter()
                                .filter_map(|value| value.as_str().map(str::to_owned))
                                .collect()
                        })
                        .unwrap_or_default();
                    self.events.push(crate::AgentEvent::PermissionRequested {
                        session_id: session_id.into(),
                        request_id: request_id.into(),
                        action,
                        resources,
                        options,
                    });
                }
                "question.asked" | "question.requested" => {
                    let request_id = props
                        .get("id")
                        .or_else(|| props.get("requestID"))
                        .or_else(|| props.get("requestId"))
                        .and_then(|v| v.as_str())
                        .unwrap_or_default();
                    let questions = props
                        .get("questions")
                        .and_then(|v| v.as_array())
                        .map(|items| {
                            items
                                .iter()
                                .filter_map(|item| {
                                    let question = item.get("question")?.as_str()?.to_owned();
                                    let header = item
                                        .get("header")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("Question")
                                        .to_owned();
                                    let options = item
                                        .get("options")
                                        .and_then(|v| v.as_array())
                                        .map(|options| {
                                            options
                                                .iter()
                                                .filter_map(|option| {
                                                    Some(QuestionOption {
                                                        label: option
                                                            .get("label")
                                                            .and_then(|v| v.as_str())?
                                                            .to_owned(),
                                                        description: option
                                                            .get("description")
                                                            .and_then(|v| v.as_str())
                                                            .map(str::to_owned),
                                                    })
                                                })
                                                .collect()
                                        })
                                        .unwrap_or_default();
                                    Some(QuestionItem {
                                        question,
                                        header,
                                        options,
                                        multiple: item.get("multiple").and_then(|v| v.as_bool()),
                                        custom: item.get("custom").and_then(|v| v.as_bool()),
                                    })
                                })
                                .collect::<Vec<_>>()
                        })
                        .filter(|items| !items.is_empty())
                        .or_else(|| {
                            props
                                .get("question")
                                .and_then(|v| v.as_str())
                                .map(|question| {
                                    vec![QuestionItem {
                                        question: question.into(),
                                        header: "Question".into(),
                                        options: Vec::new(),
                                        multiple: None,
                                        custom: Some(true),
                                    }]
                                })
                        });
                    if !request_id.is_empty() {
                        if let Some(questions) = questions {
                            self.events.push(crate::AgentEvent::QuestionRequested {
                                session_id: session_id.into(),
                                request_id: request_id.into(),
                                questions,
                            });
                        }
                    }
                }
                "message.updated" | "usage.updated" => {
                    let usage = props
                        .pointer("/info/tokens")
                        .or_else(|| props.get("usage"))
                        .unwrap_or(props);
                    let input = usage
                        .get("input")
                        .or_else(|| usage.get("inputTokens"))
                        .or_else(|| usage.get("input_tokens"))
                        .and_then(|v| v.as_u64());
                    let output = usage
                        .get("output")
                        .or_else(|| usage.get("outputTokens"))
                        .or_else(|| usage.get("output_tokens"))
                        .and_then(|v| v.as_u64());
                    if let (Some(input_tokens), Some(output_tokens)) = (input, output) {
                        self.events.push(crate::AgentEvent::UsageUpdated {
                            session_id: session_id.into(),
                            input_tokens,
                            output_tokens,
                        });
                    }
                }
                "session.error" => {
                    let message = props
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or("OpenCode session error");
                    self.events.push(crate::AgentEvent::Error {
                        session_id: Some(session_id.into()),
                        message: message.into(),
                    });
                }
                _ => {}
            }
        }
    }
}

fn event_payload(value: &serde_json::Value) -> (&serde_json::Value, Option<&str>) {
    let payload = value.get("payload").unwrap_or(value);
    let props = payload.get("properties").unwrap_or(payload);
    let directory = value
        .get("directory")
        .or_else(|| payload.get("directory"))
        .or_else(|| props.get("directory"))
        .or_else(|| props.pointer("/info/directory"))
        .or_else(|| props.pointer("/part/directory"))
        .and_then(serde_json::Value::as_str);
    (payload, directory)
}

fn event_session_id(value: &serde_json::Value) -> Option<&str> {
    let props = value.get("properties").unwrap_or(value);
    props
        .get("sessionID")
        .or_else(|| props.get("sessionId"))
        .or_else(|| props.pointer("/info/sessionID"))
        .or_else(|| props.pointer("/info/sessionId"))
        .or_else(|| props.pointer("/part/sessionID"))
        .or_else(|| props.pointer("/part/sessionId"))
        .and_then(serde_json::Value::as_str)
}

fn ensure_success(status: u16, operation: &str) -> Result<(), HostError> {
    if (200..300).contains(&status) {
        Ok(())
    } else {
        Err(HostError::Driver(format!(
            "OpenCode {operation} returned HTTP {status}"
        )))
    }
}

fn session_id(body: &str) -> Option<String> {
    let value = serde_json::from_str::<serde_json::Value>(body).ok()?;
    value
        .get("id")
        .or_else(|| value.get("sessionID"))
        .and_then(|v| v.as_str())
        .map(str::to_owned)
}

fn sse_data(body: &str) -> Vec<String> {
    body.lines()
        .filter_map(|line| {
            line.strip_prefix("data:")
                .map(|data| data.trim().to_owned())
        })
        .collect()
}

fn sse_frame_end(buffer: &[u8]) -> Option<usize> {
    buffer
        .windows(2)
        .position(|window| window == b"\n\n")
        .map(|index| index + 2)
        .or_else(|| {
            buffer
                .windows(4)
                .position(|window| window == b"\r\n\r\n")
                .map(|index| index + 4)
        })
}

fn encode_path(value: &str) -> String {
    value
        .replace('%', "%25")
        .replace('/', "%2F")
        .replace(' ', "%20")
}
fn encode_query(value: &str) -> String {
    encode_path(value)
}

fn encode_base64(value: &str) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bytes = value.as_bytes();
    let mut result = String::new();
    for chunk in bytes.chunks(3) {
        let a = chunk[0] as u32;
        let b = chunk.get(1).copied().unwrap_or(0) as u32;
        let c = chunk.get(2).copied().unwrap_or(0) as u32;
        result.push(TABLE[((a >> 2) & 0x3f) as usize] as char);
        result.push(TABLE[(((a & 3) << 4) | (b >> 4)) as usize] as char);
        result.push(if chunk.len() > 1 {
            TABLE[(((b & 15) << 2) | (c >> 6)) as usize] as char
        } else {
            '='
        });
        result.push(if chunk.len() > 2 {
            TABLE[(c & 63) as usize] as char
        } else {
            '='
        });
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{HostDriverKind, PromptRequest};
    use futures::executor::block_on;
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Debug)]
    struct Call {
        method: String,
        url: String,
        headers: Vec<(String, String)>,
        body: Option<String>,
    }
    struct Fake {
        calls: Arc<Mutex<Vec<Call>>>,
        responses: Vec<TransportResponse>,
    }
    #[async_trait]
    impl OpenCodeTransport for Fake {
        async fn send(
            &mut self,
            method: &str,
            path: &str,
            headers: &[(String, String)],
            body: Option<&str>,
        ) -> Result<TransportResponse, String> {
            self.calls.lock().unwrap().push(Call {
                method: method.into(),
                url: path.into(),
                headers: headers.to_vec(),
                body: body.map(str::to_owned),
            });
            self.responses
                .pop()
                .ok_or_else(|| "missing response".into())
        }
    }

    struct SlowEventFake;

    #[async_trait]
    impl OpenCodeTransport for SlowEventFake {
        async fn send(
            &mut self,
            method: &str,
            path: &str,
            _headers: &[(String, String)],
            _body: Option<&str>,
        ) -> Result<TransportResponse, String> {
            if method == "GET" && path.contains("/event?") {
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            }
            Ok(TransportResponse {
                status: 200,
                body: String::new(),
            })
        }

        async fn stream(
            &mut self,
            _method: &str,
            _path: &str,
            _headers: &[(String, String)],
        ) -> Result<(u16, TransportEventStream), String> {
            let delayed = stream::once(async {
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                Ok(Vec::new())
            });
            Ok((200, Box::pin(delayed)))
        }
    }

    struct ChunkedEventFake;

    #[async_trait]
    impl OpenCodeTransport for ChunkedEventFake {
        async fn send(
            &mut self,
            _method: &str,
            _path: &str,
            _headers: &[(String, String)],
            _body: Option<&str>,
        ) -> Result<TransportResponse, String> {
            Ok(TransportResponse {
                status: 200,
                body: String::new(),
            })
        }

        async fn stream(
            &mut self,
            _method: &str,
            _path: &str,
            _headers: &[(String, String)],
        ) -> Result<(u16, TransportEventStream), String> {
            let body = b"data: {\"type\":\"text.updated\",\"properties\":{\"sessionID\":\"s1\",\"delta\":\"hello\"}}\n\ndata: {\"type\":\"session.idle\",\"properties\":{\"sessionID\":\"s1\"}}\n\n";
            let split = body.iter().position(|byte| *byte == b'"').unwrap_or(10);
            let chunks = vec![Ok(body[..split].to_vec()), Ok(body[split..].to_vec())];
            Ok((200, Box::pin(stream::iter(chunks))))
        }
    }
    fn binding() -> AgentBinding {
        AgentBinding {
            engine: HostDriverKind::OpenCode,
            profile: "p".into(),
            model: None,
            provider: None,
            variant: None,
            project_root: ".".into(),
            profile_fingerprint: "fp".into(),
            resolved_at: "now".into(),
        }
    }

    #[test]
    fn creates_and_loads_using_expected_paths_and_basic_auth() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let fake = Fake {
            calls: calls.clone(),
            responses: vec![
                TransportResponse {
                    status: 200,
                    body: r#"{"id":"s-load"}"#.into(),
                },
                TransportResponse {
                    status: 200,
                    body: r#"{"id":"s-new"}"#.into(),
                },
            ],
        };
        let mut request_binding = binding();
        request_binding.project_root = "C:/science project".into();
        let mut driver = OpenCodeDriver::new(
            fake,
            "http://localhost:4096/",
            "user",
            "pass",
            request_binding,
        );
        let created = block_on(driver.new_session(NewSessionRequest {
            session_id: "local".into(),
        }))
        .unwrap();
        assert_eq!(created.id, "s-new");
        let loaded = block_on(driver.load_session(LoadSessionRequest {
            session_id: "s-load".into(),
        }))
        .unwrap();
        assert_eq!(loaded.id, "s-load");
        let calls = calls.lock().unwrap();
        assert_eq!(
            calls[0].url,
            "http://localhost:4096/session?directory=C:%2Fscience%20project"
        );
        assert_eq!(
            calls[1].url,
            "http://localhost:4096/session/s-load?directory=C:%2Fscience%20project"
        );
        assert_eq!(calls[0].headers[0].1, "Basic dXNlcjpwYXNz");
        assert!(calls[0].body.as_deref().unwrap().contains("local"));
    }

    #[test]
    fn history_normalizes_opencode_message_metadata() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let fake = Fake {
            calls: calls.clone(),
            responses: vec![TransportResponse {
                status: 200,
                body: r#"[{"info":{"id":"m1","role":"assistant","time":{"completed":123},"agent":"build","tokens":{"input":2,"output":3,"reasoning":1,"cache":{"read":4,"write":5}},"cost":0.25},"parts":[{"type":"text","text":"answer"}]}]"#.into(),
            }],
        };
        let mut request_binding = binding();
        request_binding.project_root = "C:/science project".into();
        let mut driver = OpenCodeDriver::new(fake, "http://x", "u", "p", request_binding);

        let history = block_on(driver.history("s1".into())).unwrap();

        assert_eq!(history[0]["role"], "assistant");
        assert_eq!(history[0]["id"], "m1");
        assert_eq!(history[0]["usage"]["cacheRead"], 4);
        assert_eq!(history[0]["parts"][0]["text"], "answer");
        assert_eq!(
            calls.lock().unwrap()[0].url,
            "http://x/session/s1/message?directory=C:%2Fscience%20project"
        );
    }

    #[test]
    fn discovers_existing_sessions_without_exposing_http_dtos() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let fake = Fake {
            calls: calls.clone(),
            responses: vec![TransportResponse {
                status: 200,
                body: r#"[{"id":"remote-1","title":"Literature review","directory":"C:/science","time":{"created":1,"updated":2}},{"id":"remote-2","title":"Experiment"}]"#.into(),
            }],
        };
        let mut discovered_binding = binding();
        discovered_binding.model = Some("model".into());
        let mut driver = OpenCodeDriver::new(fake, "http://x", "u", "p", discovered_binding);

        let sessions = block_on(driver.list_sessions()).unwrap();

        assert_eq!(
            sessions
                .iter()
                .map(|session| session.id.as_str())
                .collect::<Vec<_>>(),
            ["remote-1", "remote-2"]
        );
        assert_eq!(sessions[0].binding.model.as_deref(), Some("model"));
        assert_eq!(sessions[0].title.as_deref(), Some("Literature review"));
        assert_eq!(sessions[0].directory.as_deref(), Some("C:/science"));
        assert_eq!(sessions[0].created, Some(1));
        assert_eq!(sessions[0].updated, Some(2));
        assert_eq!(sessions[0].parent_id, None);
        assert_eq!(sessions[1].title.as_deref(), Some("Experiment"));
        assert_eq!(
            calls.lock().unwrap()[0].url,
            "http://x/experimental/session?directory=."
        );
    }

    #[test]
    fn prompt_maps_sse_events_and_cancel_aborts() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let sse = "data: {\"type\":\"text.updated\",\"properties\":{\"sessionID\":\"s1\",\"delta\":\"hi\"}}\ndata: {\"type\":\"reasoning.updated\",\"properties\":{\"sessionID\":\"s1\",\"text\":\"why\"}}\ndata: {\"type\":\"tool.updated\",\"properties\":{\"sessionID\":\"s1\",\"callID\":\"t1\",\"status\":\"running\",\"title\":\"Search\"}}\ndata: {\"type\":\"permission.asked\",\"properties\":{\"sessionID\":\"s1\",\"id\":\"r1\",\"options\":[{\"id\":\"allow\",\"title\":\"Allow\"}]}}\ndata: {\"type\":\"question.asked\",\"properties\":{\"sessionID\":\"s1\",\"id\":\"q1\",\"questions\":[{\"question\":\"Continue?\",\"header\":\"Next\",\"options\":[{\"label\":\"Yes\",\"description\":\"Continue the run\"}],\"custom\":true}]}}\ndata: {\"type\":\"usage.updated\",\"properties\":{\"sessionID\":\"s1\",\"inputTokens\":2,\"outputTokens\":3}}\n";
        let fake = Fake {
            calls: calls.clone(),
            responses: vec![
                TransportResponse {
                    status: 200,
                    body: String::new(),
                },
                TransportResponse {
                    status: 200,
                    body: sse.into(),
                },
                TransportResponse {
                    status: 200,
                    body: String::new(),
                },
            ],
        };
        let mut driver = OpenCodeDriver::new(fake, "http://x", "u", "p", binding());
        block_on(driver.prompt(PromptRequest {
            session_id: "s1".into(),
            prompt: "hello".into(),
            attachments: Vec::new(),
        }))
        .unwrap();
        let events = driver.take_events();
        assert!(events
            .iter()
            .any(|e| matches!(e, crate::AgentEvent::TextDelta { delta, .. } if delta == "hi")));
        assert!(events
            .iter()
            .any(|e| matches!(e, crate::AgentEvent::ThoughtDelta { delta, .. } if delta == "why")));
        assert!(events.iter().any(|e| matches!(e, crate::AgentEvent::ToolUpdated { tool_call_id, .. } if tool_call_id == "t1")));
        assert!(events.iter().any(|e| matches!(e, crate::AgentEvent::PermissionRequested { request_id, options, .. } if request_id == "r1" && options[0].id == "allow")));
        assert!(events.iter().any(|e| matches!(e, crate::AgentEvent::QuestionRequested { request_id, questions, .. } if request_id == "q1" && questions[0].question == "Continue?" && questions[0].options[0].label == "Yes")));
        assert!(events.iter().any(|e| matches!(
            e,
            crate::AgentEvent::UsageUpdated {
                input_tokens: 2,
                output_tokens: 3,
                ..
            }
        )));
        let calls_after_prompt = calls.lock().unwrap();
        assert_eq!(
            calls_after_prompt[0].url,
            "http://x/event?sessionID=s1&directory=."
        );
        assert_eq!(
            calls_after_prompt[1].url,
            "http://x/session/s1/prompt_async?directory=."
        );
        drop(calls_after_prompt);
        block_on(driver.cancel("s1".into())).unwrap();
        let calls = calls.lock().unwrap();
        assert!(calls.iter().any(
            |call| call.url == "http://x/session/s1/abort?directory=." && call.method == "POST"
        ));
    }

    #[test]
    fn maps_and_replies_to_native_opencode_permissions() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let fake = Fake {
            calls: calls.clone(),
            responses: vec![TransportResponse {
                status: 200,
                body: String::new(),
            }],
        };
        let mut permission_binding = binding();
        permission_binding.project_root = "C:/science project".into();
        let mut driver = OpenCodeDriver::new(fake, "http://x", "u", "p", permission_binding);
        driver.map_events(
            "s1",
            "data: {\"type\":\"permission.asked\",\"properties\":{\"sessionID\":\"s1\",\"id\":\"p1\",\"permission\":\"bash\",\"patterns\":[\"git status\"]}}\n\n",
        );

        assert!(driver.take_events().iter().any(|event| matches!(
            event,
            crate::AgentEvent::PermissionRequested { request_id, action, resources, options, .. }
                if request_id == "p1"
                    && action.as_deref() == Some("bash")
                    && resources == &["git status"]
                    && options.iter().map(|option| option.id.as_str()).eq(["once", "always", "reject"])
        )));

        block_on(driver.respond_permission("p1".into(), Some("once".into()))).unwrap();
        let calls = calls.lock().unwrap();
        assert_eq!(
            calls[0].url,
            "http://x/permission/p1/reply?directory=C:%2Fscience%20project"
        );
        assert_eq!(calls[0].body.as_deref(), Some("{\"reply\":\"once\"}"));
    }

    #[test]
    fn replies_to_and_rejects_native_opencode_questions() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let fake = Fake {
            calls: calls.clone(),
            responses: vec![
                TransportResponse {
                    status: 200,
                    body: String::new(),
                },
                TransportResponse {
                    status: 200,
                    body: String::new(),
                },
            ],
        };
        let mut question_binding = binding();
        question_binding.project_root = "C:/science project".into();
        let mut driver = OpenCodeDriver::new(fake, "http://x", "u", "p", question_binding);

        block_on(driver.respond_question(QuestionResponseRequest {
            session_id: "s1".into(),
            request_id: "question/1".into(),
            answers: Some(vec![vec!["Continue".into()]]),
        }))
        .unwrap();
        block_on(driver.respond_question(QuestionResponseRequest {
            session_id: "s1".into(),
            request_id: "question-2".into(),
            answers: None,
        }))
        .unwrap();

        let calls = calls.lock().unwrap();
        assert_eq!(
            calls[0].url,
            "http://x/question/question%2F1/reply?directory=C:%2Fscience%20project"
        );
        assert_eq!(
            calls[0].body.as_deref(),
            Some("{\"answers\":[[\"Continue\"]]}")
        );
        assert_eq!(
            calls[1].url,
            "http://x/question/question-2/reject?directory=C:%2Fscience%20project"
        );
        assert_eq!(calls[1].body.as_deref(), Some("{}"));
    }

    #[test]
    fn prompt_returns_without_waiting_for_the_sse_connection_to_end() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let mut driver = OpenCodeDriver::new(SlowEventFake, "http://x", "u", "p", binding());
            let prompt = driver.prompt(PromptRequest {
                session_id: "s1".into(),
                prompt: "hello".into(),
                attachments: Vec::new(),
            });

            assert!(
                tokio::time::timeout(std::time::Duration::from_millis(50), prompt)
                    .await
                    .is_ok()
            );
        });
    }

    #[test]
    fn drain_events_incrementally_decodes_sse_frames_and_idle() {
        let mut driver = OpenCodeDriver::new(ChunkedEventFake, "http://x", "u", "p", binding());
        block_on(driver.prompt(PromptRequest {
            session_id: "s1".into(),
            prompt: "hello".into(),
            attachments: Vec::new(),
        }))
        .unwrap();

        let events = driver.drain_events();
        assert!(events.iter().any(|event| matches!(
            event,
            crate::AgentEvent::TextDelta { delta, .. } if delta == "hello"
        )));
        assert!(events
            .iter()
            .any(|event| matches!(event, crate::AgentEvent::SessionIdle { session_id } if session_id == "s1")));
    }

    #[test]
    fn maps_real_message_part_updated_payloads() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let sse = concat!(
            "data: {\"type\":\"message.part.updated\",\"properties\":{\"part\":{\"sessionID\":\"s1\",\"id\":\"p1\",\"type\":\"text\",\"text\":\"nested text\"}}}\n",
            "data: {\"type\":\"message.part.updated\",\"properties\":{\"part\":{\"sessionID\":\"s1\",\"id\":\"p2\",\"callID\":\"tool-1\",\"type\":\"tool\",\"tool\":\"write\",\"state\":{\"status\":\"completed\",\"title\":\"Write report\",\"input\":{\"filePath\":\"reports/final.md\"},\"output\":\"done\",\"metadata\":{\"diff\":\"+ result\"},\"time\":{\"start\":10,\"end\":20}}}}}\n",
        );
        let fake = Fake {
            calls,
            responses: vec![
                TransportResponse {
                    status: 200,
                    body: String::new(),
                },
                TransportResponse {
                    status: 200,
                    body: sse.into(),
                },
                TransportResponse {
                    status: 200,
                    body: String::new(),
                },
            ],
        };
        let mut driver = OpenCodeDriver::new(fake, "http://x", "u", "p", binding());
        block_on(driver.prompt(PromptRequest {
            session_id: "s1".into(),
            prompt: "hello".into(),
            attachments: Vec::new(),
        }))
        .unwrap();
        let events = driver.take_events();
        assert!(events.iter().any(|event| matches!(event, crate::AgentEvent::TextDelta { delta, .. } if delta == "nested text")));
        assert!(events.iter().any(|event| matches!(event,
            crate::AgentEvent::ToolUpdated { tool_call_id, tool, input, output, diff, started_at, ended_at, .. }
                if tool_call_id == "tool-1"
                    && tool.as_deref() == Some("write")
                    && input.as_ref().and_then(|value| value.get("filePath")).and_then(|value| value.as_str()) == Some("reports/final.md")
                    && output.as_deref() == Some("done")
                    && diff.as_deref() == Some("+ result")
                    && *started_at == Some(10)
                    && *ended_at == Some(20)
        )));
    }

    #[test]
    fn maps_real_message_updated_token_usage() {
        let fake = Fake {
            calls: Arc::new(Mutex::new(Vec::new())),
            responses: vec![],
        };
        let mut driver = OpenCodeDriver::new(fake, "http://x", "u", "p", binding());
        driver.map_events(
            "s1",
            "data: {\"type\":\"message.updated\",\"properties\":{\"info\":{\"sessionID\":\"s1\",\"tokens\":{\"input\":12,\"output\":8,\"reasoning\":3,\"cache\":{\"read\":4,\"write\":2}}}}}\n\n",
        );

        assert!(driver.take_events().iter().any(|event| matches!(event,
            crate::AgentEvent::UsageUpdated { input_tokens, output_tokens, .. }
                if *input_tokens == 12 && *output_tokens == 8
        )));
    }

    #[test]
    fn filters_sse_events_by_original_session_and_directory() {
        let fake = Fake {
            calls: Arc::new(Mutex::new(Vec::new())),
            responses: vec![],
        };
        let mut event_binding = binding();
        event_binding.project_root = "C:/science".into();
        let mut driver = OpenCodeDriver::new(fake, "http://x", "u", "p", event_binding);
        driver.map_events(
            "s1",
            concat!(
                "data: {\"directory\":\"C:/science\",\"payload\":{\"type\":\"message.part.updated\",\"properties\":{\"part\":{\"sessionID\":\"other\",\"type\":\"text\",\"text\":\"wrong session\"}}}}\n\n",
                "data: {\"directory\":\"C:/other\",\"payload\":{\"type\":\"message.part.updated\",\"properties\":{\"part\":{\"sessionID\":\"s1\",\"type\":\"text\",\"text\":\"wrong directory\"}}}}\n\n",
                "data: {\"directory\":\"C:/science\",\"payload\":{\"type\":\"message.part.updated\",\"properties\":{\"part\":{\"sessionID\":\"s1\",\"type\":\"text\",\"text\":\"accepted\"}}}}\n\n",
            ),
        );

        let events = driver.take_events();
        assert_eq!(events.len(), 1);
        assert!(matches!(
            &events[0],
            crate::AgentEvent::TextDelta { session_id, delta }
                if session_id == "s1" && delta == "accepted"
        ));
    }

    #[test]
    fn prompt_maps_image_and_extracted_document_attachments_to_opencode_parts() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let fake = Fake {
            calls: calls.clone(),
            responses: vec![
                TransportResponse {
                    status: 200,
                    body: String::new(),
                },
                TransportResponse {
                    status: 200,
                    body: String::new(),
                },
            ],
        };
        let mut driver = OpenCodeDriver::new(fake, "http://x", "u", "p", binding());
        block_on(driver.prompt(PromptRequest {
            session_id: "s1".into(),
            prompt: "inspect".into(),
            attachments: vec![crate::PromptAttachment {
                filename: "notes.txt".into(),
                mime: "text/plain".into(),
                base64: "bm90ZXM=".into(),
                extracted_text: Some("sample notes".into()),
            }],
        }))
        .unwrap();
        let calls = calls.lock().unwrap();
        let body = calls
            .iter()
            .find(|call| call.method == "POST")
            .and_then(|call| call.body.as_deref())
            .unwrap();
        let value: serde_json::Value = serde_json::from_str(body).unwrap();
        assert_eq!(value["parts"][0]["text"], "inspect");
        assert_eq!(value["parts"][1]["filename"], "notes.txt");
        assert_eq!(value["parts"][1]["url"], "data:text/plain;base64,bm90ZXM=");
        assert_eq!(
            value["parts"][2]["text"],
            "[Attached file: notes.txt]\nsample notes"
        );
    }

    #[test]
    fn prompt_pins_the_immutable_provider_model_and_variant_binding() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let fake = Fake {
            calls: calls.clone(),
            responses: vec![
                TransportResponse {
                    status: 200,
                    body: String::new(),
                },
                TransportResponse {
                    status: 200,
                    body: String::new(),
                },
            ],
        };
        let mut prompt_binding = binding();
        prompt_binding.provider = Some("cloud".into());
        prompt_binding.model = Some("gpt-5.4".into());
        prompt_binding.variant = Some("high".into());
        let mut driver = OpenCodeDriver::new(fake, "http://x", "u", "p", prompt_binding);

        block_on(driver.prompt(PromptRequest {
            session_id: "s1".into(),
            prompt: "inspect".into(),
            attachments: Vec::new(),
        }))
        .unwrap();

        let calls = calls.lock().unwrap();
        let body = calls
            .iter()
            .find(|call| call.method == "POST")
            .and_then(|call| call.body.as_deref())
            .unwrap();
        let value: serde_json::Value = serde_json::from_str(body).unwrap();
        assert_eq!(value["model"]["providerID"], "cloud");
        assert_eq!(value["model"]["modelID"], "gpt-5.4");
        assert_eq!(value["variant"], "high");
    }

    #[test]
    fn resume_is_explicitly_unsupported() {
        let fake = Fake {
            calls: Arc::new(Mutex::new(Vec::new())),
            responses: vec![],
        };
        let mut driver = OpenCodeDriver::new(fake, "http://x", "u", "p", binding());
        assert!(matches!(
            block_on(driver.resume_session(ResumeSessionRequest {
                session_id: "s".into()
            })),
            Err(HostError::UnsupportedCapability {
                operation: "resume_session",
                ..
            })
        ));
    }

    #[test]
    fn advertises_config_only_when_the_driver_implements_it() {
        let fake = Fake {
            calls: Arc::new(Mutex::new(Vec::new())),
            responses: vec![],
        };
        let driver = OpenCodeDriver::new(fake, "http://x", "u", "p", binding());
        assert!(driver.capabilities().config);
        assert!(!driver.capabilities().mode);
    }

    #[test]
    fn http_transport_round_trips_a_local_fake_server() {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        use std::thread;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0_u8; 4096];
            let count = stream.read(&mut buffer).unwrap();
            let request = String::from_utf8_lossy(&buffer[..count]);
            assert!(request.starts_with("POST /health HTTP/1.1"));
            assert!(request
                .to_ascii_lowercase()
                .contains("authorization: basic dtpw"));
            assert!(request.ends_with("hello"));
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nready")
                .unwrap();
        });

        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let mut transport = HttpOpenCodeTransport::new();
            let response = transport
                .send(
                    "POST",
                    &format!("http://{address}/health"),
                    &[("Authorization".into(), "Basic dTpw".into())],
                    Some("hello"),
                )
                .await
                .unwrap();
            assert_eq!(response.status, 200);
            assert_eq!(response.body, "ready");
        });
        server.join().unwrap();
    }
}
