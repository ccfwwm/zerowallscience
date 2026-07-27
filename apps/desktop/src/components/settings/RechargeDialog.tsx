import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ExternalLink, CheckCircle2, RefreshCw, ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import {
  openExternal,
  sub2apiCheckoutInfo,
  sub2apiCreateOrder,
  sub2apiListOrders,
  sub2apiOrderStatus,
  type Sub2ApiCheckoutInfo,
  type Sub2ApiPaymentOrder,
} from "@/lib/tauri";
import { toast } from "@/lib/toast";
import { inputCls } from "./inputCls";
import { cn } from "@/lib/cn";

/** How often to re-check an open order's status, in ms — matches cscience-web. */
const POLL_MS = 5000;

/** Statuses the gateway uses to mark an order settled. */
const PAID = ["paid", "completed", "success", "succeeded", "finished"];

/** Statuses that end an order without payment — never offer to resume these. */
const DEAD = ["cancelled", "canceled", "expired", "failed", "closed", "refunded", "timeout"];

const isPaid = (status: string) => PAID.includes(status.trim().toLowerCase());
const isDead = (status: string) => DEAD.includes(status.trim().toLowerCase());

const PRESETS = [50, 100, 200, 500];

/** What to encode into the QR: the gateway's QR payload, else the pay URL. A
 *  status reply that carries only `payUrl` must still produce a scannable code. */
function paymentPayload(order: Sub2ApiPaymentOrder | null): string | null {
  return order?.qrCode || order?.payUrl || null;
}

/** Fold a status reply into the order we already hold. The status endpoint often
 *  omits `qrCode`/`payUrl`, so replacing the order wholesale would erase the QR
 *  the user has not scanned yet. */
function mergeOrder(
  current: Sub2ApiPaymentOrder | null,
  next: Sub2ApiPaymentOrder,
): Sub2ApiPaymentOrder {
  if (!current) return next;
  return {
    ...current,
    ...next,
    qrCode: next.qrCode ?? current.qrCode,
    payUrl: next.payUrl ?? current.payUrl,
    amount: next.amount ?? current.amount,
  };
}

/**
 * In-app balance recharge: pick an amount and a payment channel, create an
 * order, then scan the returned QR (or open the pay page) and watch the order
 * settle. No secret passes through here — `qrCode` and `payUrl` are payment
 * pointers the gateway returns for exactly this purpose.
 */
export function RechargeDialog({
  open,
  onClose,
  onPaid,
}: {
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const [info, setInfo] = useState<Sub2ApiCheckoutInfo | null>(null);
  const [amount, setAmount] = useState("100");
  const [method, setMethod] = useState("");
  const [creating, setCreating] = useState(false);
  const [order, setOrder] = useState<Sub2ApiPaymentOrder | null>(null);
  /** An earlier order that is still unpaid — offered for resume on the form. */
  const [pending, setPending] = useState<Sub2ApiPaymentOrder | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [paid, setPaid] = useState(false);

  const fail = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : String(err));

  const settle = useCallback(() => {
    setPaid(true);
    setPending(null);
    onPaid();
    toast.success(t("sub2api.rechargePaid"));
  }, [onPaid, t]);

  // Fetch checkout info each time the dialog opens, and look for an order the
  // user created but never paid — reloading the app must not lose that QR.
  useEffect(() => {
    if (!open) return;
    setInfo(null);
    setOrder(null);
    setPending(null);
    setQr(null);
    setQrError(false);
    setPaid(false);
    setCreating(false);
    let alive = true;
    void sub2apiCheckoutInfo()
      .then((ci) => {
        if (!alive) return;
        setInfo(ci);
        const firstAvailable = ci.methods.find((m) => m.available);
        setMethod(firstAvailable?.code ?? ci.methods[0]?.code ?? "");
      })
      .catch((err) => {
        if (alive) fail(err);
      });
    void sub2apiListOrders()
      .then((orders) => {
        if (!alive) return;
        const resumable = orders.find(
          (o) => !isPaid(o.status) && !isDead(o.status) && Boolean(paymentPayload(o)),
        );
        if (resumable) setPending(resumable);
      })
      .catch(() => {
        /* an older gateway may not expose the order list — the form still works */
      });
    return () => {
      alive = false;
    };
  }, [open]);

  // Escape closes, matching ConfirmDialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const payload = paymentPayload(order);

  // Render the QR: a data-URL image is shown as-is; a raw payload (a
  // weixin:// / alipay string, or a plain URL) is encoded into one.
  useEffect(() => {
    if (!payload) {
      setQr(null);
      setQrError(false);
      return;
    }
    if (payload.startsWith("data:image")) {
      setQr(payload);
      setQrError(false);
      return;
    }
    let alive = true;
    void QRCode.toDataURL(payload, { width: 220, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!alive) return;
        setQr(url);
        setQrError(false);
      })
      .catch(() => {
        if (!alive) return;
        setQr(null);
        setQrError(true);
      });
    return () => {
      alive = false;
    };
  }, [payload]);

  // Poll the order until it settles. The reply is merged, never substituted, so
  // a status-only response cannot blank out the QR mid-scan.
  useEffect(() => {
    if (!open || !order || paid) return;
    const id = order.id;
    const timer = setInterval(() => {
      void sub2apiOrderStatus(id)
        .then((next) => {
          setOrder((cur) => (cur && cur.id === id ? mergeOrder(cur, next) : cur));
          if (isPaid(next.status)) settle();
        })
        .catch(() => {
          /* a transient poll failure should not tear down the dialog */
        });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [open, order, paid, settle]);

  const methods = useMemo(
    () => (info?.methods ?? []).filter((m) => m.available),
    [info],
  );

  const selected = methods.find((m) => m.code === method);
  const min = Number(selected?.minAmount ?? info?.globalMin ?? "0") || 0;
  const max = Number(selected?.maxAmount ?? info?.globalMax ?? "0") || 0;

  const presets = useMemo(
    () =>
      PRESETS.filter((p) => (min <= 0 || p >= min) && (max <= 0 || p <= max)),
    [min, max],
  );

  if (!open) return null;

  const amountNumber = Number(amount);
  const amountValid =
    Number.isFinite(amountNumber) &&
    amountNumber > 0 &&
    (min <= 0 || amountNumber >= min) &&
    (max <= 0 || amountNumber <= max);

  const createOrder = async () => {
    if (!method) {
      toast.error(t("sub2api.rechargePickMethod"));
      return;
    }
    if (!amountValid) {
      toast.error(t("sub2api.rechargeBadAmount"));
      return;
    }
    setCreating(true);
    try {
      const created = await sub2apiCreateOrder(method, amountNumber);
      setPending(null);
      setOrder(created);
    } catch (err) {
      fail(err);
    } finally {
      setCreating(false);
    }
  };

  // Manual re-check, for when the poll has not come round yet or the wallet app
  // reported success on the phone.
  const refreshOrder = async () => {
    if (!order) return;
    setRefreshing(true);
    try {
      const next = await sub2apiOrderStatus(order.id);
      setOrder((cur) => (cur ? mergeOrder(cur, next) : next));
      if (isPaid(next.status)) settle();
    } catch (err) {
      fail(err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label={t("sub2api.rechargeTitle")}
        className="w-[360px] rounded-card border border-border bg-surface p-4 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-medium text-text">{t("sub2api.rechargeTitle")}</div>

        {paid ? (
          <div className="mt-4 flex flex-col items-center gap-2 py-4">
            <CheckCircle2 size={32} className="text-ok" />
            <p className="text-sm text-text">{t("sub2api.rechargePaid")}</p>
            <button
              className="mt-2 rounded-input bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent/90"
              onClick={onClose}
            >
              {t("actions.done", { ns: "common", defaultValue: "Done" })}
            </button>
          </div>
        ) : order ? (
          <div className="mt-4 flex flex-col items-center gap-3">
            {qr ? (
              <img src={qr} alt={t("sub2api.rechargeTitle")} className="h-[220px] w-[220px] rounded bg-white p-2" />
            ) : qrError ? (
              <p className="flex h-[220px] w-[220px] items-center justify-center px-4 text-center text-xs text-muted">
                {t("sub2api.rechargeQrFailed")}
              </p>
            ) : (
              <div className="flex h-[220px] w-[220px] items-center justify-center">
                <Loader2 size={20} className="animate-spin text-muted" />
              </div>
            )}
            {order.amount && (
              <p className="font-mono text-sm text-text">¥ {Number(order.amount).toFixed(2)}</p>
            )}
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Loader2 size={12} className="animate-spin" />
              {t("sub2api.rechargePending")}
            </p>
            <div className="flex items-center gap-3">
              {order.payUrl && (
                <button
                  className="flex items-center gap-1.5 text-xs text-accent hover:underline"
                  onClick={() => void openExternal(order.payUrl!)}
                >
                  <ExternalLink size={12} /> {t("sub2api.rechargeOpenPage")}
                </button>
              )}
              <button
                className="flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-text"
                onClick={() => void refreshOrder()}
                disabled={refreshing}
              >
                <RefreshCw size={12} className={cn(refreshing && "animate-spin")} />
                {t("sub2api.rechargeRefresh")}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-text"
                onClick={() => {
                  setPending(order);
                  setOrder(null);
                }}
              >
                <ChevronLeft size={12} /> {t("sub2api.rechargeBack")}
              </button>
              <button
                className="text-xs text-muted transition-colors hover:text-text"
                onClick={onClose}
              >
                {t("sub2api.rechargeClose")}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {pending && (
              <div className="flex items-center gap-2 rounded-input border border-warn/40 bg-warn/10 px-2.5 py-2">
                <p className="min-w-0 flex-1 text-[11px] text-text">
                  {t("sub2api.rechargePendingFound", {
                    amount: Number(pending.amount ?? 0).toFixed(2),
                  })}
                </p>
                <button
                  className="shrink-0 text-[11px] font-medium text-accent hover:underline"
                  onClick={() => setOrder(pending)}
                >
                  {t("sub2api.rechargeResume")}
                </button>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted">{t("sub2api.rechargeAmount")}</label>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                className={inputCls("mt-1 w-full font-mono")}
              />
              {presets.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {presets.map((p) => (
                    <button
                      key={p}
                      onClick={() => setAmount(String(p))}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        Number(amount) === p
                          ? "border-accent bg-accent font-semibold text-white shadow-sm"
                          : "border-faint text-muted hover:border-border hover:text-text",
                      )}
                    >
                      ¥{p}
                    </button>
                  ))}
                </div>
              )}
              {(min > 0 || max > 0) && (
                <p className="mt-1 text-[11px] text-muted">
                  {t("sub2api.rechargeRange", {
                    min: min > 0 ? min : 1,
                    max: max > 0 ? max : "∞",
                  })}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-muted">{t("sub2api.rechargeMethod")}</label>
              {info === null ? (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                  <Loader2 size={12} className="animate-spin" /> {t("common:loading", { defaultValue: "Loading…" })}
                </div>
              ) : methods.length === 0 ? (
                <p className="mt-1 text-xs text-muted">{t("sub2api.rechargeNoMethods")}</p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {methods.map((m) => {
                    const on = method === m.code;
                    return (
                      <button
                        key={m.code}
                        aria-pressed={on}
                        onClick={() => setMethod(m.code)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors",
                          on
                            ? "border-accent bg-accent font-semibold text-white shadow-sm"
                            : "border-faint text-muted hover:border-border hover:text-text",
                        )}
                      >
                        {on && <CheckCircle2 size={13} />}
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                className="rounded-input border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-2"
                onClick={onClose}
              >
                {t("actions.cancel", { ns: "common" })}
              </button>
              <button
                className="flex items-center gap-1.5 rounded-input bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent/90 disabled:bg-accent/50"
                onClick={() => void createOrder()}
                disabled={creating || !amountValid || methods.length === 0}
              >
                {creating && <Loader2 size={13} className="animate-spin" />}
                {t("sub2api.rechargeCreate")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
