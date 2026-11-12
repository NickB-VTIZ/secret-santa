const test = require('node:test')
const assert = require('node:assert/strict')
const t = require('./tokens')
const v = require('./validate')
const templates = require('./mail-templates')

// ── Inschrijfcode ──────────────────────────────────────────────────
test('generateSignupCode geeft een geldige code van 16 tekens', () => {
  const code = t.generateSignupCode()
  assert.equal(code.length, t.SIGNUP_CODE_LENGTH)
  assert.equal(t.isValidSignupCode(code), true)
})

test('inschrijfcodes zijn uniek', () => {
  const set = new Set(Array.from({ length: 2000 }, () => t.generateSignupCode()))
  assert.equal(set.size, 2000)
})

test('isValidSignupCode weigert foute invoer', () => {
  assert.equal(t.isValidSignupCode(''), false)
  assert.equal(t.isValidSignupCode(null), false)
  assert.equal(t.isValidSignupCode('x'.repeat(15)), false)
  assert.equal(t.isValidSignupCode('x'.repeat(17)), false)
  assert.equal(t.isValidSignupCode('0'.repeat(16)), false)   // 0 zit niet in het alfabet
  assert.equal(t.isValidSignupCode("a'; DROP TABLE--"), false)
  // Een deelnemertoken (32 tekens) is nooit een geldige inschrijfcode
  assert.equal(t.isValidSignupCode(t.generateToken()), false)
})

test('signupLink vermijdt dubbele slashes', () => {
  assert.equal(t.signupLink('https://santa.vtiz.be/', 'ABC'), 'https://santa.vtiz.be/inschrijven/ABC')
  assert.equal(t.signupLink('https://santa.vtiz.be', 'ABC'), 'https://santa.vtiz.be/inschrijven/ABC')
})

// ── Formulier ──────────────────────────────────────────────────────
test('cleanSignupInput: geldige inschrijving', () => {
  const r = v.cleanSignupInput({ name: '  Jan   Peeters ', email: ' Jan.Peeters@VTIZ.be ', consent: true })
  assert.deepEqual(r.value, { name: 'Jan Peeters', email: 'jan.peeters@vtiz.be' })
  assert.equal(r.error, undefined)
})

test('cleanSignupInput: toestemming is verplicht en moet exact true zijn', () => {
  for (const consent of [undefined, false, 'true', 1, 'on', null]) {
    const r = v.cleanSignupInput({ name: 'Jan', email: 'jan@vtiz.be', consent })
    assert.ok(r.error, `consent=${String(consent)} had geweigerd moeten worden`)
    assert.equal(r.value, undefined)
  }
})

test('cleanSignupInput: naam en e-mail zijn verplicht', () => {
  assert.ok(v.cleanSignupInput({ name: '', email: 'jan@vtiz.be', consent: true }).error)
  assert.ok(v.cleanSignupInput({ name: '   ', email: 'jan@vtiz.be', consent: true }).error)
  assert.ok(v.cleanSignupInput({ name: 'Jan', email: 'geen-mail', consent: true }).error)
  assert.ok(v.cleanSignupInput({ name: 'Jan', email: '', consent: true }).error)
  assert.ok(v.cleanSignupInput(undefined).error)
})

test('cleanSignupInput: naam wordt begrensd', () => {
  const r = v.cleanSignupInput({ name: 'a'.repeat(500), email: 'jan@vtiz.be', consent: true })
  assert.equal(r.value.name.length, v.LIMITS.name)
})

test('cleanSignupInput: domeinbeperking', () => {
  const allowedDomains = ['vtiz.be']
  assert.ok(v.cleanSignupInput({ name: 'Jan', email: 'jan@vtiz.be', consent: true }, { allowedDomains }).value)
  assert.ok(v.cleanSignupInput({ name: 'Jan', email: 'jan@gmail.com', consent: true }, { allowedDomains }).error)
  assert.ok(v.cleanSignupInput({ name: 'Jan', email: 'jan@sub.vtiz.be', consent: true }, { allowedDomains }).error)
  // Zonder beperking mag elk domein
  assert.ok(v.cleanSignupInput({ name: 'Jan', email: 'jan@gmail.com', consent: true }).value)
})

test('parseAllowedDomains', () => {
  assert.deepEqual(v.parseAllowedDomains(''), [])
  assert.deepEqual(v.parseAllowedDomains(undefined), [])
  assert.deepEqual(v.parseAllowedDomains('vtiz.be'), ['vtiz.be'])
  assert.deepEqual(v.parseAllowedDomains(' @VTIZ.be, school.be ; x.be'), ['vtiz.be', 'school.be', 'x.be'])
})

test('signupBlocker', () => {
  assert.equal(v.signupBlocker({ open: true, drawn: false }), null)
  assert.match(v.signupBlocker({ open: false, drawn: false }), /gesloten/)
  assert.match(v.signupBlocker({ open: true, drawn: true }), /trekking/)
  assert.match(v.signupBlocker({ open: false, drawn: true }), /trekking/)
})

// ── Bevestigingsmail ───────────────────────────────────────────────
test('signup-mail bevat de persoonlijke link en ontsnapt invoer', () => {
  const participant = { name: '<b>Jan</b>', email: 'jan@vtiz.be' }
  const event = { name: 'Kerst 2026', event_date: '2026-12-18', budget: 15 }
  const link = 'https://santa.vtiz.be/deelnemer/ABC'
  const m = templates.signup({ participant, event, link })

  assert.match(m.subject, /Kerst 2026/)
  assert.ok(m.html.includes(link))
  assert.ok(m.text.includes(link))
  assert.ok(!m.html.includes('<b>Jan</b>'), 'naam moet geëscaped zijn in de html')
})
