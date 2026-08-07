use crate::{
    AcpHostDriver, AgentBinding, DriverCapabilities, HostError, InitializeRequest,
    InitializeResponse, LoadSessionRequest, NewSessionRequest, PermissionOption, PromptRequest,
    PromptResponse, QuestionItem, QuestionOption, QuestionResponseRequest, ResumeSessionRequest,
    SessionState, SessionStatus, SetConfigRequest, SetModeRequest,
};
use async_trait::async_trait;
use futures::{future::FutureExt, stream, Stream, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
use std::pin::Pin;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransportResponse {
    pub status: u16,
    pub body: String,
}

pub type TransportEventStream =
    Pin<Box<dyn Stream<Item = Result<Vec<u8>, String>> + Send + 'static>>;

const MAX_PENDING_AGENT_EVENTS: usize = 256;
const MAX_SSE_BUFFER_BYTES: usize = 1024 * 1024;

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModelInfo {
    pub id: String,
    pub name: String,
    pub variants: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub models: Vec<ProviderModelInfo>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCatalogEntry {
    pub id: String,
    pub name: String,
    pub env: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCatalog {
    pub all: Vec<ProviderCatalogEntry>,
    pub connected: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CustomProviderRequest {
    pub id: String,
    pub name: String,
    pub npm: String,
    pub base_url: String,
    pub models: Vec<String>,
    #[serde(default)]
    pub contexts: BTreeMap<String, u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum McpConfig {
    Local {
        command: Vec<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        enabled: Option<bool>,
        #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
        environment: BTreeMap<String, String>,
    },
    Remote {
        url: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        enabled: Option<bool>,
        #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
        headers: BTreeMap<String, String>,
    },
}

impl McpConfig {
    fn set_enabled(&mut self, value: bool) {
        match self {
            Self::Local { enabled, .. } | Self::Remote { enabled, .. } => {
                *enabled = Some(value);
            }
        }
    }

    fn redact_secrets(mut self) -> Self {
        match &mut self {
            Self::Local { environment, .. } => {
                environment.retain(|key, _| !is_secret_mcp_field(key));
            }
            Self::Remote { headers, .. } => {
                headers.clear();
            }
        }
        self
    }
}

fn is_secret_mcp_field(key: &str) -> bool {
    let normalized = key.trim().to_ascii_uppercase().replace('-', "_");
    normalized == "AUTHORIZATION"
        || normalized == "COOKIE"
        || normalized.ends_with("_API_KEY")
        || normalized.ends_with("_TOKEN")
        || normalized.ends_with("_SECRET")
        || normalized.ends_with("_PASSWORD")
        || normalized.ends_with("_CREDENTIAL")
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    pub name: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<McpConfig>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpServerRequest {
    pub name: String,
    pub config: McpConfig,
}

#[derive(Default, Deserialize)]
struct OpenCodeMcpConfig {
    #[serde(default)]
    mcp: BTreeMap<String, McpConfig>,
}

#[derive(Default, Deserialize)]
struct OpenCodeMcpStatus {
    status: Option<String>,
}

/// Typed OpenCode configuration control owned by the unified Host. Raw HTTP
/// paths and DTOs stay in Rust; callers receive only stable provider types.
pub struct OpenCodeProviderControl<T> {
    transport: T,
    base_url: String,
    auth_header: String,
}

impl<T: OpenCodeTransport> OpenCodeProviderControl<T> {
    pub fn new(transport: T, base_url: impl Into<String>, username: &str, password: &str) -> Self {
        Self {
            transport,
            base_url: base_url.into().trim_end_matches('/').to_owned(),
            auth_header: format!("Basic {}", encode_base64(&format!("{username}:{password}"))),
        }
    }

    pub async fn list_providers(&mut self) -> Result<Vec<ProviderInfo>, HostError> {
        let response = self.send("GET", "/config/providers", None).await?;
        ensure_success(response.status, "provider/list")?;
        let body = serde_json::from_str::<serde_json::Value>(&response.body).map_err(|error| {
            HostError::Driver(format!("invalid OpenCode provider list: {error}"))
        })?;
        let mut providers = Vec::new();
        for provider in body
            .get("providers")
            .and_then(serde_json::Value::as_array)
            .into_iter()
            .flatten()
        {
            let Some(id) = provider.get("id").and_then(serde_json::Value::as_str) else {
                continue;
            };
            if id == "opencode" {
                continue;
            }
            let mut models = Vec::new();
            if let Some(entries) = provider
                .get("models")
                .and_then(serde_json::Value::as_object)
            {
                for (model_id, model) in entries {
                    let variants = model
                        .get("variants")
                        .and_then(serde_json::Value::as_object)
                        .map(|variants| order_variants(variants.keys().cloned().collect()))
                        .unwrap_or_default();
                    let context = model
                        .pointer("/limit/context")
                        .and_then(serde_json::Value::as_u64)
                        .filter(|value| *value > 0);
                    models.push(ProviderModelInfo {
                        id: model_id.clone(),
                        name: model
                            .get("name")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or(model_id)
                            .to_owned(),
                        variants,
                        context,
                    });
                }
            }
            providers.push(ProviderInfo {
                id: id.to_owned(),
                name: provider
                    .get("name")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or(id)
                    .to_owned(),
                models,
            });
        }
        Ok(providers)
    }

    pub async fn list_provider_catalog(&mut self) -> Result<ProviderCatalog, HostError> {
        let response = self.send("GET", "/provider", None).await?;
        ensure_success(response.status, "provider/catalog")?;
        let body = serde_json::from_str::<serde_json::Value>(&response.body).map_err(|error| {
            HostError::Driver(format!("invalid OpenCode provider catalog: {error}"))
        })?;
        let all = body
            .get("all")
            .and_then(serde_json::Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|provider| {
                let id = provider.get("id").and_then(serde_json::Value::as_str)?;
                let name = provider
                    .get("name")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or(id);
                let env = provider
                    .get("env")
                    .and_then(serde_json::Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(serde_json::Value::as_str)
                    .map(str::to_owned)
                    .collect();
                Some(ProviderCatalogEntry {
                    id: id.to_owned(),
                    name: name.to_owned(),
                    env,
                })
            })
            .collect();
        let connected = body
            .get("connected")
            .and_then(serde_json::Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(serde_json::Value::as_str)
            .map(str::to_owned)
            .collect();
        Ok(ProviderCatalog { all, connected })
    }

    pub async fn list_custom_provider_ids(&mut self) -> Result<Vec<String>, HostError> {
        let response = self.send("GET", "/global/config", None).await?;
        ensure_success(response.status, "provider/custom-list")?;
        let body = serde_json::from_str::<serde_json::Value>(&response.body).map_err(|error| {
            HostError::Driver(format!("invalid OpenCode provider config: {error}"))
        })?;
        let mut ids = body
            .get("provider")
            .and_then(serde_json::Value::as_object)
            .map(|providers| {
                providers
                    .iter()
                    .filter(|(_, provider)| {
                        provider.get("npm").is_some()
                            || provider
                                .pointer("/options/baseURL")
                                .and_then(serde_json::Value::as_str)
                                .is_some()
                    })
                    .map(|(id, _)| id.clone())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        ids.sort();
        Ok(ids)
    }

    pub async fn get_default_model(&mut self) -> Result<Option<String>, HostError> {
        let response = self.send("GET", "/global/config", None).await?;
        ensure_success(response.status, "default-model/get")?;
        let body = serde_json::from_str::<serde_json::Value>(&response.body)
            .map_err(|error| HostError::Driver(format!("invalid OpenCode config: {error}")))?;
        Ok(body
            .get("model")
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned))
    }

    pub async fn set_default_model(&mut self, model: &str) -> Result<(), HostError> {
        let body = json!({"model": model}).to_string();
        let response = self.send("PATCH", "/global/config", Some(&body)).await?;
        ensure_success(response.status, "default-model/set")
    }

    pub async fn get_provider_region(
        &mut self,
        provider_id: &str,
    ) -> Result<Option<String>, HostError> {
        let response = self.send("GET", "/global/config", None).await?;
        ensure_success(response.status, "provider-region/get")?;
        let body = serde_json::from_str::<serde_json::Value>(&response.body).map_err(|error| {
            HostError::Driver(format!("invalid OpenCode provider config: {error}"))
        })?;
        Ok(body
            .get("provider")
            .and_then(serde_json::Value::as_object)
            .and_then(|providers| providers.get(provider_id))
            .and_then(|provider| provider.pointer("/options/region"))
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|region| !region.is_empty())
            .map(str::to_owned))
    }

    pub async fn set_provider_region(
        &mut self,
        provider_id: &str,
        region: &str,
    ) -> Result<(), HostError> {
        let body = json!({
            "provider": {
                provider_id: {
                    "options": {"region": region}
                }
            }
        })
        .to_string();
        let response = self.send("PATCH", "/global/config", Some(&body)).await?;
        ensure_success(response.status, "provider-region/set")
    }

    pub async fn add_custom_provider(
        &mut self,
        request: CustomProviderRequest,
    ) -> Result<(), HostError> {
        let clear = json!({"provider": {request.id.clone(): {"models": null}}}).to_string();
        let clear_response = self.send("PATCH", "/global/config", Some(&clear)).await?;
        ensure_success(clear_response.status, "provider/clear-models")?;

        let models = request
            .models
            .iter()
            .map(|model| {
                let mut entry = json!({
                    "name": model,
                    "attachment": true,
                    "modalities": {"input": ["text", "image"], "output": ["text"]},
                });
                if let Some(context) = request.contexts.get(model).filter(|value| **value > 0) {
                    entry["limit"] = json!({"context": context, "output": 0});
                }
                (model.clone(), entry)
            })
            .collect::<serde_json::Map<_, _>>();
        let body = json!({
            "provider": {
                request.id: {
                    "name": request.name,
                    "npm": request.npm,
                    "options": {"baseURL": request.base_url},
                    "models": models,
                }
            }
        })
        .to_string();
        let response = self.send("PATCH", "/global/config", Some(&body)).await?;
        ensure_success(response.status, "provider/add")
    }

    pub async fn remove_custom_provider(&mut self, provider_id: &str) -> Result<(), HostError> {
        let body = json!({"provider": {provider_id: null}}).to_string();
        let response = self.send("PATCH", "/global/config", Some(&body)).await?;
        ensure_success(response.status, "provider/remove")
    }

    pub async fn clear_default_custom_model_context_limits(&mut self) -> Result<(), HostError> {
        let providers = self
            .global_provider_config("provider/context-cleanup")
            .await?;
        let mut provider_patch = serde_json::Map::new();
        for (provider_id, provider) in providers {
            if !is_custom_provider_config(&provider) {
                continue;
            }
            let mut model_patch = serde_json::Map::new();
            for (model_id, model) in provider
                .get("models")
                .and_then(serde_json::Value::as_object)
                .into_iter()
                .flatten()
            {
                let context = model
                    .pointer("/limit/context")
                    .and_then(serde_json::Value::as_u64);
                let output = model
                    .pointer("/limit/output")
                    .and_then(serde_json::Value::as_u64);
                if context == Some(128_000) && output == Some(0) {
                    model_patch.insert(
                        model_id.clone(),
                        json!({"limit": {"context": 0, "output": 0}}),
                    );
                }
            }
            if !model_patch.is_empty() {
                provider_patch.insert(provider_id, json!({"models": model_patch}));
            }
        }
        self.patch_provider_config(provider_patch, "provider/context-cleanup")
            .await
    }

    pub async fn remove_legacy_provider_entries(&mut self) -> Result<(), HostError> {
        let providers = self
            .global_provider_config("provider/legacy-cleanup")
            .await?;
        let provider_patch = providers
            .keys()
            .filter(|provider_id| {
                provider_id.as_str() == "sub2api" || provider_id.starts_with("sub2api-")
            })
            .map(|provider_id| (provider_id.clone(), serde_json::Value::Null))
            .collect();
        self.patch_provider_config(provider_patch, "provider/legacy-cleanup")
            .await
    }

    pub async fn ensure_custom_providers_image_capable(&mut self) -> Result<(), HostError> {
        let providers = self
            .global_provider_config("provider/image-capability")
            .await?;
        let mut provider_patch = serde_json::Map::new();
        for (provider_id, provider) in providers {
            if !is_custom_provider_config(&provider) {
                continue;
            }
            let mut model_patch = serde_json::Map::new();
            for (model_id, model) in provider
                .get("models")
                .and_then(serde_json::Value::as_object)
                .into_iter()
                .flatten()
            {
                let has_attachment =
                    model.get("attachment").and_then(serde_json::Value::as_bool) == Some(true);
                let has_image = model
                    .pointer("/modalities/input")
                    .and_then(serde_json::Value::as_array)
                    .is_some_and(|modalities| {
                        modalities
                            .iter()
                            .any(|value| value.as_str() == Some("image"))
                    });
                if has_attachment && has_image {
                    continue;
                }
                let output = model
                    .pointer("/modalities/output")
                    .and_then(serde_json::Value::as_array)
                    .cloned()
                    .map(serde_json::Value::Array)
                    .unwrap_or_else(|| json!(["text"]));
                model_patch.insert(
                    model_id.clone(),
                    json!({
                        "attachment": true,
                        "modalities": {"input": ["text", "image"], "output": output},
                    }),
                );
            }
            if !model_patch.is_empty() {
                provider_patch.insert(provider_id, json!({"models": model_patch}));
            }
        }
        self.patch_provider_config(provider_patch, "provider/image-capability")
            .await
    }

    async fn global_provider_config(
        &mut self,
        operation: &str,
    ) -> Result<serde_json::Map<String, serde_json::Value>, HostError> {
        let response = self.send("GET", "/global/config", None).await?;
        ensure_success(response.status, operation)?;
        let mut body =
            serde_json::from_str::<serde_json::Value>(&response.body).map_err(|error| {
                HostError::Driver(format!("invalid OpenCode provider config: {error}"))
            })?;
        Ok(body
            .get_mut("provider")
            .and_then(serde_json::Value::as_object_mut)
            .map(std::mem::take)
            .unwrap_or_default())
    }

    async fn patch_provider_config(
        &mut self,
        provider_patch: serde_json::Map<String, serde_json::Value>,
        operation: &str,
    ) -> Result<(), HostError> {
        if provider_patch.is_empty() {
            return Ok(());
        }
        let body = json!({"provider": provider_patch}).to_string();
        let response = self.send("PATCH", "/global/config", Some(&body)).await?;
        ensure_success(response.status, operation)
    }

    async fn send(
        &mut self,
        method: &str,
        path: &str,
        body: Option<&str>,
    ) -> Result<TransportResponse, HostError> {
        let mut headers = vec![("Authorization".into(), self.auth_header.clone())];
        if body.is_some() {
            headers.push(("Content-Type".into(), "application/json".into()));
        }
        self.transport
            .send(
                method,
                &format!("{}{}", self.base_url, path),
                &headers,
                body,
            )
            .await
            .map_err(HostError::Driver)
    }
}

fn is_custom_provider_config(provider: &serde_json::Value) -> bool {
    provider.get("npm").is_some()
        || provider
            .pointer("/options/baseURL")
            .and_then(serde_json::Value::as_str)
            .is_some()
}

/// Typed MCP configuration control owned by the unified Host. OpenCode paths,
/// Basic auth, and raw config/status DTOs never cross this Rust boundary.
pub struct OpenCodeMcpControl<T> {
    transport: T,
    base_url: String,
    auth_header: String,
}

impl<T: OpenCodeTransport> OpenCodeMcpControl<T> {
    pub fn new(transport: T, base_url: impl Into<String>, username: &str, password: &str) -> Self {
        Self {
            transport,
            base_url: base_url.into().trim_end_matches('/').to_owned(),
            auth_header: format!("Basic {}", encode_base64(&format!("{username}:{password}"))),
        }
    }

    pub async fn list_mcp_servers(&mut self) -> Result<Vec<McpServer>, HostError> {
        let status_response = self.send("GET", "/mcp", None).await?;
        let statuses = if (200..300).contains(&status_response.status) {
            serde_json::from_str::<BTreeMap<String, OpenCodeMcpStatus>>(&status_response.body)
                .map_err(|error| {
                    HostError::Driver(format!("invalid OpenCode MCP status: {error}"))
                })?
        } else {
            BTreeMap::new()
        };
        let config_response = self.send("GET", "/global/config", None).await?;
        let configs = if (200..300).contains(&config_response.status) {
            serde_json::from_str::<OpenCodeMcpConfig>(&config_response.body)
                .map_err(|error| {
                    HostError::Driver(format!("invalid OpenCode MCP config: {error}"))
                })?
                .mcp
        } else {
            BTreeMap::new()
        };
        let mut names = statuses
            .keys()
            .chain(configs.keys())
            .cloned()
            .collect::<Vec<_>>();
        names.sort();
        names.dedup();
        Ok(names
            .into_iter()
            .map(|name| McpServer {
                status: statuses
                    .get(&name)
                    .and_then(|value| value.status.clone())
                    .unwrap_or_else(|| "pending".into()),
                config: configs.get(&name).cloned().map(McpConfig::redact_secrets),
                name,
            })
            .collect())
    }

    pub async fn add_mcp_server(&mut self, request: McpServerRequest) -> Result<(), HostError> {
        self.write_mcp_config(&request.name, Some(request.config), "mcp/add")
            .await
    }

    pub async fn remove_mcp_server(&mut self, name: &str) -> Result<(), HostError> {
        self.write_mcp_config(name, None, "mcp/remove").await
    }

    pub async fn reconnect_mcp_server(&mut self, name: &str) -> Result<(), HostError> {
        let mut enabled = self.mcp_config(name).await?;
        let mut disabled = enabled.clone();
        disabled.set_enabled(false);
        self.write_mcp_config(name, Some(disabled), "mcp/disable")
            .await?;
        enabled.set_enabled(true);
        self.write_mcp_config(name, Some(enabled), "mcp/enable")
            .await
    }

    pub async fn ensure_mcp_environment(
        &mut self,
        name: &str,
        environment: BTreeMap<String, String>,
    ) -> Result<(), HostError> {
        let mut config = self.mcp_config(name).await?;
        match &mut config {
            McpConfig::Local {
                environment: current,
                ..
            } => {
                if environment
                    .iter()
                    .all(|(key, value)| current.get(key) == Some(value))
                {
                    return Ok(());
                }
                current.extend(environment);
            }
            McpConfig::Remote { .. } => {
                return Err(HostError::Driver(format!("MCP server {name} is not local")))
            }
        }
        self.write_mcp_config(name, Some(config), "mcp/environment")
            .await
    }

    async fn mcp_config(&mut self, name: &str) -> Result<McpConfig, HostError> {
        let response = self.send("GET", "/global/config", None).await?;
        ensure_success(response.status, "mcp/config")?;
        let mut config = serde_json::from_str::<OpenCodeMcpConfig>(&response.body)
            .map_err(|error| HostError::Driver(format!("invalid OpenCode MCP config: {error}")))?;
        config
            .mcp
            .remove(name)
            .ok_or_else(|| HostError::Driver(format!("MCP server {name} is not configured")))
    }

    async fn write_mcp_config(
        &mut self,
        name: &str,
        config: Option<McpConfig>,
        operation: &str,
    ) -> Result<(), HostError> {
        let body = json!({"mcp": {name: config}}).to_string();
        let response = self.send("PATCH", "/global/config", Some(&body)).await?;
        ensure_success(response.status, operation)
    }

    async fn send(
        &mut self,
        method: &str,
        path: &str,
        body: Option<&str>,
    ) -> Result<TransportResponse, HostError> {
        let mut headers = vec![("Authorization".into(), self.auth_header.clone())];
        if body.is_some() {
            headers.push(("Content-Type".into(), "application/json".into()));
        }
        self.transport
            .send(
                method,
                &format!("{}{}", self.base_url, path),
                &headers,
                body,
            )
            .await
            .map_err(HostError::Driver)
    }
}

fn order_variants(mut variants: Vec<String>) -> Vec<String> {
    const ORDER: &[&str] = &["none", "minimal", "low", "medium", "high", "xhigh", "max"];
    variants.sort_by_key(|variant| {
        ORDER
            .iter()
            .position(|candidate| candidate == variant)
            .unwrap_or(ORDER.len())
    });
    variants
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
        self.map_complete_frames();
        if self.events.len() >= MAX_PENDING_AGENT_EVENTS {
            return;
        }
        if self.event_stream.is_none() {
            self.map_remaining_buffer();
            return;
        }
        loop {
            let next = self
                .event_stream
                .as_mut()
                .and_then(|stream| stream.next().now_or_never());
            match next {
                Some(Some(Ok(chunk))) => {
                    if self.event_buffer.len().saturating_add(chunk.len()) > MAX_SSE_BUFFER_BYTES {
                        self.event_buffer.clear();
                        self.events.push(crate::AgentEvent::Error {
                            session_id: self.event_session_id.clone(),
                            message: "OpenCode SSE buffer limit exceeded".into(),
                        });
                        self.event_stream = None;
                        break;
                    }
                    self.event_buffer.extend_from_slice(&chunk);
                    self.map_complete_frames();
                    if self.events.len() >= MAX_PENDING_AGENT_EVENTS {
                        break;
                    }
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
                    self.event_stream = None;
                    self.map_remaining_buffer();
                    break;
                }
                None => break,
            }
        }
    }

    fn map_complete_frames(&mut self) {
        while self.events.len() < MAX_PENDING_AGENT_EVENTS {
            let Some(end) = sse_frame_end(&self.event_buffer) else {
                break;
            };
            let frame = self.event_buffer.drain(..end).collect::<Vec<_>>();
            let session_id = self.event_session_id.clone().unwrap_or_default();
            self.map_events(&session_id, &String::from_utf8_lossy(&frame));
        }
    }

    fn map_remaining_buffer(&mut self) {
        if self.event_buffer.is_empty() || self.events.len() >= MAX_PENDING_AGENT_EVENTS {
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

    struct OversizedEventFake;

    #[async_trait]
    impl OpenCodeTransport for OversizedEventFake {
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
            Ok((
                200,
                Box::pin(stream::iter(vec![Ok(vec![b'x'; 1024 * 1024 + 1])])),
            ))
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
            mcp_allow_list: Vec::new(),
            skills_snapshot: Vec::new(),
        }
    }

    #[test]
    fn provider_control_uses_typed_config_endpoints_without_secret_fields() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let fake = Fake {
            calls: calls.clone(),
            responses: vec![
                TransportResponse { status: 200, body: String::new() },
                TransportResponse { status: 200, body: String::new() },
                TransportResponse { status: 200, body: String::new() },
                TransportResponse { status: 200, body: String::new() },
                TransportResponse { status: 200, body: String::new() },
                TransportResponse { status: 200, body: r#"{"model":"cloud/model"}"#.into() },
                TransportResponse {
                    status: 200,
                    body: r#"{"providers":[{"id":"opencode","models":{}},{"id":"cloud","name":"Cloud","models":{"model":{"name":"Model","variants":{"high":{},"low":{}},"limit":{"context":131072}}}}]}"#.into(),
                },
            ],
        };
        let mut control = OpenCodeProviderControl::new(fake, "http://x/", "u", "p");

        let providers = block_on(control.list_providers()).unwrap();
        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].id, "cloud");
        assert_eq!(providers[0].models[0].variants, vec!["low", "high"]);
        assert_eq!(providers[0].models[0].context, Some(131072));
        assert_eq!(
            block_on(control.get_default_model()).unwrap().as_deref(),
            Some("cloud/model")
        );
        block_on(control.set_default_model("cloud/model")).unwrap();
        block_on(control.add_custom_provider(CustomProviderRequest {
            id: "research".into(),
            name: "Research".into(),
            npm: "@ai-sdk/openai-compatible".into(),
            base_url: "https://models.example.test/v1".into(),
            models: vec!["model-a".into()],
            contexts: std::collections::BTreeMap::from([("model-a".into(), 131072)]),
        }))
        .unwrap();
        block_on(control.remove_custom_provider("research")).unwrap();

        let calls = calls.lock().unwrap();
        assert_eq!(calls[0].url, "http://x/config/providers");
        assert_eq!(calls[1].url, "http://x/global/config");
        assert_eq!(calls[2].body.as_deref(), Some(r#"{"model":"cloud/model"}"#));
        assert_eq!(
            calls[3].body.as_deref(),
            Some(r#"{"provider":{"research":{"models":null}}}"#)
        );
        let add_body = calls[4].body.as_deref().unwrap();
        assert!(add_body.contains("https://models.example.test/v1"));
        assert!(add_body.contains("131072"));
        assert!(!add_body.contains("apiKey"));
        assert_eq!(
            calls[5].body.as_deref(),
            Some(r#"{"provider":{"research":null}}"#)
        );
        assert!(calls
            .iter()
            .all(|call| call.headers.iter().any(|(_, value)| value == "Basic dTpw")));
    }

    #[test]
    fn provider_control_normalizes_catalog_and_custom_ids_without_raw_dtos() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let fake = Fake {
            calls: calls.clone(),
            responses: vec![
                TransportResponse {
                    status: 200,
                    body: r#"{"provider":{"research":{"name":"Research","npm":"@ai-sdk/openai-compatible","options":{"baseURL":"https://research.test/v1"}},"cloud":{"name":"Cloud"}}}"#.into(),
                },
                TransportResponse {
                    status: 200,
                    body: r#"{"all":[{"id":"cloud","name":"Cloud","env":["CLOUD_KEY"]}],"connected":["cloud"]}"#.into(),
                },
            ],
        };
        let mut control = OpenCodeProviderControl::new(fake, "http://x/", "u", "p");

        let catalog = block_on(control.list_provider_catalog()).unwrap();
        assert_eq!(catalog.all[0].id, "cloud");
        assert_eq!(catalog.connected, vec!["cloud"]);
        assert_eq!(
            block_on(control.list_custom_provider_ids()).unwrap(),
            vec!["research"]
        );

        let calls = calls.lock().unwrap();
        assert_eq!(calls[0].url, "http://x/provider");
        assert_eq!(calls[1].url, "http://x/global/config");
        assert!(calls.iter().all(|call| !call
            .body
            .as_deref()
            .unwrap_or_default()
            .contains("apiKey")));
    }

    #[test]
    fn provider_region_control_parses_and_patches_typed_config() {
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
                    body: r#"{"provider":{"amazon-bedrock":{"options":{"region":"eu-west-1"}}}}"#
                        .into(),
                },
            ],
        };
        let mut control = OpenCodeProviderControl::new(fake, "http://x/", "u", "p");

        assert_eq!(
            block_on(control.get_provider_region("amazon-bedrock"))
                .unwrap()
                .as_deref(),
            Some("eu-west-1")
        );
        block_on(control.set_provider_region("amazon-bedrock", "eu-central-1")).unwrap();

        let calls = calls.lock().unwrap();
        assert_eq!(calls[0].method, "GET");
        assert_eq!(calls[0].url, "http://x/global/config");
        assert_eq!(calls[1].method, "PATCH");
        assert_eq!(
            calls[1].body.as_deref(),
            Some(r#"{"provider":{"amazon-bedrock":{"options":{"region":"eu-central-1"}}}}"#)
        );
        assert!(calls
            .iter()
            .all(|call| call.headers.iter().any(|(_, value)| value == "Basic dTpw")));
        assert!(!calls[1].body.as_deref().unwrap().contains("Authorization"));
    }

    #[test]
    fn provider_region_control_rejects_error_status() {
        let fake = Fake {
            calls: Arc::new(Mutex::new(Vec::new())),
            responses: vec![TransportResponse {
                status: 500,
                body: "upstream failed".into(),
            }],
        };
        let mut control = OpenCodeProviderControl::new(fake, "http://x/", "u", "p");

        let error = block_on(control.get_provider_region("amazon-bedrock")).unwrap_err();
        assert!(error.to_string().contains("provider-region/get"));
    }

    #[test]
    fn provider_maintenance_clears_only_legacy_blind_context_limits() {
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
                    body: r#"{"provider":{"research":{"npm":"@ai-sdk/openai-compatible","options":{"baseURL":"https://models.test/v1"},"models":{"blind":{"name":"Blind","limit":{"context":128000,"output":0}},"probed":{"name":"Probed","limit":{"context":131072,"output":4096}},"unlimited":{"name":"Unlimited"}}},"builtin":{"models":{"model":{"limit":{"context":128000,"output":0}}}}}}"#.into(),
                },
            ],
        };
        let mut control = OpenCodeProviderControl::new(fake, "http://x/", "u", "p");

        block_on(control.clear_default_custom_model_context_limits()).unwrap();

        let calls = calls.lock().unwrap();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].method, "GET");
        assert_eq!(calls[0].url, "http://x/global/config");
        assert_eq!(calls[1].method, "PATCH");
        assert_eq!(calls[1].url, "http://x/global/config");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(calls[1].body.as_deref().unwrap()).unwrap(),
            json!({
                "provider": {
                    "research": {
                        "models": {
                            "blind": {"limit": {"context": 0, "output": 0}}
                        }
                    }
                }
            })
        );
    }

    #[test]
    fn provider_maintenance_context_cleanup_is_a_noop_after_normalization() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let fake = Fake {
            calls: calls.clone(),
            responses: vec![TransportResponse {
                status: 200,
                body: r#"{"provider":{"research":{"npm":"@ai-sdk/openai-compatible","models":{"reset":{"limit":{"context":0,"output":0}},"probed":{"limit":{"context":131072,"output":4096}}}}}}"#.into(),
            }],
        };
        let mut control = OpenCodeProviderControl::new(fake, "http://x/", "u", "p");

        block_on(control.clear_default_custom_model_context_limits()).unwrap();

        let calls = calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].method, "GET");
    }

    #[test]
    fn provider_maintenance_removes_legacy_provider_entries_in_one_patch() {
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
                    body: r#"{"provider":{"sub2api":{"models":{}},"sub2api-40":{"models":{}},"zerowall-40":{"models":{}},"research":{"models":{}}}}"#.into(),
                },
            ],
        };
        let mut control = OpenCodeProviderControl::new(fake, "http://x/", "u", "p");

        block_on(control.remove_legacy_provider_entries()).unwrap();

        let calls = calls.lock().unwrap();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].method, "GET");
        assert_eq!(calls[1].method, "PATCH");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(calls[1].body.as_deref().unwrap()).unwrap(),
            json!({"provider": {"sub2api": null, "sub2api-40": null}})
        );
    }

    #[test]
    fn provider_maintenance_legacy_cleanup_is_a_noop_without_legacy_entries() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let fake = Fake {
            calls: calls.clone(),
            responses: vec![TransportResponse {
                status: 200,
                body: r#"{"provider":{"zerowall-40":{"models":{}},"research":{"models":{}}}}"#
                    .into(),
            }],
        };
        let mut control = OpenCodeProviderControl::new(fake, "http://x/", "u", "p");

        block_on(control.remove_legacy_provider_entries()).unwrap();

        let calls = calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].method, "GET");
    }

    #[test]
    fn provider_maintenance_backfills_image_capability_for_custom_models() {
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
                    body: r#"{"provider":{"research":{"options":{"baseURL":"https://models.test/v1"},"models":{"legacy":{"name":"Legacy"},"partial":{"attachment":true,"modalities":{"input":["text"],"output":["text","json"]}},"ready":{"attachment":true,"modalities":{"input":["text","image"],"output":["text"]}}}},"builtin":{"models":{"legacy":{"name":"Do not touch"}}}}}"#.into(),
                },
            ],
        };
        let mut control = OpenCodeProviderControl::new(fake, "http://x/", "u", "p");

        block_on(control.ensure_custom_providers_image_capable()).unwrap();

        let calls = calls.lock().unwrap();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].method, "GET");
        assert_eq!(calls[1].method, "PATCH");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(calls[1].body.as_deref().unwrap()).unwrap(),
            json!({
                "provider": {
                    "research": {
                        "models": {
                            "legacy": {
                                "attachment": true,
                                "modalities": {"input": ["text", "image"], "output": ["text"]}
                            },
                            "partial": {
                                "attachment": true,
                                "modalities": {"input": ["text", "image"], "output": ["text", "json"]}
                            }
                        }
                    }
                }
            })
        );
    }

    #[test]
    fn provider_maintenance_image_backfill_is_a_noop_when_models_are_ready() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let fake = Fake {
            calls: calls.clone(),
            responses: vec![TransportResponse {
                status: 200,
                body: r#"{"provider":{"research":{"npm":"@ai-sdk/openai-compatible","models":{"ready":{"attachment":true,"modalities":{"input":["text","image"],"output":["text"]}}}}}}"#.into(),
            }],
        };
        let mut control = OpenCodeProviderControl::new(fake, "http://x/", "u", "p");

        block_on(control.ensure_custom_providers_image_capable()).unwrap();

        let calls = calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].method, "GET");
    }

    #[test]
    fn mcp_control_owns_status_config_and_mutation_transport() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let fake = Fake {
            calls: calls.clone(),
            responses: vec![
                TransportResponse { status: 200, body: String::new() },
                TransportResponse { status: 200, body: String::new() },
                TransportResponse {
                    status: 200,
                    body: r#"{"mcp":{"papers":{"type":"local","command":["python","-m","papers"],"enabled":true,"environment":{"EXISTING":"value","PAPERS_API_KEY":"secret-value"}}}}"#.into(),
                },
                TransportResponse { status: 200, body: String::new() },
                TransportResponse { status: 200, body: String::new() },
                TransportResponse {
                    status: 200,
                    body: r#"{"mcp":{"papers":{"type":"local","command":["python","-m","papers"],"enabled":true,"environment":{"EXISTING":"value"}}}}"#.into(),
                },
                TransportResponse { status: 200, body: String::new() },
                TransportResponse {
                    status: 200,
                    body: r#"{"mcp":{"papers":{"type":"local","command":["python","-m","papers"],"enabled":true,"environment":{"EXISTING":"value","PAPERS_API_KEY":"secret-value"}}}}"#.into(),
                },
                TransportResponse {
                    status: 200,
                    body: r#"{"papers":{"status":"connected"}}"#.into(),
                },
            ],
        };
        let mut control = OpenCodeMcpControl::new(fake, "http://x/", "u", "p");

        let servers = block_on(control.list_mcp_servers()).unwrap();
        assert_eq!(servers[0].name, "papers");
        assert_eq!(servers[0].status, "connected");
        let public_json = serde_json::to_string(&servers).unwrap();
        assert!(public_json.contains("EXISTING"));
        assert!(!public_json.contains("PAPERS_API_KEY"));
        assert!(!public_json.contains("secret-value"));
        block_on(control.add_mcp_server(McpServerRequest {
            name: "papers".into(),
            config: McpConfig::Local {
                command: vec!["python".into(), "-m".into(), "papers".into()],
                enabled: Some(true),
                environment: BTreeMap::new(),
            },
        }))
        .unwrap();
        block_on(control.reconnect_mcp_server("papers")).unwrap();
        block_on(control.ensure_mcp_environment(
            "papers",
            BTreeMap::from([("SAFE_MODE".into(), "true".into())]),
        ))
        .unwrap();
        block_on(control.remove_mcp_server("papers")).unwrap();

        let calls = calls.lock().unwrap();
        assert_eq!(calls[0].url, "http://x/mcp");
        assert_eq!(calls[1].url, "http://x/global/config");
        assert!(calls
            .iter()
            .all(|call| call.headers.iter().any(|(_, value)| value == "Basic dTpw")));
        assert_eq!(
            calls.last().and_then(|call| call.body.as_deref()),
            Some(r#"{"mcp":{"papers":null}}"#)
        );
        assert!(calls.iter().all(|call| !call
            .body
            .as_deref()
            .unwrap_or_default()
            .contains("Authorization")));
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
    fn sse_mapping_stops_at_the_pending_event_capacity() {
        let fake = Fake {
            calls: Arc::new(Mutex::new(Vec::new())),
            responses: Vec::new(),
        };
        let mut driver = OpenCodeDriver::new(fake, "http://x", "u", "p", binding());
        driver.event_session_id = Some("s1".into());
        driver.event_buffer = (0..300)
            .map(|index| {
                format!(
                    "data: {{\"type\":\"text.updated\",\"properties\":{{\"sessionID\":\"s1\",\"delta\":\"{index}\"}}}}\n\n"
                )
            })
            .collect::<String>()
            .into_bytes();

        driver.map_complete_frames();

        assert_eq!(driver.take_events().len(), 256);
        assert!(!driver.event_buffer.is_empty());
        driver.map_complete_frames();
        assert_eq!(driver.take_events().len(), 44);
        assert!(driver.event_buffer.is_empty());
    }

    #[test]
    fn oversized_sse_frame_fails_closed_without_retaining_the_payload() {
        let mut driver = OpenCodeDriver::new(OversizedEventFake, "http://x", "u", "p", binding());
        block_on(driver.prompt(PromptRequest {
            session_id: "s1".into(),
            prompt: "hello".into(),
            attachments: Vec::new(),
        }))
        .unwrap();

        let events = driver.drain_events();

        assert!(events.iter().any(|event| matches!(
            event,
            crate::AgentEvent::Error { message, .. } if message.contains("SSE buffer limit")
        )));
        assert!(driver.event_buffer.is_empty());
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
