import 'dotenv/config';

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: required('DATABASE_URL', 'file:./dev.db'),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),

  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',

  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  twilioSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioFrom: process.env.TWILIO_FROM_NUMBER || '',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
};

if (env.jwtSecret === 'dev-only-insecure-secret-change-me' && process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to start in production with the default JWT_SECRET. Set a real one.');
}
