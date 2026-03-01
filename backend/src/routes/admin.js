import express from 'express'
import { getDatabase, saveDatabase } from '../database/init.js'
import { authenticateToken } from '../middleware/auth.js'
import { requireSuperAdmin } from '../middleware/rbac.js'
import { upsertSystemConfigValue } from '../utils/system-config.js'
import { getSmtpSettings, getSmtpSettingsFromEnv, invalidateSmtpSettingsCache, parseBool } from '../utils/smtp-settings.js'
import { getTurnstileSettings, getTurnstileSettingsFromEnv, invalidateTurnstileSettingsCache } from '../utils/turnstile-settings.js'

const router = express.Router()

router.use(authenticateToken, requireSuperAdmin)

// GET /settings - return SMTP + Turnstile settings (merged from DB + env fallback)
router.get('/settings', async (req, res) => {
  try {
    const db = await getDatabase()

    const smtpResult = await getSmtpSettings(db, { forceRefresh: true })
    const smtp = smtpResult.smtp || {}

    const turnstileResult = await getTurnstileSettings(db, { forceRefresh: true })

    res.json({
      smtp: {
        host: String(smtp.host || ''),
        port: Number(smtp.port || 0) || 0,
        secure: Boolean(smtp.secure),
        user: String(smtp.user || ''),
        from: String(smtp.from || ''),
        passSet: Boolean(String(smtp.pass || '').trim()),
        passStored: Boolean(smtpResult.stored?.smtpPass)
      },
      adminAlertEmail: String(smtpResult.adminAlertEmail || ''),
      turnstile: {
        siteKey: String(turnstileResult.siteKey || ''),
        siteKeyStored: Boolean(turnstileResult.stored?.siteKey),
        secretSet: Boolean(String(turnstileResult.secretKey || '').trim()),
        secretStored: Boolean(turnstileResult.stored?.secretKey)
      },
      turnstileEnabled: Boolean(turnstileResult.enabled)
    })
  } catch (error) {
    console.error('Get settings error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /settings/smtp - update SMTP settings
router.put('/settings/smtp', async (req, res) => {
  try {
    const smtpPayload = req.body?.smtp && typeof req.body.smtp === 'object' ? req.body.smtp : {}
    const recipientsRaw = req.body?.adminAlertEmail ?? req.body?.recipients ?? ''

    const db = await getDatabase()
    const current = await getSmtpSettings(db, { forceRefresh: true })
    const env = getSmtpSettingsFromEnv()

    const host = String(smtpPayload.host ?? current.smtp.host ?? '').trim()

    const rawPort = smtpPayload.port ?? current.smtp.port
    const port = Number.parseInt(String(rawPort ?? ''), 10)
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      return res.status(400).json({ error: 'Invalid smtp port' })
    }

    const secureRaw = smtpPayload.secure ?? current.smtp.secure
    const secure = typeof secureRaw === 'boolean' ? secureRaw : parseBool(secureRaw, true)

    const user = String(smtpPayload.user ?? current.smtp.user ?? '').trim()

    const passInput = smtpPayload.pass
    const providedPass = typeof passInput === 'string' ? passInput.trim() : ''

    let pass = current.smtp.pass || ''
    let shouldUpsertPass = false
    if (providedPass) {
      pass = providedPass
      shouldUpsertPass = true
    } else if (!current.stored?.smtpPass) {
      const envPass = String(env.smtp.pass || '').trim()
      if (envPass && host && user) {
        pass = envPass
        shouldUpsertPass = true
      }
    }

    const wantsEnable = Boolean(host || user || providedPass)
    if (wantsEnable) {
      if (!host) return res.status(400).json({ error: 'SMTP host is required' })
      if (!user) return res.status(400).json({ error: 'SMTP user is required' })
      if (!String(pass || '').trim()) return res.status(400).json({ error: 'SMTP password is required' })
    }

    const from = String(smtpPayload.from ?? current.smtp.from ?? '').trim()
    const adminAlertEmail = String(recipientsRaw ?? current.adminAlertEmail ?? '').trim()

    upsertSystemConfigValue(db, 'smtp_host', host)
    upsertSystemConfigValue(db, 'smtp_port', String(port))
    upsertSystemConfigValue(db, 'smtp_secure', secure ? 'true' : 'false')
    upsertSystemConfigValue(db, 'smtp_user', user)
    if (shouldUpsertPass) {
      upsertSystemConfigValue(db, 'smtp_pass', pass)
    }
    upsertSystemConfigValue(db, 'smtp_from', from)
    upsertSystemConfigValue(db, 'admin_alert_email', adminAlertEmail)
    saveDatabase()
    invalidateSmtpSettingsCache()

    const updated = await getSmtpSettings(db, { forceRefresh: true })
    const smtp = updated.smtp || {}

    res.json({
      smtp: {
        host: String(smtp.host || ''),
        port: Number(smtp.port || 0) || 0,
        secure: Boolean(smtp.secure),
        user: String(smtp.user || ''),
        from: String(smtp.from || ''),
        passSet: Boolean(String(smtp.pass || '').trim()),
        passStored: Boolean(updated.stored?.smtpPass)
      },
      adminAlertEmail: String(updated.adminAlertEmail || '')
    })
  } catch (error) {
    console.error('Update smtp-settings error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /settings/turnstile - update Turnstile settings
router.put('/settings/turnstile', async (req, res) => {
  try {
    const payload = req.body?.turnstile && typeof req.body.turnstile === 'object' ? req.body.turnstile : (req.body || {})
    const db = await getDatabase()

    const current = await getTurnstileSettings(db, { forceRefresh: true })
    const env = getTurnstileSettingsFromEnv()

    const siteKey = String(payload.siteKey ?? current.siteKey ?? '').trim()

    const secretInput = typeof payload.secretKey === 'string' ? payload.secretKey.trim() : ''
    let secretKey = String(current.secretKey || '').trim()
    let shouldUpsertSecret = false

    if (secretInput) {
      secretKey = secretInput
      shouldUpsertSecret = true
    } else if (!current.stored?.secretKey) {
      const envSecret = String(env.secretKey || '').trim()
      if (envSecret && siteKey) {
        secretKey = envSecret
        shouldUpsertSecret = true
      }
    }

    upsertSystemConfigValue(db, 'turnstile_site_key', siteKey)
    if (shouldUpsertSecret) {
      upsertSystemConfigValue(db, 'turnstile_secret_key', secretKey)
    }

    saveDatabase()
    invalidateTurnstileSettingsCache()

    const updated = await getTurnstileSettings(db, { forceRefresh: true })

    res.json({
      turnstile: {
        siteKey: String(updated.siteKey || ''),
        siteKeyStored: Boolean(updated.stored?.siteKey),
        secretSet: Boolean(String(updated.secretKey || '').trim()),
        secretStored: Boolean(updated.stored?.secretKey)
      },
      enabled: Boolean(updated.enabled)
    })
  } catch (error) {
    console.error('Update turnstile-settings error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
