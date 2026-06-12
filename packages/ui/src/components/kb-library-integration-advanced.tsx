import { Settings2 } from "lucide-react";
import type {
  YuxiMcpServer,
  YuxiMcpServerTestResponse,
  YuxiMcpTool,
} from "../lib/yuxi-client";

interface KbLibraryIntegrationAdvancedProps {
  advancedOpen: boolean;
  visibleServers: YuxiMcpServer[];
  serverTests: Record<string, YuxiMcpServerTestResponse>;
  testingServer: string | null;
  selectedToolServer: string | null;
  toolRows: YuxiMcpTool[];
  toolsLoading: boolean;
  toolsError: string | null;
  onToggleAdvanced: () => void;
  onEditServer: (server: YuxiMcpServer) => void;
  onToggleServer: (server: YuxiMcpServer) => void;
  onTestServer: (server: YuxiMcpServer) => void;
  onLoadTools: (serverName: string, refresh?: boolean) => void;
  onDeleteServer: (server: YuxiMcpServer) => void;
  onToggleTool: (serverName: string, toolName: string) => void;
}

export function KbLibraryIntegrationAdvanced({
  advancedOpen,
  visibleServers,
  serverTests,
  testingServer,
  selectedToolServer,
  toolRows,
  toolsLoading,
  toolsError,
  onToggleAdvanced,
  onEditServer,
  onToggleServer,
  onTestServer,
  onLoadTools,
  onDeleteServer,
  onToggleTool,
}: KbLibraryIntegrationAdvancedProps) {
  return (
    <section className="hc-kb-admin-section hc-kb-admin-section--wide">
      <div className="hc-kb-admin-section-head">
        <strong>高级连接配置</strong>
        <button type="button" className="hc-kb-topbar-btn" onClick={onToggleAdvanced}>
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
                          <button type="button" className="hc-kb-topbar-btn" onClick={() => onEditServer(server)}>
                            编辑
                          </button>
                        )}
                        {server.name && (
                          <button type="button" className="hc-kb-topbar-btn" onClick={() => onToggleServer(server)}>
                            {server.enabled === false ? "启用" : "停用"}
                          </button>
                        )}
                        {server.name && (
                          <button type="button" className="hc-kb-topbar-btn" onClick={() => onTestServer(server)} disabled={testingServer === server.name}>
                            {testingServer === server.name ? "测试中" : "测试"}
                          </button>
                        )}
                        {server.name && (
                          <button type="button" className="hc-kb-topbar-btn" onClick={() => onLoadTools(server.name as string)}>
                            能力
                          </button>
                        )}
                        {server.name && (
                          <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--danger" onClick={() => onDeleteServer(server)}>
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
                <button type="button" className="hc-kb-topbar-btn" disabled={toolsLoading} onClick={() => onLoadTools(selectedToolServer, true)}>
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
                        <button type="button" className="hc-kb-topbar-btn" onClick={() => onToggleTool(selectedToolServer, toolName)}>
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
  );
}

function transportLabel(value: string | null | undefined): string {
  if (value === "stdio") return "本地服务";
  if (value === "sse") return "实时服务";
  if (value === "streamable_http") return "在线服务";
  return "";
}
