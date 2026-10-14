/**
 * run.mjs — legge le fonti del registro: una richiesta per ricerca, timeout corti, più fonti in
 * parallelo ma con un tetto. Una fonte che fallisce si dichiara e il giro continua.
 */
import { parseFeed } from './rss.mjs';
import { mapJson } from './json.mjs';
import { fetchAlertEmails } from './email.mjs';
import { PREFILTER, queriesFor } from '../profile.mjs';

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** `true` se l'ambiente ha tutte le credenziali che la fonte chiede. Puro. */
export function isActive(spec, env) {
  if (spec.enabled === false) return false;
  return (spec.needs ?? []).every((name) => Boolean(env[name]));
}

/** Gli URL da chiamare: uno per ricerca, o uno solo. Puro. */
export function urlsFor(spec) {
  const queries = spec.url.includes('{q}') ? queriesFor(spec.queries ?? 'core') : [null];
  return queries.map((q) => ({ q, url: q == null ? spec.url : spec.url.replaceAll('{q}', encodeURIComponent(q)) }));
}

/** GET di un JSON con User-Agent e timeout: per le fonti `custom`. */
export async function getJson(url, { userAgent, fetchImpl = fetch, timeoutMs = 12000 }) {
  const res = await fetchImpl(url, { headers: { 'user-agent': userAgent, accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (res.status === 429) throw new Error('HTTP 429 (troppe richieste)');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchOne(spec, url, { userAgent, fetchImpl, env }) {
  const headers = { 'user-agent': userAgent, accept: spec.type === 'json' ? 'application/json' : 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5', ...(spec.headers ?? {}) };
  for (const [header, envName] of Object.entries(spec.headersFromEnv ?? {})) headers[header] = env[envName];
  const res = await fetchImpl(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(spec.timeoutMs ?? 12000) });
  if (res.status === 429) throw new Error('HTTP 429 (troppe richieste)');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (spec.type === 'json') {
    const json = await res.json();
    return mapJson(spec.transform ? spec.transform(json) : json, spec.json, spec.id);
  }
  return parseFeed(await res.text(), spec.id).map((r) => ({ ...r, source: spec.id }));
}

/**
 * Legge una fonte. Errori parziali (una ricerca su dieci) si dichiarano senza buttare il resto.
 * @returns {Promise<{raws: object[], requests: number, error: string|null}>}
 */
export async function collect(spec, { userAgent, fetchImpl = fetch, env = {}, readEmails = fetchAlertEmails }) {
  if (spec.type === 'custom') {
    const raws = await spec.fetch({ userAgent, fetchImpl, env, getJson: (url) => getJson(url, { userAgent, fetchImpl, timeoutMs: spec.timeoutMs }) });
    let out = raws.map((r) => ({ ...r, source: spec.id }));
    if (spec.filter) out = out.filter(spec.filter);
    if (spec.prefilter) out = out.filter((r) => PREFILTER.test(`${r.title}\n${r.text}`));
    return { raws: out.slice(0, spec.maxItems ?? 200), requests: raws.requests ?? 1, error: null };
  }
  if (spec.type === 'imap') {
    const raws = await readEmails({ host: env.IMAP_HOST, port: env.IMAP_PORT, user: env.IMAP_USER, pass: env.IMAP_PASS, mailbox: env.IMAP_MAILBOX || spec.mailbox || 'Radar' });
    return { raws: raws.map((r) => ({ ...r, source: spec.id, sourceDetail: r.source })), requests: 1, error: null };
  }
  const byUrl = new Map();
  const errors = [];
  let requests = 0;
  const targets = urlsFor(spec);
  for (const [i, { url }] of targets.entries()) {
    if (i > 0) await sleep(spec.delayMs ?? 400);
    requests += 1;
    try {
      for (const r of await fetchOne(spec, url, { userAgent, fetchImpl, env })) if (!byUrl.has(r.url)) byUrl.set(r.url, r);
    } catch (err) {
      errors.push(err.name === 'TimeoutError' ? 'tempo scaduto' : err.message);
      if (/429|401|403/.test(err.message)) break; // la fonte ci sta respingendo: inutile insistere in questo giro
    }
  }
  let raws = [...byUrl.values()];
  if (spec.filter) raws = raws.filter(spec.filter);
  if (spec.prefilter) raws = raws.filter((r) => PREFILTER.test(`${r.title}\n${r.text}`));
  const failedAll = errors.length && errors.length >= requests;
  return {
    raws: raws.slice(0, spec.maxItems ?? 200),
    requests,
    error: errors.length ? `${failedAll ? '' : `${errors.length}/${requests} ricerche fallite: `}${[...new Set(errors)].join('; ')}` : null,
  };
}

/** Legge tutte le fonti attive con al massimo `concurrency` in parallelo. */
export async function runSources(specs, { concurrency = 6, ...opts }) {
  const results = new Array(specs.length);
  let next = 0;
  const worker = async () => {
    while (next < specs.length) {
      const i = next++;
      const spec = specs[i];
      const started = Date.now();
      try {
        const r = await collect(spec, opts);
        results[i] = { id: spec.id, label: spec.label, count: r.raws.length, requests: r.requests, ms: Date.now() - started, error: r.error, raws: r.raws };
      } catch (err) {
        results[i] = { id: spec.id, label: spec.label, count: 0, requests: 1, ms: Date.now() - started, error: err.message, raws: [] };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, specs.length) }, worker));
  return results;
}
