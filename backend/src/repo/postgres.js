import pg from 'pg';
import { newToken } from '../lib/tokens.js';
import { SAMPLE_BILL } from '../sample.js';
import { NameTakenError } from './memory.js';

// Money is bigint in minor units; every amount we store fits safely in a JS number.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));
// Keep dates as "YYYY-MM-DD" instead of shifting them through a timezone.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export function createPool(connectionString) {
  return new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
    // Opening a connection to Supabase (TLS, Ireland) costs ~0.5-1 s, so keep idle
    // ones for 5 minutes instead of 30 s: a read after a short pause stays fast.
    idleTimeoutMillis: 5 * 60_000,
    keepAlive: true,
  });
}

const toBill = (r) =>
  r && {
    id: r.id,
    payerId: r.payer_id,
    venue: r.venue,
    date: r.date,
    currency: r.currency,
    tax: r.tax,
    taxRate: r.tax_rate,
    taxIncluded: r.tax_included,
    service: r.service,
    lbpRate: r.lbp_rate,
    shareToken: r.share_token,
    cardPaidAt: r.card_paid_at,
  };

const toMember = (r) =>
  r && {
    id: r.id,
    billId: r.bill_id,
    name: r.name,
    isPayer: r.is_payer,
    guestToken: r.guest_token,
    status: r.status,
    method: r.method,
    tip: r.tip,
    paidAmount: r.paid_amount,
    markedPaidAt: r.marked_paid_at,
    confirmedAt: r.confirmed_at,
    seq: r.seq,
  };

const MEMBER_COLUMNS = {
  tip: 'tip',
  method: 'method',
  status: 'status',
  paidAmount: 'paid_amount',
  markedPaidAt: 'marked_paid_at',
  confirmedAt: 'confirmed_at',
};

/** The Postgres repo (PRD §10 tables). Same methods as the memory repo. */
export function createPostgresRepo(pool) {
  const one = async (sql, params) => (await pool.query(sql, params)).rows[0] ?? null;
  const all = async (sql, params) => (await pool.query(sql, params)).rows;

  async function listPayouts(userId) {
    const rows = await all('select wallet, pay_url from payout_methods where user_id = $1 order by created_at', [userId]);
    return rows.map((r) => ({ wallet: r.wallet, payUrl: r.pay_url }));
  }

  return {
    getUser: (id) => one('select id, email, name from users where id = $1', [id]),

    createUser: ({ id, email, name }) =>
      one(
        `insert into users (id, email, name) values ($1, $2, $3)
         on conflict (id) do update set email = excluded.email
         returning id, email, name`,
        [id, email, name],
      ),

    listPayouts,

    async savePayout(userId, wallet, payUrl) {
      await pool.query(
        `insert into payout_methods (user_id, wallet, pay_url) values ($1, $2, $3)
         on conflict (user_id, wallet) do update set pay_url = excluded.pay_url`,
        [userId, wallet, payUrl],
      );
    },

    async deletePayout(userId, wallet) {
      await pool.query('delete from payout_methods where user_id = $1 and wallet = $2', [userId, wallet]);
    },

    async listBills(userId) {
      const rows = await all(
        'select id, venue, date, share_token from bills where payer_id = $1 order by created_at desc limit 50',
        [userId],
      );
      return rows.map((r) => ({ id: r.id, venue: r.venue, date: r.date, shareToken: r.share_token }));
    },

    async createSampleBill(user) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const bill = toBill(
          (
            await client.query(
              `insert into bills (payer_id, venue, currency, tax, tax_rate, tax_included, service, share_token)
               values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
              [
                user.id,
                SAMPLE_BILL.venue,
                SAMPLE_BILL.currency,
                SAMPLE_BILL.tax,
                SAMPLE_BILL.taxRate,
                SAMPLE_BILL.taxIncluded,
                SAMPLE_BILL.service,
                newToken(),
              ],
            )
          ).rows[0],
        );

        const itemIds = [];
        for (const [position, item] of SAMPLE_BILL.items.entries()) {
          const { rows } = await client.query(
            'insert into items (bill_id, name, price, quantity, position) values ($1, $2, $3, $4, $5) returning id',
            [bill.id, item.name, item.price, item.quantity, position],
          );
          itemIds.push(rows[0].id);
        }

        const addMember = async (name, isPayer, claims) => {
          const { rows } = await client.query(
            `insert into bill_members (bill_id, name, is_payer, guest_token, status)
             values ($1, $2, $3, $4, $5) returning id`,
            [bill.id, name, isPayer, isPayer ? null : newToken(), isPayer ? 'confirmed' : 'unpaid'],
          );
          for (const [index, units] of claims) {
            await client.query('insert into item_claims (item_id, member_id, units) values ($1, $2, $3)', [
              itemIds[index],
              rows[0].id,
              units,
            ]);
          }
        };
        await addMember(user.name, true, SAMPLE_BILL.payerClaims);
        for (const guest of SAMPLE_BILL.guests) await addMember(guest.name, false, guest.claims);

        await client.query('commit');
        return bill;
      } catch (err) {
        await client.query('rollback');
        throw err;
      } finally {
        client.release();
      }
    },

    /** A bill read from photos and reviewed by the payer (PRD M2), with the payer as a member. */
    async createBill(user, bill, items, photoPaths) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const row = (
          await client.query(
            `insert into bills (payer_id, venue, date, currency, tax, tax_rate, tax_included, service, lbp_rate, share_token)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
            [
              user.id,
              bill.venue,
              bill.date,
              bill.currency,
              bill.tax,
              bill.taxRate,
              bill.taxIncluded,
              bill.service,
              bill.lbpRate,
              newToken(),
            ],
          )
        ).rows[0];
        for (const [position, item] of items.entries()) {
          await client.query(
            'insert into items (bill_id, name, price, quantity, position) values ($1, $2, $3, $4, $5)',
            [row.id, item.name, item.price, item.quantity, position],
          );
        }
        for (const [position, path] of photoPaths.entries()) {
          await client.query('insert into bill_photos (bill_id, path, position) values ($1, $2, $3)', [
            row.id,
            path,
            position,
          ]);
        }
        await client.query(
          `insert into bill_members (bill_id, name, is_payer, status) values ($1, $2, true, 'confirmed')`,
          [row.id, user.name],
        );
        await client.query('commit');
        return toBill(row);
      } catch (err) {
        await client.query('rollback');
        throw err;
      } finally {
        client.release();
      }
    },

    /** Receipt reads (and their tokens) since a time, for one payer or everyone. */
    async aiUsageSince({ userId, since }) {
      const row = await one(
        `select count(*)::int as reads, coalesce(sum(total_tokens), 0) as tokens, min(created_at) as oldest
         from ai_usage where created_at >= $1 ${userId ? 'and user_id = $2' : ''}`,
        userId ? [since, userId] : [since],
      );
      return { reads: row.reads, tokens: Number(row.tokens), oldest: row.oldest };
    },

    async recordAiUsage({ userId, photos, usage, ms, ok }) {
      await pool.query(
        `insert into ai_usage (user_id, photos, input_tokens, output_tokens, total_tokens, ms, ok)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, photos, usage?.input ?? 0, usage?.output ?? 0, usage?.total ?? 0, ms, ok],
      );
    },

    getPayerBill: async (userId, billId) =>
      toBill(await one('select * from bills where id = $1 and payer_id = $2', [billId, userId])),

    getBillByShareToken: async (shareToken) =>
      toBill(await one('select * from bills where share_token = $1', [shareToken])),

    async getBillState(bill) {
      const [items, members, claims, payer, payouts] = await Promise.all([
        all('select id, name, price, quantity, position from items where bill_id = $1 order by position, created_at', [
          bill.id,
        ]),
        all('select * from bill_members where bill_id = $1 order by seq', [bill.id]),
        all(
          `select c.item_id, c.member_id, c.units from item_claims c
           join items i on i.id = c.item_id where i.bill_id = $1`,
          [bill.id],
        ),
        one('select id, name from users where id = $1', [bill.payerId]),
        listPayouts(bill.payerId),
      ]);
      return {
        items,
        members: members.map(toMember),
        claims: claims.map((c) => ({ itemId: c.item_id, memberId: c.member_id, units: c.units })),
        payer,
        payouts,
      };
    },

    findGuest: async (billId, guestToken) =>
      toMember(await one('select * from bill_members where bill_id = $1 and guest_token = $2', [billId, guestToken])),

    async addGuest(billId, name, guestToken) {
      try {
        return toMember(
          await one('insert into bill_members (bill_id, name, guest_token) values ($1, $2, $3) returning *', [
            billId,
            name,
            guestToken,
          ]),
        );
      } catch (err) {
        if (err.code === '23505' && err.constraint === 'bill_members_name_idx') throw new NameTakenError();
        throw err;
      }
    },

    getItem: (billId, itemId) =>
      one('select id, name, price, quantity from items where id = $1 and bill_id = $2', [itemId, billId]),

    async setClaim(itemId, memberId, units) {
      await pool.query(
        `insert into item_claims (item_id, member_id, units) values ($1, $2, $3)
         on conflict (item_id, member_id) do update set units = excluded.units`,
        [itemId, memberId, units],
      );
    },

    async removeClaim(itemId, memberId) {
      await pool.query('delete from item_claims where item_id = $1 and member_id = $2', [itemId, memberId]);
    },

    async updateMember(memberId, patch) {
      const keys = Object.keys(patch).filter((k) => MEMBER_COLUMNS[k]);
      if (keys.length === 0) return;
      const sets = keys.map((k, i) => `${MEMBER_COLUMNS[k]} = $${i + 2}`).join(', ');
      await pool.query(`update bill_members set ${sets} where id = $1`, [memberId, ...keys.map((k) => patch[k])]);
    },
  };
}
