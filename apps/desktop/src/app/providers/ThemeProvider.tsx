import { useEffect, type ReactNode } from "react";
import { useUiStore } from "@/lib/store";
import { isMacUA, isTauri, setWindowTheme } from "@/lib/tauri";

/** Applies the current theme to the document root. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    void setWindowTheme(theme === "dark");
  }, [theme]);
  // The macOS desktop window has a vibrancy material behind the webview
  // (tauri.macos.conf.json); flag the root so CSS can let the sidebar show it.
  useEffect(() => {
    if (isTauri && isMacUA()) document.documentElement.dataset.vibrancy = "1";
  }, []);
  return <>{children}</>;
}
