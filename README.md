# radar-inspectio

Il radar delle richieste di lavoro **già aperte**: migrazioni da Webflow, Framer o WordPress, siti da rifare identici, animazioni da costruire o da riparare. Ascolta solo fonti lecite, classifica ogni richiesta, misura il sito del cliente prima che tu risponda e ti prepara una bozza. **L'invio resta tuo.**

È un progetto separato da `site-inspector`: non ne importa codice e non lo modifica.

## Cosa fa e cosa non fa

| Fa | Non fa |
| --- | --- |
| Legge gli avvisi email che le piattaforme ti mandano (ricerche salvate di Malt, Upwork, LinkedIn, Contra) | Entrare nel tuo account di una piattaforma, scaricarne le pagine, inviare proposte |
| Legge Reddit dall'API ufficiale e i feed RSS dei forum | Scraping di directory o siti che lo vietano |
| Misura UNA pagina del sito del cliente, con User-Agent onesto e `robots.txt` rispettato | Mascherarsi da browser o aggirare blocchi |
| Scarta sempre chi chiede di copiare il sito di qualcun altro | Rispondere al posto tuo |
| Ti avvisa su Telegram in pochi minuti | Tenere i dati per sempre: `radar pulisci` cancella dopo 60 giorni |

## Come funziona

1. **Raccolta.** Email di avviso (IMAP), Reddit (API) e feed RSS diventano richieste in un formato unico: fonte, link, titolo, testo, budget, lingua, URL del sito del cliente.
2. **Classificazione.** Regole leggibili assegnano le categorie (migrazione, rifacimento, animazioni, bug di animazione, performance) e un punteggio da 0 a 100. Ogni punto ha la sua ragione, visibile con `radar mostra <id>`.
3. **Bandiera rossa.** «Clonare il sito di un concorrente» porta il punteggio a 0 e la richiesta viene scartata. «Clonare» senza dire di chi è il sito dimezza il punteggio e chiede di verificare la titolarità.
4. **Misura.** Se c'è l'URL del sito e il punteggio è almeno `measureMinScore`, il radar ne scarica una pagina e dice piattaforma, framework, librerie di movimento e fascia di difficoltà (BASSA, MEDIA, AVANZATA, come in `docs/BENCHMARKS.md` di site-inspector). È una stima dall'HTML: le librerie dentro i bundle non si vedono. Sulle richieste migliori lancia l'ispezione completa di site-inspector a mano.
5. **Avviso.** Le richieste con punteggio almeno `notifyMinScore` arrivano su Telegram, dalla migliore.
6. **Bozza.** `radar bozza <id>` scrive una risposta con il fatto misurato, i tre passi del lavoro, tempi e prezzo dalla tua configurazione. Con `--llm` la rifinisce Claude. La rileggi e la invii tu.

## Punteggio

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
| Copia del sito di terzi | punteggio 0, scartata |
| «Clonare» senza dire di chi è il sito | punteggio dimezzato |

## Installazione

Serve Node.js 22 o superiore.

```bash
git clone https://github.com/Bium99/radar-inspectio.git
cd radar-inspectio
npm install
cp .env.example .env
npm test
```

Poi verifica subito che la misura funzioni dalla tua rete:

```bash
node bin/radar.mjs sito https://webflow.com/
```

## Configurazione delle fonti

Ogni fonte parte solo se ha le credenziali in `.env`: puoi attivarne una alla volta.

### Avvisi email (Malt, Upwork, LinkedIn, Contra)

1. Crea una casella dedicata (per esempio un Gmail nuovo) e attiva la verifica in due passaggi.
2. Crea una **password per le app** e mettila in `IMAP_PASS`, con `IMAP_USER` = l'indirizzo.
3. Su ogni piattaforma salva le ricerche che ti interessano («webflow migration», «framer to code», «GSAP», «rifare sito») e attiva gli avvisi email verso quella casella.
4. In Gmail crea un filtro che mette gli avvisi sotto l'etichetta `Radar` (in IMAP le etichette sono cartelle). Il nome si cambia in `radar.config.json` → `sources.email.mailbox`.

Il radar legge solo i messaggi non letti di quella cartella e li segna come letti.

**Da calibrare:** il lettore è stato scritto e testato su avvisi *costruiti a mano*, perché i formati veri cambiano spesso e non erano disponibili. Appena ricevi un avviso vero, salvalo come `.eml` («Scarica messaggio» in Gmail) e prova:

```bash
node bin/radar.mjs prova-email avviso.eml
```

Se titoli o link non tornano, la correzione va in `lib/sources/email.mjs` (`PLATFORMS`), con un test nuovo costruito su quell'email.

### Reddit

1. Vai su <https://www.reddit.com/prefs/apps> e crea un'app di tipo «script».
2. Metti `REDDIT_CLIENT_ID` e `REDDIT_CLIENT_SECRET` in `.env`.
3. Scegli i subreddit in `radar.config.json`. Con `onlyHiring` si tengono solo i post di chi cerca qualcuno, non di chi si offre.

Il radar usa l'API ufficiale a basso volume: un giro ogni 15 minuti è ampiamente nei limiti.

### Feed RSS

Molti forum su Discourse espongono le categorie come feed: `https://<forum>/c/<categoria>.rss`. Aggiungili in `sources.rss` con `"enabled": true`.

### Telegram

1. Scrivi a `@BotFather`, crea un bot e copia il token in `TELEGRAM_BOT_TOKEN`.
2. Manda un messaggio qualsiasi al tuo bot, poi apri `https://api.telegram.org/bot<TOKEN>/getUpdates` e copia `chat.id` in `TELEGRAM_CHAT_ID`.

Senza Telegram gli avvisi si stampano nel terminale.

### Il resto di `radar.config.json`

- `userAgent`: metti un contatto vero al posto di `CAMBIA-QUI` (una mail o un sito). Chi riceve la richiesta deve poter sapere chi sei.
- `pricing` e `timeline`: sono **segnaposto**. Mettili tu dopo i primi lavori, meglio se dai tempi misurati.
- `signature`: la tua firma nelle bozze.
- `preferredLangs`, `minBudget`, `notifyMinScore`, `measureMinScore`, `retentionDays`: le soglie.

## Uso

```text
radar scansiona [--prova]           un giro su tutte le fonti attive (--prova: non salva e non avvisa)
radar elenco [--stato S] [--min N]  richieste salvate, dalla migliore
radar mostra <id>                   testo, punteggio con le ragioni, misura del sito
radar misura <id>                   (ri)misura il sito della richiesta
radar bozza <id> [--llm]            bozza della risposta; la invii TU
radar stato <id> <stato> [nota]     nuovo | notificato | risposto | vinto | perso | scartato
radar pulisci                       cancella le richieste più vecchie di retentionDays (tranne "vinto")
radar esporta <file.csv>            per Airtable, Notion o un foglio di calcolo
radar sito <url>                    prova la misura su un URL qualsiasi
radar prova-email <file.eml>        prova il lettore su un avviso salvato
```

Dentro la cartella del progetto il comando è `node bin/radar.mjs …`; con `npm link` diventa `radar …`.

### Un giro ogni 15 minuti

Su Mac o Linux con `crontab -e`:

```cron
*/15 * * * * cd /percorso/radar-inspectio && /usr/local/bin/node bin/radar.mjs scansiona >> data/radar.log 2>&1
*/15 * * * * cd /percorso/radar-inspectio && /usr/local/bin/node bin/radar.mjs pulisci >> data/radar.log 2>&1
```

Controlla il percorso di Node con `which node`. Il secondo comando può girare anche una volta al giorno.

### Bozza rifinita con Claude

`radar bozza <id> --llm` usa il modello `claude-opus-5-5` e serve `ANTHROPIC_API_KEY` in `.env`. Il testo dell'annuncio entra come dato, mai come istruzione. Se il modello declina la richiesta, l'API ripiega da sola su un altro modello (parametro `fallbacks: "default"`). Il prompt vieta di inventare esperienza, clienti, numeri, tempi o prezzi. Il risultato resta una bozza da rileggere.

## Regole che il radar rispetta, e che devi rispettare tu

- **Niente automazione dentro le piattaforme.** Upwork, Malt e LinkedIn vietano bot e invii automatici: il rischio vero è perdere l'account con le recensioni. Il radar si ferma alla bozza.
- **Dati personali.** Gli annunci contengono nomi. `data/` non si versiona mai (è in `.gitignore`), e `radar pulisci` cancella dopo `retentionDays`, tranne le richieste diventate lavoro.
- **Siti dei clienti.** Una sola pagina per richiesta, User-Agent onesto, `robots.txt` rispettato. Un `robots.txt` in errore (5xx) significa che non si scarica. Gli indirizzi interni e quelli non http(s) vengono rifiutati.
- **Richieste di copia.** Scartate sempre: un lavoro così espone te, non solo il cliente.

## Cosa è verificato e cosa no

- 43 test automatici (`npm test`) coprono classificazione, bandiere rosse, lettori di RSS, Reddit ed email, misura, `robots.txt`, archivio, bozze, notifiche, il giro completo con una fonte rotta e la chiamata a Claude. Tutti girano senza rete, con risposte finte.
- **Non ancora provato contro i servizi veri:** IMAP, API di Reddit, Telegram, Claude e la misura di siti reali. L'ambiente in cui è stato scritto blocca i siti esterni. I primi due comandi da lanciare sul tuo computer sono `radar sito <url>` e `radar prova-email <file.eml>`.
