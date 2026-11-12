import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { admin } from '../lib/api.js'
import { formatBudget, formatDate, formatDateTime } from '../lib/format.js'
import { useToast } from '../hooks/useToast.jsx'
import EventForm from './EventForm.jsx'

const MIN_TO_DRAW = 3
const KIND_LABEL = { invite: 'Uitnodigingen', drawn: 'Trekkingsmails', reminder: 'Herinneringen' }

export default function EventDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await admin.get(`/api/admin/events/${id}`))
    } catch (e) {
      if (e.status === 404) setNotFound(true)
      else toast(e.message, 'error')
    }
  }, [id, toast])

  useEffect(() => { load() }, [load])

  // Zolang er mails verstuurd worden, de voortgang blijven opvragen
  const running = data?.mailing?.running
  useEffect(() => {
    if (!running) return undefined
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
  }, [running, load])

  // Voert een actie uit, toont het resultaat en herlaadt
  const act = async (fn, okMessage) => {
    try {
      const r = await fn()
      if (okMessage) toast(typeof okMessage === 'function' ? okMessage(r) : okMessage)
      await load()
      return r
    } catch (e) {
      toast(e.message, 'error')
      return null
    }
  }

  if (notFound) return <div className="card">Event niet gevonden. <Link to="/">Terug naar de events</Link></div>
  if (!data) return <div className="muted">Laden…</div>

  const { event, participants, exclusions, mailing, mailConfigured } = data
  const drawn = !!event.drawnAt
  const byId = Object.fromEntries(participants.map(p => [p.id, p]))
  const notInvited = participants.filter(p => !p.invitedAt).length

  const saveEvent = async values => {
    await admin.put(`/api/admin/events/${id}`, values)
    toast('Event opgeslagen')
    setEditing(false)
    await load()
  }

  const deleteEvent = async () => {
    if (!window.confirm(`Event "${event.name}" definitief verwijderen, met alle deelnemers en berichten?`)) return
    try {
      await admin.del(`/api/admin/events/${id}`)
      toast('Event verwijderd')
      navigate('/')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  const draw = () => {
    if (!window.confirm('Nu trekken? Elke deelnemer krijgt een mail met een link naar zijn of haar persoonlijke pagina. Jij ziet nooit wie wie getrokken heeft.')) return
    act(() => admin.post(`/api/admin/events/${id}/draw`), 'Getrokken! De mails worden verstuurd.')
  }

  const resetDraw = () => {
    if (!window.confirm('De trekking ongedaan maken? Alle koppels en anonieme berichten worden gewist.')) return
    act(() => admin.post(`/api/admin/events/${id}/reset-draw`), 'Trekking hersteld')
  }

  return (
    <div className="stack">
      <div>
        <Link to="/" className="back">← Alle events</Link>
      </div>

      {/* ── Event ── */}
      <section className="card">
        {editing ? (
          <>
            <h2>Event bewerken</h2>
            <EventForm initial={event} submitLabel="Opslaan" onSubmit={saveEvent} onCancel={() => setEditing(false)} />
          </>
        ) : (
          <>
            <div className="row row-between">
              <h1>{event.name}</h1>
              <span className={`badge ${drawn ? 'badge-ok' : 'badge-wait'}`}>{drawn ? 'Getrokken' : 'Nog niet getrokken'}</span>
            </div>
            {event.description && <p className="pre">{event.description}</p>}
            <dl className="facts">
              <div><dt>Budget</dt><dd>{event.budget !== null ? formatBudget(event.budget) : '—'}</dd></div>
              <div><dt>Datum</dt><dd>{event.eventDate ? formatDate(event.eventDate) : '—'}</dd></div>
              <div>
                <dt>Herinnering</dt>
                <dd>
                  {event.reminderAt ? formatDateTime(event.reminderAt) : '—'}
                  {event.reminderAt && (event.reminderSentAt ? ' (verzonden)' : ' (gepland)')}
                </dd>
              </div>
              {drawn && <div><dt>Getrokken op</dt><dd>{formatDateTime(event.drawnAt)}</dd></div>}
            </dl>
            <div className="row">
              <button className="btn" onClick={() => setEditing(true)}>Bewerken</button>
              <button className="btn btn-danger-ghost" onClick={deleteEvent}>Verwijderen</button>
            </div>
          </>
        )}
      </section>

      {/* ── Mailvoortgang ── */}
      {mailing && (
        <div className={`alert ${mailing.running ? 'alert-info' : mailing.failed ? 'alert-warn' : 'alert-ok'}`}>
          <strong>{KIND_LABEL[mailing.kind] || 'Mails'}:</strong>{' '}
          {mailing.running ? 'bezig… ' : 'klaar. '}
          {mailing.sent}/{mailing.total} verstuurd
          {mailing.failed > 0 && `, ${mailing.failed} mislukt (zie de serverlog)`}
          {mailing.skipped > 0 && `, ${mailing.skipped} overgeslagen (geen API-sleutel)`}
        </div>
      )}

      {/* ── Acties ── */}
      <section className="card stack">
        <h2>Acties</h2>
        <div className="row wrap">
          <button
            className="btn"
            disabled={running || participants.length === 0 || !mailConfigured}
            onClick={() => act(() => admin.post(`/api/admin/events/${id}/invite`), r => `${r.total} uitnodiging(en) worden verstuurd`)}
          >
            ✉️ Nodig nog niet uitgenodigden uit ({notInvited})
          </button>
          <button
            className="btn"
            disabled={running || participants.length === 0 || !mailConfigured}
            onClick={() => {
              if (window.confirm('Alle deelnemers opnieuw uitnodigen?')) {
                act(() => admin.post(`/api/admin/events/${id}/invite`, { all: true }), r => `${r.total} uitnodiging(en) worden verstuurd`)
              }
            }}
          >
            Iedereen opnieuw uitnodigen
          </button>
          <button
            className="btn"
            disabled={running || participants.length === 0 || !mailConfigured}
            onClick={() => act(() => admin.post(`/api/admin/events/${id}/reminders`), r => `${r.total} herinnering(en) worden verstuurd`)}
          >
            🔔 Herinnering nu versturen
          </button>
        </div>

        <div className="row wrap">
          {!drawn ? (
            <button className="btn btn-primary" disabled={running || participants.length < MIN_TO_DRAW} onClick={draw}>
              🎲 Trek nu
            </button>
          ) : (
            <button className="btn btn-danger" disabled={running} onClick={resetDraw}>↩︎ Trekking ongedaan maken</button>
          )}
          {!drawn && participants.length < MIN_TO_DRAW && (
            <span className="muted small">Voeg minstens {MIN_TO_DRAW} deelnemers toe om te kunnen trekken.</span>
          )}
        </div>
        <p className="muted small">
          De trekking is geheim: ook jij als organisator ziet niet wie wie getrokken heeft. Deelnemers bekijken hun trekking via hun persoonlijke link.
        </p>
      </section>

      {/* ── Deelnemers ── */}
      <Participants
        eventId={id}
        participants={participants}
        drawn={drawn}
        running={running}
        mailConfigured={mailConfigured}
        act={act}
        toast={toast}
        onChanged={load}
      />

      {/* ── Uitsluitingen ── */}
      <Exclusions eventId={id} participants={participants} exclusions={exclusions} byId={byId} drawn={drawn} act={act} />
    </div>
  )
}

// ════════════════════ Deelnemers ════════════════════
function Participants({ eventId, participants, drawn, running, mailConfigured, act, toast, onChanged }) {
  const [mode, setMode] = useState(null) // null | 'one' | 'paste'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [text, setText] = useState('')
  const [report, setReport] = useState(null)
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')

  const addOne = async e => {
    e.preventDefault()
    const r = await act(() => admin.post(`/api/admin/events/${eventId}/participants`, { name, email }), r => (r.added ? 'Deelnemer toegevoegd' : 'Dit e-mailadres stond er al in'))
    if (r) { setName(''); setEmail('') }
  }

  const addPasted = async e => {
    e.preventDefault()
    const r = await act(() => admin.post(`/api/admin/events/${eventId}/participants`, { text }), r => `${r.added} deelnemer(s) toegevoegd`)
    if (r) {
      setReport(r)
      if (!r.errors.length && !r.skipped.length) { setText(''); setMode(null) }
    }
  }

  const startEdit = p => { setEditId(p.id); setEditName(p.name); setEditEmail(p.email) }

  const saveEdit = async e => {
    e.preventDefault()
    const r = await act(() => admin.put(`/api/admin/events/${eventId}/participants/${editId}`, { name: editName, email: editEmail }), 'Deelnemer bijgewerkt')
    if (r) setEditId(null)
  }

  const remove = p => {
    if (!window.confirm(`${p.name} verwijderen uit dit event?`)) return
    act(() => admin.del(`/api/admin/events/${eventId}/participants/${p.id}`), 'Deelnemer verwijderd')
  }

  const invite = p => act(() => admin.post(`/api/admin/events/${eventId}/invite`, { participantId: p.id }), `Uitnodiging naar ${p.name} wordt verstuurd`)

  return (
    <section className="card stack">
      <div className="row row-between wrap">
        <h2>Deelnemers ({participants.length})</h2>
        {!drawn && (
          <div className="row">
            <button className="btn" onClick={() => { setMode(mode === 'one' ? null : 'one'); setReport(null) }}>+ Toevoegen</button>
            <button className="btn" onClick={() => { setMode(mode === 'paste' ? null : 'paste'); setReport(null) }}>📋 Lijst plakken</button>
          </div>
        )}
      </div>

      {drawn && <p className="muted small">De trekking is gedaan: deelnemers kunnen niet meer toegevoegd of verwijderd worden. Herstel eerst de trekking om dat te doen.</p>}

      {mode === 'one' && !drawn && (
        <form className="inline-form" onSubmit={addOne}>
          <input placeholder="Naam" value={name} onChange={e => setName(e.target.value)} maxLength={150} />
          <input type="email" placeholder="E-mailadres" value={email} onChange={e => setEmail(e.target.value)} required />
          <button className="btn btn-primary">Toevoegen</button>
        </form>
      )}

      {mode === 'paste' && !drawn && (
        <form className="stack" onSubmit={addPasted}>
          <label>
            Plak een lijst met één deelnemer per regel
            <textarea
              rows={6}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={'Jan Peeters; jan.peeters@vtiz.be\nAn Janssens, an.janssens@vtiz.be\nPiet Claes <piet.claes@vtiz.be>'}
              required
            />
          </label>
          <p className="muted small">{'Ondersteund: naam en e-mail gescheiden door puntkomma, komma of tab, of in de vorm Naam <mail>. Een kopregel wordt overgeslagen. Zonder naam wordt die afgeleid van het e-mailadres.'}</p>
          <div className="row"><button className="btn btn-primary">Lijst importeren</button></div>
        </form>
      )}

      {report && (report.errors.length > 0 || report.skipped.length > 0) && (
        <div className="alert alert-warn">
          {report.skipped.length > 0 && <div>Al aanwezig (overgeslagen): {report.skipped.join(', ')}</div>}
          {report.errors.map(er => <div key={er.line}>Regel {er.line}: {er.error} ({er.text})</div>)}
        </div>
      )}

      {participants.length === 0 ? (
        <p className="muted">Nog geen deelnemers.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Naam</th><th>E-mail</th><th>Uitgenodigd</th><th>Lijstje</th><th /></tr>
            </thead>
            <tbody>
              {participants.map(p => (
                editId === p.id ? (
                  <tr key={p.id}>
                    <td colSpan={5}>
                      <form className="inline-form" onSubmit={saveEdit}>
                        <input value={editName} onChange={e => setEditName(e.target.value)} maxLength={150} required />
                        <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} required />
                        <button className="btn btn-primary">Opslaan</button>
                        <button type="button" className="btn" onClick={() => setEditId(null)}>Annuleren</button>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="muted">{p.email}</td>
                    <td>{p.invitedAt ? <span title={formatDateTime(p.invitedAt)}>✔︎ {formatDate(p.invitedAt)}</span> : <span className="muted">Nee</span>}</td>
                    <td>{p.hasWishlist ? '✔︎' : <span className="muted">—</span>}</td>
                    <td className="actions">
                      <button className="btn btn-small" disabled={running || !mailConfigured} onClick={() => invite(p)} title="Uitnodiging (opnieuw) versturen">✉️</button>
                      <button className="btn btn-small" onClick={() => startEdit(p)} title="Bewerken">✏️</button>
                      {!drawn && <button className="btn btn-small" onClick={() => remove(p)} title="Verwijderen">🗑️</button>}
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ════════════════════ Uitsluitingen ════════════════════
function Exclusions({ eventId, participants, exclusions, byId, drawn, act }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')

  const options = useMemo(() => participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>), [participants])

  const add = async e => {
    e.preventDefault()
    const r = await act(() => admin.post(`/api/admin/events/${eventId}/exclusions`, { aId: a, bId: b }), 'Uitsluiting toegevoegd')
    if (r) { setA(''); setB('') }
  }

  return (
    <section className="card stack">
      <h2>Uitsluitingen ({exclusions.length})</h2>
      <p className="muted small">Twee mensen die elkaar niet mogen trekken (bv. partners). De uitsluiting geldt in beide richtingen.</p>

      {!drawn && participants.length >= 2 && (
        <form className="inline-form" onSubmit={add}>
          <select value={a} onChange={e => setA(e.target.value)} required>
            <option value="">Kies een deelnemer…</option>
            {options}
          </select>
          <span className="muted">en</span>
          <select value={b} onChange={e => setB(e.target.value)} required>
            <option value="">Kies een deelnemer…</option>
            {options}
          </select>
          <button className="btn btn-primary">Toevoegen</button>
        </form>
      )}

      {exclusions.length === 0 ? (
        <p className="muted">Geen uitsluitingen.</p>
      ) : (
        <ul className="chips">
          {exclusions.map(x => (
            <li key={x.id} className="chip">
              {byId[x.aId]?.name || '?'} ↔ {byId[x.bId]?.name || '?'}
              {!drawn && (
                <button
                  className="chip-x"
                  aria-label="Uitsluiting verwijderen"
                  onClick={() => act(() => admin.del(`/api/admin/events/${eventId}/exclusions/${x.id}`), 'Uitsluiting verwijderd')}
                >×</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
