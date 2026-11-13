import mongoose from 'mongoose';

// Where a payer gets paid: the link read from a wallet's receive-money QR code (PRD M1).
// Small and always read with the user, so it's embedded (Session 18, "embed").
const payoutSchema = new mongoose.Schema(
  {
    wallet: { type: String, enum: ['whish', 'omt', 'neo', 'suyool'], required: true },
    payUrl: { type: String, required: true, maxlength: 2048 },
  },
  { _id: false },
);

// Only payers have accounts. Guests just type a name (PRD M5).
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // bcrypt hash, never the password itself (Session 19)
    passwordHash: { type: String, required: true },
    payouts: { type: [payoutSchema], default: [] },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
