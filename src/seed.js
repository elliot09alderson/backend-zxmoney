import { connectDb } from './db.js'
import mongoose from 'mongoose'
import { User } from './models/User.js'
import { Restaurant } from './models/Restaurant.js'
import { Contest } from './models/Contest.js'
import { Winner } from './models/Winner.js'
import { hash } from './lib/hash.js'
import { config } from './config.js'

// Per-account demo passwords so each role is distinguishable.
const DEMO_PASSWORDS = {
  '9999999999': 'super@zx2026',
  '8888888888': 'dragon@zx',
  '7777777777': 'pizza@zx',
  '6666666666': 'spice@zx',
}

export async function seedIfEmpty() {
  const count = await Restaurant.countDocuments()
  if (count > 0) {
    console.log('[seed] skipped — database already has data')
    return
  }

  const hashes = Object.fromEntries(
    await Promise.all(
      Object.entries(DEMO_PASSWORDS).map(async ([p, pw]) => [p, await hash(pw)]),
    ),
  )

  const r1 = await Restaurant.create({
    ownerPhone: '8888888888',
    name: 'Dragon Bowl',
    cuisine: 'Pan-Asian',
    priceRange: '₹₹',
    rating: 4.6,
    discountPct: 20,
    vpa: 'dragonbowl@upi',
    profilePhotoUrl:
      'https://images.unsplash.com/photo-1541557435984-1c79685a082b?w=400&auto=format',
    carousel: [
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=900&auto=format',
      'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=900&auto=format',
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=900&auto=format',
    ],
    status: 'active',
  })

  const r2 = await Restaurant.create({
    ownerPhone: '7777777777',
    name: 'Pizza Cielo',
    cuisine: 'Italian',
    priceRange: '₹₹₹',
    rating: 4.4,
    discountPct: 15,
    vpa: 'pizzacielo@upi',
    profilePhotoUrl:
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&auto=format',
    carousel: [
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=900&auto=format',
      'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=900&auto=format',
    ],
    status: 'active',
  })

  const r3 = await Restaurant.create({
    ownerPhone: '6666666666',
    name: 'Spice Kitchen',
    cuisine: 'North Indian',
    priceRange: '₹₹',
    rating: 4.5,
    discountPct: 25,
    vpa: 'spicekitchen@upi',
    profilePhotoUrl:
      'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&auto=format',
    carousel: [
      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=900&auto=format',
      'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=900&auto=format',
    ],
    status: 'pending',
  })

  await User.create([
    { phone: '8888888888', name: 'Ravi (Dragon Bowl)', role: 'admin', passwordHash: hashes['8888888888'] },
    { phone: '7777777777', name: 'Nila (Pizza Cielo)', role: 'admin', passwordHash: hashes['7777777777'] },
    { phone: '6666666666', name: 'Aman (Spice Kitchen)', role: 'admin', passwordHash: hashes['6666666666'] },
    { phone: config.superPhone, name: 'Super Admin', role: 'super', passwordHash: hashes[config.superPhone] },
  ])

  await Contest.create([
    {
      restaurantId: r1._id,
      title: 'Win a Ray-Ban',
      prize: 'Ray-Ban Aviator sunglasses',
      description: 'Pay with zx.money at Dragon Bowl 3 times this week.',
      image: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800&auto=format',
      endsAt: new Date(Date.now() + 7 * 86400_000),
    },
    {
      restaurantId: r2._id,
      title: 'Free JBL headphones',
      prize: 'JBL Tune 510BT',
      description: 'One lucky winner every month at Pizza Cielo.',
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format',
      endsAt: new Date(Date.now() + 14 * 86400_000),
    },
  ])

  await Winner.create([
    {
      restaurantId: r1._id,
      name: 'Sana M.',
      prize: 'Ray-Ban Aviator',
      photoUrl: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=600&auto=format',
      wonAt: new Date(Date.now() - 3 * 86400_000),
    },
    {
      restaurantId: r2._id,
      name: 'Karan P.',
      prize: 'JBL Headphones',
      photoUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=600&auto=format',
      wonAt: new Date(Date.now() - 10 * 86400_000),
    },
    {
      restaurantId: r1._id,
      name: 'Priya S.',
      prize: '₹1,000 wallet credit',
      photoUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&auto=format',
      wonAt: new Date(Date.now() - 22 * 86400_000),
    },
  ])

  console.log('[seed] inserted demo data. Per-account passwords:')
  for (const [p, pw] of Object.entries(DEMO_PASSWORDS)) console.log(`  ${p} → ${pw}`)
}

// Run directly (node src/seed.js) to wipe+reseed
if (import.meta.url === `file://${process.argv[1]}`) {
  ;(async () => {
    await connectDb()
    await Promise.all([
      User.deleteMany({}),
      Restaurant.deleteMany({}),
      Contest.deleteMany({}),
      Winner.deleteMany({}),
    ])
    console.log('[seed] wiped existing collections')
    await seedIfEmpty()
    await mongoose.disconnect()
    process.exit(0)
  })().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
