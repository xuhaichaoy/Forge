import { Archive, Link2, SearchCheck } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import {
  yuxiEntityTypeLabel,
  type YuxiCategoryMeta,
  type YuxiKnowledgeDatabase,
  type YuxiMcpServer,
} from "../lib/yuxi-client";
import type { McpServerDraft } from "./kb-library-integration-state";
import type { BusinessSourceRow } from "./kb-library-integration-view-model";

export function KbIntegrationMetricStrip({
  connectedSourceCount,
  entityTotal,
  materialTotal,
  pendingTotal,
  scoringRules,
  sourceCount,
}: {
  connectedSourceCount: number;
  entityTotal: number;
  materialTotal: number;
  pendingTotal: number;
  scoringRules: string | number;
  sourceCount: number;
}) {
  return (
    <div className="hc-kb-metric-strip">
      <Metric label="预期来源" value={String(sourceCount)} />
      <Metric label="已接入" value={String(connectedSourceCount)} />
      <Metric label="资料" value={String(materialTotal)} />
      <Metric label="档案" value={String(entityTotal)} />
      <Metric label="异常/冲突" value={String(pendingTotal)} />
      <Metric label="匹配条件" value={String(scoringRules)} />
    </div>
  );
}

export function KbBusinessSourceSection({
  editingServerName,
  serverDraft,
  serverFormOpen,
  serverSaving,
  sourceRows,
  testingServer,
  onCloseServerForm,
  onEditServer,
  onOpenCreateServer,
  onSaveServer,
  onSetServerDraft,
  onTestServer,
}: {
  editingServerName: string | null;
  serverDraft: McpServerDraft;
  serverFormOpen: boolean;
  serverSaving: boolean;
  sourceRows: BusinessSourceRow[];
  testingServer: string | null;
  onCloseServerForm: () => void;
  onEditServer: (server: YuxiMcpServer) => void;
  onOpenCreateServer: (sourceName?: string) => void;
  onSaveServer: () => void;
  onSetServerDraft: Dispatch<SetStateAction<McpServerDraft>>;
  onTestServer: (server: YuxiMcpServer) => void;
}) {
  return (
    <section className="hc-kb-admin-section hc-kb-admin-section--wide">
      <div className="hc-kb-admin-section-head">
        <strong>业务系统来源</strong>
        <button type="button" className="hc-kb-topbar-btn" onClick={() => onOpenCreateServer()}>
          <Link2 size={13} strokeWidth={2.2} aria-hidden="true" />
          接入来源
        </button>
      </div>
      {serverFormOpen && (
        <KbBusinessSourceForm
          editingServerName={editingServerName}
          serverDraft={serverDraft}
          serverSaving={serverSaving}
          onClose={onCloseServerForm}
          onSave={onSaveServer}
          onSetServerDraft={onSetServerDraft}
        />
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
        ) : sourceRows.map((row) => {
          const server = row.server;
          return (
            <div key={row.name} className="hc-kb-source-overview-row" role="row">
              <strong>{row.name}</strong>
              <span className={`hc-kb-status hc-kb-status--${row.status}`}>{row.statusLabel}</span>
              <span>{row.usage}</span>
              <span>{row.authorityLabel}</span>
              <span>{row.updatedLabel}</span>
              <span>{row.issueLabel}</span>
              <div className="hc-kb-row-actions hc-kb-row-actions--always">
                {server?.name ? (
                  <>
                    <button type="button" className="hc-kb-topbar-btn" onClick={() => onEditServer(server)}>
                      编辑
                    </button>
                    <button
                      type="button"
                      className="hc-kb-topbar-btn"
                      onClick={() => onTestServer(server)}
                      disabled={testingServer === server.name}
                    >
                      {testingServer === server.name ? "检查中" : "检查"}
                    </button>
                  </>
                ) : (
                  <button type="button" className="hc-kb-topbar-btn" onClick={() => onOpenCreateServer(row.name)}>
                    接入
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function KbBusinessSourceForm({
  editingServerName,
  serverDraft,
  serverSaving,
  onClose,
  onSave,
  onSetServerDraft,
}: {
  editingServerName: string | null;
  serverDraft: McpServerDraft;
  serverSaving: boolean;
  onClose: () => void;
  onSave: () => void;
  onSetServerDraft: Dispatch<SetStateAction<McpServerDraft>>;
}) {
  return (
    <div className="hc-kb-server-form">
      <label>
        <span>系统名称</span>
        <input
          value={serverDraft.name}
          disabled={!!editingServerName}
          onChange={(event) => onSetServerDraft((prev) => ({ ...prev, name: event.currentTarget.value }))}
          placeholder="CRM / 讲师系统"
        />
      </label>
      <label>
        <span>方式</span>
        <select
          value={serverDraft.transport}
          onChange={(event) => onSetServerDraft((prev) => ({ ...prev, transport: event.currentTarget.value as McpServerDraft["transport"] }))}
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
            onChange={(event) => onSetServerDraft((prev) => ({ ...prev, command: event.currentTarget.value }))}
            placeholder="/usr/local/bin/server"
          />
        </label>
      ) : (
        <label className="hc-kb-server-form-wide">
          <span>系统地址</span>
          <input
            value={serverDraft.url}
            onChange={(event) => onSetServerDraft((prev) => ({ ...prev, url: event.currentTarget.value }))}
            placeholder="https://..."
          />
        </label>
      )}
      <label className="hc-kb-server-form-wide">
        <span>用途</span>
        <input
          value={serverDraft.description}
          onChange={(event) => onSetServerDraft((prev) => ({ ...prev, description: event.currentTarget.value }))}
          placeholder="CRM / 讲师后台 / 项目系统"
        />
      </label>
      <label className="hc-kb-server-form-wide">
        <span>标签</span>
        <input
          value={serverDraft.tags}
          onChange={(event) => onSetServerDraft((prev) => ({ ...prev, tags: event.currentTarget.value }))}
          placeholder="CRM、售前、讲师系统"
        />
      </label>
      <div className="hc-kb-server-form-actions">
        <button
          type="button"
          className="hc-kb-topbar-btn"
          disabled={serverSaving}
          onClick={onClose}
        >
          取消
        </button>
        <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--primary" disabled={serverSaving} onClick={onSave}>
          {serverSaving ? "保存中" : editingServerName ? "保存来源" : "创建来源"}
        </button>
      </div>
    </div>
  );
}

export function KbIntegrationOverviewSections({
  embeddingAvailable,
  embeddingTotal,
  entityByType,
  kbTypes,
  matchFields,
  selectedCategory,
  selectedDatabase,
  sourceRows,
  supportedTypes,
  uploadFields,
}: {
  embeddingAvailable: number;
  embeddingTotal: number;
  entityByType: Record<string, number>;
  kbTypes: string[];
  matchFields: readonly string[];
  selectedCategory: YuxiCategoryMeta;
  selectedDatabase: YuxiKnowledgeDatabase | null;
  sourceRows: BusinessSourceRow[];
  supportedTypes: string[];
  uploadFields: readonly string[];
}) {
  const entityEntries = Object.entries(entityByType);
  return (
    <>
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
          <Kv label="检索能力" value={`${embeddingAvailable}/${embeddingTotal} 可用`} />
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
              {entityEntries.length > 0 ? entityEntries.map(([type, count]) => (
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
    </>
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
