use zerowall_acp_host::mcp::{
    McpBridgeGrant, McpCapabilityBroker, McpCapabilityState, McpPermissionAction,
    McpPermissionRule, McpSessionPolicy, McpToolEffect, McpToolGrant,
};

#[test]
fn session_policies_isolate_servers_and_require_approval() {
    let available = ["datasets", "papers"];

    let papers = McpCapabilityBroker::resolve(&available, &["papers".into()]);
    let datasets = McpCapabilityBroker::resolve(&available, &["datasets".into()]);

    assert_eq!(papers.state, McpCapabilityState::Ready);
    assert!(papers.has_rule("papers_*", "*", McpPermissionAction::Ask));
    assert!(papers.has_rule("datasets_*", "*", McpPermissionAction::Deny));
    assert!(datasets.has_rule("datasets_*", "*", McpPermissionAction::Ask));
    assert!(datasets.has_rule("papers_*", "*", McpPermissionAction::Deny));
    assert!(papers.has_rule("read", "mcp:papers:*", McpPermissionAction::Ask));
    assert!(papers.has_rule("read", "mcp:datasets:*", McpPermissionAction::Deny));
}

#[test]
fn empty_allow_list_exposes_no_configured_mcp_server() {
    let policy = McpCapabilityBroker::resolve(&["datasets", "papers"], &[]);

    assert_eq!(policy.state, McpCapabilityState::Disabled);
    assert!(policy.has_rule("datasets_*", "*", McpPermissionAction::Deny));
    assert!(policy.has_rule("papers_*", "*", McpPermissionAction::Deny));
    assert!(policy.has_rule("read", "mcp:datasets:*", McpPermissionAction::Deny));
    assert!(policy.has_rule("read", "mcp:papers:*", McpPermissionAction::Deny));
}

#[test]
fn discovery_failure_keeps_chat_available_but_fails_tools_closed() {
    let policy = McpCapabilityBroker::discovery_failed();

    assert_eq!(policy.state, McpCapabilityState::Error);
    assert!(policy.has_rule("*", "*", McpPermissionAction::Deny));
}

#[test]
fn wildcard_binding_still_requires_approval_for_mcp_tools() {
    let policy = McpCapabilityBroker::resolve(&["papers"], &["*".into()]);

    assert_eq!(policy.state, McpCapabilityState::Ready);
    assert!(policy.has_rule("papers_*", "*", McpPermissionAction::Ask));
    assert!(policy.has_rule("read", "mcp:papers:*", McpPermissionAction::Ask));
}

#[test]
fn sanitized_server_name_collisions_fail_direct_tools_closed() {
    let policy = McpCapabilityBroker::resolve(&["papers.v1", "papers_v1"], &["papers.v1".into()]);

    assert!(policy.has_rule("papers_v1_*", "*", McpPermissionAction::Deny));
    assert!(!policy.has_rule("papers_v1_*", "*", McpPermissionAction::Ask));
    assert!(policy.has_rule("read", "mcp:papers.v1:*", McpPermissionAction::Ask));
    assert!(policy.has_rule("read", "mcp:papers_v1:*", McpPermissionAction::Deny));
}

#[test]
fn policy_classifies_direct_and_resource_permission_requests() {
    let policy = McpCapabilityBroker::resolve(&["datasets", "papers"], &["papers".into()]);

    assert_eq!(
        policy.action_for("papers_search", &[]),
        Some(McpPermissionAction::Ask)
    );
    assert_eq!(
        policy.action_for("datasets_query", &[]),
        Some(McpPermissionAction::Deny)
    );
    assert_eq!(
        policy.action_for("read", &["mcp:papers:doi:1".into()]),
        Some(McpPermissionAction::Ask)
    );
    assert_eq!(
        policy.action_for("read", &["mcp:datasets:item:1".into()]),
        Some(McpPermissionAction::Deny)
    );
    assert_eq!(
        policy.action_for("read", &["mcp:unknown:item:1".into()]),
        Some(McpPermissionAction::Deny)
    );
    assert_eq!(policy.action_for("bash", &["git status".into()]), None);
}

#[test]
fn policy_delta_appends_only_new_or_changed_rules() {
    let previous = McpCapabilityBroker::resolve(&["papers"], &["papers".into()]);
    let current = McpCapabilityBroker::resolve(&["datasets", "papers"], &["papers".into()]);

    let delta = current.delta_from(&previous);

    assert_eq!(delta.len(), 2);
    assert!(delta.iter().any(|rule| {
        rule.permission == "datasets_*" && rule.action == McpPermissionAction::Deny
    }));
    assert!(delta.iter().any(|rule| {
        rule.permission == "read"
            && rule.pattern == "mcp:datasets:*"
            && rule.action == McpPermissionAction::Deny
    }));
    assert!(current.delta_from(&current).is_empty());
}

#[test]
fn recovery_from_fail_closed_restores_only_explicit_mcp_rules() {
    let failed = McpCapabilityBroker::discovery_failed();
    let recovered = McpCapabilityBroker::resolve(&["datasets", "papers"], &["papers".into()]);

    let delta = recovered.delta_from(&failed);

    assert!(!delta.iter().any(|rule| {
        rule.permission == "*" && rule.pattern == "*" && rule.action == McpPermissionAction::Ask
    }));
    assert!(delta.iter().any(|rule| {
        rule.permission == "datasets_*" && rule.action == McpPermissionAction::Deny
    }));
    assert!(delta
        .iter()
        .any(|rule| { rule.permission == "papers_*" && rule.action == McpPermissionAction::Ask }));
}

#[test]
fn recovery_marker_does_not_reclassify_ordinary_permissions_as_mcp() {
    let failed = McpCapabilityBroker::discovery_failed();
    let recovered = McpCapabilityBroker::resolve(&["papers"], &["papers".into()]);
    let mut cumulative = failed;
    let delta = recovered.delta_from(&cumulative);
    cumulative.state = recovered.state;
    cumulative.permissions.extend(delta);

    assert_eq!(cumulative.action_for("bash", &["git status".into()]), None);
    assert_eq!(
        cumulative.action_for("papers_search", &[]),
        Some(McpPermissionAction::Ask)
    );
}

#[test]
fn loaded_policy_ignores_unrelated_session_permission_rules() {
    let policy = McpSessionPolicy::from_session_permissions(vec![
        McpPermissionRule {
            permission: "bash".into(),
            pattern: "*".into(),
            action: McpPermissionAction::Ask,
        },
        McpPermissionRule {
            permission: "papers_*".into(),
            pattern: "*".into(),
            action: McpPermissionAction::Ask,
        },
        McpPermissionRule {
            permission: "read".into(),
            pattern: "mcp:papers:*".into(),
            action: McpPermissionAction::Ask,
        },
    ]);

    assert_eq!(policy.action_for("bash", &["git status".into()]), None);
    assert_eq!(
        policy.action_for("papers_search", &[]),
        Some(McpPermissionAction::Ask)
    );
}

#[test]
fn loaded_global_deny_without_the_host_guard_is_not_treated_as_discovery_failure() {
    let loaded = McpSessionPolicy::from_session_permissions(vec![McpPermissionRule {
        permission: "*".into(),
        pattern: "*".into(),
        action: McpPermissionAction::Deny,
    }]);
    let current = McpCapabilityBroker::resolve(&["papers"], &["papers".into()]);

    assert_eq!(loaded.state, McpCapabilityState::Available);
    assert_eq!(loaded.action_for("bash", &["git status".into()]), None);
    assert!(!current.delta_from(&loaded).iter().any(|rule| {
        rule.permission == "*" && rule.pattern == "*" && rule.action == McpPermissionAction::Ask
    }));
}

#[test]
fn the_host_discovery_guard_survives_session_reload() {
    let failed = McpCapabilityBroker::discovery_failed();
    let loaded = McpSessionPolicy::from_session_permissions(failed.permissions);

    assert_eq!(loaded.state, McpCapabilityState::Error);
}

#[test]
fn removing_an_allowed_server_appends_explicit_denies() {
    let previous = McpCapabilityBroker::resolve(&["datasets", "papers"], &["papers".into()]);
    let current = McpCapabilityBroker::resolve(&["datasets"], &["papers".into()]);

    let delta = current.delta_from(&previous);

    assert!(delta
        .iter()
        .any(|rule| { rule.permission == "papers_*" && rule.action == McpPermissionAction::Deny }));
    assert!(delta.iter().any(|rule| {
        rule.pattern == "mcp:papers:*" && rule.action == McpPermissionAction::Deny
    }));
}

#[test]
fn restricted_bridge_grant_carries_identity_and_classifies_exact_tool_ids() {
    let grant = McpBridgeGrant::new(
        "papers",
        vec![
            McpToolGrant {
                tool_id: "search".into(),
                effect: McpToolEffect::ReadOnly,
            },
            McpToolGrant {
                tool_id: "save_note".into(),
                effect: McpToolEffect::Mutation,
            },
        ],
        "C:/science",
        "session-1",
        "frame-1",
    )
    .unwrap();

    assert_eq!(grant.server_id, "papers");
    assert_eq!(grant.project_root, "C:/science");
    assert_eq!(grant.session_id, "session-1");
    assert_eq!(grant.frame_id, "frame-1");
    assert_eq!(
        grant.effect_for_tool("search"),
        Some(McpToolEffect::ReadOnly)
    );
    assert_eq!(
        grant.effect_for_tool("save_note"),
        Some(McpToolEffect::Mutation)
    );
    assert_eq!(grant.effect_for_tool("delete_all"), None);
}

#[test]
fn wildcard_bridge_tools_are_rejected() {
    let error = McpBridgeGrant::new(
        "papers",
        vec![McpToolGrant {
            tool_id: "*".into(),
            effect: McpToolEffect::Mutation,
        }],
        "C:/science",
        "session-1",
        "frame-1",
    )
    .unwrap_err();
    assert!(error.contains("exact tool ids"));
}

#[test]
fn restricted_bridge_rejects_missing_identity_and_duplicate_tool_ids() {
    assert!(McpBridgeGrant::new("", Vec::new(), "C:/science", "session-1", "frame-1",).is_err());
    assert!(
        McpBridgeGrant::new("papers", Vec::new(), "C:/science", "session-1", "frame-1",).is_err()
    );
    assert!(McpBridgeGrant::new(
        "papers",
        vec![
            McpToolGrant {
                tool_id: "search".into(),
                effect: McpToolEffect::ReadOnly,
            },
            McpToolGrant {
                tool_id: "search".into(),
                effect: McpToolEffect::Mutation,
            },
        ],
        "C:/science",
        "session-1",
        "frame-1",
    )
    .is_err());
}

#[test]
fn wildcard_server_binding_classifies_direct_tool_permissions_as_mutations() {
    assert_eq!(
        McpCapabilityBroker::permission_effect("papers_save_note", &[], &["*".into()]),
        Some(McpToolEffect::Mutation)
    );
    assert_eq!(
        McpCapabilityBroker::permission_effect("bash", &["git status".into()], &["*".into()]),
        None
    );
}
