import { type AIClassificationResult } from '../types';
import { apiJson } from './api';

export const classifyExpense = async (
  description: string,
  amount?: number,
): Promise<AIClassificationResult | null> => {
  if (!description) return null;
  try {
    return await apiJson<AIClassificationResult>('/api/classify', {
      method: 'POST',
      body: JSON.stringify({ description, amount }),
    });
  } catch (error) {
    console.error('Error classifying expense:', error);
    return null;
  }
};
