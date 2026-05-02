import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import { config } from './config.js'
import { connectDb } from './db.js'
import { seedIfEmpty } from './seed.js'
import authRoutes from './routes/auth.routes.js'
import customerRoutes from './routes/customer.routes.js'
import adminRoutes from './routes/admin.routes.js'
import superRoutes from './routes/super.routes.js'
import partnerRoutes from './routes/partner.routes.js'
import redeemRoutes from './routes/redeem.routes.js'
import { startWalletCron } from './lib/walletCron.js'
import logger from './lib/logger.js'

// Route all console.* through winston so everything lands in daily log files
console.log   = (...a) => logger.info(a.join(' '))
console.info  = (...a) => logger.info(a.join(' '))
console.warn  = (...a) => logger.warn(a.join(' '))
console.error = (...a) => logger.error(a.join(' '))
console.debug = (...a) => logger.debug(a.join(' '))

const app = express()

app.use(cors())
app.use(express.json({ limit: '8mb' }))
if (config.env !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  }))
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    env: config.env,
    twilio: config.twilio.enabled ? 'live' : 'dev-console',
    time: new Date().toISOString(),
  })
})

app.use('/api/auth', authRoutes)
app.use('/api', customerRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/super', superRoutes)
app.use('/api/partner', partnerRoutes)
app.use('/api/redeem', redeemRoutes)

// 404 (API only)
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[error]', err)
  res.status(err.status || 500).json({ error: err.message || 'Server error' })
})

async function boot() {
  await connectDb()
  if (config.seedOnBoot) {
    try { await seedIfEmpty() } catch (e) { logger.error('[seed]', { err: e.message }) }
  }
  app.listen(config.port, () => {
    logger.info(`[api] listening on http://localhost:${config.port}`)
    logger.info(`[api] twilio: ${config.twilio.enabled ? 'enabled' : 'dev-console mode'}`)
  })
  startWalletCron()
}
boot().catch((e) => {
  logger.error('[boot] fatal', { err: e.message, stack: e.stack })
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  logger.error('[unhandledRejection]', { reason: String(reason) })
})
process.on('uncaughtException', (err) => {
  logger.error('[uncaughtException]', { err: err.message, stack: err.stack })
})
