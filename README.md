# radar-inspectio

Un radar sempre acceso per le richieste di lavoro **già aperte**: migrazioni da Webflow, Framer, Wix o WordPress, siti da rifare identici, animazioni da costruire o da riparare. Ogni 30 minuti legge le fonti, tiene solo ciò che ti riguarda, misura il sito del cliente, ti avvisa sul telefono e ti prepara la bozza della risposta. **L'invio resta tuo.**

Gira gratis su GitHub Actions, anche a computer spento. È un progetto separato da `site-inspector`.

## Da fare una volta sola (5 minuti)

1. **La password.** Nel repository: *Settings → Secrets and variables → Actions → New repository secret*.
   - Nome: `RADAR_PASSWORD`
   - Valore: una frase lunga che ricorderai, per esempio tre parole e un numero.

   Cifra i dati del radar e apre la dashboard. Dal giro successivo il radar parte da solo.
2. **Le notifiche sul telefono.** Installa l'app **ntfy** (gratis, nessun account). Poi apri la dashboard, premi *Notifiche* e iscriviti al topic che ti mostra. In alternativa, da terminale: `RADAR_PASSWORD=… node bin/radar.mjs topic`.
3. **La dashboard online.** *Settings → Pages → Build and deployment → Source: GitHub Actions*.
   - Su un repository privato, GitHub Pages richiede GitHub Pro, gratuito con il [GitHub Student Developer Pack](https://education.github.com/pack) (hai una mail del Politecnico).
   - La pagina è raggiungibile da chiunque abbia il link, ma i dati sono cifrati con la tua password e senza password non si legge nulla.
   - Senza Pages la dashboard si apre in locale: `npm install` e poi `RADAR_PASSWORD=… npm run dashboard`.

Fatto. Il primo giro manda **una sola** notifica di riepilogo; da lì in poi una per ogni richiesta sopra soglia.

## Cosa trovi nella dashboard

- **Richieste**: elenco ordinato per punteggio, con filtri per periodo, testo, stato, punteggio, fonte, lingua e categoria. Per ogni richiesta:
  - il perché del punteggio;
  - la misura del sito del cliente (piattaforma, librerie di movimento, fascia di difficoltà);
  - la bozza di risposta da copiare;
  - lo stato (nuova, risposto, vinto, perso, scartato) e le tue note.
- **Statistiche**: richieste al giorno, per fonte, per tipo di lavoro.
- **Fonti**: la salute di ogni fonte a ogni giro, così vedi subito se qualcosa smette di funzionare.

Gli stati e le note si salvano sul dispositivo. Per averli uguali su telefono e computer, in *Impostazioni* incolla un token GitHub «fine-grained» con *Contents: Read and write* **solo** su questo repository.

## Altri canali di notifica (facoltativi)

Ognuno si attiva aggiungendo i suoi segreti, come per `RADAR_PASSWORD`:

| Canale | Segreti |
| --- | --- |
| ntfy con un topic tuo | `NTFY_TOPIC` (e `NTFY_SERVER`, `NTFY_TOKEN` se usi un server tuo); `NTFY_OFF=1` lo spegne |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (bot da @BotFather) |
| Discord | `DISCORD_WEBHOOK_URL` |
| Slack | `SLACK_WEBHOOK_URL` |
| Email (un riepilogo per giro) | `SMTP_URL` (es. `smtps://utente:password-app@smtp.gmail.com`), `EMAIL_TO`, `EMAIL_FROM` |

## Fonti

Il radar legge solo fonti con un accesso automatico lecito: feed RSS/Atom, API pubbliche, API ufficiali con chiave, avvisi email. Niente pagine HTML di siti che lo vietano, niente bot nei tuoi account. L'elenco completo, con lo stato di ognuna, è nella sezione *Fonti* della dashboard e in `lib/sources/registry.mjs`. `node bin/radar.mjs fonti` mostra quali sono attive.

Fonti facoltative che chiedono una credenziale:

| Fonte | Segreti |
| --- | --- |
| Avvisi email delle piattaforme (Malt, Upwork, LinkedIn, Contra): ricerche salvate con avviso email verso una casella dedicata | `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS` (password per app), `IMAP_MAILBOX` (default `Radar`) |
| Bozze rifinite da Claude per le richieste migliori | `ANTHROPIC_API_KEY` |

## Come decide

| Segnale | Punti |
| --- | --- |
| Migrazione | +40 |
| Rifacimento identico | +30 |
| Animazioni | +30 |
| Bug di animazione | +25 |
| Performance | +10 |
| (le categorie insieme valgono al massimo 70) | |
| URL del sito presente | +15 |
| Budget sopra `minBudget` / sotto | +10 / −10 |
| Lingua preferita | +5 |
| Pubblicata da meno di 3 ore | +10 |
| Sembra un impiego, non un progetto | −25 |
| Chiede di copiare il sito di un altro | scartata, sempre |

In archivio entra solo ciò che arriva ad almeno `storeMinScore` (20): il resto si ricorda solo come id, per non rivederlo. La notifica parte da `notifyMinScore` (45), e mai per annunci pubblicati da più di `notifyMaxAgeDays` (3) giorni. Tutte le soglie sono in `radar.config.json`.

## Minuti di GitHub Actions

Con un giro ogni 30 minuti di giorno e ogni ora di notte, i giri sono circa 40 al giorno, cioè 1.200–1.800 minuti al mese.
- Il piano gratuito per i repository privati ne include 2.000.
- GitHub Pro (Student Pack) ne include 3.000: lì puoi stringere a ogni 15–20 minuti modificando le righe `cron` in `.github/workflows/radar.yml`.
- Un repository pubblico ha minuti illimitati, e i dati restano cifrati.

## Comandi

```text
npm run dashboard        dashboard in locale con i dati raccolti da GitHub (serve RADAR_PASSWORD)
npm run prova-fonti      un giro vero su tutte le fonti, senza salvare né avvisare
node bin/radar.mjs aiuto tutti i comandi (anche l'uso solo in locale, senza GitHub)
npm test                 i test
```

Su GitHub puoi lanciare un giro a mano da *Actions → radar → Run workflow*. Con «Solo prova delle fonti» il giro non salva nulla e non manda notifiche.

## Regole che il radar rispetta

- **Niente automazione dentro le piattaforme.** Upwork, Malt e LinkedIn vietano bot e invii automatici: il radar si ferma alla bozza.
- **Dati personali.** Gli annunci contengono nomi. Lo stato è cifrato, sta solo sul branch `data` (un unico commit, riscritto a ogni giro) e scade dopo `retentionDays` (60 giorni), tranne le richieste diventate lavoro.
- **Siti dei clienti.** Una sola pagina per richiesta, User-Agent onesto, `robots.txt` rispettato. Gli indirizzi interni e quelli non http(s) vengono rifiutati.
- **Dashboard.** Nessuna risorsa esterna: una CSP ammette solo il suo script, e il testo degli annunci viene inserito come testo, mai come HTML.
