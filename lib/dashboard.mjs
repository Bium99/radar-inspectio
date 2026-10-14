/**
 * dashboard.mjs — costruisce la dashboard statica: `index.html` (con la CSP che ammette solo il suo
 * script, tramite hash) e `data.enc.json` (i dati cifrati con RADAR_PASSWORD). Gira uguale su GitHub
 * Pages e in locale (`radar dashboard`).
 */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encryptJson } from './crypto.mjs';
import { draftProposal } from './draft.mjs';

const TEMPLATE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dashboard', 'index.html');

/** La CSP della pagina: nessuna risorsa esterna, solo lo script inline con quell'hash. Puro. */
export function contentSecurityPolicy(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const hashes = scripts.map((s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`);
  return [
    "default-src 'none'",
    `script-src ${hashes.join(' ')}`,
    "style-src 'unsafe-inline'",
    "connect-src 'self' https://api.github.com",
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** L'HTML pronto da pubblicare. Puro. */
export function renderHtml(template = readFileSync(TEMPLATE, 'utf8')) {
  return template.replace('__CSP__', contentSecurityPolicy(template));
}

/**
 * I dati che la dashboard legge: solo le richieste pertinenti (mai gli id visti), i giri recenti,
 * gli stati sincronizzati, e la bozza già scritta per ogni richiesta. Puro.
 */
export function buildPayload(store, { config, statuses = {}, sources = [], channels = [], repo = null, cadenceMinutes = null, now = new Date() }) {
  const items = Object.values(store.items)
    .map((it) => ({
      ...it,
      draft: it.classification?.redFlag?.kind === 'clone_terzi' ? null : draftProposal(it, config),
    }))
    .sort((a, b) => Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt));
  return {
    version: 1,
    generatedAt: now.toISOString(),
    repo,
    cadenceMinutes,
    notifyMinScore: config.notifyMinScore ?? 45,
    channels: channels.map((c) => c.kind),
    // server e topic di ntfy, mai il token: la dashboard li mostra così come li usa il radar
    ntfy: (({ server, topic, custom }) => (topic ? { server, topic, custom } : null))(channels.find((c) => c.kind === 'ntfy') ?? {}),
    inactiveSources: sources.filter((s) => !s.active).map((s) => s.label),
    statuses,
    runs: (store.runs ?? []).slice(-200),
    items,
  };
}

/** Scrive `index.html` e `data.enc.json` in `outDir`. */
export function writeDashboard(outDir, payload, password) {
  if (!password) throw new Error('la dashboard è cifrata: serve RADAR_PASSWORD');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), renderHtml());
  writeFileSync(join(outDir, 'data.enc.json'), JSON.stringify(encryptJson(payload, password)));
  writeFileSync(join(outDir, '.nojekyll'), '');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json' };

/** Serve la dashboard in locale, solo su 127.0.0.1. */
export function serveDashboard(outDir, { port = 4747 } = {}) {
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    const file = path === '/' ? 'index.html' : path.slice(1);
    if (!['index.html', 'data.enc.json'].includes(file) || !existsSync(join(outDir, file))) {
      res.writeHead(404).end('non trovato');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[file.slice(file.lastIndexOf('.'))], 'cache-control': 'no-store' });
    res.end(readFileSync(join(outDir, file)));
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}
