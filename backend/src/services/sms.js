import { env } from '../env.js';

export const smsLive = Boolean(env.twilioSid && env.twilioToken && env.twilioFrom);
let client = null;

async function getClient() {
  if (!client) {
    const { default: twilio } = await import('twilio');
    client = twilio(env.twilioSid, env.twilioToken);
  }
  return client;
}

export async function sendSms({ to, body }) {
  if (!smsLive) {
    console.log(`[sms mock] to=${to} body=${body}`);
    return { ok: true, mock: true };
  }
  const c = await getClient();
  const msg = await c.messages.create({ to, from: env.twilioFrom, body });
  return { ok: true, mock: false, sid: msg.sid };
}
