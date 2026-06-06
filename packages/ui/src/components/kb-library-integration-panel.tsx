import { useCallback, useEffect, useState } from "react";
import { Archive, Link2, RefreshCw, SearchCheck, Settings2 } from "lucide-react";
import {
  createYuxiMcpServer,
  deleteYuxiMcpServer,
  getYuxiEmbeddingModelsStatus,
  getYuxiKnowledgeStats,
  getYuxiKnowledgeTypes,
  getYuxiPresalesStats,
  getYuxiSupportedFileTypes,
  listYuxiMcpTools,
  listYuxiMcpServers,
  refreshYuxiMcpTools,
  setYuxiMcpServerStatus,
  testYuxiMcpServer,
  toggleYuxiMcpTool,
  updateYuxiMcpServer,
  yuxiBusinessLineLabel,
  yuxiEntityTypeLabel,
  yuxiLibraryGovernance,
  type YuxiEmbeddingModelsStatusResponse,
  type YuxiCategoryMeta,
  type YuxiKnowledgeDatabase,
  type YuxiKnowledgeStatsResponse,
  type YuxiKnowledgeTypesResponse,
  type YuxiMcpServer,
  type YuxiMcpServerPayload,
  type YuxiMcpServerTestResponse,
  type YuxiMcpTool,
  type YuxiPresalesStatsResponse,
  type YuxiSupportedFileTypesResponse,
} from "../lib/yuxi-client";
import { useConfirmDialog } from "./confirm-dialog";
import { parseYuxiTimestamp } from "./kb-library-model";

interface IntegrationSnapshot {
  presales: YuxiPresalesStatsResponse | null;
  knowledge: YuxiKnowledgeStatsResponse | null;
  supportedTypes: YuxiSupportedFileTypesResponse | null;
  knowledgeTypes: YuxiKnowledgeTypesResponse | null;
  embeddings: YuxiEmbeddingModelsStatusResponse | null;
  mcpServers: YuxiMcpServer[];
}

interface McpServerDraft {
  name: string;
  transport: "streamable_http" | "sse" | "stdio";
  url: string;
  command: string;
  description: string;
  tags: string;
}

interface BusinessSourceRow {
  name: string;
  server: YuxiMcpServer | null;
  status: "ok" | "pending" | "fail" | "archive";
  statusLabel: string;
  authorityLabel: string;
  usage: string;
  updatedLabel: string;
  issueLabel: string;
}

const EMPTY_SERVER_DRAFT: McpServerDraft = {
  name: "",
  transport: "streamable_http",
  url: "",
  command: "",
  description: "",
  tags: "",
};

export function KbLibraryIntegrationPanel({
  selectedCategory,
  selectedDatabase,
}: {
  selectedCategory: YuxiCategoryMeta | null;
  selectedDatabase: YuxiKnowledgeDatabase | null;
}) {
  // 应用内确认对话框（Tauri WebView 的 window.confirm 是 no-op，不能用）
  const { confirmDialog, confirmDialogNode } = useConfirmDialog();
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
      setServerFormOpen(false);
      setEditingServerName(null);
      setServerDraft(EMPTY_SERVER_DRAFT);
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setServerSaving(false);
    }
  }, [editingServerName, loadSnapshot, serverDraft]);

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

  if (!selectedCategory) {
    return (
      <section className="hc-kb-management-panel" aria-label="系统来源">
        <div className="hc-kb-empty">
          <div className="hc-kb-empty-content">
            <div className="hc-kb-empty-title">先在左侧选择知识库</div>
          </div>
        </div>
      </section>
    );
  }

  const governance = yuxiLibraryGovernance(selectedCategory.key);
  const systems = governance?.externalSystems ?? [];
  const uploadFields = governance?.uploadChecklist ?? [];
  const matchFields = governance?.matchSignals ?? [];
  const entityTotal = snapshot.presales?.entities?.total ?? 0;
  const pendingTotal = snapshot.presales?.pending?.total ?? 0;
  const scoring = snapshot.presales?.scoring;
  const supportedTypes = snapshot.supportedTypes?.file_types ?? [];
  const kbTypes = Object.keys(snapshot.knowledgeTypes?.kb_types ?? {});
  const embeddingStatus = snapshot.embeddings?.status;
  const entityByType = snapshot.presales?.entities?.by_type ?? {};
  const visibleServers = matchServers(snapshot.mcpServers, systems);
  const sourceRows = buildBusinessSourceRows({
    systems,
    servers: snapshot.mcpServers,
    serverTests,
    selectedCategory,
    selectedDatabase,
    pendingTotal,
  });
  const connectedSourceCount = sourceRows.filter((row) => row.status === "ok").length;

  return (
    <section className="hc-kb-management-panel" aria-label="系统来源">
      <div className="hc-kb-panel-head">
        <div>
          <div className="hc-kb-section-title">{selectedCategory.label} · 系统来源</div>
          <div className="hc-kb-section-subtitle">
            {yuxiBusinessLineLabel(selectedCategory.line)} / {selectedCategory.label}
          </div>
        </div>
        <button type="button" className="hc-kb-topbar-btn" onClick={() => void loadSnapshot()} disabled={loading}>
          <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
          {loading ? "刷新中" : "刷新"}
        </button>
      </div>

      {error && <div className="hc-kb-inline-alert" data-tone="danger">{error}</div>}

      <div className="hc-kb-metric-strip">
        <Metric label="预期来源" value={String(sourceRows.length)} />
        <Metric label="已接入" value={String(connectedSourceCount)} />
        <Metric label="资料" value={String(selectedDatabase?.file_count ?? selectedDatabase?.row_count ?? 0)} />
        <Metric label="档案" value={String(entityTotal)} />
        <Metric label="异常/冲突" value={String(pendingTotal)} />
        <Metric label="匹配条件" value={String(scoring?.rules ?? "-")} />
      </div>

      <div className="hc-kb-admin-grid">
        <section className="hc-kb-admin-section hc-kb-admin-section--wide">
          <div className="hc-kb-admin-section-head">
            <strong>业务系统来源</strong>
            <button type="button" className="hc-kb-topbar-btn" onClick={() => openCreateServer()}>
              <Link2 size={13} strokeWidth={2.2} aria-hidden="true" />
              接入来源
            </button>
          </div>
          {serverFormOpen && (
            <div className="hc-kb-server-form">
              <label>
                <span>系统名称</span>
                <input
                  value={serverDraft.name}
                  disabled={!!editingServerName}
                  onChange={(event) => setServerDraft((prev) => ({ ...prev, name: event.currentTarget.value }))}
                  placeholder="CRM / 讲师系统"
                />
              </label>
              <label>
                <span>方式</span>
                <select
                  value={serverDraft.transport}
                  onChange={(event) => setServerDraft((prev) => ({ ...prev, transport: event.currentTarget.value as McpServerDraft["transport"] }))}
                >
                  <option value="streamable_http">在线服务</option>
                  <option value="sse">实时服务</option>
                  <option value="stdio">本地服务</option>
                </select>
              </label>
              {serverDraft.transport === "stdio" ? (
                <label className="hc-kb-server-form-wide">
                  <span>启动命令</span>
                  <input
                    value={serverDraft.command}
                    onChange={(event) => setServerDraft((prev) => ({ ...prev, command: event.currentTarget.value }))}
                    placeholder="/usr/local/bin/server"
                  />
                </label>
              ) : (
                <label className="hc-kb-server-form-wide">
                  <span>系统地址</span>
                  <input
                    value={serverDraft.url}
                    onChange={(event) => setServerDraft((prev) => ({ ...prev, url: event.currentTarget.value }))}
                    placeholder="https://..."
                  />
                </label>
              )}
              <label className="hc-kb-server-form-wide">
                <span>用途</span>
                <input
                  value={serverDraft.description}
                  onChange={(event) => setServerDraft((prev) => ({ ...prev, description: event.currentTarget.value }))}
                  placeholder="CRM / 讲师后台 / 项目系统"
                />
              </label>
              <label className="hc-kb-server-form-wide">
                <span>标签</span>
                <input
                  value={serverDraft.tags}
                  onChange={(event) => setServerDraft((prev) => ({ ...prev, tags: event.currentTarget.value }))}
                  placeholder="CRM、售前、讲师系统"
                />
              </label>
              <div className="hc-kb-server-form-actions">
                <button
                  type="button"
                  className="hc-kb-topbar-btn"
                  disabled={serverSaving}
                  onClick={() => {
                    setServerFormOpen(false);
                    setEditingServerName(null);
                    setServerDraft(EMPTY_SERVER_DRAFT);
                  }}
                >
                  取消
                </button>
                <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--primary" disabled={serverSaving} onClick={() => void saveServer()}>
                  {serverSaving ? "保存中" : editingServerName ? "保存来源" : "创建来源"}
                </button>
              </div>
            </div>
          )}
          <div className="hc-kb-source-overview" role="table" aria-label="业务系统来源状态">
            <div className="hc-kb-source-overview-head" role="row">
              <span>系统</span>
              <span>状态</span>
              <span>负责数据</span>
              <span>权威关系</span>
              <span>最近变化</span>
              <span>异常去向</span>
              <span>操作</span>
            </div>
            {sourceRows.length === 0 ? (
              <div className="hc-kb-detail-muted">未配置来源系统</div>
            ) : sourceRows.map((row) => (
              <div key={row.name} className="hc-kb-source-overview-row" role="row">
                <strong>{row.name}</strong>
                <span className={`hc-kb-status hc-kb-status--${row.status}`}>{row.statusLabel}</span>
                <span>{row.usage}</span>
                <span>{row.authorityLabel}</span>
                <span>{row.updatedLabel}</span>
                <span>{row.issueLabel}</span>
                <div className="hc-kb-row-actions hc-kb-row-actions--always">
                  {row.server?.name ? (
                    <>
                      <button type="button" className="hc-kb-topbar-btn" onClick={() => openEditServer(row.server as YuxiMcpServer)}>
                        编辑
                      </button>
                      <button
                        type="button"
                        className="hc-kb-topbar-btn"
                        onClick={() => void testServer(row.server as YuxiMcpServer)}
                        disabled={testingServer === row.server.name}
                      >
                        {testingServer === row.server.name ? "检查中" : "检查"}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="hc-kb-topbar-btn" onClick={() => openCreateServer(row.name)}>
                      接入
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="hc-kb-admin-section">
          <div className="hc-kb-admin-section-head">
            <strong>当前知识库</strong>
            <Archive size={14} strokeWidth={2.2} aria-hidden="true" />
          </div>
          <div className="hc-kb-detail-kv">
            <Kv label="知识库" value={selectedCategory.label} />
            <Kv label="资料数" value={String(selectedDatabase?.file_count ?? selectedDatabase?.row_count ?? 0)} />
            <Kv label="状态" value={selectedDatabase?.status || "未同步"} />
            <Kv label="入库流程" value={selectedDatabase?.db_id ? "已准备" : "未准备"} />
            <Kv label="检索能力" value={`${embeddingStatus?.available ?? 0}/${embeddingStatus?.total ?? 0} 可用`} />
          </div>
        </section>

        <section className="hc-kb-admin-section">
          <div className="hc-kb-admin-section-head">
            <strong>上传必填字段</strong>
            <SearchCheck size={14} strokeWidth={2.2} aria-hidden="true" />
          </div>
          <div className="hc-kb-tags">
            {uploadFields.map((field) => <span key={field} className="hc-kb-tag">{field}</span>)}
            {supportedTypes.slice(0, 12).map((type) => <span key={type} className="hc-kb-tag">{type}</span>)}
          </div>
        </section>

        <section className="hc-kb-admin-section">
          <div className="hc-kb-admin-section-head">
            <strong>匹配字段</strong>
            <SearchCheck size={14} strokeWidth={2.2} aria-hidden="true" />
          </div>
          <div className="hc-kb-tags">
            {matchFields.map((field) => <span key={field} className="hc-kb-tag">{field}</span>)}
          </div>
        </section>

        <section className="hc-kb-admin-section hc-kb-admin-section--wide">
          <div className="hc-kb-admin-section-head">
            <strong>数据关联概览</strong>
            <span>{kbTypes.length > 0 ? `${kbTypes.length} 类资料能力` : "未返回能力"}</span>
          </div>
          <div className="hc-kb-capability-grid">
            <div>
              <span>档案</span>
              <div className="hc-kb-tags">
                {Object.entries(entityByType).length > 0 ? Object.entries(entityByType).map(([type, count]) => (
                  <span key={type} className="hc-kb-tag">{yuxiEntityTypeLabel(type)} {count}</span>
                )) : <span className="hc-kb-detail-muted">暂无档案统计</span>}
              </div>
            </div>
            <div>
              <span>资料能力</span>
              <div className="hc-kb-tags">
                {kbTypes.length > 0 ? <span className="hc-kb-tag">{kbTypes.length} 类已启用</span> : <span className="hc-kb-detail-muted">未返回能力</span>}
              </div>
            </div>
            <div>
              <span>已配置系统</span>
              <div className="hc-kb-tags">
                {sourceRows.length > 0 ? sourceRows.map((row) => (
                  <span key={row.name} className="hc-kb-tag">{row.name} · {row.statusLabel}</span>
                )) : <span className="hc-kb-detail-muted">未配置来源系统</span>}
              </div>
            </div>
          </div>
        </section>

        <section className="hc-kb-admin-section hc-kb-admin-section--wide">
          <div className="hc-kb-admin-section-head">
            <strong>高级连接配置</strong>
            <button type="button" className="hc-kb-topbar-btn" onClick={() => setAdvancedOpen((prev) => !prev)}>
              <Settings2 size={13} strokeWidth={2.2} aria-hidden="true" />
              {advancedOpen ? "收起" : "展开"}
            </button>
          </div>
          {advancedOpen && (
            <div className="hc-kb-advanced-connectors">
              <table className="hc-kb-compact-table">
                <tbody>
                  {visibleServers.length > 0 ? visibleServers.map((server) => {
                    const name = server.name ?? server.description ?? "未命名";
                    const test = server.name ? serverTests[server.name] : null;
                    return (
                      <tr key={name}>
                        <td>
                          <div className="hc-kb-file-name">{name}</div>
                          <div className="hc-kb-file-meta">{transportLabel(server.transport) || "已配置"}</div>
                        </td>
                        <td>
                          <div className="hc-kb-row-actions hc-kb-row-actions--always" style={{ justifyContent: "flex-end" }}>
                            <span className={`hc-kb-status hc-kb-status--${server.enabled === false || test?.success === false ? "fail" : test?.success ? "ok" : "archive"}`}>
                              {server.enabled === false ? "停用" : test?.success ? `${test.tool_count ?? 0} 项能力` : test?.success === false ? "失败" : "已配置"}
                            </span>
                            {server.name && (
                              <button type="button" className="hc-kb-topbar-btn" onClick={() => openEditServer(server)}>
                                编辑
                              </button>
                            )}
                            {server.name && (
                              <button type="button" className="hc-kb-topbar-btn" onClick={() => void toggleServer(server)}>
                                {server.enabled === false ? "启用" : "停用"}
                              </button>
                            )}
                            {server.name && (
                              <button type="button" className="hc-kb-topbar-btn" onClick={() => void testServer(server)} disabled={testingServer === server.name}>
                                {testingServer === server.name ? "测试中" : "测试"}
                              </button>
                            )}
                            {server.name && (
                              <button type="button" className="hc-kb-topbar-btn" onClick={() => void loadTools(server.name as string)}>
                                能力
                              </button>
                            )}
                            {server.name && (
                              <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--danger" onClick={() => void deleteServer(server)}>
                                删除
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={2}>未配置连接</td></tr>
                  )}
                </tbody>
              </table>
              {selectedToolServer && (
                <div className="hc-kb-admin-section">
                  <div className="hc-kb-admin-section-head">
                    <strong>{selectedToolServer} 能力清单</strong>
                    <button type="button" className="hc-kb-topbar-btn" disabled={toolsLoading} onClick={() => void loadTools(selectedToolServer, true)}>
                      {toolsLoading ? "刷新中" : "刷新"}
                    </button>
                  </div>
                  {toolsError && <div className="hc-kb-inline-alert" data-tone="danger">{toolsError}</div>}
                  <div className="hc-kb-tool-list">
                    {toolRows.length === 0 ? (
                      <div className="hc-kb-detail-muted">{toolsLoading ? "正在读取能力清单" : "未返回能力清单"}</div>
                    ) : toolRows.map((tool) => {
                      const toolName = tool.name || tool.id || "";
                      return (
                        <div key={toolName || tool.description} className="hc-kb-tool-row">
                          <div>
                            <strong>{toolName || "未命名能力"}</strong>
                            {tool.description && <span>{tool.description}</span>}
                          </div>
                          {toolName && (
                            <button type="button" className="hc-kb-topbar-btn" onClick={() => void toggleTool(selectedToolServer, toolName)}>
                              {tool.enabled === false ? "启用" : "停用"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      {confirmDialogNode}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="hc-kb-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function fulfilled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function normalizeTransport(value: string | null | undefined): McpServerDraft["transport"] {
  if (value === "sse" || value === "stdio") return value;
  return "streamable_http";
}

function transportLabel(value: string | null | undefined): string {
  if (value === "stdio") return "本地服务";
  if (value === "sse") return "实时服务";
  if (value === "streamable_http") return "在线服务";
  return "";
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

function buildBusinessSourceRows({
  systems,
  servers,
  serverTests,
  selectedCategory,
  selectedDatabase,
  pendingTotal,
}: {
  systems: readonly string[];
  servers: YuxiMcpServer[];
  serverTests: Record<string, YuxiMcpServerTestResponse>;
  selectedCategory: YuxiCategoryMeta;
  selectedDatabase: YuxiKnowledgeDatabase | null;
  pendingTotal: number;
}): BusinessSourceRow[] {
  const names = systems.length > 0
    ? [...systems]
    : servers.map((server) => server.name || server.description || "").filter(Boolean);
  return names.map((name) => {
    const server = findServerForSystem(servers, name);
    const test = server?.name ? serverTests[server.name] : null;
    const enabled = server ? server.enabled !== false : false;
    const status: BusinessSourceRow["status"] = server
      ? !enabled || test?.success === false ? "fail" : "ok"
      : "pending";
    const statusLabel = server
      ? !enabled ? "已停用" : test?.success === false ? "检查失败" : "已接入"
      : "待接入";
    return {
      name,
      server,
      status,
      statusLabel,
      authorityLabel: authorityLabel(name, selectedCategory),
      usage: sourceUsage(name, selectedCategory.label),
      updatedLabel: sourceUpdatedLabel(server, selectedDatabase),
      issueLabel: pendingTotal > 0 ? `${pendingTotal} 项进入入库问题` : "冲突进入入库问题",
    };
  });
}

function findServerForSystem(servers: YuxiMcpServer[], system: string): YuxiMcpServer | null {
  const stem = systemStem(system);
  return servers.find((server) => {
    const haystack = [
      server.name,
      server.description,
      server.transport,
      server.url,
      server.command,
      ...(server.tags ?? []),
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(system.toLowerCase()) || (stem.length > 0 && haystack.includes(stem));
  }) ?? null;
}

function systemStem(system: string): string {
  return system.toLowerCase().replace(/系统|平台|后台|中心/g, "").trim();
}

function authorityLabel(system: string, category: YuxiCategoryMeta): string {
  const governance = yuxiLibraryGovernance(category.key);
  const rule = governance?.authorityRule ?? "";
  const stem = systemStem(system);
  if (rule.includes(system) || (stem && rule.includes(stem))) return "权威来源";
  if (/讲师|课程|CRM|项目|招标|投标|标书/.test(system)) return "业务来源";
  return "补充来源";
}

function sourceUsage(system: string, fallback: string): string {
  if (/CRM|客户/.test(system)) return "客户、行业、联系人";
  if (/讲师/.test(system)) return "讲师档案、报价、档期";
  if (/课程/.test(system)) return "课程大纲、课时、人群";
  if (/项目/.test(system)) return "项目复盘、案例、反馈";
  if (/招标|投标|标书/.test(system)) return "招标机会、标书、复盘";
  if (/钉钉|企微|飞书/.test(system)) return "通知、审批、业务反馈";
  return `${fallback}相关资料`;
}

function sourceUpdatedLabel(server: YuxiMcpServer | null, database: YuxiKnowledgeDatabase | null): string {
  const value = server?.updated_at || server?.created_at || database?.updated_at || null;
  if (!server) return "未同步";
  if (!value) return "已配置";
  // Yuxi 时间戳是 UTC（可能不带时区标记），统一按 UTC 解析再转本地时区显示。
  const date = parseYuxiTimestamp(value);
  if (!date) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function matchServers(servers: YuxiMcpServer[], expectedSystems: readonly string[]): YuxiMcpServer[] {
  if (servers.length === 0) return [];
  if (expectedSystems.length === 0) return servers;
  const matched = servers.filter((server) => {
    const haystack = [
      server.name,
      server.description,
      server.transport,
      server.url,
      server.command,
      ...(server.tags ?? []),
    ].filter(Boolean).join(" ").toLowerCase();
    return expectedSystems.some((system) => haystack.includes(system.toLowerCase().replace(/系统|平台|后台/g, "")) || haystack.includes(system.toLowerCase()));
  });
  return matched.length > 0 ? matched : servers;
}
