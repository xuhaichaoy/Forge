import { RefreshCw } from "lucide-react";
import {
  yuxiBusinessLineLabel,
  yuxiLibraryGovernance,
  type YuxiCategoryMeta,
  type YuxiKnowledgeDatabase,
} from "../lib/yuxi-client";
import { useConfirmDialog } from "./confirm-dialog";
import { KbLibraryIntegrationAdvanced } from "./kb-library-integration-advanced";
import {
  KbBusinessSourceSection,
  KbIntegrationMetricStrip,
  KbIntegrationOverviewSections,
} from "./kb-library-integration-sections";
import {
  buildBusinessSourceRows,
  matchServers,
} from "./kb-library-integration-view-model";
import { useKbLibraryIntegrationState } from "./kb-library-integration-state";

export function KbLibraryIntegrationPanel({
  selectedCategory,
  selectedDatabase,
}: {
  selectedCategory: YuxiCategoryMeta | null;
  selectedDatabase: YuxiKnowledgeDatabase | null;
}) {
  // 应用内确认对话框（Tauri WebView 的 window.confirm 是 no-op，不能用）
  const { confirmDialog, confirmDialogNode } = useConfirmDialog();
  const {
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
  } = useKbLibraryIntegrationState({ confirmDialog });

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

      <KbIntegrationMetricStrip
        connectedSourceCount={connectedSourceCount}
        entityTotal={entityTotal}
        materialTotal={selectedDatabase?.file_count ?? selectedDatabase?.row_count ?? 0}
        pendingTotal={pendingTotal}
        scoringRules={scoring?.rules ?? "-"}
        sourceCount={sourceRows.length}
      />

      <div className="hc-kb-admin-grid">
        <KbBusinessSourceSection
          editingServerName={editingServerName}
          serverDraft={serverDraft}
          serverFormOpen={serverFormOpen}
          serverSaving={serverSaving}
          sourceRows={sourceRows}
          testingServer={testingServer}
          onCloseServerForm={closeServerForm}
          onEditServer={openEditServer}
          onOpenCreateServer={openCreateServer}
          onSaveServer={() => void saveServer()}
          onSetServerDraft={setServerDraft}
          onTestServer={(server) => void testServer(server)}
        />

        <KbIntegrationOverviewSections
          embeddingAvailable={embeddingStatus?.available ?? 0}
          embeddingTotal={embeddingStatus?.total ?? 0}
          entityByType={entityByType}
          kbTypes={kbTypes}
          matchFields={matchFields}
          selectedCategory={selectedCategory}
          selectedDatabase={selectedDatabase}
          sourceRows={sourceRows}
          supportedTypes={supportedTypes}
          uploadFields={uploadFields}
        />

        <KbLibraryIntegrationAdvanced
          advancedOpen={advancedOpen}
          visibleServers={visibleServers}
          serverTests={serverTests}
          testingServer={testingServer}
          selectedToolServer={selectedToolServer}
          toolRows={toolRows}
          toolsLoading={toolsLoading}
          toolsError={toolsError}
          onToggleAdvanced={() => setAdvancedOpen((prev) => !prev)}
          onEditServer={openEditServer}
          onToggleServer={(server) => void toggleServer(server)}
          onTestServer={(server) => void testServer(server)}
          onLoadTools={(serverName, refresh) => void loadTools(serverName, refresh)}
          onDeleteServer={(server) => void deleteServer(server)}
          onToggleTool={(serverName, toolName) => void toggleTool(serverName, toolName)}
        />
      </div>
      {confirmDialogNode}
    </section>
  );
}
