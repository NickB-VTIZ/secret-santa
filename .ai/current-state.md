# Projectstatus — secret-santa

## 1. Projectoverzicht & Doelstellingen
- **Naam:** secret-santa
- **Doel:** Secret Santa voor het VTIZ-personeel met geheime trekking, verlanglijstjes, budget, uitsluitingen, anonieme berichten en herinneringsmails.
- **Gebruikers:** één admin (organisator) en deelnemers via een unieke link per mail.

## 2. Architectuur & Technologieën
- **Frontend:** React 18, Vite, react-router-dom 6, eigen CSS (`src/index.css`). Routes: `/` en `/events/:id` (admin), `/deelnemer/:token` (deelnemer).
- **Backend:** Express (CommonJS) in `server/`: `index.js` (routes), `db.js` (mysql2 + migraties), `auth.js` (scrypt, JWT, rate limiter), `draw.js` (trekking), `tokens.js`, `validate.js`, `mail.js` + `mail-templates.js` (Resend).
- **Database:** MariaDB 10.11 (`admins`, `events`, `participants`, `exclusions`, `assignments`, `messages`); migraties draaien bij het opstarten.
- **Deployment:** Docker Compose, image `ghcr.io/nickb-vtiz/secret-santa`, poort 3004, registratie in `app-dashboard/apps.config.json`.

## 3. Functionaliteiten
- Admin: aanmelden, wachtwoord wijzigen, events CRUD, deelnemers (manueel, plakken/CSV, bewerken, verwijderen), uitsluitingen, uitnodigen, trekken, trekking herstellen, herinneringen (manueel + gepland, elke minuut gecontroleerd).
- Deelnemer: verlanglijstje, trekking tonen + lijstje van de getrokkene, anonieme berichten in beide richtingen (met melding per mail zonder inhoud).
- Privacy: de admin ziet nooit tokens, lijstjes of koppels.

## 4. Beperkingen
- Minstens 3 deelnemers om te trekken.
- Deelnemers en uitsluitingen zijn na de trekking vergrendeld (eerst trekking herstellen).
- Mails vereisen `RESEND_API_KEY` en een bereikbare `APP_URL`.
- Eén mailjob per event tegelijk; Resend-limiet: 600 ms tussen mails.
- Geen automatische integratie-tests voor de routes (enkel unit tests van pure logica).
