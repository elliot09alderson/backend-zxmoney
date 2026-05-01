import mongoose from 'mongoose'

const UserSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, default: null },
    role: {
      type: String,
      enum: ['customer', 'admin', 'super'],
      default: 'customer',
      index: true,
    },
    otp: { type: String, default: null },
    otpExpiresAt: { type: Date, default: null },
    otpVerifiedAt: { type: Date, default: null },
    intent: { type: String, enum: ['customer', 'partner'], default: 'customer' },
    name: { type: String, default: '' },
    lastLoginAt: { type: Date, default: null },
    walletBalance: { type: Number, default: 0, min: 0 },  // ZX Wallet (monthly auto-credits)
    earnedBalance: { type: Number, default: 0, min: 0 },  // Credit Earned (prizes, admin sends)
  },
  { timestamps: true },
)

UserSchema.methods.toPublic = function () {
  return {
    phone: this.phone,
    role: this.role,
    name: this.name,
    createdAt: this.createdAt,
  }
}

export const User = mongoose.model('User', UserSchema)
