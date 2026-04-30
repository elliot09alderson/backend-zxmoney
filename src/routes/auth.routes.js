import { Router } from 'express'
import { User } from '../models/User.js'
import { generateOtp, sendOtp } from '../lib/otp.js'
import { hash, compare } from '../lib/hash.js'
import { signAuth, signOtpTicket, verify } from '../lib/jwt.js'
import { config } from '../config.js'
import { authRequired } from '../middleware/auth.js'
import { Restaurant } from '../models/Restaurant.js'

const r = Router()

const normalizePhone = (p) => String(p || '').replace(/\D/g, '').slice(-10)
const validPhone = (p) => /^\d{10}$/.test(p)

/** POST /auth/lookup — { phone } → { status } */
r.post('/lookup', async (req, res) => {
  const phone = normalizePhone(req.body.phone)
  if (!validPhone(phone)) return res.status(400).json({ error: 'Invalid phone' })

  const u = await User.findOne({ phone })
  if (u && u.passwordHash) return res.json({ status: 'needs-password' })
  return res.json({ status: 'needs-otp' })
})

/** POST /auth/request-otp — { phone } */
r.post('/request-otp', async (req, res) => {
  const phone = normalizePhone(req.body.phone)
  if (!validPhone(phone)) return res.status(400).json({ error: 'Invalid phone' })

  const otp = generateOtp()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

  await User.findOneAndUpdate(
    { phone },
    {
      $set: { otp, otpExpiresAt: expiresAt, otpVerifiedAt: null },
      $setOnInsert: {
        phone,
        role: phone === config.superPhone ? 'super' : 'customer',
      },
    },
    { upsert: true, new: true },
  )

  const result = await sendOtp(phone, otp)
  res.json({ ok: true, channel: result.sent ? 'sms' : 'dev-console' })
})

/** POST /auth/verify-otp — { phone, otp } → { ok, ticket } */
r.post('/verify-otp', async (req, res) => {
  const phone = normalizePhone(req.body.phone)
  const code = String(req.body.otp || '').trim()
  if (!validPhone(phone)) return res.status(400).json({ error: 'Invalid phone' })

  const u = await User.findOne({ phone })
  if (!u || !u.otp) return res.status(400).json({ ok: false, error: 'Request a new code' })
  if (u.otpExpiresAt && u.otpExpiresAt.getTime() < Date.now())
    return res.status(400).json({ ok: false, error: 'Code expired' })
  if (u.otp !== code) return res.status(400).json({ ok: false, error: 'Incorrect code' })

  u.otp = null
  u.otpExpiresAt = null
  u.otpVerifiedAt = new Date()
  await u.save()

  const ticket = signOtpTicket(phone)
  res.json({ ok: true, ticket })
})

/**
 * POST /auth/set-password — { phone, password, intent, ticket }
 * ticket is the OTP JWT issued by verify-otp. Intent determines next hop.
 */
r.post('/set-password', async (req, res) => {
  const phone = normalizePhone(req.body.phone)
  const password = String(req.body.password || '')
  const intent = req.body.intent === 'partner' ? 'partner' : 'customer'
  const ticket = req.body.ticket

  if (!validPhone(phone)) return res.status(400).json({ error: 'Invalid phone' })
  if (password.length < 8) return res.status(400).json({ error: 'Password too short' })

  try {
    const p = verify(ticket)
    if (p.typ !== 'otp' || p.sub !== phone)
      return res.status(401).json({ error: 'Invalid ticket' })
  } catch {
    return res.status(401).json({ error: 'OTP ticket invalid or expired' })
  }

  const u = await User.findOne({ phone })
  if (!u) return res.status(404).json({ error: 'User not found' })
  if (!u.otpVerifiedAt) return res.status(400).json({ error: 'Verify OTP first' })

  u.passwordHash = await hash(password)
  u.intent = intent
  u.otpVerifiedAt = null
  u.lastLoginAt = new Date()

  // super-admin identity is pinned by phone
  if (phone === config.superPhone) u.role = 'super'
  await u.save()

  const token = signAuth(u)
  res.json({ ok: true, token, role: u.role, intent })
})

/** POST /auth/sign-in — { phone, password } */
r.post('/sign-in', async (req, res) => {
  const phone = normalizePhone(req.body.phone)
  const password = String(req.body.password || '')
  if (!validPhone(phone)) return res.status(400).json({ error: 'Invalid phone' })

  const u = await User.findOne({ phone })
  if (!u || !u.passwordHash) return res.status(404).json({ error: 'No account found' })
  const ok = await compare(password, u.passwordHash)
  if (!ok) return res.status(401).json({ error: 'Wrong password' })

  u.lastLoginAt = new Date()
  await u.save()

  const token = signAuth(u)
  res.json({ ok: true, token, role: u.role })
})

/** GET /auth/me — current session */
r.get('/me', authRequired, async (req, res) => {
  const u = req.user
  let restaurant = null
  if (u.role === 'admin') {
    restaurant = await Restaurant.findOne({ ownerPhone: u.phone })
  }
  res.json({
    phone: u.phone,
    role: u.role,
    name: u.name,
    restaurant: restaurant ? restaurant.toJSON() : null,
    restaurantStatus: restaurant?.status || null,
  })
})

export default r
