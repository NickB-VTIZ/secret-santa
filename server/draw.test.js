const test = require('node:test')
const assert = require('node:assert/strict')
const { drawPairs, validatePairs, buildExclusionMap, mulberry32 } = require('./draw')

const range = n => Array.from({ length: n }, (_, i) => i + 1)

test('geeft een fout bij minder dan 2 deelnemers', () => {
  assert.equal(drawPairs([]).ok, false)
  assert.equal(drawPairs([1]).ok, false)
})

test('twee deelnemers trekken elkaar', () => {
  const r = drawPairs([1, 2], [], { seed: 1 })
  assert.equal(r.ok, true)
  assert.deepEqual(validatePairs(r.pairs, [1, 2]), { ok: true })
})

test('niemand trekt zichzelf en iedereen geeft en krijgt precies één cadeau', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const ids = range(2 + (seed % 25))
    const r = drawPairs(ids, [], { seed })
    assert.equal(r.ok, true, `seed ${seed}`)
    assert.deepEqual(validatePairs(r.pairs, ids), { ok: true }, `seed ${seed}`)
    assert.ok(r.pairs.every(p => p.giverId !== p.receiverId))
  }
})

test('dubbele ids worden ontdubbeld', () => {
  const r = drawPairs([1, 2, 3, 3, 2], [], { seed: 5 })
  assert.equal(r.ok, true)
  assert.equal(r.pairs.length, 3)
})

test('uitsluitingen gelden standaard in beide richtingen', () => {
  const ids = range(6)
  const exclusions = [{ giverId: 1, receiverId: 2 }, { giverId: 3, receiverId: 4 }]
  for (let seed = 1; seed <= 200; seed++) {
    const r = drawPairs(ids, exclusions, { seed })
    assert.equal(r.ok, true, `seed ${seed}`)
    const has = (g, x) => r.pairs.some(p => p.giverId === g && p.receiverId === x)
    assert.equal(has(1, 2) || has(2, 1) || has(3, 4) || has(4, 3), false, `seed ${seed}`)
    assert.deepEqual(validatePairs(r.pairs, ids, exclusions), { ok: true })
  }
})

test('eenrichtingsuitsluiting blokkeert enkel die richting', () => {
  const map = buildExclusionMap([1, 2, 3], [{ giverId: 1, receiverId: 2 }], { mutual: false })
  assert.equal(map.get(1).has(2), true)
  assert.equal(map.get(2).has(1), false)
})

test('uitsluitingen met onbekende deelnemers worden genegeerd', () => {
  const map = buildExclusionMap([1, 2], [{ giverId: 1, receiverId: 99 }])
  assert.deepEqual([...map.get(1)], [1])
})

test('krappe uitsluitingen blijven oplosbaar (cyclus van 3 met 2 uitsluitingen)', () => {
  // 1 mag 2 niet, 2 mag 3 niet → enkel nog 1→3→2→1 of varianten
  const ids = [1, 2, 3]
  const exclusions = [{ giverId: 1, receiverId: 2 }, { giverId: 2, receiverId: 3 }]
  for (let seed = 1; seed <= 50; seed++) {
    const r = drawPairs(ids, exclusions, { seed, mutual: true })
    // met mutual blijft er geen oplossing over: 1-2, 2-3 geblokkeerd, dus 1 moet 3, 3 moet 2, 2 moet 1 → 2→1 geblokkeerd
    assert.equal(r.ok, false)
  }
  const oneWay = drawPairs(ids, exclusions, { seed: 3, mutual: false })
  assert.equal(oneWay.ok, true)
  assert.deepEqual(validatePairs(oneWay.pairs, ids, exclusions, { mutual: false }), { ok: true })
})

test('onmogelijke trekking geeft een duidelijke fout', () => {
  // 1 mag niemand trekken
  const r = drawPairs([1, 2, 3], [{ giverId: 1, receiverId: 2 }, { giverId: 1, receiverId: 3 }], { seed: 1 })
  assert.equal(r.ok, false)
  assert.match(r.error, /uitsluiting/i)
})

test('onmogelijke trekking zonder lege gever geeft een duidelijke fout', () => {
  // 3 deelnemers, iedereen sluit iedereen uit behalve één lus die niet sluit
  const ex = [{ giverId: 1, receiverId: 2 }, { giverId: 1, receiverId: 3 }, { giverId: 2, receiverId: 3 }]
  const r = drawPairs([1, 2, 3], ex, { seed: 2 })
  assert.equal(r.ok, false)
})

test('zelfde seed geeft dezelfde trekking, een andere seed meestal een andere', () => {
  const ids = range(12)
  const a = drawPairs(ids, [], { seed: 42 })
  const b = drawPairs(ids, [], { seed: 42 })
  assert.deepEqual(a.pairs, b.pairs)
  const different = range(30).some(s => JSON.stringify(drawPairs(ids, [], { seed: 100 + s }).pairs) !== JSON.stringify(a.pairs))
  assert.equal(different, true)
})

test('trekking is redelijk gespreid: elke deelnemer kan elke ander trekken', () => {
  const ids = [1, 2, 3, 4]
  const seen = new Set()
  for (let seed = 1; seed <= 300; seed++) {
    const r = drawPairs(ids, [], { seed })
    seen.add(`${r.pairs.find(p => p.giverId === 1).receiverId}`)
  }
  assert.deepEqual([...seen].sort(), ['2', '3', '4'])
})

test('grote groep van 200 met veel uitsluitingen lost snel op', () => {
  const ids = range(200)
  const exclusions = range(100).map(i => ({ giverId: 2 * i + 1, receiverId: 2 * i + 2 }))
  const t = Date.now()
  const r = drawPairs(ids, exclusions, { seed: 7 })
  assert.equal(r.ok, true)
  assert.ok(Date.now() - t < 2000)
  assert.deepEqual(validatePairs(r.pairs, ids, exclusions), { ok: true })
})

test('validatePairs ontdekt ongeldige trekkingen', () => {
  const ids = [1, 2, 3]
  assert.match(validatePairs([{ giverId: 1, receiverId: 1 }, { giverId: 2, receiverId: 3 }, { giverId: 3, receiverId: 2 }], ids).error, /zichzelf/)
  assert.match(validatePairs([{ giverId: 1, receiverId: 2 }, { giverId: 2, receiverId: 2 }, { giverId: 3, receiverId: 1 }], ids).error, /meer dan één/)
  assert.match(validatePairs([{ giverId: 1, receiverId: 2 }], ids).error, /Aantal/)
  assert.match(
    validatePairs([{ giverId: 1, receiverId: 2 }, { giverId: 2, receiverId: 3 }, { giverId: 3, receiverId: 1 }], ids, [{ giverId: 1, receiverId: 2 }]).error,
    /uitsluiting/i)
})

test('mulberry32 is deterministisch en ligt in [0,1)', () => {
  const a = mulberry32(1)
  const b = mulberry32(1)
  for (let i = 0; i < 100; i++) {
    const x = a()
    assert.equal(x, b())
    assert.ok(x >= 0 && x < 1)
  }
})
