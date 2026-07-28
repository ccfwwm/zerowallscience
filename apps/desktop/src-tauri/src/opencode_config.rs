// Pure merge of provider credentials/model into OpenCode config JSON.
// Used by the runtime command, which writes it into an app-private config dir.
use serde_json::{json, Value};

/// Approval modes for agent tool use (the composer's Codex-style switch).
/// OpenCode evaluates permission rules last-match-wins with user config rules
/// appended after its builtin `"*": "allow"` — so "approve" only needs `ask`
/// rules and everything unmatched still runs without a prompt.
pub const MODE_APPROVE: &str = "approve";
pub const MODE_FULL: &str = "full";

/// Command tokens the "approve" mode gates behind a prompt, per the AGENTS.md
/// safety defaults: deletion, privilege/system changes, dependency installs,
/// and remote/outward connections. Each token yields two glob rules:
/// `"T *"` (command starts with it; also matches bare `T` — OpenCode turns a
/// trailing " *" into an optional group) and `"* T *"` (embedded in a compound
/// command like `cd x && rm -rf y`; the leading space avoids matching words
/// that merely end in the token).
const DANGEROUS_BASH: &[&str] = &[
    // deletion
    "rm", "rmdir", "shred", "git clean",
    // privilege / system state
    "sudo", "su", "chmod", "chown", "kill", "pkill", "killall", "launchctl",
    "systemctl", "crontab", "osascript", "diskutil", "dd",
    // dependency installs
    "pip install", "pip3 install", "uv add", "uv pip install", "npm install",
    "npm i", "pnpm add", "pnpm install", "yarn add", "conda install",
    "mamba install", "brew install", "cargo install", "gem install",
    "apt install", "apt-get install",
    // remote / outward
    "ssh", "scp", "sftp", "rsync", "curl", "wget", "nc", "git push", "modal",
    "sbatch",
];

fn approve_permission() -> Value {
    let mut bash = serde_json::Map::new();
    for t in DANGEROUS_BASH {
        bash.insert(format!("{t} *"), json!("ask"));
        bash.insert(format!("* {t} *"), json!("ask"));
    }
    json!({ "bash": Value::Object(bash), "webfetch": "ask" })
}

/// Set the approval mode in OpenCode config JSON. "approve" installs the ask
/// rules; "full" writes `"permission": {}` — zero rules (builtin defaults),
/// with the key's presence marking that the user made a choice (so startup
/// seeding never overrides it). Other keys are preserved.
pub fn set_permission_mode(existing: &str, mode: &str) -> Result<String, String> {
    let permission = match mode {
        MODE_APPROVE => approve_permission(),
        MODE_FULL => json!({}),
        other => return Err(format!("unknown approval mode \"{other}\"")),
    };
    let mut root: Value = if existing.trim().is_empty() {
        json!({})
    } else {
        serde_json::from_str(existing).map_err(|e| format!("invalid existing config: {e}"))?
    };
    if !root.is_object() {
        root = json!({});
    }
    root.as_object_mut()
        .unwrap()
        .insert("permission".to_string(), permission);
    serde_json::to_string_pretty(&root).map_err(|e| e.to_string())
}

/// Seed the "approve" default on first run (no `permission` key yet).
/// Returns None when the user already chose a mode — never overrides it.
pub fn seed_default_permission(existing: &str) -> Option<String> {
    if permission_mode_of(existing).is_some() {
        return None;
    }
    set_permission_mode(existing, MODE_APPROVE).ok()
}

/// The approval mode a config encodes: None when the `permission` key was
/// never written (first run — the caller seeds the "approve" default).
pub fn permission_mode_of(existing: &str) -> Option<&'static str> {
    let root: Value = serde_json::from_str(existing).ok()?;
    let permission = root.get("permission")?;
    if permission.get("bash").is_some_and(|b| b.is_object()) {
        Some(MODE_APPROVE)
    } else {
        Some(MODE_FULL)
    }
}

/// Point the config's `plugin` array at the deployed goal plugin, replacing
/// any stale entry from a previous install location (our entries are
/// recognized by the `goal-plugin.server.js` file name). Returns None when the
/// config already lists exactly this path — no rewrite, no sidecar churn.
/// User-added plugin entries are preserved untouched.
pub fn ensure_goal_plugin(existing: &str, plugin_path: &str) -> Option<String> {
    let mut root: Value = if existing.trim().is_empty() {
        json!({})
    } else {
        serde_json::from_str(existing).ok()?
    };
    if !root.is_object() {
        root = json!({});
    }
    let obj = root.as_object_mut().unwrap();
    let plugins = obj.entry("plugin").or_insert_with(|| json!([]));
    if !plugins.is_array() {
        *plugins = json!([]);
    }
    let arr = plugins.as_array_mut().unwrap();
    let ours = |v: &Value| {
        v.as_str()
            .is_some_and(|s| s.ends_with("goal-plugin.server.js"))
    };
    if arr.iter().any(|v| v.as_str() == Some(plugin_path)) && arr.iter().filter(|v| ours(v)).count() == 1 {
        return None; // already exactly right
    }
    arr.retain(|v| !ours(v));
    arr.push(json!(plugin_path));
    serde_json::to_string_pretty(&root).ok()
}

/// The built-in ZeroWall Science identity + RV-Loop workflow prompt, embedded at
/// build time from the editable profile file. Inlining it (rather than pointing
/// the config at a `{file:...}` path) keeps the generated config self-contained
/// and side-steps cross-platform path-resolution quirks.
pub const IDENTITY_PROMPT: &str =
    include_str!("../../../../runtime/opencode-profile/identity.md");

/// Prefix of the marker line in our identity prompt. An app-seeded prompt carries
/// it (so newer versions may refresh it); a prompt without it was customized by
/// the user and is never overwritten.
const IDENTITY_MARKER_PREFIX: &str = "ZW-IDENTITY-";

/// Built-in OpenCode agents that carry a conversational system prompt and
/// therefore need the ZeroWall Science identity injected. `build` is the
/// default interactive agent; `plan` is the read-only planning variant; both
/// begin turns with the stock "you are opencode" identity unless overridden.
/// Any user-defined agent under `agent.*` is deliberately left untouched — we
/// only stamp identity on names we ship.
const IDENTITY_AGENTS: &[&str] = &["build", "plan"];

/// Set the ZeroWall Science identity + RV-Loop workflow prompt on every
/// built-in agent that we ship, replacing the runtime's stock identity so the
/// assistant introduces itself as ZeroWall Science — not the underlying engine
/// — no matter which agent the user is talking to. Each `agent.<name>.prompt`
/// replaces the base "you are ..." provider prompt for that agent.
///
/// Non-clobbering per agent: if the entry already equals `prompt`, that agent
/// is left alone. If it holds a prompt WITHOUT our marker, the user customized
/// it — left untouched. An older app-seeded prompt (marker present) is
/// refreshed to the current text. Other agent entries, other fields on each
/// agent, and unrelated config keys are all preserved. Returns None when
/// nothing needed a rewrite (across ALL built-in agents), else the merged
/// JSON — so a single sidecar restart covers every agent that changed.
pub fn ensure_agent_prompt(existing: &str, prompt: &str) -> Option<String> {
    let mut root: Value = if existing.trim().is_empty() {
        json!({})
    } else {
        serde_json::from_str(existing).ok()?
    };
    if !root.is_object() {
        root = json!({});
    }
    let agent = root
        .as_object_mut()
        .unwrap()
        .entry("agent")
        .or_insert_with(|| json!({}));
    if !agent.is_object() {
        *agent = json!({});
    }
    let agent_obj = agent.as_object_mut().unwrap();

    let mut changed = false;
    for name in IDENTITY_AGENTS {
        let entry = agent_obj.entry((*name).to_string()).or_insert_with(|| json!({}));
        if !entry.is_object() {
            *entry = json!({});
        }
        let entry = entry.as_object_mut().unwrap();
        if let Some(current) = entry.get("prompt").and_then(|v| v.as_str()) {
            if current == prompt {
                continue; // already exactly right for this agent
            }
            if !current.contains(IDENTITY_MARKER_PREFIX) {
                continue; // user-customized — never overwrite
            }
            // else: our older seed → fall through and refresh
        }
        entry.insert("prompt".to_string(), json!(prompt));
        changed = true;
    }
    if !changed {
        return None;
    }
    serde_json::to_string_pretty(&root).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approve_mode_writes_ask_rules_for_dangerous_bash() {
        let out = set_permission_mode("", MODE_APPROVE).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        let bash = v["permission"]["bash"].as_object().unwrap();
        // Prefix form gates a command that starts with the token (also bare,
        // via OpenCode's trailing-" *" optionalization)…
        assert_eq!(bash["rm *"], "ask");
        assert_eq!(bash["pip install *"], "ask");
        assert_eq!(bash["git push *"], "ask");
        // …and the embedded form catches it inside a compound command
        // ("cd x && rm -rf y").
        assert_eq!(bash["* rm *"], "ask");
        assert_eq!(bash["* ssh *"], "ask");
        // No blanket rule of our own: everything else falls through to the
        // builtin "*": "allow" (rules are last-match-wins, ours come last).
        assert!(!bash.contains_key("*"));
        assert_eq!(v["permission"]["webfetch"], "ask");
    }

    #[test]
    fn full_mode_writes_empty_permission_marker() {
        let approved = set_permission_mode("", MODE_APPROVE).unwrap();
        let out = set_permission_mode(&approved, MODE_FULL).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        // {} = zero rules = OpenCode builtin defaults; the key's presence
        // marks "user chose this" so startup never re-seeds approve mode.
        assert_eq!(v["permission"], json!({}));
    }

    #[test]
    fn set_permission_mode_preserves_unrelated_keys() {
        let existing = r#"{"model":"anthropic/claude","provider":{"openai":{"options":{"apiKey":"k"}}}}"#;
        let out = set_permission_mode(existing, MODE_APPROVE).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["model"], "anthropic/claude");
        assert_eq!(v["provider"]["openai"]["options"]["apiKey"], "k");
    }

    #[test]
    fn set_permission_mode_rejects_unknown_mode() {
        assert!(set_permission_mode("", "off").is_err());
    }

    #[test]
    fn ensure_goal_plugin_adds_entry_to_empty_config() {
        let out = ensure_goal_plugin("", "/app/goal-plugin.server.js").unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["plugin"], json!(["/app/goal-plugin.server.js"]));
    }

    #[test]
    fn ensure_goal_plugin_replaces_stale_path_and_keeps_others() {
        let existing = r#"{"plugin":["my-other-plugin","/old/place/goal-plugin.server.js"],"model":"m"}"#;
        let out = ensure_goal_plugin(existing, "/new/goal-plugin.server.js").unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["plugin"], json!(["my-other-plugin", "/new/goal-plugin.server.js"]));
        assert_eq!(v["model"], "m"); // unrelated keys preserved
    }

    #[test]
    fn ensure_goal_plugin_is_idempotent() {
        let existing = r#"{"plugin":["/app/goal-plugin.server.js"]}"#;
        assert!(ensure_goal_plugin(existing, "/app/goal-plugin.server.js").is_none());
    }

    #[test]
    fn seeds_approve_default_only_when_never_configured() {
        // First run: no permission key → seed the safe default.
        let seeded = seed_default_permission("").unwrap();
        let v: Value = serde_json::from_str(&seeded).unwrap();
        assert_eq!(v["permission"]["bash"]["rm *"], "ask");
        // Explicit user choice (either mode) is never overridden.
        assert!(seed_default_permission(&seeded).is_none());
        let full = set_permission_mode(&seeded, MODE_FULL).unwrap();
        assert!(seed_default_permission(&full).is_none());
        // Other keys survive seeding.
        let seeded2 = seed_default_permission(r#"{"model":"m"}"#).unwrap();
        let v2: Value = serde_json::from_str(&seeded2).unwrap();
        assert_eq!(v2["model"], "m");
    }

    #[test]
    fn permission_mode_of_detects_each_state() {
        // Never configured (first run) — the caller must seed the default.
        assert_eq!(permission_mode_of(""), None);
        assert_eq!(permission_mode_of(r#"{"model":"m"}"#), None);
        let approved = set_permission_mode("", MODE_APPROVE).unwrap();
        assert_eq!(permission_mode_of(&approved), Some(MODE_APPROVE));
        let full = set_permission_mode(&approved, MODE_FULL).unwrap();
        assert_eq!(permission_mode_of(&full), Some(MODE_FULL));
    }

    #[test]
    fn identity_prompt_declares_zerowall_not_stock_engine() {
        // The bundled prompt must own the identity and carry the refresh marker,
        // and must not leave the runtime's stock "you are opencode" identity in
        // place (that's the whole point of overriding agent.build.prompt).
        assert!(IDENTITY_PROMPT.contains("ZeroWall Science"));
        assert!(IDENTITY_PROMPT.contains("科研无界"));
        assert!(IDENTITY_PROMPT.contains(IDENTITY_MARKER_PREFIX));
        assert!(IDENTITY_PROMPT.contains("Research Verification Loop"));
        assert!(!IDENTITY_PROMPT.to_lowercase().contains("you are opencode"));
    }

    #[test]
    fn ensure_agent_prompt_sets_identity_on_empty_config() {
        let out = ensure_agent_prompt("", IDENTITY_PROMPT).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        // Both built-in agents receive the identity so the user hits the same
        // "ZeroWall Science" self-introduction no matter which one they invoke.
        assert_eq!(v["agent"]["build"]["prompt"], IDENTITY_PROMPT);
        assert_eq!(v["agent"]["plan"]["prompt"], IDENTITY_PROMPT);
    }

    #[test]
    fn ensure_agent_prompt_is_idempotent() {
        let seeded = ensure_agent_prompt("", IDENTITY_PROMPT).unwrap();
        assert!(ensure_agent_prompt(&seeded, IDENTITY_PROMPT).is_none());
    }

    #[test]
    fn ensure_agent_prompt_never_overwrites_a_user_prompt() {
        // Both agents user-customized without our marker → nothing to do.
        let existing = r#"{"agent":{"build":{"prompt":"You are Bob."},"plan":{"prompt":"You are Alice."}}}"#;
        assert!(ensure_agent_prompt(existing, IDENTITY_PROMPT).is_none());
    }

    #[test]
    fn ensure_agent_prompt_seeds_missing_agents_without_touching_customized_ones() {
        // build is user-customized (no marker) → left alone; plan is missing →
        // gets seeded. So the call still reports a change and returns JSON.
        let existing = r#"{"agent":{"build":{"prompt":"You are Bob, a lab helper."}}}"#;
        let out = ensure_agent_prompt(existing, IDENTITY_PROMPT).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["agent"]["build"]["prompt"], "You are Bob, a lab helper.");
        assert_eq!(v["agent"]["plan"]["prompt"], IDENTITY_PROMPT);
    }

    #[test]
    fn ensure_agent_prompt_refreshes_our_older_seed() {
        let old = "Old ZeroWall prompt. ZW-IDENTITY-V0 marker.";
        let existing = format!(
            r#"{{"agent":{{"build":{{"prompt":{}}},"plan":{{"prompt":{}}}}}}}"#,
            json!(old),
            json!(old)
        );
        let out = ensure_agent_prompt(&existing, IDENTITY_PROMPT).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["agent"]["build"]["prompt"], IDENTITY_PROMPT);
        assert_eq!(v["agent"]["plan"]["prompt"], IDENTITY_PROMPT);
    }

    #[test]
    fn ensure_agent_prompt_preserves_other_fields_and_keys() {
        // build has an unrelated sibling field (kept); plan is user-customized
        // (no marker) so its prompt survives; unrelated top-level keys survive.
        let existing = r#"{"model":"kimi/kimi-k3","agent":{"build":{"temperature":0.3},"plan":{"prompt":"user plan prompt"}}}"#;
        let out = ensure_agent_prompt(existing, IDENTITY_PROMPT).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["agent"]["build"]["prompt"], IDENTITY_PROMPT);
        assert_eq!(v["agent"]["build"]["temperature"], 0.3);
        assert_eq!(v["agent"]["plan"]["prompt"], "user plan prompt");
        assert_eq!(v["model"], "kimi/kimi-k3");
    }

    #[test]
    fn identity_forbids_disclosing_internal_provider_ids() {
        // The user-facing identity must explicitly forbid leaking internal
        // routing strings (provider ids like `zerowall-<group>`, path prefixes
        // like `sub2api/…`) — this is the guardrail the app relies on to
        // stop the assistant self-reporting as `sub2api/gpt-5.5`.
        assert!(IDENTITY_PROMPT.contains("provider id"));
        assert!(IDENTITY_PROMPT.contains("zerowall-"));
    }
}
