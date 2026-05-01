import mongoose from 'mongoose'

const WinnerSchema = new mongoose.Schema(
  {
    // Optional — null for global super-admin contests not tied to a merchant
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      default: null,
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
    prizeAmount: { type: Number, default: 0 }, // credited to wallet if winnerPhone is set
    winnerPhone: { type: String, default: '' }, // used to credit wallet
    photoUrl: { type: String, default: '' },
    wonAt: { type: Date, default: Date.now },
    declaredBySuperAdmin: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
)

WinnerSchema.set('toJSON', { virtuals: true })
export const Winner = mongoose.model('Winner', WinnerSchema)
