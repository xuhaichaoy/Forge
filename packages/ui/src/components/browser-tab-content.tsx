import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  activeBrowserRuntimeTab,
  listenBrowserRuntimeSnapshots,
  loadBrowserRuntimeSnapshot,
  openBrowserRuntime,
  type BrowserRuntimeSnapshot,
} from "../state/browser-runtime";

export function BrowserTabContent({
  tabId,
  initialTabId,
  isActive,
  onRuntimeChange,
}: {
  tabId?: string;
  initialTabId?: string | null;
  isActive?: boolean;
  onRuntimeChange?: (snapshot: BrowserRuntimeSnapshot) => void;
}) {
  const [snapshot, setSnapshot] = useState<BrowserRuntimeSnapshot | null>(null);
  const [urlDraft, setUrlDraft] = useState("https://example.com");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestedTabId = useMemo(() => {
    if (initialTabId?.trim()) return initialTabId.trim();
    if (tabId?.startsWith("browser:")) return tabId.slice("browser:".length);
    return undefined;
  }, [initialTabId, tabId]);
  const activeTab = snapshot ? activeBrowserRuntimeTab(snapshot) : null;

  const publishSnapshot = useCallback((next: BrowserRuntimeSnapshot) => {
    setSnapshot(next);
    onRuntimeChange?.(next);
  }, [onRuntimeChange]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const next = await loadBrowserRuntimeSnapshot();
    publishSnapshot(next);
    setError(next.error ?? null);
    setLoading(false);
  }, [publishSnapshot]);

  useEffect(() => {
    if (!isActive) return;
    void refresh();
  }, [isActive, refresh]);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void listenBrowserRuntimeSnapshots(publishSnapshot).then((dispose) => {
      if (cancelled) {
        dispose?.();
        return;
      }
      unlisten = dispose;
    }).catch((listenerError) => {
      setError(listenerError instanceof Error ? listenerError.message : String(listenerError));
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [isActive, publishSnapshot]);

  const openRequestedTab = useCallback(async (url?: string | null) => {
    setLoading(true);
    setError(null);
    const next = await openBrowserRuntime(url, requestedTabId);
    publishSnapshot(next);
    setError(next.error ?? null);
    setLoading(false);
  }, [publishSnapshot, requestedTabId]);

  const submit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void openRequestedTab(urlDraft);
  }, [openRequestedTab, urlDraft]);

  return (
    <section className="hc-browser-tab" aria-label="Browser">
      <div className="hc-browser-tab-toolbar">
        <form className="hc-browser-tab-form" onSubmit={submit}>
          <input
            className="hc-browser-tab-input"
            value={urlDraft}
            placeholder="https://example.com"
            onChange={(event) => setUrlDraft(event.currentTarget.value)}
            aria-label="Browser URL"
          />
          <button className="hc-browser-tab-button" type="submit" disabled={loading}>
            <ExternalLink size={14} aria-hidden="true" />
            Open
          </button>
        </form>
        <button className="hc-browser-tab-icon-button" type="button" onClick={() => void refresh()} disabled={loading} title="Refresh Browser status">
          <RefreshCw size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="hc-browser-tab-status">
        <div className="hc-browser-tab-title">{activeTab?.title || "No active Browser tab"}</div>
        <div className="hc-browser-tab-meta">
          {activeTab?.displayUrl || activeTab?.url || (snapshot?.bridgeAvailable ? "Open a URL to create a runtime-backed Browser tab." : "Browser host bridge unavailable.")}
        </div>
        {error && <div className="hc-browser-tab-error">{error}</div>}
      </div>
    </section>
  );
}
