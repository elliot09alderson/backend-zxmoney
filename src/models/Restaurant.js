import mongoose from 'mongoose'

const RestaurantSchema = new mongoose.Schema(
  {
    ownerPhone: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    cuisine: { type: String, default: '' },
    priceRange: { type: String, default: '₹₹' },
    rating: { type: Number, default: 0 },
    discountPct: { type: Number, default: 10, min: 0, max: 100 },
    vpa: { type: String, required: true },
    profilePhotoUrl: { type: String, default: '' },
    carousel: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['pending', 'active', 'disabled'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true },
)

RestaurantSchema.virtual('active').get(function () {
  return this.status === 'active'
})

RestaurantSchema.set('toJSON', { virtuals: true })

export const Restaurant = mongoose.model('Restaurant', RestaurantSchema)
