import mongoose from 'mongoose'

const WinnerSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true,
    },
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contest',
      default: null,
      index: true,
    },
    name: { type: String, required: true },
    prize: { type: String, default: '' },
    photoUrl: { type: String, default: '' },
    wonAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

WinnerSchema.set('toJSON', { virtuals: true })
export const Winner = mongoose.model('Winner', WinnerSchema)
