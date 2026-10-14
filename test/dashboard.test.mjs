import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentSecurityPolicy, renderHtml, buildPayload, writeDashboard, serveDashboard } from '../lib/dashboard.mjs';
import { decryptJson } from '../lib/crypto.mjs';
import { emptyStore } from '../lib/store.mjs';

test('CSP: ammette solo lo script inline con il suo hash, niente risorse esterne', () => {
  const html = '<html><head><meta content="__CSP__"></head><body><script>alert(1)</script></body></html>';
  const csp = contentSecurityPolicy(html);
  const hash = createHash('sha256').update('alert(1)').digest('base64');
  assert.match(csp, new RegExp(`script-src 'sha256-${hash.replace(/[+/=]/g, (c) => `\\${c}`)}'`));
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'self' https:\/\/api\.github\.com/);
  assert.doesNotMatch(csp, /unsafe-eval|script-src[^;]*unsafe-inline/);
});

test('la pagina vera: CSP inserita, un solo script, niente innerHTML sui dati', () => {
  const html = renderHtml();
  assert.ok(!html.includes('__CSP__'));
  assert.equal([...html.matchAll(/<script>/g)].length, 1);
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
});

const config = { notifyMinScore: 45, pricing: {}, timeline: {}, signature: 'U' };

test('payload: solo richieste pertinenti con bozza; niente bozza per la copia di terzi; niente id visti', () => {
  const store = emptyStore();
  store.seen.zzz = 20000;
  store.items.a = { id: 'a', title: 'Migrate Webflow', text: '', lang: 'en', firstSeenAt: '2026-10-14T10:00:00Z', classification: { score: 80, categories: ['migrazione'], redFlag: null } };
  store.items.b = { id: 'b', title: 'Clone competitor', text: '', lang: 'en', firstSeenAt: '2026-10-14T11:00:00Z', status: 'scartato', classification: { score: 0, categories: [], redFlag: { kind: 'clone_terzi', reason: 'x' } } };
  const p = buildPayload(store, { config, sources: [{ label: 'IMAP', active: false }, { label: 'Reddit', active: true }], channels: [{ kind: 'ntfy' }], repo: 'o/r', cadenceMinutes: 30, now: new Date('2026-10-14T12:00:00Z') });
  assert.deepEqual(p.items.map((i) => i.id), ['b', 'a']);
  assert.match(p.items[1].draft, /Migrate Webflow/);
  assert.equal(p.items[0].draft, null);
  assert.ok(!JSON.stringify(p).includes('zzz'));
  assert.deepEqual(p.inactiveSources, ['IMAP']);
  assert.deepEqual(p.channels, ['ntfy']);
  assert.equal(p.repo, 'o/r');
});

test('writeDashboard: dati cifrati con la password; senza password si rifiuta', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'radar-dash-'));
  try {
    const payload = { version: 1, items: [{ id: 'a', title: 'Mario Rossi cerca' }], runs: [] };
    assert.throws(() => writeDashboard(dir, payload, ''), /serve RADAR_PASSWORD/);
    writeDashboard(dir, payload, 'pw');
    const box = JSON.parse(readFileSync(join(dir, 'data.enc.json'), 'utf8'));
    assert.ok(!JSON.stringify(box).includes('Mario'));
    assert.equal(decryptJson(box, 'pw').items[0].title, 'Mario Rossi cerca');
    assert.ok(existsSync(join(dir, '.nojekyll')));

    const server = await serveDashboard(dir, { port: 0 });
    const { port } = server.address();
    try {
      assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
      assert.equal((await fetch(`http://127.0.0.1:${port}/data.enc.json`)).headers.get('cache-control'), 'no-store');
      assert.equal((await fetch(`http://127.0.0.1:${port}/../package.json`)).status, 404);
      assert.equal((await fetch(`http://127.0.0.1:${port}/radar.json`)).status, 404);
    } finally {
      server.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('payload: server e topic di ntfy per la dashboard, mai il token né gli altri segreti dei canali', async () => {
  const { buildPayload } = await import('../lib/dashboard.mjs');
  const { emptyStore } = await import('../lib/store.mjs');
  const channels = [
    { kind: 'ntfy', server: 'https://ntfy.mio.it', topic: 'tp', custom: true, token: 'tk_segreto' },
    { kind: 'telegram', token: 'bot:segreto', chatId: '1' },
  ];
  const p = buildPayload(emptyStore(), { config: {}, channels });
  assert.deepEqual(p.ntfy, { server: 'https://ntfy.mio.it', topic: 'tp', custom: true });
  assert.deepEqual(p.channels, ['ntfy', 'telegram']);
  assert.doesNotMatch(JSON.stringify(p), /segreto/);
  assert.equal(buildPayload(emptyStore(), { config: {}, channels: [] }).ntfy, null);
});
