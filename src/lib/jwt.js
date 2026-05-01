import jwt from 'jsonwebtoken'
import { config } from '../config.js'

export function signAuth(user) {
  return jwt.sign(
    { sub: user.phone, role: user.role, typ: 'auth' },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  )
}

export function signOtpTicket(phone) {
  // short-lived ticket used between OTP verify and password set
  return jwt.sign(
    { sub: phone, typ: 'otp' },
    config.jwtSecret,
    { expiresIn: '10m' },
  )
}

export function signSsoTicket(phone) {
  return jwt.sign(
    { sub: phone, typ: 'sso' },
    config.jwtSecret,
    { expiresIn: '90s' },
  )
}

export function verify(token) {
  return jwt.verify(token, config.jwtSecret)
}
