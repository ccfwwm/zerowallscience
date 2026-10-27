/** Follow active-language changes, not dictionary-registration revisions. */
export function syncLanguageWithHost(api, locale, readHostLanguage, setLanguage) {
  let disposed = false;
  let running = false;
  let pending = false;
  let observed = Symbol("initial language");
  const drain = async () => {
    running = true;
    try {
      while (pending && !disposed) {
        pending = false;
        const language = observed;
        let stored;
        try { stored = await api.languageGet(); } catch {}
        if (disposed) return;
        // A newer user selection wins over an older in-flight read.
        if (language !== observed) continue;
        if (stored?.autoApplySystemLanguage === false) {
          if (stored.language != null) setLanguage(stored.language);
          continue;
        }
        const next = language ?? stored?.language;
        if (next == null) continue;
        setLanguage(next);
        if (language !== null && stored?.language !== next) {
          try { await api.languageSave(next); } catch {}
        }
      }
    } finally { running = false; }
  };
  const changed = () => {
    if (disposed) return;
    const next = readHostLanguage(locale);
    if (next === observed) return;
    observed = next;
    pending = true;
    if (!running) void drain();
  };
  let unsubscribe;
  try { unsubscribe = locale?.subscribe?.(changed); } catch {}
  changed();
  return () => {
    disposed = true;
    try { unsubscribe?.(); } catch {}
  };
}
