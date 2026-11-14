import mongoose from 'mongoose';

// A receipt photo, stored as base64 text. Photos are big, so they live in their own
// collection and the bill only keeps their ids (Session 18, "reference").
const photoSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', default: null }, // null until the bill is created
    type: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
    data: { type: String, required: true },
  },
  { timestamps: true },
);

// A bill's photos are found by billId (GET /api/me/bills/:id/photos).
photoSchema.index({ billId: 1 });

export const Photo = mongoose.model('Photo', photoSchema);
