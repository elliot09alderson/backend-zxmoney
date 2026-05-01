import twilio from 'twilio'
import { config } from '../config.js'

const client = config.twilio.enabled
  ? twilio(config.twilio.sid, config.twilio.token)
  : null

export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function sendOtp(phone) {
  const to = phone.startsWith('+') ? phone : `+91${phone}`

  if (client) {
    try {
      await client.verify.v2.services(config.twilio.verifySid).verifications.create({
        to,
        channel: 'sms',
      })
      return { sent: true }
    } catch (err) {
      console.error(`[otp:twilio-error] ${phone} → ${err.message}`)
      // Fall through to dev-console fallback
    }
  }

  // Dev / fallback: generate locally and store in DB
  const devCode = generateOtp()
  console.log(`[otp:dev] ${phone} → ${devCode}`)
  return { sent: false, dev: true, devCode }
}

export async function checkOtp(phone, code) {
  if (!client) return null  // dev mode — caller handles DB check
  const to = phone.startsWith('+') ? phone : `+91${phone}`
  try {
    const check = await client.verify.v2.services(config.twilio.verifySid).verificationChecks.create({ to, code })
    return check.status === 'approved'
  } catch (err) {
    console.error(`[otp:twilio-check-error] ${phone} → ${err.message}`)
    return null  // fall back to DB check
  }
}
