import { askClaudeStream, hasApiKey as hasAnthropicKey, type StreamCallbacks, type ClaudeAttachment } from "./anthropic-client";
import { askGroqStream, hasGroqKey } from "./groq-client";

export type ProviderId = "anthropic" | "groq";

const PROVIDER_STORAGE = "gc_provider";

export function getProvider(): ProviderId {
  const p = localStorage.getItem(PROVIDER_STORAGE) as ProviderId | null;
  if (p === "anthropic" || p === "groq") return p;
  return "anthropic";
}

export function setProvider(p: ProviderId): void {
  localStorage.setItem(PROVIDER_STORAGE, p);
}

export function hasActiveProvider(): boolean {
  const p = getProvider();
  if (p === "anthropic") return hasAnthropicKey();
  if (p === "groq") return hasGroqKey();
  return false;
}

export function activeProviderHasKey(provider: ProviderId): boolean {
  if (provider === "anthropic") return hasAnthropicKey();
  if (provider === "groq") return hasGroqKey();
  return false;
}

export async function askLLMStream(prompt: string, cb: StreamCallbacks, signal?: AbortSignal, image?: ClaudeAttachment): Promise<void> {
  const p = getProvider();
  if (p === "groq") return askGroqStream(prompt, cb, signal);
  return askClaudeStream(prompt, cb, signal, image);
}

export function providerSupportsVision(): boolean {
  return getProvider() === "anthropic";
}
