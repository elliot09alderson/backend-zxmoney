import { Router } from 'express'
import { User } from '../models/User.js'
import { WalletTransaction } from '../models/WalletTransaction.js'
import { generateOtp, sendOtp, checkOtp } from '../lib/otp.js'
import { hash, compare } from '../lib/hash.js'
import { signAuth, signOtpTicket, signSsoTicket, verify } from '../lib/jwt.js'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { authRequired } from '../middleware/auth.js'
import { Restaurant } from '../models/Restaurant.js'

const SIGNUP_BONUS = 1000

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

/** POST /auth/request-otp — { phone, name? } */
r.post('/request-otp', async (req, res) => {
  const phone = normalizePhone(req.body.phone)
  const name = String(req.body.name || '').trim()
  if (!validPhone(phone)) return res.status(400).json({ error: 'Invalid phone' })

  // Ensure user record exists
  const setFields = { otpVerifiedAt: null }
  if (name) setFields.name = name

  await User.findOneAndUpdate(
    { phone },
    {
      $set: setFields,
      $setOnInsert: {
        phone,
        role: phone === config.superPhone ? 'super' : 'customer',
      },
    },
    { upsert: true, new: true },
  )

  const result = await sendOtp(phone)

  if (result.rateLimited) {
    return res.status(429).json({ ok: false, error: 'Too many attempts. Please try again after 10 minutes.' })
  }

  // Dev mode: store the generated code in DB so verify-otp can check it
  if (result.dev) {
    await User.updateOne({ phone }, { $set: { otp: result.devCode, otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000) } })
  }

  res.json({ ok: true, channel: result.sent ? 'sms' : 'dev-console' })
})

/** POST /auth/verify-otp — { phone, otp } → { ok, ticket } */
r.post('/verify-otp', async (req, res) => {
  const phone = normalizePhone(req.body.phone)
  const code = String(req.body.otp || '').trim()
  if (!validPhone(phone)) return res.status(400).json({ error: 'Invalid phone' })

  // Live mode: verify via Twilio Verify service
  const twilioResult = await checkOtp(phone, code)
  if (twilioResult !== null) {
    // twilioResult is true/false from Twilio
    if (!twilioResult) return res.status(400).json({ ok: false, error: 'Incorrect or expired code' })
    await User.updateOne({ phone }, { $set: { otp: null, otpExpiresAt: null, otpVerifiedAt: new Date() } })
    const ticket = signOtpTicket(phone)
    return res.json({ ok: true, ticket })
  }

  // Dev mode: check against DB-stored code
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
 * POST /auth/set-password — { phone, password, intent, ticket, name? }
 * After setting password, syncs the customer to ZXCOM so they can log in
 * on zxcom.in with the same credentials — no separate registration needed.
 */
r.post('/set-password', async (req, res) => {
  const phone = normalizePhone(req.body.phone)
  const password = String(req.body.password || '')
  const intent = req.body.intent === 'partner' ? 'partner' : 'customer'
  const ticket = req.body.ticket
  const name = String(req.body.name || '').trim()

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

  const isNewUser = !u.passwordHash

  const setFields = {
    passwordHash: await hash(password),
    intent,
    otpVerifiedAt: null,
    lastLoginAt: new Date(),
  }
  if (name) setFields.name = name
  if (phone === config.superPhone) setFields.role = 'super'

  // Credit signup bonus to new customers
  if (isNewUser && intent === 'customer') {
    setFields.walletBalance = (u.walletBalance ?? 0) + SIGNUP_BONUS
  }

  // Use updateOne to avoid Mongoose enum validation on role values set by ZXCOM
  await User.updateOne({ phone }, { $set: setFields })

  if (isNewUser && intent === 'customer') {
    await WalletTransaction.create({
      phone,
      type: 'credit',
      walletType: 'zx',
      amount: SIGNUP_BONUS,
      note: 'Welcome bonus — ZXWallet signup credit',
    })
  }

  // Sync to ZXCOM — create customer account with same phone+password.
  // Best-effort: never fail the ZXMONEY response if ZXCOM is unreachable.
  if (intent === 'customer') {
    try {
      const zxcomRes = await fetch(`${config.zxcomApiUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: u.name || name || phone,
          phone,
          password,
          role: 'customer',
        }),
        signal: AbortSignal.timeout(8000),
      })
      if (!zxcomRes.ok) {
        const body = await zxcomRes.json().catch(() => ({}))
        // 400 "already registered" is fine — account already exists on ZXCOM
        if (zxcomRes.status !== 400) {
          console.warn('[zxcom-sync] register failed', zxcomRes.status, body?.message)
        }
      }
    } catch (err) {
      console.warn('[zxcom-sync] unreachable', err.message)
    }
  }

  // Issue JWT as 'customer' when intent is customer — regardless of ZXCOM role
  // (a promoter/merchant using ZXMONEY as a customer wallet gets customer experience)
  const jwtRole = intent === 'customer' ? 'customer' : (u.role || 'customer')
  const token = jwt.sign(
    { sub: phone, role: jwtRole, typ: 'auth' },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  )
  res.json({ ok: true, token, role: jwtRole, intent })
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

  await User.updateOne({ phone }, { $set: { lastLoginAt: new Date() } })

  // Determine role for this ZXMONEY session
  const sessionRole = ['super', 'admin'].includes(u.role) ? u.role : 'customer'

  // For regular users sync customer role to ZXCOM (adds it to roles[] if not present)
  if (sessionRole === 'customer') {
    fetch(`${config.zxcomApiUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: u.name || phone, phone, password, role: 'customer' }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => {})
  }

  const token = jwt.sign(
    { sub: phone, role: sessionRole, typ: 'auth' },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  )
  res.json({ ok: true, token, role: sessionRole })
})

/** POST /auth/sso-token — issue a 90s SSO ticket for ZXCOM auto-login */
r.post('/sso-token', authRequired, (req, res) => {
  const phone = req.user.phone
  if (!phone) return res.status(400).json({ error: 'No phone on session' })
  const ticket = signSsoTicket(phone)
  res.json({ ok: true, ticket })
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
    walletBalance: u.walletBalance ?? 0,
    earnedBalance: u.earnedBalance ?? 0,
    restaurant: restaurant ? restaurant.toJSON() : null,
    restaurantStatus: restaurant?.status || null,
  })
})

export default r
