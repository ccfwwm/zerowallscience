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
  restoreSession: vi.fn(),
  fetchGroups: vi.fn(),
  provisionGroup: vi.fn(),
  provisionGroups: vi.fn(),
  balance: vi.fn(),
  checkoutInfo: vi.fn(),
  createOrder: vi.fn(),
  orderStatus: vi.fn(),
  openExternal: vi.fn(),
  addCustomProvider: vi.fn(),
  setDefaultModel: vi.fn(),
  loadCatalog: vi.fn(),
  connectRetry: vi.fn(),
  // Providers the runtime already knows about. Non-empty by default so the card's
  // "re-provision on restart" effect (which fires only when the catalog is empty)
  // stays dormant and these manual-path tests exercise just the handler they click.
  providers: [{ id: "seed" }] as { id: string }[],
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
  sub2apiRestoreSession: mocks.restoreSession,
  sub2apiFetchGroups: mocks.fetchGroups,
  sub2apiProvisionGroup: mocks.provisionGroup,
  sub2apiProvisionGroups: mocks.provisionGroups,
  sub2apiBalance: mocks.balance,
  sub2apiCheckoutInfo: mocks.checkoutInfo,
  sub2apiCreateOrder: mocks.createOrder,
  sub2apiOrderStatus: mocks.orderStatus,
  sub2apiListOrders: () => Promise.resolve([]),
  openExternal: mocks.openExternal,
}));

vi.mock("@/lib/webMode", () => ({
  get isGatewayWeb() {
    return mocks.web;
  },
}));

vi.mock("@/lib/runtime", () => {
  // `providers` feeds the card's re-provision-on-restart effect (it fires only
  // when the catalog is empty). A getter keeps it live so a test can flip
  // `mocks.providers` to [] to exercise that auto path.
  const state = {
    status: "ready",
    get providers() {
      return mocks.providers;
    },
    loadCatalog: mocks.loadCatalog,
    connectRetry: mocks.connectRetry,
  };
  const useRuntimeStore = (select: (s: typeof state) => unknown) => select(state);
  useRuntimeStore.getState = () => state;
  const client = {
    addCustomProvider: mocks.addCustomProvider,
    setDefaultModel: mocks.setDefaultModel,
  };
  return {
    getProviderControlClient: () => client,
    useRuntimeStore,
  };
});

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  Sub2ApiCard,
  isDomesticModel,
  openGroups,
  orderModels,
  providerIdForGroup,
} from "./Sub2ApiCard";
import { toast } from "@/lib/toast";

beforeEach(() => {
  mocks.isTauri = true;
  mocks.web = false;
  mocks.account = null;
  mocks.fetchGroups.mockResolvedValue({
    // Every service-visible group must participate; an explicitly hidden group
    // is excluded before provisioning.
    groups: [
      { id: 1, name: "codex-pro分组" },
      { id: 2, name: "zero-国产模型" },
      { id: 3, name: "zero-GPT模型分组" },
      { id: 4, name: "hidden-admin", visible: false },
    ],
    existingKeyGroupIds: [2],
  });
  mocks.provisionGroup.mockResolvedValue({
    providerId: "zerowall-2",
    baseUrl: "https://code.aicodeme.cn/v1",
    models: ["gpt-4o", "kimi-k2-thinking", "deepseek-v3", "glm-4.6", "qwen3-max"],
    groups: [
      { id: 1, name: "Default" },
      { id: 2, name: "zero-国产模型" },
    ],
  });
  // The sign-in auto-setup provisions every open group at once. Each group gets
  // its own neutral-namespace provider id (no bare special case) so keys stay
  // per-group and the fully-qualified model ref never leaks the gateway name.
  mocks.provisionGroups.mockResolvedValue([
    {
      providerId: "zerowall-1",
      groupId: 1,
      baseUrl: "https://code.aicodeme.cn/v1",
      models: ["gpt-4o", "claude-sonnet-4"],
    },
    {
      providerId: "zerowall-2",
      groupId: 2,
      baseUrl: "https://code.aicodeme.cn/v1",
      models: ["kimi-k2-thinking", "deepseek-v3", "glm-4.6", "qwen3-max", "gpt-4o"],
    },
    {
      providerId: "zerowall-3",
      groupId: 3,
      baseUrl: "https://code.aicodeme.cn/v1",
      models: ["gpt-4o", "gpt-5.4", "o3"],
    },
  ]);
  mocks.login.mockResolvedValue({ email: "a@b.co", baseUrl: "https://code.aicodeme.cn" });
  mocks.register.mockResolvedValue(undefined);
  mocks.balance.mockResolvedValue({ balance: "12.34" });
  mocks.addCustomProvider.mockResolvedValue(undefined);
  mocks.setDefaultModel.mockResolvedValue(undefined);
  mocks.connectRetry.mockResolvedValue(true);
  mocks.restoreSession.mockResolvedValue(null);
  mocks.providers = [{ id: "seed" }];
  localStorage.clear();
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

describe("model group visibility", () => {
  it("shows every service-visible group", () => {
    const all = [
      { id: 1, name: "zero-国产模型" },
      { id: 2, name: " Zero-GPT模型分组 " },
      { id: 3, name: "claude-science-稳定专属分组" },
      { id: 4, name: "GPT模型分组" },
      { id: 5, name: "测试分组" },
      { id: 6, name: "隐藏分组", visible: false },
      { id: 7, name: "不可用分组", available: false },
      { id: 8, name: "禁用分组", enabled: false },
    ];
    expect(openGroups(all).map((g) => g.name)).toEqual([
      "zero-国产模型",
      " Zero-GPT模型分组 ",
      "claude-science-稳定专属分组",
      "GPT模型分组",
      "测试分组",
    ]);
  });

  it("keeps legacy groups visible when the service omits visibility", () => {
    const renamed = [
      { id: 1, name: "channel-a" },
      { id: 2, name: "channel-b" },
    ];
    expect(openGroups(renamed)).toEqual(renamed);
  });

  it("gives every group its own neutral-namespace provider id, no bare special case", () => {
    // A gateway key is scoped to one group, so each open group is its own
    // provider. All groups — including the primary — get a `zerowall-<id>` id,
    // so switching between them switches the keychain entry and the fully-
    // qualified model ref never leaks the internal gateway name.
    expect(providerIdForGroup(2, 2)).toBe("zerowall-2");
    expect(providerIdForGroup(3, 2)).toBe("zerowall-3");
    // The primary group id argument is retained for call-site stability but
    // must not affect the mapping — same id in, same id out.
    expect(providerIdForGroup(5, 7)).toBe("zerowall-5");
  });
});

describe("Sub2API panel", () => {
  it("renders the public AI Platform brand without exposing the internal vendor name", async () => {
    const { container } = render(<Sub2ApiCard />);

    expect(await screen.findByText("AI Platform")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Sign in" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Create an account" })).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/Sub2API/i);
  });

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

  it("fetches and provisions every visible group without asking the user to choose one", async () => {
    mocks.account = { email: "a@b.co", baseUrl: "https://code.aicodeme.cn" };
    render(<Sub2ApiCard />);
    await userEvent.click(await screen.findByRole("button", { name: /Fetch my models/ }));

    // Wait for the final state — model chips appear after the batch provision resolves.
    await waitFor(() => expect(screen.getByRole("button", { name: /gpt-4o/ })).toBeInTheDocument());

    expect(mocks.fetchGroups).toHaveBeenCalledTimes(1);
    expect(mocks.provisionGroup).not.toHaveBeenCalled();
    expect(mocks.provisionGroups).toHaveBeenCalledWith([
      { groupId: 1, providerId: "zerowall-1" },
      { groupId: 2, providerId: "zerowall-2" },
      { groupId: 3, providerId: "zerowall-3" },
    ]);
    expect(screen.queryByText("Select a group")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "codex-pro分组" })).not.toBeInTheDocument();

    // The aggregated picker de-duplicates model ids that exist in several groups.
    const chips = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") !== null && b.className.includes("font-mono"));
    expect(chips.map((c) => c.textContent?.replace("★", ""))).toEqual([
      "deepseek-v3",
      "glm-4.6",
      "kimi-k2-thinking",
      "qwen3-max",
      "claude-sonnet-4",
      "gpt-4o",
      "gpt-5.4",
      "o3",
    ]);
    expect(chips.filter((c) => c.textContent?.includes("gpt-4o"))).toHaveLength(1);
    expect(chips.map((c) => c.getAttribute("aria-pressed"))).toEqual([
      "true",
      "true",
      "true",
      "true",
      "false",
      "false",
      "false",
      "false",
    ]);
    expect(screen.getByRole("button", { name: "Save 4 model(s)" })).toBeEnabled();
  });

  it("registers every group that contains at least one selected model", async () => {
    mocks.account = { email: "a@b.co", baseUrl: "https://code.aicodeme.cn" };
    render(<Sub2ApiCard />);
    await userEvent.click(await screen.findByRole("button", { name: /Fetch my models/ }));
    await userEvent.click(await screen.findByRole("button", { name: "gpt-4o" }));
    await userEvent.click(screen.getByRole("button", { name: "gpt-5.4" }));
    await userEvent.click(screen.getByRole("button", { name: "Save 6 model(s)" }));

    expect(mocks.addCustomProvider.mock.calls.map(([id]) => id)).toEqual([
      "zerowall-1",
      "zerowall-2",
      "zerowall-3",
    ]);
    expect(mocks.addCustomProvider.mock.calls[0][1].models).toEqual(["gpt-4o"]);
    expect(mocks.addCustomProvider.mock.calls[1][1].models).toEqual([
      "deepseek-v3",
      "glm-4.6",
      "kimi-k2-thinking",
      "qwen3-max",
      "gpt-4o",
    ]);
    expect(mocks.addCustomProvider.mock.calls[2][1].models).toEqual(["gpt-4o", "gpt-5.4"]);
  });

  it("registers the provider with no apiKey and auto-sets a domestic default model", async () => {
    mocks.account = { email: "a@b.co", baseUrl: "https://code.aicodeme.cn" };
    render(<Sub2ApiCard />);
    await userEvent.click(await screen.findByRole("button", { name: /Fetch my models/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Save 4 model(s)" }));

    expect(mocks.addCustomProvider).toHaveBeenCalledTimes(1);
    const [id, opts] = mocks.addCustomProvider.mock.calls[0];
    expect(id).toBe("zerowall-2");
    expect(opts).toEqual({
      // Gateway groups are internal credential routes, not user-facing
      // provider categories.
      name: "AI Platform",
      // Default is the Chat Completions protocol (@ai-sdk/openai-compatible);
      // the gateway only carries image parts on Chat Completions.
      npm: "@ai-sdk/openai-compatible",
      baseURL: "https://code.aicodeme.cn/v1",
      models: ["deepseek-v3", "glm-4.6", "kimi-k2-thinking", "qwen3-max"],
    });
    expect(opts).not.toHaveProperty("apiKey");
    // Auto-set the default model to the first domestic model, under the
    // per-group provider id (no bare `sub2api/`).
    expect(mocks.setDefaultModel).toHaveBeenCalledWith("zerowall-2/kimi-k2-thinking");
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

  it("provisions every open group and registers one provider each on sign-in", async () => {
    render(<Sub2ApiCard />);
    await userEvent.type(screen.getByPlaceholderText("Email"), "a@b.co");
    await userEvent.type(screen.getByPlaceholderText("Password"), "secret1");
    await userEvent.click(screen.getByRole("button", { name: /Sign in/ }));

    // Both open groups are provisioned in one batch. Each group gets its own
    // per-group provider id under the neutral namespace: switching between
    // them switches the keychain entry, and the fully-qualified model ref
    // (`zerowall-<n>/<model>`) never leaks the internal gateway name.
    await waitFor(() =>
      expect(mocks.provisionGroups).toHaveBeenCalledWith([
        { groupId: 1, providerId: "zerowall-1" },
        { groupId: 2, providerId: "zerowall-2" },
        { groupId: 3, providerId: "zerowall-3" },
      ]),
    );
    await waitFor(() => expect(mocks.addCustomProvider).toHaveBeenCalledTimes(3));
    expect(mocks.addCustomProvider.mock.calls.map((c) => c[0])).toEqual([
      "zerowall-1",
      "zerowall-2",
      "zerowall-3",
    ]);
    expect(mocks.addCustomProvider.mock.calls.map((c) => c[1].name)).toEqual([
      "AI Platform",
      "AI Platform",
      "AI Platform",
    ]);
    // GPT-family models from the second group are now registered, so a model
    // like gpt-5.4 resolves to a configured account instead of erroring.
    expect(mocks.addCustomProvider.mock.calls[2][1].models).toContain("gpt-5.4");
    // The default model stays a domestic one, under the primary group's
    // per-group provider id — no bare `sub2api/` prefix leaks out.
    expect(mocks.setDefaultModel).toHaveBeenCalledWith("zerowall-2/kimi-k2-thinking");
  });

  it("restores a saved session on mount when no live one exists", async () => {
    // No live account, but keychain-saved credentials re-log in behind the scenes.
    mocks.account = null;
    mocks.restoreSession.mockResolvedValue({ email: "saved@b.co", baseUrl: "https://code.aicodeme.xyz" });
    render(<Sub2ApiCard />);

    // The panel shows the restored account without the user touching the form.
    expect(await screen.findByText("saved@b.co")).toBeInTheDocument();
    expect(mocks.login).not.toHaveBeenCalled();
  });
});

describe("upstream protocol toggle", () => {
  beforeEach(() => {
    mocks.account = { email: "a@b.co", baseUrl: "https://code.aicodeme.cn" };
  });

  it("defaults to Chat Completions and picks the openai-compatible adapter on save", async () => {
    render(<Sub2ApiCard />);
    await userEvent.click(await screen.findByRole("button", { name: /Fetch my models/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Save 4 model(s)" }));

    expect(screen.getByRole("radio", { name: "Chat Completions" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(mocks.addCustomProvider.mock.calls[0][1].npm).toBe("@ai-sdk/openai-compatible");
  });

  it("switches to Responses, persists the choice, and re-registers the provider", async () => {
    render(<Sub2ApiCard />);
    await userEvent.click(await screen.findByRole("button", { name: /Fetch my models/ }));
    // Have a registered provider first so the switch re-registers it.
    await userEvent.click(await screen.findByRole("button", { name: "Save 4 model(s)" }));
    mocks.addCustomProvider.mockClear();

    await userEvent.click(screen.getByRole("radio", { name: "Responses" }));

    expect(localStorage.getItem("sub2api.protocol")).toBe("responses");
    await waitFor(() =>
      expect(mocks.addCustomProvider.mock.calls[0][1].npm).toBe("@ai-sdk/openai"),
    );
  });

  it("restores the persisted Responses protocol on mount", async () => {
    localStorage.setItem("sub2api.protocol", "responses");
    render(<Sub2ApiCard />);
    expect(await screen.findByRole("radio", { name: "Responses" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
