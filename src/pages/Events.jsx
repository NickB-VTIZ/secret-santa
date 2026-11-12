import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { admin } from '../lib/api.js'
import { formatBudget, formatDate } from '../lib/format.js'
import { useToast } from '../hooks/useToast.jsx'
import EventForm from './EventForm.jsx'

export default function Events() {
  const toast = useToast()
  const navigate = useNavigate()
  const [events, setEvents] = useState(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    admin.get('/api/admin/events').then(setEvents).catch(e => toast(e.message, 'error'))
  }, [toast])

  const create = async values => {
    const r = await admin.post('/api/admin/events', values)
    toast('Event aangemaakt')
    navigate(`/events/${r.id}`)
  }

  return (
    <div className="stack">
      <div className="row row-between">
        <h1>Events</h1>
        {!creating && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Nieuw event</button>}
      </div>

      {creating && (
        <section className="card">
          <h2>Nieuw event</h2>
          <EventForm submitLabel="Event aanmaken" onSubmit={create} onCancel={() => setCreating(false)} />
        </section>
      )}

      {events === null && <div className="muted">Laden…</div>}
      {events && events.length === 0 && !creating && (
        <div className="card empty">
          <div className="empty-emoji">🎁</div>
          <p>Nog geen events. Maak je eerste Secret Santa aan.</p>
        </div>
      )}

      <div className="list">
        {events?.map(e => (
          <Link key={e.id} to={`/events/${e.id}`} className="card card-link">
            <div className="row row-between">
              <strong>{e.name}</strong>
              <span className={`badge ${e.drawnAt ? 'badge-ok' : 'badge-wait'}`}>{e.drawnAt ? 'Getrokken' : 'Nog niet getrokken'}</span>
            </div>
            <div className="muted small">
              {e.participantCount} deelnemer{e.participantCount === 1 ? '' : 's'} · {e.invitedCount} uitgenodigd
              {e.budget !== null && ` · budget ${formatBudget(e.budget)}`}
              {e.eventDate && ` · ${formatDate(e.eventDate)}`}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
