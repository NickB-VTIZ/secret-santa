import { useState } from 'react'
import { admin } from '../lib/api.js'
import { useToast } from '../hooks/useToast.jsx'

export default function ChangePassword({ forced, onDone, onCancel }) {
  const toast = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async e => {
    e.preventDefault()
    setError('')
    if (newPassword !== repeat) return setError('De twee nieuwe wachtwoorden zijn niet gelijk.')
    setBusy(true)
    try {
      await admin.post('/api/admin/password', { currentPassword, newPassword })
      toast('Wachtwoord gewijzigd')
      await onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-screen">
      <form className="card login-card" onSubmit={submit}>
        <h1>Wachtwoord wijzigen</h1>
        {forced && <p className="muted">Je gebruikt een tijdelijk wachtwoord. Kies nu een eigen wachtwoord (minstens 10 tekens).</p>}

        <label>
          Huidig wachtwoord
          <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <label>
          Nieuw wachtwoord
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" minLength={10} required />
        </label>
        <label>
          Herhaal nieuw wachtwoord
          <input type="password" value={repeat} onChange={e => setRepeat(e.target.value)} autoComplete="new-password" minLength={10} required />
        </label>

        {error && <div className="alert alert-error">{error}</div>}
        <div className="row">
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Bezig…' : 'Opslaan'}</button>
          {!forced && <button type="button" className="btn" onClick={onCancel}>Annuleren</button>}
        </div>
      </form>
    </div>
  )
}
