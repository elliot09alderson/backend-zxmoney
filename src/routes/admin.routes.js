import { Router } from 'express'
import { authRequired, requireRole } from '../middleware/auth.js'
import { Restaurant } from '../models/Restaurant.js'
import { Contest } from '../models/Contest.js'
import { Winner } from '../models/Winner.js'

const r = Router()

// Every admin route is scoped to the admin's own restaurant.
async function loadOwnRestaurant(req, res, next) {
  const rst = await Restaurant.findOne({ ownerPhone: req.user.phone })
  if (!rst) return res.status(404).json({ error: 'No restaurant found for this admin' })
  req.restaurant = rst
  next()
}

r.use(authRequired, requireRole('admin'), loadOwnRestaurant)

// GET /admin/restaurant
r.get('/restaurant', (req, res) => {
  res.json({ ...req.restaurant.toJSON(), status: req.restaurant.status })
})

// PATCH /admin/restaurant — edit fields (not status)
r.patch('/restaurant', async (req, res) => {
  const ALLOWED = ['name', 'cuisine', 'priceRange', 'vpa', 'discountPct', 'profilePhotoUrl', 'carousel']
  const patch = {}
  for (const k of ALLOWED) if (k in req.body) patch[k] = req.body[k]
  if (patch.discountPct != null) {
    patch.discountPct = Math.max(0, Math.min(100, Number(patch.discountPct) || 0))
  }
  if (patch.carousel && !Array.isArray(patch.carousel)) return res.status(400).json({ error: 'carousel must be array' })
  Object.assign(req.restaurant, patch)
  await req.restaurant.save()
  res.json(req.restaurant.toJSON())
})

// Contests ---
r.get('/contests', async (req, res) => {
  const list = await Contest.find({ restaurantId: req.restaurant._id }).sort({ createdAt: -1 })
  res.json(list)
})

r.post('/contests', async (req, res) => {
  const { title, description, prize, image, startsAt, endsAt, numWinners } = req.body || {}
  if (!title) return res.status(400).json({ error: 'Title is required' })
  if (!endsAt) return res.status(400).json({ error: 'End date is required' })
  const start = startsAt ? new Date(startsAt) : new Date()
  const end = new Date(endsAt)
  if (Number.isNaN(end.getTime())) return res.status(400).json({ error: 'Invalid end date' })
  if (Number.isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid start date' })
  if (end <= start) return res.status(400).json({ error: 'End must be after start' })
  const n = Math.max(1, Math.min(50, Number(numWinners) || 1))
  const c = await Contest.create({
    restaurantId: req.restaurant._id,
    title,
    description: description || '',
    prize: prize || '',
    image: image || '',
    startsAt: start,
    endsAt: end,
    numWinners: n,
  })
  res.status(201).json(c)
})

r.delete('/contests/:id', async (req, res) => {
  const out = await Contest.findOneAndDelete({
    _id: req.params.id,
    restaurantId: req.restaurant._id,
  })
  if (!out) return res.status(404).json({ error: 'Not found' })
  await Winner.deleteMany({ contestId: out._id })
  res.json({ ok: true })
})

// GET /admin/contests/:id/winners — winners for a specific contest
r.get('/contests/:id/winners', async (req, res) => {
  const c = await Contest.findOne({ _id: req.params.id, restaurantId: req.restaurant._id })
  if (!c) return res.status(404).json({ error: 'Contest not found' })
  const list = await Winner.find({ contestId: c._id }).sort({ wonAt: 1 })
  res.json(list)
})

// POST /admin/contests/:id/declare-winners — bulk-create winners for a finished contest
r.post('/contests/:id/declare-winners', async (req, res) => {
  const c = await Contest.findOne({ _id: req.params.id, restaurantId: req.restaurant._id })
  if (!c) return res.status(404).json({ error: 'Contest not found' })
  if (c.endsAt.getTime() > Date.now()) return res.status(400).json({ error: 'Contest has not ended yet' })
  if (c.winnersDeclared) return res.status(400).json({ error: 'Winners already declared' })

  const winners = Array.isArray(req.body?.winners) ? req.body.winners : []
  if (winners.length === 0) return res.status(400).json({ error: 'At least one winner required' })
  if (winners.length > c.numWinners) {
    return res.status(400).json({ error: `Contest allows up to ${c.numWinners} winner(s)` })
  }
  for (const w of winners) {
    if (!w?.name || !w?.photoUrl) {
      return res.status(400).json({ error: 'Each winner needs name and photoUrl' })
    }
  }

  const docs = await Winner.insertMany(
    winners.map((w) => ({
      restaurantId: req.restaurant._id,
      contestId: c._id,
      name: w.name,
      prize: w.prize || c.prize,
      photoUrl: w.photoUrl,
    })),
  )
  c.winnersDeclared = true
  c.winnersDeclaredAt = new Date()
  await c.save()
  res.status(201).json({ contest: c.toJSON(), winners: docs })
})

// Winners ---
// Returns own winners + globally declared super-admin winners
r.get('/winners', async (req, res) => {
  const [own, global] = await Promise.all([
    Winner.find({ restaurantId: req.restaurant._id }).sort({ wonAt: -1 }),
    Winner.find({ declaredBySuperAdmin: true, restaurantId: null }).sort({ wonAt: -1 }),
  ])
  // Mark source so frontend can split into tabs
  const ownJson = own.map((w) => ({ ...w.toJSON(), source: 'mine' }))
  const globalJson = global.map((w) => ({ ...w.toJSON(), source: 'global' }))
  res.json([...ownJson, ...globalJson])
})

r.post('/winners', async (req, res) => {
  const { name, prize, photoUrl } = req.body || {}
  if (!name || !photoUrl) return res.status(400).json({ error: 'name and photoUrl required' })
  const w = await Winner.create({
    restaurantId: req.restaurant._id,
    name, prize: prize || '', photoUrl,
  })
  res.status(201).json(w)
})

r.delete('/winners/:id', async (req, res) => {
  const out = await Winner.findOneAndDelete({
    _id: req.params.id,
    restaurantId: req.restaurant._id,
  })
  if (!out) return res.status(404).json({ error: 'Not found' })
  res.json({ ok: true })
})

export default r
