const test = require('node:test')
const assert = require('node:assert/strict')
const { createMailer } = require('./mail')
const tpl = require('./mail-templates')

const cfg = { resendApiKey: 're_test', from: 'VTIZ <a@b.be>', appUrl: 'http://nas:3004/' }

test('send zonder API-key slaat over zonder te falen', async () => {
  const m = createMailer({ getConfig: () => ({}) })
  assert.deepEqual(await m.send({ to: 'x@y.be', subject: 's' }), { ok: false, skipped: true })
  assert.equal(m.configured(), false)
})

test('send roept Resend aan met de juiste payload', async () => {
  let call
  const m = createMailer({ getConfig: () => cfg, fetchImpl: async (url, opts) => { call = { url, opts }; return { ok: true } } })
  assert.deepEqual(await m.send({ to: 'x@y.be', subject: 'Hoi', html: '<p>x</p>', text: 'x' }), { ok: true })
  assert.equal(call.url, 'https://api.resend.com/emails')
  assert.equal(call.opts.headers.Authorization, 'Bearer re_test')
  assert.deepEqual(JSON.parse(call.opts.body), { from: 'VTIZ <a@b.be>', to: ['x@y.be'], subject: 'Hoi', html: '<p>x</p>', text: 'x' })
})

test('send gooit nooit bij een Resend-fout of netwerkfout', async () => {
  const bad = createMailer({ getConfig: () => cfg, fetchImpl: async () => ({ ok: false, status: 422, text: async () => 'ongeldig' }) })
  const r1 = await bad.send({ to: 'x@y.be', subject: 's' })
  assert.equal(r1.ok, false)
  assert.match(r1.error, /422/)

  const down = createMailer({ getConfig: () => cfg, fetchImpl: async () => { throw new Error('netwerk weg') } })
  const r2 = await down.send({ to: 'x@y.be', subject: 's' })
  assert.deepEqual([r2.ok, r2.error], [false, 'netwerk weg'])
})

test('appUrl verwijdert slashes op het einde', () => {
  assert.equal(createMailer({ getConfig: () => cfg }).appUrl(), 'http://nas:3004')
})

test('sendMany telt verzonden, mislukte en overgeslagen mails', async () => {
  let n = 0
  const m = createMailer({ getConfig: () => cfg, fetchImpl: async () => (++n === 2 ? { ok: false, status: 500, text: async () => '' } : { ok: true }) })
  const r = await m.sendMany([{ to: 'a@b.be' }, { to: 'b@b.be' }, { to: 'c@b.be' }], { delayMs: 0 })
  assert.equal(r.sent, 2)
  assert.equal(r.failed, 1)
  assert.equal(r.failures[0].to, 'b@b.be')
})

test('esc ontsnapt HTML', () => {
  // Verwachte entiteiten als unicode-escapes (\u0026 = &) zodat ze niet worden omgezet bij het opslaan
  const amp = '\u0026amp;', lt = '\u0026lt;', gt = '\u0026gt;', quot = '\u0026quot;', apos = '\u0026#39;'
  assert.equal(
    tpl.esc('\u003Cb\u003E"A" \u0026 \'B\'\u003C/b\u003E'),
    `${lt}b${gt}${quot}A${quot} ${amp} ${apos}B${apos}${lt}/b${gt}`)
  assert.equal(tpl.esc(null), '')
})

test('formatDate en formatBudget', () => {
  assert.equal(tpl.formatDate('2026-12-18'), '18 december 2026')
  assert.equal(tpl.formatDate(''), '')
  assert.equal(tpl.formatBudget(15), '€ 15,00')
  assert.equal(tpl.formatBudget('12.5'), '€ 12,50')
  assert.equal(tpl.formatBudget(null), '')
})

const ctx = {
  participant: { name: 'Jan <script>' },
  event: { name: 'Kerst "26"', event_date: '2026-12-18', budget: 15 },
  link: 'http://nas:3004/deelnemer/TOKEN',
}

test('uitnodiging bevat link, datum en budget en ontsnapt de naam', () => {
  const m = tpl.invite(ctx)
  assert.match(m.subject, /Kerst "26"/)
  assert.match(m.html, /http:\/\/nas:3004\/deelnemer\/TOKEN/)
  assert.match(m.html, /18 december 2026/)
  assert.match(m.html, /€ 15,00/)
  assert.doesNotMatch(m.html, /<script>/)
  assert.match(m.text, /TOKEN/)
})

test('trekkingmail verklapt niemand', () => {
  const m = tpl.drawn(ctx)
  assert.match(m.html, /persoonlijke pagina/)
  assert.doesNotMatch(m.html + m.text, /getrokken heb(t)? [A-Z]/)
})

test('herinnering past zich aan de situatie aan', () => {
  assert.match(tpl.reminder({ ...ctx, isDrawn: false, hasWishlist: false }).html, /nog geen verlanglijstje/)
  assert.match(tpl.reminder({ ...ctx, isDrawn: false, hasWishlist: true }).html, /staat al klaar/)
  assert.match(tpl.reminder({ ...ctx, isDrawn: true, hasWishlist: true }).html, /vergeet je cadeau niet/)
})

test('berichtmelding bevat de inhoud van het bericht niet', () => {
  const secret = 'GEHEIM-BERICHT-INHOUD'
  const giver = tpl.messageNotice({ ...ctx, fromRole: 'giver', body: secret, message: secret })
  const receiver = tpl.messageNotice({ ...ctx, fromRole: 'receiver', body: secret, message: secret })
  assert.match(giver.html, /je Secret Santa/)
  assert.match(receiver.html, /voor wie je een cadeau koopt/)
  assert.doesNotMatch(giver.html + giver.text + receiver.html + receiver.text, /GEHEIM-BERICHT-INHOUD/)
})
