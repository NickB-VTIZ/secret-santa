import { useState } from 'react'
import { publicApi, setToken } from '../lib/api.js'

export default function Login({ onLoggedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async e => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await publicApi.post('/api/admin/login', { email, password })
      setToken(r.token)
      await onLoggedIn()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-screen">
      <form className="card login-card" onSubmit={submit}>
        <div className="login-emoji">🎅</div>
        <h1>VTIZ Secret Santa</h1>
        <p className="muted">Beheer voor de organisator</p>

        <label>
          E-mailadres
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label>
          Wachtwoord
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>

        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Bezig…' : 'Aanmelden'}</button>
      </form>
    </div>
  )
}
