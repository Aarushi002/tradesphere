import mongoose from 'mongoose';

const postSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxLength: 2000 },
  },
  { timestamps: true }
);

export default mongoose.model('Post', postSchema);
