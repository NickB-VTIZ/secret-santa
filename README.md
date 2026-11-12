# VTIZ Secret Santa

Secret Santa-app voor het personeel van VTI Zandhoven.

- **Organisator (admin)** meldt aan met e-mail + wachtwoord, maakt events, voegt deelnemers toe (manueel of CSV/plakken), stelt uitsluitingen in en voert de trekking uit. De admin ziet de koppels niet.
- **Zelfinschrijving**: de admin opent per event één publieke inschrijflink (`/inschrijven/<code>`). Leerkrachten geven naam en e-mailadres op en vinken aan dat ze akkoord gaan en meedoen. Pas na die toestemming worden ze deelnemer en krijgen ze een bevestigingsmail met hun persoonlijke link. Inschrijven kan tot de trekking of tot de admin de inschrijvingen sluit; de link kan vernieuwd worden.
- **Deelnemers** krijgen een unieke link per mail (`/deelnemer/<token>`) en kunnen daar hun verlanglijstje invullen, zien wie ze getrokken hebben + diens lijstje, en anoniem berichten sturen naar hun trekking en hun Secret Santa.
- **Mails** (via Resend): uitnodiging, bevestiging van inschrijving, trekkingsmelding, herinnering (gepland of manueel) en melding bij een nieuw bericht (zonder inhoud).
- **Mailinstellingen** (knop "Mailinstellingen" in het beheer): de admin past de afzender (naam, e-mailadres, antwoordadres) en de teksten van elke mailsoort aan, met live voorbeeld, variabelen (`{{naam}}`, `{{event}}`, `{{datum}}`, `{{budget}}`, `{{link}}`, en `{{wie}}` bij de berichtmelding), "Standaard herstellen" per veld en een testmail naar jezelf.

## Tech

React 18 + Vite · Express · MariaDB 10.11 · Docker Compose · GHCR · Resend

## Installatie op de Synology

```bash
cd /volume1/docker
git clone https://github.com/NickB-VTIZ/secret-santa.git
cd secret-santa
cp .env.example .env
# vul in: DB_PASSWORD, DB_ROOT_PASSWORD, JWT_SECRET (min. 16 tekens, willekeurig), RESEND_API_KEY
docker compose up -d
```

De app draait daarna op `http://10.18.0.1:3004`. Zonder `ADMIN_PASSWORD` in `.env` wordt bij de eerste start een tijdelijk wachtwoord gelogd:

```bash
docker logs secret-santa | grep Admin
```

Meld aan met `nick.bogaerts@vtiz.be` en kies meteen een eigen wachtwoord.

## Configuratie (`.env`)

| Variabele | Betekenis |
|---|---|
| `APP_PORT` | Poort op de host (standaard 3004) |
| `APP_VERSION` | Image-versie; wordt door het app-dashboard beheerd |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_ROOT_PASSWORD` | Database |
| `JWT_SECRET` | Ondertekening admin-sessies (min. 16 tekens) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Eerste admin (alleen gebruikt als er nog geen admin bestaat) |
| `RESEND_API_KEY`, `MAIL_FROM` | Mailverzending |
| `APP_URL` | Basis-URL voor de links in mails en de inschrijflink (bv. `http://10.18.0.1:3004`) |
| `SIGNUP_ALLOWED_DOMAINS` | Optioneel: beperk zelfinschrijving tot deze e-maildomeinen (bv. `vtiz.be`). Leeg = geen beperking |

> De links in de mails moeten bereikbaar zijn voor het personeel. Gebruik een `APP_URL` die ook buiten de server werkt.

### Afzender van de mails

De afzender stel je in via **Beheer → Mailinstellingen**. Wat daar leeg blijft, valt terug op `MAIL_FROM` uit `.env` (standaard `VTIZ Secret Santa <status@nbotech.net>`). Het domein van het afzenderadres moet in Resend geverifieerd zijn (bv. `santa.vtiz.be`), anders weigert Resend de mails. De instellingen staan in de tabel `app_settings` en gelden meteen, zonder herstart.

## Publieke adressen (Cloudflare)

De app is bedoeld bereikbaar op `https://santa.nbotech.net` en `https://santa.vtiz.be`. In het app-dashboard staat daarvoor `cloudflare.hostname` (`santa.nbotech.net`) en `cloudflare.extraHostnames` (`santa.vtiz.be`) in `apps.config.json`; "Tunnel synchroniseren" maakt de ingress-regels en de DNS-records aan voor zones in dezelfde Cloudflare-account. Staat `vtiz.be` ergens anders, maak dan zelf een CNAME `santa` naar `<tunnel-id>.cfargotunnel.com` en voeg de hostnaam toe aan de tunnel.

Zet daarna in `.env` `APP_URL=https://santa.vtiz.be` (de link in mails en de inschrijflink gebruiken dit adres) en herstart met `docker compose up -d`.

## Lokaal ontwikkelen

```bash
npm install
npm test            # unit tests
npm run dev:server  # API op poort 3000 (vereist een MariaDB en .env)
npm run dev:client  # Vite op poort 5173 met proxy naar de API
npm run build       # productiebuild naar dist/
```

## Nieuwe versie uitbrengen

```bash
npm version patch   # of minor / major
git push --follow-tags
```

De GitHub Action bouwt het image, pusht naar `ghcr.io/nickb-vtiz/secret-santa` en maakt een GitHub Release `vX.Y.Z`. Enkele minuten later toont het app-dashboard "Nieuw: vX.Y.Z".

Lokaal bouwen i.p.v. het GHCR-image: `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build`.

## Privacy

- De admin ziet geen tokens, verlanglijstjes of koppels.
- Tokens zijn willekeurig en 32 tekens lang; een ongeldige link geeft altijd dezelfde foutmelding.
- Meldingsmails over berichten bevatten geen inhoud en geen afzender.
- Een nieuwe trekking wist alle koppels en berichten.
- Zelfinschrijving vereist een expliciet aangevinkt akkoord; het tijdstip wordt bewaard. Wie zich dubbel inschrijft, krijgt dezelfde neutrale melding en opnieuw zijn eigen link, zodat niet zichtbaar is wie al meedoet.
