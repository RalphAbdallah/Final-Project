/**
 * Reads receipt photos with an OpenAI vision model (PRD M2). The model only
 * copies what is printed; receipts/draft.js does every calculation.
 */

export class ReceiptReadError extends Error {
  constructor(code, detail, usage = null) {
    super(code);
    this.code = code;
    this.detail = detail;
    // Tokens OpenAI charged for this call, when it got that far (failed reads still cost).
    this.usage = usage;
  }
}

/** OpenAI's usage block → the numbers we log and limit on. */
function readUsage(usage) {
  if (!usage) return null;
  return {
    input: usage.prompt_tokens ?? 0,
    output: usage.completion_tokens ?? 0,
    reasoning: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    total: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
  };
}

const nullableNumber = { type: ['number', 'null'] };
const nullableString = { type: ['string', 'null'] };

/** Strict JSON schema: every field required, nulls for anything not printed. */
export const RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'is_receipt',
    'venue',
    'date',
    'currency',
    'lines',
    'subtotal',
    'tax_amount',
    'tax_rate',
    'tax_included',
    'service_amount',
    'service_rate',
    'total',
    'lbp_rate',
  ],
  properties: {
    is_receipt: { type: 'boolean', description: 'False if the photos do not show a restaurant or shop receipt.' },
    venue: { ...nullableString, description: 'Business name as printed (the brand, not the legal company).' },
    date: { ...nullableString, description: 'Receipt date as YYYY-MM-DD, or null if not printed.' },
    currency: {
      type: 'string',
      enum: ['USD', 'LBP'],
      description: 'Currency of the item amounts. USD if amounts have $ or a "$" column; LBP if they are in LL/LBP.',
    },
    lines: {
      type: 'array',
      description: 'Every purchased item line, top to bottom, once each even if photos overlap.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['quantity', 'name', 'amount', 'unit_price'],
        properties: {
          quantity: { type: 'integer', description: 'Printed quantity, 1 if none is printed.' },
          name: { type: 'string', description: 'Item name, joining names that wrap onto two lines.' },
          amount: { ...nullableNumber, description: 'The amount printed on the line, exactly as printed.' },
          unit_price: {
            ...nullableNumber,
            description: 'A per-unit price only if printed separately (e.g. "@ $2.99"), otherwise null.',
          },
        },
      },
    },
    subtotal: { ...nullableNumber, description: 'Printed subtotal, or null.' },
    tax_amount: { ...nullableNumber, description: 'Printed tax or VAT amount, or null.' },
    tax_rate: { ...nullableNumber, description: 'Printed tax percentage (8 for "8%"), or null.' },
    tax_included: { type: 'boolean', description: 'True only if the receipt says tax/VAT is included in the prices.' },
    service_amount: { ...nullableNumber, description: 'Printed service charge amount, or null. Not tips.' },
    service_rate: { ...nullableNumber, description: 'Printed service percentage, or null.' },
    total: { ...nullableNumber, description: 'Printed grand total in the item currency, or null.' },
    lbp_rate: { ...nullableNumber, description: 'Printed exchange rate in LBP per 1 USD (90000 for "1$=90,000"), or null.' },
  },
};

const INSTRUCTIONS = `You read restaurant and shop receipts from photos and copy what is printed into the JSON schema.

Rules:
- Copy numbers exactly as printed. Never calculate, divide, add, round or fix anything, even if the receipt looks wrong.
- The photos are parts of ONE receipt, in order. They may overlap: list each item line only once.
- Item lines are things that were bought. Do not list subtotal, tax, service, total, tip guides, tip or signature lines, card payment details, table, guest or server numbers.
- quantity: the printed count ("2 x", "2X", or a Qty column). Use 1 when no count is printed.
- amount: the money amount printed on that item line. unit_price: only when a separate per-unit price is printed on the same line, such as "@ $2.99".
- If an item name wraps onto a second line, join it into one name. Keep names as printed, in normal capitalization.
- If two totals are printed in USD and LL/LBP, the item currency is the one the item amounts use; put the printed rate (LBP per 1 USD) in lbp_rate.
- Use null for anything not printed or not readable. Set is_receipt to false if the photos are not a receipt.`;

/**
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string} options.model
 * @param {string} [options.reasoningEffort]  for reasoning models (gpt-5 family): minimal | low | medium | high.
 *   Copying printed values needs little thinking; lower is faster and cheaper.
 * @param {number} [options.maxOutputTokens]  hard cap on what one read can generate (thinking included)
 * @param {string} [options.serviceTier]  "priority" for OpenAI's faster, pricier processing
 * @param {number} [options.timeoutMs]  give up after this long (OpenAI sometimes stalls under load)
 * @param {number} [options.temperature]  0 = always the single most likely reading (non-reasoning models only)
 * @returns {(images: {mime: string, base64: string}[]) => Promise<{raw: object, usage: object}>}
 */
export function openAiReceiptReader({
  apiKey,
  model,
  reasoningEffort,
  maxOutputTokens = 8000,
  serviceTier,
  timeoutMs = 60_000,
  temperature,
}) {
  return async (images) => {
    let res;
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
          ...(serviceTier ? { service_tier: serviceTier } : {}),
          ...(temperature !== undefined ? { temperature } : {}),
          max_completion_tokens: maxOutputTokens,
          messages: [
            { role: 'system', content: INSTRUCTIONS },
            {
              role: 'user',
              content: [
                { type: 'text', text: `${images.length} photo(s) of one receipt, in order.` },
                ...images.map((image) => ({
                  type: 'image_url',
                  image_url: { url: `data:${image.mime};base64,${image.base64}`, detail: 'high' },
                })),
              ],
            },
          ],
          response_format: { type: 'json_schema', json_schema: { name: 'receipt', strict: true, schema: RECEIPT_SCHEMA } },
        }),
      });
    } catch (err) {
      const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
      throw new ReceiptReadError(timedOut ? 'ai_timeout' : 'ai_unavailable', err.message);
    }

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 500);
      throw new ReceiptReadError(res.status === 401 ? 'ai_key_invalid' : 'ai_unavailable', `${res.status} ${detail}`);
    }
    const body = await res.json();
    const usage = readUsage(body.usage);
    const message = body.choices?.[0]?.message;
    if (!message || message.refusal) throw new ReceiptReadError('not_a_receipt', message?.refusal, usage);

    let raw;
    try {
      raw = JSON.parse(message.content);
    } catch {
      throw new ReceiptReadError('ai_unavailable', `Unparseable response (${body.choices?.[0]?.finish_reason})`, usage);
    }
    if (!raw.is_receipt) throw new ReceiptReadError('not_a_receipt', null, usage);
    return { raw, usage };
  };
}
