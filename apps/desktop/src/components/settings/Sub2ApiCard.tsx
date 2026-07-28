import { useEffect, useMemo, useState } from "react";
import { Check, KeyRound, Loader2, LogOut, RefreshCw, Sparkles, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  isTauri,
  sub2apiAccount,
  sub2apiBalance,
  sub2apiFetchGroups,
  sub2apiLogin,
  sub2apiLogout,
  sub2apiProvisionGroup,
  sub2apiProvisionGroups,
  sub2apiRegister,
  sub2apiRestoreSession,
  sub2apiSendCode,
  type Sub2ApiAccount,
} from "@/lib/tauri";
import { isGatewayWeb } from "@/lib/webMode";
import { getClient, useRuntimeStore } from "@/lib/runtime";
import { Section } from "./Section";
import { RechargeDialog } from "./RechargeDialog";
import { inputCls } from "./inputCls";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";

/** Namespace every gateway-provisioned provider lives under. The old
 *  `"sub2api"` id leaked the internal gateway name into fully-qualified model
 *  refs the model then echoed back at the user ("sub2api/gpt-5.5"). A neutral
 *  brand prefix keeps the assistant's identity clean while a per-group suffix
 *  keeps one group's key from overwriting another. See `providerIdForGroup`. */
const PROVIDER_NAMESPACE = "zerowall";

/** Substrings that mark a model as one of the domestic families this app leads
 *  with. Used only for ordering and a badge — nothing is hidden. */
const DOMESTIC = ["kimi", "moonshot", "deepseek", "glm", "zhipu", "qwen", "qwq", "ernie", "hunyuan", "minimax", "step", "baichuan", "yi-"];

export function isDomesticModel(id: string): boolean {
  const lower = id.toLowerCase();
  return DOMESTIC.some((needle) => lower.includes(needle));
}

/** Only these groups are open to users right now. The gateway exposes many more
 *  channels (codex, claude-reverse, test, science, …), but the product
 *  deliberately ships just the domestic-model channel and the GPT channel so a
 *  customer cannot switch into an unsupported or unpriced group by hand. Match is
 *  by name: "国产模型" and "GPT模型分组". Domestic stays first — it holds the
 *  default kimi-k3. Exported for the test — the allowlist is the feature. */
const OPEN_GROUP = /国产|GPT/i;

export function openGroups<T extends { name: string }>(groups: T[]): T[] {
  const open = groups.filter((g) => OPEN_GROUP.test(g.name));
  // If the gateway ever renames both away, fall back to the full list so a
  // signed-in user is never stranded with no channel at all.
  return open.length > 0 ? open : groups;
}

/** Domestic models first, then everything else, alphabetical within each group.
 *  Exported for the test — the ordering is the feature, not decoration. */
export function orderModels(models: string[]): string[] {
  return [...new Set(models)].sort((a, b) => {
    const da = isDomesticModel(a);
    const db = isDomesticModel(b);
    if (da !== db) return da ? -1 : 1;
    return a.localeCompare(b);
  });
}

/** The model the app defaults to after provisioning. The product leads with
 *  Kimi, so prefer the newest Kimi the account actually has, then any Kimi,
 *  then any other domestic model, then whatever is first. Exported for the
 *  test — the preference is the feature. */
const DEFAULT_MODEL_PREFERENCE = ["kimi-k3", "kimi"];

export function pickDefaultModel(models: string[]): string | undefined {
  for (const pref of DEFAULT_MODEL_PREFERENCE) {
    const hit = models.find((m) => m.toLowerCase().includes(pref));
    if (hit) return hit;
  }
  return models.find(isDomesticModel) ?? models[0];
}

/** Provider id a group's key is registered under. A gateway key is scoped to a
 *  single group, so each open group becomes its own OpenCode provider. Every
 *  group — including the primary — gets a `zerowall-<groupId>` id: one uniform
 *  rule, no bare special case. The old bare `"sub2api"` id collapsed all groups
 *  onto one keychain entry (so switching from a domestic key to the GPT key
 *  overwrote it and `list_models` came back for the wrong group), and it leaked
 *  the internal gateway name into fully-qualified model refs the model echoed
 *  back at the user. `primaryGroupId` is kept in the signature to preserve the
 *  call sites — it no longer affects the mapping. Exported for the test. */
export function providerIdForGroup(groupId: number, _primaryGroupId: number): string {
  void _primaryGroupId;
  return `${PROVIDER_NAMESPACE}-${groupId}`;
}

type Mode = "signIn" | "register";

const MODES: Mode[] = ["signIn", "register"];

/** Upstream API protocol the provider speaks. OpenCode picks the wire format
 *  from the AI-SDK adapter (`npm`): the openai-compatible adapter calls
 *  `/v1/chat/completions`, the openai adapter calls `/v1/responses`. Default to
 *  Chat Completions — the gateway only carries image parts on that protocol
 *  (Responses drops them, so image analysis fails); the user can still opt into
 *  Responses for a text-only, Responses-native gateway. */
type Protocol = "chat" | "responses";

const PROTOCOL_KEY = "sub2api.protocol";
// Default (chat) first so the toggle reads default → alternative left-to-right.
const PROTOCOLS: Protocol[] = ["chat", "responses"];

function loadProtocol(): Protocol {
  try {
    return localStorage.getItem(PROTOCOL_KEY) === "responses" ? "responses" : "chat";
  } catch {
    return "chat";
  }
}

/** The AI-SDK adapter that speaks the chosen protocol. */
function npmForProtocol(p: Protocol): string {
  return p === "responses" ? "@ai-sdk/openai" : "@ai-sdk/openai-compatible";
}

/** Marks a domestic model in the chip list. Decorative — the label is the id. */
const DOMESTIC_MARK = "★";

/**
 * Sub2API account panel: sign in or register with an email and password, then
 * pull the account's key and model list in one click.
 *
 * Desktop only. The gateway web client rejects provider config writes and the
 * `/auth` route by design (`gateway.rs`), so the panel is hidden there rather
 * than shipped as a form that 403s.
 *
 * No credential passes through this component. The access token stays in the
 * Rust process for the app run; the API key goes from the gateway's reply
 * straight into the OS credential manager. All this component ever sees is an
 * email, a base URL, and a list of model ids.
 */
export function Sub2ApiCard({ onLogin, bare }: { onLogin?: () => void; bare?: boolean } = {}) {
  const { t } = useTranslation(["settings", "common"]);
  const loadCatalog = useRuntimeStore((s) => s.loadCatalog);

  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [account, setAccount] = useState<Sub2ApiAccount | null>(null);
  const [busy, setBusy] = useState<null | "auth" | "code" | "fetch" | "connect">(null);
  const [groups, setGroups] = useState<Array<{ id: number; name: string }>>([]);
  const [existingKeyGroupIds, setExistingKeyGroupIds] = useState<number[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [baseUrl, setBaseUrl] = useState("");
  const [manual, setManual] = useState("");
  const [balance, setBalance] = useState<string | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [protocol, setProtocol] = useState<Protocol>(loadProtocol);

  // Best-effort balance fetch — a gateway that has no billing surface just
  // leaves the amount hidden rather than surfacing an error to the user.
  const refreshBalance = () => {
    void sub2apiBalance()
      .then((b) => setBalance(b.balance))
      .catch(() => setBalance(null));
  };

  // A session survives navigating away from Settings, so ask on mount. If none
  // is live yet, try restoring one from keychain-saved credentials so the user
  // is not asked to sign in again after quitting and relaunching.
  useEffect(() => {
    if (!isTauri || isGatewayWeb) return;
    let cancelled = false;
    void (async () => {
      try {
        const live = await sub2apiAccount();
        const acct = live ?? (await sub2apiRestoreSession());
        if (cancelled) return;
        setAccount(acct);
        if (acct) refreshBalance();
      } catch {
        if (!cancelled) setAccount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ordered = useMemo(() => (models ? orderModels(models) : []), [models]);

  if (!isTauri || isGatewayWeb) return null;

  const fail = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : String(err));

  // After a fresh sign-in, stand up the AI 平台 provider without making the
  // user click through Fetch → Save → pick a model: fetch the account's
  // groups, provision the domestic-leaning one, register the provider, and
  // default to Kimi. Best-effort — a failure leaves the account signed in and
  // the manual Fetch/Save controls available.
  const autoSetup = async () => {
    setBusy("fetch");
    try {
      const res = await sub2apiFetchGroups();
      const visible = openGroups(res.groups);
      setGroups(visible);
      setExistingKeyGroupIds(res.existingKeyGroupIds);
      const primary =
        visible.find((g) => /国产|domestic/i.test(g.name)) ??
        visible.find((g) => /default/i.test(g.name)) ??
        visible[0];
      if (!primary) return;
      setSelectedGroupId(primary.id);
      // Provision every open group in one pass — one key + one provider each — so
      // a model from any open group (e.g. a GPT-family id) resolves to a
      // configured key instead of "not supported by any configured account".
      // Missing keys are created gateway-side; the domestic group keeps the bare
      // provider id so kimi-k3 stays the default.
      const requests = visible.map((g) => ({
        groupId: g.id,
        providerId: providerIdForGroup(g.id, primary.id),
      }));
      const provisioned = await sub2apiProvisionGroups(requests);
      if (provisioned.length === 0) return;
      // Reflect the primary group's models in the picker so the manual controls
      // stay populated; the auto-registration below covers every group.
      const primaryProv =
        provisioned.find((p) => p.groupId === primary.id) ?? provisioned[0];
      setBaseUrl(primaryProv.baseUrl);
      setModels(primaryProv.models);
      const domestic = primaryProv.models.filter(isDomesticModel);
      const chosen = orderModels(domestic.length > 0 ? domestic : primaryProv.models);
      setPicked(new Set(chosen));
      // Provisioning restarts the sidecar in Rust, so the store's "ready" may be
      // stale. Always re-establish the connection before registering — otherwise
      // the config PATCH races a restarting sidecar and the catalog comes back
      // empty ("未连接供应商" / no models).
      const ok = await useRuntimeStore.getState().connectRetry();
      if (!ok) return; // leave the models staged; the 保存 button still works
      // One provider per provisioned group. Non-primary providers are labelled
      // with their group name so they are distinguishable in the model picker.
      for (const p of provisioned) {
        const name =
          p.groupId === primary.id
            ? t("sub2api.providerName")
            : `${t("sub2api.providerName")} · ${
                visible.find((g) => g.id === p.groupId)?.name ?? p.groupId
              }`;
        await getClient()!.addCustomProvider(p.providerId, {
          name,
          npm: npmForProtocol(protocol),
          baseURL: p.baseUrl,
          models: orderModels(p.models),
        });
      }
      // Default model belongs to the primary provider, so it stays alive when
      // the user switches groups: the primary provider id is derived from the
      // primary group id, matching the addCustomProvider call above.
      const def = pickDefaultModel(chosen);
      if (def) {
        const primaryProviderId = providerIdForGroup(primary.id, primary.id);
        await getClient()!.setDefaultModel(`${primaryProviderId}/${def}`);
      }
      await loadCatalog();
      const total = provisioned.reduce((n, p) => n + p.models.length, 0);
      toast.success(t("sub2api.connected", { count: total }));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const sendCode = async () => {
    if (!email.trim()) return;
    setBusy("code");
    try {
      await sub2apiSendCode(email.trim());
      toast.success(t("sub2api.codeSent"));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  // Registration hands off to sign-in rather than logging in on its own: the
  // gateway may require the emailed code before the account can authenticate,
  // and pretending otherwise would strand the user on a spinner.
  const register = async () => {
    setBusy("auth");
    try {
      await sub2apiRegister({
        email: email.trim(),
        password,
        code: code.trim() || undefined,
      });
      toast.success(t("sub2api.registered"));
      setMode("signIn");
      setCode("");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const signIn = async () => {
    setBusy("auth");
    try {
      const acct = await sub2apiLogin({
        email: email.trim(),
        password,
      });
      setAccount(acct);
      setPassword("");
      setCode("");
      refreshBalance();
      toast.success(t("sub2api.signedIn", { email: acct.email }));
      onLogin?.();
      // Provision the channel + default model automatically so the user does
      // not have to configure anything after logging in.
      await autoSetup();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const signOut = async () => {
    await sub2apiLogout().catch(() => {});
    setAccount(null);
    setModels(null);
    setPicked(new Set());
    setBalance(null);
  };

  // Step 1: fetch groups + existing key info, then auto-select the best group.
  const fetchGroups = async () => {
    setBusy("fetch");
    try {
      const res = await sub2apiFetchGroups();
      const visible = openGroups(res.groups);
      setGroups(visible);
      setExistingKeyGroupIds(res.existingKeyGroupIds);
      // Auto-select: prefer domestic-sounding group, else "default", else first.
      const domestic = visible.find((g) =>
        /国产|domestic/i.test(g.name),
      );
      const fallback = domestic ?? visible.find((g) => /default/i.test(g.name));
      const pick = fallback ?? visible[0] ?? null;
      setSelectedGroupId(pick?.id ?? null);
      if (pick) void provisionGroup(pick.id);
      else setBusy(null);
    } catch (err) {
      fail(err);
      setBusy(null);
    }
  };

  // Step 2: provision a specific group — find or create a key, list models.
  const provisionGroup = async (groupId: number) => {
    setBusy("fetch");
    try {
      const res = await sub2apiProvisionGroup(groupId);
      setBaseUrl(res.baseUrl);
      setModels(res.models);
      setPicked(new Set(res.models.filter(isDomesticModel)));
      toast.success(t("sub2api.fetched", { count: res.models.length }));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const addManual = () => {
    const ids = manual
      .split(/[\n,]/)
      .map((m) => m.trim())
      .filter(Boolean);
    if (ids.length === 0) return;
    setModels((prev) => [...new Set([...(prev ?? []), ...ids])]);
    setPicked((prev) => new Set([...prev, ...ids]));
    setManual("");
  };

  // Register the provider WITHOUT an apiKey: the key already sits in the OS
  // credential manager, and writing it into the config file would put a secret
  // on disk in cleartext. After connecting, auto-set the default model to the
  // first domestic model so the user is not stuck on an Anthropic fallback.
  // `proto` lets a caller (the protocol toggle) pass the just-chosen value
  // explicitly: switching calls this before React re-renders, so the `protocol`
  // state would still read stale here.
  const connect = async (proto: Protocol = protocol) => {
    const chosen = ordered.filter((m) => picked.has(m));
    if (chosen.length === 0) {
      toast.error(t("sub2api.pickOne"));
      return;
    }
    // A group must be selected before Save: the provider id is scoped to that
    // group so the key stays namespaced and the fully-qualified model ref never
    // leaks the internal gateway name into the assistant's reply.
    if (selectedGroupId == null) {
      toast.error(t("sub2api.pickOne"));
      return;
    }
    const providerId = providerIdForGroup(selectedGroupId, selectedGroupId);
    const groupName =
      groups.find((g) => g.id === selectedGroupId)?.name ?? String(selectedGroupId);
    setBusy("connect");
    try {
      // Provisioning restarts the sidecar, and the runtime need not already be up
      // to save: always re-establish the connection first, so the Save button is
      // never greyed out because of an offline or stale-ready sidecar, and the
      // config write never races a restart.
      const ok = await useRuntimeStore.getState().connectRetry();
      if (!ok) {
        toast.error(t("sub2api.runtimeOffline"));
        return;
      }
      await getClient()!.addCustomProvider(providerId, {
        name: `${t("sub2api.providerName")} · ${groupName}`,
        npm: npmForProtocol(proto),
        baseURL: baseUrl,
        models: chosen,
      });
      // Auto-set the default model to a domestic one (preferring Kimi),
      // preventing the "Anthropic API key is missing" error for users who
      // only have an AI 平台 key.
      const first = pickDefaultModel(chosen);
      if (first) {
        await getClient()!.setDefaultModel(`${providerId}/${first}`);
      }
      await loadCatalog();
      toast.success(t("sub2api.connected", { count: chosen.length }));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  // Switch the upstream protocol. Persist the choice and, if a provider is
  // already registered, re-register it under the new adapter so the change takes
  // effect without a manual re-save.
  const changeProtocol = (p: Protocol) => {
    if (p === protocol || busy !== null) return;
    setProtocol(p);
    try {
      localStorage.setItem(PROTOCOL_KEY, p);
    } catch {
      /* storage may be unavailable; the in-memory choice still applies */
    }
    if (models !== null && baseUrl && picked.size > 0) void connect(p);
  };

  const canAuth =
    email.trim().length > 0 && password.length >= (mode === "register" ? 6 : 1) && busy === null;

  const content = account ? (
        <div className="space-y-3">
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
            <span className="min-w-0 break-all text-[13px] font-medium text-text">
              {account.email}
            </span>
            <span className="min-w-0 break-all font-mono text-xs text-muted">{account.baseUrl}</span>
            <div className="hidden flex-1 sm:block" />
            {/* Balance + 充值 belong together; the divider keeps them clear of the
                destructive sign-out so neither is clicked by mistake. */}
            <div className="flex shrink-0 items-center gap-2">
              {balance !== null && (
                <span className="font-mono text-xs text-muted" title={t("sub2api.balance")}>
                  ¥ {Number(balance).toFixed(2)}
                </span>
              )}
              <button
                className="flex items-center gap-1 rounded-input border border-faint px-2 py-1 text-xs text-text transition-colors hover:border-accent hover:text-accent"
                onClick={() => setRechargeOpen(true)}
              >
                <Wallet size={12} /> {t("sub2api.recharge")}
              </button>
            </div>
            <span className="hidden h-4 w-px shrink-0 bg-border sm:block" />
            <button
              className="flex shrink-0 items-center gap-1 text-xs text-muted transition-colors hover:text-text sm:ml-1"
              onClick={() => void signOut()}
            >
              <LogOut size={12} /> {t("sub2api.signOut")}
            </button>
          </div>

          {/* Upstream protocol. Some gateways expect /v1/chat/completions,
              others /v1/responses; the adapter OpenCode loads decides the wire
              format. Switching re-registers an already-connected provider. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted">{t("sub2api.protocolLabel")}</span>
            <div className="flex gap-1.5" role="radiogroup" aria-label={t("sub2api.protocolLabel")}>
              {PROTOCOLS.map((p) => {
                const on = protocol === p;
                return (
                  <button
                    key={p}
                    role="radio"
                    aria-checked={on}
                    onClick={() => changeProtocol(p)}
                    disabled={busy !== null}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      on
                        ? "border-accent bg-accent font-semibold text-white shadow-sm"
                        : "border-faint text-muted hover:border-border hover:text-text",
                    )}
                  >
                    {t(p === "responses" ? "sub2api.protocolResponses" : "sub2api.protocolChat")}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className={btn("accent")}
              onClick={() => void fetchGroups()}
              disabled={busy !== null}
            >
              {busy === "fetch" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Sparkles size={13} />
              )}
              {t("sub2api.fetchModels")}
            </button>
            {models !== null && (
              <button
                className={btn("ghost")}
                onClick={() => void connect()}
                disabled={busy !== null || picked.size === 0}
              >
                {busy === "connect" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Check size={13} />
                )}
                {t("sub2api.connectModels", { count: picked.size })}
              </button>
            )}
          </div>

          {/* Group selector — always shown once groups are loaded */}
          {groups.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">
                {t("sub2api.selectGroup")}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g) => {
                  const on = selectedGroupId === g.id;
                  const hasKey = existingKeyGroupIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      aria-pressed={on}
                      onClick={() => {
                        setSelectedGroupId(g.id);
                        setModels(null);
                        setPicked(new Set());
                        void provisionGroup(g.id);
                      }}
                      disabled={busy !== null}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        on
                          ? "border-accent bg-accent/10 font-medium text-text"
                          : "border-faint text-muted hover:text-text",
                      )}
                    >
                      {g.name}
                      {hasKey && (
                        <span className="ml-1 text-[10px] text-ok" title={t("sub2api.keyExists")}>
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted">{t("sub2api.groupHint")}</p>
            </div>
          )}

          {models !== null && (
            <>
              {ordered.length === 0 && (
                <p className="text-xs text-muted">{t("sub2api.noModels")}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {ordered.map((m) => {
                  const on = picked.has(m);
                  return (
                    <button
                      key={m}
                      aria-pressed={on}
                      onClick={() =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (next.has(m)) next.delete(m);
                          else next.add(m);
                          return next;
                        })
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1 font-mono text-xs transition-colors",
                        on
                          ? "border-accent bg-accent/10 text-text"
                          : "border-faint text-muted hover:text-text",
                      )}
                    >
                      {m}
                      {isDomesticModel(m) && (
                        <span className="ml-1 text-accent" aria-hidden>
                          {DOMESTIC_MARK}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addManual();
                  }}
                  placeholder={t("sub2api.manualPlaceholder")}
                  className={inputCls("min-w-0 flex-1 font-mono")}
                />
                <button className={btn("ghost")} onClick={addManual} disabled={!manual.trim()}>
                  {t("sub2api.addModels")}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-1.5" role="tablist">
            {MODES.map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs transition-colors",
                  mode === m ? "bg-accent/10 text-text ring-1 ring-accent" : "text-muted hover:text-text",
                )}
              >
                {t(m === "signIn" ? "sub2api.signIn" : "sub2api.register")}
              </button>
            ))}
          </div>

          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("sub2api.emailPlaceholder")}
            className={inputCls("w-full font-mono")}
          />
          <input
            type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("sub2api.passwordPlaceholder")}
            className={inputCls("w-full font-mono")}
          />
          {mode === "register" && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("sub2api.codePlaceholder")}
                className={inputCls("min-w-0 flex-1 font-mono")}
              />
              <button
                className={btn("ghost")}
                onClick={() => void sendCode()}
                disabled={!email.trim() || busy !== null}
              >
                {busy === "code" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <RefreshCw size={13} />
                )}
                {t("sub2api.sendCode")}
              </button>
            </div>
          )}

          <button
            className={btn("accent")}
            onClick={() => void (mode === "register" ? register() : signIn())}
            disabled={!canAuth}
          >
            {busy === "auth" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <KeyRound size={13} />
            )}
            {t(mode === "register" ? "sub2api.createAccount" : "sub2api.signIn")}
          </button>
          {!bare && (
            <p className="text-xs leading-relaxed text-muted">{t("sub2api.privacy")}</p>
          )}
        </div>
      );

  const recharge = account ? (
    <RechargeDialog
      open={rechargeOpen}
      onClose={() => setRechargeOpen(false)}
      onPaid={refreshBalance}
    />
  ) : null;

  if (bare)
    return (
      <>
        {content}
        {recharge}
      </>
    );

  return (
    <>
      <Section title={t("sub2api.title")} hint={t("sub2api.hint")}>
        {content}
      </Section>
      {recharge}
    </>
  );
}

const btn = (kind: "accent" | "ghost") =>
  cn(
    "flex h-9 shrink-0 items-center gap-1.5 rounded-input px-3.5 text-[13px] transition-colors",
    kind === "accent"
      ? "bg-accent font-medium text-accent-fg hover:bg-accent/90 disabled:bg-accent/50"
      : "border border-transparent bg-surface-2 text-text hover:bg-border/50 disabled:text-muted",
  );
