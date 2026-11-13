require('dotenv').config()

const express = require('express')
const path = require('path')
const fs = require('fs')

const db = require('./db')
const auth = require('./auth')
const { createMailer } = require('./mail')
const templates = require('./mail-templates')
const mailSettings = require('./mail-settings')
const { drawPairs, validatePairs } = require('./draw')
const tokens = require('./tokens')
const v = require('./validate')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const MAIL_DELAY_MS = 600           // Resend: max 2 mails per seconde
const MAX_MESSAGES_PER_THREAD = 100
const MAX_PARTICIPANTS_PER_EVENT = 500

// ── Configuratie ───────────────────────────────────────────────────
const DEFAULT_FROM = process.env.MAIL_FROM || 'VTIZ Secret Santa <status@nbotech.net>'

const mailer = createMailer({
  getConfig: () => ({
    resendApiKey: process.env.RESEND_API_KEY,
    from: DEFAULT_FROM,
    appUrl: process.env.APP_URL,
  }),
})

// Mailinstellingen uit het beheer (afzender + eigen teksten), in het geheugen bewaard
let mailSettingsCache = null

async function getMailSettings() {
  if (!mailSettingsCache) {
    const row = await db.one("SELECT value FROM app_settings WHERE name = 'mail'")
    mailSettingsCache = mailSettings.parseStored(row?.value)
  }
  return mailSettingsCache
}

/** Voegt afzender en antwoordadres uit het beheer toe aan een mail. */
function withSender(message, settings) {
  const { from, replyTo } = mailSettings.resolveSender(settings, DEFAULT_FROM)
  return { ...message, ...(from ? { from } : {}), ...(replyTo ? { replyTo } : {}) }
}

const idParam = value => {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

// ── Mailjobs op de achtergrond (één per event tegelijk) ────────────
const jobs = new Map()

function startMailJob(eventId, kind, items) {
  if (jobs.get(eventId)?.running) return null
  const job = { kind, running: true, total: items.length, sent: 0, failed: 0, skipped: 0 }
  jobs.set(eventId, job)

  ;(async () => {
    for (const [i, item] of items.entries()) {
      const r = await mailer.send(item.message)
      if (r.ok) {
        job.sent++
        if (kind === 'invite') {
          await db.query('UPDATE participants SET invited_at = ? WHERE id = ?', [v.formatLocalDateTime(new Date()), item.participantId]).catch(() => {})
        }
      } else if (r.skipped) job.skipped++
      else job.failed++
      if (i < items.length - 1) await sleep(MAIL_DELAY_MS)
    }
    job.running = false
  })().catch(e => {
    console.error(`[Mail] job ${kind} voor event ${eventId} afgebroken: ${e.message}`)
    job.failed = job.total - job.sent - job.skipped
    job.running = false
  })

  return job
}

// ── DTO's ──────────────────────────────────────────────────────────
// Functies staan standaard aan (ook als de kolom ontbreekt of NULL is)
const flagOn = value => value === undefined || value === null ? true : !!Number(value)
const money = value => (value === null || value === undefined ? null : Number(value))

const eventDto = e => ({
  id: e.id,
  name: e.name,
  description: e.description,
  budgetMin: money(e.budget_min),
  budgetMax: money(e.budget),
  eventDate: e.event_date,
  reminderAt: e.reminder_at ? e.reminder_at.slice(0, 16).replace(' ', 'T') : null,
  reminderSentAt: e.reminder_sent_at,
  drawnAt: e.drawn_at,
  signupOpen: !!e.signup_open && !!e.signup_code,
  wishlistEnabled: flagOn(e.wishlist_enabled),
  messagesEnabled: flagOn(e.messages_enabled),
})

// De admin ziet bewust géén tokens, wishlists of koppels: de trekking blijft geheim
const participantDto = p => ({
  id: p.id,
  name: p.name,
  email: p.email,
  invitedAt: p.invited_at,
  lastSeenAt: p.last_seen_at,
  hasWishlist: !!(p.wishlist && p.wishlist.trim()),
})

// ── Mails opbouwen ─────────────────────────────────────────────────
function buildMails(kind, event, participants, baseUrl, settings = {}, extra = {}) {
  return participants.map(p => {
    const link = tokens.participantLink(baseUrl, p.token)
    const ctx = {
      participant: p, event, link, custom: settings.templates?.[kind],
      wishlistEnabled: flagOn(event.wishlist_enabled),
    }
    let message
    if (kind === 'invite') message = templates.invite(ctx)
    else if (kind === 'drawn') message = templates.drawn(ctx)
    else message = templates.reminder({ ...ctx, isDrawn: !!event.drawn_at, hasWishlist: !!(p.wishlist && p.wishlist.trim()), ...extra })
    return { participantId: p.id, message: withSender({ to: p.email, ...message }, settings) }
  })
}

// ── App ────────────────────────────────────────────────────────────
function createApp() {
  const JWT_SECRET = process.env.JWT_SECRET
  const app = express()
  const h = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
  const admin = auth.requireAdmin(JWT_SECRET)

  const loginLimiter = auth.createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 })
  const publicLimiter = auth.createRateLimiter({ max: 120, windowMs: 60 * 1000 })
  // Ruim genoeg voor een heel schoolnetwerk achter één IP, krap genoeg tegen spam
  const signupLimiter = auth.createRateLimiter({ max: 60, windowMs: 15 * 60 * 1000 })

  app.set('trust proxy', 'loopback, linklocal, uniquelocal')
  app.disable('x-powered-by')
  app.use(express.json({ limit: '200kb' }))

  // De token staat in de URL: nooit cachen en nooit doorgeven via de referrer
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Frame-Options', 'DENY')
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store')
    next()
  })

  const baseUrl = req => mailer.appUrl() || `${req.protocol}://${req.get('host')}`

  app.get('/api/health', h(async (req, res) => {
    await db.pool.query('SELECT 1')
    res.json({ ok: true })
  }))

  // ════════════════════ Admin: aanmelden ════════════════════
  app.post('/api/admin/login', h(async (req, res) => {
    if (!loginLimiter(req.ip)) return res.status(429).json({ error: 'Te veel pogingen. Probeer het later opnieuw.' })

    const email = tokens.normalizeEmail(req.body?.email)
    const row = await db.one('SELECT * FROM admins WHERE email = ?', [email])
    // Altijd een hash berekenen, zodat de responstijd niets verraadt over bestaande accounts
    const ok = auth.verifyPassword(String(req.body?.password ?? ''), row?.password_hash || auth.hashPassword('dummy'))
    if (!row || !ok) return res.status(401).json({ error: 'Onjuiste gegevens' })

    res.json({ token: auth.signToken(row, JWT_SECRET), email: row.email, mustChangePassword: !!row.must_change_password })
  }))

  app.get('/api/admin/me', admin, h(async (req, res) => {
    const row = await db.one('SELECT id, email, must_change_password FROM admins WHERE id = ?', [req.admin.sub])
    if (!row) return res.status(401).json({ error: 'Niet aangemeld' })
    res.json({ email: row.email, mustChangePassword: !!row.must_change_password, mailConfigured: mailer.configured() })
  }))

  app.post('/api/admin/password', admin, h(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {}
    const row = await db.one('SELECT * FROM admins WHERE id = ?', [req.admin.sub])
    if (!row || !auth.verifyPassword(String(currentPassword ?? ''), row.password_hash)) {
      return res.status(403).json({ error: 'Huidig wachtwoord klopt niet' })
    }
    const problem = auth.validateNewPassword(newPassword)
    if (problem) return res.status(400).json({ error: problem })
    if (newPassword === currentPassword) return res.status(400).json({ error: 'Kies een ander wachtwoord dan het huidige.' })

    await db.query('UPDATE admins SET password_hash = ?, must_change_password = 0 WHERE id = ?', [auth.hashPassword(newPassword), row.id])
    res.json({ ok: true })
  }))

  // ════════════════════ Admin: events ════════════════════
  app.get('/api/admin/events', admin, h(async (req, res) => {
    const rows = await db.query(
      `SELECT e.*,
              (SELECT COUNT(*) FROM participants p WHERE p.event_id = e.id) AS participant_count,
              (SELECT COUNT(*) FROM participants p WHERE p.event_id = e.id AND p.invited_at IS NOT NULL) AS invited_count
         FROM events e ORDER BY e.created_at DESC`)
    res.json(rows.map(r => ({ ...eventDto(r), participantCount: Number(r.participant_count), invitedCount: Number(r.invited_count) })))
  }))

  app.post('/api/admin/events', admin, h(async (req, res) => {
    const { value, error } = v.cleanEventInput(req.body)
    if (error) return res.status(400).json({ error })
    const r = await db.query(
      'INSERT INTO events (name, description, budget_min, budget, event_date, reminder_at, wishlist_enabled, messages_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [value.name, value.description, value.budgetMin, value.budgetMax, value.eventDate, value.reminderAt, value.wishlistEnabled ? 1 : 0, value.messagesEnabled ? 1 : 0])
    res.status(201).json({ id: r.insertId })
  }))

  app.get('/api/admin/events/:id', admin, h(async (req, res) => {
    const id = idParam(req.params.id)
    const event = id && await db.one('SELECT * FROM events WHERE id = ?', [id])
    if (!event) return res.status(404).json({ error: 'Event niet gevonden' })

    const participants = await db.query('SELECT id, name, email, wishlist, invited_at, last_seen_at FROM participants WHERE event_id = ? ORDER BY name', [id])
    const exclusions = await db.query('SELECT id, a_id, b_id FROM exclusions WHERE event_id = ?', [id])
    const job = jobs.get(id)

    res.json({
      event: eventDto(event),
      signup: {
        open: !!event.signup_open && !!event.signup_code,
        hasLink: !!event.signup_code,
        link: event.signup_code ? tokens.signupLink(baseUrl(req), event.signup_code) : null,
      },
      participants: participants.map(participantDto),
      exclusions: exclusions.map(x => ({ id: x.id, aId: x.a_id, bId: x.b_id })),
      mailing: job ? { kind: job.kind, running: job.running, total: job.total, sent: job.sent, failed: job.failed, skipped: job.skipped } : null,
      mailConfigured: mailer.configured(),
    })
  }))

  app.put('/api/admin/events/:id', admin, h(async (req, res) => {
    const id = idParam(req.params.id)
    const event = id && await db.one('SELECT * FROM events WHERE id = ?', [id])
    if (!event) return res.status(404).json({ error: 'Event niet gevonden' })

    const { value, error } = v.cleanEventInput(req.body)
    if (error) return res.status(400).json({ error })

    // Nieuw herinneringsmoment = herinnering opnieuw inplannen
    const oldReminder = event.reminder_at
    const reminderChanged = (oldReminder || null) !== (value.reminderAt || null)
    await db.query(
      `UPDATE events SET name = ?, description = ?, budget_min = ?, budget = ?, event_date = ?, reminder_at = ?,
              wishlist_enabled = ?, messages_enabled = ?,
              reminder_sent_at = ${reminderChanged ? 'NULL' : 'reminder_sent_at'} WHERE id = ?`,
      [value.name, value.description, value.budgetMin, value.budgetMax, value.eventDate, value.reminderAt,
        value.wishlistEnabled ? 1 : 0, value.messagesEnabled ? 1 : 0, id])
    res.json({ ok: true })
  }))

  app.delete('/api/admin/events/:id', admin, h(async (req, res) => {
    const id = idParam(req.params.id)
    if (!id) return res.status(404).json({ error: 'Event niet gevonden' })
    await db.query('DELETE FROM events WHERE id = ?', [id])
    jobs.delete(id)
    res.json({ ok: true })
  }))

  // ════════════════════ Admin: deelnemers ════════════════════
  async function loadEvent(req, res) {
    const id = idParam(req.params.id)
    const event = id && await db.one('SELECT * FROM events WHERE id = ?', [id])
    if (!event) { res.status(404).json({ error: 'Event niet gevonden' }); return null }
    return event
  }

  // Unieke code voor de openbare inschrijflink (opnieuw proberen bij een botsing)
  async function assignSignupCode(eventId, { open }) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await db.query('UPDATE events SET signup_code = ?, signup_open = ? WHERE id = ?', [tokens.generateSignupCode(), open ? 1 : 0, eventId])
        return
      } catch (e) {
        if (e.code !== 'ER_DUP_ENTRY') throw e
      }
    }
    throw new Error('Geen unieke inschrijfcode gevonden')
  }

  // ════════════════════ Admin: openbare inschrijflink ════════════════════
  // Link aan/uit zetten; de eerste keer wordt de code aangemaakt
  app.put('/api/admin/events/:id/signup', admin, h(async (req, res) => {
    const event = await loadEvent(req, res)
    if (!event) return
    const open = req.body?.open === true

    if (open && event.drawn_at) return res.status(409).json({ error: 'De trekking is al gedaan. Inschrijven is niet meer mogelijk.' })

    if (!event.signup_code) await assignSignupCode(event.id, { open })
    else await db.query('UPDATE events SET signup_open = ? WHERE id = ?', [open ? 1 : 0, event.id])
    res.json({ ok: true })
  }))

  // Nieuwe link: de oude werkt meteen niet meer (bv. als hij ongewenst gedeeld werd)
  app.post('/api/admin/events/:id/signup/renew', admin, h(async (req, res) => {
    const event = await loadEvent(req, res)
    if (!event) return
    await assignSignupCode(event.id, { open: !!event.signup_open && !event.drawn_at })
    res.json({ ok: true })
  }))

  app.post('/api/admin/events/:id/participants', admin, h(async (req, res) => {
    const event = await loadEvent(req, res)
    if (!event) return
    if (event.drawn_at) return res.status(409).json({ error: 'De trekking is al gedaan. Herstel ze eerst om deelnemers te wijzigen.' })

    // Ofwel één deelnemer { name, email }, ofwel geplakte tekst/CSV { text }
    let rows, errors = []
    if (typeof req.body?.text === 'string') {
      ({ rows, errors } = tokens.parseParticipants(req.body.text))
    } else {
      const email = tokens.normalizeEmail(req.body?.email)
      if (!tokens.isValidEmail(email)) return res.status(400).json({ error: 'Geef een geldig e-mailadres op.' })
      const name = v.cleanText(req.body?.name, v.LIMITS.name) || email.split('@')[0]
      rows = [{ name, email }]
    }

    const existing = new Set((await db.query('SELECT email FROM participants WHERE event_id = ?', [event.id])).map(p => p.email))
    const added = []
    const skipped = []
    for (const row of rows) {
      if (existing.has(row.email)) { skipped.push(row.email); continue }
      await db.query('INSERT INTO participants (event_id, name, email, token) VALUES (?, ?, ?, ?)',
        [event.id, v.cleanText(row.name, v.LIMITS.name), row.email, tokens.generateToken()])
      existing.add(row.email)
      added.push(row.email)
    }
    res.status(201).json({ added: added.length, skipped, errors })
  }))

  app.put('/api/admin/events/:id/participants/:pid', admin, h(async (req, res) => {
    const event = await loadEvent(req, res)
    if (!event) return
    const pid = idParam(req.params.pid)
    const email = tokens.normalizeEmail(req.body?.email)
    const name = v.cleanText(req.body?.name, v.LIMITS.name)
    if (!name || !tokens.isValidEmail(email)) return res.status(400).json({ error: 'Naam en een geldig e-mailadres zijn verplicht.' })

    const clash = await db.one('SELECT id FROM participants WHERE event_id = ? AND email = ? AND id <> ?', [event.id, email, pid])
    if (clash) return res.status(409).json({ error: 'Dit e-mailadres staat al in het event.' })

    const r = await db.query('UPDATE participants SET name = ?, email = ? WHERE id = ? AND event_id = ?', [name, email, pid, event.id])
    if (!r.affectedRows) return res.status(404).json({ error: 'Deelnemer niet gevonden' })
    res.json({ ok: true })
  }))

  app.delete('/api/admin/events/:id/participants/:pid', admin, h(async (req, res) => {
    const event = await loadEvent(req, res)
    if (!event) return
    if (event.drawn_at) return res.status(409).json({ error: 'De trekking is al gedaan. Herstel ze eerst om deelnemers te verwijderen.' })
    const r = await db.query('DELETE FROM participants WHERE id = ? AND event_id = ?', [idParam(req.params.pid), event.id])
    if (!r.affectedRows) return res.status(404).json({ error: 'Deelnemer niet gevonden' })
    res.json({ ok: true })
  }))

  // ════════════════════ Admin: uitsluitingen ════════════════════
  app.post('/api/admin/events/:id/exclusions', admin, h(async (req, res) => {
    const event = await loadEvent(req, res)
    if (!event) return
    if (event.drawn_at) return res.status(409).json({ error: 'De trekking is al gedaan. Herstel ze eerst om uitsluitingen te wijzigen.' })

    const a = idParam(req.body?.aId)
    const b = idParam(req.body?.bId)
    if (!a || !b || a === b) return res.status(400).json({ error: 'Kies twee verschillende deelnemers.' })

    const found = await db.query('SELECT id FROM participants WHERE event_id = ? AND id IN (?, ?)', [event.id, a, b])
    if (found.length !== 2) return res.status(400).json({ error: 'Onbekende deelnemer.' })

    const [lo, hi] = a < b ? [a, b] : [b, a]    // een uitsluiting geldt in beide richtingen
    try {
      await db.query('INSERT INTO exclusions (event_id, a_id, b_id) VALUES (?, ?, ?)', [event.id, lo, hi])
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Deze uitsluiting bestaat al.' })
      throw e
    }
    res.status(201).json({ ok: true })
  }))

  app.delete('/api/admin/events/:id/exclusions/:xid', admin, h(async (req, res) => {
    const event = await loadEvent(req, res)
    if (!event) return
    if (event.drawn_at) return res.status(409).json({ error: 'De trekking is al gedaan. Herstel ze eerst om uitsluitingen te wijzigen.' })
    await db.query('DELETE FROM exclusions WHERE id = ? AND event_id = ?', [idParam(req.params.xid), event.id])
    res.json({ ok: true })
  }))

  // ════════════════════ Admin: uitnodigen, trekken, herinneren ════════════════════
  app.post('/api/admin/events/:id/invite', admin, h(async (req, res) => {
    const event = await loadEvent(req, res)
    if (!event) return
    if (jobs.get(event.id)?.running) return res.status(409).json({ error: 'Er worden al mails verstuurd voor dit event.' })

    let participants
    const single = idParam(req.body?.participantId)
    if (single) {
      participants = await db.query('SELECT * FROM participants WHERE id = ? AND event_id = ?', [single, event.id])
    } else if (req.body?.all) {
      participants = await db.query('SELECT * FROM participants WHERE event_id = ?', [event.id])
    } else {
      participants = await db.query('SELECT * FROM participants WHERE event_id = ? AND invited_at IS NULL', [event.id])
    }
    if (!participants.length) return res.status(400).json({ error: 'Er zijn geen deelnemers om uit te nodigen.' })

    const job = startMailJob(event.id, 'invite', buildMails('invite', event, participants, baseUrl(req), await getMailSettings()))
    res.json({ ok: true, total: job.total })
  }))

  // Eén persoon opnieuw mailen: uitnodiging of trekkingsmail (beide bevatten enkel de persoonlijke link, nooit de koppel)
  app.post('/api/admin/events/:id/participants/:pid/send', admin, h(async (req, res) => {
    const event = await loadEvent(req, res)
    if (!event) return
    const kind = req.body?.kind
    if (kind !== 'invite' && kind !== 'drawn') return res.status(400).json({ error: 'Onbekend soort mail.' })
    if (kind === 'drawn' && !event.drawn_at) return res.status(409).json({ error: 'Er is nog niet getrokken.' })
    if (jobs.get(event.id)?.running) return res.status(409).json({ error: 'Er worden al mails verstuurd voor dit event.' })

    const pid = idParam(req.params.pid)
    const participant = pid && await db.one('SELECT * FROM participants WHERE id = ? AND event_id = ?', [pid, event.id])
    if (!participant) return res.status(404).json({ error: 'Deelnemer niet gevonden' })

    const job = startMailJob(event.id, kind, buildMails(kind, event, [participant], baseUrl(req), await getMailSettings()))
    if (!job) return res.status(409).json({ error: 'Er worden al mails verstuurd voor dit event.' })
    res.json({ ok: true, total: job.total })
  }))

  app.post('/api/admin/events/:id/draw', admin, h(async (req, res) => {
    const id = idParam(req.params.id)
    if (!id) return res.status(404).json({ error: 'Event niet gevonden' })
    if (jobs.get(id)?.running) return res.status(409).json({ error: 'Er worden nog mails verstuurd voor dit event.' })

    const result = await db.transaction(async tx => {
      const [event] = await tx.query('SELECT * FROM events WHERE id = ? FOR UPDATE', [id])
      if (!event) return { status: 404, error: 'Event niet gevonden' }

      const participants = await tx.query('SELECT * FROM participants WHERE event_id = ?', [id])
      const blocker = v.drawBlocker({ participantCount: participants.length, drawn: !!event.drawn_at })
      if (blocker) return { status: 409, error: blocker }

      const exclusions = (await tx.query('SELECT a_id, b_id FROM exclusions WHERE event_id = ?', [id]))
        .map(x => ({ giverId: x.a_id, receiverId: x.b_id }))
      const ids = participants.map(p => p.id)

      const draw = drawPairs(ids, exclusions)
      if (!draw.ok) return { status: 422, error: draw.error }

      const check = validatePairs(draw.pairs, ids, exclusions)
      if (!check.ok) throw new Error(`Trekking ongeldig: ${check.error}`)

      for (const p of draw.pairs) {
        await tx.query('INSERT INTO assignments (event_id, giver_id, receiver_id) VALUES (?, ?, ?)', [id, p.giverId, p.receiverId])
      }
      const drawnAt = v.formatLocalDateTime(new Date())
      await tx.query('UPDATE events SET drawn_at = ? WHERE id = ?', [drawnAt, id])
      return { event: { ...event, drawn_at: drawnAt }, participants }
    })

    if (result.error) return res.status(result.status).json({ error: result.error })

    // Mails gaan op de achtergrond; de koppels zelf worden nergens aan de admin getoond
    startMailJob(id, 'drawn', buildMails('drawn', result.event, result.participants, baseUrl(req), await getMailSettings()))
    res.json({ ok: true })
  }))

  app.post('/api/admin/events/:id/reset-draw', admin, h(async (req, res) => {
    const event = await loadEvent(req, res)
    if (!event) return
    if (!event.drawn_at) return res.status(409).json({ error: 'Er is nog niet getrokken.' })

    // Cascade verwijdert koppels en anonieme berichten
    await db.transaction(async tx => {
      await tx.query('DELETE FROM assignments WHERE event_id = ?', [event.id])
      await tx.query('UPDATE events SET drawn_at = NULL WHERE id = ?', [event.id])
    })
    jobs.delete(event.id)
    res.json({ ok: true })
  }))

  app.post('/api/admin/events/:id/reminders', admin, h(async (req, res) => {
    const event = await loadEvent(req, res)
    if (!event) return
    if (jobs.get(event.id)?.running) return res.status(409).json({ error: 'Er worden al mails verstuurd voor dit event.' })

    const participants = await db.query('SELECT * FROM participants WHERE event_id = ?', [event.id])
    if (!participants.length) return res.status(400).json({ error: 'Er zijn geen deelnemers.' })

    const job = startMailJob(event.id, 'reminder', buildMails('reminder', event, participants, baseUrl(req), await getMailSettings()))
    res.json({ ok: true, total: job.total })
  }))

  // ════════════════════ Admin: mailinstellingen ════════════════════
  // Afzender, antwoordadres en teksten per soort mail
  app.get('/api/admin/mail-settings', admin, h(async (req, res) => {
    const stored = await getMailSettings()
    const env = mailSettings.parseAddress(DEFAULT_FROM)
    res.json({
      fromName: stored.fromName,
      fromEmail: stored.fromEmail,
      replyTo: stored.replyTo,
      templates: stored.templates,
      defaults: { fromName: env.name, fromEmail: env.email },
      kinds: templates.describeKinds(),
      mailConfigured: mailer.configured(),
    })
  }))

  app.put('/api/admin/mail-settings', admin, h(async (req, res) => {
    const { value, error } = mailSettings.cleanMailSettingsInput(req.body)
    if (error) return res.status(400).json({ error })
    await db.query(
      "INSERT INTO app_settings (name, value) VALUES ('mail', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      [JSON.stringify(value)])
    mailSettingsCache = mailSettings.parseStored(JSON.stringify(value))
    res.json({ ok: true })
  }))

  // Voorbeeld van een mail met de (nog niet bewaarde) teksten uit het formulier
  app.post('/api/admin/mail-settings/preview', admin, h(async (req, res) => {
    const { value, error } = mailSettings.cleanMailSettingsInput(req.body)
    if (error) return res.status(400).json({ error })
    const kind = String(req.body?.kind || '')
    const sample = templates.renderSample(kind, value.templates[kind], req.body?.variant)
    if (!sample) return res.status(400).json({ error: 'Onbekend soort mail.' })
    res.json({ subject: sample.subject, html: sample.html, from: mailSettings.resolveSender(value, DEFAULT_FROM).from || DEFAULT_FROM })
  }))

  // Testmail naar de aangemelde beheerder, met de instellingen uit het formulier
  app.post('/api/admin/mail-settings/test', admin, h(async (req, res) => {
    const { value, error } = mailSettings.cleanMailSettingsInput(req.body)
    if (error) return res.status(400).json({ error })
    if (!mailer.configured()) return res.status(409).json({ error: 'RESEND_API_KEY is niet ingesteld.' })

    const kind = String(req.body?.kind || '')
    const sample = templates.renderSample(kind, value.templates[kind], req.body?.variant)
    if (!sample) return res.status(400).json({ error: 'Onbekend soort mail.' })

    const me = await db.one('SELECT email FROM admins WHERE id = ?', [req.admin.sub])
    if (!me) return res.status(401).json({ error: 'Niet aangemeld' })

    const r = await mailer.send(withSender({ to: me.email, ...sample, subject: `[Test] ${sample.subject}` }, value))
    if (!r.ok) return res.status(502).json({ error: `Verzenden mislukt: ${r.error || 'onbekende fout'}` })
    res.json({ ok: true, to: me.email })
  }))

  // ════════════════════ Openbaar: zelf inschrijven via de gedeelde link ════════════════════
  async function eventFromSignupCode(req, res) {
    if (!publicLimiter(req.ip)) { res.status(429).json({ error: 'Te veel aanvragen. Probeer zo meteen opnieuw.' }); return null }
    const code = req.params.code
    // Altijd dezelfde 404, zodat niemand codes kan aftasten
    if (!tokens.isValidSignupCode(code)) { res.status(404).json({ error: 'Deze link is niet geldig.' }); return null }
    const event = await db.one('SELECT * FROM events WHERE signup_code = ?', [code])
    if (!event) { res.status(404).json({ error: 'Deze link is niet geldig.' }); return null }
    return event
  }

  app.get('/api/signup/:code', h(async (req, res) => {
    const event = await eventFromSignupCode(req, res)
    if (!event) return
    const blocker = v.signupBlocker({ open: !!event.signup_open, drawn: !!event.drawn_at })
    res.json({
      event: {
        name: event.name,
        description: event.description,
        budgetMin: money(event.budget_min),
        budgetMax: money(event.budget),
        eventDate: event.event_date,
      },
      open: !blocker,
      closedReason: blocker,
    })
  }))

  app.post('/api/signup/:code', h(async (req, res) => {
    const event = await eventFromSignupCode(req, res)
    if (!event) return
    if (!signupLimiter(req.ip)) return res.status(429).json({ error: 'Te veel pogingen. Probeer het over een kwartier opnieuw.' })

    // Verborgen veld dat alleen bots invullen: stil "gelukt" antwoorden zonder iets op te slaan
    if (req.body?.website) return res.status(201).json({ ok: true })

    const { value, error } = v.cleanSignupInput(req.body, { allowedDomains: v.parseAllowedDomains(process.env.SIGNUP_ALLOWED_DOMAINS) })
    if (error) return res.status(400).json({ error })

    // Zelfde slot als de trekking, zodat niemand nog binnenglipt tijdens het trekken
    const result = await db.transaction(async tx => {
      const [fresh] = await tx.query('SELECT * FROM events WHERE id = ? FOR UPDATE', [event.id])
      const blocker = fresh && v.signupBlocker({ open: !!fresh.signup_open && fresh.signup_code === event.signup_code, drawn: !!fresh.drawn_at })
      if (!fresh) return { status: 404, error: 'Deze link is niet geldig.' }
      if (blocker) return { status: 409, error: blocker }

      const [existing] = await tx.query('SELECT * FROM participants WHERE event_id = ? AND email = ?', [event.id, value.email])
      if (existing) return { participant: existing, isNew: false, event: fresh }

      const [{ n }] = await tx.query('SELECT COUNT(*) AS n FROM participants WHERE event_id = ?', [event.id])
      if (Number(n) >= MAX_PARTICIPANTS_PER_EVENT) return { status: 409, error: 'Het maximum aantal deelnemers is bereikt.' }

      const now = v.formatLocalDateTime(new Date())
      const token = tokens.generateToken()
      await tx.query('INSERT INTO participants (event_id, name, email, token, consented_at) VALUES (?, ?, ?, ?, ?)',
        [event.id, value.name, value.email, token, now])
      return { participant: { name: value.name, email: value.email, token }, isNew: true, event: fresh }
    })

    if (result.error) return res.status(result.status).json({ error: result.error })

    // Altijd hetzelfde antwoord: zo lekt de pagina niet wie al deelneemt.
    // Wie zich opnieuw inschrijft, krijgt gewoon zijn persoonlijke link nog eens.
    const link = tokens.participantLink(baseUrl(req), result.participant.token)
    const settings = await getMailSettings()
    const message = templates.signup({
      participant: result.participant, event: result.event, link, custom: settings.templates?.signup,
      wishlistEnabled: flagOn(result.event.wishlist_enabled),
    })
    mailer.send(withSender({ to: result.participant.email, ...message }, settings))
      .then(async r => {
        if (r.ok && result.isNew) {
          await db.query('UPDATE participants SET invited_at = ? WHERE event_id = ? AND email = ?',
            [v.formatLocalDateTime(new Date()), event.id, result.participant.email])
        }
      })
      .catch(() => {})

    res.status(201).json({ ok: true, mailSent: mailer.configured() })
  }))

  // ════════════════════ Deelnemer: persoonlijke pagina (via token) ════════════════════
  async function participantFromToken(req, res) {
    if (!publicLimiter(req.ip)) { res.status(429).json({ error: 'Te veel aanvragen. Probeer zo meteen opnieuw.' }); return null }
    const token = req.params.token
    // Altijd dezelfde 404, zodat niemand kan afleiden of een token "bijna" klopt
    if (!tokens.isValidToken(token)) { res.status(404).json({ error: 'Deze link is niet geldig.' }); return null }
    const me = await db.one(
      `SELECT p.*, e.name AS event_name, e.description AS event_description,
              e.budget AS event_budget, e.budget_min AS event_budget_min,
              e.event_date AS event_date, e.drawn_at AS event_drawn_at,
              e.wishlist_enabled AS event_wishlist_enabled, e.messages_enabled AS event_messages_enabled
         FROM participants p JOIN events e ON e.id = p.event_id WHERE p.token = ?`, [token])
    if (!me) { res.status(404).json({ error: 'Deze link is niet geldig.' }); return null }
    return me
  }

  const threadDto = (rows, myRole) => rows.map(m => ({
    id: m.id, mine: m.sender_role === myRole, body: m.body, createdAt: m.created_at, isNew: m.sender_role !== myRole && !m.read_at,
  }))

  app.get('/api/me/:token', h(async (req, res) => {
    const me = await participantFromToken(req, res)
    if (!me) return

    await db.query('UPDATE participants SET last_seen_at = ? WHERE id = ?', [v.formatLocalDateTime(new Date()), me.id])

    const wishlistEnabled = flagOn(me.event_wishlist_enabled)
    const messagesEnabled = flagOn(me.event_messages_enabled)

    const out = {
      name: me.name,
      wishlist: wishlistEnabled ? (me.wishlist || '') : '',
      event: {
        name: me.event_name,
        description: me.event_description,
        budgetMin: money(me.event_budget_min),
        budgetMax: money(me.event_budget),
        eventDate: me.event_date,
        drawn: !!me.event_drawn_at,
        wishlistEnabled,
        messagesEnabled,
      },
      receiver: null,
      toReceiver: [],
      fromGiver: [],
    }

    if (me.event_drawn_at) {
      const asGiver = await db.one(
        `SELECT a.id, r.name, r.wishlist FROM assignments a JOIN participants r ON r.id = a.receiver_id WHERE a.giver_id = ?`, [me.id])
      const asReceiver = await db.one('SELECT id FROM assignments WHERE receiver_id = ?', [me.id])

      if (asGiver) {
        out.receiver = { name: asGiver.name, wishlist: wishlistEnabled ? (asGiver.wishlist || '') : '' }
        if (messagesEnabled) {
          const rows = await db.query('SELECT * FROM messages WHERE assignment_id = ? ORDER BY id', [asGiver.id])
          out.toReceiver = threadDto(rows, 'giver')
          await db.query("UPDATE messages SET read_at = ? WHERE assignment_id = ? AND sender_role = 'receiver' AND read_at IS NULL", [v.formatLocalDateTime(new Date()), asGiver.id])
        }
      }
      if (asReceiver && messagesEnabled) {
        const rows = await db.query('SELECT * FROM messages WHERE assignment_id = ? ORDER BY id', [asReceiver.id])
        out.fromGiver = threadDto(rows, 'receiver')
        await db.query("UPDATE messages SET read_at = ? WHERE assignment_id = ? AND sender_role = 'giver' AND read_at IS NULL", [v.formatLocalDateTime(new Date()), asReceiver.id])
      }
    }
    res.json(out)
  }))

  app.put('/api/me/:token/wishlist', h(async (req, res) => {
    const me = await participantFromToken(req, res)
    if (!me) return
    if (!flagOn(me.event_wishlist_enabled)) return res.status(409).json({ error: 'Het verlanglijstje is uitgeschakeld voor dit event.' })
    await db.query('UPDATE participants SET wishlist = ? WHERE id = ?', [v.cleanWishlist(req.body?.wishlist), me.id])
    res.json({ ok: true })
  }))

  // Anoniem bericht: 'receiver' = aan wie ik een cadeau geef, 'giver' = aan mijn Secret Santa
  app.post('/api/me/:token/messages', h(async (req, res) => {
    const me = await participantFromToken(req, res)
    if (!me) return
    if (!flagOn(me.event_messages_enabled)) return res.status(409).json({ error: 'Anonieme berichten zijn uitgeschakeld voor dit event.' })
    if (!me.event_drawn_at) return res.status(409).json({ error: 'Berichten kunnen pas na de trekking.' })

    const { value: body, error } = v.cleanMessage(req.body?.body)
    if (error) return res.status(400).json({ error })

    const to = req.body?.to
    if (to !== 'receiver' && to !== 'giver') return res.status(400).json({ error: 'Onbekende ontvanger.' })

    const assignment = to === 'receiver'
      ? await db.one('SELECT id, receiver_id AS other_id FROM assignments WHERE giver_id = ?', [me.id])
      : await db.one('SELECT id, giver_id AS other_id FROM assignments WHERE receiver_id = ?', [me.id])
    if (!assignment) return res.status(404).json({ error: 'Geen koppeling gevonden.' })

    const { n } = await db.one('SELECT COUNT(*) AS n FROM messages WHERE assignment_id = ?', [assignment.id])
    if (Number(n) >= MAX_MESSAGES_PER_THREAD) return res.status(429).json({ error: 'Het maximum aantal berichten is bereikt.' })

    const senderRole = to === 'receiver' ? 'giver' : 'receiver'

    // Meldingen worden gebundeld: zolang de ontvanger een eerder bericht van deze afzender
    // nog niet las, is er al een melding onderweg en volgt er geen tweede.
    const { pending } = await db.one(
      'SELECT COUNT(*) AS pending FROM messages WHERE assignment_id = ? AND sender_role = ? AND read_at IS NULL',
      [assignment.id, senderRole])

    await db.query('INSERT INTO messages (assignment_id, sender_role, body) VALUES (?, ?, ?)', [assignment.id, senderRole, body])

    // Melding zonder inhoud en zonder afzender
    const other = Number(pending) === 0 ? await db.one('SELECT * FROM participants WHERE id = ?', [assignment.other_id]) : null
    if (other) {
      const link = tokens.participantLink(baseUrl(req), other.token)
      const event = { name: me.event_name }
      const settings = await getMailSettings()
      const message = templates.messageNotice({ participant: other, event, link, fromRole: senderRole, custom: settings.templates?.messageNotice })
      mailer.send(withSender({ to: other.email, ...message }, settings)).catch(() => {})
    }
    res.status(201).json({ ok: true })
  }))

  // ════════════════════ Frontend ════════════════════
  app.use('/api', (req, res) => res.status(404).json({ error: 'Niet gevonden' }))

  const dist = path.join(__dirname, '..', 'dist')
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }))
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.sendFile(path.join(dist, 'index.html'))
    })
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(`[Fout] ${req.method} ${req.path}: ${err.stack || err.message}`)
    res.status(500).json({ error: 'Er ging iets mis op de server.' })
  })

  return app
}

// ── Eerste admin aanmaken ──────────────────────────────────────────
async function ensureAdmin() {
  const { n } = await db.one('SELECT COUNT(*) AS n FROM admins')
  if (Number(n) > 0) return

  const email = tokens.normalizeEmail(process.env.ADMIN_EMAIL || 'nick.bogaerts@vtiz.be')
  const configured = process.env.ADMIN_PASSWORD
  const password = configured || auth.generateTempPassword()
  await db.query('INSERT INTO admins (email, password_hash, must_change_password) VALUES (?, ?, ?)',
    [email, auth.hashPassword(password), configured ? 0 : 1])

  if (configured) console.log(`[Admin] account ${email} aangemaakt met het wachtwoord uit ADMIN_PASSWORD`)
  else console.log(`[Admin] account ${email} aangemaakt — tijdelijk wachtwoord: ${password} (wijzig het bij de eerste aanmelding)`)
}

// ── Herinneringen: elke minuut controleren ─────────────────────────
async function runDueReminders() {
  const now = v.formatLocalDateTime(new Date())
  const due = await db.query('SELECT * FROM events WHERE reminder_at IS NOT NULL AND reminder_sent_at IS NULL AND reminder_at <= ?', [now])

  for (const event of due) {
    if (!mailer.appUrl()) { console.warn(`[Herinnering] APP_URL ontbreekt — herinnering voor "${event.name}" overgeslagen`); continue }
    if (jobs.get(event.id)?.running) continue

    // Atomisch claimen: ook bij twee instanties wordt maar één keer gemaild
    const claim = await db.query('UPDATE events SET reminder_sent_at = ? WHERE id = ? AND reminder_sent_at IS NULL', [now, event.id])
    if (claim.affectedRows !== 1) continue

    const participants = await db.query('SELECT * FROM participants WHERE event_id = ?', [event.id])
    console.log(`[Herinnering] "${event.name}": ${participants.length} mails`)
    startMailJob(event.id, 'reminder', buildMails('reminder', event, participants, mailer.appUrl(), await getMailSettings()))
  }
}

async function main() {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 16) {
    console.error('[Config] JWT_SECRET ontbreekt of is te kort (minstens 16 tekens).')
    process.exit(1)
  }

  await db.waitForDb()
  await db.migrate()
  await ensureAdmin()

  if (!mailer.configured()) console.warn('[Mail] RESEND_API_KEY ontbreekt — uitnodigingen en herinneringen worden niet verstuurd.')
  if (!mailer.appUrl()) console.warn('[Config] APP_URL ontbreekt — links in mails vallen terug op het adres van de aanvraag.')

  const port = parseInt(process.env.PORT || '3000', 10)
  createApp().listen(port, () => console.log(`[Secret Santa] luistert op poort ${port}`))

  setInterval(() => runDueReminders().catch(e => console.error(`[Herinnering] ${e.message}`)), 60 * 1000)
}

if (require.main === module) {
  main().catch(e => { console.error('[Start] mislukt:', e); process.exit(1) })
}

module.exports = { createApp, buildMails, startMailJob }
