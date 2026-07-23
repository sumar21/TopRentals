// Client-side lockout, per docs/DESIGN.md §12.2. Attempts live in localStorage under
// key `rl:<kind>` so a lockout survives a page refresh (this is NOT a security control —
// the real guard has to live server-side once there is a real backend).
export type RateLimitKind = 'login' | 'recover';

interface LimitConfig {
  max: number;
  windowMs: number;
}

const LIMITS: Record<RateLimitKind, LimitConfig> = {
  login: { max: 5, windowMs: 5 * 60 * 1000 },
  recover: { max: 3, windowMs: 60 * 60 * 1000 },
};

interface RateLimitState {
  attempts: number;
  windowStart: number; // epoch ms
}

export interface LockStatus {
  locked: boolean;
  /** Seconds remaining in the lockout; 0 when not locked. */
  lockSecs: number;
  attemptsLeft: number;
}

const storageKey = (kind: RateLimitKind) => `rl:${kind}`;

function readState(kind: RateLimitKind): RateLimitState | null {
  const raw = localStorage.getItem(storageKey(kind));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RateLimitState;
  } catch {
    return null;
  }
}

function writeState(kind: RateLimitKind, state: RateLimitState): void {
  localStorage.setItem(storageKey(kind), JSON.stringify(state));
}

export function getLockStatus(kind: RateLimitKind): LockStatus {
  const { max, windowMs } = LIMITS[kind];
  const state = readState(kind);
  if (!state || Date.now() - state.windowStart >= windowMs) {
    return { locked: false, lockSecs: 0, attemptsLeft: max };
  }
  const locked = state.attempts >= max;
  const lockSecs = locked ? Math.ceil((windowMs - (Date.now() - state.windowStart)) / 1000) : 0;
  return { locked, lockSecs, attemptsLeft: Math.max(0, max - state.attempts) };
}

/** Call on every failed attempt. Returns the resulting lock status. */
export function recordFailedAttempt(kind: RateLimitKind): LockStatus {
  const { windowMs } = LIMITS[kind];
  const state = readState(kind);
  const now = Date.now();
  const windowExpired = !state || now - state.windowStart >= windowMs;
  writeState(kind, windowExpired ? { attempts: 1, windowStart: now } : { attempts: state.attempts + 1, windowStart: state.windowStart });
  return getLockStatus(kind);
}

/** Call on a successful attempt. */
export function resetAttempts(kind: RateLimitKind): void {
  localStorage.removeItem(storageKey(kind));
}

/** e.g. 272 -> "4:32", 32 -> "32s". */
export function formatLockTime(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return `${seconds}s`;
}
