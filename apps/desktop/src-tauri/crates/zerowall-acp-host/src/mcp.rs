use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

const DISCOVERY_GUARD_PERMISSION: &str = "zerowall_mcp_discovery_guard";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum McpCapabilityState {
    Available,
    Starting,
    Ready,
    Deferred,
    NeedsApproval,
    Error,
    Disabled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum McpPermissionAction {
    Ask,
    Deny,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum McpToolEffect {
    ReadOnly,
    Mutation,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolGrant {
    pub tool_id: String,
    pub effect: McpToolEffect,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpBridgeGrant {
    pub server_id: String,
    pub tools: Vec<McpToolGrant>,
    pub project_root: String,
    pub session_id: String,
    pub frame_id: String,
}

impl McpBridgeGrant {
    pub fn new(
        server_id: impl Into<String>,
        tools: Vec<McpToolGrant>,
        project_root: impl Into<String>,
        session_id: impl Into<String>,
        frame_id: impl Into<String>,
    ) -> Result<Self, String> {
        let server_id = required_identity(server_id.into(), "server id")?;
        let project_root = required_identity(project_root.into(), "project root")?;
        let session_id = required_identity(session_id.into(), "session id")?;
        let frame_id = required_identity(frame_id.into(), "frame id")?;
        if tools.is_empty() {
            return Err("MCP bridge requires at least one tool grant".into());
        }
        let mut normalized = BTreeMap::new();
        for mut tool in tools {
            tool.tool_id = required_identity(tool.tool_id, "tool id")?;
            if tool.tool_id == "*" {
                return Err("MCP bridge requires exact tool ids".into());
            }
            if normalized
                .insert(tool.tool_id.clone(), tool.effect)
                .is_some()
            {
                return Err(format!("duplicate MCP tool id: {}", tool.tool_id));
            }
        }
        let tools = normalized
            .into_iter()
            .map(|(tool_id, effect)| McpToolGrant { tool_id, effect })
            .collect();
        Ok(Self {
            server_id,
            tools,
            project_root,
            session_id,
            frame_id,
        })
    }

    pub fn effect_for_tool(&self, tool_id: &str) -> Option<McpToolEffect> {
        self.tools
            .iter()
            .find(|tool| tool.tool_id == tool_id)
            .map(|tool| tool.effect)
    }
}

fn required_identity(value: String, field: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() {
        Err(format!("MCP bridge {field} is required"))
    } else {
        Ok(value.to_owned())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpPermissionRule {
    pub permission: String,
    pub pattern: String,
    pub action: McpPermissionAction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSessionPolicy {
    pub state: McpCapabilityState,
    pub permissions: Vec<McpPermissionRule>,
}

impl McpSessionPolicy {
    pub fn from_session_permissions(permissions: Vec<McpPermissionRule>) -> Self {
        let has_discovery_guard = permissions
            .iter()
            .any(|rule| rule.permission == DISCOVERY_GUARD_PERMISSION);
        let direct_permissions = permissions
            .iter()
            .filter_map(|rule| {
                rule.pattern
                    .strip_prefix("mcp:")
                    .and_then(|pattern| pattern.strip_suffix(":*"))
            })
            .map(|server| format!("{}_*", sanitize(server)))
            .collect::<BTreeSet<_>>();
        let permissions = permissions
            .into_iter()
            .filter(|rule| {
                (has_discovery_guard && rule.permission == "*" && rule.pattern == "*")
                    || rule.permission == DISCOVERY_GUARD_PERMISSION
                    || rule.pattern.starts_with("mcp:")
                    || direct_permissions.contains(&rule.permission)
            })
            .collect::<Vec<_>>();
        let state = permissions
            .iter()
            .rev()
            .find(|rule| rule.permission == DISCOVERY_GUARD_PERMISSION)
            .map(|rule| rule.action)
            .filter(|action| *action == McpPermissionAction::Deny)
            .map_or(McpCapabilityState::Available, |_| McpCapabilityState::Error);
        Self { state, permissions }
    }

    pub fn has_rule(&self, permission: &str, pattern: &str, action: McpPermissionAction) -> bool {
        self.permissions.iter().any(|rule| {
            rule.permission == permission && rule.pattern == pattern && rule.action == action
        })
    }

    pub fn action_for(
        &self,
        permission: &str,
        resources: &[String],
    ) -> Option<McpPermissionAction> {
        if permission == "read" && !resources.is_empty() {
            let actions = resources.iter().filter_map(|resource| {
                let matched = self.permissions.iter().rev().find(|rule| {
                    wildcard_match(permission, &rule.permission)
                        && wildcard_match(resource, &rule.pattern)
                });
                match matched {
                    Some(rule)
                        if is_global_rule(rule) && self.state != McpCapabilityState::Error =>
                    {
                        resource
                            .starts_with("mcp:")
                            .then_some(McpPermissionAction::Deny)
                    }
                    Some(rule) if is_global_rule(rule) => Some(rule.action),
                    Some(rule) => Some(rule.action),
                    None => resource
                        .starts_with("mcp:")
                        .then_some(McpPermissionAction::Deny),
                }
            });
            return actions.reduce(|current, action| {
                if current == McpPermissionAction::Deny || action == McpPermissionAction::Deny {
                    McpPermissionAction::Deny
                } else {
                    McpPermissionAction::Ask
                }
            });
        }
        self.permissions
            .iter()
            .rev()
            .find(|rule| {
                wildcard_match(permission, &rule.permission) && wildcard_match("*", &rule.pattern)
            })
            .and_then(|rule| {
                (!(is_global_rule(rule) && self.state != McpCapabilityState::Error))
                    .then_some(rule.action)
            })
    }

    pub fn delta_from(&self, previous: &Self) -> Vec<McpPermissionRule> {
        let recovering =
            previous.state == McpCapabilityState::Error && self.state != McpCapabilityState::Error;
        let mut delta = Vec::new();
        if recovering {
            delta.push(McpPermissionRule {
                permission: DISCOVERY_GUARD_PERMISSION.into(),
                pattern: "*".into(),
                action: McpPermissionAction::Ask,
            });
        }

        let current = latest_rules(&self.permissions);
        let prior = latest_rules(&previous.permissions);
        for ((permission, pattern), action) in &current {
            if recovering || prior.get(&(permission.clone(), pattern.clone())) != Some(action) {
                delta.push(McpPermissionRule {
                    permission: permission.clone(),
                    pattern: pattern.clone(),
                    action: *action,
                });
            }
        }
        for ((permission, pattern), action) in prior {
            if (permission == "*" && pattern == "*") || permission == DISCOVERY_GUARD_PERMISSION {
                continue;
            }
            if !current.contains_key(&(permission.clone(), pattern.clone()))
                && action != McpPermissionAction::Deny
            {
                delta.push(McpPermissionRule {
                    permission,
                    pattern,
                    action: McpPermissionAction::Deny,
                });
            }
        }
        delta
    }
}

fn is_global_rule(rule: &McpPermissionRule) -> bool {
    rule.permission == "*" && rule.pattern == "*"
}

fn latest_rules(
    permissions: &[McpPermissionRule],
) -> BTreeMap<(String, String), McpPermissionAction> {
    permissions
        .iter()
        .map(|rule| ((rule.permission.clone(), rule.pattern.clone()), rule.action))
        .collect()
}

pub struct McpCapabilityBroker;

impl McpCapabilityBroker {
    pub fn allows_server(server: &str, allow_list: &[String]) -> bool {
        allow_list
            .iter()
            .any(|entry| entry == "*" || entry == server)
    }

    pub fn resolve<S: AsRef<str>>(available: &[S], allow_list: &[String]) -> McpSessionPolicy {
        let available = available
            .iter()
            .map(|value| value.as_ref().trim())
            .filter(|value| !value.is_empty())
            .collect::<BTreeSet<_>>();
        let mut prefix_counts = BTreeMap::<String, usize>::new();
        for server in &available {
            *prefix_counts.entry(sanitize(server)).or_default() += 1;
        }
        let mut allowed_count = 0;
        let mut permissions = Vec::with_capacity(available.len() * 2);

        for server in &available {
            let resource_action = if Self::allows_server(server, allow_list) {
                allowed_count += 1;
                McpPermissionAction::Ask
            } else {
                McpPermissionAction::Deny
            };
            let prefix = sanitize(server);
            let tool_action = if prefix_counts.get(&prefix).copied().unwrap_or_default() > 1 {
                McpPermissionAction::Deny
            } else {
                resource_action
            };
            permissions.push(McpPermissionRule {
                permission: format!("{prefix}_*"),
                pattern: "*".into(),
                action: tool_action,
            });
            permissions.push(McpPermissionRule {
                permission: "read".into(),
                pattern: format!("mcp:{server}:*"),
                action: resource_action,
            });
        }

        let state = if allowed_count > 0 {
            McpCapabilityState::Ready
        } else if allow_list.is_empty() {
            McpCapabilityState::Disabled
        } else {
            McpCapabilityState::Deferred
        };
        McpSessionPolicy { state, permissions }
    }

    pub fn permission_effect(
        permission: &str,
        resources: &[String],
        allow_list: &[String],
    ) -> Option<McpToolEffect> {
        if permission == "read" && !resources.is_empty() {
            let all_allowed_mcp_resources = resources.iter().all(|resource| {
                resource
                    .strip_prefix("mcp:")
                    .and_then(|value| value.split_once(':').map(|(server, _)| server))
                    .is_some_and(|server| Self::allows_server(server, allow_list))
            });
            return all_allowed_mcp_resources.then_some(McpToolEffect::ReadOnly);
        }
        let matching_servers = allow_list
            .iter()
            .filter(|server| server.as_str() != "*")
            .filter(|server| permission.starts_with(&format!("{}_", sanitize(server))))
            .count();
        (matching_servers == 1
            || (allow_list.iter().any(|server| server == "*")
                && permission.contains('_')
                && !matches!(
                    permission,
                    "external_directory" | "remote_connection" | "dependency_install"
                )))
        .then_some(McpToolEffect::Mutation)
    }

    pub fn discovery_failed() -> McpSessionPolicy {
        McpSessionPolicy {
            state: McpCapabilityState::Error,
            permissions: vec![
                McpPermissionRule {
                    permission: "*".into(),
                    pattern: "*".into(),
                    action: McpPermissionAction::Deny,
                },
                McpPermissionRule {
                    permission: DISCOVERY_GUARD_PERMISSION.into(),
                    pattern: "*".into(),
                    action: McpPermissionAction::Deny,
                },
            ],
        }
    }
}

fn sanitize(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '_' | '-') {
                character
            } else {
                '_'
            }
        })
        .collect()
}

fn wildcard_match(value: &str, pattern: &str) -> bool {
    pattern == "*"
        || pattern
            .strip_suffix('*')
            .is_some_and(|prefix| value.starts_with(prefix))
        || value == pattern
}
