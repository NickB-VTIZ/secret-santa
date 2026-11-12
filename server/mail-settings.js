// ── Mailinstellingen uit het beheer: validatie en afzender ─────────
const { normalizeEmail, isValidEmail } = require('./tokens')
const { KINDS, placeholdersOf, findPlaceholders } = require('./mail-templates')

const MAX_NAME = 80
const MAX_EMAIL = 190

const oneLine = s => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()

/** "VTIZ Santa <santa@vtiz.be>" of "santa@vtiz.be" → { name, email } */
function parseAddress(value) {
  const s = String(value || '').trim()
  const m = /^(.*?)<([^<>]+)>$/.exec(s)
  if (m) return { name: m[1].trim().replace(/^"|"$/g, '').trim(), email: normalizeEmail(m[2]) }
  return { name: '', email: normalizeEmail(s) }
}

/**
 * Valideert wat het beheer opstuurt. Bewaart enkel wat afwijkt van de standaard,
 * zodat latere verbeteringen van de standaardteksten nog doorkomen.
 */
function cleanMailSettingsInput(body = {}) {
  const fromName = oneLine(body.fromName)
  if (fromName.length > MAX_NAME) return { error: `De naam van de afzender is te lang (max ${MAX_NAME} tekens).` }
  if (/[<>",;@\\]/.test(fromName)) return { error: 'De naam van de afzender mag geen < > " , ; @ of \\ bevatten.' }

  const fromEmail = normalizeEmail(body.fromEmail)
  if (fromEmail && (!isValidEmail(fromEmail) || fromEmail.length > MAX_EMAIL)) {
    return { error: 'Het e-mailadres van de afzender is ongeldig.' }
  }

  const replyTo = normalizeEmail(body.replyTo)
  if (replyTo && (!isValidEmail(replyTo) || replyTo.length > MAX_EMAIL)) {
    return { error: 'Het antwoordadres is ongeldig.' }
  }

  const input = body.templates && typeof body.templates === 'object' ? body.templates : {}
  const templates = {}

  for (const [kind, def] of Object.entries(KINDS)) {
    const given = input[kind]
    if (!given || typeof given !== 'object') continue
    const allowed = new Set(placeholdersOf(kind).map(p => p.key))

    for (const [key, spec] of Object.entries(def.fields)) {
      if (typeof given[key] !== 'string') continue

      let text = given[key].replace(/\r\n?/g, '\n').trim()
      if (!spec.multiline) text = text.replace(/\s*\n\s*/g, ' ')
      if (!text || text === spec.default) continue

      const where = `"${spec.label}" bij "${def.label}"`
      if (text.length > spec.max) return { error: `${where} is te lang (max ${spec.max} tekens).` }

      const unknown = [...new Set(findPlaceholders(text).filter(k => !allowed.has(k)))]
      if (unknown.length) {
        const list = unknown.map(k => `{{${k}}}`).join(', ')
        const valid = [...allowed].map(k => `{{${k}}}`).join(', ')
        return { error: `Onbekende plaatshouder ${list} in ${where}. Toegestaan: ${valid}.` }
      }

      templates[kind] = { ...templates[kind], [key]: text }
    }
  }

  return { value: { fromName, fromEmail, replyTo, templates } }
}

/** Leest de opgeslagen JSON; gooit nooit, een kapotte rij betekent gewoon standaardinstellingen. */
function parseStored(json) {
  let data
  try { data = JSON.parse(json || '{}') } catch { data = {} }
  if (!data || typeof data !== 'object') data = {}
  const str = v => (typeof v === 'string' ? v : '')
  return {
    fromName: str(data.fromName),
    fromEmail: str(data.fromEmail),
    replyTo: str(data.replyTo),
    templates: data.templates && typeof data.templates === 'object' ? data.templates : {},
  }
}

/** Afzender = instelling uit het beheer, met MAIL_FROM uit de omgeving als terugval per onderdeel. */
function resolveSender(stored = {}, envFrom = '') {
  const env = parseAddress(envFrom)
  const name = oneLine(stored.fromName) || env.name
  const email = normalizeEmail(stored.fromEmail) || env.email
  return {
    name,
    email,
    // Zonder adres geen afzender: de mailer valt dan terug op de standaard uit de omgeving
    from: email ? (name ? `${name} <${email}>` : email) : '',
    replyTo: normalizeEmail(stored.replyTo) || undefined,
  }
}

module.exports = { parseAddress, cleanMailSettingsInput, parseStored, resolveSender }
