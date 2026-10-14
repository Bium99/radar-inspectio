# Stato attuale di radar-inspectio

*Aggiornato al 14 ottobre 2026, 13:50 UTC. Commit di riferimento `4262ea7`, 98 test verdi su GitHub Actions.*

## In breve

Il radar esiste e funziona. Ogni 30 minuti legge le fonti di lavoro, scarta il rumore e ti avvisa sul telefono solo per le richieste che ti riguardano. Le richieste che cerca sono migrazioni da Webflow, Framer, Wix o WordPress, rifacimenti identici, animazioni web e bug di animazione. Mostra tutto in una dashboard cifrata e prepara la bozza di risposta, che invii tu.

Quello che conta sapere subito:

- **Le fonti pubbliche portano soprattutto lavori di animazione e siti Webflow/Framer, quasi mai migrazioni.** In nove giri di prova su circa 400 annunci per giro non è comparsa nessuna migrazione vera. Le migrazioni passano da Upwork, Malt e LinkedIn, che si leggono solo tramite i loro avvisi email, e da Reddit.
- **La fonte più ricca, Freelancer.com, richiede un token.** I suoi termini d'uso vietano l'accesso automatico senza permesso, quindi il radar la usa solo con il token gratuito dello sviluppatore.
- **Senza configurazioni facoltative il radar funziona, ma porta poco:** 0–3 avvisi al giorno. Il valore cresce con le fonti facoltative (sezione 2.1).
- **Il giro programmato non è ancora partito.** Manca il segreto `RADAR_PASSWORD`, e GitHub non ha ancora eseguito nessun giro a orario: finora ci sono solo i giri di prova lanciati a mano.

---

## 1. Cosa abbiamo trovato

### 1.1 Le fonti, misurate dal vivo

Tutte le fonti sono state lette da GitHub Actions, cioè dallo stesso ambiente in cui gira il radar, in nove giri di prova tra le 12:30 e le 13:05 UTC del 14 ottobre. I numeri qui sotto vengono dal giro 8.

| Fonte | Accesso | Annunci letti | Pertinenti | Annuncio più recente | Stato |
| --- | --- | ---: | ---: | --- | --- |
| Freelancer.com (API) | API ufficiale | 94 | 17 | oggi | richiede `FREELANCER_TOKEN` |
| Freelancer.com in italiano | API ufficiale | 1 | 0 | 10 ott | richiede `FREELANCER_TOKEN` |
| Codeur.com (Francia) | RSS | 153 (81 più vecchi di 30 gg) | 8 | oggi | attiva |
| Forum three.js · Jobs | RSS | 25 (14 vecchi) | 2–3 | 13 ott | attiva |
| Forum GSAP · Jobs & Freelance | RSS | 25 (tutti vecchi) | 0 oggi | 7 lug | attiva: annunci ottimi ma rari |
| Hacker News · Who is hiring | API Algolia | 1 | 0 | 1 ott | attiva, una volta ogni 6 ore |
| Himalayas | API | 43 | 8 | oggi | attiva (quasi tutti impieghi) |
| Jobicy | API | 18 | 0 | 13 ott | attiva |
| Remotive | API | 15 | 1 | 11 ott | attiva, una volta al giorno |
| RemoteOK | API | 6 (tutti vecchi) | 0 | 22 mag | attiva, quasi inutile |
| We Work Remotely (front-end, design) | RSS | 12 | 2 | 8 ott | attiva |
| Working Nomads | API | 10 | 0 | 13 ott | attiva |
| WordPress Jobs | RSS | 5 | 0 | 13 ott | attiva, ogni 3 ore |
| Reddit (API ufficiale) | API con chiave | — | — | — | da accendere, non collaudata |
| Bluesky | API con account | — | — | — | da accendere, non collaudata |
| Ricerca sul web (Brave) | API con chiave | — | — | — | da accendere, non collaudata |
| Avvisi email (Upwork, Malt, LinkedIn, Contra) | IMAP, sola lettura | — | — | — | da accendere, non collaudata |

**Le migliori richieste viste nel collaudo:**

- dal forum GSAP: «Hiring Full Stack Developer (GSAP + Barba.js + ScrollTrigger) for High End Landing Page», «Looking for a GSAP + Webflow Specialist»;
- da Freelancer: «Bilingual Framer Website Design», «Animated Corporate Landing Page Design», «Capabl.in Inspired Webflow Pages»;
- dal forum three.js: «Hiring 3D Full-Stack Software Engineer (Three.js)».

**Fonti provate e scartate**, ognuna per un motivo verificato:

| Fonte | Motivo |
| --- | --- |
| Guru | 403 da GitHub |
| Awwwards Jobs | feed sparito |
| Authentic Jobs, Dribbble Jobs | vuote |
| Forum Webflow | in sola lettura da febbraio 2026, non dà più un feed |
| Mastodon | 0 pertinenti su 123 |
| Arbeitnow | fuori tema |
| Reddit RSS e Bluesky senza account | bloccati dai server di GitHub (429 e 403) |
| Thread HN «Freelancer? Seeking freelancer?» | non esce più da ottobre 2025 |
| Feed RSS di Freelancer | doppione più povero dell'API |

### 1.2 Dove stanno davvero le richieste che ti interessano

Dalla ricerca sulle fonti (6 aree, oltre 150 candidati esaminati) e dai collaudi:

1. **Le migrazioni e i rifacimenti identici quasi non passano dalle bacheche pubbliche.** I clienti li pubblicano su Upwork e Malt, oppure li chiedono su LinkedIn e Reddit.
   - **Upwork:** l'API ufficiale non è alla tua portata, perché chiede circa 25.000 $ di fatturato, un Job Success Score del 90% e un'identità verificata. Gli RSS sono chiusi dall'agosto 2024. L'unica strada lecita sono gli avvisi email delle ricerche salvate.
   - **LinkedIn:** non ha nessuna API per cercare i post, solo gli avvisi email.
2. **Animazioni e siti Webflow/Framer** arrivano da Freelancer, Codeur, dai forum GSAP e three.js, e in piccola parte dalle bacheche.
3. **Programmi partner, cioè lead consegnati per email:**
   - Webflow Certified Partners, Wix Marketplace, Codeable, Storetasker e Automattic for Agencies chiedono certificazioni, fatturato o portfolio che oggi non hai.
   - Framer Experts ha le candidature chiuse.
   - Sono una strada da prendere più avanti, quando avrai 3–5 lavori pubblicati.
4. **Italia:**
   - Freelancer in italiano funziona, ma porta circa un progetto a settimana.
   - Addlance (marketplace italiano) si legge solo dai suoi avvisi email.
   - Le gare pubbliche (ANAC, MePA, PA digitale 2026) richiedono partita IVA e iscrizione ai portali: non sono richieste a cui puoi rispondere oggi.
   - ProntoPro, Bark e Preventivi.it sono lead a pagamento e di basso budget.
5. **Avvisi gratuiti utili tramite la casella email:**
   - F5Bot (Reddit, Hacker News, Lobsters);
   - Google Alerts, che consegna anche come RSS e si aggiunge in `radar.config.json` → `feeds`.

### 1.3 Cosa si può automatizzare e cosa no (termini d'uso)

| Piattaforma | Verdetto |
| --- | --- |
| Freelancer.com | l'accordo d'uso vieta «robot, spider, scraper … including access to our API … without our express written permission»: si usa solo con il token dello sviluppatore |
| Upwork, Malt, LinkedIn, Contra, Fiverr | nessun accesso automatico consentito: solo gli avvisi email nella tua casella. Il radar legge la casella in sola lettura e non fa mai login sulle piattaforme |
| Reddit | solo l'API ufficiale con chiave. La ricerca ha segnalato che le nuove richieste di accesso all'API chiudono il **31 ottobre 2026** e i feed RSS si spengono il 13 novembre. È un'informazione da fonti secondarie, non verificata direttamente: **conviene creare l'app Reddit subito** |
| Remotive | chiede poche chiamate al giorno: una lettura al giorno |
| HN Algolia, Codeur RSS, forum Discourse e Invision, bacheche con API pubbliche | lettura automatica consentita, con User-Agent onesto e cadenza contenuta |
| Siti dei clienti | una sola pagina per richiesta, `robots.txt` rispettato (tre casi limite ancora da chiudere, sezione 2.2) |

### 1.4 Come è stato tarato il classificatore

Il classificatore è stato corretto 7 volte sugli annunci veri dei giri di prova; ogni correzione ha il suo test di regressione in `test/classify.test.mjs`. Le regole principali:

- Un segnale vale pieno nel titolo e meno se compare solo nel testo, dove di solito è una voce dell'elenco delle competenze.
- Webflow citato tra le alternative («WordPress, Webflow o simili») non conta come lavoro Webflow.
- Video, logo, giochi e preventivatori «interattivi» non sono animazioni web; «fixed price», «without lag» e «Debugging» non sono bug di animazione.
- Sono riconosciuti:
  - gli annunci chiusi («Job filled», «[Completed]», «Job is now finished»);
  - quelli più vecchi di 30 giorni;
  - chi si offre invece di cercare;
  - gli impieghi a tempo pieno, che entrano in dashboard ma non suonano.
- La lingua viene riconosciuta (it, en, fr, es, de), e un budget «meno di 500 €» vale come un tetto, non come un budget di 500 €.
- Lo stesso annuncio ripubblicato con un altro link si riconosce dal testo.
- Ogni richiesta in dashboard mostra la parola che ha fatto scattare la categoria e il conto dei punti.

### 1.5 Revisione avversariale del codice

Cinque revisori indipendenti hanno esaminato il codice, ognuno da un angolo diverso; per ogni loro risultato un verificatore ha poi provato a smentirlo riproducendolo.

- **Sicurezza** (8 difetti) e **flusso dei dati** (10 difetti): tutti corretti e pushati. Il verificatore ha poi confermato sul codice attuale che **17 su 18 non si riproducono più**. L'unico ancora vero è un caso di `git ls-remote` (sezione 2.2). Tra le correzioni:
  - la password e il token non stanno più in chiaro nel browser;
  - «Blocca» chiude davvero;
  - il topic ntfy non permette di indovinare la password;
  - un lavoro «vinto» non scade;
  - un avviso non partito riparte al giro dopo;
  - una prova non consuma gli avvisi email;
  - un errore IMAP o una data illeggibile non fanno cadere il giro.
- **GitHub Actions, termini d'uso, classificatore:** i risultati sono arrivati e sono in gran parte confermati. Restano da correggere, elencati nella sezione 2.2.

---

## 2. Cosa resta da fare

### 2.1 Da parte tua

**Indispensabili (10 minuti):**

1. **`RADAR_PASSWORD`**: *Settings → Secrets and variables → Actions → New repository secret*. Una frase lunga che ricorderai. Senza questa il radar resta fermo.
2. **App ntfy sul telefono** (gratis, nessun account): apri la dashboard, premi *Notifiche* e iscriviti al topic che ti mostra.
3. **GitHub Pages**: il repository è privato e Pages risulta già attivo. Controlla che *Settings → Pages → Source* sia **GitHub Actions** e non un branch.

**Da personalizzare in `radar.config.json`:**

- `signature`: oggi è `[il tuo nome]`;
- i prezzi in `pricing`: sono segnaposto. Finché non li cambi le bozze li riportano così come sono.

**Facoltative, in ordine di resa:**

1. **`FREELANCER_TOKEN`**: è la fonte più produttiva del collaudo. Registra un'app gratuita su developers.freelancer.com.
2. **Casella dedicata agli avvisi** (`IMAP_HOST`, `IMAP_USER`, `IMAP_PASS`), su cui far arrivare:
   - le ricerche salvate di Upwork, Malt e LinkedIn;
   - gli avvisi di F5Bot.

   Da qui arrivano quasi tutte le migrazioni.
3. **Reddit** (`REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`): **entro il 31 ottobre**.
4. **Brave Search** (`BRAVE_API_KEY`): post pubblici delle ultime 24 ore.
5. **Bluesky** (`BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`).
6. **`ANTHROPIC_API_KEY`**: bozze rifinite per le richieste migliori.

**Una decisione da prendere: i minuti di GitHub Actions.** Con il repository privato e GitHub Pro hai 3.000 minuti al mese. GitHub arrotonda ogni job al minuto superiore, e il giro più la pubblicazione su Pages sono due job. Con 40 giri al giorno si va da circa 2.400 a 3.600 minuti al mese, quindi al limite. Le strade possibili:

- **(a) Rendere il repository pubblico:** minuti illimitati. I dati restano cifrati e i log del giro non mostrano contenuti, ma il codice diventa visibile.
- **(b) Restare privato:** io unisco giro e pubblicazione in un solo job e porto il giro diurno a ogni 45–60 minuti.

### 2.2 Da parte mia

Sono i difetti confermati dalla revisione e non ancora corretti. Li correggo in quest'ordine, con un test di regressione per ognuno.

**Alta priorità**

- **Workflow, errore di rete:** un errore di rete su `git ls-remote` viene scambiato per «branch assente». Il giro allora riparte da zero e sovrascrive lo stato. Va distinto il codice d'uscita (2 = branch assente, altro = fermarsi).
- **Workflow, nomi dei branch:** `ls-remote --heads origin data` trova anche `feat/data`. Va usato il nome completo `refs/heads/data`.
- **Classificatore**, in attesa dell'ultima verifica:
  - il punto di «Next.js» o «three.js» interrompe la finestra che riconosce rifacimenti e bug di animazione;
  - il sito *proprio* del cliente («our Webflow site», «our Shopify store») viene trattato come sito di terzi;
  - copie di siti di terzi formulate come «Recreate the Linear homepage» o «copy of stripe.com» non vengono scartate;
  - «Leave Webflow for Next.js» finisce come lavoro Webflow, e la bozza propone Webflow a chi lo vuole lasciare;
  - «Are you available for projects…» detto da un cliente viene scambiato per un'autocandidatura;
  - «Résumé» non viene riconosciuto: è il limite di `\b` con le lettere accentate;
  - pagine di venditori («Get a quote», «Plans from $19») e guide passano come richieste.

**Media priorità**

- Gli avvisi partono prima che lo stato sia salvato. Se il giro fallisce dopo, al giro successivo gli stessi avvisi ripartono. Serve anche un timeout esplicito sulle chiamate a Claude.
- Il link alla dashboard viene messo negli avvisi anche quando Pages non è attivo.
- Gli stati e le note sul branch `stati` non scadono mai: vanno potati come l'archivio, con un commit unico.
- La ricerca web interroga `site:linkedin.com/posts`, in contrasto con la regola su LinkedIn: va tolta.
- `robots.txt` irraggiungibile per un errore di rete fa scaricare la pagina lo stesso: deve bloccare.
- Mancano il vocabolario francese delle migrazioni (migrer, refonte, refaire, à l'identique, vers) e quello italiano dell'impiego (RAL, stipendio, tempo pieno, sede): uno stipendio oggi vale come budget.
- La bozza può prendere come destinazione la piattaforma di partenza e scrive «stack personalizzato» quando non ha riconosciuto nulla.

**Bassa priorità**

- La stima dei minuti nel README va corretta (vedi la decisione sopra).
- La prova manuale:
  - salta la cadenza delle fonti;
  - stampa testi di terzi nei log;
  - può annullare un giro programmato in attesa, perché condivide il gruppo di concorrenza.
- I permessi `pages` e `id-token` vanno spostati solo sul job di pubblicazione.
- `npm run dashboard` prima del primo giro dà un errore grezzo di git.
- `robots.txt`:
  - va ricontrollato dopo un redirect verso un altro host;
  - deve valutare anche la query string.
- Domini delle piattaforme (x.com, bsky.app, news.ycombinator.com…) da escludere dai siti del cliente da misurare.

**Ancora in corso:** le ultime verifiche della ricerca sui programmi partner e il revisore critico che cerca le fonti mancanti. Aggiorno questo file quando finiscono.

### 2.3 Cosa non posso verificare da qui

Queste parti sono scritte e testate con dati simulati, ma il primo uso reale va controllato insieme:

- il **primo giro programmato vero**, quando aggiungi `RADAR_PASSWORD`;
- la **pubblicazione su Pages** e l'apertura della dashboard dal telefono;
- l'**arrivo delle notifiche ntfy** sul telefono;
- **Freelancer con il token**: l'intestazione è quella dell'SDK ufficiale;
- **il lettore degli avvisi email**: il formato di Upwork, Malt e LinkedIn nei test è sintetico, e va tarato sul primo avviso vero;
- **Reddit, Bluesky e Brave** con le loro chiavi.

---

## 3. Prospettive

### Cosa aspettarsi, realisticamente

| Configurazione | Pertinenti in dashboard | Avvisi sul telefono | Migrazioni |
| --- | --- | --- | --- |
| Solo i 3 passi indispensabili | 10–20 al giorno, quasi tutti sotto soglia | 0–3 al giorno (forum three.js e GSAP, Codeur) | quasi mai |
| + `FREELANCER_TOKEN` | 30–50 al giorno | 3–8 al giorno | rare |
| + avvisi email (Upwork, Malt, LinkedIn, F5Bot) | dipende dalle ricerche salvate | molti di più, e i più vicini al tuo profilo | qui arrivano |

Le stime vengono dai giri di prova di un solo giorno: dopo una settimana di giri veri la dashboard (*Statistiche*, *Fonti*) dirà i numeri giusti per fonte.

### Come può migliorare

1. **Imparare da te.** Gli stati che metti in dashboard (risposto, vinto, perso, scartato) sono già salvati. Il passo successivo è usarli per ritarare punteggi e fonti: scartare di più dove scarti sempre, alzare dove vinci.
2. **Haiku per i casi incerti.** Le richieste tra 25 e 45 punti sono quelle in cui le regole sbagliano di più. Un passaggio con Claude Haiku 5.5 (pochi centesimi al giorno) potrebbe:
   - confermarle o scartarle;
   - riassumerle;
   - tradurre la bozza nella lingua del cliente, oggi in inglese per gli annunci in francese.
3. **Collegamento con site-inspector.** Il radar misura già il sito del cliente: piattaforma, librerie di movimento, fascia di difficoltà. Con un link «apri in site-inspector» passi dalla richiesta al preventivo misurato in un clic. I due repository restano separati: si collegano tramite un URL.
4. **Riepilogo settimanale.** Quante richieste per fonte, quante risposte, quante vinte. Serve a capire dove investire tempo, per esempio se vale la pena il programma partner Webflow o Codeable.
5. **Fonti nuove senza toccare il codice.** Qualunque feed RSS, come un forum Discourse, un Google Alert o un newsletter-to-RSS, si aggiunge in `radar.config.json` → `feeds`.

### Limiti da tenere presenti

- Le richieste più ricche (migrazioni, rifacimenti) stanno dietro piattaforme chiuse: il radar le vede solo se ti arrivano per email.
- Sui marketplace aperti (Freelancer, Codeur) la concorrenza è alta: conta rispondere per primi. Il radar avvisa entro 30–60 minuti, e la bozza con la misura del sito è il vantaggio.
- Il radar trova le richieste ma non costruisce la fiducia: per un profilo nuovo contano 2–3 lavori pubblicati e un portfolio che mostri le animazioni.

### Come prodotto

Per uso personale il radar è pronto. Trasformarlo in un servizio per altri freelance vorrebbe dire ridistribuire contenuti delle piattaforme, che i termini d'uso vietano. La forma compatibile è un **template di repository**: ogni persona fa la propria copia, con le proprie chiavi, i propri avvisi email e i propri minuti di GitHub, e nessun dato passa da un servizio centrale. Questo è anche coerente con l'analisi di mercato fatta su site-inspector: il valore sta nel trovare e misurare il lavoro giusto prima degli altri, non nel rivendere gli annunci.
