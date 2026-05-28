import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendAssistantMessage } from '../assistantService';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => vi.restoreAllMocks());

describe('sendAssistantMessage', () => {
  it('posts the conversation to /api/assistant and returns the reply', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ reply: 'You spent $42.', toolsUsed: ['recall_spending'] }));

    const res = await sendAssistantMessage([{ role: 'user', content: 'how much?' }]);

    expect(res.reply).toBe('You spent $42.');
    expect(res.toolsUsed).toEqual(['recall_spending']);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('/api/assistant');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      messages: [{ role: 'user', content: 'how much?' }],
    });
  });

  it('propagates API errors as a thrown Error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: 'Too many requests' }, 429),
    );
    let caught: unknown;
    try {
      await sendAssistantMessage([{ role: 'user', content: 'hi' }]);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('Too many requests');
  });
});
