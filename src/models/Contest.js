import mongoose from 'mongoose'

const ContestSchema = new mongoose.Schema(
  {
    // restaurantId is set for merchant-scoped and merchant-customers contests; null for global ones
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      default: null,
      index: true,
    },
    // For audience='merchant-customers': the target restaurant whose customers see this contest
    targetRestaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      default: null,
    },
    audience: {
      type: String,
      enum: ['merchant', 'all-customers', 'all-merchants', 'merchant-customers'],
      default: 'merchant',
      index: true,
    },
    createdBySuperAdmin: { type: Boolean, default: false },

    title: { type: String, required: true },
    description: { type: String, default: '' },
    prize: { type: String, default: '' },
    prizeAmount: { type: Number, default: 0, min: 0 }, // total pool — split equally among winners
    image: { type: String, default: '' },
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, required: true },
    numWinners: { type: Number, default: 1, min: 1, max: 50 },
    winnersDeclared: { type: Boolean, default: false },
    winnersDeclaredAt: { type: Date },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
)

ContestSchema.virtual('state').get(function () {
  const now = Date.now()
  if (this.startsAt && this.startsAt.getTime() > now) return 'upcoming'
  if (this.endsAt.getTime() > now) return 'live'
  return this.winnersDeclared ? 'declared' : 'pending-declaration'
})

ContestSchema.virtual('prizePerWinner').get(function () {
  if (!this.prizeAmount || !this.numWinners) return 0
  return Math.floor(this.prizeAmount / this.numWinners)
})

ContestSchema.set('toJSON', { virtuals: true })
export const Contest = mongoose.model('Contest', ContestSchema)
