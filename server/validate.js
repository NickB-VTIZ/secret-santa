// ── Invoervalidatie: pure helpers ──────────────────────────────────
const { normalizeEmail, isValidEmail } = require('./tokens')

const LIMITS = { eventName: 150, description: 2000, wishlist: 2000, message: 1000, name: 150 }
const MIN_PARTICIPANTS_TO_DRAW = 3

function pad(n) { return String(n).padStart(2, '0') }

/** Lokale tijd als 'YYYY-MM-DD HH:MM:SS' (container draait in Europe/Brussels). */
function formatLocalDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function isRealDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** 'YYYY-MM-DD' of null; undefined als de waarde ongeldig is. */
function parseDate(value) {
  if (value === null || value === undefined || value === '') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
  if (!m || !isRealDate(+m[1], +m[2], +m[3])) return undefined
  return value
}

/** Accepteert 'YYYY-MM-DDTHH:MM' (datetime-local) of 'YYYY-MM-DD HH:MM[:SS]'. */
function parseDateTime(value) {
  if (value === null || value === undefined || value === '') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value))
  if (!m) return undefined
  const [y, mo, d, h, mi, s] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)]
  if (!isRealDate(y, mo, d) || h > 23 || mi > 59 || s > 59) return undefined
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${pad(s)}`
}

function parseBudget(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(String(value).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || n > 9999) return undefined
  return Math.round(n * 100) / 100
}

function cleanText(value, max) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

/** Valideert en normaliseert de velden van een event. */
function cleanEventInput(body = {}) {
  const name = cleanText(body.name, LIMITS.eventName)
  if (!name) return { error: 'Geef het event een naam.' }

  const budget = parseBudget(body.budget)
  if (budget === undefined) return { error: 'Ongeldig budget.' }

  const eventDate = parseDate(body.eventDate)
  if (eventDate === undefined) return { error: 'Ongeldige datum (gebruik JJJJ-MM-DD).' }

  const reminderAt = parseDateTime(body.reminderAt)
  if (reminderAt === undefined) return { error: 'Ongeldig herinneringsmoment.' }

  // Functies staan standaard aan; enkel een uitdrukkelijk `false` zet ze uit
  return {
    value: {
      name,
      description: cleanText(body.description, LIMITS.description) || null,
      budget,
      eventDate,
      reminderAt,
      wishlistEnabled: body.wishlistEnabled !== false,
      messagesEnabled: body.messagesEnabled !== false,
    },
  }
}

function cleanMessage(body) {
  const text = cleanText(body, LIMITS.message)
  return text ? { value: text } : { error: 'Schrijf eerst een bericht.' }
}

function cleanWishlist(body) {
  return cleanText(body, LIMITS.wishlist) || null
}

/** "vtiz.be, @school.be" → ['vtiz.be', 'school.be']; leeg = geen beperking. */
function parseAllowedDomains(value) {
  return String(value || '')
    .split(/[,;\s]+/)
    .map(d => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
}

/** Valideert het inschrijfformulier: naam, geldig e-mailadres en uitdrukkelijke toestemming. */
function cleanSignupInput(body = {}, { allowedDomains = [] } = {}) {
  const name = cleanText(body.name, LIMITS.name).replace(/\s+/g, ' ')
  if (!name) return { error: 'Geef je naam op.' }

  const email = normalizeEmail(body.email)
  if (!isValidEmail(email)) return { error: 'Geef een geldig e-mailadres op.' }
  if (email.length > 190) return { error: 'Dit e-mailadres is te lang.' }

  if (allowedDomains.length && !allowedDomains.includes(email.split('@').pop())) {
    return { error: `Gebruik je schooladres (${allowedDomains.map(d => '@' + d).join(', ')}).` }
  }

  if (body.consent !== true) return { error: 'Vink aan dat je akkoord gaat en wil meedoen.' }

  return { value: { name, email } }
}

/** Kan er nu ingeschreven worden? Geeft een foutmelding of null. */
function signupBlocker({ open, drawn }) {
  if (drawn) return 'De trekking is al gedaan. Inschrijven is niet meer mogelijk.'
  if (!open) return 'De inschrijvingen voor dit event zijn gesloten.'
  return null
}

/** Mag er getrokken worden? Geeft een foutmelding of null. */
function drawBlocker({ participantCount, drawn }) {
  if (drawn) return 'De trekking is al gedaan. Herstel ze eerst als je opnieuw wil trekken.'
  if (participantCount < MIN_PARTICIPANTS_TO_DRAW) {
    return `Voeg minstens ${MIN_PARTICIPANTS_TO_DRAW} deelnemers toe voor je trekt.`
  }
  return null
}

module.exports = {
  LIMITS, MIN_PARTICIPANTS_TO_DRAW,
  formatLocalDateTime, parseDate, parseDateTime, parseBudget,
  cleanText, cleanEventInput, cleanMessage, cleanWishlist, drawBlocker,
  parseAllowedDomains, cleanSignupInput, signupBlocker,
}
