const test = require('node:test')
const assert = require('node:assert/strict')
const auth = require('./auth')

const SECRET = 'een-lang-genoeg-testgeheim'

test('hashPassword en verifyPassword', () => {
  const hash = auth.hashPassword('geheim-wachtwoord')
  assert.match(hash, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/)
  assert.equal(auth.verifyPassword('geheim-wachtwoord', hash), true)
  assert.equal(auth.verifyPassword('ander', hash), false)
})

test('twee hashes van hetzelfde wachtwoord verschillen (salt)', () => {
  assert.notEqual(auth.hashPassword('abc'), auth.hashPassword('abc'))
})

test('verifyPassword weigert kapotte opslag', () => {
  assert.equal(auth.verifyPassword('x', ''), false)
  assert.equal(auth.verifyPassword('x', null), false)
  assert.equal(auth.verifyPassword('x', 'md5$a$b'), false)
  assert.equal(auth.verifyPassword('x', 'scrypt$$'), false)
})

test('validateNewPassword', () => {
  assert.match(auth.validateNewPassword('kort'), /minstens/)
  assert.match(auth.validateNewPassword(undefined), /minstens/)
  assert.equal(auth.validateNewPassword('lang-genoeg-wachtwoord'), null)
})

test('generateTempPassword heeft de gevraagde lengte en bestaat uit leesbare tekens', () => {
  const p = auth.generateTempPassword()
  assert.equal(p.length, 14)
  assert.match(p, /^[A-HJKMNP-Za-km-z2-9]+$/)
})

test('JWT: ondertekenen en controleren', () => {
  const token = auth.signToken({ id: 1, email: 'a@b.be' }, SECRET)
  const payload = auth.verifyToken(token, SECRET)
  assert.equal(payload.sub, 1)
  assert.equal(payload.role, 'admin')
  assert.equal(auth.verifyToken(token, 'ander-geheim-geheim'), null)
  assert.equal(auth.verifyToken('rommel', SECRET), null)
})

test('JWT zonder admin-rol wordt geweigerd', () => {
  const jwt = require('jsonwebtoken')
  const token = jwt.sign({ sub: 1, role: 'user' }, SECRET)
  assert.equal(auth.verifyToken(token, SECRET), null)
})

test('requireAdmin laat geldige tokens door en weigert de rest', () => {
  const mw = auth.requireAdmin(SECRET)
  const run = header => {
    const res = { code: null, status(c) { this.code = c; return this }, json() { return this } }
    let nexted = false
    const req = { headers: header ? { authorization: header } : {} }
    mw(req, res, () => { nexted = true })
    return { nexted, code: res.code, req }
  }
  const good = auth.signToken({ id: 5, email: 'a@b.be' }, SECRET)
  assert.equal(run(`Bearer ${good}`).nexted, true)
  assert.equal(run(`Bearer ${good}`).req.admin.sub, 5)
  assert.deepEqual([run().nexted, run().code], [false, 401])
  assert.equal(run('Bearer fout').code, 401)
  assert.equal(run(`Basic ${good}`).code, 401)
})

test('rate limiter telt per sleutel en reset na het venster', () => {
  let now = 0
  const allow = auth.createRateLimiter({ max: 3, windowMs: 1000, now: () => now })
  assert.deepEqual([allow('ip'), allow('ip'), allow('ip'), allow('ip')], [true, true, true, false])
  assert.equal(allow('ander'), true)
  now = 1001
  assert.equal(allow('ip'), true)
})
