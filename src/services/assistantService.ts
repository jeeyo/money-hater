import { apiJson } from './api';
import type { AssistantMessage, AssistantResponse } from '../types';

export const sendAssistantMessage = async (
  messages: AssistantMessage[],
): Promise<AssistantResponse> => {
  return apiJson<AssistantResponse>('/api/assistant', {
    method: 'POST',
    body: JSON.stringify({ messages }),
  });
};
