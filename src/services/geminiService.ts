import { type AIClassificationResult } from '../types';
import { getAuthHeaders } from './api';

export const classifyExpense = async (
  description: string,
  amount?: number,
): Promise<AIClassificationResult | null> => {
  if (!description) return null;

  try {
    const response = await fetch('/api/classify', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ description, amount }),
    });

    if (response.status === 401) {
      // Token expired or invalid - redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      throw new Error('Failed to classify expense');
    }

    const data = (await response.json()) as AIClassificationResult;
    return data;
  } catch (error) {
    console.error('Error classifying expense:', error);
    return null;
  }
};
