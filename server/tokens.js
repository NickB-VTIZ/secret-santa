// ── Deelnemertokens: pure helpers ──────────────────────────────────
const crypto = require('crypto')

// Zonder 0/O/1/l om voorlezen en overtypen foutloos te houden
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
const TOKEN_LENGTH = 32

/** Cryptografisch willekeurig token voor de persoonlijke deelnemerlink. */
function generateToken(length = TOKEN_LENGTH, randomBytes = crypto.randomBytes) {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

function isValidToken(token) {
  return typeof token === 'string'
    && token.length === TOKEN_LENGTH
    && [...token].every(c => ALPHABET.includes(c))
}

/** Bouwt de persoonlijke link; faalt nooit op dubbele slashes. */
function participantLink(appUrl, token) {
  const base = String(appUrl || '').replace(/\/+$/, '')
  return `${base}/deelnemer/${token}`
}

// ── Openbare inschrijfcode (één link per event) ────────────────────
const SIGNUP_CODE_LENGTH = 16

function generateSignupCode(randomBytes = crypto.randomBytes) {
  return generateToken(SIGNUP_CODE_LENGTH, randomBytes)
}

function isValidSignupCode(code) {
  return typeof code === 'string'
    && code.length === SIGNUP_CODE_LENGTH
    && [...code].every(c => ALPHABET.includes(c))
}

function signupLink(appUrl, code) {
  const base = String(appUrl || '').replace(/\/+$/, '')
  return `${base}/inschrijven/${code}`
}

/** Timing-veilige vergelijking, zodat tokens niet te raden zijn via responstijd. */
function safeEqual(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  if (x.length !== y.length) return false
  return crypto.timingSafeEqual(x, y)
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))
}

/**
 * Leest deelnemers uit geplakte tekst of CSV.
 * Ondersteunt "Naam;mail", "Naam,mail", "Naam <mail>" en "mail" alleen.
 * Geeft geldige rijen én fouten terug zodat de admin kan corrigeren.
 */
function parseParticipants(text) {
  const rows = []
  const errors = []
  const seen = new Set()

  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)

  for (const [i, line] of lines.entries()) {
    const lineNo = i + 1

    // Kopregel van een CSV overslaan
    if (lineNo === 1 && /^(naam|name)\s*[;,]\s*(e-?mail|email)/i.test(line)) continue

    let name = ''
    let email = ''

    const angle = /^(.*?)<([^>]+)>$/.exec(line)
    if (angle) {
      name = angle[1].trim()
      email = angle[2]
    } else {
      const parts = line.split(/[;,\t]/).map(p => p.trim()).filter(Boolean)
      if (parts.length >= 2) {
        const emailIdx = parts.findIndex(p => isValidEmail(p))
        if (emailIdx === -1) {
          errors.push({ line: lineNo, text: line, error: 'Geen geldig e-mailadres gevonden' })
          continue
        }
        email = parts[emailIdx]
        name = parts.filter((_, idx) => idx !== emailIdx).join(' ').trim()
      } else {
        email = parts[0] || ''
      }
    }

    email = normalizeEmail(email)
    if (!isValidEmail(email)) {
      errors.push({ line: lineNo, text: line, error: 'Geen geldig e-mailadres' })
      continue
    }
    if (seen.has(email)) {
      errors.push({ line: lineNo, text: line, error: 'Dubbel e-mailadres' })
      continue
    }

    if (!name) name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

    seen.add(email)
    rows.push({ name, email })
  }

  return { rows, errors }
}

module.exports = {
  ALPHABET, TOKEN_LENGTH, SIGNUP_CODE_LENGTH,
  generateToken, isValidToken, participantLink, safeEqual,
  generateSignupCode, isValidSignupCode, signupLink,
  normalizeEmail, isValidEmail, parseParticipants,
}
