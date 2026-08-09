import { useEffect, useMemo, useRef, useState } from "react";
import { Check, KeyRound, Loader2, LogOut, RefreshCw, Sparkles, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  isTauri,
  sub2apiAccount,
  sub2apiBalance,
  sub2apiFetchGroups,
  sub2apiLogin,
  sub2apiLogout,
  sub2apiProvisionGroups,
  sub2apiRegister,
  sub2apiRestoreSession,
  sub2apiSendCode,
  type Sub2ApiAccount,
} from "@/lib/tauri";
import { isGatewayWeb } from "@/lib/webMode";
import { getProviderControlClient, useRuntimeStore } from "@/lib/runtime";
import {
  deriveAcpConfigs,
  isDomesticModel,
  loadProtocol,
  npmForProtocol,
  openGroups,
  orderModels,
  pickDefaultModel,
  PROTOCOL_KEY,
  providerIdForGroup,
  type Protocol,
  type ProvisionedGroupNamed,
} from "@/lib/sub2api-provision";
import { clearAcpConfig, saveAcpConfig } from "@/lib/acp-config";
import { Section } from "./Section";
import { RechargeDialog } from "./RechargeDialog";
import { inputCls } from "./inputCls";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";

// The pure provisioning helpers moved to `@/lib/sub2api-provision` so the
// runtime store can share them without a circular import. Re-exported here so
// existing test imports (`./Sub2ApiCard`) keep resolving.
export { isDomesticModel, openGroups, orderModels, pickDefaultModel, providerIdForGroup };

/** Derive and persist the Claude Code / Codex launch configs from the groups
 *  just provisioned, so the ACP runtimes route through the gateway. */
function writeAcpConfigs(provisioned: ProvisionedGroupNamed[]): void {
  const { claudeCode, codex } = deriveAcpConfigs(provisioned);
  if (claudeCode) saveAcpConfig("claude-code", claudeCode);
  if (codex) saveAcpConfig("codex", codex);
}

type Mode = "signIn" | "register";

const MODES: Mode[] = ["signIn", "register"];

// Default (chat) first so the toggle reads default → alternative left-to-right.
const PROTOCOLS: Protocol[] = ["chat", "responses"];

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
  const runtimeStatus = useRuntimeStore((s) => s.status);
  const providers = useRuntimeStore((s) => s.providers);

  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [account, setAccount] = useState<Sub2ApiAccount | null>(null);
  const [busy, setBusy] = useState<null | "auth" | "code" | "fetch" | "connect">(null);
  const [groups, setGroups] = useState<Array<{ id: number; name: string }>>([]);
  const [provisionedGroups, setProvisionedGroups] = useState<ProvisionedGroupNamed[]>([]);
  const [models, setModels] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [manualModels, setManualModels] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState("");
  const [balance, setBalance] = useState<string | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [protocol, setProtocol] = useState<Protocol>(loadProtocol);

  // Tracks the last account email for which auto-setup was triggered, so we
  // run it at most once per account per mount (not on every re-render).
  const autoSetupAccountRef = useRef<string | null>(null);

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

  // After a restart the session is restored (above) but providers are never
  // re-registered — autoSetup only ran during the original sign-in. Once
  // the runtime is ready and the account is live but the catalog is still empty,
  // trigger it automatically so the model picker fills in without a manual
  // "一键获取模型" click. Runs at most once per account per mount.
  //
  // Triggers in both OpenCode mode (runtimeStatus === "ready") and ACP mode
  // (runtimeStatus === "ready" with ACP agent, but OpenCode sidecar in background).
  useEffect(() => {
    if (!isTauri || isGatewayWeb) return;
    // Wait for some runtime to be ready (OpenCode or ACP).
    if (runtimeStatus !== "ready") return;
    // Need an account and empty providers to trigger.
    if (!account || providers.length > 0) return;
    // Run at most once per account email per mount.
    if (autoSetupAccountRef.current === account.email) return;
    autoSetupAccountRef.current = account.email;
    void autoSetup();
    // autoSetup closes over stable setState refs; exhaustive-deps would add it
    // to the array and re-run on every render. The ref guard makes this safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeStatus, account, providers.length]);

  const ordered = useMemo(() => (models ? orderModels(models) : []), [models]);

  if (!isTauri || isGatewayWeb) return null;

  const fail = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : String(err));

  const provisionAllGroups = async () => {
    const res = await sub2apiFetchGroups();
    const visible = openGroups(res.groups);
    setGroups(visible);
    const primary =
      visible.find((group) => /国产|domestic/i.test(group.name)) ??
      visible.find((group) => /default/i.test(group.name)) ??
      visible[0];
    if (!primary) {
      setProvisionedGroups([]);
      setModels([]);
      setPicked(new Set());
      return { primary: null, provisioned: [] as ProvisionedGroupNamed[] };
    }

    const provisioned = await sub2apiProvisionGroups(
      visible.map((group) => ({
        groupId: group.id,
        providerId: providerIdForGroup(group.id, primary.id),
      })),
    );
    const named = provisioned.map((group) => ({
      ...group,
      name: visible.find((candidate) => candidate.id === group.groupId)?.name ?? String(group.groupId),
    }));
    setProvisionedGroups(named);
    writeAcpConfigs(named);

    const aggregated = orderModels(named.flatMap((group) => group.models));
    const domestic = aggregated.filter(isDomesticModel);
    setModels(aggregated);
    setPicked(new Set(domestic.length > 0 ? domestic : aggregated));
    setManualModels(new Set());
    return { primary, provisioned: named };
  };

  // After a fresh sign-in, stand up every service-visible AI cloud platform
  // route without exposing gateway groups in the UI. Best-effort — a failure
  // leaves the account signed in and the manual fetch controls available.
  const autoSetup = async () => {
    setBusy("fetch");
    try {
      const { primary, provisioned } = await provisionAllGroups();
      if (!primary) return;
      if (provisioned.length === 0) return;
      // Provisioning restarts the sidecar in Rust, so the store's "ready" may be
      // stale. Always re-establish the connection before registering — otherwise
      // the config PATCH races a restarting sidecar and the catalog comes back
      // empty ("未连接供应商" / no models).
      const control = getProviderControlClient();
      if (!control) return; // leave the models staged; the 保存 button still works
      // One provider per provisioned group. Non-primary providers are labelled
      // identically; the group remains an internal credential-routing detail.
      for (const group of provisioned) {
        await control.addCustomProvider(group.providerId, {
          name: t("sub2api.providerName"),
          npm: npmForProtocol(protocol),
          baseURL: group.baseUrl,
          models: orderModels(group.models),
        });
      }
      // Default model belongs to the primary provider, so it stays alive when
      // the user switches groups: the primary provider id is derived from the
      // primary group id, matching the addCustomProvider call above.
      const chosen = orderModels(provisioned.flatMap((group) => group.models));
      const def = pickDefaultModel(chosen);
      if (def) {
        const route =
          provisioned.find((group) => group.groupId === primary.id && group.models.includes(def)) ??
          provisioned.find((group) => group.models.includes(def));
        if (route) await control.setDefaultModel(`${route.providerId}/${def}`);
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
    clearAcpConfig("claude-code");
    clearAcpConfig("codex");
    setAccount(null);
    setGroups([]);
    setProvisionedGroups([]);
    setModels(null);
    setPicked(new Set());
    setManualModels(new Set());
    setBalance(null);
  };

  // Fetch and provision every visible group in one batch. Group ids stay an
  // internal credential route; the user sees one de-duplicated model catalog.
  const fetchGroups = async () => {
    setBusy("fetch");
    try {
      const { provisioned } = await provisionAllGroups();
      const count = orderModels(provisioned.flatMap((group) => group.models)).length;
      toast.success(t("sub2api.fetched", { count }));
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
    setManualModels((prev) => new Set([...prev, ...ids]));
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
    if (provisionedGroups.length === 0) {
      toast.error(t("sub2api.pickOne"));
      return;
    }
    setBusy("connect");
    try {
      const control = getProviderControlClient();
      if (!control) {
        toast.error(t("sub2api.runtimeOffline"));
        return;
      }
      const primary =
        groups.find((group) => /国产|domestic/i.test(group.name)) ??
        groups.find((group) => /default/i.test(group.name)) ??
        groups[0];
      const routes: Array<{ providerId: string; models: string[] }> = [];
      for (const group of provisionedGroups) {
        const routed = orderModels([
          ...group.models.filter((model) => picked.has(model)),
          ...(group.groupId === primary?.id ? [...manualModels] : []),
        ]);
        if (routed.length === 0) continue;
        await control.addCustomProvider(group.providerId, {
          name: t("sub2api.providerName"),
          npm: npmForProtocol(proto),
          baseURL: group.baseUrl,
          models: routed,
        });
        routes.push({ providerId: group.providerId, models: routed });
      }
      // Auto-set the default model to a domestic one (preferring Kimi),
      // preventing the "Anthropic API key is missing" error for users who
      // only have an AI 平台 key.
      const first = pickDefaultModel(chosen);
      if (first) {
        const route = routes.find((candidate) => candidate.models.includes(first));
        if (route) await control.setDefaultModel(`${route.providerId}/${first}`);
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
    if (provisionedGroups.length > 0 && picked.size > 0) void connect(p);
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
