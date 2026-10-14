/**
 * scan.mjs — un giro del radar: legge le fonti, toglie i doppioni, classifica, tiene solo il pertinente,
 * misura i siti, avvisa, registra la salute delle fonti. Una fonte che fallisce si dichiara e basta.
 */
import { makeItem } from './item.mjs';
import { classify } from './classify.mjs';
import { measureItem } from './measure.mjs';
import { notifyAll, channelsFromEnv } from './notify.mjs';
import { isKnown, markSeen, recordRun } from './store.mjs';
import { runSources, isActive } from './sources/run.mjs';
import { fetchAlertEmails } from './sources/email.mjs';

const DAY = 86_400_000;

/** Le fonti con il loro stato di attivazione, per la dashboard. Puro. */
export function describeSources(specs, env) {
  return specs.map((s) => ({ id: s.id, label: s.label, active: isActive(s, env), needs: s.needs ?? [] }));
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i]); }
  }));
}

/**
 * @param {{config: object, env: object, store: object, specs: object[], fetchImpl?: typeof fetch, now?: Date,
 *   readEmails?: Function, sendMail?: Function, dashboardUrl?: string|null, notify?: boolean, log?: (m: string) => void}} deps
 */
export async function runScan({ config, env, store, specs, fetchImpl = fetch, now = new Date(), readEmails = fetchAlertEmails, sendMail, dashboardUrl = null, notify = true, log = () => {} }) {
  const started = Date.now();
  const firstRun = !(store.runs?.length);
  // cadenza per fonte: alcune API chiedono nei termini d'uso poche chiamate al giorno
  const lastOk = new Map();
  for (const run of store.runs ?? []) for (const s of run.sources ?? []) if (!s.error && !s.skipped) lastOk.set(s.id, Date.parse(run.at));
  const due = (s) => !s.everyMinutes || !lastOk.has(s.id) || now - lastOk.get(s.id) >= s.everyMinutes * 60_000 - 60_000;
  const active = specs.filter((s) => isActive(s, env));
  const skipped = active.filter((s) => !due(s)).map((s) => ({ id: s.id, label: s.label, count: 0, requests: 0, ms: 0, error: null, skipped: true }));
  const results = await runSources(active.filter(due), { userAgent: config.userAgent, fetchImpl, env, readEmails, concurrency: config.concurrency ?? 6 });

  const specById = new Map(specs.map((s) => [s.id, s]));
  const fresh = [];
  const thisRun = new Set();
  for (const r of results) {
    for (const raw of r.raws) {
      const item = makeItem(raw, { now });
      if (thisRun.has(item.id)) continue;
      thisRun.add(item.id);
      if (isKnown(store, item.id)) { if (store.items[item.id]) store.items[item.id].lastSeenAt = now.toISOString(); continue; }
      item.sourceId = r.id;
      item.sourceLabel = r.label;
      const spec = specById.get(r.id);
      if (spec?.demand || raw.demand) item.demandSource = true;
      if (spec?.family === 'jobboard') item.jobBoard = true;
      fresh.push(item);
    }
  }

  const minStore = config.storeMinScore ?? 20;
  const relevant = [];
  for (const item of fresh) {
    item.classification = classify(item, config, { now });
    const c = item.classification;
    if (c.redFlag?.kind === 'clone_terzi') { item.status = 'scartato'; store.items[item.id] = item; continue; }
    if (!c.categories.length || c.score < minStore) { markSeen(store, item.id, { now }); continue; }
    store.items[item.id] = item;
    relevant.push(item);
  }

  const toMeasure = relevant
    .filter((it) => it.classification.score >= (config.measureMinScore ?? 30) && it.siteUrls.length)
    .sort((a, b) => b.classification.score - a.classification.score)
    .slice(0, config.maxMeasurePerRun ?? 8);
  await mapLimit(toMeasure, 3, async (it) => { it.measurement = await measureItem(it, { userAgent: config.userAgent, fetchImpl, now }); });

  const maxAge = (config.notifyMaxAgeDays ?? 3) * DAY;
  const worth = relevant
    .filter((it) => it.classification.score >= (config.notifyMinScore ?? 45))
    .filter((it) => config.notifyEmployment || !it.classification.employment)
    .filter((it) => !it.publishedAt || now - Date.parse(it.publishedAt) <= maxAge)
    .sort((a, b) => b.classification.score - a.classification.score);

  let notifyErrors = [];
  let notified = 0;
  if (notify && worth.length) {
    const channels = channelsFromEnv(env);
    const batch = firstRun
      ? [{ id: '', title: `Radar attivo: ${worth.length} richieste da valutare`, url: dashboardUrl ?? '', classification: { score: worth[0].classification.score, categories: [] } }]
      : worth;
    const res = await notifyAll(batch, { channels, dashboardUrl, fetchImpl, sendMail, log });
    notifyErrors = res.errors;
    if (res.sent || !channels.length) {
      for (const it of worth) it.status = 'notificato';
      notified = worth.length;
    }
  }

  const sources = [...results.map(({ raws, ...rest }) => rest), ...skipped];
  recordRun(store, {
    at: now.toISOString(),
    durationMs: Date.now() - started,
    sources,
    fetched: results.reduce((n, r) => n + r.count, 0),
    fresh: fresh.length,
    relevant: relevant.length,
    notified,
    notifyErrors,
  });
  for (const s of sources) if (s.error) log(`fonte ${s.label}: ${s.error}`);
  return { sources, fetched: results.reduce((n, r) => n + r.count, 0), fresh: fresh.length, relevant: relevant.length, measured: toMeasure.length, notified, notifyErrors, firstRun };
}
