import mongoose from 'mongoose';

// Money is always a whole number in the smallest unit: cents for USD, pounds for LBP.

const itemSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 80 },
  price: { type: Number, required: true, min: 0 }, // unit price
  quantity: { type: Number, required: true, min: 1, max: 999 },
});

// Everyone at the table, the payer included (isPayer). Their order is the join order,
// which breaks rounding ties in the split (PRD §8).
const memberSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 60 },
  isPayer: { type: Boolean, default: false },
  guestToken: { type: String, default: null }, // guests only: proves "this is me"
  status: { type: String, enum: ['unpaid', 'confirmed'], default: 'unpaid' },
  method: { type: String, enum: ['cash', 'whish', 'omt', 'neo', 'suyool'], default: null },
  tip: { type: Number, default: 0, min: 0 },
  paidAmount: { type: Number, default: null }, // what they owed when marked paid
  confirmedAt: { type: Date, default: null },
});

// Who took how many units of which item. Ids are kept as strings.
const claimSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true },
    memberId: { type: String, required: true },
    units: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

// One bill holds its items, people and claims: they always belong to that bill and
// are always read together, so they're embedded (Session 18, "embed").
const billSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    venue: { type: String, required: true, trim: true, maxlength: 80 },
    date: { type: String, required: true }, // "YYYY-MM-DD"
    currency: { type: String, enum: ['USD', 'LBP'], default: 'USD' },
    tax: { type: Number, default: 0, min: 0 },
    taxRate: { type: Number, default: null },
    taxIncluded: { type: Boolean, default: false },
    service: { type: Number, default: 0, min: 0 },
    lbpRate: { type: Number, default: null },
    shareToken: { type: String, required: true, unique: true }, // the secret part of the guest link
    cardPaidAt: { type: Date, default: null },
    photos: { type: [String], default: [] }, // Photo ids, in order
    items: { type: [itemSchema], default: [] },
    members: { type: [memberSchema], default: [] },
    claims: { type: [claimSchema], default: [] },
  },
  // optimisticConcurrency: if two phones save the same bill at the same moment,
  // the second save fails instead of erasing the first one (see services/bills.js).
  { timestamps: true, optimisticConcurrency: true },
);

export const Bill = mongoose.model('Bill', billSchema);
