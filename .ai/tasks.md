# Taken — secret-santa

## Open
- [ ] Zelfinschrijving (v1.1.0) testen op een echte MariaDB: migratie, inschrijven, dubbele inschrijving, sluiten, link vernieuwen.
- [ ] Cloudflare: `santa.nbotech.net` en `santa.vtiz.be` laten wijzen naar de tunnel (zie README, hoofdstuk Publieke adressen) en `APP_URL` aanpassen.
- [ ] Testen met echte mails (Resend-domein `nbotech.net`) en een kleine testgroep.
- [ ] Optioneel: integratietests voor de API-routes met een testdatabase.
- [ ] Optioneel: CSV-bestand uploaden (nu enkel plakken).
- [ ] Optioneel: meerdere admins beheren in de UI.

## Afgerond
- [x] Backend, trekkingsalgoritme met uitsluitingen, tokens, auth, mails en herinneringen (56 unit tests).
- [x] Admin-UI en deelnemerspagina.
- [x] Docker/GHCR/workflow en registratie in het app-dashboard.
- [x] GitHub-repo, release v1.0.0 en eerste deploy op de NAS.
- [x] Zelfinschrijving via publieke link (v1.1.0), 68 unit tests.
