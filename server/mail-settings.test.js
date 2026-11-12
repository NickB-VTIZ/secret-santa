const test = require('node:test')
const assert = require('node:assert/strict')
const ms = require('./mail-settings')
const tpl = require('./mail-templates')
const { createMailer } = require('./mail')

const participant = { name: 'Jan <b>Peeters</b>' }
const event = { name: 'Kerst 2026', event_date: '2026-12-18', budget: 15 }
const link = 'https://santa.vtiz.be/deelnemer/TOKEN'

// ── Plaatshouders ──────────────────────────────────────────────────
test('fill vervangt bekende plaatshouders en laat onbekende staan', () => {
  assert.equal(tpl.fill('Dag {{naam}} en {{ Event }}!', { naam: 'Jan', event: 'Kerst' }), 'Dag Jan en Kerst!')
  assert.equal(tpl.fill('Hoi {{onbekend}}', { naam: 'Jan' }), 'Hoi {{onbekend}}')
  assert.equal(tpl.fill('{{budget}}', { budget: '' }), '')
})

test('findPlaceholders geeft alle sleutels in kleine letters', () => {
  assert.deepEqual(tpl.findPlaceholders('{{Naam}} {{ event }} {{x}}'), ['naam', 'event', 'x'])
  assert.deepEqual(tpl.findPlaceholders('geen'), [])
})

// ── Eigen teksten in de mails ──────────────────────────────────────
test('zonder eigen tekst blijven de standaardteksten gelden', () => {
  const m = tpl.invite({ participant, event, link })
  assert.equal(m.subject, 'Secret Santa Kerst 2026: jouw persoonlijke link')
  assert.match(m.html, /je doet mee aan Secret Santa/)
  assert.match(m.html, /Open mijn pagina/)
})

test('eigen onderwerp, titel, tekst en knop worden gebruikt', () => {
  const custom = { subject: 'Doe mee met {{event}}', title: 'Hallo {{naam}}', intro: 'Budget: {{budget}} op {{datum}}', button: 'Naar mijn lijst' }
  const m = tpl.invite({ participant, event, link, custom })
  assert.equal(m.subject, 'Doe mee met Kerst 2026')
  assert.match(m.html, /Hallo Jan /)
  assert.match(m.html, /Budget: € 15,00 op 18 december 2026/)
  assert.match(m.html, /Naar mijn lijst/)
  assert.match(m.text, /Naar mijn lijst: https:\/\/santa\.vtiz\.be\/deelnemer\/TOKEN/)
})

test('eigen tekst kan geen HTML inspuiten, ook niet via de naam', () => {
  const custom = { intro: '<script>alert(1)</script> Dag {{naam}}' }
  const m = tpl.invite({ participant, event, link, custom })
  assert.ok(!m.html.includes('<script>'))
  assert.ok(!m.html.includes('<b>Peeters</b>'))
})

test('een onderwerp met regeleinden blijft één regel', () => {
  const m = tpl.invite({ participant, event, link, custom: { subject: 'Regel 1\nBcc: x@y.be' } })
  assert.ok(!/[\r\n]/.test(m.subject))
})

test('lege eigen tekst valt terug op de standaard', () => {
  const m = tpl.invite({ participant, event, link, custom: { subject: '   ', intro: '' } })
  assert.match(m.subject, /jouw persoonlijke link/)
})

test('lege regels worden alinea\'s en enkele regeleinden <br>', () => {
  const m = tpl.invite({ participant, event, link, custom: { intro: 'Eerste\nTweede\n\nDerde' } })
  assert.match(m.html, /<p>Eerste<br>Tweede<\/p>/)
  assert.match(m.html, /<p>Derde<\/p>/)
})

test('herinnering kiest de eigen tekst per situatie', () => {
  const custom = { introNoWishlist: 'A {{naam}}', introWishlist: 'B', introDrawn: 'C' }
  assert.match(tpl.reminder({ participant, event, link, custom, isDrawn: false, hasWishlist: false }).html, /<p>A Jan/)
  assert.match(tpl.reminder({ participant, event, link, custom, isDrawn: false, hasWishlist: true }).html, /<p>B<\/p>/)
  assert.match(tpl.reminder({ participant, event, link, custom, isDrawn: true, hasWishlist: true }).html, /<p>C<\/p>/)
})

test('berichtmelding ondersteunt {{wie}} en lekt geen inhoud', () => {
  const custom = { intro: '{{naam}}, {{wie}} schreef je.' }
  const m = tpl.messageNotice({ participant, event, link, fromRole: 'giver', custom, body: 'GEHEIM' })
  assert.match(m.html, /je Secret Santa schreef je/)
  assert.ok(!(m.html + m.text).includes('GEHEIM'))
})

test('renderSample bouwt een voorbeeld voor elke soort', () => {
  for (const kind of Object.keys(tpl.KINDS)) {
    const s = tpl.renderSample(kind)
    assert.ok(s.subject && s.html && s.text, kind)
  }
  assert.equal(tpl.renderSample('bestaatniet'), null)
})

test('describeKinds geeft velden met standaardtekst en plaatshouders', () => {
  const kinds = tpl.describeKinds()
  assert.deepEqual(kinds.map(k => k.key), ['invite', 'signup', 'drawn', 'reminder', 'messageNotice'])
  const notice = kinds.find(k => k.key === 'messageNotice')
  assert.ok(notice.placeholders.some(p => p.key === 'wie'))
  assert.ok(!kinds.find(k => k.key === 'invite').placeholders.some(p => p.key === 'wie'))
  for (const k of kinds) for (const f of k.fields) assert.ok(f.default && f.max > 0, `${k.key}.${f.key}`)
})

// ── Validatie ──────────────────────────────────────────────────────
test('cleanMailSettingsInput: afzender en antwoordadres', () => {
  const ok = ms.cleanMailSettingsInput({ fromName: '  VTIZ  Santa ', fromEmail: ' Santa@VTIZ.be ', replyTo: 'Hulp@vtiz.be' })
  assert.deepEqual(ok.value, { fromName: 'VTIZ Santa', fromEmail: 'santa@vtiz.be', replyTo: 'hulp@vtiz.be', templates: {} })

  assert.match(ms.cleanMailSettingsInput({ fromEmail: 'geen-mail' }).error, /afzender/)
  assert.match(ms.cleanMailSettingsInput({ replyTo: 'x' }).error, /antwoordadres/)
  assert.match(ms.cleanMailSettingsInput({ fromName: 'A <b@c.be>' }).error, /naam van de afzender/)
  assert.match(ms.cleanMailSettingsInput({ fromName: 'x'.repeat(81) }).error, /te lang/)
  assert.ok(ms.cleanMailSettingsInput({}).value)
})

test('cleanMailSettingsInput bewaart enkel afwijkingen van de standaard', () => {
  const def = tpl.KINDS.invite.fields.subject.default
  const r = ms.cleanMailSettingsInput({ templates: { invite: { subject: def, title: 'Mijn titel', intro: '   ' } } })
  assert.deepEqual(r.value.templates, { invite: { title: 'Mijn titel' } })
})

test('cleanMailSettingsInput weigert onbekende plaatshouders en te lange teksten', () => {
  const bad = ms.cleanMailSettingsInput({ templates: { invite: { subject: 'Hoi {{wie}}' } } })
  assert.match(bad.error, /\{\{wie\}\}/)
  // {{wie}} is wel toegestaan bij de berichtmelding
  assert.ok(ms.cleanMailSettingsInput({ templates: { messageNotice: { intro: '{{wie}} schreef' } } }).value)

  assert.match(ms.cleanMailSettingsInput({ templates: { invite: { subject: 'x'.repeat(151) } } }).error, /te lang/)
  assert.match(ms.cleanMailSettingsInput({ templates: { invite: { intro: 'x'.repeat(2001) } } }).error, /te lang/)
})

test('cleanMailSettingsInput negeert onbekende soorten en velden', () => {
  const r = ms.cleanMailSettingsInput({ templates: { onbekend: { subject: 'x' }, invite: { nepveld: 'x' } } })
  assert.deepEqual(r.value.templates, {})
})

test('cleanMailSettingsInput maakt van een regeleinde in een enkelvoudig veld een spatie', () => {
  const r = ms.cleanMailSettingsInput({ templates: { invite: { subject: 'Eerste\nTweede' } } })
  assert.equal(r.value.templates.invite.subject, 'Eerste Tweede')
})

// ── Afzender ───────────────────────────────────────────────────────
test('parseAddress ondersteunt naam + adres en enkel een adres', () => {
  assert.deepEqual(ms.parseAddress('VTIZ Secret Santa <status@nbotech.net>'), { name: 'VTIZ Secret Santa', email: 'status@nbotech.net' })
  assert.deepEqual(ms.parseAddress('"VTIZ" <A@B.be>'), { name: 'VTIZ', email: 'a@b.be' })
  assert.deepEqual(ms.parseAddress('a@b.be'), { name: '', email: 'a@b.be' })
  assert.deepEqual(ms.parseAddress(''), { name: '', email: '' })
})

test('resolveSender: beheer gaat voor, MAIL_FROM is de terugval per onderdeel', () => {
  const env = 'VTIZ Secret Santa <status@nbotech.net>'
  assert.equal(ms.resolveSender({}, env).from, 'VTIZ Secret Santa <status@nbotech.net>')
  assert.equal(ms.resolveSender({ fromEmail: 'santa@vtiz.be' }, env).from, 'VTIZ Secret Santa <santa@vtiz.be>')
  assert.equal(ms.resolveSender({ fromName: 'Kerstman', fromEmail: 'santa@vtiz.be' }, env).from, 'Kerstman <santa@vtiz.be>')
  assert.equal(ms.resolveSender({ fromName: 'Kerstman' }, env).from, 'Kerstman <status@nbotech.net>')
  assert.equal(ms.resolveSender({ replyTo: 'Hulp@vtiz.be' }, env).replyTo, 'hulp@vtiz.be')
  assert.equal(ms.resolveSender({}, '').from, '')
})

test('parseStored is bestand tegen kapotte of lege opslag', () => {
  const empty = { fromName: '', fromEmail: '', replyTo: '', templates: {} }
  assert.deepEqual(ms.parseStored(undefined), empty)
  assert.deepEqual(ms.parseStored('geen json'), empty)
  assert.deepEqual(ms.parseStored('null'), empty)
  assert.deepEqual(ms.parseStored('[1]').templates, {})
  assert.equal(ms.parseStored('{"fromName":"X","templates":{"invite":{"title":"T"}}}').templates.invite.title, 'T')
})

// ── Mailer ─────────────────────────────────────────────────────────
test('mailer gebruikt from en replyTo van de mail, anders de standaard', async () => {
  const calls = []
  const m = createMailer({
    getConfig: () => ({ resendApiKey: 're_x', from: 'Standaard <std@nbotech.net>' }),
    fetchImpl: async (url, opts) => { calls.push(JSON.parse(opts.body)); return { ok: true } },
  })
  await m.send({ to: 'a@b.be', subject: 's', from: 'Kerstman <santa@vtiz.be>', replyTo: 'hulp@vtiz.be' })
  await m.send({ to: 'a@b.be', subject: 's' })
  assert.equal(calls[0].from, 'Kerstman <santa@vtiz.be>')
  assert.equal(calls[0].reply_to, 'hulp@vtiz.be')
  assert.equal(calls[1].from, 'Standaard <std@nbotech.net>')
  assert.ok(!('reply_to' in calls[1]))
})
