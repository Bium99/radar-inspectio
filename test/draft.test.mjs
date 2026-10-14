import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftProposal } from '../lib/draft.mjs';

const it = (id) => ({ id, title: `t-${id}`, text: '', source: 's', url: `https://x/${id}`, lang: 'en', status: 'nuovo', siteUrls: [] });

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
