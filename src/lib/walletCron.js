import { WalletConfig } from '../models/WalletConfig.js'
import { WalletTransaction } from '../models/WalletTransaction.js'
import { User } from '../models/User.js'

export async function runMonthlyCredits() {
  const cfg = await WalletConfig.findOne({ key: 'global' })
  if (!cfg || cfg.monthlyCredit <= 0) return { skipped: true, reason: 'no credit configured' }

  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (cfg.lastCreditedMonth === month) return { skipped: true, reason: 'already credited this month' }

  const customers = await User.find({ role: 'customer' }).select('phone')
  if (!customers.length) return { skipped: true, reason: 'no customers' }

  const note = `Monthly ZX wallet credit – ${month}`
  const txDocs = customers.map((u) => ({
    phone: u.phone,
    type: 'credit',
    walletType: 'zx',
    amount: cfg.monthlyCredit,
    note,
    at: now,
  }))

  await WalletTransaction.insertMany(txDocs)
  await User.updateMany({ role: 'customer' }, { $inc: { walletBalance: cfg.monthlyCredit } })

  cfg.lastCreditedMonth = month
  await cfg.save()

  return { ok: true, credited: customers.length, amount: cfg.monthlyCredit, month }
}

export function startWalletCron() {
  // Check every hour; actually disburse only on the 1st of each month
  setInterval(async () => {
    const now = new Date()
    if (now.getDate() !== 1) return
    try {
      const result = await runMonthlyCredits()
      if (result.ok) console.log('[wallet-cron] monthly credits disbursed', result)
    } catch (e) {
      console.error('[wallet-cron] error', e.message)
    }
  }, 60 * 60 * 1000)
}
