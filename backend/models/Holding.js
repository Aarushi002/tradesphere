import mongoose from 'mongoose';

const holdingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    symbol: { type: String, required: true, uppercase: true },
    quantity: { type: Number, required: true, min: 0 },
    avgBuyPrice: { type: Number, required: true },
  },
  { timestamps: true }
);

holdingSchema.index({ user: 1, symbol: 1 }, { unique: true });

export default mongoose.model('Holding', holdingSchema);
