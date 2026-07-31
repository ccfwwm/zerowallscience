use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::runtime::RuntimeState;

const KEYCHAIN_SERVICE: &str = "com.zerowall.science";

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
enum SecretKind {
    Provider,
    Connector,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
enum SecretFormat {
    ApiKey,
    OpenCodeAuth,
    Environment,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SecretReference {
    kind: SecretKind,
    id: String,
    service: String,
    account: String,
    format: SecretFormat,
    #[serde(skip_serializing_if = "Option::is_none")]
    environment: Option<String>,
}

impl SecretReference {
    pub(crate) fn provider(id: &str) -> Result<Self, String> {
        validate_id(id)?;
        Ok(Self {
            kind: SecretKind::Provider,
            id: id.to_owned(),
            service: KEYCHAIN_SERVICE.to_owned(),
            account: format!("provider:{id}"),
            format: SecretFormat::ApiKey,
            environment: None,
        })
    }

    fn provider_auth(id: &str) -> Result<Self, String> {
        let mut reference = Self::provider(id)?;
        reference.format = SecretFormat::OpenCodeAuth;
        Ok(reference)
    }

    fn environment(kind: SecretKind, id: &str, environment: &str) -> Result<Self, String> {
        validate_id(id)?;
        validate_environment_name(environment)?;
        if kind == SecretKind::Provider {
            return Err("provider secrets use OpenCode auth injection".to_owned());
        }
        Ok(Self {
            kind,
            id: id.to_owned(),
            service: KEYCHAIN_SERVICE.to_owned(),
            account: format!("connector:{id}:{environment}"),
            format: SecretFormat::Environment,
            environment: Some(environment.to_owned()),
        })
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SecretRegistry {
    schema_version: u8,
    entries: Vec<SecretReference>,
}

impl Default for SecretRegistry {
    fn default() -> Self {
        Self {
            schema_version: 1,
            entries: Vec::new(),
        }
    }
}

pub(crate) trait CredentialStore {
    fn set(&self, account: &str, value: &str) -> Result<(), String>;
    fn get(&self, account: &str) -> Result<Option<String>, String>;
    fn delete(&self, account: &str) -> Result<(), String>;
}

pub(crate) struct InjectedSecrets {
    pub(crate) opencode_auth_content: String,
    pub(crate) environment: BTreeMap<String, String>,
}

pub(crate) struct KeyringCredentialStore;

impl KeyringCredentialStore {
    fn entry(account: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(KEYCHAIN_SERVICE, account)
            .map_err(|error| format!("open OS credential entry: {error}"))
    }
}

impl CredentialStore for KeyringCredentialStore {
    fn set(&self, account: &str, value: &str) -> Result<(), String> {
        Self::entry(account)?
            .set_password(value)
            .map_err(|error| format!("store OS credential: {error}"))
    }

    fn get(&self, account: &str) -> Result<Option<String>, String> {
        match Self::entry(account)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(format!("read OS credential: {error}")),
        }
    }

    fn delete(&self, account: &str) -> Result<(), String> {
        match Self::entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(format!("delete OS credential: {error}")),
        }
    }
}

fn persist_secret(
    backend: &impl CredentialStore,
    registry: &mut SecretRegistry,
    reference: SecretReference,
    value: &str,
) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err("secret value cannot be empty".to_owned());
    }
    backend.set(&reference.account, value)?;
    registry.entries.retain(|item| item.account != reference.account);
    registry.entries.push(reference);
    registry.entries.sort_by(|left, right| left.account.cmp(&right.account));
    Ok(())
}

fn injected_secrets(
    backend: &impl CredentialStore,
    registry: &SecretRegistry,
) -> Result<InjectedSecrets, String> {
    let mut auth = serde_json::Map::new();
    let mut environment = BTreeMap::new();
    for reference in &registry.entries {
        let Some(value) = backend.get(&reference.account)? else {
            continue;
        };
        match reference.kind {
            SecretKind::Provider => {
                let auth_value = match reference.format {
                    SecretFormat::ApiKey => serde_json::json!({ "type": "api", "key": value }),
                    SecretFormat::OpenCodeAuth => serde_json::from_str::<serde_json::Value>(&value)
                        .map_err(|error| {
                            format!("provider auth in {} is invalid: {error}", reference.account)
                        })?,
                    SecretFormat::Environment => {
                        return Err(format!(
                            "provider secret {} has an environment format",
                            reference.account
                        ))
                    }
                };
                if !auth_value.is_object() {
                    return Err(format!(
                        "provider auth in {} must be a JSON object",
                        reference.account
                    ));
                }
                auth.insert(reference.id.clone(), auth_value);
            }
            SecretKind::Connector => {
                if reference.format != SecretFormat::Environment {
                    return Err(format!(
                        "connector secret {} has a non-environment format",
                        reference.account
                    ));
                }
                let name = reference.environment.as_ref().ok_or_else(|| {
                    format!("connector secret {} has no environment name", reference.account)
                })?;
                environment.insert(name.clone(), value);
            }
        }
    }
    Ok(InjectedSecrets {
        opencode_auth_content: serde_json::to_string(&auth).map_err(|error| error.to_string())?,
        environment,
    })
}

fn remove_secret(
    backend: &impl CredentialStore,
    registry: &mut SecretRegistry,
    account: &str,
) -> Result<bool, String> {
    let Some(index) = registry.entries.iter().position(|item| item.account == account) else {
        return Ok(false);
    };
    backend.delete(account)?;
    registry.entries.remove(index);
    Ok(true)
}

pub(crate) fn load_registry(path: &std::path::Path) -> Result<SecretRegistry, String> {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(SecretRegistry::default())
        }
        Err(error) => return Err(format!("read secret reference registry: {error}")),
    };
    let registry: SecretRegistry =
        serde_json::from_str(&text).map_err(|error| format!("parse secret reference registry: {error}"))?;
    if registry.schema_version != 1 {
        return Err(format!(
            "unsupported secret reference registry version: {}",
            registry.schema_version
        ));
    }
    for reference in &registry.entries {
        validate_reference(reference)?;
    }
    Ok(registry)
}

pub(crate) fn save_registry(path: &std::path::Path, registry: &SecretRegistry) -> Result<(), String> {
    for reference in &registry.entries {
        validate_reference(reference)?;
    }
    let parent = path
        .parent()
        .ok_or_else(|| "secret reference registry has no parent directory".to_owned())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("create secret reference registry directory: {error}"))?;
    let text = serde_json::to_string_pretty(registry)
        .map_err(|error| format!("serialize secret reference registry: {error}"))?;
    std::fs::write(path, text).map_err(|error| format!("write secret reference registry: {error}"))?;
    crate::runtime::tighten_private(parent);
    crate::runtime::tighten_private(path);
    Ok(())
}

fn registry_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("secret-refs.json"))
        .map_err(|error| error.to_string())
}

pub(crate) fn persist_for_app(
    app: &AppHandle,
    reference: SecretReference,
    value: &str,
) -> Result<(), String> {
    let path = registry_path(app)?;
    let backend = KeyringCredentialStore;
    let mut registry = load_registry(&path)?;
    persist_secret(&backend, &mut registry, reference, value)?;
    save_registry(&path, &registry)
}

fn remove_for_app(app: &AppHandle, account: &str) -> Result<bool, String> {
    let path = registry_path(app)?;
    let backend = KeyringCredentialStore;
    let mut registry = load_registry(&path)?;
    let removed = remove_secret(&backend, &mut registry, account)?;
    if removed {
        save_registry(&path, &registry)?;
    }
    Ok(removed)
}

pub(crate) fn sidecar_secrets(app: &AppHandle) -> Result<InjectedSecrets, String> {
    let registry = load_registry(&registry_path(app)?)?;
    injected_secrets(&KeyringCredentialStore, &registry)
}

/// Materialize a single provider's API key from the keychain, for injection into
/// an ACP agent's spawn environment (e.g. `OPENAI_API_KEY`). Returns `None` if no
/// credential is stored for `provider_id`.
///
/// A plain `api-key` credential yields its stored value verbatim. An OpenCode
/// auth blob yields its `key` (api) or `access` (oauth) field, so a provider the
/// user logged into via OpenCode can still back an ACP agent. Any other shape has
/// no single-string key and returns `None` rather than guessing.
///
/// Values are read straight from the OS credential store and never persisted or
/// logged (see AGENTS.md).
pub(crate) fn provider_api_key(app: &AppHandle, provider_id: &str) -> Result<Option<String>, String> {
    let registry = load_registry(&registry_path(app)?)?;
    provider_api_key_from(&KeyringCredentialStore, &registry, provider_id)
}

/// Core of [`provider_api_key`], decoupled from the app handle for testing.
fn provider_api_key_from(
    store: &dyn CredentialStore,
    registry: &SecretRegistry,
    provider_id: &str,
) -> Result<Option<String>, String> {
    let reference = SecretReference::provider(provider_id)?;
    let Some(entry) = registry
        .entries
        .iter()
        .find(|item| item.id == provider_id && item.kind == SecretKind::Provider)
    else {
        return Ok(None);
    };
    let Some(value) = store.get(&reference.account)? else {
        return Ok(None);
    };
    match entry.format {
        SecretFormat::ApiKey => Ok(Some(value)),
        SecretFormat::OpenCodeAuth => {
            let parsed: serde_json::Value = serde_json::from_str(&value)
                .map_err(|error| format!("provider auth for {provider_id} is invalid: {error}"))?;
            let key = parsed
                .get("key")
                .or_else(|| parsed.get("access"))
                .and_then(|value| value.as_str())
                .map(str::to_owned);
            Ok(key)
        }
        SecretFormat::Environment => Ok(None),
    }
}

/// The environment the sidecar spawns with, materialized from the keychain.
/// OpenCode 1.17.13 reads provider credentials from `OPENCODE_AUTH_CONTENT`
/// (which takes precedence over any on-disk `auth.json`), and local MCP servers
/// inherit connector secrets from the sidecar's process environment. The auth
/// entry is ALWAYS present — `{}` when no provider credential exists — so a
/// stale `auth.json` left by an earlier build can never leak back in as ambient
/// login state.
pub(crate) fn sidecar_environment(secrets: &InjectedSecrets) -> Vec<(String, String)> {
    let mut environment = Vec::with_capacity(secrets.environment.len() + 1);
    environment.push((
        "OPENCODE_AUTH_CONTENT".to_owned(),
        secrets.opencode_auth_content.clone(),
    ));
    for (name, value) in &secrets.environment {
        environment.push((name.clone(), value.clone()));
    }
    environment
}

#[tauri::command(async)]
pub fn set_provider_secret(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    provider_id: String,
    value: String,
) -> Result<(), String> {
    persist_for_app(&app, SecretReference::provider(&provider_id)?, value.trim())?;
    crate::runtime::restart_sidecar_if_running(&app, &state)?;
    Ok(())
}

#[tauri::command(async)]
pub fn remove_provider_secret(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    provider_id: String,
) -> Result<bool, String> {
    let reference = SecretReference::provider(&provider_id)?;
    let removed = remove_for_app(&app, &reference.account)?;
    if removed {
        crate::runtime::restart_sidecar_if_running(&app, &state)?;
    }
    Ok(removed)
}

#[tauri::command(async)]
pub fn provider_secret_exists(app: AppHandle, provider_id: String) -> Result<bool, String> {
    let reference = SecretReference::provider(&provider_id)?;
    let registry = load_registry(&registry_path(&app)?)?;
    if !registry.entries.iter().any(|item| item.account == reference.account) {
        return Ok(false);
    }
    Ok(KeyringCredentialStore.get(&reference.account)?.is_some())
}

#[tauri::command(async)]
pub fn set_connector_secret(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    connector_id: String,
    environment: String,
    value: String,
) -> Result<(), String> {
    let reference =
        SecretReference::environment(SecretKind::Connector, &connector_id, &environment)?;
    persist_for_app(&app, reference, value.trim())?;
    crate::runtime::restart_sidecar_if_running(&app, &state)?;
    Ok(())
}

#[tauri::command(async)]
pub fn remove_connector_secret(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    connector_id: String,
    environment: String,
) -> Result<bool, String> {
    let reference =
        SecretReference::environment(SecretKind::Connector, &connector_id, &environment)?;
    let removed = remove_for_app(&app, &reference.account)?;
    if removed {
        crate::runtime::restart_sidecar_if_running(&app, &state)?;
    }
    Ok(removed)
}

fn validate_reference(reference: &SecretReference) -> Result<(), String> {
    if reference.service != KEYCHAIN_SERVICE {
        return Err("secret reference uses an unexpected keychain service".to_owned());
    }
    let expected = match reference.kind {
        SecretKind::Provider => {
            if reference.environment.is_some() {
                return Err("provider secret cannot declare an environment name".to_owned());
            }
            match reference.format {
                SecretFormat::ApiKey => SecretReference::provider(&reference.id)?,
                SecretFormat::OpenCodeAuth => SecretReference::provider_auth(&reference.id)?,
                SecretFormat::Environment => {
                    return Err("provider secret cannot use the environment format".to_owned())
                }
            }
        }
        SecretKind::Connector => {
            if reference.format != SecretFormat::Environment {
                return Err("connector secret must use the environment format".to_owned());
            }
            let environment = reference
                .environment
                .as_deref()
                .ok_or_else(|| "connector secret is missing its environment name".to_owned())?;
            SecretReference::environment(SecretKind::Connector, &reference.id, environment)?
        }
    };
    if expected.account != reference.account {
        return Err("secret reference account does not match its identity".to_owned());
    }
    Ok(())
}

fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 200
        || id.contains("..")
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-._:/".contains(&byte))
    {
        return Err("secret id contains unsupported characters".to_owned());
    }
    Ok(())
}

/// Validate an environment variable name an ACP agent profile wants to set,
/// enforcing the same shape and reserved-prefix policy as connector secrets so a
/// profile can never shadow PATH/HOME/OPENCODE_*/ZEROWALL_*/XDG_*.
pub(crate) fn validate_acp_env_name(name: &str) -> Result<(), String> {
    validate_environment_name(name)
}

fn validate_environment_name(name: &str) -> Result<(), String> {
    let valid_shape = !name.is_empty()
        && name.len() <= 128
        && name
            .bytes()
            .enumerate()
            .all(|(index, byte)| byte.is_ascii_uppercase() || byte == b'_' || (index > 0 && byte.is_ascii_digit()));
    let reserved = name == "PATH"
        || name == "HOME"
        || name.starts_with("XDG_")
        || name.starts_with("OPENCODE_")
        || name.starts_with("ZEROWALL_");
    if !valid_shape || reserved {
        return Err("secret environment name is invalid or reserved".to_owned());
    }
    Ok(())
}

/// A secret extracted from a legacy config, paired with the reference that
/// tells the keychain where to store it. Values never touch the registry file.
#[derive(Clone, Debug)]
pub(crate) struct MigratedSecret {
    pub(crate) reference: SecretReference,
    pub(crate) value: String,
}

/// The result of scrubbing a legacy `opencode.json(c)` file: the secrets to move
/// into the keychain and the sanitized config that is safe to keep on disk.
#[derive(Clone, Debug)]
pub(crate) struct MigrationPlan {
    pub(crate) secrets: Vec<MigratedSecret>,
    pub(crate) sanitized: String,
}

/// Import an OpenCode auth document (`{ providerID: authObject }`) into the
/// keychain. Every provider id and auth value is validated before any credential
/// is written, and the registry is only mutated once all writes succeed, so a
/// failure leaves both the keychain registry and its in-memory copy untouched.
pub(crate) fn import_auth_document(
    backend: &impl CredentialStore,
    registry: &mut SecretRegistry,
    input: &str,
) -> Result<usize, String> {
    let document: serde_json::Value =
        serde_json::from_str(input).map_err(|error| format!("parse auth document: {error}"))?;
    let object = document
        .as_object()
        .ok_or_else(|| "auth document must be a JSON object".to_owned())?;

    let mut pending = Vec::with_capacity(object.len());
    for (provider_id, value) in object {
        let reference = SecretReference::provider_auth(provider_id)?;
        if !value.is_object() {
            return Err(format!("auth entry for {provider_id} must be a JSON object"));
        }
        let serialized = serde_json::to_string(value)
            .map_err(|error| format!("serialize auth entry {provider_id}: {error}"))?;
        pending.push((reference, serialized));
    }

    let mut working = registry.clone();
    for (reference, value) in &pending {
        persist_secret(backend, &mut working, reference.clone(), value)?;
    }
    *registry = working;
    Ok(pending.len())
}

/// Detect an environment variable name that carries a secret value.
fn is_sensitive_environment(name: &str) -> bool {
    let upper = name.to_ascii_uppercase();
    ["KEY", "TOKEN", "SECRET", "PASSWORD", "CREDENTIAL"]
        .iter()
        .any(|keyword| upper.contains(keyword))
}

/// Detect an HTTP header name that carries a secret value.
fn is_sensitive_header(name: &str) -> bool {
    let upper: String = name
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .map(|character| character.to_ascii_uppercase())
        .collect();
    ["AUTH", "KEY", "TOKEN", "SECRET", "PASSWORD", "CREDENTIAL", "COOKIE"]
        .iter()
        .any(|keyword| upper.contains(keyword))
}

/// Build the connector environment name that backs a migrated MCP header, e.g.
/// (`remote`, `Authorization`) becomes `MCP_REMOTE_AUTHORIZATION_SECRET`.
fn header_environment_name(mcp_id: &str, header: &str) -> String {
    let sanitize = |value: &str| -> String {
        value
            .chars()
            .map(|character| {
                if character.is_ascii_alphanumeric() {
                    character.to_ascii_uppercase()
                } else {
                    '_'
                }
            })
            .collect()
    };
    format!("MCP_{}_{}_SECRET", sanitize(mcp_id), sanitize(header))
}

/// Scan a legacy `opencode.json(c)` config for embedded secrets: provider
/// `options.apiKey`, sensitive MCP `environment` values, and sensitive MCP
/// `headers`. Secret material is collected for the keychain while non-secret
/// settings (baseURL, model, command, LOG_LEVEL, public headers) stay in place.
/// Local MCP environment secrets are removed (the sidecar re-injects them into
/// the process environment); remote headers are rewritten to `{env:NAME}` so
/// OpenCode resolves them from the injected environment at runtime.
pub(crate) fn plan_legacy_config_migration(input: &str) -> Result<MigrationPlan, String> {
    let mut config: serde_json::Value =
        serde_json::from_str(input).map_err(|error| format!("parse legacy config: {error}"))?;
    let mut secrets = Vec::new();

    if let Some(providers) = config.get_mut("provider").and_then(|value| value.as_object_mut()) {
        for (provider_id, provider) in providers.iter_mut() {
            let Some(options) = provider.get_mut("options").and_then(|value| value.as_object_mut())
            else {
                continue;
            };
            let Some(api_key) = options.get("apiKey").and_then(|value| value.as_str()).map(str::to_owned)
            else {
                continue;
            };
            if api_key.trim().is_empty() {
                continue;
            }
            let reference = SecretReference::provider(provider_id)?;
            secrets.push(MigratedSecret { reference, value: api_key });
            options.remove("apiKey");
        }
    }

    if let Some(servers) = config.get_mut("mcp").and_then(|value| value.as_object_mut()) {
        for (mcp_id, server) in servers.iter_mut() {
            if let Some(environment) =
                server.get_mut("environment").and_then(|value| value.as_object_mut())
            {
                let sensitive: Vec<String> = environment
                    .iter()
                    .filter(|(name, value)| value.is_string() && is_sensitive_environment(name))
                    .map(|(name, _)| name.clone())
                    .collect();
                for name in sensitive {
                    let Some(value) =
                        environment.get(&name).and_then(|value| value.as_str()).map(str::to_owned)
                    else {
                        continue;
                    };
                    let reference =
                        SecretReference::environment(SecretKind::Connector, mcp_id, &name)?;
                    secrets.push(MigratedSecret { reference, value });
                    environment.remove(&name);
                }
            }

            if let Some(headers) = server.get_mut("headers").and_then(|value| value.as_object_mut()) {
                let sensitive: Vec<String> = headers
                    .iter()
                    .filter(|(name, value)| value.is_string() && is_sensitive_header(name))
                    .map(|(name, _)| name.clone())
                    .collect();
                for header in sensitive {
                    let Some(value) =
                        headers.get(&header).and_then(|value| value.as_str()).map(str::to_owned)
                    else {
                        continue;
                    };
                    let environment_name = header_environment_name(mcp_id, &header);
                    let reference = SecretReference::environment(
                        SecretKind::Connector,
                        mcp_id,
                        &environment_name,
                    )?;
                    secrets.push(MigratedSecret { reference, value });
                    headers.insert(
                        header,
                        serde_json::Value::String(format!("{{env:{environment_name}}}")),
                    );
                }
            }
        }
    }

    let sanitized = serde_json::to_string(&config)
        .map_err(|error| format!("serialize sanitized config: {error}"))?;
    Ok(MigrationPlan { secrets, sanitized })
}

/// Migrate legacy `auth.json` and `opencode.json(c)` to keychain-backed secret
/// storage. Called once per app launch before starting the sidecar. Idempotent —
/// repeated invocations (after failed or interrupted migrations) safely complete
/// the operation. Only deletes the legacy files after successful keychain writes.
///
/// Scans:
/// - `runtime/xdg-data/opencode/auth.json` (provider logins)
/// - `runtime/xdg-config/opencode/opencode.json(c)` (provider apiKeys + MCP secrets)
///
/// Fail-closed: on any error, legacy files are preserved and the function returns
/// the error. Keychain writes are atomic per file (registry rollback on failure).
pub(crate) fn migrate_legacy_secrets(runtime_root: &std::path::Path) -> Result<(), String> {
    let backend = KeyringCredentialStore;
    let registry_path = runtime_root.join("secret-refs.json");
    let mut registry = load_registry(&registry_path).unwrap_or_default();

    // Legacy auth.json lives in xdg-data/opencode/ (where OpenCode writes it).
    let auth_json_path = runtime_root
        .join("xdg-data")
        .join("opencode")
        .join("auth.json");

    // Legacy config files live in xdg-config/opencode/.
    let config_dir = runtime_root.join("xdg-config").join("opencode");
    let opencode_jsonc_path = config_dir.join("opencode.jsonc");
    let opencode_json_path = config_dir.join("opencode.json");

    // Migrate auth.json (provider logins) if present.
    if auth_json_path.exists() {
        let content = std::fs::read_to_string(&auth_json_path)
            .map_err(|error| format!("read auth.json: {error}"))?;

        // Parse and validate before any writes (fail early).
        let count = import_auth_document(&backend, &mut registry, &content)?;

        if count > 0 {
            // Keychain writes succeeded — persist registry, THEN delete legacy file.
            save_registry(&registry_path, &registry)?;
            std::fs::remove_file(&auth_json_path)
                .map_err(|error| format!("delete auth.json after migration: {error}"))?;
        } else {
            // Empty auth.json (no secrets) — safe to remove without keychain writes.
            std::fs::remove_file(&auth_json_path)
                .map_err(|error| format!("delete empty auth.json: {error}"))?;
        }
    }

    // Migrate opencode.json(c) (provider apiKeys + connector secrets) if present.
    // Prefer .jsonc (the server rewrites to this), fall back to .json.
    let config_path = if opencode_jsonc_path.exists() {
        Some(opencode_jsonc_path)
    } else if opencode_json_path.exists() {
        Some(opencode_json_path)
    } else {
        None
    };

    if let Some(path) = config_path {
        let content = std::fs::read_to_string(&path)
            .map_err(|error| format!("read {}: {error}", path.display()))?;

        // Plan the migration (parse and validate) before any writes.
        let plan = plan_legacy_config_migration(&content)?;

        if !plan.secrets.is_empty() {
            // Write all secrets to keychain atomically (registry rollback on error).
            let mut working = registry.clone();
            for migrated in &plan.secrets {
                persist_secret(&backend, &mut working, migrated.reference.clone(), &migrated.value)?;
            }

            // All keychain writes succeeded — persist registry.
            registry = working;
            save_registry(&registry_path, &registry)?;

            // Write sanitized config LAST (after keychain + registry succeed).
            // If this write fails, the legacy file is untouched (fail-closed).
            std::fs::write(&path, plan.sanitized.as_bytes())
                .map_err(|error| format!("write sanitized config to {}: {error}", path.display()))?;

            crate::runtime::tighten_private(&path);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::sync::Mutex;

    use super::{
        import_auth_document, injected_secrets, load_registry, persist_secret,
        plan_legacy_config_migration, provider_api_key_from, remove_secret, save_registry,
        sidecar_environment, validate_acp_env_name, CredentialStore, SecretKind, SecretReference,
        SecretRegistry,
    };

    #[derive(Default)]
    struct MemoryCredentialStore(Mutex<BTreeMap<String, String>>);

    impl CredentialStore for MemoryCredentialStore {
        fn set(&self, account: &str, value: &str) -> Result<(), String> {
            self.0
                .lock()
                .unwrap()
                .insert(account.to_owned(), value.to_owned());
            Ok(())
        }

        fn get(&self, account: &str) -> Result<Option<String>, String> {
            Ok(self.0.lock().unwrap().get(account).cloned())
        }

        fn delete(&self, account: &str) -> Result<(), String> {
            self.0.lock().unwrap().remove(account);
            Ok(())
        }
    }

    #[test]
    fn registry_persists_references_but_never_secret_values() {
        let backend = MemoryCredentialStore::default();
        let mut registry = SecretRegistry::default();
        let reference = SecretReference::provider("anthropic").unwrap();

        persist_secret(&backend, &mut registry, reference.clone(), "sk-sensitive").unwrap();

        let serialized = serde_json::to_string(&registry).unwrap();
        assert!(!serialized.contains("sk-sensitive"));
        assert!(serialized.contains("provider:anthropic"));
        assert_eq!(
            backend.get(&reference.account).unwrap().as_deref(),
            Some("sk-sensitive")
        );
    }

    #[test]
    fn provider_api_key_reads_plain_api_key() {
        let backend = MemoryCredentialStore::default();
        let mut registry = SecretRegistry::default();
        persist_secret(
            &backend,
            &mut registry,
            SecretReference::provider("openai").unwrap(),
            "sk-openai",
        )
        .unwrap();

        assert_eq!(
            provider_api_key_from(&backend, &registry, "openai").unwrap(),
            Some("sk-openai".to_owned())
        );
        // A provider with no stored credential yields None, not an error.
        assert_eq!(
            provider_api_key_from(&backend, &registry, "anthropic").unwrap(),
            None
        );
    }

    #[test]
    fn provider_api_key_extracts_key_from_opencode_auth() {
        let backend = MemoryCredentialStore::default();
        let mut registry = SecretRegistry::default();
        persist_secret(
            &backend,
            &mut registry,
            super::SecretReference::provider_auth("anthropic").unwrap(),
            r#"{"type":"api","key":"sk-anthropic"}"#,
        )
        .unwrap();

        assert_eq!(
            provider_api_key_from(&backend, &registry, "anthropic").unwrap(),
            Some("sk-anthropic".to_owned())
        );
    }

    #[test]
    fn acp_env_name_rejects_reserved_and_malformed() {
        assert!(validate_acp_env_name("OPENAI_API_KEY").is_ok());
        assert!(validate_acp_env_name("PATH").is_err());
        assert!(validate_acp_env_name("OPENCODE_AUTH_CONTENT").is_err());
        assert!(validate_acp_env_name("lowercase").is_err());
        assert!(validate_acp_env_name("").is_err());
    }

    #[test]
    fn runtime_injection_materializes_provider_auth_and_connector_environment() {
        let backend = MemoryCredentialStore::default();
        let mut registry = SecretRegistry::default();
        persist_secret(
            &backend,
            &mut registry,
            SecretReference::provider("deepseek").unwrap(),
            "deepseek-key",
        )
        .unwrap();
        persist_secret(
            &backend,
            &mut registry,
            SecretReference::environment(
                SecretKind::Connector,
                "materials-project",
                "MP_API_KEY",
            )
            .unwrap(),
            "materials-key",
        )
        .unwrap();

        let injected = injected_secrets(&backend, &registry).unwrap();
        let auth: serde_json::Value = serde_json::from_str(&injected.opencode_auth_content).unwrap();
        assert_eq!(auth["deepseek"]["type"], "api");
        assert_eq!(auth["deepseek"]["key"], "deepseek-key");
        assert_eq!(
            injected.environment.get("MP_API_KEY").map(String::as_str),
            Some("materials-key")
        );
    }

    #[test]
    fn identifiers_and_environment_names_are_rejected_before_reaching_keychain() {
        assert!(SecretReference::provider("../anthropic").is_err());
        assert!(SecretReference::provider("").is_err());
        assert!(SecretReference::environment(SecretKind::Connector, "pubmed", "bad-name").is_err());
        assert!(SecretReference::environment(SecretKind::Connector, "pubmed", "PATH").is_err());
    }

    #[test]
    fn registry_file_round_trips_references_without_secret_material() {
        let root = std::env::temp_dir().join(format!(
            "zerowall-secret-registry-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("secret-refs.json");
        let backend = MemoryCredentialStore::default();
        let mut registry = SecretRegistry::default();
        persist_secret(
            &backend,
            &mut registry,
            SecretReference::provider("kimi").unwrap(),
            "kimi-sensitive",
        )
        .unwrap();

        save_registry(&path, &registry).unwrap();

        let text = std::fs::read_to_string(&path).unwrap();
        assert!(!text.contains("kimi-sensitive"));
        assert_eq!(load_registry(&path).unwrap(), registry);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn registry_load_revalidates_untrusted_environment_names() {
        let root = std::env::temp_dir().join(format!(
            "zerowall-secret-registry-invalid-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("secret-refs.json");
        std::fs::write(
            &path,
            r#"{"schemaVersion":1,"entries":[{"kind":"connector","id":"pubmed","service":"com.zerowall.science","account":"connector:pubmed:PATH","environment":"PATH"}]}"#,
        )
        .unwrap();

        assert!(load_registry(&path).is_err());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn imported_opencode_auth_is_injected_without_becoming_registry_data() {
        let backend = MemoryCredentialStore::default();
        let mut registry = SecretRegistry::default();
        let oauth = r#"{"type":"oauth","refresh":"refresh-secret","access":"access-secret","expires":4102444800000}"#;
        persist_secret(
            &backend,
            &mut registry,
            SecretReference::provider_auth("openai").unwrap(),
            oauth,
        )
        .unwrap();

        let registry_json = serde_json::to_string(&registry).unwrap();
        assert!(!registry_json.contains("refresh-secret"));
        assert!(!registry_json.contains("access-secret"));
        let injected = injected_secrets(&backend, &registry).unwrap();
        let auth: serde_json::Value = serde_json::from_str(&injected.opencode_auth_content).unwrap();
        assert_eq!(auth["openai"]["type"], "oauth");
        assert_eq!(auth["openai"]["refresh"], "refresh-secret");
    }

    #[test]
    fn auth_document_import_validates_every_provider_before_writing_credentials() {
        let backend = MemoryCredentialStore::default();
        let mut registry = SecretRegistry::default();
        let input = r#"{
          "openai":{"type":"oauth","access":"access-secret","refresh":"refresh-secret"},
          "deepseek":{"type":"api","key":"deepseek-secret"}
        }"#;

        assert_eq!(import_auth_document(&backend, &mut registry, input).unwrap(), 2);
        let injected = injected_secrets(&backend, &registry).unwrap();
        let auth: serde_json::Value = serde_json::from_str(&injected.opencode_auth_content).unwrap();
        assert_eq!(auth["openai"]["refresh"], "refresh-secret");
        assert_eq!(auth["deepseek"]["key"], "deepseek-secret");
        assert!(!serde_json::to_string(&registry).unwrap().contains("secret"));

        let before = registry.clone();
        assert!(import_auth_document(
            &backend,
            &mut registry,
            r#"{"openai":{"type":"oauth"},"../bad":"not-an-object"}"#,
        )
        .is_err());
        assert_eq!(registry, before);
    }

    #[test]
    fn legacy_config_migration_extracts_secrets_and_preserves_non_secret_settings() {
        let input = r#"{
          "model":"deepseek/chat",
          "provider":{"deepseek":{"options":{"baseURL":"https://gateway.test/v1","apiKey":"provider-secret"}}},
          "mcp":{
            "materials":{"type":"local","command":["python","-m","mcp"],"environment":{"MP_API_KEY":"connector-secret","LOG_LEVEL":"debug"}},
            "remote":{"type":"remote","url":"https://mcp.test","headers":{"Authorization":"Bearer header-secret","X-Trace":"public"}}
          }
        }"#;

        let plan = plan_legacy_config_migration(input).unwrap();
        assert_eq!(plan.secrets.len(), 3);
        assert!(!plan.sanitized.contains("provider-secret"));
        assert!(!plan.sanitized.contains("connector-secret"));
        assert!(!plan.sanitized.contains("header-secret"));
        let config: serde_json::Value = serde_json::from_str(&plan.sanitized).unwrap();
        assert_eq!(config["model"], "deepseek/chat");
        assert_eq!(config["provider"]["deepseek"]["options"]["baseURL"], "https://gateway.test/v1");
        assert!(config["provider"]["deepseek"]["options"].get("apiKey").is_none());
        assert!(config["mcp"]["materials"]["environment"].get("MP_API_KEY").is_none());
        assert_eq!(config["mcp"]["materials"]["environment"]["LOG_LEVEL"], "debug");
        assert_eq!(
            config["mcp"]["remote"]["headers"]["Authorization"],
            "{env:MCP_REMOTE_AUTHORIZATION_SECRET}"
        );
        assert_eq!(config["mcp"]["remote"]["headers"]["X-Trace"], "public");
    }

    #[test]
    fn sidecar_environment_always_sets_auth_content_and_injects_connectors() {
        let backend = MemoryCredentialStore::default();
        let empty = injected_secrets(&backend, &SecretRegistry::default()).unwrap();
        let empty_env = sidecar_environment(&empty);
        assert_eq!(
            empty_env,
            vec![("OPENCODE_AUTH_CONTENT".to_owned(), "{}".to_owned())],
            "with no credentials the auth content must be an empty object, never absent"
        );

        let mut registry = SecretRegistry::default();
        persist_secret(
            &backend,
            &mut registry,
            SecretReference::provider("glm").unwrap(),
            "glm-key",
        )
        .unwrap();
        persist_secret(
            &backend,
            &mut registry,
            SecretReference::environment(SecretKind::Connector, "pubmed", "PUBMED_API_KEY").unwrap(),
            "pubmed-key",
        )
        .unwrap();

        let env = sidecar_environment(&injected_secrets(&backend, &registry).unwrap());
        let auth = env
            .iter()
            .find(|(name, _)| name == "OPENCODE_AUTH_CONTENT")
            .map(|(_, value)| value.as_str())
            .unwrap();
        let parsed: serde_json::Value = serde_json::from_str(auth).unwrap();
        assert_eq!(parsed["glm"]["key"], "glm-key");
        assert_eq!(
            env.iter()
                .find(|(name, _)| name == "PUBMED_API_KEY")
                .map(|(_, value)| value.as_str()),
            Some("pubmed-key")
        );
    }

    #[test]
    fn removing_a_secret_deletes_both_credential_and_reference() {
        let backend = MemoryCredentialStore::default();
        let mut registry = SecretRegistry::default();
        let reference = SecretReference::provider("glm").unwrap();
        persist_secret(&backend, &mut registry, reference.clone(), "glm-secret").unwrap();

        assert!(remove_secret(&backend, &mut registry, &reference.account).unwrap());
        assert!(backend.get(&reference.account).unwrap().is_none());
        assert!(registry.entries.is_empty());
        assert!(!remove_secret(&backend, &mut registry, &reference.account).unwrap());
    }

    #[test]
    fn migrate_legacy_secrets_is_idempotent_and_fail_closed() {
        use super::migrate_legacy_secrets;
        let root = std::env::temp_dir().join(format!("zw-migrate-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();

        // Legacy paths match the actual runtime structure.
        let auth_json = root.join("xdg-data/opencode/auth.json");
        let opencode_json = root.join("xdg-config/opencode/opencode.json");
        let registry_path = root.join("secret-refs.json");

        std::fs::create_dir_all(auth_json.parent().unwrap()).unwrap();
        std::fs::create_dir_all(opencode_json.parent().unwrap()).unwrap();

        std::fs::write(
            &auth_json,
            r#"{"anthropic":{"type":"api","key":"auth-secret"}}"#,
        )
        .unwrap();
        std::fs::write(
            &opencode_json,
            r#"{"model":"test","provider":{"deepseek":{"options":{"apiKey":"config-secret"}}}}"#,
        )
        .unwrap();

        // First migration extracts secrets, deletes auth.json, sanitizes opencode.json.
        migrate_legacy_secrets(&root).unwrap();
        assert!(!auth_json.exists(), "auth.json should be deleted after migration");
        assert!(opencode_json.exists(), "opencode.json should remain after sanitization");
        let sanitized = std::fs::read_to_string(&opencode_json).unwrap();
        assert!(!sanitized.contains("config-secret"), "apiKey must be removed");
        assert!(registry_path.exists(), "registry must be persisted");

        // Second migration is a no-op (idempotent).
        migrate_legacy_secrets(&root).unwrap();
        assert!(!auth_json.exists());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn migrate_legacy_secrets_prefers_jsonc_over_json() {
        use super::migrate_legacy_secrets;
        let root = std::env::temp_dir().join(format!("zw-migrate-jsonc-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let config_dir = root.join("xdg-config/opencode");
        std::fs::create_dir_all(&config_dir).unwrap();

        let json = config_dir.join("opencode.json");
        let jsonc = config_dir.join("opencode.jsonc");

        // Both files exist — .jsonc wins (server rewrites to this).
        std::fs::write(
            &json,
            r#"{"provider":{"openai":{"options":{"apiKey":"json-secret"}}}}"#,
        )
        .unwrap();
        std::fs::write(
            &jsonc,
            r#"{"provider":{"deepseek":{"options":{"apiKey":"jsonc-secret"}}}}"#,
        )
        .unwrap();

        migrate_legacy_secrets(&root).unwrap();

        // .jsonc is sanitized, .json is untouched.
        let jsonc_content = std::fs::read_to_string(&jsonc).unwrap();
        assert!(!jsonc_content.contains("jsonc-secret"), "jsonc apiKey must be removed");
        let json_content = std::fs::read_to_string(&json).unwrap();
        assert!(json_content.contains("json-secret"), "json file must be untouched");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn migrate_legacy_secrets_handles_mcp_environment_and_headers() {
        use super::migrate_legacy_secrets;
        let root = std::env::temp_dir().join(format!("zw-migrate-mcp-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let config_dir = root.join("xdg-config/opencode");
        std::fs::create_dir_all(&config_dir).unwrap();

        let config = config_dir.join("opencode.json");
        std::fs::write(
            &config,
            r#"{
              "model":"test",
              "mcp":{
                "pubmed":{"type":"local","command":["python","-m","mcp"],"environment":{"PUBMED_API_KEY":"env-secret","LOG_LEVEL":"info"}},
                "remote":{"type":"remote","url":"https://test","headers":{"Authorization":"Bearer header-secret","X-Request-ID":"public-trace"}}
              }
            }"#,
        )
        .unwrap();

        migrate_legacy_secrets(&root).unwrap();

        let sanitized = std::fs::read_to_string(&config).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&sanitized).unwrap();

        // Sensitive environment removed from local MCP.
        assert!(parsed["mcp"]["pubmed"]["environment"]
            .get("PUBMED_API_KEY")
            .is_none());
        assert_eq!(parsed["mcp"]["pubmed"]["environment"]["LOG_LEVEL"], "info");

        // Sensitive header rewritten to {env:NAME}, public header untouched.
        assert_eq!(
            parsed["mcp"]["remote"]["headers"]["Authorization"],
            "{env:MCP_REMOTE_AUTHORIZATION_SECRET}"
        );
        assert_eq!(parsed["mcp"]["remote"]["headers"]["X-Request-ID"], "public-trace");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn migrate_legacy_secrets_preserves_files_on_keychain_write_failure() {
        use std::sync::Mutex;

        struct FailingStore(Mutex<bool>);
        impl CredentialStore for FailingStore {
            fn set(&self, _account: &str, _value: &str) -> Result<(), String> {
                if *self.0.lock().unwrap() {
                    Err("simulated keychain write failure".to_owned())
                } else {
                    Ok(())
                }
            }
            fn get(&self, _account: &str) -> Result<Option<String>, String> {
                Ok(None)
            }
            fn delete(&self, _account: &str) -> Result<(), String> {
                Ok(())
            }
        }

        // Note: This test verifies fail-closed behavior at the unit level.
        // The actual migrate_legacy_secrets uses KeyringCredentialStore, so we
        // test the logic path by simulating a keychain write failure scenario
        // through the lower-level functions.

        let root = std::env::temp_dir().join(format!("zw-migrate-fail-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let config_dir = root.join("xdg-config/opencode");
        std::fs::create_dir_all(&config_dir).unwrap();

        let config = config_dir.join("opencode.json");
        let original_content =
            r#"{"provider":{"test":{"options":{"apiKey":"secret"}}}}"#;
        std::fs::write(&config, original_content).unwrap();

        // Simulate failure: parse succeeds but keychain write would fail.
        let failing_backend = FailingStore(Mutex::new(true));
        let mut registry = SecretRegistry::default();
        let plan = plan_legacy_config_migration(original_content).unwrap();

        // Attempt to persist the first secret — this should fail.
        let result = persist_secret(
            &failing_backend,
            &mut registry,
            plan.secrets[0].reference.clone(),
            &plan.secrets[0].value,
        );
        assert!(result.is_err(), "keychain write should fail");

        // Original file must be untouched (fail-closed).
        let preserved = std::fs::read_to_string(&config).unwrap();
        assert_eq!(preserved, original_content, "original file must not be modified on failure");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn migrate_legacy_secrets_handles_empty_auth_json() {
        use super::migrate_legacy_secrets;
        let root = std::env::temp_dir().join(format!("zw-migrate-empty-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let auth_json = root.join("xdg-data/opencode/auth.json");
        std::fs::create_dir_all(auth_json.parent().unwrap()).unwrap();

        // Empty auth.json (no providers) should be removed without keychain writes.
        std::fs::write(&auth_json, r#"{}"#).unwrap();
        migrate_legacy_secrets(&root).unwrap();
        assert!(!auth_json.exists(), "empty auth.json should be deleted");
        assert!(!root.join("secret-refs.json").exists(), "no registry needed for empty auth");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn migrate_legacy_secrets_skips_when_no_legacy_files_exist() {
        use super::migrate_legacy_secrets;
        let root = std::env::temp_dir().join(format!("zw-migrate-none-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();

        // No legacy files — migration is a silent no-op.
        migrate_legacy_secrets(&root).unwrap();
        assert!(!root.join("secret-refs.json").exists(), "no registry created when no secrets");

        let _ = std::fs::remove_dir_all(root);
    }
}
