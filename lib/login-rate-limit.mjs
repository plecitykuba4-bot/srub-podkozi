// Převzato z fitness-app/src/server/auth/login-rate-limit.ts; čistý Node modul.
// Je v JavaScriptu, protože Vercel .ts soubory překládá a import s příponou .ts by nenašel.

/**
 * Jednoduchá ochrana přihlašovacího endpointu pro jeden VPS proces.
 * Není to náhrada za WAF, ale zastaví běžné automatické hádání hesel dřív,
 * než se dostane k bcryptu a databázi. Při budoucím horizontálním škálování
 * se má úložiště nahradit sdíleným Redisem.
 */
const WINDOW_MS = 15 * 60 * 1_000;
const MAX_FAILURES = 5;

/** @type {Map<string, {failures: number, resetAt: number}>} */
const attempts = new Map();

function activeEntry(key, now) {
  const entry = attempts.get(key);
  if (!entry) return null;
  if (entry.resetAt <= now) {
    attempts.delete(key);
    return null;
  }
  return entry;
}

export function loginAllowed(keys) {
  const now = Date.now();
  return keys.every((key) => (activeEntry(key, now)?.failures ?? 0) < MAX_FAILURES);
}

export function recordFailedLogin(keys) {
  const now = Date.now();
  for (const key of keys) {
    const entry = activeEntry(key, now);
    attempts.set(key, entry
      ? { ...entry, failures: entry.failures + 1 }
      : { failures: 1, resetAt: now + WINDOW_MS });
  }
}

export function clearLoginFailures(keys) {
  for (const key of keys) attempts.delete(key);
}

/** Zachovává mapu malou i při náhodných IP adresách z automatických útoků. */
export function pruneLoginAttempts() {
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.resetAt <= now) attempts.delete(key);
}
