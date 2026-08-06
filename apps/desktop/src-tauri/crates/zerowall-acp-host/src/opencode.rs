use crate::{
    AcpHostDriver, AgentBinding, DriverCapabilities, HostError, InitializeRequest,
    InitializeResponse, LoadSessionRequest, NewSessionRequest, PermissionOption, PromptRequest,
    PromptResponse, ResumeSessionRequest, SessionState, SetConfigRequest, SetModeRequest,
};
use async_trait::async_trait;
use serde_json::json;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransportResponse {
    pub status: u16,
    pub body: String,
}

#[async_trait]
pub trait OpenCodeTransport: Send {
    async fn send(
        &mut self,
        method: &str,
        path: &str,
        headers: &[(String, String)],
        body: Option<&str>,
    ) -> Result<TransportResponse, String>;
}

pub struct OpenCodeDriver<T> {
    transport: T,
    base_url: String,
    auth_header: String,
    binding: AgentBinding,
    events: Vec<crate::AgentEvent>,
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
        }
    }

    pub fn take_events(&mut self) -> Vec<crate::AgentEvent> {
        std::mem::take(&mut self.events)
    }
}

#[async_trait]
impl<T: OpenCodeTransport> AcpHostDriver for OpenCodeDriver<T> {
    fn capabilities(&self) -> DriverCapabilities {
        DriverCapabilities {
            new_session: true,
            load_session: true,
            prompt: true,
            cancel: true,
            permission: true,
            close_session: true,
            ..Default::default()
        }
    }

    async fn initialize(&mut self, _: InitializeRequest) -> Result<InitializeResponse, HostError> {
        Ok(InitializeResponse {
            capabilities: self.capabilities(),
        })
    }

    async fn new_session(&mut self, request: NewSessionRequest) -> Result<SessionState, HostError> {
        let body = json!({"title": request.session_id}).to_string();
        let response = self.send("POST", "/session", Some(&body)).await?;
        ensure_success(response.status, "session/new")?;
        let id = session_id(&response.body).unwrap_or(request.session_id);
        self.events.push(crate::AgentEvent::SessionStarted {
            session_id: id.clone(),
        });
        Ok(SessionState {
            id,
            binding: self.binding.clone(),
            resumable: false,
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
        let path = format!("/session/{}", encode_path(&request.session_id));
        let response = self.send("GET", &path, None).await?;
        ensure_success(response.status, "session/load")?;
        let id = session_id(&response.body).unwrap_or(request.session_id);
        Ok(SessionState {
            id,
            binding: self.binding.clone(),
            resumable: false,
        })
    }

    async fn prompt(&mut self, request: PromptRequest) -> Result<PromptResponse, HostError> {
        let path = format!("/session/{}/prompt_async", encode_path(&request.session_id));
        let body = json!({"parts":[{"type":"text","text":request.prompt}]}).to_string();
        let response = self.send("POST", &path, Some(&body)).await?;
        ensure_success(response.status, "session/prompt")?;
        self.map_events(&request.session_id, &response.body);
        let event_path = format!("/event?sessionID={}", encode_query(&request.session_id));
        let event_response = self.send("GET", &event_path, None).await?;
        ensure_success(event_response.status, "event")?;
        self.map_events(&request.session_id, &event_response.body);
        self.events.push(crate::AgentEvent::SessionIdle {
            session_id: request.session_id,
        });
        Ok(PromptResponse { completed: true })
    }

    async fn cancel(&mut self, session_id: String) -> Result<(), HostError> {
        let path = format!("/session/{}/abort", encode_path(&session_id));
        let response = self.send("POST", &path, None).await?;
        ensure_success(response.status, "session/cancel")
    }

    async fn respond_permission(
        &mut self,
        request_id: String,
        option_id: Option<String>,
    ) -> Result<(), HostError> {
        let path = format!("/permission/{}", encode_path(&request_id));
        let body = json!({"optionId": option_id}).to_string();
        let response = self.send("POST", &path, Some(&body)).await?;
        ensure_success(response.status, "permission")
    }

    async fn set_config(&mut self, request: SetConfigRequest) -> Result<SessionState, HostError> {
        let path = format!("/session/{}", encode_path(&request.session_id));
        let body = request.config.to_string();
        let response = self.send("PATCH", &path, Some(&body)).await?;
        ensure_success(response.status, "session/config")?;
        Ok(SessionState {
            id: request.session_id,
            binding: self.binding.clone(),
            resumable: false,
        })
    }

    async fn set_mode(&mut self, _: SetModeRequest) -> Result<(), HostError> {
        Err(HostError::UnsupportedCapability {
            kind: crate::HostDriverKind::OpenCode,
            operation: "mode",
        })
    }

    async fn close_session(&mut self, session_id: String) -> Result<(), HostError> {
        let path = format!("/session/{}", encode_path(&session_id));
        let response = self.send("DELETE", &path, None).await?;
        ensure_success(response.status, "session/close")
    }
}

impl<T: OpenCodeTransport> OpenCodeDriver<T> {
    async fn send(
        &mut self,
        method: &str,
        path: &str,
        body: Option<&str>,
    ) -> Result<TransportResponse, HostError> {
        let url = format!("{}{}", self.base_url, path);
        let headers = vec![
            ("Authorization".to_owned(), self.auth_header.clone()),
            (
                "Accept".to_owned(),
                "application/json, text/event-stream".to_owned(),
            ),
        ];
        self.transport
            .send(method, &url, &headers, body)
            .await
            .map_err(HostError::Driver)
    }

    fn map_events(&mut self, session_id: &str, body: &str) {
        for data in sse_data(body) {
            let Ok(value) = serde_json::from_str::<serde_json::Value>(&data) else {
                continue;
            };
            let kind = value
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let props = value.get("properties").unwrap_or(&value);
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
                        let title = part.get("tool").and_then(|v| v.as_str()).map(str::to_owned);
                        self.events.push(crate::AgentEvent::ToolUpdated {
                            session_id: session_id.into(),
                            tool_call_id: id.into(),
                            status: status.into(),
                            title,
                        });
                    }
                    _ => {}
                }
                continue;
            }
            match kind {
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
                    });
                }
                "permission.asked" | "permission.requested" => {
                    let request_id = props
                        .get("id")
                        .or_else(|| props.get("requestID"))
                        .and_then(|v| v.as_str())
                        .unwrap_or_default();
                    let options = props
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
                    self.events.push(crate::AgentEvent::PermissionRequested {
                        session_id: session_id.into(),
                        request_id: request_id.into(),
                        options,
                    });
                }
                "question.asked" | "question.requested" => {
                    if let Some(question) = props.get("question").and_then(|v| v.as_str()) {
                        self.events.push(crate::AgentEvent::QuestionRequested {
                            session_id: session_id.into(),
                            question: question.into(),
                        });
                    }
                }
                "message.updated" | "usage.updated" => {
                    let usage = props.get("usage").unwrap_or(props);
                    let input = usage
                        .get("inputTokens")
                        .or_else(|| usage.get("input_tokens"))
                        .and_then(|v| v.as_u64());
                    let output = usage
                        .get("outputTokens")
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
        let mut driver =
            OpenCodeDriver::new(fake, "http://localhost:4096/", "user", "pass", binding());
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
        assert_eq!(calls[0].url, "http://localhost:4096/session");
        assert_eq!(calls[1].url, "http://localhost:4096/session/s-load");
        assert_eq!(calls[0].headers[0].1, "Basic dXNlcjpwYXNz");
        assert!(calls[0].body.as_deref().unwrap().contains("local"));
    }

    #[test]
    fn prompt_maps_sse_events_and_cancel_aborts() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let sse = "data: {\"type\":\"text.updated\",\"properties\":{\"delta\":\"hi\"}}\ndata: {\"type\":\"reasoning.updated\",\"properties\":{\"text\":\"why\"}}\ndata: {\"type\":\"tool.updated\",\"properties\":{\"callID\":\"t1\",\"status\":\"running\",\"title\":\"Search\"}}\ndata: {\"type\":\"permission.asked\",\"properties\":{\"id\":\"r1\",\"options\":[{\"id\":\"allow\",\"title\":\"Allow\"}]}}\ndata: {\"type\":\"question.asked\",\"properties\":{\"question\":\"Continue?\"}}\ndata: {\"type\":\"usage.updated\",\"properties\":{\"inputTokens\":2,\"outputTokens\":3}}\n";
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
        assert!(events.iter().any(|e| matches!(e, crate::AgentEvent::QuestionRequested { question, .. } if question == "Continue?")));
        assert!(events.iter().any(|e| matches!(
            e,
            crate::AgentEvent::UsageUpdated {
                input_tokens: 2,
                output_tokens: 3,
                ..
            }
        )));
        block_on(driver.cancel("s1".into())).unwrap();
        let calls = calls.lock().unwrap();
        assert!(calls
            .iter()
            .any(|call| call.url == "http://x/session/s1/abort" && call.method == "POST"));
    }

    #[test]
    fn maps_real_message_part_updated_payloads() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let sse = "data: {\"type\":\"message.part.updated\",\"properties\":{\"part\":{\"sessionID\":\"s1\",\"id\":\"p1\",\"type\":\"text\",\"text\":\"nested text\"}}}\n";
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
        }))
        .unwrap();
        assert!(driver.take_events().iter().any(|event| matches!(event, crate::AgentEvent::TextDelta { delta, .. } if delta == "nested text")));
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
}
