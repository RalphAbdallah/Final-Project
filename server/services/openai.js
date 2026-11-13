/**
 * Reads receipt photos with an OpenAI vision model (PRD M2). It's one fetch to OpenAI's
 * API from the server, so the key never reaches the browser (Session 11, 20).
 * The model only copies what is printed; services/draft.js does every calculation.
 */

// An error with a code the route turns into a status (see routes/receipts.js).
// usage = the tokens OpenAI charged, when it got that far (failed reads still cost).
function readError(code, detail, usage) {
  const err = new Error(code);
  err.code = code;
  err.detail = detail;
  err.usage = usage || null;
  return err;
}

// OpenAI's usage block -> the numbers we log and limit on.
function readUsage(usage) {
  if (!usage) return null;
  const input = usage.prompt_tokens || 0;
  const output = usage.completion_tokens || 0;
  return { input, output, total: usage.total_tokens || input + output };
}

const nullableNumber = { type: ['number', 'null'] };
const nullableString = { type: ['string', 'null'] };

// The exact JSON shape the model must answer with: every field required, null for anything not printed.
export const RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'is_receipt',
    'receipt_count',
    'unclear_photos',
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
    is_receipt: {
      type: 'boolean',
      description:
        'False only if the photos show something other than a restaurant or shop receipt. A receipt too blurry to read is still a receipt (list it in unclear_photos).',
    },
    receipt_count: {
      type: 'integer',
      description:
        'How many different receipts the photos show (different venue, date, receipt number or grand total). Parts of one long receipt count as 1.',
    },
    unclear_photos: {
      type: 'array',
      items: { type: 'integer' },
      description:
        'Numbers of the photos (1 = first) too blurry, dark, glared, cut off or far away to read their item lines and amounts with confidence. Empty when every photo is readable.',
    },
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
- The photos should be parts of ONE receipt, in order. They may overlap: list each item line only once.
- If the photos actually show more than one different receipt, set receipt_count to how many; never silently drop one.
- If a photo is too blurry, dark, glared, cut off or far away to read its item lines or amounts with confidence, put its number in unclear_photos instead of guessing. A slightly soft photo you can still read is fine. A receipt you can recognize but not read is still a receipt: keep is_receipt true and list the photo in unclear_photos.
- Item lines are things that were bought. Do not list subtotal, tax, service, total, tip guides, tip or signature lines, card payment details, table, guest or server numbers.
- quantity: the printed count ("2 x", "2X", or a Qty column). Use 1 when no count is printed.
- amount: the money amount printed on that item line. unit_price: only when a separate per-unit price is printed on the same line, such as "@ $2.99".
- If an item name wraps onto a second line, join it into one name. Keep names as printed, in normal capitalization.
- If two totals are printed in USD and LL/LBP, the item currency is the one the item amounts use; put the printed rate (LBP per 1 USD) in lbp_rate.
- Use null for anything not printed or not readable. Set is_receipt to false if the photos are not a receipt.`;

/**
 * images: [{ mime, base64 }] -> { raw, usage }
 * raw is what the model copied off the receipt (RECEIPT_SCHEMA).
 */
export async function readReceipt(images) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw readError('ai_not_configured', 'OPENAI_API_KEY is empty');

  const content = [{ type: 'text', text: `${images.length} photo(s) of one receipt, in order.` }];
  for (const image of images) {
    content.push({ type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.base64}`, detail: 'high' } });
  }

  let res;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      // OpenAI sometimes stalls under load: give up after a minute.
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        // 0 = the same photo is always read the same way
        temperature: 0,
        max_completion_tokens: 8000,
        messages: [
          { role: 'system', content: INSTRUCTIONS },
          { role: 'user', content },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'receipt', strict: true, schema: RECEIPT_SCHEMA } },
      }),
    });
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    throw readError(timedOut ? 'ai_timeout' : 'ai_unavailable', err.message);
  }

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    throw readError(res.status === 401 ? 'ai_key_invalid' : 'ai_unavailable', `${res.status} ${detail}`);
  }

  const body = await res.json();
  const usage = readUsage(body.usage);
  const message = body.choices?.[0]?.message;
  if (!message || message.refusal) throw readError('not_a_receipt', message?.refusal, usage);

  let raw;
  try {
    raw = JSON.parse(message.content);
  } catch {
    throw readError('ai_unavailable', 'Unreadable answer from OpenAI', usage);
  }

  if (!raw.is_receipt) throw readError('not_a_receipt', null, usage);
  // Two receipts read as one would silently drop one: refuse instead.
  if (raw.receipt_count > 1) throw readError('several_receipts', null, usage);
  // A photo it can't read would silently lose its items: say which one to retake.
  const unclear = (raw.unclear_photos || [])
    .filter((n, i, all) => n >= 1 && n <= images.length && all.indexOf(n) === i)
    .sort((a, b) => a - b);
  if (unclear.length > 0) {
    const err = readError('unclear_photos', null, usage);
    err.photos = unclear;
    throw err;
  }
  return { raw, usage };
}
