import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { runAgent, sanitizeText, type ChatMessage, type ToolContext, type ToolDef } from '../agent';

const env = {
  LITELLM_BASE_URL: 'https://llm.example.com',
  LITELLM_API_KEY: 'sk-test',
  LITELLM_MODEL: 'test-model',
};

const baseCtx: ToolContext = {
  userId: 'user-1',
  // Tools under test here don't touch prisma.
  prisma: {} as never,
  env: {},
};

function llmResponse(message: {
  content?: string | null;
  tool_calls?: Array<{ id: string; name: string; arguments: string }>;
}): Response {
  const body = {
    choices: [
      {
        message: {
          role: 'assistant',
          content: message.content ?? null,
          tool_calls: message.tool_calls?.map((t) => ({
            id: t.id,
            type: 'function',
            function: { name: t.name, arguments: t.arguments },
          })),
        },
      },
    ],
  };
  return new Response(JSON.stringify(body), { status: 200 });
}

function mockFetch(responses: Response[]) {
  const spy = vi.spyOn(globalThis, 'fetch');
  for (const r of responses) spy.mockResolvedValueOnce(r);
  return spy;
}

function bodyOf(spy: ReturnType<typeof mockFetch>, callIndex: number) {
  return JSON.parse((spy.mock.calls[callIndex][1] as RequestInit).body as string);
}

const baseMessages: ChatMessage[] = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: 'hi' },
];

afterEach(() => vi.restoreAllMocks());

describe('runAgent', () => {
  it('returns the model content when no tools are requested', async () => {
    mockFetch([llmResponse({ content: 'final answer' })]);
    const res = await runAgent({ env, messages: baseMessages, tools: [], ctx: baseCtx });
    expect(res.content).toBe('final answer');
    expect(res.toolsUsed).toEqual([]);
    expect(res.iterations).toBe(1);
  });

  it('executes a requested tool and feeds the result back', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const tool: ToolDef = {
      name: 'do_thing',
      description: 'd',
      parameters: { type: 'object', properties: {} },
      inputSchema: z.object({}).passthrough(),
      execute,
    };
    const fetchSpy = mockFetch([
      llmResponse({ tool_calls: [{ id: 'c1', name: 'do_thing', arguments: '{}' }] }),
      llmResponse({ content: 'done' }),
    ]);

    const res = await runAgent({ env, messages: baseMessages, tools: [tool], ctx: baseCtx });

    expect(execute).toHaveBeenCalledOnce();
    expect(res.content).toBe('done');
    expect(res.toolsUsed).toEqual(['do_thing']);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // The second request must include the tool result message.
    expect(bodyOf(fetchSpy, 1).messages.some((m: ChatMessage) => m.role === 'tool')).toBe(true);
  });

  it('reports an error to the model for an unknown tool', async () => {
    const fetchSpy = mockFetch([
      llmResponse({ tool_calls: [{ id: 'c1', name: 'ghost', arguments: '{}' }] }),
      llmResponse({ content: 'recovered' }),
    ]);
    const res = await runAgent({ env, messages: baseMessages, tools: [], ctx: baseCtx });
    expect(res.content).toBe('recovered');
    const toolMsg = bodyOf(fetchSpy, 1).messages.find((m: ChatMessage) => m.role === 'tool');
    expect(toolMsg.content).toContain('unknown_tool');
  });

  it('does not throw on malformed tool arguments JSON', async () => {
    const execute = vi.fn();
    const tool: ToolDef = {
      name: 'do_thing',
      description: 'd',
      parameters: { type: 'object', properties: {} },
      inputSchema: z.object({}).passthrough(),
      execute,
    };
    const fetchSpy = mockFetch([
      llmResponse({ tool_calls: [{ id: 'c1', name: 'do_thing', arguments: '{not json' }] }),
      llmResponse({ content: 'ok' }),
    ]);
    const res = await runAgent({ env, messages: baseMessages, tools: [tool], ctx: baseCtx });
    expect(execute).not.toHaveBeenCalled();
    expect(res.content).toBe('ok');
    const toolMsg = bodyOf(fetchSpy, 1).messages.find((m: ChatMessage) => m.role === 'tool');
    expect(toolMsg.content).toContain('invalid_tool_arguments_json');
  });

  it('validates tool arguments against the input schema', async () => {
    const execute = vi.fn();
    const tool: ToolDef = {
      name: 'need_n',
      description: 'd',
      parameters: { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] },
      inputSchema: z.object({ n: z.number() }),
      execute,
    };
    mockFetch([
      llmResponse({ tool_calls: [{ id: 'c1', name: 'need_n', arguments: '{"n":"oops"}' }] }),
      llmResponse({ content: 'ok' }),
    ]);
    const res = await runAgent({ env, messages: baseMessages, tools: [tool], ctx: baseCtx });
    expect(execute).not.toHaveBeenCalled();
    expect(res.content).toBe('ok');
  });

  it('stops at the iteration budget by forcing a tool-free final turn', async () => {
    const tool: ToolDef = {
      name: 'loop_tool',
      description: 'd',
      parameters: { type: 'object', properties: {} },
      inputSchema: z.object({}).passthrough(),
      execute: vi.fn().mockResolvedValue({ ok: true }),
    };
    // Model keeps asking for tools; agent must cap the number of LLM calls.
    const fetchSpy = mockFetch([
      llmResponse({ tool_calls: [{ id: 'a', name: 'loop_tool', arguments: '{}' }] }),
      llmResponse({ tool_calls: [{ id: 'b', name: 'loop_tool', arguments: '{}' }] }),
      llmResponse({ content: 'forced final' }),
    ]);
    const res = await runAgent({
      env,
      messages: baseMessages,
      tools: [tool],
      ctx: baseCtx,
      maxIterations: 3,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(res.iterations).toBe(3);
    expect(res.content).toBe('forced final');
    // The final request must disable tools.
    const finalBody = bodyOf(fetchSpy, 2);
    expect(finalBody.tool_choice).toBe('none');
    expect(finalBody.tools).toBeUndefined();
  });

  it('caps the total number of tool executions', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const tool: ToolDef = {
      name: 'do_thing',
      description: 'd',
      parameters: { type: 'object', properties: {} },
      inputSchema: z.object({}).passthrough(),
      execute,
    };
    // One assistant turn requesting 12 tool calls; only the budget should run.
    const manyCalls = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`,
      name: 'do_thing',
      arguments: '{}',
    }));
    mockFetch([llmResponse({ tool_calls: manyCalls }), llmResponse({ content: 'done' })]);
    await runAgent({ env, messages: baseMessages, tools: [tool], ctx: baseCtx });
    expect(execute.mock.calls.length).toBeLessThanOrEqual(8);
  });
});

describe('sanitizeText', () => {
  const NUL = String.fromCharCode(0);
  const TAB = String.fromCharCode(9);
  const LF = String.fromCharCode(10);

  it('strips control characters but keeps tab/newline', () => {
    const dirty = 'a' + NUL + 'bc' + TAB + 'd' + LF + 'e';
    expect(sanitizeText(dirty)).toBe('abc' + TAB + 'd' + LF + 'e');
  });

  it('clamps to the max length', () => {
    expect(sanitizeText('x'.repeat(100), 10)).toHaveLength(10);
  });

  it('stringifies non-string input', () => {
    expect(sanitizeText({ a: 1 })).toBe('{"a":1}');
  });
});
