import { Router } from 'express'
import { authRequired, requireRole } from '../middleware/auth.js'
import { User } from '../models/User.js'
import { Restaurant } from '../models/Restaurant.js'
import { Contest } from '../models/Contest.js'
import { Winner } from '../models/Winner.js'
import { WalletConfig } from '../models/WalletConfig.js'
import { WalletTransaction } from '../models/WalletTransaction.js'
import { runMonthlyCredits } from '../lib/walletCron.js'

const r = Router()
r.use(authRequired, requireRole('super'))

/* ─── Admins ─── */

r.get('/admins', async (_req, res) => {
  const admins = await User.find({ role: 'admin' }).sort({ createdAt: -1 })
  const phones = admins.map((a) => a.phone)
  const restaurants = await Restaurant.find({ ownerPhone: { $in: phones } })
  const byPhone = Object.fromEntries(restaurants.map((r1) => [r1.ownerPhone, r1.toJSON()]))
  res.json(
    admins.map((a) => ({
      phone: a.phone,
      name: a.name,
      status: byPhone[a.phone]?.status || 'pending',
      profilePhotoUrl: byPhone[a.phone]?.profilePhotoUrl || '',
      restaurantId: byPhone[a.phone]?._id || null,
      restaurant: byPhone[a.phone] || null,
    })),
  )
})

r.patch('/admins/:phone/status', async (req, res) => {
  const phone = String(req.params.phone).replace(/\D/g, '').slice(-10)
  const { status } = req.body || {}
  if (!['active', 'disabled'].includes(status))
    return res.status(400).json({ error: 'Invalid status' })
  const rst = await Restaurant.findOne({ ownerPhone: phone })
  if (!rst) return res.status(404).json({ error: 'Restaurant not found' })
  rst.status = status
  await rst.save()
  res.json({ ok: true, phone, status, restaurant: rst.toJSON() })
})

/* ─── Restaurants (for dropdowns) ─── */

r.get('/restaurants', async (_req, res) => {
  const list = await Restaurant.find().sort({ name: 1 })
  res.json(list.map((x) => x.toJSON()))
})

/* ─── Super Winners ─── */

r.get('/winners', async (_req, res) => {
  const winners = await Winner.find().sort({ wonAt: -1 }).limit(200)
  const restaurantIds = [...new Set(winners.map((w) => w.restaurantId).filter((id) => id && id !== 'null' && id !== 'undefined'))]
  const restaurants = await Restaurant.find({ _id: { $in: restaurantIds } }).select('name')
  const nameById = Object.fromEntries(restaurants.map((r1) => [String(r1._id), r1.name]))
  res.json(winners.map((w) => ({ ...w.toJSON(), restaurantName: nameById[String(w.restaurantId)] || '' })))
})

r.post('/winners', async (req, res) => {
  const { restaurantId, name, prize, photoUrl } = req.body || {}
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' })
  if (!name) return res.status(400).json({ error: 'name is required' })
  const rst = await Restaurant.findById(restaurantId)
  if (!rst) return res.status(404).json({ error: 'Restaurant not found' })
  const w = await Winner.create({
    restaurantId: rst._id,
    name,
    prize: prize || '',
    photoUrl: photoUrl || '',
    declaredBySuperAdmin: true,
  })
  res.status(201).json({ ...w.toJSON(), restaurantName: rst.name })
})

r.delete('/winners/:id', async (req, res) => {
  const out = await Winner.findByIdAndDelete(req.params.id)
  if (!out) return res.status(404).json({ error: 'Not found' })
  res.json({ ok: true })
})

/* ─── Super Contests ─── */

const VALID_AUDIENCES = ['all-customers', 'all-merchants', 'merchant-customers']

r.get('/contests', async (_req, res) => {
  const contests = await Contest.find({ createdBySuperAdmin: true }).sort({ createdAt: -1 }).limit(100)
  // Attach restaurant names for merchant-customers contests
  const rstIds = [...new Set(contests.map((c) => String(c.targetRestaurantId)).filter(Boolean))]
  const restaurants = rstIds.length
    ? await Restaurant.find({ _id: { $in: rstIds } }).select('name')
    : []
  const nameById = Object.fromEntries(restaurants.map((r1) => [String(r1._id), r1.name]))
  res.json(
    contests.map((c) => ({
      ...c.toJSON(),
      targetRestaurantName: nameById[String(c.targetRestaurantId)] || '',
    })),
  )
})

r.post('/contests', async (req, res) => {
  const {
    title, description, prize, prizeAmount,
    image, startsAt, endsAt, numWinners,
    audience, targetRestaurantId,
  } = req.body || {}

  if (!title) return res.status(400).json({ error: 'Title is required' })
  if (!endsAt) return res.status(400).json({ error: 'End date is required' })
  if (!VALID_AUDIENCES.includes(audience))
    return res.status(400).json({ error: `audience must be one of: ${VALID_AUDIENCES.join(', ')}` })

  if (audience === 'merchant-customers' && !targetRestaurantId)
    return res.status(400).json({ error: 'targetRestaurantId is required for merchant-customers audience' })

  const start = startsAt ? new Date(startsAt) : new Date()
  const end = new Date(endsAt)
  if (isNaN(end.getTime())) return res.status(400).json({ error: 'Invalid end date' })
  if (isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid start date' })
  if (end <= start) return res.status(400).json({ error: 'End must be after start' })

  const n = Math.max(1, Math.min(50, Number(numWinners) || 1))
  const amount = Math.max(0, Number(prizeAmount) || 0)

  let rst = null
  if (audience === 'merchant-customers') {
    rst = await Restaurant.findById(targetRestaurantId)
    if (!rst) return res.status(404).json({ error: 'Target restaurant not found' })
  }

  const c = await Contest.create({
    restaurantId: rst ? rst._id : null,
    targetRestaurantId: rst ? rst._id : null,
    audience,
    createdBySuperAdmin: true,
    title,
    description: description || '',
    prize: prize || (amount ? `₹${Math.floor(amount / n)} per winner` : ''),
    prizeAmount: amount,
    image: image || '',
    startsAt: start,
    endsAt: end,
    numWinners: n,
  })
  res.status(201).json({
    ...c.toJSON(),
    targetRestaurantName: rst ? rst.name : '',
  })
})

r.delete('/contests/:id', async (req, res) => {
  const c = await Contest.findOne({ _id: req.params.id, createdBySuperAdmin: true })
  if (!c) return res.status(404).json({ error: 'Not found' })
  await Winner.deleteMany({ contestId: c._id })
  await c.deleteOne()
  res.json({ ok: true })
})

r.get('/contests/:id/winners', async (req, res) => {
  const c = await Contest.findOne({ _id: req.params.id, createdBySuperAdmin: true })
  if (!c) return res.status(404).json({ error: 'Not found' })
  const list = await Winner.find({ contestId: c._id }).sort({ wonAt: 1 })
  res.json(list)
})

/** POST /super/contests/:id/declare-winners
 *  Body: { winners: [{ name, phone?, photoUrl, prize? }] }
 *  Auto-credits wallet if phone is provided and user exists.
 */
r.post('/contests/:id/declare-winners', async (req, res) => {
  const c = await Contest.findOne({ _id: req.params.id, createdBySuperAdmin: true })
  if (!c) return res.status(404).json({ error: 'Contest not found' })
  if (c.endsAt.getTime() > Date.now()) return res.status(400).json({ error: 'Contest has not ended yet' })
  if (c.winnersDeclared) return res.status(400).json({ error: 'Winners already declared' })

  const winners = Array.isArray(req.body?.winners) ? req.body.winners : []
  if (winners.length === 0) return res.status(400).json({ error: 'At least one winner required' })
  if (winners.length > c.numWinners)
    return res.status(400).json({ error: `Contest allows up to ${c.numWinners} winner(s)` })

  for (const w of winners) {
    if (!w?.name) return res.status(400).json({ error: 'Each winner needs a name' })
  }

  const perWinner = c.prizeAmount > 0 ? Math.floor(c.prizeAmount / c.numWinners) : 0

  // Credit wallets for winners with a valid phone
  const phones = winners.map((w) => String(w.phone || '').replace(/\D/g, '').slice(-10)).filter((p) => /^\d{10}$/.test(p))
  const usersByPhone = phones.length
    ? Object.fromEntries(
        (await User.find({ phone: { $in: phones } })).map((u) => [u.phone, u]),
      )
    : {}

  // Create winner docs
  const docs = await Winner.insertMany(
    winners.map((w) => {
      const phone = String(w.phone || '').replace(/\D/g, '').slice(-10)
      const validPhone = /^\d{10}$/.test(phone) ? phone : ''
      return {
        restaurantId: c.restaurantId || null,
        contestId: c._id,
        name: w.name,
        prize: w.prize || c.prize || (perWinner ? `₹${perWinner}` : ''),
        prizeAmount: perWinner,
        winnerPhone: validPhone,
        photoUrl: w.photoUrl || '',
        declaredBySuperAdmin: true,
      }
    }),
  )

  // Wallet credit for winners who have accounts
  if (perWinner > 0 && phones.length > 0) {
    const creditPhones = phones.filter((p) => usersByPhone[p])
    if (creditPhones.length > 0) {
      const now = new Date()
      await WalletTransaction.insertMany(
        creditPhones.map((p) => ({
          phone: p,
          type: 'credit',
          walletType: 'earned',
          amount: perWinner,
          note: `Contest winner: ${c.title}`,
          at: now,
        })),
      )
      await User.updateMany(
        { phone: { $in: creditPhones } },
        { $inc: { earnedBalance: perWinner } },
      )
    }
  }

  c.winnersDeclared = true
  c.winnersDeclaredAt = new Date()
  await c.save()

  res.status(201).json({ contest: c.toJSON(), winners: docs })
})

/* ─── Send credit to individual customer ─── */

r.post('/wallet/send', async (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '').slice(-10)
  const amount = Number(req.body.amount)
  const note = String(req.body.note || '').trim() || 'Credit from super admin'

  if (!/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'Invalid phone number' })
  if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' })

  const user = await User.findOne({ phone })
  if (!user) return res.status(404).json({ error: 'No account found for this phone number' })

  await WalletTransaction.create({ phone, type: 'credit', walletType: 'earned', amount, note })
  user.earnedBalance = (user.earnedBalance ?? 0) + amount
  await user.save()

  res.json({ ok: true, phone, amount, newBalance: user.earnedBalance })
})

/* ─── Wallet Config ─── */

r.get('/wallet-config', async (_req, res) => {
  const cfg = await WalletConfig.findOne({ key: 'global' })
  res.json(cfg || { monthlyCredit: 0, lastCreditedMonth: '', configHistory: [] })
})

r.post('/wallet-config', async (req, res) => {
  const amount = Number(req.body.monthlyCredit)
  if (isNaN(amount) || amount < 0) return res.status(400).json({ error: 'Invalid amount' })
  const note = String(req.body.note || '').trim()
  const cfg = await WalletConfig.findOneAndUpdate(
    { key: 'global' },
    {
      $set: { monthlyCredit: amount },
      $push: {
        configHistory: {
          $each: [{ amount, changedBy: req.user.phone, changedAt: new Date(), note }],
          $slice: -50,
        },
      },
    },
    { upsert: true, new: true },
  )
  res.json(cfg.toJSON())
})

r.post('/wallet-config/disburse', async (_req, res) => {
  const result = await runMonthlyCredits()
  res.json(result)
})

r.get('/wallet-transactions', async (_req, res) => {
  const txs = await WalletTransaction.find().sort({ at: -1 }).limit(300)
  res.json(txs)
})

r.get('/wallet-transactions/:phone', async (req, res) => {
  const phone = String(req.params.phone).replace(/\D/g, '').slice(-10)
  const txs = await WalletTransaction.find({ phone }).sort({ at: -1 }).limit(100)
  res.json(txs)
})

export default r
