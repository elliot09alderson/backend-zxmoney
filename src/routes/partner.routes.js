import { Router } from 'express'
import { authRequired } from '../middleware/auth.js'
import { Restaurant } from '../models/Restaurant.js'
import { signAuth } from '../lib/jwt.js'

const r = Router()

/**
 * POST /partner/onboard — (auth required, role=customer)
 * Creates a pending restaurant and elevates the user to role=admin.
 */
r.post('/onboard', authRequired, async (req, res) => {
  const u = req.user
  if (u.role === 'super') return res.status(403).json({ error: 'Super admin cannot onboard as partner' })

  const existing = await Restaurant.findOne({ ownerPhone: u.phone })
  if (existing) return res.status(409).json({ error: 'You already have a restaurant registered' })

  const { name, cuisine, priceRange, vpa, discountPct, profilePhotoUrl, carousel } = req.body || {}
  if (!name || !vpa) return res.status(400).json({ error: 'Name and UPI are required' })

  const restaurant = await Restaurant.create({
    ownerPhone: u.phone,
    name,
    cuisine: cuisine || '',
    priceRange: priceRange || '₹₹',
    vpa,
    discountPct: Number.isFinite(+discountPct) ? Math.max(0, Math.min(100, +discountPct)) : 10,
    profilePhotoUrl: profilePhotoUrl || '',
    carousel: Array.isArray(carousel) ? carousel.filter(Boolean) : [],
    status: 'pending',
  })

  u.role = 'admin'
  u.name = name
  await u.save()

  const token = signAuth(u)
  res.json({ ok: true, token, role: u.role, restaurant: restaurant.toJSON() })
})

export default r
