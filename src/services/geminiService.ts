import { type AIClassificationResult } from '../types';
import { apiJson } from './api';

export interface ClassifyOptions {
  latitude?: number;
  longitude?: number;
}

export const classifyExpense = async (
  description: string,
  amount?: number,
  options?: ClassifyOptions,
): Promise<AIClassificationResult | null> => {
  if (!description) return null;
  try {
    return await apiJson<AIClassificationResult>('/api/classify', {
      method: 'POST',
      body: JSON.stringify({
        description,
        amount,
        latitude: options?.latitude,
        longitude: options?.longitude,
      }),
    });
  } catch (error) {
    console.error('Error classifying expense:', error);
    return null;
  }
};
