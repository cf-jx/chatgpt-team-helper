import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRoutes from './routes/auth.js'
import gptAccountsRoutes from './routes/gpt-accounts.js'
import configRoutes from './routes/config.js'
import versionRoutes from './routes/version.js'
import adminRoutes from './routes/admin.js'
import { initDatabase } from './database/init.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000
const INSECURE_DEFAULT_JWT_SECRET = 'your-secret-key-change-this-in-production'

const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production'
if (isProduction) {
  const jwtSecret = String(process.env.JWT_SECRET || '').trim()
  if (!jwtSecret || jwtSecret === INSECURE_DEFAULT_JWT_SECRET) {
    console.error('[SECURITY] JWT_SECRET must be set to a strong random value in production')
    process.exit(1)
  }
}

const startServer = () => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
  })
}

// Middleware
app.disable('x-powered-by')

const parseCorsOrigins = () => {
  const raw = String(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '').trim()
  if (!raw) {
    return new Set(['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'])
  }
  return new Set(
    raw
      .split(/[,\s]+/)
      .map(origin => origin.trim())
      .filter(Boolean)
  )
}

const corsOrigins = parseCorsOrigins()
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      return callback(null, corsOrigins.has(origin))
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: false,
    maxAge: 86400
  })
)
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

app.set('etag', false)
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('X-Frame-Options', 'DENY')
  res.set('Referrer-Policy', 'no-referrer')
  next()
})

// Initialize database
initDatabase()
  .then(async () => {
    const dbPath = process.env.DATABASE_PATH || './db/database.sqlite'
    console.log(`Database initialized at: ${dbPath}`)
    startServer()
  })
  .catch(error => {
    console.error('Failed to initialize database:', error)
    startServer()
  })

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/gpt-accounts', gptAccountsRoutes)
app.use('/api/config', configRoutes)
app.use('/api/version', versionRoutes)
app.use('/api/admin', adminRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})
