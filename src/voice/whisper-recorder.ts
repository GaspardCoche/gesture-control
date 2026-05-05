import { pipeline, env } from "@huggingface/transformers";
import type { RecorderCallbacks } from "./speech-recorder";

env.allowLocalModels = false;

const MODEL_ID = "onnx-community/whisper-base";
const TARGET_SAMPLE_RATE = 16000;
const MAX_DURATION_MS = 30000;

type ASRPipeline = Awaited<ReturnType<typeof pipeline>>;

let _pipeline: ASRPipeline | null = null;
let _warmingPromise: Promise<ASRPipeline> | null = null;
let _device: "webgpu" | "wasm" | null = null;

function detectWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

async function loadPipeline(): Promise<ASRPipeline> {
  if (_pipeline) return _pipeline;
  if (_warmingPromise) return _warmingPromise;

  const useWebGPU = detectWebGPU();
  _device = useWebGPU ? "webgpu" : "wasm";

  _warmingPromise = (async () => {
    try {
      const p = await pipeline("automatic-speech-recognition", MODEL_ID, {
        device: _device!,
        dtype: useWebGPU ? "fp32" : "q8",
      });
      _pipeline = p;
      return p;
    } catch (err) {
      _warmingPromise = null;
      _pipeline = null;
      throw err;
    }
  })();

  return _warmingPromise;
}

async function decodeBlobToMono16k(blob: Blob): Promise<Float32Array> {
  const ab = await blob.arrayBuffer();
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(ab.slice(0));
  } finally {
    void ctx.close();
  }

  const length = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, length, TARGET_SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice(0);
}

function normalizeLang(input?: string): string | undefined {
  if (!input) return undefined;
  const code = input.toLowerCase().split("-")[0];
  const map: Record<string, string> = {
    en: "english", fr: "french", nl: "dutch", de: "german", es: "spanish",
    it: "italian", pt: "portuguese", ja: "japanese", zh: "chinese", ru: "russian",
    ar: "arabic", ko: "korean", pl: "polish", tr: "turkish", sv: "swedish",
  };
  return map[code];
}

export class WhisperRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private _recording = false;
  private timeoutId: number | null = null;
  private callbacks: RecorderCallbacks;
  private lang: string | undefined;

  static isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }

  static isReady(): boolean {
    return _pipeline !== null;
  }

  static device(): "webgpu" | "wasm" | null {
    return _device;
  }

  static async warmup(): Promise<void> {
    if (!WhisperRecorder.isSupported()) return;
    await loadPipeline();
  }

  constructor(callbacks: RecorderCallbacks, lang?: string) {
    this.callbacks = callbacks;
    this.lang = lang || document.documentElement.lang || navigator.language;
  }

  get recording(): boolean {
    return this._recording;
  }

  async start(): Promise<void> {
    if (this._recording) return;
    if (!WhisperRecorder.isSupported()) {
      this.callbacks.onError("MediaRecorder not supported");
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (err: any) {
      const msg = err?.name === "NotAllowedError" ? "Microphone access denied" : "Microphone not available";
      this.callbacks.onError(msg);
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

    this.chunks = [];
    this.mediaRecorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType })
      : new MediaRecorder(this.stream);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.onerror = () => {
      this.callbacks.onError("Recording error");
      this.cleanup();
    };

    this.mediaRecorder.onstop = () => {
      this.transcribe().catch((err) => {
        this.callbacks.onError(`Transcription failed: ${err?.message ?? err}`);
      }).finally(() => {
        this.cleanup();
      });
    };

    try {
      this.mediaRecorder.start();
    } catch (err: any) {
      this.callbacks.onError(`Failed to start recording: ${err?.message ?? err}`);
      this.cleanup();
      return;
    }

    this._recording = true;
    this.timeoutId = window.setTimeout(() => this.stop(), MAX_DURATION_MS);
  }

  stop(): void {
    if (!this._recording || !this.mediaRecorder) return;
    if (this.timeoutId != null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.callbacks.onInterim("Transcribing...");
    try {
      this.mediaRecorder.stop();
    } catch {
      this.cleanup();
    }
  }

  setLanguage(lang: string): void {
    this.lang = lang;
  }

  private async transcribe(): Promise<void> {
    if (this.chunks.length === 0) {
      this.callbacks.onError("No audio captured");
      return;
    }

    const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType || "audio/webm" });
    if (blob.size < 1500) {
      this.callbacks.onError("No speech detected");
      return;
    }

    const transcriber = await loadPipeline();
    const audio = await decodeBlobToMono16k(blob);

    const language = normalizeLang(this.lang);
    const result: any = await (transcriber as any)(audio, {
      language,
      task: "transcribe",
      return_timestamps: false,
      chunk_length_s: 30,
    });

    const text = (Array.isArray(result) ? result[0]?.text : result?.text) ?? "";
    const trimmed = text.trim();
    if (!trimmed) {
      this.callbacks.onError("No speech detected");
      return;
    }

    this.callbacks.onFinal(trimmed, 1);
  }

  private cleanup(): void {
    if (this.timeoutId != null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.chunks = [];
    const wasRecording = this._recording;
    this._recording = false;
    if (wasRecording) this.callbacks.onEnd();
  }
}
