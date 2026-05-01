import mongoose from 'mongoose'

const ConfigHistorySchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    changedBy: { type: String, required: true }, // phone
    changedAt: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  },
  { _id: false },
)

const WalletConfigSchema = new mongoose.Schema(
  {
    // Singleton — always one doc with key='global'
    key: { type: String, default: 'global', unique: true },
    monthlyCredit: { type: Number, default: 0, min: 0 },
    lastCreditedMonth: { type: String, default: '' }, // "YYYY-MM"
    configHistory: { type: [ConfigHistorySchema], default: [] },
  },
  { timestamps: true },
)

WalletConfigSchema.set('toJSON', { virtuals: true })

export const WalletConfig = mongoose.model('WalletConfig', WalletConfigSchema)
