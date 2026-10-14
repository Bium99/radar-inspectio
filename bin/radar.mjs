#!/usr/bin/env node
/**
 * radar — riga di comando. `radar aiuto` per l'elenco dei comandi.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStore, saveStore, findItem, setStatus, purge } from '../lib/store.mjs';
import { runScan } from '../lib/scan.mjs';
import { draftProposal } from '../lib/draft.mjs';
import { measureItem, fetchSite, detectStack } from '../lib/measure.mjs';
import { parseAlertEmail } from '../lib/sources/email.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(resolve(root, '.env')); } catch { /* .env facoltativo */ }

const config = JSON.parse(readFileSync(resolve(root, 'radar.config.json'), 'utf8'));
const storePath = resolve(root, config.storePath ?? 'data/radar.json');

const HELP = `radar — richieste di lavoro già aperte, misurate prima di rispondere

  radar scansiona [--prova]           un giro su tutte le fonti attive (--prova: non salva e non avvisa)
  radar elenco [--stato S] [--min N]  richieste salvate, dalla migliore (default: nuove e notificate)
  radar mostra <id>                   dettaglio: testo, punteggio con le ragioni, misura del sito
  radar misura <id>                   (ri)misura il sito della richiesta
  radar bozza <id> [--llm]            bozza della risposta (--llm: rifinita con Claude); la invii TU
  radar stato <id> <stato> [nota]     nuovo | notificato | risposto | vinto | perso | scartato
  radar pulisci                       cancella le richieste più vecchie di retentionDays (tranne "vinto")
  radar esporta <file.csv>            esporta per Airtable, Notion o un foglio di calcolo

  radar sito <url>                    prova la misura su un URL qualsiasi (non salva nulla)
  radar prova-email <file.eml>        prova il lettore su un avviso salvato (per calibrarlo sui formati veri)`;

const args = process.argv.slice(2);
const cmd = args[0] ?? 'aiuto';
const flag = (name) => args.includes(name);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

function row(it) {
  const c = it.classification ?? {};
  return `${it.id}  ${String(c.score ?? '-').padStart(3)}  ${it.status.padEnd(10)}  ${(c.categories ?? []).join(',').padEnd(24)}  ${it.title.slice(0, 70)}`;
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function main() {
  const store = loadStore(storePath);
  switch (cmd) {
    case 'scansiona': {
      const dry = flag('--prova');
      const summary = await runScan({
        config, env: process.env, store, log: (m) => console.log(m),
        ...(dry ? { notify: async (text) => console.log(`\n[prova] ${text}\n`) } : {}),
      });
      if (!dry) saveStore(storePath, store);
      console.log(`fonti: ${summary.sources.map((s) => `${s.source}=${s.count}`).join(' ') || 'nessuna attiva (controlla .env e radar.config.json)'}`);
      console.log(`lette ${summary.fetched} · nuove ${summary.fresh} · scartate ${summary.discarded} · misurate ${summary.measured} · avvisi ${summary.notified}${dry ? ' · PROVA: nulla salvato' : ''}`);
      for (const e of summary.errors) console.log(`errore ${e.source}: ${e.error}`);
      process.exitCode = summary.errors.length ? 1 : 0;
      break;
    }
    case 'elenco': {
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
      const it = findItem(store, args[1] ?? '');
      console.log(`${it.title}\n${it.url}\n${it.source} · ${it.lang} · ${it.status}${it.budget ? ` · budget ${it.budget.raw}` : ''}\n`);
      console.log(`${it.text}\n`);
      console.log(`punteggio ${it.classification?.score ?? '-'}:\n  ${(it.classification?.reasons ?? []).join('\n  ')}`);
      if (it.measurement) console.log(`\nmisura: ${JSON.stringify(it.measurement, null, 2)}`);
      break;
    }
    case 'misura': {
      const it = findItem(store, args[1] ?? '');
      it.measurement = await measureItem(it, { userAgent: config.userAgent });
      saveStore(storePath, store);
      console.log(JSON.stringify(it.measurement, null, 2));
      break;
    }
    case 'bozza': {
      const it = findItem(store, args[1] ?? '');
      let text = draftProposal(it, config);
      if (flag('--llm')) {
        const { polishDraft } = await import('../lib/llm.mjs');
        text = await polishDraft({ item: it, draft: text });
      }
      console.log(`${text}\n\n— bozza: rileggila e correggila prima di inviarla —`);
      break;
    }
    case 'stato': {
      const it = setStatus(store, args[1] ?? '', args[2] ?? '', args.slice(3).join(' ') || undefined);
      saveStore(storePath, store);
      console.log(row(it));
      break;
    }
    case 'pulisci': {
      const removed = purge(store, { days: config.retentionDays ?? 60 });
      saveStore(storePath, store);
      console.log(`cancellate ${removed} richieste più vecchie di ${config.retentionDays ?? 60} giorni`);
      break;
    }
    case 'esporta': {
      const file = args[1];
      if (!file) throw new Error('indica il file: radar esporta richieste.csv');
      const head = ['id', 'punteggio', 'stato', 'categorie', 'titolo', 'fonte', 'url', 'budget', 'lingua', 'piattaforma', 'fascia', 'vista il'];
      const lines = Object.values(store.items).map((it) => [
        it.id, it.classification?.score, it.status, (it.classification?.categories ?? []).join(' '), it.title, it.source, it.url,
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
      const items = parseAlertEmail({
        from: mail.from?.text ?? '', subject: mail.subject ?? '', text: mail.text ?? '',
        html: typeof mail.html === 'string' ? mail.html : '', date: mail.date ?? null, messageId: mail.messageId,
      });
      console.log(JSON.stringify(items, null, 2));
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
