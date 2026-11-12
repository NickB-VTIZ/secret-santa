import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { admin } from '../lib/api.js'
import { useToast } from '../hooks/useToast.jsx'

const REMINDER_VARIANTS = [
  { key: 'introNoWishlist', label: 'Nog geen verlanglijstje' },
  { key: 'introWishlist', label: 'Wel verlanglijstje' },
  { key: 'introDrawn', label: 'Na de trekking' },
]

/** Beheerpagina: afzender en mailteksten aanpassen. */
export default function MailSettings() {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [sender, setSender] = useState({ fromName: '', fromEmail: '', replyTo: '' })
  const [texts, setTexts] = useState({})
  const [activeKind, setActiveKind] = useState('')
  const [variant, setVariant] = useState('introNoWishlist')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const fieldRefs = useRef({})
  const lastFocus = useRef(null)

  const load = useCallback(async () => {
    try {
      const d = await admin.get('/api/admin/mail-settings')
      const t = {}
      for (const kind of d.kinds) {
        t[kind.key] = {}
        for (const f of kind.fields) {
          t[kind.key][f.key] = d.templates?.[kind.key]?.[f.key] ?? f.default
        }
      }
      setData(d)
      setSender({ fromName: d.fromName || '', fromEmail: d.fromEmail || '', replyTo: d.replyTo || '' })
      setTexts(t)
      setActiveKind(k => k || d.kinds[0]?.key || '')
      setDirty(false)
    } catch (err) {
      setLoadError(err.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const kind = useMemo(() => data?.kinds.find(k => k.key === activeKind), [data, activeKind])

  // Lege velden vallen terug op de standaardtekst.
  const payload = useMemo(() => {
    if (!data) return null
    const templates = {}
    for (const k of data.kinds) {
      templates[k.key] = {}
      for (const f of k.fields) {
        const v = texts[k.key]?.[f.key]
        templates[k.key][f.key] = v && v.trim() ? v : f.default
      }
    }
    return { ...sender, templates }
  }, [data, sender, texts])

  // Voorbeeld verversen (met een korte vertraging tijdens het typen).
  useEffect(() => {
    if (!payload || !activeKind) return undefined
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const r = await admin.post('/api/admin/mail-settings/preview', { ...payload, kind: activeKind, variant })
        if (cancelled) return
        setPreview(r)
        setPreviewError('')
      } catch (err) {
        if (!cancelled) setPreviewError(err.message)
      }
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [payload, activeKind, variant])

  const setSenderField = key => e => {
    setSender(s => ({ ...s, [key]: e.target.value }))
    setDirty(true)
  }

  const setText = (kindKey, fieldKey, value) => {
    setTexts(t => ({ ...t, [kindKey]: { ...t[kindKey], [fieldKey]: value } }))
    setDirty(true)
  }

  const insertPlaceholder = key => {
    const target = lastFocus.current
    const token = `{{${key}}}`
    if (!target) {
      toast('Klik eerst in het veld waar je de variabele wilt invoegen.', 'error')
      return
    }
    const el = fieldRefs.current[`${target.kind}.${target.field}`]
    const current = texts[target.kind]?.[target.field] ?? ''
    const start = el?.selectionStart ?? current.length
    const end = el?.selectionEnd ?? current.length
    setText(target.kind, target.field, current.slice(0, start) + token + current.slice(end))
    setTimeout(() => {
      if (!el) return
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    }, 0)
  }

  const save = async () => {
    setSaving(true)
    try {
      await admin.put('/api/admin/mail-settings', payload)
      toast('Mailinstellingen opgeslagen.')
      await load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    setTesting(true)
    try {
      const r = await admin.post('/api/admin/mail-settings/test', { ...payload, kind: activeKind, variant })
      toast(`Testmail verstuurd naar ${r.to}.`)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setTesting(false)
    }
  }

  if (loadError) return <div className="alert alert-error">{loadError}</div>
  if (!data) return <div className="card">Laden…</div>

  const effectiveFrom = preview?.from || ''

  return (
    <div className="stack">
      <div className="row row-between wrap">
        <h1>Mailinstellingen</h1>
        <Link to="/" className="btn">← Terug naar de events</Link>
      </div>

      {!data.mailConfigured && (
        <div className="alert alert-warn">
          RESEND_API_KEY is niet ingesteld op de server: je kan instellingen opslaan, maar er worden geen mails (ook geen testmail) verstuurd.
        </div>
      )}

      <section className="card stack">
        <h2>Afzender</h2>
        <p className="muted small">
          Laat leeg om de standaard te gebruiken. Het domein van het e-mailadres moet geverifieerd zijn in Resend, anders weigert Resend de mails.
        </p>
        <div className="grid-3">
          <label>
            Naam afzender
            <input
              value={sender.fromName}
              onChange={setSenderField('fromName')}
              maxLength={80}
              placeholder={data.defaults?.fromName || 'VTIZ Secret Santa'}
            />
          </label>
          <label>
            E-mailadres afzender
            <input
              type="email"
              value={sender.fromEmail}
              onChange={setSenderField('fromEmail')}
              placeholder={data.defaults?.fromEmail || 'santa@vtiz.be'}
            />
          </label>
          <label>
            Antwoorden naar (optioneel)
            <input
              type="email"
              value={sender.replyTo}
              onChange={setSenderField('replyTo')}
              placeholder="nick.bogaerts@vtiz.be"
            />
          </label>
        </div>
        {effectiveFrom && (
          <p className="muted small">Mails worden verstuurd als: <strong>{effectiveFrom}</strong></p>
        )}
      </section>

      <section className="card stack">
        <h2>Mailteksten</h2>
        <div className="tabs" role="tablist">
          {data.kinds.map(k => (
            <button
              key={k.key}
              type="button"
              role="tab"
              aria-selected={k.key === activeKind}
              className={`tab ${k.key === activeKind ? 'tab-active' : ''}`}
              onClick={() => setActiveKind(k.key)}
            >
              {k.label}
            </button>
          ))}
        </div>

        {kind && (
          <div className="mail-editor">
            <div className="stack">
              {kind.description && <p className="muted small">{kind.description}</p>}

              <div>
                <div className="muted small">Variabelen (klik om in te voegen op de cursorpositie):</div>
                <div className="row wrap placeholders">
                  {kind.placeholders.map(p => (
                    <button
                      key={p.key}
                      type="button"
                      className="btn btn-small"
                      title={p.label}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => insertPlaceholder(p.key)}
                    >
                      {`{{${p.key}}}`}
                    </button>
                  ))}
                </div>
              </div>

              {kind.fields.map(f => {
                const value = texts[kind.key]?.[f.key] ?? ''
                const isDefault = value === f.default
                const common = {
                  id: `${kind.key}-${f.key}`,
                  value,
                  maxLength: f.max,
                  ref: el => { fieldRefs.current[`${kind.key}.${f.key}`] = el },
                  onFocus: () => { lastFocus.current = { kind: kind.key, field: f.key } },
                  onChange: e => setText(kind.key, f.key, e.target.value),
                  placeholder: f.default,
                }
                return (
                  <div key={f.key} className="field">
                    <div className="row row-between">
                      <label htmlFor={common.id}>{f.label}</label>
                      <span className="muted small">
                        {value.length}/{f.max}
                        {isDefault
                          ? ' · standaard'
                          : ''}
                      </span>
                    </div>
                    {f.multiline
                      ? <textarea {...common} rows={5} />
                      : <input {...common} />}
                    {!isDefault && (
                      <button
                        type="button"
                        className="btn btn-small btn-link"
                        onClick={() => setText(kind.key, f.key, f.default)}
                      >
                        Standaard herstellen
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="stack">
              {kind.key === 'reminder' && (
                <label>
                  Voorbeeld voor
                  <select value={variant} onChange={e => setVariant(e.target.value)}>
                    {REMINDER_VARIANTS.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                  </select>
                </label>
              )}
              <div className="preview-box">
                <div className="preview-subject">
                  <span className="muted small">Onderwerp</span>
                  <strong>{preview?.subject || '…'}</strong>
                </div>
                {previewError
                  ? <div className="alert alert-error">{previewError}</div>
                  : (
                    <iframe
                      title="Voorbeeld van de mail"
                      className="preview-frame"
                      sandbox=""
                      srcDoc={preview?.html || ''}
                    />
                  )}
              </div>
              <p className="muted small">
                Het voorbeeld gebruikt voorbeeldgegevens (Anna Peeters, Secret Santa 2026).
              </p>
            </div>
          </div>
        )}
      </section>

      <div className="row wrap save-bar">
        <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Bezig…' : 'Opslaan'}
        </button>
        <button className="btn" onClick={sendTest} disabled={testing || !data.mailConfigured || !kind}>
          {testing ? 'Bezig…' : `Testmail "${kind?.label || ''}" naar mezelf`}
        </button>
        {dirty && <span className="muted small">Niet-opgeslagen wijzigingen. De testmail gebruikt de huidige (nog niet opgeslagen) teksten.</span>}
      </div>
    </div>
  )
}
