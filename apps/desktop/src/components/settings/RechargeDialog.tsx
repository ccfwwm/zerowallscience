import { useEffect, useMemo, useState } from "react";
import { Loader2, ExternalLink, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import {
  openExternal,
  sub2apiCheckoutInfo,
  sub2apiCreateOrder,
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

const isPaid = (status: string) => PAID.includes(status.trim().toLowerCase());

const PRESETS = [50, 100, 200, 500];

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
  const [qr, setQr] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const fail = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : String(err));

  // Fetch checkout info each time the dialog opens; reset everything else so a
  // second recharge never shows the previous order's QR.
  useEffect(() => {
    if (!open) return;
    setInfo(null);
    setOrder(null);
    setQr(null);
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

  // Render the QR: a data-URL image is shown as-is; a raw payload (a
  // weixin:// / alipay string, or a plain URL) is encoded into one.
  useEffect(() => {
    const payload = order?.qrCode;
    if (!payload) {
      setQr(null);
      return;
    }
    if (payload.startsWith("data:image")) {
      setQr(payload);
      return;
    }
    let alive = true;
    void QRCode.toDataURL(payload, { width: 220, margin: 1 })
      .then((url) => {
        if (alive) setQr(url);
      })
      .catch(() => {
        if (alive) setQr(null);
      });
    return () => {
      alive = false;
    };
  }, [order?.qrCode]);

  // Poll the order until it settles, then refresh the balance and close.
  useEffect(() => {
    if (!open || !order || paid) return;
    const id = order.id;
    const timer = setInterval(() => {
      void sub2apiOrderStatus(id)
        .then((next) => {
          setOrder(next);
          if (isPaid(next.status)) {
            setPaid(true);
            onPaid();
            toast.success(t("sub2api.rechargePaid"));
          }
        })
        .catch(() => {
          /* a transient poll failure should not tear down the dialog */
        });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [open, order, paid, onPaid, t]);

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
      setOrder(created);
    } catch (err) {
      fail(err);
    } finally {
      setCreating(false);
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
            ) : (
              <div className="flex h-[220px] w-[220px] items-center justify-center">
                <Loader2 size={20} className="animate-spin text-muted" />
              </div>
            )}
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Loader2 size={12} className="animate-spin" />
              {t("sub2api.rechargePending")}
            </p>
            {order.payUrl && (
              <button
                className="flex items-center gap-1.5 text-xs text-accent hover:underline"
                onClick={() => void openExternal(order.payUrl!)}
              >
                <ExternalLink size={12} /> {t("sub2api.rechargeOpenPage")}
              </button>
            )}
            <button
              className="text-xs text-muted transition-colors hover:text-text"
              onClick={onClose}
            >
              {t("actions.cancel", { ns: "common" })}
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
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
                          ? "border-accent bg-accent/10 font-medium text-text"
                          : "border-faint text-muted hover:text-text",
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
                          "rounded-full border px-2.5 py-1 text-xs transition-colors",
                          on
                            ? "border-accent bg-accent/10 font-medium text-text"
                            : "border-faint text-muted hover:text-text",
                        )}
                      >
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
