# AI-instructies — secret-santa

## Project
- **Naam:** secret-santa (VTI Zandhoven)
- **Doel:** Secret Santa voor het VTIZ-personeel: de organisator (admin) maakt events, voegt deelnemers toe en voert de geheime trekking uit. Deelnemers krijgen een unieke link per mail voor hun verlanglijstje, hun trekking en anonieme berichten.
- **Tech stack:** React 18 + Vite (frontend), Express (backend, CommonJS), MariaDB 10.11 (mysql2, geen ORM), Docker Compose, image op GHCR (`ghcr.io/nickb-vtiz/secret-santa`), mails via Resend.
- **Poort:** 3004 (container luistert op 3000).

## Werkwijze
- Lees eerst [`README.md`](README.md) en `.ai/current-state.md`.
- Werk in kleine, controleerbare stappen en draai `npm test` en `npm run build` voor je afrondt.
- Alle UI-teksten, foutmeldingen, mails en commentaar zijn in het Nederlands.
- Tests gebruiken de ingebouwde `node:test` (`server/*.test.js`) en bevatten enkel pure logica (trekking, tokens, validatie, auth, mail).

## Privacy-ontwerp (niet doorbreken)
- De admin ziet **nooit** tokens, verlanglijstjes of koppels. Geen endpoint mag die aan de admin teruggeven.
- Tokens zijn 32 tekens uit `crypto.randomBytes`; ongeldige of onbekende tokens geven altijd dezelfde 404.
- Berichtmeldingen per mail bevatten nooit de inhoud of de afzender.
- API-antwoorden zijn `Cache-Control: no-store`; `Referrer-Policy: no-referrer` voorkomt lekken van de token-URL.
- Trekking = derangement met (wederzijdse) uitsluitingen en zonder wederkerige koppels (A→B én B→A kan nooit), minstens 3 deelnemers; gebeurt in één transactie met `FOR UPDATE`.
- Per event schakelbaar: `wishlist_enabled` en `messages_enabled`; de server dwingt dit af (409) en verbergt de gegevens in `GET /api/me/:token`.
- Zelfinschrijving (`/inschrijven/:code`): deelnemer wordt enkel toegevoegd bij `consent === true`; een dubbele inschrijving geeft hetzelfde neutrale antwoord (geen lek van wie meedoet); na de trekking is inschrijven geblokkeerd.

## Versiebeheer & deploy
- Release: verhoog `version` in `package.json` (`npm version patch`) en push naar `main`. De workflow `.github/workflows/release-image.yml` bouwt het image, pusht naar GHCR en maakt de GitHub Release `vX.Y.Z`.
- Het app-dashboard leest het label `org.opencontainers.image.version` en deployt via `docker compose pull` met `APP_VERSION`.
- Registratie in `app-dashboard/apps.config.json` (id `secret-santa`). `containers[0]` moet de app zelf zijn.

## Centraal geheugen & Veiligheid
- Gebruik MCP-server `agentmemory` met projectidentificatie `secret-santa`.
- Sla nooit `JWT_SECRET`, `RESEND_API_KEY`, databasewachtwoorden, `ADMIN_PASSWORD`, tokens of persoonsgegevens (namen, e-mailadressen, verlanglijstjes) op in herinneringen, code of logs.
- Voer geen push, release of wijziging op de productieserver uit zonder uitdrukkelijke toestemming van de gebruiker.

## Bekende valkuil
- De bestandsschrijver van sommige AI-tools zet HTML-entiteiten (`&`, `<`) om naar kale tekens. Gebruik daarom unicode-escapes in code (`\u0026`) of JSX-expressies met strings (`{'<mail>'}`).
