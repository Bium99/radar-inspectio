#!/usr/bin/env node
/**
 * radar — riga di comando. `radar aiuto` per l'elenco dei comandi.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStore, saveStore, findItem, setStatus, purge } from '../lib/store.mjs';
import { runScan, describeSources } from '../lib/scan.mjs';
import { runCycle, writeEmptyStatuses, loadStatuses, pagesUrl } from '../lib/cycle.mjs';
import { draftProposal } from '../lib/draft.mjs';
import { measureItem, fetchSite, detectStack } from '../lib/measure.mjs';
import { parseAlertEmail } from '../lib/sources/email.mjs';
import { sourcesFor } from '../lib/sources/registry.mjs';
import { buildPayload, writeDashboard, serveDashboard } from '../lib/dashboard.mjs';
import { channelsFromEnv } from '../lib/notify.mjs';
import { ntfyTopicFromPassword } from '../lib/crypto.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(resolve(root, '.env')); } catch { /* .env facoltativo */ }

const config = JSON.parse(readFileSync(resolve(root, 'radar.config.json'), 'utf8'));
const storePath = resolve(root, config.storePath ?? 'data/radar.json');
const env = process.env;
// su GitHub Actions il contatto nello User-Agent è il repository stesso: niente da compilare a mano
if (String(config.userAgent ?? '').includes('CAMBIA-QUI') && env.GITHUB_REPOSITORY) config.userAgent = config.userAgent.replace('CAMBIA-QUI', `github.com/${env.GITHUB_REPOSITORY}`);
const SOURCES = sourcesFor(config);
const password = env.RADAR_PASSWORD || undefined;

const HELP = `radar — richieste di lavoro già aperte, misurate prima di rispondere

Uso quotidiano
  radar dashboard [--da-github] [--porta N]  apre la dashboard su http://127.0.0.1:4747
                                             (--da-github: con i dati raccolti da GitHub Actions)
  radar topic                                il topic ntfy per le notifiche (dalla RADAR_PASSWORD)
  radar fonti                                le fonti e quali sono attive

In locale, senza GitHub
  radar scansiona [--prova]           un giro su tutte le fonti attive (--prova: non salva e non avvisa)
  radar elenco [--stato S] [--min N]  richieste salvate, dalla migliore
  radar mostra <id>                   testo, punteggio con le ragioni, misura del sito
  radar misura <id>                   (ri)misura il sito della richiesta
  radar bozza <id> [--llm]            bozza della risposta; la invii TU
  radar stato <id> <stato> [nota]     nuovo | notificato | risposto | vinto | perso | scartato
  radar pulisci                       cancella le richieste più vecchie di retentionDays (tranne "vinto")
  radar esporta <file.csv>            per Airtable, Notion o un foglio di calcolo

Prove
  radar prova-fonti [--candidati] [--quante N]
                                      un giro vero su tutte le fonti, senza salvare né avvisare
                                      (--candidati: anche quelle ancora da collaudare)
  radar sito <url>                    misura un URL qualsiasi (non salva nulla)
  radar prova-email <file.eml>        prova il lettore su un avviso salvato

GitHub Actions
  radar ciclo --stato F [--stati F] [--sito DIR] [--stati-init F]`;

const args = process.argv.slice(2);
const cmd = args[0] ?? 'aiuto';
const flag = (name) => args.includes(name);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

function row(it) {
  const c = it.classification ?? {};
  return `${it.id}  ${String(c.score ?? '-').padStart(3)}  ${it.status.padEnd(10)}  ${(c.categories ?? []).join(',').padEnd(24)}  ${it.title.slice(0, 70)}`;
}
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function needPassword() {
  if (!password) throw new Error('serve RADAR_PASSWORD (in .env o nell\'ambiente): è la stessa password dei segreti del repository');
  return password;
}

/** Lo stato e gli stati prodotti da GitHub Actions, scaricati dai branch `data` e `stati`. */
function fromGithub() {
  const dir = join(root, 'data', 'github');
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['-C', root, 'fetch', '--quiet', 'origin', '+refs/heads/data:refs/remotes/origin/data'], { stdio: 'inherit' });
  writeFileSync(join(dir, 'state.enc.json'), execFileSync('git', ['-C', root, 'show', 'origin/data:state.enc.json']));
  try {
    execFileSync('git', ['-C', root, 'fetch', '--quiet', 'origin', '+refs/heads/stati:refs/remotes/origin/stati'], { stdio: 'ignore' });
    writeFileSync(join(dir, 'stati.enc.json'), execFileSync('git', ['-C', root, 'show', 'origin/stati:stati.enc.json']));
  } catch { /* nessuno stato sincronizzato ancora */ }
  return { statePath: join(dir, 'state.enc.json'), statusesPath: join(dir, 'stati.enc.json') };
}

async function main() {
  switch (cmd) {
    case 'ciclo': {
      const statePath = resolve(option('--stato') ?? '.radar/state.enc.json');
      const init = option('--stati-init');
      if (init) { writeEmptyStatuses(resolve(init), needPassword()); console.log(`creato ${init}`); break; }
      const summary = await runCycle({
        config, env, specs: SOURCES, statePath,
        statusesPath: option('--stati') ? resolve(option('--stati')) : undefined,
        siteDir: option('--sito') ? resolve(option('--sito')) : undefined,
        log: (m) => console.log(m),
      });
      const srcs = summary.sources.map((s) => `${s.id}=${s.error ? `ERR(${s.error.slice(0, 60)})` : s.count}`).join(' ');
      console.log(`fonti: ${srcs || 'nessuna attiva'}`);
      console.log(`lette ${summary.fetched} · nuove ${summary.fresh} · pertinenti ${summary.relevant} · misurate ${summary.measured} · avvisi ${summary.notified}${summary.firstRun ? ' (primo giro: un solo riepilogo)' : ''} · bozze rifinite ${summary.polished} · in archivio ${summary.items} · cancellate ${summary.removed}`);
      for (const e of summary.notifyErrors) console.log(`::warning::notifica ${e.channel} non riuscita: ${e.error}`);
      if (summary.dashboardUrl) console.log(`dashboard: ${summary.dashboardUrl}`);
      break;
    }
    case 'prova-fonti': {
      // un giro vero su tutte le fonti attive, senza stato, senza avvisi: per collaudare le fonti
      const store = loadStore('/dev/null/nessuno');
      // --candidati: accende anche le fonti candidate, per collaudarle dal vivo
      const specs = flag('--candidati') ? SOURCES.map((s) => (s.candidate ? { ...s, enabled: true } : s)) : SOURCES;
      const summary = await runScan({ config, env, store, specs, notify: false });
      for (const s of summary.sources) console.log(`${s.error ? 'ERRORE' : 'ok    '} ${s.id.padEnd(24)} letti ${String(s.count).padStart(4)}  vecchie ${String(s.stale ?? 0).padStart(3)}  più recente ${s.newest?.slice(0, 10) ?? '—'.padEnd(10)}  richieste ${s.requests}  ${s.ms} ms${s.error ? `  ${s.error}` : ''}`);
      const top = Object.values(store.items).filter((it) => it.status !== 'scartato').sort((a, b) => b.classification.score - a.classification.score);
      console.log(`\nlette ${summary.fetched} · nuove ${summary.fresh} · troppo vecchie ${summary.stale} · pertinenti ${summary.relevant} · misurate ${summary.measured}`);
      const bySource = {};
      for (const it of top) bySource[it.sourceId] = (bySource[it.sourceId] ?? 0) + 1;
      console.log(`pertinenti per fonte: ${JSON.stringify(bySource)}\n`);
      for (const it of top.slice(0, Number(option('--quante') ?? 25))) {
        const c = it.classification;
        console.log(`${String(c.score).padStart(3)}  ${it.sourceId.padEnd(18)} ${(c.categories ?? []).join(',').padEnd(26)} ${it.title.slice(0, 90)}\n     ${it.url}`);
        // perché: la parola che ha fatto scattare ogni categoria, con un po' di testo intorno
        console.log(`     perché: ${Object.entries(c.terms ?? {}).map(([cat, term]) => `${cat} «${term}»`).join(' · ')}${c.employment ? ' · impiego' : ''}${c.intent ? '' : ' · nessuna intenzione'}`);
        if (env.RADAR_DEBUG === '1') {
          const whole = `${it.title}\n${it.text}`;
          for (const term of new Set(Object.values(c.terms ?? {}))) {
            const at = whole.indexOf(term);
            if (at >= 0) console.log(`       «…${whole.slice(Math.max(0, at - 90), at + term.length + 90).replace(/\s+/g, ' ')}…»`);
          }
        }
        if (it.measurement) console.log(`     misura: ${it.measurement.error ?? `${it.measurement.platform ?? '?'} ${it.measurement.tier}`}`);
      }
      break;
    }
    case 'scansiona': {
      const dry = flag('--prova');
      const store = loadStore(storePath, { password });
      const summary = await runScan({ config, env, store, specs: SOURCES, notify: !dry, log: (m) => console.log(m) });
      if (!dry) saveStore(storePath, store, { password });
      console.log(`fonti: ${summary.sources.map((s) => `${s.id}=${s.error ? 'ERR' : s.count}`).join(' ') || 'nessuna attiva (controlla .env)'}`);
      console.log(`lette ${summary.fetched} · nuove ${summary.fresh} · pertinenti ${summary.relevant} · misurate ${summary.measured} · avvisi ${summary.notified}${dry ? ' · PROVA: nulla salvato, nessun avviso' : ''}`);
      break;
    }
    case 'dashboard': {
      const pw = needPassword();
      const github = flag('--da-github');
      const paths = github ? fromGithub() : { statePath: storePath, statusesPath: null };
      const store = loadStore(paths.statePath, { password: pw });
      const siteDir = join(root, 'data', 'site');
      writeDashboard(siteDir, buildPayload(store, {
        config, statuses: loadStatuses(paths.statusesPath, pw), sources: describeSources(SOURCES, env),
        channels: channelsFromEnv(env), repo: null, cadenceMinutes: github ? config.cadenceMinutes ?? 30 : null,
      }), pw);
      const port = Number(option('--porta') ?? 4747);
      await serveDashboard(siteDir, { port });
      console.log(`dashboard su http://127.0.0.1:${port}  (Ctrl+C per chiudere)`);
      break;
    }
    case 'topic': {
      const topic = env.NTFY_TOPIC || ntfyTopicFromPassword(needPassword());
      console.log(`${topic}\n\nInstalla l'app ntfy, aggiungi un'iscrizione a questo topic (server ntfy.sh). Web: https://ntfy.sh/${topic}`);
      break;
    }
    case 'fonti': {
      for (const s of describeSources(SOURCES, env)) console.log(`${s.active ? 'attiva ' : 'spenta '}  ${s.id.padEnd(22)} ${s.label}${!s.active && s.needs.length ? `  (servono: ${s.needs.join(', ')})` : ''}`);
      const url = pagesUrl(env);
      if (url) console.log(`\ndashboard: ${url}`);
      break;
    }
    case 'elenco': {
      const store = loadStore(storePath, { password });
      const status = option('--stato');
      const min = Number(option('--min') ?? 0);
      const items = Object.values(store.items)
        .filter((it) => (status ? it.status === status : ['nuovo', 'notificato'].includes(it.status)))
        .filter((it) => (it.classification?.score ?? 0) >= min)
        .sort((a, b) => (b.classification?.score ?? 0) - (a.classification?.score ?? 0));
      console.log(items.length ? items.map(row).join('\n') : 'nessuna richiesta');
      break;
    }
    case 'mostra': {
      const it = findItem(loadStore(storePath, { password }), args[1] ?? '');
      console.log(`${it.title}\n${it.url}\n${it.sourceLabel ?? it.source} · ${it.lang} · ${it.status}${it.budget ? ` · budget ${it.budget.raw}` : ''}\n`);
      console.log(`${it.text}\n`);
      console.log(`punteggio ${it.classification?.score ?? '-'}:\n  ${(it.classification?.reasons ?? []).join('\n  ')}`);
      if (it.measurement) console.log(`\nmisura: ${JSON.stringify(it.measurement, null, 2)}`);
      break;
    }
    case 'misura': {
      const store = loadStore(storePath, { password });
      const it = findItem(store, args[1] ?? '');
      it.measurement = await measureItem(it, { userAgent: config.userAgent });
      saveStore(storePath, store, { password });
      console.log(JSON.stringify(it.measurement, null, 2));
      break;
    }
    case 'bozza': {
      const it = findItem(loadStore(storePath, { password }), args[1] ?? '');
      let text = draftProposal(it, config);
      if (flag('--llm')) {
        const { polishDraft } = await import('../lib/llm.mjs');
        text = await polishDraft({ item: it, draft: text });
      }
      console.log(`${text}\n\n— bozza: rileggila e correggila prima di inviarla —`);
      break;
    }
    case 'stato': {
      const store = loadStore(storePath, { password });
      const it = setStatus(store, args[1] ?? '', args[2] ?? '', args.slice(3).join(' ') || undefined);
      saveStore(storePath, store, { password });
      console.log(row(it));
      break;
    }
    case 'pulisci': {
      const store = loadStore(storePath, { password });
      const removed = purge(store, { days: config.retentionDays ?? 60 });
      saveStore(storePath, store, { password });
      console.log(`cancellate ${removed} richieste più vecchie di ${config.retentionDays ?? 60} giorni`);
      break;
    }
    case 'esporta': {
      const file = args[1];
      if (!file) throw new Error('indica il file: radar esporta richieste.csv');
      const store = loadStore(storePath, { password });
      const head = ['id', 'punteggio', 'stato', 'categorie', 'titolo', 'fonte', 'url', 'budget', 'lingua', 'piattaforma', 'fascia', 'vista il'];
      const lines = Object.values(store.items).map((it) => [
        it.id, it.classification?.score, it.status, (it.classification?.categories ?? []).join(' '), it.title, it.sourceLabel ?? it.source, it.url,
        it.budget?.raw, it.lang, it.measurement?.platform, it.measurement?.tier, it.firstSeenAt,
      ].map(csvCell).join(','));
      writeFileSync(file, `${head.map(csvCell).join(',')}\n${lines.join('\n')}\n`);
      console.log(`esportate ${lines.length} richieste in ${file}`);
      break;
    }
    case 'sito': {
      const page = await fetchSite(args[1] ?? '', { userAgent: config.userAgent });
      console.log(page.ok ? JSON.stringify({ url: page.finalUrl, ...detectStack(page.html) }, null, 2) : `non misurato: ${page.reason}`);
      break;
    }
    case 'prova-email': {
      const { simpleParser } = await import('mailparser');
      const mail = await simpleParser(readFileSync(args[1] ?? ''));
      console.log(JSON.stringify(parseAlertEmail({
        from: mail.from?.text ?? '', subject: mail.subject ?? '', text: mail.text ?? '',
        html: typeof mail.html === 'string' ? mail.html : '', date: mail.date ?? null, messageId: mail.messageId,
      }), null, 2));
      break;
    }
    default:
      console.log(HELP);
  }
}

main().catch((err) => {
  console.error(`errore: ${err.message}`);
  process.exitCode = 1;
});

