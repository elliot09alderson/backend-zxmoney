import { Router } from 'express'
import { authRequired, requireRole } from '../middleware/auth.js'
import { User } from '../models/User.js'
import { Restaurant } from '../models/Restaurant.js'

const r = Router()
r.use(authRequired, requireRole('super'))

/** GET /super/admins — list all restaurant admins + their restaurant */
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

/** PATCH /super/admins/:phone/status — { status } */
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

export default r
