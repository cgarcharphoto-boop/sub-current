import { env } from '../env.js';

// Real the moment STRIPE_SECRET_KEY is set. Until then, mock mode marks the
// order paid immediately so the rest of the app (tickets, check-in, push)
// can be built and tested end to end without a Stripe account.
let stripeClient = null;
export const paymentsLive = Boolean(env.stripeSecretKey);

async function getStripe() {
  if (!stripeClient) {
    const { default: Stripe } = await import('stripe');
    stripeClient = new Stripe(env.stripeSecretKey);
  }
  return stripeClient;
}

export async function charge({ amountCents, currency = 'usd', description, idempotencyKey }) {
  if (!paymentsLive) {
    return { ok: true, mock: true, ref: `mock_${idempotencyKey}`, status: 'succeeded' };
  }
  const stripe = await getStripe();
  const intent = await stripe.paymentIntents.create(
    { amount: amountCents, currency, description, confirm: true, payment_method: 'pm_card_visa' },
    { idempotencyKey }
  );
  return { ok: intent.status === 'succeeded', mock: false, ref: intent.id, status: intent.status };
}
