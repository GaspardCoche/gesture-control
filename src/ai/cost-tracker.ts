// Cost estimation for Anthropic models (May 2026 pricing).
// Source: anthropic.com/pricing — update if rates change.

export interface ModelPricing {
  id: string;
  inputPerM: number;
  outputPerM: number;
  label: string;
  qualityNote: string;
}

export const PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-7": {
    id: "claude-opus-4-7",
    inputPerM: 15,
    outputPerM: 75,
    label: "Opus 4.7",
    qualityNote: "best quality, highest cost",
  },
  "claude-sonnet-4-6": {
    id: "claude-sonnet-4-6",
    inputPerM: 3,
    outputPerM: 15,
    label: "Sonnet 4.6",
    qualityNote: "balanced — recommended for most tasks",
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    inputPerM: 0.8,
    outputPerM: 4,
    label: "Haiku 4.5",
    qualityNote: "fastest + cheapest, ~85% Sonnet quality on UI tasks",
  },
};

export function estimatePerCallCost(model: string, inputTokens = 2000, outputTokens = 500): number {
  const p = PRICING[model] ?? PRICING["claude-sonnet-4-6"];
  return (inputTokens * p.inputPerM + outputTokens * p.outputPerM) / 1_000_000;
}

const STORAGE_KEY = "gc_session_cost";

export interface SessionUsage {
  calls: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: Record<string, { calls: number; cost: number }>;
}

export function getSessionUsage(): SessionUsage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { calls: 0, totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, byModel: {} };
}

export function trackCall(model: string, inputTokens: number, outputTokens: number): SessionUsage {
  const usage = getSessionUsage();
  const cost = estimatePerCallCost(model, inputTokens, outputTokens);
  usage.calls += 1;
  usage.totalCost += cost;
  usage.totalInputTokens += inputTokens;
  usage.totalOutputTokens += outputTokens;
  if (!usage.byModel[model]) usage.byModel[model] = { calls: 0, cost: 0 };
  usage.byModel[model].calls += 1;
  usage.byModel[model].cost += cost;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(usage)); } catch {}
  return usage;
}

export function resetUsage(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function formatCost(cost: number): string {
  if (cost < 0.001) return "<$0.001";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}
