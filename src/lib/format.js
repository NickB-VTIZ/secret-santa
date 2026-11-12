const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

export function formatDate(value) {
  if (!value) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  if (!m) return String(value)
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

export function formatDateTime(value) {
  if (!value) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(value))
  if (!m) return formatDate(value)
  return `${formatDate(value)} om ${m[4]}:${m[5]}`
}

export function formatBudget(budget) {
  if (budget === null || budget === undefined || budget === '') return ''
  return '€ ' + Number(budget).toFixed(2).replace('.', ',')
}
