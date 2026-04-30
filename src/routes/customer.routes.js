import { Router } from 'express'
import { Restaurant } from '../models/Restaurant.js'
import { Contest } from '../models/Contest.js'
import { Winner } from '../models/Winner.js'

const r = Router()

/** GET /restaurants — public list of active restaurants */
r.get('/restaurants', async (_req, res) => {
  const list = await Restaurant.find({ status: 'active' }).sort({ rating: -1, createdAt: -1 })
  res.json(list.map((x) => x.toJSON()))
})

/** GET /restaurants/:id — restaurant detail (public but must be active) */
r.get('/restaurants/:id', async (req, res) => {
  const r1 = await Restaurant.findById(req.params.id)
  if (!r1 || r1.status !== 'active') return res.status(404).json({ error: 'Not found' })
  res.json(r1.toJSON())
})

/** GET /contests — live contests (started, not yet ended) across all active restaurants */
r.get('/contests', async (_req, res) => {
  const now = new Date()
  const activeRestaurants = await Restaurant.find({ status: 'active' }).select('_id')
  const ids = activeRestaurants.map((x) => x._id)
  const list = await Contest.find({
    restaurantId: { $in: ids },
    active: true,
    startsAt: { $lte: now },
    endsAt: { $gt: now },
  }).sort({ endsAt: 1 })
  res.json(list)
})

/** GET /winners — winners across all active restaurants */
r.get('/winners', async (_req, res) => {
  const activeRestaurants = await Restaurant.find({ status: 'active' }).select('_id')
  const ids = activeRestaurants.map((x) => x._id)
  const list = await Winner.find({ restaurantId: { $in: ids } }).sort({ wonAt: -1 })
  res.json(list)
})

export default r
