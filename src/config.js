import dotenv from 'dotenv'
dotenv.config()

export const config = {
  port: Number(process.env.PORT || 4000),
  env: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/zxmoney',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  superPhone: process.env.SUPER_PHONE || '9999999999',
  twilio: {
    sid: process.env.TWILIO_ACCOUNT_SID || '',
    token: process.env.TWILIO_AUTH_TOKEN || '',
    verifySid: process.env.TWILIO_VERIFY_SID || '',
    enabled: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SID),
  },
  seedOnBoot: (process.env.SEED_ON_BOOT || 'true').toLowerCase() === 'true',
  zxcomApiUrl: process.env.ZXCOM_API_URL || 'https://zxcom.in',
}
