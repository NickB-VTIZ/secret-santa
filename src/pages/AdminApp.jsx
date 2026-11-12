import { useCallback, useEffect, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { admin, getToken, setToken } from '../lib/api.js'
import Login from './Login.jsx'
import ChangePassword from './ChangePassword.jsx'
import Events from './Events.jsx'
import EventDetail from './EventDetail.jsx'

export default function AdminApp() {
  const [state, setState] = useState(getToken() ? 'loading' : 'out')
  const [me, setMe] = useState(null)
  const [showPassword, setShowPassword] = useState(false)

  const loadMe = useCallback(async () => {
    try {
      setMe(await admin.get('/api/admin/me'))
      setState('in')
    } catch {
      setToken(null)
      setState('out')
    }
  }, [])

  useEffect(() => {
    if (getToken()) loadMe()
    const onLogout = () => { setMe(null); setState('out') }
    window.addEventListener('admin-logout', onLogout)
    return () => window.removeEventListener('admin-logout', onLogout)
  }, [loadMe])

  const logout = () => { setToken(null); setMe(null); setState('out') }

  if (state === 'loading') return <div className="center-screen">Laden…</div>
  if (state === 'out') return <Login onLoggedIn={loadMe} />

  if (me?.mustChangePassword || showPassword) {
    return (
      <ChangePassword
        forced={!!me?.mustChangePassword}
        onDone={async () => { setShowPassword(false); await loadMe() }}
        onCancel={() => setShowPassword(false)}
      />
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">🎅 VTIZ Secret Santa</Link>
        <nav className="topbar-right">
          <span className="muted hide-mobile">{me?.email}</span>
          <button className="btn btn-ghost" onClick={() => setShowPassword(true)}>Wachtwoord</button>
          <button className="btn btn-ghost" onClick={logout}>Afmelden</button>
        </nav>
      </header>

      <main className="container">
        {!me?.mailConfigured && (
          <div className="alert alert-warn">
            RESEND_API_KEY is niet ingesteld: uitnodigingen en herinneringen worden niet verstuurd.
          </div>
        )}
        <Routes>
          <Route path="/" element={<Events />} />
          <Route path="events/:id" element={<EventDetail />} />
          <Route path="*" element={<div className="card">Pagina niet gevonden. <Link to="/">Terug naar de events</Link></div>} />
        </Routes>
      </main>
    </div>
  )
}
