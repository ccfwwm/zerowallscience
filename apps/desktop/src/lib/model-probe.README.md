# P2: Domestic Model Detection and Gateway Switching

## Overview

Implements automatic detection of Chinese domestic model providers (Kimi, GLM, DeepSeek, Baichuan, MiniMax) with primary/backup gateway failover for network resilience.

## Architecture

### Gateway Switching Logic

**Primary/Backup Gateway Failover:**
- Primary gateway: `https://code.aicodeme.cn`
- Backup gateway: `https://code.aicodeme.xyz`
- Failover triggers ONLY on network errors (timeout, 5xx, connection failures)
- Auth errors (401, 403) and quota errors (429, balance) do NOT trigger failover

**Error Classification:**
```typescript
// Network errors → try backup gateway
- TypeError (fetch failures, CORS, DNS)
- timeout/aborted errors
- 5xx server errors

// Non-network errors → skip provider (no failover)
- 401/403 (authentication)
- 429 (rate limit/quota)
- 4xx client errors
```

### Model Probing

**Supported Providers:**
```typescript
{
  kimi: "https://api.moonshot.cn/v1",
  glm: "https://open.bigmodel.cn/api/paas/v4",
  deepseek: "https://api.deepseek.com",
  baichuan: "https://api.baichuan-ai.com/v1",
  minimax: "https://api.minimax.chat/v1"
}
```

**Probe Flow:**
1. For each provider, try primary gateway first
2. If network error occurs, retry with backup gateway
3. If auth/quota error occurs, skip provider (no retry)
4. Return results with gateway info and latency

### Session Model Snapshots

**Purpose:** Capture exact model configuration at session creation for reproducibility.

**Snapshot Contents:**
```typescript
{
  sessionId: string;
  createdAt: string; // ISO 8601
  role: AgentRole; // general/research/code/data
  model: string; // "provider/model"
  reasoning?: string; // effort level
  gateway?: string; // which gateway was used
  providerBaseURL?: string;
}
```

**Storage:** `sessionStorage` (session-scoped, cleared on browser close)

**Creation:** Automatic on first message send when session is created (see `runtime.ts` line ~645)

### RoleModelBinding Persistence

**Purpose:** Remember user's model preferences per agent role across app restarts.

**Storage:** `localStorage` under key `zerowall.agent.bindings.v1`

**Structure:**
```typescript
{
  general: { role: "general", primary: "...", fallback: "...", reasoning: "..." },
  research: { role: "research", primary: "...", fallback: "...", reasoning: "..." },
  code: { role: "code", primary: "...", fallback: "...", reasoning: "..." },
  data: { role: "data", primary: "...", fallback: "...", reasoning: "..." }
}
```

**Persistence:** Automatic via `setAgentBindings()` in runtime store

## Integration Points

### Settings Page (`SettingsPage.tsx`)

**Domestic Model Probe Button:**
- Location: Models section, Agent subsection
- Action: Calls `probeDomesticModels()` with gateway failover
- Results: Displays detected providers and model counts
- UI State: Shows loading spinner and gateway info in toast

### Runtime Store (`runtime.ts`)

**Session Creation Hook:**
- Triggers: When `createSession()` completes
- Action: Creates and saves model snapshot
- Location: Line ~639-659 (after session ID is generated)
- Non-blocking: Snapshot save errors are logged but don't fail session creation

**Agent Bindings:**
- `selectedAgent`: Current role (persisted to localStorage)
- `agentBindings`: Role-to-model mappings (persisted to localStorage)
- `setSelectedAgent()`: Updates role and persists
- `setAgentBindings()`: Updates bindings and persists

## API Reference

### Functions

**`probeDomesticModels(gateways?, apiKeys?)`**
- Probes all domestic providers through gateways with failover
- Returns: `Record<provider, ProbeResult>`
- ProbeResult includes: provider, models, gateway, latency

**`classifyProbeError(error)`**
- Classifies errors for gateway switching decisions
- Returns: `"network" | "auth" | "quota" | "other"`

**`createModelSnapshot(sessionId, role, model, ...)`**
- Creates a session model snapshot
- Returns: `SessionModelSnapshot`

**`saveSessionSnapshot(snapshot)`**
- Saves snapshot to sessionStorage
- Key: `zerowall:session:{sessionId}`

**`loadSessionSnapshot(sessionId)`**
- Loads snapshot from sessionStorage
- Returns: `SessionModelSnapshot | null`

**`saveRoleBindings(bindings)`**
- Saves role-model bindings to localStorage
- Key: `zerowall:roleModelBindings`

**`loadRoleBindings()`**
- Loads role-model bindings from localStorage
- Returns: `Record<AgentRole, RoleModelBinding> | null`

## Testing

Unit tests cover:
- ✅ Error classification (network vs auth vs quota)
- ✅ Gateway failover on network errors
- ✅ No failover on auth/quota errors
- ✅ RoleModelBinding persistence
- ✅ Session snapshot creation and retrieval
- ✅ Corrupted data handling

Run tests: `npm test model-probe.test.ts`

## Security Considerations

1. **API Keys:** Never logged or exposed in snapshots/errors
2. **Gateway URLs:** Hardcoded defaults, tenant isolation supported
3. **Error Messages:** Classified before logging (no sensitive data leak)
4. **Storage:** localStorage for bindings, sessionStorage for snapshots (cleared on close)

## Future Enhancements

- [ ] Dynamic gateway discovery (fetch from config endpoint)
- [ ] Gateway health monitoring (latency tracking, automatic selection)
- [ ] Model capability detection (context window, features)
- [ ] Snapshot export/import for reproducible research
- [ ] Multi-tenant gateway routing by API key prefix
