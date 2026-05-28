import { afterEach, describe, expect, it, vi } from 'vitest';
import { webSearchTool } from '../tools/webSearch';
import type { ToolContext } from '../agent';

function ctx(env: ToolContext['env']): ToolContext {
  return { userId: 'u1', prisma: {} as never, env };
}

const configured = { SEARCH_API_URL: 'https://search.example.com', SEARCH_API_KEY: 'k' };

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status });
}

afterEach(() => vi.restoreAllMocks());

describe('web_search input schema', () => {
  it('requires a query and defaults maxResults to 3', () => {
    const r = webSearchTool.inputSchema.safeParse({ query: 'thai food prices' });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as { maxResults: number }).maxResults).toBe(3);
  });

  it('caps maxResults at 5', () => {
    expect(webSearchTool.inputSchema.safeParse({ query: 'x', maxResults: 9 }).success).toBe(false);
  });
});

describe('web_search execute', () => {
  it('returns search_unavailable without config', async () => {
    expect(await webSearchTool.execute({ query: 'x', maxResults: 3 }, ctx({}))).toEqual({
      error: 'search_unavailable',
    });
  });

  it('normalizes Tavily-style results and sends a bearer token', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        results: [
          { title: 'A', url: 'https://a.test', content: 'snippet a' },
          { title: 'B', url: 'https://b.test', content: 'snippet b' },
        ],
      }),
    );
    const res = (await webSearchTool.execute(
      { query: 'coffee', maxResults: 3 },
      ctx(configured),
    )) as {
      results: Array<{ title: string; url: string; snippet: string }>;
    };
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    expect(JSON.parse(init.body as string)).toMatchObject({ query: 'coffee', max_results: 3 });
    expect(res.results).toHaveLength(2);
    expect(res.results[0]).toMatchObject({
      title: 'A',
      url: 'https://a.test',
      snippet: 'snippet a',
    });
  });

  it('falls back to organic[] (Serper-style) results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ organic: [{ title: 'C', link: 'https://c.test', snippet: 'snip c' }] }),
    );
    const res = (await webSearchTool.execute({ query: 'x', maxResults: 3 }, ctx(configured))) as {
      results: Array<{ title: string; url: string; snippet: string }>;
    };
    expect(res.results[0]).toMatchObject({ title: 'C', url: 'https://c.test', snippet: 'snip c' });
  });

  it('returns search_request_failed on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 500));
    expect(await webSearchTool.execute({ query: 'x', maxResults: 3 }, ctx(configured))).toEqual({
      error: 'search_request_failed',
    });
  });
});
