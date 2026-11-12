// ── Trekking: pure helpers, geen I/O ───────────────────────────────
//
// Een geldige trekking is een derangement: iedereen geeft precies één cadeau
// en krijgt precies één cadeau, niemand trekt zichzelf, en verboden koppels
// (uitsluitingen) komen niet voor.

/**
 * Normaliseert uitsluitingen naar een Map<giverId, Set<receiverId>>.
 * Een uitsluiting is { giverId, receiverId }. Met `mutual` wordt ze in beide
 * richtingen toegepast (standaard, want partners mogen elkaar meestal niet trekken).
 */
function buildExclusionMap(participantIds, exclusions = [], { mutual = true } = {}) {
  const map = new Map(participantIds.map(id => [id, new Set()]))
  const known = new Set(participantIds)

  for (const ex of exclusions) {
    const giver = ex.giverId
    const receiver = ex.receiverId
    if (!known.has(giver) || !known.has(receiver)) continue
    map.get(giver).add(receiver)
    if (mutual) map.get(receiver).add(giver)
  }

  // Niemand trekt zichzelf
  for (const id of participantIds) map.get(id).add(id)
  return map
}

/** Deterministische pseudo-random generator, zodat tests reproduceerbaar zijn. */
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(list, rng) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Zoekt via backtracking een toewijzing giver → receiver.
 * Kiest telkens de gever met de minste mogelijkheden (most-constrained-first),
 * waardoor ook krappe uitsluitingslijsten snel oplossen of aantoonbaar falen.
 */
function solve(participantIds, forbidden, rng) {
  const assignment = new Map()
  const taken = new Set()

  function options(giver) {
    return participantIds.filter(r => !taken.has(r) && !forbidden.get(giver).has(r))
  }

  function step(remaining) {
    if (remaining.length === 0) return true

    let best = null
    let bestOptions = null
    for (const giver of remaining) {
      const opts = options(giver)
      if (bestOptions === null || opts.length < bestOptions.length) {
        best = giver
        bestOptions = opts
        if (opts.length <= 1) break
      }
    }
    if (bestOptions.length === 0) return false

    const rest = remaining.filter(id => id !== best)
    for (const receiver of shuffle(bestOptions, rng)) {
      assignment.set(best, receiver)
      taken.add(receiver)
      if (step(rest)) return true
      assignment.delete(best)
      taken.delete(receiver)
    }
    return false
  }

  return step(participantIds) ? assignment : null
}

/**
 * Voert de trekking uit.
 * @returns {{ ok: true, pairs: Array<{giverId, receiverId}> } | { ok: false, error: string }}
 */
function drawPairs(participantIds, exclusions = [], { seed, mutual = true } = {}) {
  const ids = [...new Set(participantIds)]

  if (ids.length < 2) return { ok: false, error: 'Er zijn minstens 2 deelnemers nodig voor een trekking.' }

  const forbidden = buildExclusionMap(ids, exclusions, { mutual })

  // Vroege controle: wie heeft nergens nog een optie?
  for (const id of ids) {
    if (forbidden.get(id).size >= ids.length) {
      return { ok: false, error: 'Een deelnemer kan door de uitsluitingen niemand meer trekken. Verwijder een uitsluiting.' }
    }
  }

  const rng = mulberry32(typeof seed === 'number' ? seed : (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0)

  const assignment = solve(shuffle(ids, rng), forbidden, rng)
  if (!assignment) {
    return { ok: false, error: 'Geen geldige trekking mogelijk met deze uitsluitingen. Verwijder er een of voeg deelnemers toe.' }
  }

  return { ok: true, pairs: ids.map(giverId => ({ giverId, receiverId: assignment.get(giverId) })) }
}

/** Controleert of een trekking geldig is (gebruikt in tests en vóór opslaan). */
function validatePairs(pairs, participantIds, exclusions = [], { mutual = true } = {}) {
  const ids = [...new Set(participantIds)]
  if (pairs.length !== ids.length) return { ok: false, error: 'Aantal koppels komt niet overeen met aantal deelnemers.' }

  const givers = new Set(pairs.map(p => p.giverId))
  const receivers = new Set(pairs.map(p => p.receiverId))
  if (givers.size !== ids.length) return { ok: false, error: 'Een deelnemer geeft meer dan één cadeau.' }
  if (receivers.size !== ids.length) return { ok: false, error: 'Een deelnemer krijgt meer dan één cadeau.' }

  const forbidden = buildExclusionMap(ids, exclusions, { mutual })
  for (const { giverId, receiverId } of pairs) {
    if (!ids.includes(giverId) || !ids.includes(receiverId)) return { ok: false, error: 'Onbekende deelnemer in de trekking.' }
    if (forbidden.get(giverId).has(receiverId)) {
      return { ok: false, error: giverId === receiverId ? 'Iemand trekt zichzelf.' : 'Een uitsluiting wordt geschonden.' }
    }
  }
  return { ok: true }
}

module.exports = { drawPairs, validatePairs, buildExclusionMap, mulberry32, shuffle }
