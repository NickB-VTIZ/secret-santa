import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { participantApi } from '../lib/api.js'
import { formatBudgetRange, formatDate, formatDateTime } from '../lib/format.js'
import { useToast } from '../hooks/useToast.jsx'

export default function Participant() {
  const { token } = useParams()
  const api = useMemo(() => participantApi(token), [token])
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setData(await api.get())
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  // Na de trekking af en toe controleren of er nieuwe berichten zijn (enkel als berichten aan staan)
  const checkMessages = !!data?.event.drawn && !!data?.event.messagesEnabled
  useEffect(() => {
    if (!checkMessages) return undefined
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [checkMessages, load])

  if (error && !data) {
    return (
      <div className="center-screen">
        <div className="card login-card">
          <div className="login-emoji">🔒</div>
          <h1>Link niet geldig</h1>
          <p className="muted">{error} Controleer of je de volledige link uit de mail gebruikt.</p>
        </div>
      </div>
    )
  }
  if (!data) return <div className="center-screen">Laden…</div>

  const { event } = data
  const wishlistOn = event.wishlistEnabled !== false
  const messagesOn = event.messagesEnabled !== false

  return (
    <div className="app participant">
      <header className="topbar">
        <span className="brand">🎅 {event.name}</span>
      </header>

      <main className="container narrow">
        <section className="card hero">
          <h1>Hallo {data.name}!</h1>
          {event.description && <p className="pre">{event.description}</p>}
          <dl className="facts">
            <div><dt>Budget</dt><dd>{formatBudgetRange(event.budgetMin, event.budgetMax) || 'Vrij'}</dd></div>
            {event.eventDate && <div><dt>Datum</dt><dd>{formatDate(event.eventDate)}</dd></div>}
          </dl>
        </section>

        {!event.drawn && (
          <div className="alert alert-info">
            De trekking is nog niet gebeurd. Je krijgt een mail zodra het zover is.
            {wishlistOn && ' Vul ondertussen alvast je verlanglijstje in.'}
          </div>
        )}

        {event.drawn && <Receiver data={data} wishlistOn={wishlistOn} />}

        {wishlistOn && <Wishlist initial={data.wishlist} api={api} toast={toast} />}

        {event.drawn && messagesOn && data.receiver && (
          <Messages data={data} api={api} reload={load} toast={toast} />
        )}

        <p className="muted small center">Deze pagina is persoonlijk. Deel de link niet met anderen.</p>
      </main>
    </div>
  )
}

// ── Voor wie koop ik een cadeau ──
function Receiver({ data, wishlistOn }) {
  const [revealed, setRevealed] = useState(false)
  const r = data.receiver

  if (!r) {
    return <div className="alert alert-warn">Er is geen trekking voor jou gevonden. Neem contact op met de organisator.</div>
  }

  return (
    <section className="card stack">
      <h2>🎁 Jij koopt een cadeau voor…</h2>
      {!revealed ? (
        <button className="btn btn-primary btn-big" onClick={() => setRevealed(true)}>Toon wie ik getrokken heb</button>
      ) : (
        <>
          <div className="reveal">{r.name}</div>
          {wishlistOn && (
            <div>
              <h3>Verlanglijstje van {r.name}</h3>
              {r.wishlist ? <p className="pre">{r.wishlist}</p> : <p className="muted">{r.name} heeft nog geen verlanglijstje ingevuld.</p>}
            </div>
          )}
        </>
      )}
    </section>
  )
}

// ── Mijn eigen verlanglijstje ──
function Wishlist({ initial, api, toast }) {
  const [text, setText] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [busy, setBusy] = useState(false)

  const save = async e => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.saveWishlist(text)
      setSaved(text)
      toast('Verlanglijstje opgeslagen')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card stack" onSubmit={save}>
      <h2>📝 Mijn verlanglijstje</h2>
      <p className="muted small">Alleen de persoon die jou getrokken heeft, ziet dit lijstje. Tips, maten, kleuren, wat je liever niet krijgt…</p>
      <textarea rows={5} maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder="Bijvoorbeeld: een goed boek, chocolade, een leuke mok…" />
      <div className="row">
        <button className="btn btn-primary" disabled={busy || text === saved}>{busy ? 'Bezig…' : 'Opslaan'}</button>
        {text === saved && saved && <span className="muted small">Opgeslagen</span>}
      </div>
    </form>
  )
}

// ── Anonieme berichten: twee gesprekken op één plaats ──
const CONVERSATIONS = [
  { key: 'giver', label: 'Mijn Secret Santa' },
  { key: 'receiver', label: 'Mijn cadeaukind' },
]

function Messages({ data, api, reload, toast }) {
  const threads = {
    giver: data.fromGiver || [],
    receiver: data.toReceiver || [],
  }
  // Eerste gesprek met nieuwe berichten meteen tonen
  const [active, setActive] = useState(
    () => CONVERSATIONS.find(c => threads[c.key].some(m => m.isNew))?.key || 'giver',
  )
  // Het geopende gesprek toont "Nieuw" per bericht, de andere tab telt ze
  const unread = key => (key === active ? 0 : threads[key].filter(m => m.isNew).length)
  const open = key => setActive(key)

  const r = data.receiver
  const copy = active === 'giver'
    ? {
        title: 'Anoniem gesprek met je Secret Santa',
        hint: 'Je Secret Santa blijft anoniem, maar je kan wel een vraag stellen of een tip geven.',
      }
    : {
        title: `Anoniem gesprek met ${r.name}`,
        hint: `${r.name} weet niet van wie je berichten komen.`,
      }

  return (
    <section className="card stack">
      <h2>💬 Anonieme berichten</h2>
      <div className="tabs" role="tablist">
        {CONVERSATIONS.map(c => {
          const n = unread(c.key)
          return (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={active === c.key}
              className={`tab ${active === c.key ? 'tab-active' : ''}`}
              onClick={() => open(c.key)}
            >
              {c.label}
              {n > 0 && <span className="badge badge-new">{n} nieuw</span>}
            </button>
          )
        })}
      </div>
      <Thread
        key={active}
        title={copy.title}
        hint={copy.hint}
        messages={threads[active]}
        to={active}
        api={api}
        reload={reload}
        toast={toast}
      />
    </section>
  )
}

function Thread({ title, hint, messages, to, api, reload, toast }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async e => {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    try {
      await api.sendMessage(to, body)
      setBody('')
      toast('Bericht verstuurd')
      await reload()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="thread">
      <h3>{title}</h3>
      <p className="muted small">{hint}</p>

      {messages.length === 0 && <p className="muted small">Nog geen berichten.</p>}
      <div className="bubbles">
        {messages.map(m => (
          <div key={m.id} className={`bubble ${m.mine ? 'bubble-mine' : 'bubble-theirs'}`}>
            {m.isNew && <span className="badge badge-new">Nieuw</span>}
            <div className="pre">{m.body}</div>
            <div className="bubble-meta">{m.mine ? 'Jij' : 'Anoniem'} · {formatDateTime(m.createdAt)}</div>
          </div>
        ))}
      </div>

      <form className="stack" onSubmit={send}>
        <textarea rows={3} maxLength={1000} value={body} onChange={e => setBody(e.target.value)} placeholder="Schrijf een bericht…" />
        <div className="row"><button className="btn" disabled={busy || !body.trim()}>{busy ? 'Bezig…' : 'Versturen'}</button></div>
      </form>
    </div>
  )
}
