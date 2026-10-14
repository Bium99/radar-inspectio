import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../lib/classify.mjs';
import { makeItem } from '../lib/item.mjs';

const now = new Date('2026-10-14T10:00:00Z');
const cfg = { preferredLangs: ['it'], minBudget: 300 };
const item = (title, text = '', extra = {}) => ({ ...makeItem({ source: 'test', url: `https://x.test/${title.length}${text.length}`, title, text }, { now }), ...extra });

test('migrazione in inglese, con sito e budget', () => {
  const c = classify(item('Migrate our Webflow site to Next.js', 'Keep the exact same design. Site: https://acme-studio.com Budget $2,000'), cfg, { now });
  assert.deepEqual(c.categories, ['migrazione', 'rifacimento']);
  assert.equal(c.redFlag, null);
  assert.equal(c.score, 70 + 15 + 10);
});

test('migrazione in italiano: bonus lingua', () => {
  const c = classify(item('Rifare il sito WordPress in Astro', 'Vogliamo uscire da WordPress e mantenere lo stesso design.'), cfg, { now });
  assert.ok(c.categories.includes('migrazione'));
  assert.ok(c.reasons.some((r) => r.includes('lingua it')));
});

test('animazione rotta', () => {
  const c = classify(item('GSAP ScrollTrigger animation broken on mobile', 'The pinned section stutters on iOS, need a fix.'), cfg, { now });
  assert.deepEqual(c.categories, ['animazioni', 'bug_animazione']);
});

test('bandiera rossa: copiare il sito di un concorrente si scarta sempre', () => {
  const c = classify(item('Clone our competitor website', 'We want to replicate the site of our main competitor, same animations.'), cfg, { now });
  assert.equal(c.redFlag.kind, 'clone_terzi');
  assert.equal(c.score, 0);
});

test('replicare IL PROPRIO sito non è una bandiera rossa', () => {
  const c = classify(item('Replicate our current site in React', 'We own the design; move it off Webflow.'), cfg, { now });
  assert.equal(c.redFlag, null);
  assert.ok(c.categories.includes('migrazione'));
});

test('clonare senza dire di chi è il sito: ambiguo, punteggio dimezzato', () => {
  const base = classify(item('Need a developer for GSAP animations'), cfg, { now }).score;
  const c = classify(item('Clone this landing with GSAP animations'), cfg, { now });
  assert.equal(c.redFlag.kind, 'ambiguo');
  assert.equal(c.score, Math.round(base / 2));
});

test('impiego a tempo pieno: penalità', () => {
  const c = classify(item('Full-time frontend developer, GSAP animations', 'Annual salary and benefits package.'), cfg, { now });
  assert.ok(c.employment);
  assert.equal(c.score, 30 - 25);
});

test('richiesta fresca: bonus', () => {
  const fresh = classify(item('Webflow animations needed', '', { publishedAt: '2026-10-14T09:00:00Z' }), cfg, { now });
  const old = classify(item('Webflow animations needed', '', { publishedAt: '2026-10-13T09:00:00Z' }), cfg, { now });
  assert.equal(fresh.score - old.score, 10);
});

test('budget sotto la soglia: penalità', () => {
  const c = classify(item('Fix GSAP animation bug', 'Budget $50'), cfg, { now });
  assert.ok(c.reasons.some((r) => r.includes('sotto 300')));
});
