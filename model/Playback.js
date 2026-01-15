import mongoose from 'mongoose'

const PlaybackSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', index: true, required: true },
    itemType: { type: String, enum: ['song', 'album', 'category', 'audio'], required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    playedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
)

PlaybackSchema.index({ userId: 1, playedAt: -1 })

export default mongoose.model('playback', PlaybackSchema)