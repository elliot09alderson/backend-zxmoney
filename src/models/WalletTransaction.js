import mongoose from 'mongoose'

const WalletTransactionSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    walletType: { type: String, enum: ['zx', 'earned'], default: 'zx' },
    amount: { type: Number, required: true },
    note: { type: String, default: '' },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
)

WalletTransactionSchema.set('toJSON', { virtuals: true })

export const WalletTransaction = mongoose.model('WalletTransaction', WalletTransactionSchema)
