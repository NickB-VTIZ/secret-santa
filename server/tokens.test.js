const test = require('node:test')
const assert = require('node:assert/strict')
const t = require('./tokens')

test('generateToken geeft een geldig token van 32 tekens', () => {
  const token = t.generateToken()
  assert.equal(token.length, t.TOKEN_LENGTH)
  assert.equal(t.isValidToken(token), true)
})

test('tokens zijn uniek', () => {
  const set = new Set(Array.from({ length: 2000 }, () => t.generateToken()))
  assert.equal(set.size, 2000)
})

test('isValidToken weigert foute invoer', () => {
  assert.equal(t.isValidToken(''), false)
  assert.equal(t.isValidToken(null), false)
  assert.equal(t.isValidToken('x'.repeat(31)), false)
  assert.equal(t.isValidToken('x'.repeat(33)), false)
  assert.equal(t.isValidToken('0'.repeat(32)), false)       // 0 zit niet in het alfabet
  assert.equal(t.isValidToken("'; DROP TABLE--".padEnd(32, 'a')), false)
})

test('participantLink verwijdert dubbele slashes', () => {
  assert.equal(t.participantLink('http://x:3004/', 'abc'), 'http://x:3004/deelnemer/abc')
  assert.equal(t.participantLink('http://x:3004///', 'abc'), 'http://x:3004/deelnemer/abc')
})

test('safeEqual vergelijkt zonder uitzonderingen bij verschillende lengtes', () => {
  assert.equal(t.safeEqual('abc', 'abc'), true)
  assert.equal(t.safeEqual('abc', 'abd'), false)
  assert.equal(t.safeEqual('abc', 'abcd'), false)
})

test('e-mailvalidatie', () => {
  assert.equal(t.isValidEmail('jan.peeters@vtiz.be'), true)
  assert.equal(t.isValidEmail('  JAN@VTIZ.BE '), true)
  assert.equal(t.isValidEmail('jan@vtiz'), false)
  assert.equal(t.isValidEmail('jan vtiz.be'), false)
  assert.equal(t.isValidEmail(''), false)
  assert.equal(t.normalizeEmail('  Jan@VTIZ.be '), 'jan@vtiz.be')
})

test('parseParticipants: puntkomma, komma, tab en <mail>', () => {
  const { rows, errors } = t.parseParticipants([
    'Jan Peeters;jan@vtiz.be',
    'An Janssens, an@vtiz.be',
    'Piet Pauwels\tpiet@vtiz.be',
    'Els De Smet <Els@vtiz.be>',
  ].join('\n'))
  assert.deepEqual(errors, [])
  assert.deepEqual(rows, [
    { name: 'Jan Peeters', email: 'jan@vtiz.be' },
    { name: 'An Janssens', email: 'an@vtiz.be' },
    { name: 'Piet Pauwels', email: 'piet@vtiz.be' },
    { name: 'Els De Smet', email: 'els@vtiz.be' },
  ])
})

test('parseParticipants: kopregel, lege regels en Windows-regeleinden', () => {
  const { rows, errors } = t.parseParticipants('Naam;E-mail\r\n\r\nJan;jan@vtiz.be\r\n')
  assert.deepEqual(errors, [])
  assert.deepEqual(rows, [{ name: 'Jan', email: 'jan@vtiz.be' }])
})

test('parseParticipants: enkel een e-mailadres leidt de naam af', () => {
  const { rows } = t.parseParticipants('jan.peeters@vtiz.be')
  assert.deepEqual(rows, [{ name: 'Jan Peeters', email: 'jan.peeters@vtiz.be' }])
})

test('parseParticipants: meldt ongeldige en dubbele rijen', () => {
  const { rows, errors } = t.parseParticipants('Jan;jan@vtiz.be\nFout;niet-een-mail\nJAN;JAN@vtiz.be\nOnzin')
  assert.equal(rows.length, 1)
  assert.deepEqual(errors.map(e => [e.line, e.error]), [
    [2, 'Geen geldig e-mailadres gevonden'],
    [3, 'Dubbel e-mailadres'],
    [4, 'Geen geldig e-mailadres'],
  ])
})

test('parseParticipants: lege invoer', () => {
  assert.deepEqual(t.parseParticipants(''), { rows: [], errors: [] })
  assert.deepEqual(t.parseParticipants(null), { rows: [], errors: [] })
})
