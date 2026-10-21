process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

// dotenv (loaded by src/env.js) only fills in vars that aren't already set —
// without this, whatever happens to be in the real .env (VAPID/Stripe/Twilio/
// Anthropic keys) leaks into the test run and makes mock-mode tests pass or
// fail based on local machine state instead of the test's own setup.
for (const k of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'STRIPE_SECRET_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'ANTHROPIC_API_KEY']) {
  process.env[k] = '';
}
