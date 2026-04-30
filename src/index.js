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

const app = express()

app.use(cors())
app.use(express.json({ limit: '8mb' }))
if (config.env !== 'test') app.use(morgan('dev'))

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
    try { await seedIfEmpty() } catch (e) { console.error('[seed]', e) }
  }
  app.listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port}`)
    console.log(`[api] twilio: ${config.twilio.enabled ? 'enabled' : 'dev-console mode'}`)
  })
}
boot().catch((e) => {
  console.error('[boot]', e)
  process.exit(1)
})
