import type { CSSProperties } from "react";

/** macOS overlay-titlebar geometry. The native traffic lights sit at a fixed
 *  window position (tauri `trafficLightPosition`) and do NOT scale with the
 *  webview page zoom (Cmd/Ctrl +/-). So any strip that clears them counter-
 *  scales its height and left inset by 1/--zoom (owned by ZoomProvider) to keep
 *  the collapse/expand button pinned to the lights at every zoom level. */
export const TITLEBAR_HEIGHT_PX = 48; // matches Tailwind h-12
export const TRAFFIC_LIGHT_INSET_PX = 78; // clears the three-button cluster

/** Inline style for a macOS overlay-titlebar strip. When `clearsLights` is
 *  true the strip insets past the traffic lights; otherwise it uses a small pad
 *  (matches pl-2). Both dimensions divide by --zoom so the strip stays a fixed
 *  physical size regardless of page zoom. */
export function overlayTitlebarStyle(clearsLights: boolean): CSSProperties {
  return {
    height: `calc(${TITLEBAR_HEIGHT_PX}px / var(--zoom))`,
    paddingLeft: clearsLights
      ? `calc(${TRAFFIC_LIGHT_INSET_PX}px / var(--zoom))`
      : "calc(0.5rem / var(--zoom))",
  };
}
