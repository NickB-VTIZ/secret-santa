const test = require('node:test')
const assert = require('node:assert/strict')
const v = require('./validate')

test('parseDate', () => {
  assert.equal(v.parseDate('2026-12-18'), '2026-12-18')
  assert.equal(v.parseDate(''), null)
  assert.equal(v.parseDate(null), null)
  assert.equal(v.parseDate('2026-02-30'), undefined)
  assert.equal(v.parseDate('18-12-2026'), undefined)
})

test('parseDateTime accepteert datetime-local en SQL-formaat', () => {
  assert.equal(v.parseDateTime('2026-12-01T09:30'), '2026-12-01 09:30:00')
  assert.equal(v.parseDateTime('2026-12-01 09:30:15'), '2026-12-01 09:30:15')
  assert.equal(v.parseDateTime(''), null)
  assert.equal(v.parseDateTime('2026-12-01T25:00'), undefined)
  assert.equal(v.parseDateTime('2026-13-01T10:00'), undefined)
  assert.equal(v.parseDateTime('morgen'), undefined)
})

test('parseBudget', () => {
  assert.equal(v.parseBudget('15'), 15)
  assert.equal(v.parseBudget('12,5'), 12.5)
  assert.equal(v.parseBudget('12.345'), 12.35)
  assert.equal(v.parseBudget(''), null)
  assert.equal(v.parseBudget('-1'), undefined)
  assert.equal(v.parseBudget('abc'), undefined)
  assert.equal(v.parseBudget('100000'), undefined)
})

test('cleanEventInput: geldig event', () => {
  const r = v.cleanEventInput({ name: '  Kerst 2026 ', description: ' Leuk! ', budget: '15', eventDate: '2026-12-18', reminderAt: '2026-12-10T08:00' })
  assert.deepEqual(r.value, { name: 'Kerst 2026', description: 'Leuk!', budget: 15, eventDate: '2026-12-18', reminderAt: '2026-12-10 08:00:00' })
})

test('cleanEventInput: foutmeldingen', () => {
  assert.match(v.cleanEventInput({ name: '  ' }).error, /naam/)
  assert.match(v.cleanEventInput({ name: 'x', budget: 'veel' }).error, /budget/)
  assert.match(v.cleanEventInput({ name: 'x', eventDate: '2026-02-30' }).error, /datum/i)
  assert.match(v.cleanEventInput({ name: 'x', reminderAt: 'ooit' }).error, /herinnering/i)
  assert.match(v.cleanEventInput().error, /naam/)
})

test('cleanEventInput: lege optionele velden worden null', () => {
  const r = v.cleanEventInput({ name: 'x' })
  assert.deepEqual(r.value, { name: 'x', description: null, budget: null, eventDate: null, reminderAt: null })
})

test('cleanText kapt af en normaliseert regeleinden', () => {
  assert.equal(v.cleanText('a\r\nb', 10), 'a\nb')
  assert.equal(v.cleanText('x'.repeat(50), 10).length, 10)
  assert.equal(v.cleanText(undefined, 10), '')
})

test('cleanMessage en cleanWishlist', () => {
  assert.equal(v.cleanMessage('  hoi  ').value, 'hoi')
  assert.match(v.cleanMessage('   ').error, /bericht/)
  assert.equal(v.cleanWishlist('  '), null)
  assert.equal(v.cleanWishlist(' boek '), 'boek')
  assert.equal(v.cleanMessage('x'.repeat(5000)).value.length, v.LIMITS.message)
})

test('drawBlocker', () => {
  assert.equal(v.drawBlocker({ participantCount: 5, drawn: false }), null)
  assert.match(v.drawBlocker({ participantCount: 5, drawn: true }), /al gedaan/)
  assert.match(v.drawBlocker({ participantCount: 2, drawn: false }), /minstens 3/)
})

test('formatLocalDateTime vult nullen aan', () => {
  assert.equal(v.formatLocalDateTime(new Date(2026, 0, 2, 3, 4, 5)), '2026-01-02 03:04:05')
})
