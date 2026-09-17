/**
 * dsh-ssh-ops browser plugin entry.
 *
 * Two integration modes, chosen per environment:
 *
 * - Official Sidebar mode (new DSH, `sidebarRightTabs` + `sidebarRight`
 *   present): the SSH terminal is a TAB of the official right-Sidebar, beside
 *   the built-in Files tab. Registration follows the same public two-stage
 *   path every tab type uses — the type into `ctx.sidebarRightTabs`, the body
 *   into the keyed `sidebar.right.pane.tab` seat under the type's `id`. The
 *   session-header SSH button opens or focuses that tab (repeated clicks
 *   focus, never duplicate). Width, split, fullscreen and collapse are the
 *   Sidebar's; no floating panel, no chat-column margin, no own resize.
 * - Drawer mode (older DSH): the previous fixed right-side floating panel
 *   (`SshDrawer.jsx` in `shell.overlay`) with its own width and the chat
 *   column reservation — kept as the compatibility fallback.
 *
 * Connection lifetime is independent of the view in both modes: switching
 * tabs, collapsing the Sidebar, closing the SSH tab, or switching chats never
 * disconnects; terminals are pooled client-side (`terminal-pool.js`) and the
 * host replays output buffered while no view was attached.
 */
import * as React from "react";
import { resourceZh, resourceEn } from "./resource-locales.js";
import { createSshApi } from "./api.js";
import { IconTerminal16 } from "./IconTerminal16.jsx";
import { SshDrawer } from "./SshDrawer.jsx";
import { SshSidebarBody } from "./SshSidebarBody.jsx";
import { SshPanel } from "./SshPanel.jsx";
import { SshResources } from "./SshResources.jsx";
import { getSshUiSnapshot, sshUiSetOpen, sshUiSetSurfaceOpener } from "./store.js";
import { activateSidebarWhenAvailable } from "./sidebar-lifecycle.js";
import TYPERT_REMOTE from "../remote.js";

const NS = "ssh-ops";

/** The tab kind this plugin owns in the official Sidebar, and its registry id. */
export const SSH_TAB_KIND = "ssh";
export const SSH_TAB_ID = "dsh-ssh-ops";

export const inject = ["remote", "remote.credentials", "slots", "locale", "connection"];

export async function apply(ctx) {
  const disposers = [];
  /** Track one disposer; on any later failure everything unwinds in reverse. */
  const own = (dispose) => {
    if (typeof dispose === "function") disposers.push(dispose);
    return dispose;
  };
  try {
    const dispose = await ctx.remote.$mount(TYPERT_REMOTE);
    own(dispose);
  } catch (error) {
    for (const d of disposers.reverse()) await d();
    throw error;
  }

  const api = createSshApi(ctx);

  const localeDispose = own(ctx.locale.register(NS, {
    zh: {
      ...resourceZh,
      sshAction: "SSH 终端",
      sshActionClose: "关闭 SSH 终端",
      sidebarTabTitle: "SSH 终端",
      openSidebarTab: "打开或聚焦 SSH 终端标签",
      guideTitle: "SSH 终端",
      guideDescription: "连接服务器，使用终端、远程文件、转发、快捷命令与数据库工具"
    },
    en: {
      ...resourceEn,
      sshAction: "SSH Terminal",
      sshActionClose: "Close SSH terminal",
      sidebarTabTitle: "SSH Terminal",
      openSidebarTab: "Open or focus the SSH terminal tab",
      guideTitle: "SSH Terminal",
      guideDescription: "Connect to servers with a terminal, remote files, tunnels, snippets, and database tools"
    }
  }));

  const t = ctx.locale.bind(NS);

  // Start with the legacy drawer so older DSH releases remain usable. Newer
  // hosts provide their Sidebar faces asynchronously; a one-time ctx.get()
  // snapshot here races that startup and permanently selects the drawer.
  own(activateSidebarWhenAvailable(ctx, {
    registerLegacy: (legacyCtx) => applyLegacyRegistrations(legacyCtx, { api }),
    registerSidebar: (sidebarCtx) => applySidebarRegistrations(sidebarCtx, { api, t }),
    onSidebarError: (error) => {
      console.error("[dsh-ssh-ops] sidebar tab registration failed; keeping legacy drawer:", error);
    }
  }));

  // Use the host view roster so SSH selection replaces the transcript and
  // has exactly the same selection/replay lifecycle as Chat and Zotero.
  own(ctx.slots.inject("conversation.view", () => ctx.slots.register({
    name: "conversation.view",
    id: "ssh",
    order: 40,
    label: "SSH",
    inject: () => ({ api, credentials: ctx.remote?.credentials })
  }, function SshConversationView({ api, credentials }) {
    return <div data-zerowall-ssh-view="" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, height: "100%" }}>
      <SshPanel api={api} credentials={credentials} viewId="zerowall-ssh-main" />
    </div>;
  })));

  // SSH resources are a first-class settings section, beside General and
  // Models. Keeping them under Settings → Plugins made an operational
  // inventory look like implementation detail and forced an extra tab click.
  // The header SSH button remains only a terminal visibility toggle.
  own(ctx.slots.inject("settings.section", () =>
    ctx.slots.register(
      {
        name: "settings.section",
        id: "ssh-ops-resources",
        order: 35,
        label: () => t("SSH 资源"),
        icon: "terminal",
        locale: NS,
        inject: () => ({ api, credentials: ctx.remote?.credentials })
      },
      SshResources
    )
  ));

  return async () => {
    for (const d of disposers.reverse()) await d();
  };
}

/** Official Sidebar registrations: both stages live under one disposable scope. */
function applySidebarRegistrations(ctx, { api, t }) {
  const disposers = [];
  const own = (dispose) => {
    if (typeof dispose === "function") disposers.push(dispose);
    return dispose;
  };
  try {
    // Surfaces that do not own a pane (the resources page) ask for the
    // terminal through the shared store; in this mode that means focusing the
    // Sidebar tab. Cleared on release so a later mode switch cannot keep
    // calling into a host whose Sidebar is gone.
    sshUiSetSurfaceOpener(() => {
      try {
        ctx.sidebarRight.openTab(SSH_TAB_KIND);
      } catch (error) {
        console.warn("[dsh-ssh-ops] openTab failed:", error?.message ?? error);
      }
    });
    own(() => sshUiSetSurfaceOpener(null));
    own(ctx.sidebarRightTabs.register({
      id: SSH_TAB_ID,
      kind: SSH_TAB_KIND,
      priority: "extension",
      title: () => t("sidebarTabTitle"),
      guide: [{
        order: 20,
        title: () => t("guideTitle"),
        description: () => t("guideDescription"),
        icon: IconTerminal16
      }]
    }));
    own(ctx.slots.inject("sidebar.right.pane.tab", () =>
      ctx.slots.register(
        {
          name: "sidebar.right.pane.tab",
          key: SSH_TAB_ID,
          locale: NS,
          inject: () => ({ api, credentials: ctx.remote?.credentials })
        },
        SshSidebarBody
      )
    ));
    own(ctx.slots.inject("conversation.session.header.utilities", () =>
      ctx.slots.register(
        {
          name: "conversation.session.header.utilities",
          id: "ssh-ops-tab-action",
          order: 90,
          locale: NS
        },
        function SshSidebarTabAction() {
          return React.createElement(SshTabButtonHost, {
            press: () => {
              try {
                ctx.sidebarRight.openTab(SSH_TAB_KIND);
              } catch (error) {
                console.warn("[dsh-ssh-ops] openTab failed:", error?.message ?? error);
              }
            },
            isActive: () => {
              try {
                if (!ctx.sidebarRight.isExpanded()) return false;
                return ctx.sidebarRight.active()?.kind === SSH_TAB_KIND;
              } catch {
                return false;
              }
            },
            title: t("openSidebarTab"),
            ariaLabel: "SSH 终端侧栏",
            watchActive: true
          });
        }
      )
    ));
    return () => {
      for (const dispose of disposers.reverse()) dispose();
    };
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose();
    throw error;
  }
}

/** Drawer-mode registrations (legacy DSH): toggle button + shell.overlay panel. */
function applyLegacyRegistrations(ctx, { api }) {
  const disposers = [];
  const own = (dispose) => {
    if (typeof dispose === "function") disposers.push(dispose);
    return dispose;
  };
  // The optional side-by-side drawer has a header utility, separate from the
  // mutually exclusive main conversation views.
  own(ctx.slots.inject("conversation.session.header.utilities", () =>
    ctx.slots.register(
      {
        name: "conversation.session.header.utilities",
        id: "ssh-ops-tab-action",
        order: 90,
        locale: NS
      },
      SshDrawerTabAction
    )
  ));

  // The panel itself: a fixed right-side floating panel, mounted at the shell
  // overlay level so it spans the whole app frame regardless of conversation
  // scroll state.
  own(ctx.slots.inject("shell.overlay", () =>
    ctx.slots.register(
      {
        name: "shell.overlay",
        id: "ssh-ops-panel",
        order: 100,
        locale: NS,
        inject: () => ({ api, credentials: ctx.remote?.credentials })
      },
      SshDrawer
    )
  ));
  return () => {
    for (const dispose of disposers.reverse()) dispose();
  };
}

/** A separate utility opens the optional side-by-side terminal. It is never
 * inserted into the mutually exclusive conversation view tab strip. */
function SshTabButtonHost({ press, title, ariaLabel }) {
  return <button type="button" onClick={press} title={title} aria-label={ariaLabel}
    style={{ background: "transparent", color: "inherit", border: 0, cursor: "pointer", padding: 4 }}>
    <IconTerminal16 />
  </button>;
}

function SshDrawerTabAction() {
  return <SshTabButtonHost
    press={() => sshUiSetOpen(!getSshUiSnapshot().open)}
    title="打开 SSH 侧栏" ariaLabel="SSH 终端侧栏" />;
}
