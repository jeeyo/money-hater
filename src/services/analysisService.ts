import { ExpenseCategory, IncomeCategory } from '../types';
import type { AIClassificationResult, TransactionType } from '../types';
import { apiFetch } from './api';

export interface AnalysisResult extends AIClassificationResult {
  description?: string;
  amount?: number;
  date?: string;
  attachmentUrl?: string;
}

export const analyzeReceipt = async (file: File): Promise<AnalysisResult> => {
  // 1. Analyze Receipt
  const analyzeForm = new FormData();
  analyzeForm.append('file', file);

  const analyzeRes = await apiFetch('/api/analyze-receipt', {
    method: 'POST',
    body: analyzeForm,
  });

  const analyzeData = await analyzeRes.json();
  if (!analyzeRes.ok) {
    throw new Error(analyzeData.error || 'Failed to analyze receipt');
  }

  // 2. Upload File (if analysis successful)
  const uploadForm = new FormData();
  uploadForm.append('file', file);

  const uploadRes = await apiFetch('/api/upload', {
    method: 'POST',
    body: uploadForm,
  });

  let attachmentUrl: string | undefined;
  if (uploadRes.ok) {
    const uploadData = await uploadRes.json();
    attachmentUrl = uploadData.key;
  }

  return {
    description: analyzeData.description,
    amount: analyzeData.amount,
    date: analyzeData.date,
    category: analyzeData.category as ExpenseCategory | IncomeCategory,
    tags: analyzeData.tags || [],
    type: analyzeData.type as TransactionType,
    attachmentUrl,
  };
};
