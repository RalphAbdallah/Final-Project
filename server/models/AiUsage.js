import mongoose from 'mongoose';

// One row per receipt read that reached OpenAI, with the tokens it cost.
// Used to limit reading, so nobody can drain the AI credit (services/aiLimits.js).
const aiUsageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    photos: { type: Number, required: true },
    totalTokens: { type: Number, default: 0 },
    ms: { type: Number, required: true },
    ok: { type: Boolean, required: true },
  },
  { timestamps: true },
);

export const AiUsage = mongoose.model('AiUsage', aiUsageSchema);
