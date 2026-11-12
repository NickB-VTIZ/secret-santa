// ── Admin-authenticatie: wachtwoorden (scrypt) + JWT ───────────────
const crypto = require('crypto')
const jwt = require('jsonwebtoken')

const MIN_PASSWORD_LENGTH = 10
const TOKEN_TTL = '12h'

function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(String(password), salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length)
  return crypto.timingSafeEqual(actual, expected)
}

/** Tijdelijk wachtwoord zonder dubbelzinnige tekens. */
function generateTempPassword(length = 14) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.randomBytes(length)
  return [...bytes].map(b => alphabet[b % alphabet.length]).join('')
}

function validateNewPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Het wachtwoord moet minstens ${MIN_PASSWORD_LENGTH} tekens bevatten.`
  }
  return null
}

function signToken(admin, secret) {
  return jwt.sign({ sub: admin.id, email: admin.email, role: 'admin' }, secret, { expiresIn: TOKEN_TTL })
}

function verifyToken(token, secret) {
  try {
    const payload = jwt.verify(token, secret)
    return payload.role === 'admin' ? payload : null
  } catch {
    return null
  }
}

function requireAdmin(secret) {
  return (req, res, next) => {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    const payload = token && verifyToken(token, secret)
    if (!payload) return res.status(401).json({ error: 'Niet aangemeld' })
    req.admin = payload
    next()
  }
}

/** Eenvoudige in-memory rate limiter per sleutel (meestal het IP-adres). */
function createRateLimiter({ max, windowMs, now = () => Date.now() }) {
  const hits = new Map()
  return key => {
    const t = now()
    const entry = hits.get(key)
    if (!entry || entry.resetAt <= t) {
      hits.set(key, { count: 1, resetAt: t + windowMs })
      return true
    }
    entry.count++
    return entry.count <= max
  }
}

module.exports = {
  MIN_PASSWORD_LENGTH, hashPassword, verifyPassword, generateTempPassword, validateNewPassword,
  signToken, verifyToken, requireAdmin, createRateLimiter,
}
