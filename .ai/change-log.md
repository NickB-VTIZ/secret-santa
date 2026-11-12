# Wijzigingslog — secret-santa

## [1.1.0] - 2026-11-12
### Toegevoegd
- Zelfinschrijving: één publieke inschrijflink per event (`/inschrijven/<code>`). Leerkrachten geven naam + e-mail op en moeten expliciet akkoord gaan; pas dan worden ze deelnemer (met bevestigingsmail en persoonlijke link).
- Admin: inschrijvingen openen/sluiten en de link vernieuwen (EventDetail, kaart "Inschrijflink").
- Optionele omgevingsvariabele `SIGNUP_ALLOWED_DOMAINS` om inschrijven tot bepaalde e-maildomeinen te beperken.
- Databasemigratie (idempotent): `events.signup_code`, `events.signup_open`, `participants.consented_at`.
- Beveiliging: honeypot, rate limit per IP, dubbele inschrijving geeft een neutrale melding, maximaal 500 deelnemers per event.

## [1.0.0] - 2026-11-12
### Toegevoegd
- Eerste versie: events, deelnemers (manueel en plakken), uitsluitingen, geheime trekking, verlanglijstjes, budget, anonieme berichten en herinneringsmails via Resend.
- Admin-aanmelding met e-mail + wachtwoord (JWT), deelnemers via unieke link.
- Docker Compose (app + MariaDB), GHCR-workflow met GitHub Releases en registratie in het app-dashboard.
