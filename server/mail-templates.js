// ── Mailteksten (Nederlands) ───────────────────────────────────────
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

function layout({ title, intro, link, linkLabel, details = [], outro = '' }) {
  const rows = details.filter(Boolean).map(d => `<li>${esc(d)}</li>`).join('')
  const html = `<!doctype html><html lang="nl"><body style="font-family:Arial,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:16px">
<h2 style="color:#b3202a">🎅 ${esc(title)}</h2>
<p>${intro}</p>
${rows ? `<ul>${rows}</ul>` : ''}
${link ? `<p><a href="${esc(link)}" style="display:inline-block;background:#b3202a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">${esc(linkLabel)}</a></p>
<p style="font-size:12px;color:#666">Werkt de knop niet? Kopieer deze link: <br>${esc(link)}</p>` : ''}
${outro ? `<p>${outro}</p>` : ''}
<p style="font-size:12px;color:#666">Deze link is persoonlijk. Deel hem met niemand, anders kan iemand anders zien wie jij getrokken hebt.</p>
</body></html>`
  return html
}

function textBody(lines) {
  return lines.filter(l => l !== null && l !== undefined && l !== false).join('\n')
}

function eventDetails(event) {
  return [
    event.event_date ? `Datum: ${formatDate(event.event_date)}` : '',
    formatBudget(event.budget) ? `Budget: ${formatBudget(event.budget)}` : '',
  ]
}

function invite({ participant, event, link }) {
  const details = eventDetails(event)
  return {
    subject: `Secret Santa ${event.name}: jouw persoonlijke link`,
    html: layout({
      title: `Secret Santa — ${event.name}`,
      intro: `Dag ${esc(participant.name)}, je doet mee aan Secret Santa. Vul via je persoonlijke pagina je verlanglijstje in. Na de trekking zie je daar ook voor wie je een cadeau koopt.`,
      link, linkLabel: 'Open mijn pagina', details,
    }),
    text: textBody([
      `Dag ${participant.name},`, '',
      `Je doet mee aan Secret Santa "${event.name}".`,
      ...details.filter(Boolean), '',
      `Je persoonlijke pagina: ${link}`, '',
      'Deel deze link met niemand.',
    ]),
  }
}

// Bevestiging na zelf inschrijven via de openbare link
function signup({ participant, event, link }) {
  const details = eventDetails(event)
  return {
    subject: `Secret Santa ${event.name}: je bent ingeschreven`,
    html: layout({
      title: `Ingeschreven — ${event.name}`,
      intro: `Dag ${esc(participant.name)}, bedankt voor je inschrijving: je doet mee aan Secret Santa. Vul via je persoonlijke pagina je verlanglijstje in. Na de trekking zie je daar ook voor wie je een cadeau koopt.`,
      link, linkLabel: 'Open mijn pagina', details,
    }),
    text: textBody([
      `Dag ${participant.name},`, '',
      `Bedankt voor je inschrijving: je doet mee aan Secret Santa "${event.name}".`,
      ...details.filter(Boolean), '',
      `Je persoonlijke pagina: ${link}`, '',
      'Deel deze link met niemand.',
    ]),
  }
}

function drawn({ participant, event, link }) {
  const details = eventDetails(event)
  return {
    subject: `Secret Santa ${event.name}: de trekking is gedaan`,
    html: layout({
      title: 'De trekking is gedaan!',
      intro: `Dag ${esc(participant.name)}, je weet nu voor wie je een cadeau koopt. Open je persoonlijke pagina om het te ontdekken en het verlanglijstje te bekijken.`,
      link, linkLabel: 'Bekijk wie ik getrokken heb', details,
    }),
    text: textBody([
      `Dag ${participant.name},`, '',
      `De trekking voor "${event.name}" is gedaan.`,
      ...details.filter(Boolean), '',
      `Bekijk wie je getrokken hebt: ${link}`,
    ]),
  }
}

function reminder({ participant, event, link, isDrawn, hasWishlist }) {
  const details = eventDetails(event)
  let intro
  if (!isDrawn) {
    intro = hasWishlist
      ? 'De trekking is nog niet gedaan. Je verlanglijstje staat al klaar, super!'
      : 'De trekking nadert, maar je hebt nog geen verlanglijstje ingevuld. Doe dat even, zodat je Secret Santa weet wat je blij maakt.'
  } else {
    intro = 'Een vriendelijke herinnering: vergeet je cadeau niet. Je vindt je getrokken collega en diens verlanglijstje op je persoonlijke pagina.'
  }
  return {
    subject: `Herinnering Secret Santa ${event.name}`,
    html: layout({ title: `Herinnering — ${event.name}`, intro: `Dag ${esc(participant.name)}, ${esc(intro)}`, link, linkLabel: 'Open mijn pagina', details }),
    text: textBody([`Dag ${participant.name},`, '', intro, ...details.filter(Boolean), '', `Je pagina: ${link}`]),
  }
}

// Bewust zonder berichtinhoud: de mail verraadt niets, de link toont het bericht
function messageNotice({ participant, event, link, fromRole }) {
  const who = fromRole === 'giver' ? 'je Secret Santa' : 'de collega voor wie je een cadeau koopt'
  return {
    subject: `Secret Santa ${event.name}: anoniem bericht`,
    html: layout({
      title: 'Je hebt een anoniem bericht',
      intro: `Dag ${esc(participant.name)}, ${esc(who)} heeft je een anoniem bericht gestuurd.`,
      link, linkLabel: 'Bericht lezen',
    }),
    text: textBody([`Dag ${participant.name},`, '', `${who} heeft je een anoniem bericht gestuurd.`, `Lezen: ${link}`]),
  }
}

module.exports = { esc, formatDate, formatBudget, invite, signup, drawn, reminder, messageNotice }
