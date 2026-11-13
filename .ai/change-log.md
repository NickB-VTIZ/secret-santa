# Wijzigingslog — secret-santa

## [1.3.0] - 2026-11-13
### Toegevoegd
- Per event aan/uit te zetten: het verlanglijstje (`events.wishlist_enabled`) en de anonieme berichten (`events.messages_enabled`). Twee idempotente migraties; bestaande events blijven aan staan. De server weigert (409) lijstjes/berichten als de functie uit staat en verbergt de gegevens in `GET /api/me/:token`.
- Mailteksten voor events zonder verlanglijstje (`introNoList`, bij herinnering ook `introDrawnNoList`), instelbaar in Mailinstellingen met voorbeeldkeuze "Event met/zonder verlanglijstje".
- Berichten herwerkt: een gecombineerd blok met tabs ("Mijn Secret Santa" / "Mijn cadeaukind") en een "nieuw"-teken bij ongelezen berichten.
### Gewijzigd
- Trekking: nooit wederkerige koppels (als A B trekt, trekt B nooit A). Daardoor zijn minstens 3 deelnemers nodig; `validatePairs` weigert wederkerige koppels.
- Berichtmeldingen zijn gebundeld: enkel een mail als er nog geen ongelezen eerder bericht van dezelfde afzender is.

## [1.2.0] - 2026-11-12
### Toegevoegd
- Beheer → Mailinstellingen: afzender (naam, e-mail, antwoordadres) en teksten (onderwerp, titel, inleiding, knop) per mailsoort (uitnodiging, inschrijving, trekking, herinnering, berichtmelding) aanpasbaar, met live voorbeeld, variabelen, standaardtekst herstellen en testmail naar de admin.
- Nieuwe tabel `app_settings` (idempotente migratie). Enkel afwijkingen van de standaard worden opgeslagen.
- API: `GET/PUT /api/admin/mail-settings`, `POST /api/admin/mail-settings/preview` en `/test`.
### Gewijzigd
- `MAIL_FROM` is nu de terugvalwaarde voor de afzender; `mail.js` ondersteunt `from` en `replyTo` per bericht.
### Beveiliging
- Teksten worden altijd HTML-ge-escaped, onderwerp/titel/knop zijn één regel, onbekende variabelen worden geweigerd, berichtmeldingen bevatten nooit de berichtinhoud.

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
