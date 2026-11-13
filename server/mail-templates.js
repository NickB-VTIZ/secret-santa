// ── Mailteksten (Nederlands) ───────────────────────────────────────
// De standaardteksten staan hieronder. Het beheer kan ze per soort mail overschrijven;
// in de teksten mogen plaatshouders staan zoals {{naam}} en {{event}}.

// Entiteiten als unicode-escapes (\u0026 = &), zodat ze nooit als kale tekens worden weggeschreven
const ENTITIES = {
  '\u0026': '\u0026amp;',
  '\u003C': '\u0026lt;',
  '\u003E': '\u0026gt;',
  '\u0022': '\u0026quot;',
  '\u0027': '\u0026#39;',
}

function esc(s) {
  return String(s ?? '').replace(/[\u0026\u003C\u003E\u0022\u0027]/g, c => ENTITIES[c])
}

function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return ''
  const months = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
  return `${parseInt(m[3], 10)} ${months[parseInt(m[2], 10) - 1]} ${m[1]}`
}

function formatBudget(budget) {
  if (budget === null || budget === undefined || budget === '') return ''
  const n = Number(budget)
  return Number.isFinite(n) ? `€ ${n.toFixed(2).replace('.', ',')}` : ''
}

/** Budget als bereik: min en/of max (`max` is de kolom `budget`). Leeg als niets is ingesteld. */
function formatBudgetRange(min, max) {
  const lo = formatBudget(min)
  const hi = formatBudget(max)
  if (lo && hi) return Number(min) === Number(max) ? hi : `${lo} tot ${hi}`
  if (lo) return `vanaf ${lo}`
  return hi
}

const eventBudget = event => formatBudgetRange(event.budget_min, event.budget)

// ── Plaatshouders ──────────────────────────────────────────────────
const PLACEHOLDERS = [
  { key: 'naam', label: 'Naam van de deelnemer' },
  { key: 'event', label: 'Naam van het event' },
  { key: 'datum', label: 'Datum van de cadeau-uitwisseling' },
  { key: 'budget', label: 'Budget' },
  { key: 'link', label: 'Persoonlijke link' },
]
const NOTICE_PLACEHOLDER = { key: 'wie', label: 'Wie het bericht stuurde' }

// ── Standaardteksten per soort mail ────────────────────────────────
function field(label, def, max, multiline = false) {
  return { label, default: def, max, multiline }
}

const SUBJECT = 'Onderwerp'
const TITLE = 'Titel in de mail'
const BUTTON = 'Tekst van de knop'
const INTRO_MAX = 2000
const NO_LIST = 'Tekst als het verlanglijstje uitgeschakeld is'

const KINDS = {
  invite: {
    label: 'Uitnodiging',
    description: 'Gaat naar de deelnemers wanneer je in een event op uitnodigen klikt.',
    fields: {
      subject: field(SUBJECT, 'Secret Santa {{event}}: jouw persoonlijke link', 150),
      title: field(TITLE, 'Secret Santa — {{event}}', 150),
      intro: field('Tekst', 'Dag {{naam}}, je doet mee aan Secret Santa. Vul via je persoonlijke pagina je verlanglijstje in. Na de trekking zie je daar ook voor wie je een cadeau koopt.', INTRO_MAX, true),
      introNoList: field(NO_LIST, 'Dag {{naam}}, je doet mee aan Secret Santa. Na de trekking zie je op je persoonlijke pagina voor wie je een cadeau koopt.', INTRO_MAX, true),
      button: field(BUTTON, 'Open mijn pagina', 60),
    },
  },
  signup: {
    label: 'Bevestiging na inschrijving',
    description: 'Gaat automatisch naar wie zich via de publieke link inschrijft.',
    fields: {
      subject: field(SUBJECT, 'Secret Santa {{event}}: je bent ingeschreven', 150),
      title: field(TITLE, 'Ingeschreven — {{event}}', 150),
      intro: field('Tekst', 'Dag {{naam}}, bedankt voor je inschrijving: je doet mee aan Secret Santa. Vul via je persoonlijke pagina je verlanglijstje in. Na de trekking zie je daar ook voor wie je een cadeau koopt.', INTRO_MAX, true),
      introNoList: field(NO_LIST, 'Dag {{naam}}, bedankt voor je inschrijving: je doet mee aan Secret Santa. Na de trekking zie je op je persoonlijke pagina voor wie je een cadeau koopt.', INTRO_MAX, true),
      button: field(BUTTON, 'Open mijn pagina', 60),
    },
  },
  drawn: {
    label: 'Trekking gedaan',
    description: 'Gaat naar alle deelnemers nadat je de trekking uitvoerde. Noem hier nooit wie wie getrokken heeft.',
    fields: {
      subject: field(SUBJECT, 'Secret Santa {{event}}: de trekking is gedaan', 150),
      title: field(TITLE, 'De trekking is gedaan!', 150),
      intro: field('Tekst', 'Dag {{naam}}, je weet nu voor wie je een cadeau koopt. Open je persoonlijke pagina om het te ontdekken en het verlanglijstje te bekijken.', INTRO_MAX, true),
      introNoList: field(NO_LIST, 'Dag {{naam}}, je weet nu voor wie je een cadeau koopt. Open je persoonlijke pagina om het te ontdekken.', INTRO_MAX, true),
      button: field(BUTTON, 'Bekijk wie ik getrokken heb', 60),
    },
  },
  reminder: {
    label: 'Herinnering',
    description: 'Gaat op het ingestelde herinneringsmoment of na een klik in het event. De tekst hangt af van de situatie van de deelnemer.',
    fields: {
      subject: field(SUBJECT, 'Herinnering Secret Santa {{event}}', 150),
      title: field(TITLE, 'Herinnering — {{event}}', 150),
      introNoWishlist: field('Tekst: voor de trekking, nog geen verlanglijstje', 'Dag {{naam}}, de trekking nadert, maar je hebt nog geen verlanglijstje ingevuld. Doe dat even, zodat je Secret Santa weet wat je blij maakt.', INTRO_MAX, true),
      introWishlist: field('Tekst: voor de trekking, verlanglijstje staat klaar', 'Dag {{naam}}, de trekking is nog niet gedaan. Je verlanglijstje staat al klaar, super!', INTRO_MAX, true),
      introDrawn: field('Tekst: na de trekking', 'Dag {{naam}}, een vriendelijke herinnering: vergeet je cadeau niet. Je vindt je getrokken collega en diens verlanglijstje op je persoonlijke pagina.', INTRO_MAX, true),
      introNoList: field('Tekst: voor de trekking (verlanglijstje uitgeschakeld)', 'Dag {{naam}}, de trekking is nog niet gedaan. Zodra het zover is, ontdek je op je persoonlijke pagina voor wie je een cadeau koopt.', INTRO_MAX, true),
      introDrawnNoList: field('Tekst: na de trekking (verlanglijstje uitgeschakeld)', 'Dag {{naam}}, een vriendelijke herinnering: vergeet je cadeau niet. Je vindt je getrokken collega op je persoonlijke pagina.', INTRO_MAX, true),
      button: field(BUTTON, 'Open mijn pagina', 60),
    },
  },
  messageNotice: {
    label: 'Anoniem bericht',
    description: 'Melding dat er een anoniem bericht klaarstaat. De inhoud van het bericht komt bewust nooit in de mail.',
    extraPlaceholders: [NOTICE_PLACEHOLDER],
    fields: {
      subject: field(SUBJECT, 'Secret Santa {{event}}: anoniem bericht', 150),
      title: field(TITLE, 'Je hebt een anoniem bericht', 150),
      intro: field('Tekst', 'Dag {{naam}}, {{wie}} heeft je een anoniem bericht gestuurd.', INTRO_MAX, true),
      button: field(BUTTON, 'Bericht lezen', 60),
    },
  },
}

function placeholdersOf(kind) {
  return [...PLACEHOLDERS, ...(KINDS[kind]?.extraPlaceholders || [])]
}

const PLACEHOLDER_RE = /\{\{\s*([^{}]*?)\s*\}\}/g

/** Alle plaatshouders in een tekst, in kleine letters. */
function findPlaceholders(text) {
  return [...String(text ?? '').matchAll(PLACEHOLDER_RE)].map(m => m[1].toLowerCase())
}

/** Vervangt {{naam}} enz.; onbekende plaatshouders blijven ongewijzigd staan. */
function fill(text, vars) {
  return String(text ?? '').replace(PLACEHOLDER_RE, (whole, key) => {
    const k = key.toLowerCase()
    return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k] ?? '') : whole
  })
}

/** Beschrijving voor het beheer: soorten, velden, standaardteksten en plaatshouders. */
function describeKinds() {
  return Object.entries(KINDS).map(([key, k]) => ({
    key,
    label: k.label,
    description: k.description,
    placeholders: placeholdersOf(key),
    fields: Object.entries(k.fields).map(([fkey, f]) => ({
      key: fkey, label: f.label, default: f.default, max: f.max, multiline: f.multiline,
    })),
  }))
}

// ── Opbouw ─────────────────────────────────────────────────────────
const oneLine = s => String(s ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim()

/** Tekst van het beheer als die er is, anders de standaardtekst. */
function pick(kind, fieldKey, custom) {
  const value = custom?.[fieldKey]
  return typeof value === 'string' && value.trim() ? value : KINDS[kind].fields[fieldKey].default
}

// Lege regel = nieuwe alinea, enkele regeleinde = <br>
function paragraphs(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

function layout({ title, intro, link, linkLabel, details = [] }) {
  const rows = details.filter(Boolean).map(d => `<li>${esc(d)}</li>`).join('')
  return `<!doctype html><html lang="nl"><body style="font-family:Arial,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:16px">
<h2 style="color:#b3202a">🎅 ${esc(title)}</h2>
${paragraphs(intro)}
${rows ? `<ul>${rows}</ul>` : ''}
${link ? `<p><a href="${esc(link)}" style="display:inline-block;background:#b3202a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">${esc(linkLabel)}</a></p>
<p style="font-size:12px;color:#666">Werkt de knop niet? Kopieer deze link: <br>${esc(link)}</p>` : ''}
<p style="font-size:12px;color:#666">Deze link is persoonlijk. Deel hem met niemand, anders kan iemand anders zien wie jij getrokken hebt.</p>
</body></html>`
}

function textBody(lines) {
  return lines.filter(l => l !== null && l !== undefined && l !== false).join('\n')
}

function eventDetails(event) {
  return [
    event.event_date ? `Datum: ${formatDate(event.event_date)}` : '',
    eventBudget(event) ? `Budget: ${eventBudget(event)}` : '',
  ]
}

function build(kind, { participant, event, link, custom }, { introField = 'intro', extraVars = {} } = {}) {
  const vars = {
    naam: participant.name,
    event: event.name,
    datum: formatDate(event.event_date),
    budget: eventBudget(event),
    link,
    ...extraVars,
  }
  const get = key => fill(pick(kind, key, custom), vars)

  const subject = oneLine(get('subject'))
  const title = oneLine(get('title'))
  const button = oneLine(get('button'))
  const intro = get(introField)
  const details = eventDetails(event).filter(Boolean)

  return {
    subject,
    html: layout({ title, intro, link, linkLabel: button, details }),
    text: textBody([intro, '', ...details, '', `${button}: ${link}`, '', 'Deel deze link met niemand.']),
  }
}

// Zonder verlanglijstje (wishlistEnabled === false) gebruiken de mails een eigen tekst
const listField = ctx => (ctx.wishlistEnabled === false ? 'introNoList' : 'intro')

function invite(ctx) {
  return build('invite', ctx, { introField: listField(ctx) })
}

// Bevestiging na zelf inschrijven via de openbare link
function signup(ctx) {
  return build('signup', ctx, { introField: listField(ctx) })
}

function drawn(ctx) {
  return build('drawn', ctx, { introField: listField(ctx) })
}

function reminder({ isDrawn, hasWishlist, ...ctx }) {
  const noList = ctx.wishlistEnabled === false
  let introField
  if (isDrawn) introField = noList ? 'introDrawnNoList' : 'introDrawn'
  else if (noList) introField = 'introNoList'
  else introField = hasWishlist ? 'introWishlist' : 'introNoWishlist'
  return build('reminder', ctx, { introField })
}

// Bewust zonder berichtinhoud: de mail verraadt niets, de link toont het bericht
function messageNotice({ fromRole, ...ctx }) {
  const wie = fromRole === 'giver' ? 'je Secret Santa' : 'de collega voor wie je een cadeau koopt'
  return build('messageNotice', ctx, { extraVars: { wie } })
}

/** Voorbeeldmail met verzonnen gegevens, voor voorbeeld en testmail in het beheer. */
function renderSample(kind, custom, variant) {
  const noList = ['noList', 'introNoList', 'introDrawnNoList'].includes(variant)
  const ctx = {
    participant: { name: 'Anna Peeters' },
    event: { name: 'Secret Santa 2026', event_date: '2026-12-18', budget: 15 },
    link: 'https://santa.vtiz.be/deelnemer/VOORBEELDLINK',
    custom,
    wishlistEnabled: !noList,
  }
  switch (kind) {
    case 'invite': return invite(ctx)
    case 'signup': return signup(ctx)
    case 'drawn': return drawn(ctx)
    case 'reminder': return reminder({
      ...ctx,
      isDrawn: variant === 'introDrawn' || variant === 'introDrawnNoList',
      hasWishlist: variant === 'introWishlist',
    })
    case 'messageNotice': return messageNotice({ ...ctx, fromRole: 'giver' })
    default: return null
  }
}

module.exports = {
  esc, formatDate, formatBudget, formatBudgetRange, fill, findPlaceholders,
  KINDS, PLACEHOLDERS, placeholdersOf, describeKinds, renderSample,
  invite, signup, drawn, reminder, messageNotice,
}
