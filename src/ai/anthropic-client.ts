const KEY_STORAGE = "gc_anthropic_key";
const MODEL_STORAGE = "gc_anthropic_model";

export const ANTHROPIC_MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — balanced (recommended)" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 — fast, cheap" },
  { id: "claude-opus-4-7", label: "Opus 4.7 — best reasoning" },
] as const;

export const DEFAULT_MODEL = "claude-sonnet-4-6";

export function getApiKey(): string {
  return localStorage.getItem(KEY_STORAGE) ?? "";
}

export function setApiKey(key: string): void {
  const trimmed = key.trim();
  if (trimmed) localStorage.setItem(KEY_STORAGE, trimmed);
  else localStorage.removeItem(KEY_STORAGE);
}

export function clearApiKey(): void {
  localStorage.removeItem(KEY_STORAGE);
}

export function hasApiKey(): boolean {
  const k = getApiKey();
  return k.startsWith("sk-ant-") && k.length > 20;
}

export function getModel(): string {
  const m = localStorage.getItem(MODEL_STORAGE);
  if (m && ANTHROPIC_MODELS.some((x) => x.id === m)) return m;
  return DEFAULT_MODEL;
}

export function setModel(model: string): void {
  if (ANTHROPIC_MODELS.some((x) => x.id === model)) {
    localStorage.setItem(MODEL_STORAGE, model);
  }
}

export interface StreamCallbacks {
  onDelta: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError: (msg: string) => void;
}

const SYSTEM_PROMPT = `You are an expert frontend engineer. The user selected a UI element on a webpage and dictated feedback about what they want changed. Your job:

1. Read the element details (tag, classes, computed styles, dimensions, text)
2. Read the user's voice feedback (it may be in any language; respond in the same language)
3. Output a concise, actionable answer with:
   - One sentence diagnosing the issue
   - The exact CSS/JS/HTML snippet to apply (in a fenced code block)
   - One sentence explaining why

Keep the total response under 200 words. No fluff, no preamble.`;

export async function askClaudeStream(prompt: string, cb: StreamCallbacks, signal?: AbortSignal): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    cb.onError("No API key configured. Open Settings (S) and paste your Anthropic key.");
    return;
  }
  const model = getModel();

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      signal,
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        stream: true,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (err: any) {
    cb.onError(`Network error: ${err?.message ?? err}`);
    return;
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.error?.message || msg;
    } catch {}
    cb.onError(msg);
    return;
  }

  if (!res.body) {
    cb.onError("Empty response body");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  let full = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let evt: any;
        try {
          evt = JSON.parse(data);
        } catch {
          continue;
        }
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
          const chunk = evt.delta.text as string;
          full += chunk;
          cb.onDelta(chunk);
        } else if (evt.type === "error") {
          cb.onError(evt.error?.message ?? "Stream error");
          return;
        }
      }
    }
    cb.onDone(full);
  } catch (err: any) {
    if (err?.name === "AbortError") {
      cb.onDone(full);
      return;
    }
    cb.onError(`Stream error: ${err?.message ?? err}`);
  }
}

export async function testApiKey(key: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 8,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    if (res.ok) return { ok: true, msg: "Key valid" };
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.error?.message || msg;
    } catch {}
    return { ok: false, msg };
  } catch (err: any) {
    return { ok: false, msg: err?.message ?? String(err) };
  }
}
