import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useRuntimeStore } from "@/lib/runtime";
import { findLeaf, useLayoutStore } from "@/lib/layout";
import { SessionView } from "@/components/session/SessionView";

/**
 * The live surface intentionally presents one current conversation. The
 * persisted layout store is still read and updated for migration compatibility,
 * but legacy groups and panes are never exposed as desktop UI.
 */
export function LiveSessionPage() {
  const { sessionId = null } = useParams();
  const navigate = useNavigate();
  const tree = useLayoutStore((state) => state.tree);
  const focusedLeafId = useLayoutStore((state) => state.focusedLeafId);
  const focusedLeaf = tree && focusedLeafId ? findLeaf(tree, focusedLeafId) : null;
  const leafId = focusedLeaf?.id ?? "primary";

  const status = useRuntimeStore((state) => state.status);
  const switching = useRuntimeStore((state) => state.switching);
  const sessions = useRuntimeStore((state) => state.sessions);
  const currentId = useRuntimeStore((state) => state.currentId);
  const runningCount = useRuntimeStore((state) => Object.keys(state.runningSessions).length);
  const openSession = useRuntimeStore((state) => state.openSession);
  const startDraft = useRuntimeStore((state) => state.startDraft);
  const reconcileRunning = useRuntimeStore((state) => state.reconcileRunning);
  const syncPaneStreams = useRuntimeStore((state) => state.syncPaneStreams);
  const connected = status === "ready" || switching;
  const sessionDir = sessions.find((session) => session.id === sessionId)?.directory;

  // Keep the one compatibility leaf aligned with the route. No screen/group
  // switching is performed, and old additional groups remain hidden.
  useEffect(() => {
    const layout = useLayoutStore.getState();
    if (!layout.tree || !layout.focusedLeafId) layout.reset(sessionId);
    else layout.bindSession(layout.focusedLeafId, sessionId);
  }, [sessionId]);

  // The single visible conversation owns the only stream.
  useEffect(() => {
    syncPaneStreams([]);
  }, [syncPaneStreams]);

  useEffect(() => {
    if (sessionId) void openSession(sessionId);
    else if (currentId) startDraft();
  }, [sessionId, connected, sessionDir, currentId, openSession, startDraft]);

  useEffect(() => {
    if (runningCount === 0) return;
    const timer = window.setInterval(() => void reconcileRunning(), 15_000);
    return () => window.clearInterval(timer);
  }, [runningCount, reconcileRunning]);

  return (
    <SessionView
      sessionId={sessionId}
      leafId={leafId}
      focused
      chromeAsTitlebar
      onSessionCreated={(created) => navigate(`/live/${created}`)}
    />
  );
}
