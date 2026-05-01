import { verify } from '../lib/jwt.js'
import { User } from '../models/User.js'

export async function authRequired(req, res, next) {
  try {
    const h = req.headers.authorization || ''
    const token = h.startsWith('Bearer ') ? h.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Missing token' })
    const payload = verify(token)
    if (payload.typ !== 'auth') return res.status(401).json({ error: 'Invalid token type' })

    const user = await User.findOne({ phone: payload.sub })
    if (!user) return res.status(401).json({ error: 'User not found' })

    // Use the role from the JWT — ZXMONEY issues customer/admin/super tokens
    // regardless of the ZXCOM role stored in DB (promoter/merchant etc.)
    req.user = user
    req.user = { ...user.toObject(), role: payload.role }
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' })
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}

export function optionalAuth(req, _res, next) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) return next()
  try {
    const payload = verify(token)
    req.tokenPayload = payload
  } catch {}
  next()
}
