import { useCallback, useEffect, useState } from "react";
import {
  analyzeYuxiKnowledgeFile,
  generateYuxiHydeQuestions,
  getYuxiKnowledgeDocumentDetail,
  type YuxiFileAnalysisResponse,
  type YuxiKnowledgeDocumentDetail,
} from "../lib/yuxi-client";
import type { FileRow } from "./kb-library-model";

export interface KnowledgeFileIdentity {
  dbId: string;
  fileId: string;
}

export interface KbLibraryDocumentDetailState {
  documentDetail: YuxiKnowledgeDocumentDetail | null;
  documentAnalysis: YuxiFileAnalysisResponse | null;
  analysisLoading: boolean;
  analysisError: string | null;
  hydeQuestions: string[];
  hydeLoading: boolean;
  hydeError: string | null;
  detailLoading: boolean;
  detailError: string | null;
  analyzeSelectedFile: (file: FileRow) => Promise<void>;
  generateSelectedFileQuestions: (file: FileRow) => Promise<void>;
  clearDocumentDetail: () => void;
}

export function useKbLibraryDocumentDetail(selectedFile: FileRow | null): KbLibraryDocumentDetailState {
  const [documentDetail, setDocumentDetail] = useState<YuxiKnowledgeDocumentDetail | null>(null);
  const [documentAnalysis, setDocumentAnalysis] = useState<YuxiFileAnalysisResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [hydeQuestions, setHydeQuestions] = useState<string[]>([]);
  const [hydeLoading, setHydeLoading] = useState(false);
  const [hydeError, setHydeError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const clearDocumentDetail = useCallback(() => {
    setDocumentDetail(null);
    setDocumentAnalysis(null);
    setAnalysisError(null);
    setAnalysisLoading(false);
    setHydeQuestions([]);
    setHydeError(null);
    setHydeLoading(false);
    setDetailError(null);
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      clearDocumentDetail();
      return;
    }
    setDocumentAnalysis(null);
    setAnalysisError(null);
    setAnalysisLoading(false);
    setHydeQuestions([]);
    setHydeError(null);
    setHydeLoading(false);
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    getYuxiKnowledgeDocumentDetail(selectedFile.raw)
      .then((detail) => {
        if (cancelled) return;
        setDocumentDetail(detail);
      })
      .catch((err) => {
        if (cancelled) return;
        setDocumentDetail(null);
        setDetailError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clearDocumentDetail, selectedFile]);

  const analyzeSelectedFile = useCallback(async (file: FileRow) => {
    const identity = knowledgeFileIdentity(file);
    if (!identity) {
      setAnalysisError("缺少知识库或文件信息，不能提炼。");
      return;
    }
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const result = await analyzeYuxiKnowledgeFile({
        dbId: identity.dbId,
        fileId: identity.fileId,
        maxChunks: 8,
      });
      setDocumentAnalysis(result);
    } catch (err) {
      setDocumentAnalysis(null);
      setAnalysisError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalysisLoading(false);
    }
  }, []);

  const generateSelectedFileQuestions = useCallback(async (file: FileRow) => {
    const identity = knowledgeFileIdentity(file);
    if (!identity) {
      setHydeError("缺少知识库或文件信息，不能生成问题。");
      return;
    }
    setHydeLoading(true);
    setHydeError(null);
    try {
      const result = await generateYuxiHydeQuestions({
        dbId: identity.dbId,
        fileId: identity.fileId,
        n: 6,
        maxChunks: 8,
      });
      setHydeQuestions(result.questions ?? []);
    } catch (err) {
      setHydeQuestions([]);
      setHydeError(err instanceof Error ? err.message : String(err));
    } finally {
      setHydeLoading(false);
    }
  }, []);

  return {
    documentDetail,
    documentAnalysis,
    analysisLoading,
    analysisError,
    hydeQuestions,
    hydeLoading,
    hydeError,
    detailLoading,
    detailError,
    analyzeSelectedFile,
    generateSelectedFileQuestions,
    clearDocumentDetail,
  };
}

export function knowledgeFileIdentity(file: FileRow): KnowledgeFileIdentity | null {
  const dbId = file.raw.db_id;
  const fileId = file.raw.file_id;
  return dbId && fileId ? { dbId, fileId } : null;
}
