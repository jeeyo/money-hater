import type { ToolDef } from '../agent';
import { recallSpendingTool } from './memory';
import { resolvePlaceTool } from './maps';
import { webSearchTool } from './webSearch';

export { recallSpendingTool, resolvePlaceTool, webSearchTool };

// Expense-entry classification: memory + place resolution (no web search to
// keep latency/cost down).
export const CLASSIFY_TOOLS: ToolDef[] = [recallSpendingTool, resolvePlaceTool];

// Chat assistant: full toolset.
export const ALL_TOOLS: ToolDef[] = [recallSpendingTool, resolvePlaceTool, webSearchTool];
