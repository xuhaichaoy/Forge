import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Play, Plus, RefreshCw, Save, Trash2, Upload } from "lucide-react";
import {
  createYuxiScoringRule,
  createYuxiScoringTemplate,
  deleteYuxiEvaluationBenchmark,
  deleteYuxiScoringRule,
  downloadYuxiEvaluationBenchmark,
  generateYuxiEvaluationBenchmark,
  generateYuxiSampleQuestions,
  getYuxiKnowledgeQueryParams,
  getYuxiSampleQuestions,
  listYuxiEvaluationBenchmarks,
  listYuxiEvaluationHistory,
  listYuxiEvaluationResults,
  queryTestYuxiKnowledgeDatabase,
  recommendYuxiPresales,
  runYuxiEvaluation,
  uploadYuxiEvaluationBenchmark,
  updateYuxiKnowledgeQueryParams,
  updateYuxiScoringRule,
  updateYuxiScoringTemplate,
  type YuxiCategoryMeta,
  type YuxiEntityType,
  type YuxiKnowledgeDatabase,
  type YuxiKnowledgeQueryTestResponse,
  type YuxiRecommendResponse,
  type YuxiScoringDimension,
  type YuxiScoringRule,
  type YuxiScoringTemplate,
  yuxiBusinessLineLabel,
} from "../lib/yuxi-client";

interface QueryParamOption {
  key?: string;
  label?: string;
  type?: string;
  default?: unknown;
  options?: unknown[];
  description?: string;
  min?: number;
  max?: number;
  step?: number;
}

interface DimensionDraft {
  key: string;
  label: string;
  desc: string;
  weight: string;
}

export function KbAccuracyPanel({
  selectedCategory,
  selectedDatabase,
  templates,
  rules,
  scoringError,
  onRefreshScoring,
}: {
  selectedCategory: YuxiCategoryMeta | null;
  selectedDatabase: YuxiKnowledgeDatabase | null;
  templates: YuxiScoringTemplate[];
  rules: YuxiScoringRule[];
  scoringError: string | null;
  onRefreshScoring: () => Promise<void> | void;
}) {
  const activeTemplate = useMemo(
    () => templates.find((item) => item.status === "active") ?? templates[0] ?? null,
    [templates],
  );
  const [templateName, setTemplateName] = useState("");
  const [templateVersion, setTemplateVersion] = useState("");
  const [riskCap, setRiskCap] = useState("15");
  const [dimensionDrafts, setDimensionDrafts] = useState<DimensionDraft[]>([]);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const [ruleType, setRuleType] = useState("deduct");
  const [ruleName, setRuleName] = useState("");
  const [ruleField, setRuleField] = useState("months_since_update");
  const [ruleOperator, setRuleOperator] = useState("gte");
  const [ruleValue, setRuleValue] = useState("24");
  const [rulePoints, setRulePoints] = useState("10");
  const [ruleExplanation, setRuleExplanation] = useState("");
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);

  const [queryParamsLoading, setQueryParamsLoading] = useState(false);
  const [queryParamOptions, setQueryParamOptions] = useState<QueryParamOption[]>([]);
  const [queryParamValues, setQueryParamValues] = useState<Record<string, unknown>>({});
  const [queryParamError, setQueryParamError] = useState<string | null>(null);
  const [queryParamSaving, setQueryParamSaving] = useState(false);
  const [sampleQuestions, setSampleQuestions] = useState<string[]>([]);
  const [sampleLoading, setSampleLoading] = useState(false);
  const benchmarkInputRef = useRef<HTMLInputElement>(null);
  const [benchmarkName, setBenchmarkName] = useState("");
  const [benchmarkDescription, setBenchmarkDescription] = useState("");
  const [benchmarkUploading, setBenchmarkUploading] = useState(false);
  const [evaluationBenchmarks, setEvaluationBenchmarks] = useState<unknown[]>([]);
  const [evaluationHistory, setEvaluationHistory] = useState<unknown[]>([]);
  const [evaluationFailures, setEvaluationFailures] = useState<unknown[]>([]);
  const [evaluationFailureLoading, setEvaluationFailureLoading] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [evaluationRunning, setEvaluationRunning] = useState(false);

  const [testQuery, setTestQuery] = useState("");
  const [entityType, setEntityType] = useState<YuxiEntityType>("teacher");
  const [queryTestResult, setQueryTestResult] = useState<YuxiKnowledgeQueryTestResponse | null>(null);
  const [recommendResult, setRecommendResult] = useState<YuxiRecommendResponse | null>(null);
  const [testLoading, setTestLoading] = useState<"query" | "recommend" | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    const dimensions = activeTemplate?.dimensions?.length
      ? activeTemplate.dimensions
      : defaultDimensions(selectedCategory?.line);
    setTemplateName(activeTemplate?.name ?? `${selectedCategory?.label ?? "知识库"}匹配模板`);
    setTemplateVersion(activeTemplate?.version ?? "v1.0");
    setRiskCap(String(activeTemplate?.risk_cap ?? 15));
    setDimensionDrafts(dimensions.map((item) => ({
      key: item.key ?? "",
      label: item.label ?? item.key ?? "",
      desc: item.desc ?? "",
      weight: String(item.weight ?? 0),
    })));
  }, [activeTemplate, selectedCategory?.label, selectedCategory?.line]);

  useEffect(() => {
    setEntityType(defaultEntityType(selectedCategory));
  }, [selectedCategory]);

  const loadQuerySettings = useCallback(async () => {
    if (!selectedDatabase?.db_id) {
      setQueryParamOptions([]);
      setQueryParamValues({});
      setSampleQuestions([]);
      setQueryParamError(null);
      return;
    }
    setQueryParamsLoading(true);
    setQueryParamError(null);
    try {
      const [paramsResult, questionsResult] = await Promise.all([
        getYuxiKnowledgeQueryParams(selectedDatabase.db_id),
        getYuxiSampleQuestions(selectedDatabase.db_id).catch(() => ({ questions: [] as string[] })),
      ]);
      const options = extractQueryParamOptions(paramsResult.params);
      setQueryParamOptions(options);
      setQueryParamValues(Object.fromEntries(options.map((option) => [option.key ?? "", option.default]).filter(([key]) => key)));
      setSampleQuestions(questionsResult.questions ?? []);
    } catch (err) {
      setQueryParamOptions([]);
      setQueryParamValues({});
      setSampleQuestions([]);
      setQueryParamError(err instanceof Error ? err.message : String(err));
    } finally {
      setQueryParamsLoading(false);
    }
  }, [selectedDatabase?.db_id]);

  useEffect(() => {
    void loadQuerySettings();
  }, [loadQuerySettings]);

  const loadEvaluation = useCallback(async () => {
    if (!selectedDatabase?.db_id) {
      setEvaluationBenchmarks([]);
      setEvaluationHistory([]);
      setEvaluationFailures([]);
      setEvaluationError(null);
      return;
    }
    setEvaluationLoading(true);
    setEvaluationError(null);
    try {
      const [benchmarks, history] = await Promise.all([
        listYuxiEvaluationBenchmarks(selectedDatabase.db_id),
        listYuxiEvaluationHistory(selectedDatabase.db_id),
      ]);
      setEvaluationBenchmarks(Array.isArray(benchmarks.data) ? benchmarks.data : []);
      setEvaluationHistory(Array.isArray(history.data) ? history.data : []);
      setEvaluationFailures([]);
    } catch (err) {
      setEvaluationBenchmarks([]);
      setEvaluationHistory([]);
      setEvaluationFailures([]);
      setEvaluationError(err instanceof Error ? err.message : String(err));
    } finally {
      setEvaluationLoading(false);
    }
  }, [selectedDatabase?.db_id]);

  useEffect(() => {
    void loadEvaluation();
  }, [loadEvaluation]);

  const weightTotal = useMemo(
    () => dimensionDrafts.reduce((sum, item) => sum + Number(item.weight || 0), 0),
    [dimensionDrafts],
  );
  const enabledRules = rules.filter((rule) => rule.enabled !== false);
  const activeTemplateId = templateId(activeTemplate);

  const saveTemplate = useCallback(async () => {
    if (!selectedCategory) return;
    setTemplateSaving(true);
    setTemplateError(null);
    try {
      const dimensions = dimensionDrafts.map((item) => ({
        key: item.key.trim(),
        label: item.label.trim() || item.key.trim(),
        desc: item.desc.trim(),
        weight: Number(item.weight || 0),
      })).filter((item) => item.key);
      const total = dimensions.reduce((sum, item) => sum + item.weight, 0);
      if (Math.round(total) !== 100) throw new Error("维度权重总和需要等于 100");
      if (activeTemplateId != null) {
        await updateYuxiScoringTemplate(activeTemplateId, {
          name: templateName.trim() || `${selectedCategory.label}匹配模板`,
          version: templateVersion.trim() || null,
          dimensions,
          risk_cap: Number(riskCap || 0),
          status: activeTemplate?.status ?? "active",
        });
      } else {
        await createYuxiScoringTemplate({
          name: templateName.trim() || `${selectedCategory.label}匹配模板`,
          business_line: selectedCategory.line,
          version: templateVersion.trim() || "v1.0",
          dimensions,
          risk_cap: Number(riskCap || 0),
          status: "active",
        });
      }
      await onRefreshScoring();
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : String(err));
    } finally {
      setTemplateSaving(false);
    }
  }, [
    activeTemplate?.status,
    activeTemplateId,
    dimensionDrafts,
    onRefreshScoring,
    riskCap,
    selectedCategory,
    templateName,
    templateVersion,
  ]);

  const createRule = useCallback(async () => {
    if (!selectedCategory) return;
    setRuleSaving(true);
    setRuleError(null);
    try {
      const condition = [{
        field: ruleField,
        op: ruleOperator,
        value: coerceRuleValue(ruleValue),
      }];
      const points = Number(rulePoints || 0);
      const action = ruleType === "tag_merge"
        ? { target: String(ruleValue).trim() }
        : ruleType === "veto"
          ? { reason: ruleExplanation.trim() || ruleName.trim() }
          : { points: Number.isFinite(points) ? Math.abs(points) : 0 };
      await createYuxiScoringRule({
        rule_type: ruleType,
        name: ruleName.trim(),
        business_line: selectedCategory.line,
        condition,
        action,
        explanation: ruleExplanation.trim() || null,
        configured_by: "HiCodex",
        enabled: true,
      });
      setRuleName("");
      setRuleExplanation("");
      await onRefreshScoring();
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : String(err));
    } finally {
      setRuleSaving(false);
    }
  }, [onRefreshScoring, ruleExplanation, ruleField, ruleName, ruleOperator, rulePoints, ruleType, ruleValue, selectedCategory]);

  const toggleRule = useCallback(async (rule: YuxiScoringRule) => {
    const id = ruleId(rule);
    if (id == null) return;
    setRuleError(null);
    try {
      await updateYuxiScoringRule(id, { enabled: rule.enabled === false });
      await onRefreshScoring();
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : String(err));
    }
  }, [onRefreshScoring]);

  const removeRule = useCallback(async (rule: YuxiScoringRule) => {
    const id = ruleId(rule);
    if (id == null) return;
    if (!globalThis.confirm(`确定删除标准「${rule.name ?? id}」吗？`)) return;
    setRuleError(null);
    try {
      await deleteYuxiScoringRule(id);
      await onRefreshScoring();
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : String(err));
    }
  }, [onRefreshScoring]);

  const saveQueryParams = useCallback(async () => {
    if (!selectedDatabase?.db_id) return;
    setQueryParamSaving(true);
    setQueryParamError(null);
    try {
      await updateYuxiKnowledgeQueryParams(selectedDatabase.db_id, queryParamValues);
      await loadQuerySettings();
    } catch (err) {
      setQueryParamError(err instanceof Error ? err.message : String(err));
    } finally {
      setQueryParamSaving(false);
    }
  }, [loadQuerySettings, queryParamValues, selectedDatabase?.db_id]);

  const generateQuestions = useCallback(async () => {
    if (!selectedDatabase?.db_id) return;
    setSampleLoading(true);
    setQueryParamError(null);
    try {
      const result = await generateYuxiSampleQuestions(selectedDatabase.db_id, 8);
      setSampleQuestions(result.questions ?? []);
    } catch (err) {
      setQueryParamError(err instanceof Error ? err.message : String(err));
    } finally {
      setSampleLoading(false);
    }
  }, [selectedDatabase?.db_id]);

  const runQueryTest = useCallback(async () => {
    if (!selectedDatabase?.db_id || !testQuery.trim()) return;
    setTestLoading("query");
    setTestError(null);
    setQueryTestResult(null);
    try {
      const result = await queryTestYuxiKnowledgeDatabase({
        dbId: selectedDatabase.db_id,
        query: testQuery.trim(),
        meta: queryParamValues,
      });
      setQueryTestResult(result);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestLoading(null);
    }
  }, [queryParamValues, selectedDatabase?.db_id, testQuery]);

  const runRecommendTest = useCallback(async () => {
    if (!selectedCategory || !testQuery.trim()) return;
    setTestLoading("recommend");
    setTestError(null);
    setRecommendResult(null);
    try {
      const result = await recommendYuxiPresales({
        query: testQuery.trim(),
        entity_type: entityType,
        business_line: selectedCategory.line,
        template_id: activeTemplateId ?? null,
        top_k: 8,
      });
      setRecommendResult(result);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestLoading(null);
    }
  }, [activeTemplateId, entityType, selectedCategory, testQuery]);

  const generateBenchmark = useCallback(async () => {
    if (!selectedDatabase?.db_id) return;
    setEvaluationLoading(true);
    setEvaluationError(null);
    try {
      await generateYuxiEvaluationBenchmark(selectedDatabase.db_id, { count: 20 });
      await loadEvaluation();
    } catch (err) {
      setEvaluationError(err instanceof Error ? err.message : String(err));
    } finally {
      setEvaluationLoading(false);
    }
  }, [loadEvaluation, selectedDatabase?.db_id]);

  const uploadBenchmark = useCallback(async (files: FileList | File[] | null) => {
    if (!selectedDatabase?.db_id || !files || files.length === 0) return;
    const file = Array.from(files)[0];
    const name = benchmarkName.trim() || file.name.replace(/\.jsonl$/i, "");
    setBenchmarkUploading(true);
    setEvaluationError(null);
    try {
      await uploadYuxiEvaluationBenchmark(selectedDatabase.db_id, file, name, benchmarkDescription.trim() || null);
      setBenchmarkName("");
      setBenchmarkDescription("");
      await loadEvaluation();
    } catch (err) {
      setEvaluationError(err instanceof Error ? err.message : String(err));
    } finally {
      setBenchmarkUploading(false);
    }
  }, [benchmarkDescription, benchmarkName, loadEvaluation, selectedDatabase?.db_id]);

  const downloadBenchmark = useCallback(async (benchmark: unknown) => {
    const benchmarkId = stringField(benchmark, ["id", "benchmark_id"]);
    if (!benchmarkId) return;
    setEvaluationError(null);
    try {
      const blob = await downloadYuxiEvaluationBenchmark(benchmarkId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${stringField(benchmark, ["name", "filename"]) || benchmarkId}.jsonl`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setEvaluationError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const removeBenchmark = useCallback(async (benchmark: unknown) => {
    const benchmarkId = stringField(benchmark, ["id", "benchmark_id"]);
    const name = stringField(benchmark, ["name", "filename"]) || benchmarkId;
    if (!benchmarkId) return;
    if (!globalThis.confirm(`确定删除评估集「${name}」吗？`)) return;
    setEvaluationLoading(true);
    setEvaluationError(null);
    try {
      await deleteYuxiEvaluationBenchmark(benchmarkId);
      await loadEvaluation();
    } catch (err) {
      setEvaluationError(err instanceof Error ? err.message : String(err));
    } finally {
      setEvaluationLoading(false);
    }
  }, [loadEvaluation]);

  const runEvaluation = useCallback(async (benchmark?: unknown) => {
    if (!selectedDatabase?.db_id) return;
    const selectedBenchmark = benchmark ?? evaluationBenchmarks[0];
    const benchmarkId = stringField(selectedBenchmark, ["id", "benchmark_id"]);
    setEvaluationRunning(true);
    setEvaluationError(null);
    try {
      await runYuxiEvaluation(selectedDatabase.db_id, { benchmark_id: benchmarkId || null });
      await loadEvaluation();
    } catch (err) {
      setEvaluationError(err instanceof Error ? err.message : String(err));
    } finally {
      setEvaluationRunning(false);
    }
  }, [evaluationBenchmarks, loadEvaluation, selectedDatabase?.db_id]);

  const loadFailureSamples = useCallback(async (historyItem?: unknown) => {
    if (!selectedDatabase?.db_id) return;
    const selectedHistory = historyItem ?? evaluationHistory[0];
    const taskId = stringField(selectedHistory, ["task_id", "id"]);
    if (!taskId) {
      setEvaluationError("这条验证记录缺少任务编号，不能读取失败项。");
      return;
    }
    setEvaluationFailureLoading(true);
    setEvaluationError(null);
    try {
      const result = await listYuxiEvaluationResults(selectedDatabase.db_id, taskId, { errorOnly: true, pageSize: 20 });
      setEvaluationFailures(extractEvaluationRows(result.data));
    } catch (err) {
      setEvaluationFailures([]);
      setEvaluationError(err instanceof Error ? err.message : String(err));
    } finally {
      setEvaluationFailureLoading(false);
    }
  }, [evaluationHistory, selectedDatabase?.db_id]);

  if (!selectedCategory) {
    return (
      <section className="hc-kb-management-panel" aria-label="检索匹配">
        <div className="hc-kb-empty">
          <div className="hc-kb-empty-content">
            <div className="hc-kb-empty-title">先在左侧选择知识库</div>
            <div className="hc-kb-empty-subtitle">检索设置、匹配依据和验证问题按当前知识库所在业务线管理。</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="hc-kb-management-panel" aria-label="检索匹配">
      <input
        ref={benchmarkInputRef}
        type="file"
        accept=".jsonl,application/x-ndjson"
        hidden
        onChange={(event) => {
          void uploadBenchmark(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <div className="hc-kb-panel-head">
        <div>
          <div className="hc-kb-section-title">{selectedCategory.label} · 匹配效果</div>
          <div className="hc-kb-section-subtitle">
            用当前库资料、档案关系、业务标准和来源证据解释为什么命中。
          </div>
        </div>
        <button type="button" className="hc-kb-topbar-btn" onClick={() => void onRefreshScoring()}>
          <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
          刷新
        </button>
      </div>

      {scoringError && <div className="hc-kb-inline-alert" data-tone="danger">{scoringError}</div>}

      <div className="hc-kb-match-health">
        <MatchHealthCard title="当前范围" value={selectedDatabase?.name || selectedCategory.label} description="只在当前知识库和关联档案内验证" />
        <MatchHealthCard title="业务标准" value={`${enabledRules.length}/${rules.length} 条启用`} description="报价、行业、风险等规则参与排序" />
        <MatchHealthCard title="可测试问题" value={`${sampleQuestions.length} 个`} description="用真实业务问题验证命中结果" />
        <MatchHealthCard title="历史验证" value={`${evaluationHistory.length} 次`} description="记录最近的匹配验证结果" />
      </div>

      <div className="hc-kb-match-explain-grid">
        <MatchExplainCard title="限定范围" value="先选库" description="左侧选择哪个知识库，就只用这个范围内的资料、档案和来源证据。" />
        <MatchExplainCard title="档案关联" value="找对象" description="资料解析后会关联讲师、课程、案例、客户或投标对象，不只靠关键词。" />
        <MatchExplainCard title="业务标准" value="再排序" description="行业、报价、时间、风险、权威状态会影响最终排序。" />
        <MatchExplainCard title="人工反馈" value="可修正" description="不准的结果可以回到档案和入库问题里修正来源、字段或状态。" />
      </div>

      <section className="hc-kb-admin-section hc-kb-admin-section--wide hc-kb-business-test">
        <div className="hc-kb-admin-section-head">
          <strong>用一个业务问题试一下</strong>
          <span>{selectedCategory.label}</span>
        </div>
        <div className="hc-kb-test-box">
          <div className="hc-kb-test-input-row">
            <input
              value={testQuery}
              placeholder="例如：金融行业领导力讲师，报价不超过 3 万"
              onChange={(event) => setTestQuery(event.target.value)}
            />
            <select value={entityType} onChange={(event) => setEntityType(event.target.value as YuxiEntityType)}>
              <option value="teacher">讲师</option>
              <option value="course">课程</option>
              <option value="case">案例</option>
              <option value="customer">客户</option>
              <option value="bid_project">投标项目</option>
              <option value="bid_requirement">招标要求</option>
              <option value="bid_risk">废标风险</option>
              <option value="bid_competitor">竞品</option>
              <option value="bid_template">标书模板</option>
            </select>
            <button type="button" className="hc-kb-topbar-btn" disabled={!selectedDatabase?.db_id || !testQuery.trim() || testLoading === "query"} onClick={() => void runQueryTest()}>
              <Play size={13} strokeWidth={2.2} aria-hidden="true" />
              看资料
            </button>
            <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--primary" disabled={!testQuery.trim() || testLoading === "recommend"} onClick={() => void runRecommendTest()}>
              <Play size={13} strokeWidth={2.2} aria-hidden="true" />
              匹配档案
            </button>
          </div>
          {sampleQuestions.length > 0 && (
            <div className="hc-kb-tags">
              {sampleQuestions.slice(0, 8).map((question) => (
                <button key={question} type="button" className="hc-kb-tag hc-kb-tag-button" onClick={() => setTestQuery(question)}>
                  {question}
                </button>
              ))}
            </div>
          )}
          <div className="hc-kb-form-actions">
            <button type="button" className="hc-kb-topbar-btn" disabled={!selectedDatabase?.db_id || sampleLoading} onClick={() => void generateQuestions()}>
              <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
              {sampleLoading ? "生成中" : "生成测试问题"}
            </button>
          </div>
          {testError && <div className="hc-kb-inline-alert" data-tone="danger">{testError}</div>}
          <div className="hc-kb-test-results">
            <QueryTestResult result={queryTestResult} />
            <RecommendResult result={recommendResult} />
          </div>
        </div>
      </section>

      <details className="hc-kb-advanced-settings">
        <summary>管理员维护：匹配标准、检索开关和历史验证</summary>
        <div className="hc-kb-admin-grid">
        <section className="hc-kb-admin-section">
          <div className="hc-kb-admin-section-head">
            <strong>评分占比</strong>
            <span className={weightTotal === 100 ? "hc-kb-text-ok" : "hc-kb-text-danger"}>占比合计 {weightTotal}%</span>
          </div>
          <div className="hc-kb-form-grid">
            <label>
              方案名称
              <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
            </label>
            <label>
              版本说明
              <input value={templateVersion} onChange={(event) => setTemplateVersion(event.target.value)} />
            </label>
            <label>
              风险最多扣分
              <input type="number" min={0} value={riskCap} onChange={(event) => setRiskCap(event.target.value)} />
            </label>
          </div>
          <div className="hc-kb-dimension-list">
            {dimensionDrafts.map((dimension, index) => (
              <div key={dimension.key || index} className="hc-kb-dimension-row">
                <div>
                  <strong>{dimension.label || dimension.key}</strong>
                  {dimension.desc && <span>{dimension.desc}</span>}
                </div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={dimension.weight}
                  aria-label={`${dimension.label || dimension.key}权重`}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDimensionDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, weight: value } : item));
                  }}
                />
              </div>
            ))}
          </div>
          {templateError && <div className="hc-kb-inline-alert" data-tone="danger">{templateError}</div>}
          <div className="hc-kb-form-actions">
            <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--primary" onClick={() => void saveTemplate()} disabled={templateSaving}>
              <Save size={13} strokeWidth={2.2} aria-hidden="true" />
              {templateSaving ? "保存中" : "保存匹配标准"}
            </button>
          </div>
        </section>

        <section className="hc-kb-admin-section">
          <div className="hc-kb-admin-section-head">
            <strong>业务标准维护</strong>
            <span>{rules.length} 条</span>
          </div>
          <div className="hc-kb-rule-list">
            {rules.slice(0, 8).map((rule) => (
              <div key={rule.id ?? rule.rule_id ?? rule.name} className="hc-kb-rule-row">
                <div>
                  <div className="hc-kb-rule-title">
                    <span className={`hc-kb-status hc-kb-status--${rule.enabled === false ? "archive" : ruleTone(rule.rule_type)}`}>
                      {ruleTypeLabel(rule.rule_type)}
                    </span>
                    <strong>{rule.name || "未命名标准"}</strong>
                  </div>
                  <p>{rule.explanation || conditionSummary(rule.condition)}</p>
                </div>
                <div className="hc-kb-row-actions hc-kb-row-actions--always">
                  <button type="button" className="hc-kb-row-btn" title={rule.enabled === false ? "启用" : "停用"} onClick={() => void toggleRule(rule)}>
                    {rule.enabled === false ? <Plus size={13} strokeWidth={2.2} aria-hidden="true" /> : <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />}
                  </button>
                  <button type="button" className="hc-kb-row-btn" title="删除标准" onClick={() => void removeRule(rule)}>
                    <Trash2 size={13} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
            {rules.length === 0 && <div className="hc-kb-detail-muted">还没有业务标准。</div>}
          </div>
          <div className="hc-kb-rule-form">
            <div className="hc-kb-form-grid">
              <label>
                类型
                <select value={ruleType} onChange={(event) => setRuleType(event.target.value)}>
                  <option value="veto">一票否决</option>
                  <option value="deduct">扣分</option>
                  <option value="bonus">加分</option>
                  <option value="tag_merge">同义标签</option>
                </select>
              </label>
              <label>
                标准名
                <input value={ruleName} onChange={(event) => setRuleName(event.target.value)} />
              </label>
            </div>
            <div className="hc-kb-form-grid hc-kb-form-grid--rule">
              <label>
                看什么信息
                <select value={ruleField} onChange={(event) => setRuleField(event.target.value)}>
                  {ruleFieldOptions(selectedCategory.key).map((option) => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                判断方式
                <select value={ruleOperator} onChange={(event) => setRuleOperator(event.target.value)}>
                  {RULE_OPERATORS.map((option) => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                参考值
                <input value={ruleValue} onChange={(event) => setRuleValue(event.target.value)} />
              </label>
              {ruleType !== "veto" && ruleType !== "tag_merge" && (
                <label>
                  影响分
                  <input type="number" min={0} value={rulePoints} onChange={(event) => setRulePoints(event.target.value)} />
                </label>
              )}
            </div>
            <label>
              业务解释
              <input value={ruleExplanation} onChange={(event) => setRuleExplanation(event.target.value)} />
            </label>
            {ruleError && <div className="hc-kb-inline-alert" data-tone="danger">{ruleError}</div>}
            <div className="hc-kb-form-actions">
              <button type="button" className="hc-kb-topbar-btn" onClick={() => void createRule()} disabled={ruleSaving || !ruleName.trim()}>
                <Plus size={13} strokeWidth={2.2} aria-hidden="true" />
                {ruleSaving ? "新增中" : "新增标准"}
              </button>
            </div>
          </div>
        </section>

        <section className="hc-kb-admin-section hc-kb-admin-section--wide">
          <div className="hc-kb-admin-section-head">
            <strong>检索开关和历史验证</strong>
            <span>管理员维护</span>
          </div>
          {queryParamError && <div className="hc-kb-inline-alert" data-tone="danger">{queryParamError}</div>}
          {selectedDatabase?.db_id ? (
            <>
              <div className="hc-kb-query-param-grid">
                {queryParamOptions.map((option) => (
                  <QueryParamControl
                    key={option.key}
                    option={option}
                    value={queryParamValues[option.key ?? ""]}
                    onChange={(value) => {
                      if (!option.key) return;
                      setQueryParamValues((prev) => ({ ...prev, [option.key as string]: value }));
                    }}
                  />
                ))}
                {queryParamOptions.length === 0 && (
                  <div className="hc-kb-detail-muted">{queryParamsLoading ? "正在读取检索开关" : "当前库没有额外检索开关"}</div>
                )}
              </div>
              {queryParamOptions.length > 0 && (
                <div className="hc-kb-form-actions">
                  <button type="button" className="hc-kb-topbar-btn" onClick={() => void saveQueryParams()} disabled={queryParamSaving}>
                    <Save size={13} strokeWidth={2.2} aria-hidden="true" />
                    {queryParamSaving ? "保存中" : "保存检索设置"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="hc-kb-detail-muted">当前知识库还没准备好，暂时不能维护检索开关。</div>
          )}

          {selectedDatabase?.db_id && (
            <div className="hc-kb-evaluation-box">
              <div className="hc-kb-admin-section-head">
                <strong>历史验证</strong>
                <span>{evaluationBenchmarks.length} 个评估集 · {evaluationHistory.length} 条历史</span>
              </div>
              {evaluationError && <div className="hc-kb-inline-alert" data-tone="danger">{evaluationError}</div>}
              <div className="hc-kb-benchmark-upload">
                <input
                  value={benchmarkName}
                  placeholder="评估集名称"
                  onChange={(event) => setBenchmarkName(event.target.value)}
                />
                <input
                  value={benchmarkDescription}
                  placeholder="说明"
                  onChange={(event) => setBenchmarkDescription(event.target.value)}
                />
                <button
                  type="button"
                  className="hc-kb-topbar-btn"
                  onClick={() => benchmarkInputRef.current?.click()}
                  disabled={benchmarkUploading}
                >
                  <Upload size={13} strokeWidth={2.2} aria-hidden="true" />
                  {benchmarkUploading ? "上传中" : "上传评估集"}
                </button>
              </div>
              <div className="hc-kb-evaluation-actions">
                <button type="button" className="hc-kb-topbar-btn" onClick={() => void generateBenchmark()} disabled={evaluationLoading}>
                  <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
                  {evaluationLoading ? "处理中" : "生成评估集"}
                </button>
                <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--primary" onClick={() => void runEvaluation()} disabled={evaluationRunning || evaluationBenchmarks.length === 0}>
                  <Play size={13} strokeWidth={2.2} aria-hidden="true" />
                  {evaluationRunning ? "评估中" : "运行评估"}
                </button>
              </div>
              <EvaluationSummary
                benchmarks={evaluationBenchmarks}
                history={evaluationHistory}
                running={evaluationRunning}
                failureLoading={evaluationFailureLoading}
                onRun={(benchmark) => void runEvaluation(benchmark)}
                onLoadFailures={(historyItem) => void loadFailureSamples(historyItem)}
                onDownload={(benchmark) => void downloadBenchmark(benchmark)}
                onDelete={(benchmark) => void removeBenchmark(benchmark)}
              />
              <FailureSamples samples={evaluationFailures} loading={evaluationFailureLoading} />
            </div>
          )}
        </section>
        </div>
      </details>
    </section>
  );
}

function MatchHealthCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="hc-kb-match-health-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <em>{description}</em>
    </div>
  );
}

function MatchExplainCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="hc-kb-match-explain-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <em>{description}</em>
    </div>
  );
}

function QueryParamControl({
  option,
  value,
  onChange,
}: {
  option: QueryParamOption;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = option.label || option.key || "参数";
  const options = option.options ?? [];
  if (typeof value === "boolean" || option.type === "boolean") {
    return (
      <label className="hc-kb-query-param-control hc-kb-query-param-control--check">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.currentTarget.checked)} />
        <span>{label}</span>
      </label>
    );
  }
  if (options.length > 0) {
    return (
      <label className="hc-kb-query-param-control">
        {label}
        <select value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
          {options.map((item) => {
            const optionValue = optionValueOf(item);
            return <option key={optionValue} value={optionValue}>{optionLabelOf(item)}</option>;
          })}
        </select>
      </label>
    );
  }
  const numeric = option.type === "number" || option.type === "integer" || typeof value === "number";
  return (
    <label className="hc-kb-query-param-control">
      {label}
      <input
        type={numeric ? "number" : "text"}
        min={option.min}
        max={option.max}
        step={option.step}
        value={String(value ?? "")}
        onChange={(event) => onChange(numeric ? Number(event.target.value) : event.target.value)}
      />
    </label>
  );
}

function QueryTestResult({ result }: { result: YuxiKnowledgeQueryTestResponse | null }) {
  if (!result) return null;
  const summary = querySummary(result);
  return (
    <div className="hc-kb-test-result">
      <strong>资料命中结果</strong>
      <div className="hc-kb-result-summary-grid">
        <ResultMetric label="状态" value={summary.status} />
        <ResultMetric label="命中资料" value={summary.hitCount} />
        <ResultMetric label="最高相关度" value={summary.bestScore} />
      </div>
      {summary.answer && <p className="hc-kb-result-answer">{summary.answer}</p>}
      {summary.sources.length > 0 ? (
        <div className="hc-kb-source-list">
          {summary.sources.slice(0, 5).map((source, index) => (
            <div key={`${source.title}:${index}`} className="hc-kb-source-row">
              <div>
                <strong>{source.title || `命中片段 ${index + 1}`}</strong>
                {source.text && <p>{source.text}</p>}
              </div>
              {source.score && <span>{source.score}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="hc-kb-detail-muted">没有找到可展示的来源片段。</div>
      )}
    </div>
  );
}

function RecommendResult({ result }: { result: YuxiRecommendResponse | null }) {
  const ranked = result?.ranked ?? [];
  if (!result) return null;
  return (
    <div className="hc-kb-test-result">
      <strong>档案匹配结果</strong>
      {ranked.length === 0 ? (
        <div className="hc-kb-detail-muted">{result.status === "no_template" ? "当前业务线还没有匹配标准" : "暂无可推荐的档案"}</div>
      ) : (
        <div className="hc-kb-ranked-list">
          {ranked.map((item, index) => (
            <div key={`${item.entity_id ?? item.name ?? index}`} className="hc-kb-ranked-row">
              <div>
                <div className="hc-kb-ranked-title">
                  <span>{item.rank ?? "-"}</span>
                  <strong>{item.name ?? "未命名候选"}</strong>
                  <em>{businessResultLabel(item.result)}</em>
                </div>
                <p className="hc-kb-ranked-reason">{candidateReason(item)}</p>
                <div className="hc-kb-ranked-meta">
                  {typeof item.weighted === "number" && <span>基础匹配 {item.weighted.toFixed(1)}</span>}
                  {typeof item.bonuses === "number" && item.bonuses > 0 && <span>业务加分 {item.bonuses.toFixed(1)}</span>}
                  {typeof item.deductions === "number" && item.deductions > 0 && <span>风险扣分 {item.deductions.toFixed(1)}</span>}
                  {item.vetoed && <span>已触发否决</span>}
                </div>
                {(item.sub_detail ?? []).length > 0 && (
                  <div className="hc-kb-score-breakdown">
                    {(item.sub_detail ?? []).slice(0, 4).map((dimension) => (
                      <div key={dimension.key ?? dimension.label} className="hc-kb-score-dimension">
                        <span>{dimension.label ?? dimension.key ?? "维度"}</span>
                        <strong>{scorePart(dimension.contrib)} / 占比 {scorePart(dimension.weight)}</strong>
                        <i style={{ width: `${dimensionWidth(dimension.contrib)}%` }} />
                      </div>
                    ))}
                  </div>
                )}
                {(item.triggered_rules ?? []).length > 0 && (
                  <div className="hc-kb-tags">
                    {(item.triggered_rules ?? []).slice(0, 4).map((rule, ruleIndex) => (
                      <span key={`${rule.rule ?? ruleIndex}`} className="hc-kb-tag">
                        {rule.rule ?? ruleTypeLabel(rule.type)}{typeof rule.points === "number" ? ` ${rule.points > 0 ? "+" : ""}${rule.points}` : ""}
                      </span>
                    ))}
                  </div>
                )}
                {item.veto_reason && <div className="hc-kb-inline-alert" data-tone="danger">{item.veto_reason}</div>}
              </div>
              <strong>{typeof item.final === "number" ? `匹配分 ${item.final.toFixed(1)}` : "-"}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type RecommendRankedItem = NonNullable<YuxiRecommendResponse["ranked"]>[number];

function businessResultLabel(value: string | null | undefined): string {
  const map: Record<string, string> = {
    pass: "可推荐",
    recommend: "可推荐",
    candidate: "可参考",
    risky: "有风险",
    veto: "不推荐",
    rejected: "不推荐",
  };
  return value ? map[value.toLowerCase()] || value : "待判断";
}

function candidateReason(item: RecommendRankedItem): string {
  if (item.vetoed && item.veto_reason) return `不推荐原因：${item.veto_reason}`;
  const dimensions = (item.sub_detail ?? [])
    .slice()
    .sort((a, b) => Math.abs(b.contrib ?? 0) - Math.abs(a.contrib ?? 0))
    .slice(0, 2)
    .map((dimension) => dimension.label ?? dimension.key)
    .filter(Boolean);
  const rules = (item.triggered_rules ?? []).map((rule) => rule.rule).filter(Boolean).slice(0, 2);
  const parts = [
    dimensions.length > 0 ? `主要命中：${dimensions.join("、")}` : "",
    rules.length > 0 ? `业务标准：${rules.join("、")}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("；") : "按当前知识库资料、档案关系和业务标准综合排序。";
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

interface QuerySourceSummary {
  title: string;
  text: string;
  score: string;
}

function querySummary(result: YuxiKnowledgeQueryTestResponse): {
  status: string;
  hitCount: string;
  bestScore: string;
  answer: string;
  sources: QuerySourceSummary[];
} {
  const root = objectRecord(result);
  const nested = objectRecord(root.result);
  const answer = trimShort(firstText(root, ["answer", "summary", "content", "text", "message"])
    || firstText(nested, ["answer", "summary", "content", "text", "response"]));
  const sources = extractSourceRecords(result)
    .map(sourceSummary)
    .filter((item) => item.title || item.text || item.score);
  const scores = sources
    .map((item) => Number(item.score))
    .filter((value) => Number.isFinite(value));
  const hitCount = numericField(root, ["total", "count", "hit_count", "hits"])
    ?? numericField(nested, ["total", "count", "hit_count", "hits"])
    ?? sources.length;
  return {
    status: businessStatusLabel(String(result.status ?? nested.status ?? "已返回")),
    hitCount: String(hitCount),
    bestScore: scores.length > 0 ? Math.max(...scores).toFixed(2) : "-",
    answer,
    sources,
  };
}

function businessStatusLabel(value: string): string {
  const map: Record<string, string> = {
    ok: "已返回",
    success: "已返回",
    done: "已返回",
    completed: "已返回",
    empty: "无结果",
    failed: "失败",
    error: "失败",
  };
  return map[value.toLowerCase()] || value;
}

function extractSourceRecords(value: unknown, depth = 0): unknown[] {
  if (depth > 3 || value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["sources", "references", "chunks", "results", "items", "documents", "data"]) {
    const raw = record[key];
    if (Array.isArray(raw)) return raw;
    const nested = extractSourceRecords(raw, depth + 1);
    if (nested.length > 0) return nested;
  }
  return [];
}

function sourceSummary(value: unknown): QuerySourceSummary {
  if (typeof value === "string") {
    return { title: "文本片段", text: trimShort(value), score: "" };
  }
  const record = objectRecord(value);
  const meta = objectRecord(record.metadata ?? record.meta);
  const title = firstText(record, ["filename", "file_name", "title", "name", "kb_name", "db_id"])
    || firstText(meta, ["filename", "file_name", "title", "name", "kb_name", "db_id"]);
  const text = firstText(record, ["text", "content", "chunk", "summary", "answer", "page_content"])
    || firstText(meta, ["text", "content", "chunk", "summary"]);
  const score = numericField(record, ["score", "similarity", "relevance", "rerank_score"])
    ?? numericField(meta, ["score", "similarity", "relevance", "rerank_score"]);
  return {
    title: trimShort(title || "命中片段"),
    text: trimShort(text),
    score: typeof score === "number" ? score.toFixed(2) : "",
  };
}

function firstText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function numericField(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function trimShort(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 240 ? `${compact.slice(0, 240)}...` : compact;
}

function scorePart(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "-";
}

function dimensionWidth(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.abs(value)));
}

function EvaluationSummary({
  benchmarks,
  history,
  running,
  failureLoading,
  onRun,
  onLoadFailures,
  onDownload,
  onDelete,
}: {
  benchmarks: unknown[];
  history: unknown[];
  running: boolean;
  failureLoading: boolean;
  onRun: (benchmark: unknown) => void;
  onLoadFailures: (historyItem: unknown) => void;
  onDownload: (benchmark: unknown) => void;
  onDelete: (benchmark: unknown) => void;
}) {
  const latestBenchmark = benchmarks[0];
  const latestHistory = history[0];
  if (!latestBenchmark && !latestHistory) {
    return <div className="hc-kb-detail-muted">还没有评估集和评估历史。</div>;
  }
  return (
    <div className="hc-kb-evaluation-summary">
      <div className="hc-kb-evaluation-history">
        {latestHistory ? (
          <>
            <div>
              <span>最近评估</span>
              <strong>{stringField(latestHistory, ["status", "task_status", "result_status"]) || stringField(latestHistory, ["task_id", "id"]) || "未记录状态"}</strong>
            </div>
            <div>
              <span>分数</span>
              <strong>{stringField(latestHistory, ["final_score", "overall_score", "score", "accuracy", "hit_rate"]) || "未返回"}</strong>
            </div>
            <button type="button" className="hc-kb-topbar-btn" disabled={failureLoading} onClick={() => onLoadFailures(latestHistory)}>
              {failureLoading ? "读取中" : "查看失败项"}
            </button>
          </>
        ) : (
          <div className="hc-kb-detail-muted">暂无评估历史。</div>
        )}
      </div>
      {benchmarks.length > 0 && (
        <div className="hc-kb-benchmark-list">
          {benchmarks.slice(0, 6).map((benchmark, index) => {
            const id = stringField(benchmark, ["id", "benchmark_id"]);
            const name = stringField(benchmark, ["name", "filename"]) || id || `评估集 ${index + 1}`;
            const count = stringField(benchmark, ["question_count", "total_questions", "count"]);
            return (
              <div key={id || name} className="hc-kb-benchmark-row">
                <div>
                  <strong>{name}</strong>
                  <span>{count ? `${count} 问题` : "未返回问题数"}</span>
                </div>
                <div className="hc-kb-row-actions hc-kb-row-actions--always">
                  <button type="button" className="hc-kb-row-btn" title="运行评估" onClick={() => onRun(benchmark)} disabled={running}>
                    <Play size={13} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                  <button type="button" className="hc-kb-row-btn" title="下载" onClick={() => onDownload(benchmark)} disabled={!id}>
                    <Download size={13} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                  <button type="button" className="hc-kb-row-btn" title="删除" onClick={() => onDelete(benchmark)} disabled={!id}>
                    <Trash2 size={13} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FailureSamples({ samples, loading }: { samples: unknown[]; loading: boolean }) {
  if (loading) {
    return <div className="hc-kb-detail-muted">正在读取失败样本。</div>;
  }
  if (samples.length === 0) return null;
  return (
    <div className="hc-kb-failure-samples">
      <div className="hc-kb-admin-section-head">
        <strong>失败样本</strong>
        <span>{samples.length} 条</span>
      </div>
      <div className="hc-kb-failure-list">
        {samples.slice(0, 8).map((sample, index) => (
          <div key={stringField(sample, ["id", "question_id"]) || index} className="hc-kb-failure-row">
            <strong>{stringField(sample, ["query", "question", "input"]) || `样本 ${index + 1}`}</strong>
            <span>{stringField(sample, ["expected", "expected_answer", "target"]) || "未返回期望结果"}</span>
            <em>{stringField(sample, ["error", "reason", "status", "actual", "answer"]) || "未返回错误原因"}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function extractEvaluationRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = objectRecord(value);
  for (const key of ["items", "results", "rows", "data"]) {
    const raw = record[key];
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const nested = extractEvaluationRows(raw);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

function extractQueryParamOptions(params: Record<string, unknown> | undefined): QueryParamOption[] {
  const options = params?.options;
  if (!Array.isArray(options)) return [];
  return options.filter((item): item is QueryParamOption => Boolean(item && typeof item === "object" && "key" in item));
}

const RULE_OPERATORS = [
  { key: "gte", label: "大于等于" },
  { key: "lte", label: "小于等于" },
  { key: "eq", label: "等于" },
  { key: "contains", label: "包含" },
] as const;

const COMMON_RULE_FIELDS = [
  { key: "months_since_update", label: "资料多久没更新" },
  { key: "feedback_score", label: "历史反馈分" },
  { key: "industry_match", label: "行业是否匹配" },
  { key: "authorized_for_external", label: "是否可对客引用" },
] as const;

const RULE_FIELDS_BY_CATEGORY: Record<string, Array<{ key: string; label: string }>> = {
  lecturer: [
    { key: "price_per_day", label: "讲师报价" },
    { key: "customer_rejected", label: "客户曾拒绝" },
    { key: "schedule_available", label: "档期可用" },
  ],
  course: [
    { key: "course_hours", label: "课程学时" },
    { key: "target_audience_match", label: "目标人群匹配" },
  ],
  case: [
    { key: "case_result_verified", label: "案例结果可证明" },
    { key: "customer_similarity", label: "客户相似度" },
  ],
  customer: [
    { key: "customer_level", label: "客户层级" },
    { key: "last_contact_months", label: "多久未触达" },
  ],
  bid_info: [
    { key: "deadline_days", label: "距离截止天数" },
    { key: "qualification_match", label: "资格条件匹配" },
  ],
  bid_risk: [
    { key: "risk_level", label: "风险等级" },
    { key: "veto_clause", label: "是否废标条款" },
  ],
};

function ruleFieldOptions(category: string): Array<{ key: string; label: string }> {
  return [...(RULE_FIELDS_BY_CATEGORY[category] ?? []), ...COMMON_RULE_FIELDS];
}

function coerceRuleValue(value: string): string | number | boolean {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

function conditionSummary(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first || typeof first !== "object") return summarizeJson(value);
  const record = first as Record<string, unknown>;
  const field = String(record.field ?? "字段");
  const op = String(record.op ?? "");
  const label = [...COMMON_RULE_FIELDS, ...Object.values(RULE_FIELDS_BY_CATEGORY).flat()]
    .find((item) => item.key === field)?.label ?? field;
  const opLabel = RULE_OPERATORS.find((item) => item.key === op)?.label ?? op;
  const raw = record.value == null ? "" : String(record.value);
  return [label, opLabel, raw].filter(Boolean).join(" ");
}

function defaultDimensions(line: string | null | undefined): YuxiScoringDimension[] {
  if (line === "bidding") {
    return [
      { key: "requirement", label: "需求符合度", weight: 30, desc: "应答与招标需求条款匹配度" },
      { key: "qualification", label: "资质与业绩", weight: 25, desc: "资质证书、同类中标业绩" },
      { key: "price", label: "报价竞争力", weight: 25, desc: "报价与预算、竞品的匹配度" },
      { key: "risk_control", label: "废标风险规避", weight: 20, desc: "合规要点齐全度" },
    ];
  }
  return [
    { key: "demand_tag", label: "需求标签匹配", weight: 40, desc: "客户需求关键词与候选标签匹配度" },
    { key: "course", label: "课程与课纲", weight: 20, desc: "候选能讲的课程与客户方向" },
    { key: "history", label: "历史项目证据", weight: 20, desc: "同行业真实项目数与满意度" },
    { key: "ability", label: "讲师能力与偏好", weight: 20, desc: "档期、报价、风格、客户接受度" },
  ];
}

function defaultEntityType(category: YuxiCategoryMeta | null): YuxiEntityType {
  if (!category) return "teacher";
  if (category.key === "bid_info" || category.key === "bid_win" || category.key === "bid_review") return "bid_project";
  if (category.key === "bid_risk") return "bid_risk";
  if (category.key === "bid_intel") return "bid_competitor";
  if (category.key === "bid_template") return "bid_template";
  if (category.kind === "course") return "course";
  if (category.kind === "case" || category.kind === "proposal") return "case";
  if (category.kind === "customer") return "customer";
  return "teacher";
}

function templateId(template: YuxiScoringTemplate | null): number | null {
  return typeof template?.id === "number" ? template.id : typeof template?.template_id === "number" ? template.template_id : null;
}

function ruleId(rule: YuxiScoringRule): number | null {
  return typeof rule.id === "number" ? rule.id : typeof rule.rule_id === "number" ? rule.rule_id : null;
}

function ruleTypeLabel(value: string | null | undefined): string {
  if (value === "veto") return "否决";
  if (value === "deduct") return "扣分";
  if (value === "bonus") return "加分";
  if (value === "tag_merge") return "标签";
  return value || "标准";
}

function ruleTone(value: string | null | undefined): "ok" | "fail" | "pending" | "archive" {
  if (value === "veto") return "fail";
  if (value === "bonus") return "ok";
  if (value === "deduct") return "pending";
  return "archive";
}

function summarizeJson(value: unknown): string {
  if (typeof value === "string") return trim(value);
  try {
    return trim(JSON.stringify(value, null, 2));
  } catch {
    return String(value);
  }
}

function trim(value: string): string {
  return value.length > 1200 ? `${value.slice(0, 1200)}...` : value;
}

function optionValueOf(item: unknown): string {
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    return String(record.value ?? record.key ?? record.label ?? "");
  }
  return String(item ?? "");
}

function optionLabelOf(item: unknown): string {
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    return String(record.label ?? record.name ?? record.value ?? record.key ?? "");
  }
  return String(item ?? "");
}

function stringField(value: unknown, keys: string[]): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const raw = record[key];
    if (raw == null) continue;
    if (typeof raw === "number") return Number.isFinite(raw) ? String(Math.round(raw * 100) / 100) : "";
    if (typeof raw === "string") return raw;
  }
  return "";
}
