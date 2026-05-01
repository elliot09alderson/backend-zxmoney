import { Router } from 'express'
import { authRequired, requireRole } from '../middleware/auth.js'
import { User } from '../models/User.js'
import { WalletTransaction } from '../models/WalletTransaction.js'
import { RedeemRequest } from '../models/RedeemRequest.js'

const r = Router()

/* ── Customer routes ─────────────────────────────────── */
r.use(authRequired)

/** GET /redeem/history */
r.get('/history', async (req, res) => {
  const phone = req.user.phone
  const [txns, requests] = await Promise.all([
    WalletTransaction.find({ phone, walletType: 'earned' }).sort({ at: -1 }).limit(50),
    RedeemRequest.find({ phone }).sort({ createdAt: -1 }).limit(50),
  ])
  res.json({ txns, requests })
})

/** POST /redeem/request — submit with beneficiary details */
r.post('/request', async (req, res) => {
  const phone = req.user.phone
  const amount = Number(req.body.amount)
  const note   = String(req.body.note || '').trim()
  const b      = req.body.beneficiary || {}

  if (isNaN(amount) || amount <= 0)
    return res.status(400).json({ error: 'Amount must be greater than 0' })

  const accountType = b.accountType === 'bank' ? 'bank' : 'upi'
  if (accountType === 'upi' && !String(b.upiId || '').trim())
    return res.status(400).json({ error: 'UPI ID is required' })
  if (accountType === 'bank' && (!String(b.bankAccount || '').trim() || !String(b.ifsc || '').trim()))
    return res.status(400).json({ error: 'Bank account and IFSC are required' })
  if (!String(b.name || '').trim())
    return res.status(400).json({ error: 'Beneficiary name is required' })

  const user = await User.findOne({ phone })
  if (!user) return res.status(404).json({ error: 'User not found' })

  const balance = user.earnedBalance ?? 0
  if (amount > balance)
    return res.status(400).json({ error: `Insufficient balance. Available: ₹${balance}` })

  user.earnedBalance = balance - amount
  await user.save()

  await WalletTransaction.create({
    phone, type: 'debit', walletType: 'earned', amount,
    note: note || 'Redemption request submitted',
  })

  const request = await RedeemRequest.create({
    phone, amount, note,
    beneficiary: {
      name:        String(b.name || '').trim(),
      accountType,
      upiId:       String(b.upiId || '').trim(),
      bankAccount: String(b.bankAccount || '').trim(),
      ifsc:        String(b.ifsc || '').trim().toUpperCase(),
      bankName:    String(b.bankName || '').trim(),
    },
  })
  res.status(201).json({ ok: true, request, newBalance: user.earnedBalance })
})

/* ── Super-admin routes ──────────────────────────────── */
const adminRouter = Router()
adminRouter.use(requireRole('super'))

/** GET /redeem/admin/requests?status=pending */
adminRouter.get('/requests', async (req, res) => {
  const filter = {}
  if (req.query.status) filter.status = req.query.status
  const requests = await RedeemRequest.find(filter).sort({ createdAt: -1 }).limit(200)
  res.json(requests)
})

/** PATCH /redeem/admin/requests/:id — mark paid / rejected */
adminRouter.patch('/requests/:id', async (req, res) => {
  const { status, referenceId, adminNote } = req.body || {}
  if (!['paid', 'rejected'].includes(status))
    return res.status(400).json({ error: "status must be 'paid' or 'rejected'" })

  const request = await RedeemRequest.findById(req.params.id)
  if (!request) return res.status(404).json({ error: 'Request not found' })
  if (request.status !== 'pending')
    return res.status(400).json({ error: 'Request already resolved' })

  request.status      = status
  request.referenceId = String(referenceId || '').trim()
  request.adminNote   = String(adminNote || '').trim()
  request.resolvedAt  = new Date()
  await request.save()

  // If rejected, refund the earnedBalance
  if (status === 'rejected') {
    await User.updateOne({ phone: request.phone }, { $inc: { earnedBalance: request.amount } })
    await WalletTransaction.create({
      phone: request.phone, type: 'credit', walletType: 'earned',
      amount: request.amount, note: `Redemption refunded: ${adminNote || 'rejected'}`,
    })
  }

  res.json({ ok: true, request })
})

r.use('/admin', adminRouter)

export default r
