# App Operator

`app-operator` lets one agent session temporarily operate the desktop app: create
or switch conversations, navigate between app surfaces, send follow-up messages,
and then return to the session that started the operation.

The operator is a protocol, not a page-specific automation script. It must stay
stable as the UI changes.

## Product Identity

This feature is a session-scoped app operator.

It is not:

- a coordinate-clicking UI robot;
- a replacement for Jupyter MCP, filesystem MCP, or scientific tools;
- a way to bypass approval, permissions, or user control.

## Core Concepts

### Controller Session

The session that invokes `app-operator` becomes the controller session while it
holds a control lease.

The controller session is special:

- it owns the active app-control lease;
- it is visually marked in the sidebar and session header;
- app-control calls must be tied to it;
- the app can always return to it after operating elsewhere.

The agent must not guess the controller session ID from text. The app should
inject an operator token when a session invokes the operator skill. The
app-control layer resolves that token to the real session and window.

### Control Lease

Only one actor may operate one app window at a time. A lease enforces that rule.

```ts
type AppControlLease = {
  leaseId: string;
  ownerSessionId: string;
  ownerWindowId: string;
  originRoute: string;
  currentRoute: string;
  reason: string;
  status: "active" | "released" | "expired" | "interrupted";
  expiresAt: number;
};
```

Rules:

- no app-control mutation is allowed without an active lease;
- a window can have at most one active lease;
- leases always expire;
- user interaction may interrupt a lease;
- high-risk actions still require normal approval.

## Minimal API

The app-control API should stay small and generic.

```ts
app.acquire_control({
  operatorToken,
  reason,
  ttlMs
})

app.release_control({
  leaseId
})

app.get_state({
  leaseId
})

app.navigate({
  leaseId,
  target
})

app.perform_action({
  leaseId,
  actionId,
  params
})

app.wait_until_idle({
  leaseId,
  scope,
  timeoutMs
})

app.create_conversation({
  leaseId,
  title,
  workspace
})

app.send_message({
  leaseId,
  sessionId,
  text
})

app.return_to_owner({
  leaseId
})
```

`return_to_owner` is required. It switches the app back to
`lease.ownerSessionId`, restores the relevant session route/pane state where
possible, and returns focus to the controller session.

## State Shape

`get_state` should report app state, not React internals.

```ts
type AppControlState = {
  route: string;
  activeSessionId: string | null;
  controllerSessionId: string | null;
  lease: AppControlLease | null;
  busy: boolean;
  busyReason: string | null;
  availableActions: AppAction[];
};
```

## Action Registry

Pages expose capabilities through an action registry. The operator skill uses
action IDs and schemas, not page implementation details.

```ts
type AppAction = {
  id: string;
  label: string;
  risk: "low" | "ask" | "high";
  paramsSchema: unknown;
};
```

Examples:

```ts
[
  {
    id: "route.open",
    label: "Open route",
    risk: "low",
    paramsSchema: { target: "sessions|files|notebooks|runs|settings" }
  },
  {
    id: "conversation.create",
    label: "Create conversation",
    risk: "low",
    paramsSchema: { title: "string?" }
  },
  {
    id: "settings.set_model",
    label: "Set default model",
    risk: "ask",
    paramsSchema: { model: "string" }
  }
]
```

Adding a page should usually add or update actions, not rewrite the
`app-operator` skill.

## Busy And Interruption

`acquire_control` returns `busy` when the app cannot safely hand over the
window. Common reasons:

- another lease is active;
- the user is typing in a composer or editor;
- a notebook cell is running;
- a settings form has unsaved input;
- a drag, picker, modal, or approval dialog is active.

If the user manually operates the app during a lease, the app should mark the
lease as `interrupted`. The controller session badge should show the interruption
until the user or agent acknowledges it.

## Visual Treatment

The controller session must be visible.

Required UI signals:

- sidebar session row has a `Controller` or `Operating` badge;
- session header shows that this session owns app control;
- if the app is viewing another route/session, a compact affordance returns to
  the controller session;
- released, expired, and interrupted leases are recorded as session events.

The marker is temporary runtime state, not a permanent session type.

## Skill Behavior

The `app-operator` skill should follow this loop:

1. Acquire control with the injected operator token.
2. Read `get_state`.
3. Use `availableActions` to choose generic actions.
4. Wait for idle after each navigation or mutation.
5. Return to the controller session.
6. Release control.

The skill must not:

- modify `.ipynb` JSON directly when Jupyter MCP is available;
- duplicate filesystem or Jupyter MCP behavior;
- change providers, credentials, MCP servers, or remote connections without
  approval;
- continue indefinitely. Any self-dialogue must have a goal, a maximum turn
  count, and a stop condition.

## Safety Defaults

Low-risk actions may run under a valid lease. Examples: route navigation,
session switching, creating a blank conversation, returning to the controller
session.

Ask-level actions require explicit approval. Examples: changing default model,
changing workspace base, enabling an MCP connector, executing notebook cells.

High-risk actions must use existing approval flows and may be denied by policy.
Examples: installing dependencies, deleting files, writing credentials,
connecting remote services, shell execution, and network access.

The control lease never grants broader runtime permissions.

## Non-Goals

- No browser-style DOM selector automation.
- No coordinate clicking.
- No page-specific skill rewrites.
- No replacement for existing MCP servers.
- No hidden background operation while the user is actively editing.
