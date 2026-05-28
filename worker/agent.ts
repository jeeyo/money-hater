import type { PrismaClient } from '@prisma/client';
import type { z } from 'zod';

// ---------------------------------------------------------------------------
// Provider-neutral agent loop.
//
// Talks to a LiteLLM proxy over its OpenAI-compatible /chat/completions API,
// so the underlying model (Gemini/OpenAI/Anthropic/...) is swappable without
// code changes. The loop offers the model a set of tools (function calling),
// executes any tool calls server-side, feeds the results back, and repeats
// until the model returns a plain answer or the iteration budget is hit.
// ---------------------------------------------------------------------------

export const MAX_ITERATIONS = 5;
export const MAX_TOOL_CALLS = 8;
export const LLM_CALL_TIMEOUT_MS = 30_000;
export const TOOL_RESULT_MAX_CHARS = 8_000;
export const MAX_TOKENS = 1_024;

export interface LiteLLMEnv {
  LITELLM_BASE_URL: string;
  LITELLM_API_KEY: string;
  LITELLM_MODEL: string;
}

export interface ToolEnv {
  GOOGLE_MAPS_API_KEY?: string;
  SEARCH_API_URL?: string;
  SEARCH_API_KEY?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

// Server-injected context handed to every tool. The model NEVER supplies any
// of these — userId comes from the authenticated request, keys from env.
export interface ToolContext {
  userId: string;
  prisma: PrismaClient;
  env: ToolEnv;
  signal?: AbortSignal;
}

export interface ToolDef {
  name: string;
  description: string;
  // JSON Schema advertised to the model.
  parameters: Record<string, unknown>;
  // Server-side validation of the model-supplied arguments.
  inputSchema: z.ZodTypeAny;
  execute: (args: unknown, ctx: ToolContext) => Promise<unknown>;
}

export type ResponseFormat =
  | { type: 'json_object' }
  | { type: 'json_schema'; json_schema: { name: string; schema: Record<string, unknown> } };

export class LiteLLMError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'LiteLLMError';
    this.status = status;
  }
}

// Combine an optional caller signal with a per-call timeout so a single slow
// external request can't hang the whole agent run.
export function combineSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

interface LiteLLMRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  tool_choice?: 'auto' | 'none';
  response_format?: ResponseFormat;
}

interface CompletionMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ToolCall[];
}

// Strip control characters (keeping tab/newline/carriage-return) and clamp
// length so untrusted tool/model output can't smuggle terminal escapes into
// logs or the UI, or blow up the context window. Implemented by char code so
// the source stays pure ASCII (no raw control bytes in the file).
export function sanitizeText(value: unknown, max = TOOL_RESULT_MAX_CHARS): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  let out = '';
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    const isPrintable = code >= 32 && code !== 127;
    const isAllowedWhitespace = code === 9 || code === 10 || code === 13;
    if (isPrintable || isAllowedWhitespace) out += ch;
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

export async function callLiteLLM(
  env: LiteLLMEnv,
  body: LiteLLMRequest,
  signal?: AbortSignal,
): Promise<CompletionMessage> {
  if (!env.LITELLM_BASE_URL || !env.LITELLM_API_KEY) {
    throw new LiteLLMError('LiteLLM is not configured', 500);
  }

  const timeout = AbortSignal.timeout(LLM_CALL_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const url = `${env.LITELLM_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LITELLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.LITELLM_MODEL,
      temperature: 0.2,
      max_tokens: MAX_TOKENS,
      ...body,
    }),
    signal: combined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new LiteLLMError(`LiteLLM request failed (${res.status}): ${text.slice(0, 200)}`, 502);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: CompletionMessage }> };
  const message = data.choices?.[0]?.message;
  if (!message) throw new LiteLLMError('LiteLLM returned no message', 502);
  return message;
}

export interface RunAgentOptions {
  env: LiteLLMEnv;
  messages: ChatMessage[];
  tools: ToolDef[];
  ctx: ToolContext;
  maxIterations?: number;
  responseFormat?: ResponseFormat;
}

export interface RunAgentResult {
  content: string | null;
  toolsUsed: string[];
  iterations: number;
}

export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const { env, tools, ctx, responseFormat } = opts;
  const maxIterations = opts.maxIterations ?? MAX_ITERATIONS;
  const messages = [...opts.messages];
  const byName = new Map(tools.map((t) => [t.name, t]));
  const toolDefs: ToolSpec[] | undefined =
    tools.length > 0
      ? tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }))
      : undefined;

  const toolsUsed: string[] = [];
  let totalToolCalls = 0;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const isFinal = iteration === maxIterations;
    const message = await callLiteLLM(
      env,
      {
        messages,
        tools: isFinal ? undefined : toolDefs,
        tool_choice: isFinal ? 'none' : toolDefs ? 'auto' : undefined,
        response_format: responseFormat,
      },
      ctx.signal,
    );

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0 || isFinal) {
      return { content: message.content, toolsUsed, iterations: iteration };
    }

    // Record the assistant turn that requested the tools, then answer each one.
    messages.push({ role: 'assistant', content: message.content, tool_calls: toolCalls });

    for (const call of toolCalls) {
      totalToolCalls += 1;
      const result = await executeToolCall(call, byName, ctx, totalToolCalls > MAX_TOOL_CALLS);
      if (call.function?.name) toolsUsed.push(call.function.name);
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function?.name,
        content: sanitizeText(result),
      });
    }
  }

  // Unreachable in practice: the final iteration runs with tools disabled and
  // always returns. Present so the function has a terminal return.
  return { content: null, toolsUsed, iterations: maxIterations };
}

async function executeToolCall(
  call: ToolCall,
  byName: Map<string, ToolDef>,
  ctx: ToolContext,
  overBudget: boolean,
): Promise<unknown> {
  if (overBudget) {
    return { error: 'tool_call_budget_exceeded' };
  }
  const def = byName.get(call.function?.name ?? '');
  if (!def) {
    return { error: `unknown_tool: ${call.function?.name ?? '(none)'}` };
  }

  let rawArgs: unknown;
  try {
    rawArgs = call.function.arguments ? JSON.parse(call.function.arguments) : {};
  } catch {
    return { error: 'invalid_tool_arguments_json' };
  }

  const parsed = def.inputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return { error: 'invalid_tool_arguments', details: parsed.error.issues.slice(0, 5) };
  }

  try {
    return await def.execute(parsed.data, ctx);
  } catch (err) {
    console.error(`Tool ${def.name} failed:`, err);
    return { error: 'tool_execution_failed' };
  }
}
