import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Every gateway call is a spy — nothing here may touch a real payment endpoint.
const mocks = vi.hoisted(() => ({
  checkoutInfo: vi.fn(),
  createOrder: vi.fn(),
  orderStatus: vi.fn(),
  listOrders: vi.fn(),
  openExternal: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  isTauri: true,
  sub2apiCheckoutInfo: mocks.checkoutInfo,
  sub2apiCreateOrder: mocks.createOrder,
  sub2apiOrderStatus: mocks.orderStatus,
  sub2apiListOrders: mocks.listOrders,
  openExternal: mocks.openExternal,
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: () => Promise.resolve("data:image/png;base64,QR") },
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { RechargeDialog } from "./RechargeDialog";

beforeEach(() => {
  mocks.checkoutInfo.mockResolvedValue({
    methods: [{ code: "wechat", label: "WeChat Pay", available: true }],
    globalMin: null,
    globalMax: null,
    helpText: null,
  });
  mocks.listOrders.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("RechargeDialog", () => {
  it("keeps the QR visible when a status poll omits the QR payload", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mocks.createOrder.mockResolvedValue({
      id: "o1",
      status: "pending",
      amount: "100",
      qrCode: "weixin://wxpay/x",
      payUrl: "https://pay.example/x",
    });
    // The status endpoint answers with the status only — the regression that
    // blanked the code the user had not scanned yet.
    mocks.orderStatus.mockResolvedValue({ id: "o1", status: "pending" });

    render(<RechargeDialog open onClose={() => {}} onPaid={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Create order" }));
    expect(await screen.findByRole("img", { name: "Recharge balance" })).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(11_000);
    await waitFor(() => expect(mocks.orderStatus).toHaveBeenCalled());
    expect(screen.getByRole("img", { name: "Recharge balance" })).toBeInTheDocument();
    expect(screen.getByText("Open payment page")).toBeInTheDocument();
  });

  it("settles when the poll reports the order paid", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onPaid = vi.fn();
    mocks.createOrder.mockResolvedValue({ id: "o2", status: "pending", qrCode: "weixin://y" });
    mocks.orderStatus.mockResolvedValue({ id: "o2", status: "paid" });

    render(<RechargeDialog open onClose={() => {}} onPaid={onPaid} />);
    await user.click(await screen.findByRole("button", { name: "Create order" }));
    await vi.advanceTimersByTimeAsync(6_000);
    await waitFor(() => expect(onPaid).toHaveBeenCalled());
    expect(screen.getByText("Payment received. Balance updated.")).toBeInTheDocument();
  });

  it("offers to resume an order left unpaid before a reload", async () => {
    const user = userEvent.setup();
    mocks.listOrders.mockResolvedValue([
      { id: "old", status: "pending", amount: "50", qrCode: "weixin://old" },
    ]);

    render(<RechargeDialog open onClose={() => {}} onPaid={() => {}} />);
    expect(await screen.findByText(/unpaid order of ¥50\.00/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue payment" }));
    expect(await screen.findByRole("img", { name: "Recharge balance" })).toBeInTheDocument();
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it("ignores settled orders when looking for something to resume", async () => {
    mocks.listOrders.mockResolvedValue([
      { id: "done", status: "paid", amount: "50", qrCode: "weixin://done" },
      { id: "gone", status: "expired", amount: "50", qrCode: "weixin://gone" },
    ]);

    render(<RechargeDialog open onClose={() => {}} onPaid={() => {}} />);
    expect(await screen.findByRole("button", { name: "Create order" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue payment" })).not.toBeInTheDocument();
  });
});
