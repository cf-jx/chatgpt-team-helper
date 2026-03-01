import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDatabase } from '../database/init.js'
import { getAdminMenuTreeForAccessContext, getUserAccessContext } from '../services/rbac.js'

const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production'
const JWT_ALGORITHM = 'HS256'

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' })
    }

    const db = await getDatabase()
    const identifier = String(username).trim()
    const result = db.exec(
      'SELECT id, username, password, email FROM users WHERE username = ? OR email = ? LIMIT 1',
      [identifier, identifier]
    )

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const user = {
      id: result[0].values[0][0],
      username: result[0].values[0][1],
      password: result[0].values[0][2],
      email: result[0].values[0][3],
    }

    const isPasswordValid = bcrypt.compareSync(password, user.password)

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h', algorithm: JWT_ALGORITHM }
    )

    const access = await getUserAccessContext(user.id, db)
    const adminMenus = await getAdminMenuTreeForAccessContext(access, db)

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: access.roles,
        menus: access.menus,
        adminMenus,
      }
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
