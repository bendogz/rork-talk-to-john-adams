/**
 * The bridge between his thinking and his speaking: text arrives from the
 * streamed reply piece by piece, is cut into speakable sentences, and waits in
 * a queue until his voice is free to say it. This is what lets him begin
 * speaking within a second instead of waiting for the whole answer.
 */

import { sanitizeReply } from "@/lib/toolkit";

export class SpeechQueue {
  private items: string[] = [];
  private closed = false;
  private waiters: (() => void)[] = [];

  static from(chunks: string[]): SpeechQueue {
    const queue = new SpeechQueue();
    chunks.forEach((chunk) => queue.push(chunk));
    queue.close();
    return queue;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get hasItems(): boolean {
    return this.items.length > 0;
  }

  push(text: string): void {
    const clean = text.trim();
    if (clean.length === 0 || this.closed) return;
    this.items.push(clean);
    this.wake();
  }

  /** Puts a line at the very front: what he says before anything else. */
  unshift(text: string): void {
    const clean = text.trim();
    if (clean.length === 0) return;
    this.items.unshift(clean);
    this.wake();
  }

  close(): void {
    this.closed = true;
    this.wake();
  }

  /** The next line to speak, or null once nothing more will come. */
  async next(signal: AbortSignal): Promise<string | null> {
    for (;;) {
      if (signal.aborted) return null;
      const item = this.items.shift();
      if (item !== undefined) return item;
      if (this.closed) return null;
      await this.waitForChange(signal, Number.POSITIVE_INFINITY);
    }
  }

  /** True as soon as a line is ready; false if `ms` passes or the queue closes empty. */
  async waitForItem(ms: number, signal: AbortSignal): Promise<boolean> {
    const deadline = Date.now() + ms;
    for (;;) {
      if (this.items.length > 0) return true;
      if (this.closed || signal.aborted) return false;
      const remaining = deadline - Date.now();
      if (remaining <= 0) return false;
      await this.waitForChange(signal, remaining);
    }
  }

  private wake(): void {
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((resolve) => resolve());
  }

  private waitForChange(signal: AbortSignal, ms: number): Promise<void> {
    return new Promise((resolve) => {
      let timer: number | null = null;
      const done = (): void => {
        if (timer !== null) window.clearTimeout(timer);
        signal.removeEventListener("abort", done);
        resolve();
      };
      if (Number.isFinite(ms)) timer = window.setTimeout(done, ms);
      signal.addEventListener("abort", done, { once: true });
      this.waiters.push(done);
    });
  }
}

/** Titles whose full stop does not end a sentence. */
const ABBREVIATION = /\b(Mr|Mrs|Ms|Dr|St|Gen|Col|Capt|Rev|Gov|Lt|Sr|Jr|vs|No)\.$/;
/** After the first line, pieces are gathered to about this length before speaking. */
const STEADY_CHUNK_CHARS = 170;
/** The first line may break at a comma once it runs this long, to start sooner. */
const EARLY_COMMA_CHARS = 90;
/** The studio stitches pieces up to this length comfortably. */
const MAX_CHUNK_CHARS = 480;

function findCut(text: string, first: boolean): number {
  const boundary = first ? /[.!?]["'”’)\]]*\s+|[,;:]\s+/g : /[.!?]["'”’)\]]*\s+/g;
  let match: RegExpExecArray | null;
  let lastGood = -1;
  while ((match = boundary.exec(text)) !== null) {
    const end = match.index + match[0].length;
    const isComma = /^[,;:]/.test(match[0]);
    if (!isComma && ABBREVIATION.test(text.slice(0, match.index + 1))) continue;
    if (first) {
      if (!isComma) return end;
      if (end >= EARLY_COMMA_CHARS) return end;
      continue;
    }
    if (end >= STEADY_CHUNK_CHARS) return end;
    lastGood = end;
  }
  // A runaway sentence: break at the last good boundary rather than overflow.
  if (text.length > MAX_CHUNK_CHARS && lastGood > 0) return lastGood;
  return -1;
}

/** Cuts a stream of text into speakable lines: the first one as early as possible. */
export class SentenceSplitter {
  private buffer = "";
  private emittedCount = 0;

  constructor(private readonly onChunk: (text: string) => void) {}

  get emitted(): number {
    return this.emittedCount;
  }

  feed(text: string): void {
    this.buffer += text;
    this.drain(false);
  }

  flush(): void {
    this.drain(true);
  }

  private drain(final: boolean): void {
    for (;;) {
      const cut = findCut(this.buffer, this.emittedCount === 0);
      if (cut === -1) break;
      this.emit(this.buffer.slice(0, cut));
      this.buffer = this.buffer.slice(cut);
    }
    if (final && this.buffer.trim().length > 0) {
      this.emit(this.buffer);
      this.buffer = "";
    }
  }

  private emit(text: string): void {
    const clean = sanitizeReply(text);
    if (clean.length === 0) return;
    this.emittedCount += 1;
    this.onChunk(clean);
  }
}
