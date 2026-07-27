import { useEffect, useMemo, useState } from "react";
import { Check, KeyRound, Loader2, LogOut, RefreshCw, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  isTauri,
  sub2apiAccount,
  sub2apiFetchGroups,
  sub2apiLogin,
  sub2apiLogout,
  sub2apiProvisionGroup,
  sub2apiRegister,
  sub2apiSendCode,
  type Sub2ApiAccount,
} from "@/lib/tauri";
import { isGatewayWeb } from "@/lib/webMode";
import { getClient, useRuntimeStore } from "@/lib/runtime";
import { Section } from "./Section";
import { inputCls } from "./inputCls";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";

/** Provider id the gateway's key is stored under, matching `sub2api.rs`. */
const PROVIDER_ID = "sub2api";

/** Substrings that mark a model as one of the domestic families this app leads
 *  with. Used only for ordering and a badge — nothing is hidden. */
const DOMESTIC = ["kimi", "moonshot", "deepseek", "glm", "zhipu", "qwen", "qwq", "ernie", "hunyuan", "minimax", "step", "baichuan", "yi-"];

export function isDomesticModel(id: string): boolean {
  const lower = id.toLowerCase();
  return DOMESTIC.some((needle) => lower.includes(needle));
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

type Mode = "signIn" | "register";

const MODES: Mode[] = ["signIn", "register"];

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
  const connected = useRuntimeStore((s) => s.status) === "ready";

  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [invite, setInvite] = useState("");
  const [account, setAccount] = useState<Sub2ApiAccount | null>(null);
  const [busy, setBusy] = useState<null | "auth" | "code" | "fetch" | "connect">(null);
  const [groups, setGroups] = useState<Array<{ id: number; name: string }>>([]);
  const [existingKeyGroupIds, setExistingKeyGroupIds] = useState<number[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [baseUrl, setBaseUrl] = useState("");
  const [manual, setManual] = useState("");

  // A session survives navigating away from Settings, so ask on mount.
  useEffect(() => {
    if (!isTauri || isGatewayWeb) return;
    void sub2apiAccount()
      .then(setAccount)
      .catch(() => setAccount(null));
  }, []);

  const ordered = useMemo(() => (models ? orderModels(models) : []), [models]);

  if (!isTauri || isGatewayWeb) return null;

  const fail = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : String(err));

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
        invitationCode: invite.trim() || undefined,
      });
      toast.success(t("sub2api.registered"));
      setMode("signIn");
      setCode("");
      setInvite("");
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
        code: code.trim() || undefined,
      });
      setAccount(acct);
      setPassword("");
      setCode("");
      toast.success(t("sub2api.signedIn", { email: acct.email }));
      onLogin?.();
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
  };

  // Step 1: fetch groups + existing key info, then auto-select the best group.
  const fetchGroups = async () => {
    setBusy("fetch");
    try {
      const res = await sub2apiFetchGroups();
      setGroups(res.groups);
      setExistingKeyGroupIds(res.existingKeyGroupIds);
      // Auto-select: prefer domestic-sounding group, else "default", else first.
      const domestic = res.groups.find((g) =>
        /国产|domestic/i.test(g.name),
      );
      const fallback = domestic ?? res.groups.find((g) => /default/i.test(g.name));
      const pick = fallback ?? res.groups[0] ?? null;
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
  const connect = async () => {
    const chosen = ordered.filter((m) => picked.has(m));
    if (chosen.length === 0) {
      toast.error(t("sub2api.pickOne"));
      return;
    }
    setBusy("connect");
    try {
      await getClient()!.addCustomProvider(PROVIDER_ID, {
        name: t("sub2api.providerName"),
        npm: "@ai-sdk/openai-compatible",
        baseURL: baseUrl,
        models: chosen,
      });
      // Auto-set the default model to a domestic one, preventing the
      // "Anthropic API key is missing" error for users who only have
      // an AI 平台 key.
      const first = chosen.find(isDomesticModel) ?? chosen[0];
      if (first) {
        await getClient()!.setDefaultModel(`${PROVIDER_ID}/${first}`);
      }
      await loadCatalog();
      toast.success(t("sub2api.connected", { count: chosen.length }));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
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
            <button
              className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-text"
              onClick={() => void signOut()}
            >
              <LogOut size={12} /> {t("sub2api.signOut")}
            </button>
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
                disabled={busy !== null || !connected || picked.size === 0}
                title={connected ? undefined : t("sub2api.runtimeOffline")}
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t(
                mode === "register" ? "sub2api.codePlaceholder" : "sub2api.twoFactorPlaceholder",
              )}
              className={inputCls("min-w-0 flex-1 font-mono")}
            />
            {mode === "register" && (
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
            )}
          </div>
          {mode === "register" && (
            <input
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder={t("sub2api.invitePlaceholder")}
              className={inputCls("w-full font-mono")}
            />
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

  if (bare) return content;

  return (
    <Section title={t("sub2api.title")} hint={t("sub2api.hint")}>
      {content}
    </Section>
  );
}

const btn = (kind: "accent" | "ghost") =>
  cn(
    "flex h-9 shrink-0 items-center gap-1.5 rounded-input px-3.5 text-[13px] transition-colors",
    kind === "accent"
      ? "bg-accent font-medium text-accent-fg hover:bg-accent/90 disabled:bg-accent/50"
      : "border border-transparent bg-surface-2 text-text hover:bg-border/50 disabled:text-muted",
  );
