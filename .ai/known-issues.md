# Bekende problemen — secret-santa

- **Nog niet gedeployed/gevalideerd tegen een echte MariaDB:** de backend is enkel via unit tests van de pure logica getest; de SQL-routes en migraties zijn nog niet op een draaiende database uitgeprobeerd.
- **Mailjobs zijn in-memory:** na een herstart van de container verdwijnt de voortgangsinfo, en een lopende job wordt niet hervat (opnieuw uitnodigen kan, `invited_at` voorkomt dubbels bij "nog niet uitgenodigden").
- **Berichten:** maximaal 100 per koppeling; de ontvanger krijgt per bericht een melding (geen bundeling).
- **Tooling:** de bestandsschrijver van sommige AI-tools zet HTML-entiteiten om naar kale tekens; gebruik unicode-escapes of JSX-stringexpressies.
- **Vite CJS-waarschuwing:** `The CJS build of Vite's Node API is deprecated` bij `npm run build`; onschadelijk.
