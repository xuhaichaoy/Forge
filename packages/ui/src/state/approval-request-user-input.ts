/*
 * User-input request domain (item/tool/requestUserInput): question
 * normalization (kind/options/isOther) and answer payload assembly.
 * Extracted verbatim from ./approval-requests.
 */
import { formatUnknown, stringField } from "../lib/format";
import { formatMessage } from "./i18n";
import type {
  PendingRequestOption,
  PendingRequestQuestion,
} from "./approval-requests-shared";
import type { PendingServerRequest } from "./codex-reducer";

export function questionText(question: unknown): string {
  if (!question || typeof question !== "object") return formatUnknown(question);
  const record = question as Record<string, unknown>;
  return stringField(record, "question")
    || stringField(record, "prompt")
    || stringField(record, "label")
    || stringField(record, "header")
    || formatUnknown(record);
}

export function requestUserInputQuestions(params: unknown): PendingRequestQuestion[] {
  const questions = params && typeof params === "object" && Array.isArray((params as Record<string, unknown>).questions)
    ? (params as { questions: unknown[] }).questions
    : [];
  return questions.map((question, index) => {
    const record = question && typeof question === "object" ? question as Record<string, unknown> : {};
    const text = questionText(question);
    const options = requestUserInputOptions(record.options);
    /*
     * CODEX-REF: ToolRequestUserInputQuestion.isOther → en `K = ne === !0`。
     * 拿 raw payload 的 isOther / is_other 字段；若 true 则 question 支持 freeform
     * 输入（合并 options 一起渲染）。
     */
    const isOther = record.isOther === true || record.is_other === true;
    return {
      id: stringField(record, "id") || `question_${index + 1}`,
      header: stringField(record, "header") || stringField(record, "label")
        || formatMessage({ id: "hc.pendingRequest.questionFallbackHeader", defaultMessage: "Question {number}" }, { number: index + 1 }),
      question: text,
      kind: requestUserInputKind(record, options),
      isSecret: record.isSecret === true || record.is_secret === true,
      required: true,
      defaultAnswers: [],
      options,
      ...(isOther ? { isOther: true } : {}),
    };
  });
}

function requestUserInputKind(
  record: Record<string, unknown>,
  options: PendingRequestOption[],
): PendingRequestQuestion["kind"] {
  if (options.length > 0) return "singleSelect";
  return record.isSecret === true || record.is_secret === true ? "password" : "textarea";
}

function requestUserInputOptions(value: unknown): PendingRequestOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (!option || typeof option !== "object") return [];
    const record = option as Record<string, unknown>;
    const label = stringField(record, "label");
    if (!label) return [];
    return [{
      value: label,
      label,
      description: stringField(record, "description"),
    }];
  });
}

export function buildUserInputAnswers(
  request: PendingServerRequest,
  answers: Record<string, string[]>,
): Record<string, { answers: string[] }> {
  const questions = requestUserInputQuestions(request.params);
  const result: Record<string, { answers: string[] }> = {};
  for (const question of questions) {
    const values = (answers[question.id] ?? [])
      .map((answer) => answer.trim())
      .filter(Boolean);
    if (values.length > 0) {
      result[question.id] = { answers: values };
    }
  }
  return result;
}
