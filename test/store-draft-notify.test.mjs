import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadStore, saveStore, upsertItems, findItem, setStatus, purge } from '../lib/store.mjs';
import { draftProposal } from '../lib/draft.mjs';
import { formatNotification } from '../lib/notify.mjs';

const it = (id, firstSeenAt, extra = {}) => ({ id, title: `t-${id}`, text: '', source: 's', url: `https://x/${id}`, lang: 'en', status: 'nuovo', firstSeenAt, siteUrls: [], ...extra });

test('store: le già viste conservano stato; salvataggio e rilettura', () => {
  const dir = mkdtempSync(join(tmpdir(), 'radar-'));
  try {
    const path = join(dir, 'sub', 'radar.json');
    const store = loadStore(path);
    assert.equal(upsertItems(store, [it('aaa111', '2026-10-01T00:00:00Z')]).length, 1);
    setStatus(store, 'aaa', 'risposto', 'mandata alle 10');
    assert.equal(upsertItems(store, [it('aaa111', '2026-10-02T00:00:00Z')]).length, 0);
    saveStore(path, store);
    const again = loadStore(path);
    assert.equal(again.items.aaa111.status, 'risposto');
    assert.equal(again.items.aaa111.history[0].note, 'mandata alle 10');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('store: stato non valido e id ambiguo sono errori chiari', () => {
  const store = { version: 1, items: { abc1: it('abc1', '2026-10-01T00:00:00Z'), abc2: it('abc2', '2026-10-01T00:00:00Z') } };
  assert.throws(() => setStatus(store, 'abc1', 'boh'), /stato non valido/);
  assert.throws(() => findItem(store, 'abc'), /ambiguo/);
});

test('purge: cancella le vecchie, tiene i lavori vinti', () => {
  const now = new Date('2026-10-14T00:00:00Z');
  const store = { version: 1, items: {
    old: it('old', '2026-07-01T00:00:00Z'),
    won: it('won', '2026-07-01T00:00:00Z', { status: 'vinto' }),
    recent: it('recent', '2026-10-10T00:00:00Z'),
  } };
  assert.equal(purge(store, { days: 60, now }), 1);
  assert.deepEqual(Object.keys(store.items).sort(), ['recent', 'won']);
});

const config = {
  pricing: { migrazione: { MEDIA: '€1.000–1.800', AVANZATA: 'da valutare' } },
  timeline: { MEDIA: '1–2 settimane' },
  signature: 'Umberto',
};
const measured = { url: 'https://acme-studio.com/', platform: 'webflow', frameworks: [], motion: ['gsap', 'webflow-interactions'], tier: 'MEDIA', tierWhy: 'x' };

test('bozza IT: fatto misurato, prezzo dalla config, firma; mai la parola clone', () => {
  const d = draftProposal({ ...it('x', ''), lang: 'it', title: 'Migrare il sito Webflow in Next.js', text: '', classification: { categories: ['migrazione'] }, measurement: measured }, config);
  assert.match(d, /Ho già dato un'occhiata a acme-studio\.com: è su webflow, con gsap, webflow-interactions/);
  assert.match(d, /Ricompilo le pagine in Next\.js/);
  assert.match(d, /Prezzo: €1\.000–1\.800/);
  assert.match(d, /Tempi: 1–2 settimane/);
  assert.match(d, /Umberto$/);
  assert.doesNotMatch(d, /clon|copia/i);
});

test('bozza EN senza misura: chiede l\'URL e non inventa prezzi', () => {
  const d = draftProposal({ ...it('x', ''), title: 'Fix GSAP bug', classification: { categories: ['animazioni', 'bug_animazione'] } }, config);
  assert.match(d, /If you send me the URL/);
  assert.match(d, /Price: set after the measurement/);
});

test('bozza su sito avanzato: nota onesta', () => {
  const d = draftProposal({ ...it('x', ''), lang: 'it', classification: { categories: ['migrazione'] }, measurement: { ...measured, motion: ['three'], tier: 'AVANZATA' } }, config);
  assert.match(d, /Nota onesta/);
});

test('notifica: punteggio, misura, link e comando per la bozza', () => {
  const text = formatNotification({ ...it('abc123', ''), title: 'Migrate Webflow', budget: { raw: '$2,000' }, classification: { score: 95, categories: ['migrazione'], redFlag: null }, measurement: measured });
  assert.match(text, /^Radar · 95\/100 · migrazione/);
  assert.match(text, /fascia MEDIA/);
  assert.match(text, /radar bozza abc123/);
});
