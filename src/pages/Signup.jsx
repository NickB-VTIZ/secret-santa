import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { publicApi } from '../lib/api.js'
import { formatBudget, formatDate } from '../lib/format.js'

/** Openbare inschrijfpagina: één link voor alle leerkrachten, zonder aanmelding. */
export default function Signup() {
  const { code } = useParams()
  const [info, setInfo] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', consent: false, website: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  useEffect(() => {
    let cancelled = false
    publicApi.get(`/api/signup/${encodeURIComponent(code)}`)
      .then(data => { if (!cancelled) setInfo(data) })
      .catch(e => { if (!cancelled) setLoadError(e.message) })
    return () => { cancelled = true }
  }, [code])

  const submit = async e => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await publicApi.post(`/api/signup/${encodeURIComponent(code)}`, form)
      setDone(r)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <div className="center-screen">
        <div className="card login-card">
          <div className="login-emoji">🔒</div>
          <h1>Link niet geldig</h1>
          <p className="muted">{loadError} Controleer of je de volledige link gebruikt.</p>
        </div>
      </div>
    )
  }
  if (!info) return <div className="center-screen">Laden…</div>

  const { event } = info

  return (
    <div className="app participant">
      <header className="topbar">
        <span className="brand">🎅 {event.name}</span>
      </header>

      <main className="container narrow">
        <section className="card hero">
          <h1>Doe mee met Secret Santa</h1>
          {event.description && <p className="pre">{event.description}</p>}
          <dl className="facts">
            <div><dt>Budget</dt><dd>{event.budget !== null ? formatBudget(event.budget) : 'Vrij'}</dd></div>
            {event.eventDate && <div><dt>Datum</dt><dd>{formatDate(event.eventDate)}</dd></div>}
          </dl>
        </section>

        {done ? (
          <section className="card stack">
            <div className="login-emoji">🎁</div>
            <h2 className="center">Bedankt, je staat op de lijst!</h2>
            <p className="center">
              {done.mailSent
                ? 'We sturen je zo een mail met je persoonlijke link. Daar vul je later je verlanglijstje in en zie je na de trekking voor wie je een cadeau koopt.'
                : 'Je inschrijving is genoteerd. Je ontvangt later je persoonlijke link van de organisator.'}
            </p>
            <p className="muted small center">Geen mail gekregen? Kijk in je ongewenste mail of schrijf je opnieuw in met hetzelfde e-mailadres: dan sturen we de link nog eens.</p>
          </section>
        ) : !info.open ? (
          <div className="alert alert-warn">{info.closedReason}</div>
        ) : (
          <form className="card stack" onSubmit={submit}>
            <h2>Schrijf je in</h2>

            <label>
              Je naam
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                maxLength={150}
                autoComplete="name"
                placeholder="Voornaam Achternaam"
                required
                autoFocus
              />
            </label>

            <label>
              Je e-mailadres
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                maxLength={190}
                autoComplete="email"
                placeholder="voornaam.achternaam@vtiz.be"
                required
              />
            </label>

            {/* Lokaas voor bots: mensen zien en vullen dit nooit in */}
            <div className="hp" aria-hidden="true">
              <label>
                Website
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                />
              </label>
            </div>

            <label className="consent">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={e => setForm(f => ({ ...f, consent: e.target.checked }))}
                required
              />
              <span>
                Ik ga akkoord en wil meedoen aan Secret Santa. Mijn naam wordt gedeeld met de organisator en mijn
                e-mailadres wordt enkel gebruikt voor de mails over dit event.
              </span>
            </label>

            {error && <div className="alert alert-error">{error}</div>}

            <button className="btn btn-primary" disabled={busy || !form.consent}>
              {busy ? 'Bezig…' : 'Ik doe mee'}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
