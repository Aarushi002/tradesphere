import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minLength: 6 },
    tradingId: { type: String, unique: true, sparse: true },
    cashBalance: { type: Number, default: 1000000 },
  },
  { timestamps: true }
);

// Use promise-based middleware (no next arg) to avoid
// \"next is not a function\" issues with async hooks.
userSchema.pre('save', async function () {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  if (!this.tradingId) {
    const count = await mongoose.model('User').countDocuments();
    this.tradingId = `PT${String(100000 + count).padStart(6, '0')}`;
  }
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model('User', userSchema);
