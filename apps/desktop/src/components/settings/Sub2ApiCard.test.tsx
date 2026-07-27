import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The panel is desktop-only, so `isTauri` has to read true, and every command it
// calls has to be a spy — nothing here may touch a real gateway.
const mocks = vi.hoisted(() => ({
  isTauri: true,
  web: false,
  account: null as { email: string; baseUrl: string } | null,
  login: vi.fn(),
  register: vi.fn(),
  sendCode: vi.fn(),
  logout: vi.fn(),
  fetchGroups: vi.fn(),
  provisionGroup: vi.fn(),
  balance: vi.fn(),
  checkoutInfo: vi.fn(),
  createOrder: vi.fn(),
  orderStatus: vi.fn(),
  openExternal: vi.fn(),
  addCustomProvider: vi.fn(),
  setDefaultModel: vi.fn(),
  loadCatalog: vi.fn(),
  connectRetry: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  get isTauri() {
    return mocks.isTauri;
  },
  sub2apiAccount: () => Promise.resolve(mocks.account),
  sub2apiLogin: mocks.login,
  sub2apiRegister: mocks.register,
  sub2apiSendCode: mocks.sendCode,
  sub2apiLogout: mocks.logout,
  sub2apiFetchGroups: mocks.fetchGroups,
  sub2apiProvisionGroup: mocks.provisionGroup,
  sub2apiBalance: mocks.balance,
  sub2apiCheckoutInfo: mocks.checkoutInfo,
  sub2apiCreateOrder: mocks.createOrder,
  sub2apiOrderStatus: mocks.orderStatus,
  openExternal: mocks.openExternal,
}));

vi.mock("@/lib/webMode", () => ({
  get isGatewayWeb() {
    return mocks.web;
  },
}));

vi.mock("@/lib/runtime", () => {
  const state = { status: "ready", loadCatalog: mocks.loadCatalog, connectRetry: mocks.connectRetry };
  const useRuntimeStore = (select: (s: typeof state) => unknown) => select(state);
  useRuntimeStore.getState = () => state;
  return {
    getClient: () => ({
      addCustomProvider: mocks.addCustomProvider,
      setDefaultModel: mocks.setDefaultModel,
    }),
    useRuntimeStore,
  };
});

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { Sub2ApiCard, isDomesticModel, orderModels } from "./Sub2ApiCard";
import { toast } from "@/lib/toast";

beforeEach(() => {
  mocks.isTauri = true;
  mocks.web = false;
  mocks.account = null;
  mocks.fetchGroups.mockResolvedValue({
    groups: [
      { id: 1, name: "Default" },
      { id: 2, name: "国产模型" },
    ],
    existingKeyGroupIds: [1],
  });
  mocks.provisionGroup.mockResolvedValue({
    providerId: "sub2api",
    baseUrl: "https://code.aicodeme.cn/v1",
    models: ["gpt-4o", "kimi-k2-thinking", "deepseek-v3", "glm-4.6", "qwen3-max"],
    groups: [
      { id: 1, name: "Default" },
      { id: 2, name: "国产模型" },
    ],
  });
  mocks.login.mockResolvedValue({ email: "a@b.co", baseUrl: "https://code.aicodeme.cn" });
  mocks.register.mockResolvedValue(undefined);
  mocks.balance.mockResolvedValue({ balance: "12.34" });
  mocks.addCustomProvider.mockResolvedValue(undefined);
  mocks.setDefaultModel.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("model ordering", () => {
  it("recognizes the domestic families the product leads with", () => {
    for (const id of ["kimi-k2", "moonshot-v1", "deepseek-r1", "glm-4.6", "qwen3-max", "GLM-4.5-Air"]) {
      expect(isDomesticModel(id)).toBe(true);
    }
    for (const id of ["gpt-4o", "claude-sonnet-4", "gemini-2.5-pro"]) {
      expect(isDomesticModel(id)).toBe(false);
    }
  });

  it("puts domestic models first and de-duplicates", () => {
    expect(orderModels(["gpt-4o", "qwen3-max", "kimi-k2", "gpt-4o"])).toEqual([
      "kimi-k2",
      "qwen3-max",
      "gpt-4o",
    ]);
  });
});

describe("Sub2API panel", () => {
  it("renders nothing outside the desktop app", () => {
    mocks.isTauri = false;
    const { container, unmount } = render(<Sub2ApiCard />);
    expect(container).toBeEmptyDOMElement();
    unmount();

    // The gateway 403s provider config writes and /auth, so the form would fail
    // rather than degrade: it must be absent, not merely disabled.
    mocks.isTauri = true;
    mocks.web = true;
    expect(render(<Sub2ApiCard />).container).toBeEmptyDOMElement();
  });

  it("signs in with an email and password", async () => {
    render(<Sub2ApiCard />);
    await userEvent.type(screen.getByPlaceholderText("Email"), "a@b.co");
    await userEvent.type(screen.getByPlaceholderText("Password"), "secret1");
    await userEvent.click(screen.getByRole("button", { name: /Sign in/ }));

    expect(mocks.login).toHaveBeenCalledWith({
      email: "a@b.co",
      password: "secret1",
    });
    // Sign-in must not render the verification-code field — that belongs to register only.
    expect(screen.queryByPlaceholderText("Email verification code")).not.toBeInTheDocument();
    expect(await screen.findByText("a@b.co")).toBeInTheDocument();
  });

  it("registers without signing in, since the emailed code may still be pending", async () => {
    render(<Sub2ApiCard />);
    await userEvent.click(screen.getByRole("tab", { name: "Create an account" }));
    await userEvent.type(screen.getByPlaceholderText("Email"), "new@b.co");
    await userEvent.type(screen.getByPlaceholderText("Password"), "secret1");
    await userEvent.type(screen.getByPlaceholderText("Email verification code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(mocks.register).toHaveBeenCalledWith({
      email: "new@b.co",
      password: "secret1",
      code: "123456",
      invitationCode: undefined,
    });
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it("refuses a register password the gateway would reject", async () => {
    render(<Sub2ApiCard />);
    await userEvent.click(screen.getByRole("tab", { name: "Create an account" }));
    await userEvent.type(screen.getByPlaceholderText("Email"), "new@b.co");
    await userEvent.type(screen.getByPlaceholderText("Password"), "short");
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
  });

  it("fetches groups then auto-provisions domestic group with pre-selected models", async () => {
    mocks.account = { email: "a@b.co", baseUrl: "https://code.aicodeme.cn" };
    render(<Sub2ApiCard />);
    await userEvent.click(await screen.findByRole("button", { name: /Fetch my models/ }));

    // The two-step flow: fetchGroups auto-selects the domestic group and provisions it.
    // Wait for the final state — model chips appear after provisionGroup resolves.
    await waitFor(() => expect(screen.getByRole("button", { name: /gpt-4o/ })).toBeInTheDocument());

    expect(mocks.fetchGroups).toHaveBeenCalledTimes(1);
    expect(mocks.provisionGroup).toHaveBeenCalledWith(2); // 国产模型 group

    // Group buttons also have aria-pressed; model chips have font-mono class.
    const chips = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") !== null && b.className.includes("font-mono"));
    expect(chips.map((c) => c.textContent?.replace("★", ""))).toEqual([
      "deepseek-v3",
      "glm-4.6",
      "kimi-k2-thinking",
      "qwen3-max",
      "gpt-4o",
    ]);
    expect(chips.map((c) => c.getAttribute("aria-pressed"))).toEqual([
      "true",
      "true",
      "true",
      "true",
      "false",
    ]);
    expect(screen.getByRole("button", { name: "Save 4 model(s)" })).toBeEnabled();
  });

  it("registers the provider with no apiKey and auto-sets a domestic default model", async () => {
    mocks.account = { email: "a@b.co", baseUrl: "https://code.aicodeme.cn" };
    render(<Sub2ApiCard />);
    await userEvent.click(await screen.findByRole("button", { name: /Fetch my models/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Save 4 model(s)" }));

    expect(mocks.addCustomProvider).toHaveBeenCalledTimes(1);
    const [id, opts] = mocks.addCustomProvider.mock.calls[0];
    expect(id).toBe("sub2api");
    expect(opts).toEqual({
      name: "AI Platform",
      npm: "@ai-sdk/openai-compatible",
      baseURL: "https://code.aicodeme.cn/v1",
      models: ["deepseek-v3", "glm-4.6", "kimi-k2-thinking", "qwen3-max"],
    });
    expect(opts).not.toHaveProperty("apiKey");
    // Auto-set the default model to the first domestic model.
    expect(mocks.setDefaultModel).toHaveBeenCalledWith("sub2api/kimi-k2-thinking");
    expect(mocks.loadCatalog).toHaveBeenCalled();
  });

  it("adds models typed by hand", async () => {
    mocks.account = { email: "a@b.co", baseUrl: "https://code.aicodeme.cn" };
    render(<Sub2ApiCard />);
    await userEvent.click(await screen.findByRole("button", { name: /Fetch my models/ }));
    await userEvent.type(
      await screen.findByPlaceholderText(/Add model ids by hand/),
      "my-private-model, another-one",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("button", { name: "my-private-model" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Save 6 model(s)" })).toBeEnabled();
  });

  it("surfaces the gateway's own error text instead of a generic failure", async () => {
    mocks.login.mockRejectedValue(new Error("invalid email or password"));
    render(<Sub2ApiCard />);
    await userEvent.type(screen.getByPlaceholderText("Email"), "a@b.co");
    await userEvent.type(screen.getByPlaceholderText("Password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: /Sign in/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("invalid email or password"));
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
  });
});
