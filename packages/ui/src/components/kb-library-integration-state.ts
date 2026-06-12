import { useCallback, useEffect, useState } from "react";
import {
  createYuxiMcpServer,
  deleteYuxiMcpServer,
  getYuxiEmbeddingModelsStatus,
  getYuxiKnowledgeStats,
  getYuxiKnowledgeTypes,
  getYuxiPresalesStats,
  getYuxiSupportedFileTypes,
  listYuxiMcpServers,
  listYuxiMcpTools,
  refreshYuxiMcpTools,
  setYuxiMcpServerStatus,
  testYuxiMcpServer,
  toggleYuxiMcpTool,
  updateYuxiMcpServer,
  type YuxiEmbeddingModelsStatusResponse,
  type YuxiKnowledgeStatsResponse,
  type YuxiKnowledgeTypesResponse,
  type YuxiMcpServer,
  type YuxiMcpServerPayload,
  type YuxiMcpServerTestResponse,
  type YuxiMcpTool,
  type YuxiPresalesStatsResponse,
  type YuxiSupportedFileTypesResponse,
} from "../lib/yuxi-client";

export interface IntegrationSnapshot {
  presales: YuxiPresalesStatsResponse | null;
  knowledge: YuxiKnowledgeStatsResponse | null;
  supportedTypes: YuxiSupportedFileTypesResponse | null;
  knowledgeTypes: YuxiKnowledgeTypesResponse | null;
  embeddings: YuxiEmbeddingModelsStatusResponse | null;
  mcpServers: YuxiMcpServer[];
}

export interface McpServerDraft {
  name: string;
  transport: "streamable_http" | "sse" | "stdio";
  url: string;
  command: string;
  description: string;
  tags: string;
}

const EMPTY_SERVER_DRAFT: McpServerDraft = {
  name: "",
  transport: "streamable_http",
  url: "",
  command: "",
  description: "",
  tags: "",
};

export function useKbLibraryIntegrationState({
  confirmDialog,
}: {
  confirmDialog: (message: string) => Promise<boolean>;
}) {
  const [snapshot, setSnapshot] = useState<IntegrationSnapshot>({
    presales: null,
    knowledge: null,
    supportedTypes: null,
    knowledgeTypes: null,
    embeddings: null,
    mcpServers: [],
  });
  const [serverTests, setServerTests] = useState<Record<string, YuxiMcpServerTestResponse>>({});
  const [testingServer, setTestingServer] = useState<string | null>(null);
  const [selectedToolServer, setSelectedToolServer] = useState<string | null>(null);
  const [toolRows, setToolRows] = useState<YuxiMcpTool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [serverFormOpen, setServerFormOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editingServerName, setEditingServerName] = useState<string | null>(null);
  const [serverDraft, setServerDraft] = useState<McpServerDraft>(EMPTY_SERVER_DRAFT);
  const [serverSaving, setServerSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    const results = await Promise.allSettled([
      getYuxiPresalesStats(),
      getYuxiKnowledgeStats(),
      getYuxiSupportedFileTypes(),
      getYuxiKnowledgeTypes(),
      getYuxiEmbeddingModelsStatus(),
      listYuxiMcpServers(),
    ] as const);
    setSnapshot({
      presales: fulfilled(results[0]),
      knowledge: fulfilled(results[1]),
      supportedTypes: fulfilled(results[2]),
      knowledgeTypes: fulfilled(results[3]),
      embeddings: fulfilled(results[4]),
      mcpServers: fulfilled(results[5])?.data ?? [],
    });
    const failures = results.filter((item) => item.status === "rejected").length;
    if (failures > 0) setError(`有 ${failures} 项系统能力读取失败，请检查权限或连接。`);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const testServer = useCallback(async (server: YuxiMcpServer) => {
    const name = server.name;
    if (!name) return;
    setTestingServer(name);
    setError(null);
    try {
      const result = await testYuxiMcpServer(name);
      setServerTests((prev) => ({ ...prev, [name]: result }));
    } catch (err) {
      setServerTests((prev) => ({ ...prev, [name]: { success: false, message: err instanceof Error ? err.message : String(err) } }));
    } finally {
      setTestingServer(null);
    }
  }, []);

  const toggleServer = useCallback(async (server: YuxiMcpServer) => {
    const name = server.name;
    if (!name) return;
    setError(null);
    try {
      await setYuxiMcpServerStatus(name, server.enabled === false);
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loadSnapshot]);

  const loadTools = useCallback(async (serverName: string, refresh = false) => {
    setSelectedToolServer(serverName);
    setToolsLoading(true);
    setToolsError(null);
    try {
      const result = refresh
        ? await refreshYuxiMcpTools(serverName)
        : await listYuxiMcpTools(serverName);
      setToolRows(result.data ?? []);
    } catch (err) {
      setToolRows([]);
      setToolsError(err instanceof Error ? err.message : String(err));
    } finally {
      setToolsLoading(false);
    }
  }, []);

  const toggleTool = useCallback(async (serverName: string, toolName: string) => {
    setToolsError(null);
    try {
      await toggleYuxiMcpTool(serverName, toolName);
      await loadTools(serverName);
    } catch (err) {
      setToolsError(err instanceof Error ? err.message : String(err));
    }
  }, [loadTools]);

  const openCreateServer = useCallback((sourceName = "") => {
    setEditingServerName(null);
    setServerDraft({
      ...EMPTY_SERVER_DRAFT,
      name: sourceName,
      description: sourceName ? `${sourceName}数据来源` : "",
      tags: sourceName,
    });
    setServerFormOpen(true);
    setError(null);
  }, []);

  const openEditServer = useCallback((server: YuxiMcpServer) => {
    if (!server.name) return;
    setEditingServerName(server.name);
    setServerDraft({
      name: server.name,
      transport: normalizeTransport(server.transport),
      url: server.url || "",
      command: server.command || "",
      description: server.description || "",
      tags: (server.tags ?? []).join("、"),
    });
    setServerFormOpen(true);
    setError(null);
  }, []);

  const closeServerForm = useCallback(() => {
    setServerFormOpen(false);
    setEditingServerName(null);
    setServerDraft(EMPTY_SERVER_DRAFT);
  }, []);

  const saveServer = useCallback(async () => {
    const payload = draftToPayload(serverDraft);
    if (!editingServerName && !payload.name) {
      setError("请填写系统名称。");
      return;
    }
    if (payload.transport !== "stdio" && !payload.url) {
      setError("请填写系统地址。");
      return;
    }
    if (payload.transport === "stdio" && !payload.command) {
      setError("本地服务需要填写启动命令。");
      return;
    }
    setServerSaving(true);
    setError(null);
    try {
      if (editingServerName) {
        await updateYuxiMcpServer(editingServerName, payload);
      } else {
        await createYuxiMcpServer(payload);
      }
      closeServerForm();
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setServerSaving(false);
    }
  }, [closeServerForm, editingServerName, loadSnapshot, serverDraft]);

  const deleteServer = useCallback(async (server: YuxiMcpServer) => {
    if (!server.name) return;
    if (!(await confirmDialog(`删除来源系统「${server.name}」吗？`))) return;
    setError(null);
    try {
      await deleteYuxiMcpServer(server.name);
      if (selectedToolServer === server.name) {
        setSelectedToolServer(null);
        setToolRows([]);
      }
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [confirmDialog, loadSnapshot, selectedToolServer]);

  return {
    snapshot,
    serverTests,
    testingServer,
    selectedToolServer,
    toolRows,
    toolsLoading,
    toolsError,
    serverFormOpen,
    advancedOpen,
    setAdvancedOpen,
    editingServerName,
    serverDraft,
    setServerDraft,
    serverSaving,
    loading,
    error,
    loadSnapshot,
    testServer,
    toggleServer,
    loadTools,
    toggleTool,
    openCreateServer,
    openEditServer,
    closeServerForm,
    saveServer,
    deleteServer,
  };
}

function fulfilled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function normalizeTransport(value: string | null | undefined): McpServerDraft["transport"] {
  if (value === "sse" || value === "stdio") return value;
  return "streamable_http";
}

function draftToPayload(draft: McpServerDraft): YuxiMcpServerPayload {
  return {
    name: draft.name.trim(),
    transport: draft.transport,
    url: draft.transport === "stdio" ? null : draft.url.trim(),
    command: draft.transport === "stdio" ? draft.command.trim() : null,
    description: draft.description.trim() || null,
    tags: splitList(draft.tags),
  };
}

function splitList(value: string): string[] {
  return value
    .split(/[、,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
