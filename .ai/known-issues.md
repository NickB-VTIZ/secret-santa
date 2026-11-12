# Bekende problemen — secret-santa

- **SQL-routes niet geautomatiseerd getest:** de backend is enkel via unit tests van de pure logica getest. De migratie van v1.1.0 (`ADD COLUMN IF NOT EXISTS`, `ADD UNIQUE INDEX IF NOT EXISTS`) en de inschrijfroutes zijn nog niet op een draaiende MariaDB uitgeprobeerd.
- **Zelfinschrijving:** iedereen met de link kan zich inschrijven (tenzij `SIGNUP_ALLOWED_DOMAINS` is ingesteld). Rate limit is 60 per 15 min per IP, bewust ruim vanwege het gedeelde schooladres.
- **Mailjobs zijn in-memory:** na een herstart van de container verdwijnt de voortgangsinfo, en een lopende job wordt niet hervat (opnieuw uitnodigen kan, `invited_at` voorkomt dubbels bij "nog niet uitgenodigden").
- **Berichten:** maximaal 100 per koppeling; de ontvanger krijgt per bericht een melding (geen bundeling).
- **Tooling:** de bestandsschrijver van sommige AI-tools zet HTML-entiteiten om naar kale tekens; gebruik unicode-escapes of JSX-stringexpressies.
- **Vite CJS-waarschuwing:** `The CJS build of Vite's Node API is deprecated` bij `npm run build`; onschadelijk.
