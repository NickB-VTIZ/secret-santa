import { useState } from 'react'

/** Formulier voor het aanmaken en bewerken van een event. */
export default function EventForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    description: initial?.description || '',
    budget: initial?.budget ?? '',
    eventDate: initial?.eventDate || '',
    reminderAt: initial?.reminderAt || '',
    wishlistEnabled: initial?.wishlistEnabled ?? true,
    messagesEnabled: initial?.messagesEnabled ?? true,
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))
  const toggle = key => e => setForm(f => ({ ...f, [key]: e.target.checked }))

  const submit = async e => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onSubmit({ ...form, budget: form.budget === '' ? null : form.budget })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label>
        Naam van het event
        <input value={form.name} onChange={set('name')} maxLength={150} placeholder="Secret Santa 2026" required autoFocus />
      </label>
      <label>
        Beschrijving (optioneel)
        <textarea value={form.description} onChange={set('description')} rows={3} maxLength={2000} placeholder="Wanneer en waar wisselen we cadeaus uit?" />
      </label>
      <div className="grid-3">
        <label>
          Budget (€)
          <input type="number" min="0" max="9999" step="0.5" value={form.budget} onChange={set('budget')} placeholder="15" />
        </label>
        <label>
          Datum cadeau-uitwisseling
          <input type="date" value={form.eventDate} onChange={set('eventDate')} />
        </label>
        <label>
          Herinneringsmail op
          <input type="datetime-local" value={form.reminderAt} onChange={set('reminderAt')} />
        </label>
      </div>
      <fieldset className="stack">
        <legend>Functies voor de deelnemers</legend>
        <label className="row">
          <input type="checkbox" checked={form.wishlistEnabled} onChange={toggle('wishlistEnabled')} />
          <span>Verlanglijstje: deelnemers vullen een lijstje in en zien dat van hun getrokken collega</span>
        </label>
        <label className="row">
          <input type="checkbox" checked={form.messagesEnabled} onChange={toggle('messagesEnabled')} />
          <span>Anonieme berichten: deelnemers kunnen anoniem met elkaar chatten na de trekking</span>
        </label>
      </fieldset>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Bezig…' : submitLabel}</button>
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Annuleren</button>}
      </div>
    </form>
  )
}
