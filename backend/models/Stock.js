import mongoose from 'mongoose';

const stockSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, unique: true, uppercase: true },
    name: { type: String, required: true },
    exchange: { type: String, enum: ['NASDAQ', 'NYSE', 'NSE', 'BSE'], default: 'NASDAQ' },
    lastPrice: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Stock', stockSchema);
