interface SpeechRecognitionEvent {
  results: { length: number; [index: number]: { isFinal: boolean; 0: { transcript: string; confidence: number } } };
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

export interface RecorderCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string, confidence: number) => void;
  onError: (error: string) => void;
  onEnd: () => void;
}

function getSR(): SpeechRecognitionConstructor | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export class SpeechRecorder {
  private recognition: SpeechRecognitionInstance | null = null;
  private _recording = false;
  private timeout: number | null = null;
  private callbacks: RecorderCallbacks;

  static isSupported(): boolean {
    return !!getSR();
  }

  constructor(callbacks: RecorderCallbacks, lang?: string) {
    this.callbacks = callbacks;
    const SR = getSR();
    if (!SR) return;

    this.recognition = new SR();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = lang || document.documentElement.lang || navigator.language || "en-US";
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      let confidence = 0;
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
          confidence = result[0].confidence;
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim) this.callbacks.onInterim(interim);
      if (final) this.callbacks.onFinal(final, confidence);
    };

    this.recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      const messages: Record<string, string> = {
        "no-speech": "No speech detected",
        "audio-capture": "Microphone not available",
        "not-allowed": "Microphone access denied",
      };
      this.callbacks.onError(messages[e.error] || e.error);
      this._recording = false;
    };

    this.recognition.onend = () => {
      this._recording = false;
      if (this.timeout) { clearTimeout(this.timeout); this.timeout = null; }
      this.callbacks.onEnd();
    };
  }

  get recording(): boolean { return this._recording; }

  start() {
    if (!this.recognition || this._recording) return;
    this._recording = true;
    this.recognition.start();
    this.timeout = window.setTimeout(() => this.stop(), 30000);
  }

  stop() {
    if (!this.recognition || !this._recording) return;
    this.recognition.stop();
  }

  setLanguage(lang: string) {
    if (this.recognition) this.recognition.lang = lang;
  }
}
