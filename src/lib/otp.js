import twilio from 'twilio'
import { config } from '../config.js'

const client = config.twilio.enabled
  ? twilio(config.twilio.sid, config.twilio.token)
  : null

export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function sendOtp(phone, otp) {
  if (!client) {
    console.log(`[otp:dev] ${phone} → ${otp}`)
    return { sent: false, dev: true }
  }
  const to = phone.startsWith('+') ? phone : `+91${phone}`
  await client.messages.create({
    to,
    from: config.twilio.from,
    body: `Your zx.money code is ${otp}. Valid for 5 minutes.`,
  })
  return { sent: true }
}
