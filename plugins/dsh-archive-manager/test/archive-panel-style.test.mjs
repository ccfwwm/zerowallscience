import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const clientPath = fileURLToPath(new URL("../src/client.ts", import.meta.url));

test("归档会话使用卡片布局，并始终显示恢复与删除操作", async () => {
  const client = await readFile(clientPath, "utf8");

  assert.match(client, /dsham_archiveCardActions/);
  assert.match(client, /dsham_archiveCardMeta/);
  assert.match(client, /onUnarchive\(node\.id\)/);
  assert.match(client, /onDeleteSession\(node\.id, row\.title\)/);
  assert.match(client, /background:var\(--dsw-alias-button-elevated-fill\)/);
});

test("设置页不再桥接 Ant，控件直接使用宿主原语和令牌", async () => {
  const client = await readFile(clientPath, "utf8");
  const discovery = await readFile(new URL("../src/archive-discovery-ui.ts", import.meta.url), "utf8");
  const organizer = await readFile(new URL("../src/archive-organizer-ui.ts", import.meta.url), "utf8");
  for (const source of [client, discovery, organizer]) {
    assert.doesNotMatch(source, /from ["']antd|antd-ui\.js|from ["']dayjs/);
  }
  assert.match(client, /SegmentedTabs/);
  assert.match(client, /dsham_modalDialog/);
  assert.match(client, /--dsw-radius-panel/);
  assert.match(client, /--dsw-alias-bg-layer-2/);
  assert.match(discovery, /SegmentedControl/);
  assert.match(organizer, /NumberField/);
});

test("图标按钮样式全局注入，侧栏卡片不依赖设置页先渲染", async () => {
  const client = await readFile(clientPath, "utf8");
  const settingsStart = client.indexOf("const ARCHIVE_SETTINGS_CSS = [");
  const settingsCss = client.slice(settingsStart, client.indexOf('].join("");', settingsStart));

  // 侧栏归档卡片与设置页共用图标按钮类，样式必须挂在启动时注入的全局 style 上。
  assert.match(client, /dsh-archive-manager\/IconAction\.css/);
  assert.match(client, /const ICON_ACTION_CSS = "\.dsham_iconAction\{[^"]*display:inline-flex/);
  assert.doesNotMatch(settingsCss, /dsham_iconAction/);
  assert.doesNotMatch(client, /dsham_archiveCardDelete/);
});

test("模态与侧栏确认卡片样式全局注入，侧栏删除不依赖设置页渲染 (Issue #59 / #60)", async () => {
  const client = await readFile(clientPath, "utf8");
  assert.match(client, /dsh-archive-manager\/Modal\.css/);
  assert.match(client, /dsh-archive-manager\/SidebarPopover\.css/);
  assert.match(client, /dsham_sidebarCardRoot/);
  assert.match(client, /dsham_sidebarCardBtnCancel/);
});

test("删除与停止确认用红色描边按钮，对齐宿主警告样式", async () => {
  const client = await readFile(clientPath, "utf8");

  assert.match(client, /modalFooterButton\(\{ danger: true, disabled: busy, onClick: confirmDelete/);
  assert.match(client, /\.dsham_btnDanger:not\(:disabled\)\{[^}]*color:var\(--dsw-alias-state-error-primary/);
  assert.doesNotMatch(client, /variant: "primary", disabled: busy, onClick: confirmDelete/);
  assert.doesNotMatch(client, /dsham_modalDanger/);
  assert.doesNotMatch(client, /dsham_settingsDeleteConfirm/);
});

test("弹窗底部按钮用宿主默认尺寸，危险操作统一自带红色描边类", async () => {
  const client = await readFile(clientPath, "utf8");
  const helper = client.slice(client.indexOf("function modalFooterButton"), client.indexOf("function tabsShell"));

  assert.match(helper, /function modalFooterButton/);
  assert.doesNotMatch(helper, /size:/);
  assert.match(helper, /danger \? "outline" : variant/);
  assert.match(helper, /danger \? "dsham_btnDanger" : undefined/);
  assert.match(client, /modalFooterButton\(\{ variant: "primary"/);
  assert.doesNotMatch(client, /dsham_modalDanger/);
  // 宿主哈希类名随版本漂移，不能再引用，否则红色在运行时悄悄失效。
  assert.doesNotMatch(client, /WorkspaceBrowser_module_css_default\.deleteAction/);
  assert.doesNotMatch(client, /dsham_archiveWorkspaceConfirm/);
  assert.doesNotMatch(client, /border-color:var\(--dsw-alias-state-error-primary\)!important/);
});
