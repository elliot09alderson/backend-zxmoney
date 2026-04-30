import mongoose from 'mongoose'

const ContestSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    prize: { type: String, default: '' },
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

ContestSchema.set('toJSON', { virtuals: true })
export const Contest = mongoose.model('Contest', ContestSchema)
