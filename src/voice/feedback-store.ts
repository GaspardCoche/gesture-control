import type { ElementInfo } from "../overlay/dom-inspector";
import { buildPrompt } from "./prompt-builder";

export interface FeedbackItem {
  id: string;
  timestamp: number;
  pageUrl: string;
  pageTitle: string;
  element: ElementInfo;
  transcript: string;
  confidence: number;
  aiPrompt: string;
}

export class FeedbackStore {
  private items: FeedbackItem[] = [];

  add(element: ElementInfo, transcript: string, confidence: number): FeedbackItem {
    const item: FeedbackItem = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      pageUrl: location.href,
      pageTitle: document.title,
      element,
      transcript,
      confidence,
      aiPrompt: buildPrompt(element, transcript, location.href, document.title),
    };
    this.items.push(item);
    return item;
  }

  getAll(): FeedbackItem[] {
    return this.items;
  }

  getLast(): FeedbackItem | null {
    return this.items.length ? this.items[this.items.length - 1] : null;
  }

  remove(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
  }

  clear() {
    this.items = [];
  }

  get count(): number {
    return this.items.length;
  }

  toJSON(): string {
    return JSON.stringify(this.items, null, 2);
  }

  async copyLastToClipboard(): Promise<boolean> {
    const last = this.getLast();
    if (!last) return false;
    try {
      await navigator.clipboard.writeText(last.aiPrompt);
      return true;
    } catch {
      return false;
    }
  }

  downloadJSON() {
    const blob = new Blob([this.toJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gesture-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
