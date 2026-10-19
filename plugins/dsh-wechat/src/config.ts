/**
 * Configuration types and defaults for dsh-wechat.
 */

import path from "node:path";
import os from "node:os";

export interface WeChatDSHConfig {
  /** WeChat iLink gateway base URL. */
  baseUrl: string;
  /** WeChat CDN base URL (media upload/download). */
  cdnBaseUrl: string;
  /** iLink bot type. */
  botType: string;
  /** Storage directory (token, sync-buf, session mapping). */
  storageDir: string;
  /** Working directory for newly created DSH sessions. */
  cwd: string;
  /** WeChat single-message length limit (chars). */
  textChunkLimit: number;
  /** Soft timeout for question/permission cards (ms). */
  cardTimeoutMs: number;
  /** Cross-session decision push (full permission/question cards of non-current sessions). Default off. */
  crossSessionNotify: boolean;
  /**
   * Background-task completion/error notices for non-current sessions.
   * Independent of `crossSessionNotify` (which now only gates decision
   * cards); default off so only decision cards reach WeChat unless enabled.
   */
  notifyTaskEvents: boolean;
  /**
   * Silent mode: only send the final text of each turn. Global, survives
   * re-scan (which clears per-user `state.json`). Default off.
   */
  silent: boolean;
  /**
   * 结论模式 / Final-only: hold every narration push (the bound session's
   * assistant text AND cross-session task notices) and deliver exactly one
   * consolidated conclusion once the whole task has gone quiet. Where
   * `silent` is per-TURN (one message per turn — a goal that auto-continues
   * over 8 rounds still produces 8 messages), `finalOnly` is per-TASK.
   * Takes precedence over `silent`. Default off.
   */
  finalOnly: boolean;
  /** `finalOnly` settle window (ms): every activity event pushes it back. */
  finalOnlyIdleMs: number;
  /** `finalOnly` hard ceiling (ms): after this, deliver whatever is held. */
  finalOnlyCeilingMs: number;
  /** Inject the WeChat surface prompt while the last user message came from WeChat. Default off. */
  surfacePromptEnabled: boolean;
  /** Runtime-context text injected for WeChat-driven turns (edited from the settings page). */
  surfacePrompt: string;
  /**
   * Per-minute cap on agent-initiated `send_wechat` pushes. `0` disables the
   * cap. A runaway agent loop can otherwise spend the whole 10-message
   * gateway window on narration and leave no room for the answer; at the cap
   * the tool returns `ok:false` so the model stops pushing instead of the
   * bridge silently dropping what it sent.
   */
  sendWechatRateLimitPerMinute: number;
  /**
   * Inbound allowlist of WeChat user ids. EMPTY (the default) keeps the
   * historical single-peer behaviour: the first inbound user becomes the
   * bound peer. Non-empty means only those ids are processed — anyone else
   * is ignored with a log line, never answered.
   */
  allowedUsers: string[];
}

/** Default WeChat surface prompt — injected as a runtime-context snapshot. */
export const DEFAULT_SURFACE_PROMPT =
  "你正在通过微信(WeChat)与用户聊天。回复会发送到微信，请使用适合微信阅读的格式（支持简单的 Markdown、适度使用 emoji、避免过长的表格）。";

/**
 * Superseded built-in prompts. `surfacePrompt` is persisted verbatim once the
 * settings page is saved, so a stored value equal to one of these is an
 * untouched default rather than a user customization: it is dropped on load so
 * the current {@link DEFAULT_SURFACE_PROMPT} applies. Genuinely edited prompts
 * never match and are always preserved.
 */
export const LEGACY_SURFACE_PROMPTS: readonly string[] = [
  "你正在通过微信(WeChat)与用户聊天。回复会发送到微信，请使用适合微信阅读的格式（纯文本、适度使用 emoji、避免过长的表格）。",
];

export function defaultStorageDir(): string {
  return path.join(os.homedir(), ".dsh-wechat");
}

export function defaultConfig(): WeChatDSHConfig {
  return {
    baseUrl: "https://ilinkai.weixin.qq.com",
    cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
    botType: "3",
    storageDir: defaultStorageDir(),
    cwd: process.cwd(),
    textChunkLimit: 4000,
    cardTimeoutMs: 30 * 60_000,
    crossSessionNotify: false,
    notifyTaskEvents: false,
    silent: false,
    finalOnly: false,
    finalOnlyIdleMs: 45_000,
    finalOnlyCeilingMs: 10 * 60_000,
    surfacePromptEnabled: false,
    surfacePrompt: DEFAULT_SURFACE_PROMPT,
    sendWechatRateLimitPerMinute: 10,
    allowedUsers: [],
  };
}
