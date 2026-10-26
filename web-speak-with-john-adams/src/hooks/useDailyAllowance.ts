import { useEffect, useState } from "react";

/** Each device may keep company with Mr. Adams this long per day. */
export const DAILY_ALLOWANCE_MS = 10 * 60 * 1000;
const ALLOWANCE_KEY = "speak-with-adams.allowance.v1";
const TICK_MS = 1000;

interface StoredAllowance {
  day: string;
  usedMs: number;
}

/** The visitor's own calendar day, so the audience renews at their midnight. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function readUsedMs(): number {
  try {
    const raw = window.localStorage.getItem(ALLOWANCE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Partial<StoredAllowance>;
    if (parsed.day !== today() || typeof parsed.usedMs !== "number") return 0;
    return Math.max(0, parsed.usedMs);
  } catch {
    return 0;
  }
}

function writeUsedMs(usedMs: number): void {
  try {
    const record: StoredAllowance = { day: today(), usedMs };
    window.localStorage.setItem(ALLOWANCE_KEY, JSON.stringify(record));
  } catch {
    // Private browsing may refuse storage; the allowance then lasts the visit.
  }
}

/** True when this device has already spent today's audience. */
export function isAllowanceSpentToday(): boolean {
  return readUsedMs() >= DAILY_ALLOWANCE_MS;
}

/**
 * Counts the time spent in his company today, on this device, while the page
 * is visible and `active` is true. Renews at the visitor's midnight.
 */
export function useDailyAllowance(active: boolean) {
  const [usedMs, setUsedMs] = useState<number>(() => readUsedMs());

  useEffect(() => {
    if (!active) return;
    let last = Date.now();
    let day = today();
    const timer = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - last;
      last = now;
      if (document.visibilityState !== "visible") return;
      // A new day began while the page was open: the allowance renews.
      if (today() !== day) {
        day = today();
        writeUsedMs(0);
        setUsedMs(0);
        return;
      }
      // Ignore large jumps (a sleeping laptop), counting only real presence.
      const step = Math.min(elapsed, TICK_MS * 3);
      const next = Math.min(DAILY_ALLOWANCE_MS, readUsedMs() + step);
      writeUsedMs(next);
      setUsedMs(next);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [active]);

  const remainingMs = Math.max(0, DAILY_ALLOWANCE_MS - usedMs);
  return { remainingMs, exhausted: remainingMs <= 0 };
}
