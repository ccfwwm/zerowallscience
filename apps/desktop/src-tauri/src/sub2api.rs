//! Sub2API account sign-in, registration, and one-click model provisioning.
//!
//! Sub2API is an OpenAI-compatible gateway that fronts the domestic Chinese
//! model families (Kimi, DeepSeek, GLM, Qwen) behind a single account. Signing
//! in yields an API key, which is all the runtime needs.
//!
//! Everything runs in Rust for two reasons. The webview's `fetch` is subject to
//! CORS, which the gateway does not send headers for. More importantly, the
//! access token and the API key must never reach the renderer: the token stays
//! in this process's memory for the length of the session, and the key goes
//! straight from the HTTP response into the OS credential manager. The renderer
//! learns the account email and the model list — never a credential. That also
//! means no keychain getter is added; `provision` writes through the same
//! `secret_store` path the manual "paste a key" form uses.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, State};

use crate::secret_store::{self, SecretReference};

/// Default gateway. Mirrors `DEFAULT_GATEWAYS` on the TypeScript side; the
/// backup is tried only on a transport failure, never on a rejected password.
pub const DEFAULT_BASE_URL: &str = "https://code.aicodeme.cn";
pub const BACKUP_BASE_URL: &str = "https://code.aicodeme.xyz";

/// Provider id the provisioned models are registered under, and the keychain
/// account the API key is stored against.
pub const PROVIDER_ID: &str = "sub2api";

/// The signed-in session. Lives only in this process's memory — deliberately
/// not persisted, so closing the app ends it and no token is ever written to
/// disk, provenance, or an exported project.
#[derive(Default)]
pub struct Sub2ApiState {
    session: Mutex<Option<Session>>,
}

struct Session {
    base_url: String,
    email: String,
    access_token: String,
}

/// What the renderer is allowed to know about the session.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub email: String,
    pub base_url: String,
}

/// Outcome of a one-click provision: enough for the caller to register the
/// provider with the runtime, and nothing more.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Provisioned {
    /// Provider id the key was stored under.
    pub provider_id: String,
    /// OpenAI-compatible base URL to point the provider at.
    pub base_url: String,
    /// Model ids the gateway serves, in the order it listed them.
    pub models: Vec<String>,
    /// Available model groups from the gateway (name + id).
    pub groups: Vec<Group>,
}

/// A model group exposed by the gateway.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: i64,
    pub name: String,
}

/// Result of the first provisioning step: the groups the account has access to,
/// and which ones already have an API key. The frontend shows a group selector
/// and then calls `sub2api_provision_group` for the chosen group.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GroupsAndKeys {
    pub groups: Vec<Group>,
    pub existing_key_group_ids: Vec<i64>,
}

/// Internal representation of a parsed API key with its group association.
#[derive(Debug, Clone)]
pub(crate) struct KeyInfo {
    pub key: String,
    pub group_id: Option<i64>,
}

/// Prefix marking an error as "could not reach this host", the only condition
/// that justifies trying the backup gateway. A rejected password or a missing
/// verification code answers over HTTP and must NOT be retried elsewhere — the
/// second attempt would fail identically and double the rate-limit pressure.
const UNREACHABLE: &str = "could not reach the gateway: ";

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("ZeroWall Science")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("could not create HTTP client: {e}"))
}

fn api(base_url: &str, path: &str) -> String {
    format!("{}/api/v1{path}", base_url.trim().trim_end_matches('/'))
}

/// The gateway's error envelope: `{code, message}`, or `{error}` when a rate
/// limiter answers. Falls back to the raw body so a failure is never silent.
fn error_message(status: u16, body: &str) -> String {
    let parsed: Option<serde_json::Value> = serde_json::from_str(body).ok();
    if let Some(v) = parsed {
        for key in ["message", "error"] {
            if let Some(text) = v.get(key).and_then(|m| m.as_str()) {
                if !text.is_empty() {
                    return text.to_string();
                }
            }
        }
    }
    if body.trim().is_empty() {
        format!("the gateway returned HTTP {status}")
    } else {
        format!("HTTP {status}: {}", body.trim())
    }
}

/// POST JSON and return the response body, mapping a non-2xx into the gateway's
/// own message. `bearer` is set for the endpoints that need the session token.
fn post_json(
    base_url: &str,
    path: &str,
    body: serde_json::Value,
    bearer: Option<&str>,
) -> Result<String, String> {
    // reqwest is built without the `json` feature (see Cargo.toml), so the body
    // is serialized here and the content type set explicitly.
    let mut req = client()?
        .post(api(base_url, path))
        .header("content-type", "application/json")
        .body(body.to_string());
    if let Some(token) = bearer {
        req = req.bearer_auth(token);
    }
    let res = req.send().map_err(|e| format!("{UNREACHABLE}{e}"))?;
    let status = res.status();
    let text = res.text().unwrap_or_default();
    if !status.is_success() {
        return Err(error_message(status.as_u16(), &text));
    }
    Ok(text)
}

fn get_json(base_url: &str, path: &str, bearer: &str) -> Result<String, String> {
    let res = client()?
        .get(api(base_url, path))
        .bearer_auth(bearer)
        .send()
        .map_err(|e| format!("{UNREACHABLE}{e}"))?;
    let status = res.status();
    let text = res.text().unwrap_or_default();
    if !status.is_success() {
        return Err(error_message(status.as_u16(), &text));
    }
    Ok(text)
}

#[derive(Deserialize)]
struct LoginResponse {
    access_token: Option<String>,
    /// Present when the account has 2FA armed; the caller must resubmit with a code.
    #[serde(default)]
    requires_2fa: bool,
}

/// Pull the bearer token out of a login response, tolerating the two shapes the
/// gateway uses (top level, or nested under `data`).
pub(crate) fn parse_access_token(body: &str) -> Result<String, String> {
    let root: serde_json::Value =
        serde_json::from_str(body).map_err(|e| format!("the gateway's reply was not JSON: {e}"))?;
    let scope = root.get("data").unwrap_or(&root);
    let parsed: LoginResponse = serde_json::from_value(scope.clone())
        .map_err(|e| format!("unexpected sign-in reply: {e}"))?;
    if parsed.requires_2fa {
        return Err("this account needs a two-factor code".into());
    }
    parsed
        .access_token
        .filter(|t| !t.is_empty())
        .ok_or_else(|| "the gateway accepted the sign-in but returned no token".into())
}

/// API keys from `GET /keys`, newest usable one first. The gateway nests the
/// list under `data` (sometimes `data.items`), so probe both. The secret can
/// appear under `key`, `token`, or `api_key` depending on the gateway version —
/// try all three, matching transit-hub's `firstString` fallback.
///
/// Each key carries an optional `group_id` (top-level numeric, or nested inside
/// a `group` object) so the caller can match keys to groups.
pub(crate) fn parse_api_keys(body: &str) -> Vec<KeyInfo> {
    let Ok(root) = serde_json::from_str::<serde_json::Value>(body) else {
        return Vec::new();
    };
    let data = root.get("data").unwrap_or(&root);
    let list = data
        .get("items")
        .and_then(|i| i.as_array())
        .or_else(|| data.as_array())
        .cloned()
        .unwrap_or_default();
    list.iter()
        .filter_map(|k| {
            // A disabled key authenticates nothing — skip it rather than store
            // a credential that fails on the first turn.
            if k.get("enabled").and_then(|e| e.as_bool()) == Some(false) {
                return None;
            }
            let key = ["key", "token", "api_key"]
                .iter()
                .find_map(|field| k.get(*field)?.as_str().filter(|s| !s.is_empty()))
                .map(String::from)?;
            // group_id: try top-level first, then nested `group.id`
            let group_id = k
                .get("group_id")
                .and_then(|v| v.as_i64())
                .or_else(|| k.get("group").and_then(|g| g.get("id")).and_then(|v| v.as_i64()));
            Some(KeyInfo { key, group_id })
        })
        .collect()
}

/// Model ids from the gateway's OpenAI-compatible `GET /v1/models`.
pub(crate) fn parse_models(body: &str) -> Result<Vec<String>, String> {
    let root: serde_json::Value =
        serde_json::from_str(body).map_err(|e| format!("the model list was not JSON: {e}"))?;
    let list = root
        .get("data")
        .and_then(|d| d.as_array())
        .or_else(|| root.as_array())
        .ok_or("the model list had no data array")?;
    let models: Vec<String> = list
        .iter()
        .filter_map(|m| m.get("id")?.as_str().map(String::from))
        .collect();
    if models.is_empty() {
        return Err("the gateway listed no models".into());
    }
    Ok(models)
}

/// Available groups from `GET /groups/available`. The gateway returns
/// `{data: [{id, name, platform, ...}]}` — extract name and id.
pub(crate) fn parse_groups(body: &str) -> Vec<Group> {
    let Ok(root) = serde_json::from_str::<serde_json::Value>(body) else {
        return Vec::new();
    };
    let data = root.get("data").unwrap_or(&root);
    let list = data.as_array().cloned().unwrap_or_default();
    list.iter()
        .filter_map(|g| {
            let id = g.get("id")?.as_i64()?;
            let name = g.get("name")?.as_str().filter(|s| !s.is_empty())?;
            Some(Group { id, name: name.to_string() })
        })
        .collect()
}

/// Create an API key on the gateway for a specific group. Mirrors transit-hub's
/// `CreateSub2APIKey`: `POST /api/v1/keys` with `{"name", "group_id"}`.
fn create_key(base_url: &str, token: &str, name: &str, group_id: i64) -> Result<String, String> {
    let body = serde_json::json!({ "name": name, "group_id": group_id });
    let reply = post_json(base_url, "/keys", body, Some(token))?;
    // The response nests the new key under `data` — same shape as a single key
    // record. Use the same field-name fallback as parse_api_keys.
    let root: serde_json::Value =
        serde_json::from_str(&reply).map_err(|e| format!("key-creation reply was not JSON: {e}"))?;
    let record = root.get("data").unwrap_or(&root);
    ["key", "token", "api_key"]
        .iter()
        .find_map(|field| record.get(*field)?.as_str().filter(|s| !s.is_empty()))
        .map(String::from)
        .ok_or_else(|| "the gateway created the key but did not return it".into())
}

/// Bases to try in order: the primary gateway, then the backup. Both are
/// compiled in — the renderer cannot point auth at another host, so a hostile
/// or mistaken base URL can never collect a user's password.
fn candidate_bases() -> Vec<String> {
    vec![DEFAULT_BASE_URL.to_string(), BACKUP_BASE_URL.to_string()]
}

/// Run `attempt` against each candidate base, moving on ONLY when the gateway
/// could not be reached at all. Returns the base that answered alongside the
/// result, so a session pins the gateway that actually worked.
fn with_failover<T>(
    bases: &[String],
    mut attempt: impl FnMut(&str) -> Result<T, String>,
) -> Result<(String, T), String> {
    let mut last = String::from("no gateway configured");
    for (i, base) in bases.iter().enumerate() {
        match attempt(base) {
            Ok(value) => return Ok((base.clone(), value)),
            Err(err) => {
                let unreachable = err.starts_with(UNREACHABLE);
                last = err;
                if !unreachable || i + 1 == bases.len() {
                    break;
                }
            }
        }
    }
    Err(last)
}

/// Send the email verification code registration requires.
#[tauri::command]
pub async fn sub2api_send_code(email: String) -> Result<(), String> {
    let bases = candidate_bases();
    let email = email.trim().to_string();
    if email.is_empty() {
        return Err("enter an email address".into());
    }
    blocking(move || {
        with_failover(&bases, |base| {
            post_json(base, "/auth/send-verify-code", serde_json::json!({ "email": &email }), None)
                .map(|_| ())
        })
        .map(|_| ())
    })
    .await
}

/// Create an account. The gateway requires an emailed verification code; it
/// answers `EMAIL_VERIFY_REQUIRED` when one is missing, which surfaces as the
/// gateway's own message.
#[tauri::command]
pub async fn sub2api_register(
    email: String,
    password: String,
    code: Option<String>,
    invitation_code: Option<String>,
) -> Result<(), String> {
    let bases = candidate_bases();
    let email = email.trim().to_string();
    if email.is_empty() {
        return Err("enter an email address".into());
    }
    // The gateway enforces this too, but a local check spares a round trip and
    // an account left half-created.
    if password.len() < 6 {
        return Err("the password must be at least 6 characters".into());
    }
    blocking(move || {
        let mut body = serde_json::json!({ "email": email, "password": password });
        let obj = body.as_object_mut().expect("json object");
        if let Some(code) = code.filter(|c| !c.trim().is_empty()) {
            obj.insert("code".into(), serde_json::json!(code.trim()));
        }
        if let Some(invite) = invitation_code.filter(|c| !c.trim().is_empty()) {
            obj.insert("invitation_code".into(), serde_json::json!(invite.trim()));
        }
        with_failover(&bases, |base| {
            post_json(base, "/auth/register", body.clone(), None).map(|_| ())
        })
        .map(|_| ())
    })
    .await
}

/// Sign in and keep the token in memory. Returns only the account identity.
#[tauri::command]
pub async fn sub2api_login(
    state: State<'_, Sub2ApiState>,
    email: String,
    password: String,
    code: Option<String>,
) -> Result<Account, String> {
    let bases = candidate_bases();
    let email = email.trim().to_string();
    if email.is_empty() || password.is_empty() {
        return Err("enter your email and password".into());
    }
    let request_email = email.clone();
    let (base, token) = blocking(move || {
        let code = code.filter(|c| !c.trim().is_empty());
        let path = if code.is_some() { "/auth/login/2fa" } else { "/auth/login" };
        let mut body = serde_json::json!({ "email": request_email, "password": password });
        if let Some(code) = code {
            body.as_object_mut()
                .expect("json object")
                .insert("code".into(), serde_json::json!(code.trim()));
        }
        with_failover(&bases, |base| {
            let reply = post_json(base, path, body.clone(), None)?;
            parse_access_token(&reply)
        })
    })
    .await?;

    *state.session.lock().map_err(|_| "session lock poisoned")? = Some(Session {
        base_url: base.clone(),
        email: email.clone(),
        access_token: token,
    });
    Ok(Account { email, base_url: base })
}

/// The signed-in account, or None. Never exposes the token.
#[tauri::command(async)]
pub fn sub2api_account(state: State<'_, Sub2ApiState>) -> Result<Option<Account>, String> {
    let guard = state.session.lock().map_err(|_| "session lock poisoned")?;
    Ok(guard.as_ref().map(|s| Account {
        email: s.email.clone(),
        base_url: s.base_url.clone(),
    }))
}

/// Forget the in-memory session. The provisioned API key in the keychain is
/// left alone — signing out of the account page must not silently disconnect a
/// working provider.
#[tauri::command(async)]
pub fn sub2api_logout(state: State<'_, Sub2ApiState>) -> Result<(), String> {
    *state.session.lock().map_err(|_| "session lock poisoned")? = None;
    Ok(())
}

/// Step 1 of two-step provisioning: fetch the account's available groups and
/// which ones already have an API key. The frontend shows a group selector,
/// then calls `sub2api_provision_group` for the chosen group.
///
/// No key is stored and no sidecar is restarted — that happens in step 2.
#[tauri::command]
pub async fn sub2api_fetch_groups(
    sub2api: State<'_, Sub2ApiState>,
) -> Result<GroupsAndKeys, String> {
    let (session_base, token) = {
        let guard = sub2api.session.lock().map_err(|_| "session lock poisoned")?;
        let session = guard.as_ref().ok_or("sign in to the AI platform first")?;
        (session.base_url.clone(), session.access_token.clone())
    };

    let mut bases = candidate_bases();
    if let Some(pos) = bases.iter().position(|b| b == &session_base) {
        if pos != 0 {
            bases.swap(0, pos);
        }
    }

    let (_base, (groups, existing_key_group_ids)) = blocking(move || {
        with_failover(&bases, |base| {
            let groups = parse_groups(
                &get_json(base, "/groups/available", &token)?,
            );
            let keys = parse_api_keys(&get_json(
                base,
                "/keys?page=1&page_size=100&sort_by=created_at&sort_order=desc",
                &token,
            )?);
            let existing_key_group_ids: Vec<i64> = keys
                .iter()
                .filter_map(|k| k.group_id)
                .collect();
            Ok((groups, existing_key_group_ids))
        })
    })
    .await?;

    Ok(GroupsAndKeys { groups, existing_key_group_ids })
}

/// Step 2: provision a specific group — find or create a key, list models, and
/// store the key in the OS credential manager.
///
/// If the account already has a key for the requested group, it is reused.
/// Otherwise a new key is created via `POST /api/v1/keys`.
#[tauri::command]
pub async fn sub2api_provision_group(
    app: AppHandle,
    sub2api: State<'_, Sub2ApiState>,
    runtime: State<'_, crate::runtime::RuntimeState>,
    group_id: i64,
) -> Result<Provisioned, String> {
    let (session_base, token) = {
        let guard = sub2api.session.lock().map_err(|_| "session lock poisoned")?;
        let session = guard.as_ref().ok_or("sign in to the AI platform first")?;
        (session.base_url.clone(), session.access_token.clone())
    };

    let mut bases = candidate_bases();
    if let Some(pos) = bases.iter().position(|b| b == &session_base) {
        if pos != 0 {
            bases.swap(0, pos);
        }
    }

    let (base, (api_key, models, groups)) = blocking(move || {
        with_failover(&bases, |base| {
            // Fetch existing keys and look for one tied to the requested group.
            let keys = parse_api_keys(&get_json(
                base,
                "/keys?page=1&page_size=100&sort_by=created_at&sort_order=desc",
                &token,
            )?);
            let api_key = keys
                .iter()
                .find(|k| k.group_id == Some(group_id))
                .map(|k| k.key.clone());

            // Reuse the existing key or create a new one for this group.
            let api_key = match api_key {
                Some(k) => k,
                None => create_key(base, &token, "ZeroWall Science", group_id)?,
            };

            let models = list_models(base, &api_key)?;
            let groups = parse_groups(
                &get_json(base, "/groups/available", &token).unwrap_or_default(),
            );
            Ok((api_key, models, groups))
        })
    })
    .await?;

    // Straight into the credential manager, then restart the sidecar so it
    // picks the key up. `api_key` is dropped here and never returned.
    secret_store::persist_for_app(&app, SecretReference::provider(PROVIDER_ID)?, &api_key)?;
    crate::runtime::restart_sidecar_if_running(&app, &runtime)?;

    Ok(Provisioned {
        provider_id: PROVIDER_ID.to_string(),
        base_url: format!("{base}/v1"),
        models,
        groups,
    })
}

/// `GET /v1/models` with the API key. The gateway's OpenAI-compatible surface
/// sits at the root, not under `/api/v1`.
fn list_models(base_url: &str, api_key: &str) -> Result<Vec<String>, String> {
    let url = format!("{}/v1/models", base_url.trim_end_matches('/'));
    let res = client()?
        .get(url)
        .bearer_auth(api_key)
        .send()
        .map_err(|e| format!("{UNREACHABLE}{e}"))?;
    let status = res.status();
    let text = res.text().unwrap_or_default();
    if !status.is_success() {
        return Err(error_message(status.as_u16(), &text));
    }
    parse_models(&text)
}

/// Run a blocking HTTP call off the command thread. `reqwest::blocking` cannot
/// run inside the async runtime's worker, and the surrounding commands hold no
/// lock across the await — the session mutex is always released first.
async fn blocking<T, F>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| format!("the gateway request failed to run: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn access_token_is_read_from_either_shape() {
        assert_eq!(parse_access_token(r#"{"access_token":"tok"}"#).unwrap(), "tok");
        assert_eq!(
            parse_access_token(r#"{"code":0,"data":{"access_token":"nested"}}"#).unwrap(),
            "nested"
        );
    }

    #[test]
    fn a_two_factor_challenge_is_reported_not_swallowed() {
        // Storing no token and reporting success would leave the UI "signed in"
        // with nothing to authenticate the next call.
        let err = parse_access_token(r#"{"requires_2fa":true}"#).unwrap_err();
        assert!(err.contains("two-factor"), "{err}");
    }

    #[test]
    fn a_reply_with_no_token_is_an_error() {
        assert!(parse_access_token(r#"{"code":0}"#).is_err());
        assert!(parse_access_token(r#"{"access_token":""}"#).is_err());
        assert!(parse_access_token("not json").is_err());
    }

    #[test]
    fn api_keys_are_read_from_the_nested_shapes_and_skip_disabled() {
        let body = r#"{"data":{"items":[
            {"api_key":"sk-a","name":"first","group_id":1},
            {"api_key":"sk-off","enabled":false},
            {"api_key":"sk-b","group":{"id":2,"name":"VIP"}}
        ]}}"#;
        let keys = parse_api_keys(body);
        assert_eq!(keys.len(), 2);
        assert_eq!(keys[0].key, "sk-a");
        assert_eq!(keys[0].group_id, Some(1));
        assert_eq!(keys[1].key, "sk-b");
        assert_eq!(keys[1].group_id, Some(2));

        let flat = parse_api_keys(r#"{"data":[{"api_key":"sk-flat"}]}"#);
        assert_eq!(flat.len(), 1);
        assert_eq!(flat[0].key, "sk-flat");
        assert_eq!(flat[0].group_id, None);

        let bare = parse_api_keys(r#"[{"api_key":"sk-bare"}]"#);
        assert_eq!(bare.len(), 1);
        assert_eq!(bare[0].key, "sk-bare");

        assert!(parse_api_keys(r#"{"data":[]}"#).is_empty());
        assert!(parse_api_keys("not json").is_empty());
    }

    #[test]
    fn api_keys_accept_key_and_token_field_names() {
        // The gateway may return the secret under `key`, `token`, or `api_key`
        // depending on the platform version — matching transit-hub's firstString.
        let k = parse_api_keys(r#"[{"key":"sk-via-key","group_id":3}]"#);
        assert_eq!(k[0].key, "sk-via-key");
        assert_eq!(k[0].group_id, Some(3));

        let t = parse_api_keys(r#"[{"token":"sk-via-tok"}]"#);
        assert_eq!(t[0].key, "sk-via-tok");

        // `key` wins over `api_key` when both are present.
        let both = parse_api_keys(r#"[{"key":"sk-primary","api_key":"sk-fallback"}]"#);
        assert_eq!(both[0].key, "sk-primary");
    }

    #[test]
    fn groups_are_parsed_from_the_gateway_shape() {
        let body = r#"{"data":[
            {"id":1,"name":"Default","platform":"sub2api","rate_multiplier":1},
            {"id":2,"name":"VIP","platform":"sub2api","rate_multiplier":0.5}
        ]}"#;
        let groups = parse_groups(body);
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0], Group { id: 1, name: "Default".into() });
        assert_eq!(groups[1], Group { id: 2, name: "VIP".into() });
        assert!(parse_groups(r#"{"data":[]}"#).is_empty());
        assert!(parse_groups("not json").is_empty());
    }

    #[test]
    fn models_are_read_from_the_openai_shape() {
        let body = r#"{"object":"list","data":[
            {"id":"kimi-k2-thinking","object":"model"},
            {"id":"deepseek-v3"},
            {"id":"glm-4.6"}
        ]}"#;
        assert_eq!(
            parse_models(body).unwrap(),
            vec!["kimi-k2-thinking", "deepseek-v3", "glm-4.6"]
        );
        assert!(parse_models(r#"{"data":[]}"#).is_err());
    }

    #[test]
    fn gateway_error_envelopes_surface_their_own_message() {
        // Verified against the live gateway: a register with no code answers
        // exactly this, and a rate limiter answers `{"error": …}`.
        assert_eq!(
            error_message(
                400,
                r#"{"code":400,"message":"email verification is required","reason":"EMAIL_VERIFY_REQUIRED"}"#
            ),
            "email verification is required"
        );
        assert_eq!(
            error_message(429, r#"{"error":"rate limit exceeded"}"#),
            "rate limit exceeded"
        );
        assert_eq!(error_message(502, ""), "the gateway returned HTTP 502");
        assert_eq!(error_message(500, "boom"), "HTTP 500: boom");
    }

    #[test]
    fn candidate_bases_are_the_compiled_in_primary_then_the_backup() {
        // Both hosts are hard-coded and there is no input to override them: the
        // renderer cannot aim auth at a host of its choosing.
        assert_eq!(candidate_bases(), vec![DEFAULT_BASE_URL, BACKUP_BASE_URL]);
        assert_eq!(DEFAULT_BASE_URL, "https://code.aicodeme.cn");
        assert_eq!(BACKUP_BASE_URL, "https://code.aicodeme.xyz");
    }

    #[test]
    fn failover_moves_on_only_when_the_gateway_is_unreachable() {
        let bases = vec!["a".to_string(), "b".to_string()];

        // Unreachable primary: the backup answers, and the base that worked
        // comes back so the session pins it.
        let mut seen = Vec::new();
        let out = with_failover(&bases, |base| {
            seen.push(base.to_string());
            if base == "a" {
                Err(format!("{UNREACHABLE}dns"))
            } else {
                Ok(7)
            }
        });
        assert_eq!(out.unwrap(), ("b".to_string(), 7));
        assert_eq!(seen, vec!["a", "b"]);

        // A rejected password answers over HTTP: retrying the backup would fail
        // the same way and double the rate-limit pressure.
        let mut tries = 0;
        let err = with_failover(&bases, |_| {
            tries += 1;
            Err::<(), String>("invalid credentials".into())
        })
        .unwrap_err();
        assert_eq!(tries, 1);
        assert_eq!(err, "invalid credentials");

        // Every base unreachable: the last error surfaces.
        let err =
            with_failover(&bases, |_| Err::<(), String>(format!("{UNREACHABLE}down"))).unwrap_err();
        assert!(err.starts_with(UNREACHABLE), "{err}");
    }

    #[test]
    fn api_paths_are_versioned_once() {
        assert_eq!(api("https://x.test/", "/auth/login"), "https://x.test/api/v1/auth/login");
    }
}
