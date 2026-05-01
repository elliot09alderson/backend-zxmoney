import mongoose from 'mongoose'

const RedeemRequestSchema = new mongoose.Schema(
  {
    phone:  { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    note:   { type: String, default: '' },

    // Beneficiary details filled by customer
    beneficiary: {
      name:        { type: String, default: '' },
      accountType: { type: String, enum: ['upi', 'bank'], default: 'upi' },
      upiId:       { type: String, default: '' },   // if accountType = upi
      bankAccount: { type: String, default: '' },   // if accountType = bank
      ifsc:        { type: String, default: '' },
      bankName:    { type: String, default: '' },
    },

    status:      { type: String, enum: ['pending', 'paid', 'rejected'], default: 'pending', index: true },
    referenceId: { type: String, default: '' },   // added by admin after payment
    adminNote:   { type: String, default: '' },   // admin's note / reason
    resolvedAt:  { type: Date, default: null },
  },
  { timestamps: true },
)

export const RedeemRequest = mongoose.model('RedeemRequest', RedeemRequestSchema)
