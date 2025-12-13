import { ExpenseCategory, IncomeCategory } from '../types';
import type { AIClassificationResult, TransactionType } from '../types';

export interface AnalysisResult extends AIClassificationResult {
  description?: string;
  amount?: number;
  date?: string;
  attachmentUrl?: string;
}

export const analyzeReceipt = async (file: File): Promise<AnalysisResult> => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('No authentication token found');

  // 1. Analyze Receipt
  const formData = new FormData();
  formData.append('file', file);

  const analyzeRes = await fetch('/api/analyze-receipt', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  const analyzeData = await analyzeRes.json();

  if (!analyzeRes.ok) {
    throw new Error(analyzeData.error || 'Failed to analyze receipt');
  }

  // 2. Upload File (if analysis successful)
  const uploadFormData = new FormData();
  uploadFormData.append('file', file);

  const uploadRes = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: uploadFormData
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
    attachmentUrl
  };
};
