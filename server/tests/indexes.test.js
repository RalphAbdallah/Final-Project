import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDatabase } from './db.js';
import { Bill } from '../models/Bill.js';
import { Photo } from '../models/Photo.js';

// Session 22: docs examined should be close to docs returned. These lock in the indexes
// behind two frequent reads: if one is removed, MongoDB reads every document again and they fail.
useTestDatabase();

const newId = () => new mongoose.Types.ObjectId();

// How MongoDB ran a query: the plan (as text, to look for IXSCAN or COLLSCAN) and its counts.
async function explain(query) {
  const result = await query.explain('executionStats');
  const { queryPlanner, executionStats } = Array.isArray(result) ? result[0] : result;
  const plan = JSON.stringify(queryPlanner.winningPlan);
  return { plan, returned: executionStats.nReturned, examined: executionStats.totalDocsExamined };
}

describe('indexes', () => {
  it("reads only the payer's own bills for the dashboard", async () => {
    await Bill.init(); // wait until the indexes are built
    const payers = Array.from({ length: 20 }, newId);
    await Bill.insertMany(
      payers.flatMap((userId) =>
        Array.from({ length: 25 }, (_, i) => ({ userId, venue: `Venue ${i}`, date: '2026-11-14', shareToken: `${newId()}` })),
      ),
    ); // 500 bills, 25 each

    // The same query as GET /api/me and GET /api/me/bills
    const run = await explain(Bill.find({ userId: payers[0] }).sort({ createdAt: -1 }).limit(50));
    expect(run.plan).toContain('IXSCAN');
    expect(run.plan).not.toContain('COLLSCAN');
    expect(run.returned).toBe(25);
    expect(run.examined).toBe(25);
  });

  it("reads only one bill's photos", async () => {
    await Photo.init();
    const userId = newId();
    const bills = Array.from({ length: 20 }, newId);
    await Photo.insertMany(
      bills.flatMap((billId) => Array.from({ length: 5 }, () => ({ userId, billId, type: 'image/jpeg', data: 'x' }))),
    ); // 100 photos, 5 each

    // The same query as GET /api/me/bills/:id/photos
    const run = await explain(Photo.find({ billId: bills[0] }));
    expect(run.plan).toContain('IXSCAN');
    expect(run.returned).toBe(5);
    expect(run.examined).toBe(5);
  });
});
