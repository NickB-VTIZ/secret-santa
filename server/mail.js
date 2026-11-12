const RESEND_URL = 'https://api.resend.com/emails'

// ── Mail via Resend — leest de instellingen bij elke verzending ─────
function createMailer({ getConfig, fetchImpl = (...a) => fetch(...a) }) {
  const cfg = () => getConfig() || {}

  return {
    appUrl: () => (cfg().appUrl || '').replace(/\/+$/, ''),
    configured: () => !!cfg().resendApiKey,

    // Gooit nooit: een mailfout mag de actie die mailt niet breken.
    // from en replyTo (uit het beheer) gaan voor op de standaardafzender uit de omgeving.
    async send({ to, subject, html, text, from, replyTo }) {
      const { resendApiKey, from: defaultFrom } = cfg()
      if (!resendApiKey) {
        console.warn(`[Mail] niet geconfigureerd — "${subject}" niet verstuurd naar ${to}`)
        return { ok: false, skipped: true }
      }
      try {
        const payload = { from: from || defaultFrom, to: [to], subject, html, text }
        if (replyTo) payload.reply_to = replyTo
        const r = await fetchImpl(RESEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
        return { ok: true }
      } catch (e) {
        console.error(`[Mail] "${subject}" naar ${to} mislukt: ${e.message}`)
        return { ok: false, error: e.message }
      }
    },

    /** Verstuurt een reeks mails na elkaar (Resend-limiet) en telt de resultaten. */
    async sendMany(messages, { delayMs = 600 } = {}) {
      const result = { sent: 0, failed: 0, skipped: 0, failures: [] }
      for (const [i, m] of messages.entries()) {
        const r = await this.send(m)
        if (r.ok) result.sent++
        else if (r.skipped) result.skipped++
        else { result.failed++; result.failures.push({ to: m.to, error: r.error }) }
        if (delayMs && i < messages.length - 1) await new Promise(res => setTimeout(res, delayMs))
      }
      return result
    },
  }
}

module.exports = { createMailer }
