import crypto from 'node:crypto';

// Rotating ticket code: HMAC(secret, timeStep) truncated to 8 hex chars,
// refreshing every 10s — matches the front-end's existing "refreshes every
// 10 seconds" copy, now backed by a real, server-verifiable code instead of
// a cosmetic-only canvas animation.
const STEP_MS = 10_000;

export function newQrSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function codeForStep(secret, step) {
  return crypto.createHmac('sha256', secret).update(String(step)).digest('hex').slice(0, 8);
}

export function currentCode(secret, now = Date.now()) {
  return codeForStep(secret, Math.floor(now / STEP_MS));
}

// Accepts the current window or the previous one, to tolerate clock drift
// and the time between a phone rendering a code and a scanner reading it.
export function verifyCode(secret, submittedCode, now = Date.now()) {
  const step = Math.floor(now / STEP_MS);
  return submittedCode === codeForStep(secret, step) || submittedCode === codeForStep(secret, step - 1);
}
