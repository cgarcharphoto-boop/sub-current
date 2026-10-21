// Lightweight automatic review. The prototype's community rule is that ticket
// resale above face value is held for the team to check, so posts that talk
// about selling tickets wait in the moderation queue instead of going live.
// It errs toward holding: a false hold costs a fan a short wait, a missed
// scalper costs other fans money.

export const REPORT_HOLD_THRESHOLD = 3;

const SELLING = /\b(sell(ing)?|for sale|resell(ing)?|reselling|selling|buy mine|dm (me )?(to|for) (buy|price)|venmo|cash ?app|zelle|paypal|apple cash)\b/i;
const TICKETS = /\b(tickets?|tix|ga|vip|wristbands?|passes|pass|admission|entry)\b/i;
const PRICE = /(\$\s?\d+|\d+\s?(dollars|bucks)|\bobo\b|\bface\b)/i;

export function holdReason(text) {
  const t = String(text || '');
  if (!t) return null;
  if (SELLING.test(t) && TICKETS.test(t)) {
    return PRICE.test(t) ? 'Possible ticket resale with a price' : 'Possible ticket resale';
  }
  return null;
}
