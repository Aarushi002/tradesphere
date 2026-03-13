import mongoose from 'mongoose';

const followerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

followerSchema.index({ user: 1, follower: 1 }, { unique: true });

export default mongoose.model('Follower', followerSchema);
