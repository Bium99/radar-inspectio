import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractUrls, normalizeUrl, detectLang, extractBudget, stripHtml } from '../lib/util.mjs';
import { makeItem } from '../lib/item.mjs';

test('extractUrls: toglie la punteggiatura finale e i duplicati', () => {
  assert.deepEqual(extractUrls('Sito: https://esempio.it/chi-siamo. Anche (https://esempio.it/chi-siamo)'), ['https://esempio.it/chi-siamo']);
});

test('normalizeUrl: via i parametri di tracciamento, restano gli altri', () => {
  assert.equal(normalizeUrl('https://www.upwork.com/jobs/~01abc?utm_source=alert&source=email&page=2'), 'https://www.upwork.com/jobs/~01abc?page=2');
});

test('detectLang: italiano e inglese', () => {
  assert.equal(detectLang('Cerchiamo uno sviluppatore per rifare il nostro sito'), 'it');
  assert.equal(detectLang('We are looking for a developer to rebuild our website'), 'en');
});

test('extractBudget: formati comuni, vince il più alto', () => {
  assert.deepEqual(extractBudget('Budget: $1,500 fixed'), { amount: 1500, currency: 'USD', raw: '$1,500' });
  assert.equal(extractBudget('budget €2k, max 2.5k€').amount, 2500);
  assert.equal(extractBudget('Abbiamo 1.500 € a disposizione').amount, 1500);
  assert.equal(extractBudget('circa 800 euro').amount, 800);
  assert.equal(extractBudget('nessuna cifra qui, solo il 2026'), null);
});

test('stripHtml: testo leggibile, entità decodificate', () => {
  assert.equal(stripHtml('<p>Ciao &amp; <b>benvenuti</b></p><script>x()</script>'), 'Ciao & benvenuti');
});

test('makeItem: id stabile, siti del cliente separati dai link di piattaforma', () => {
  const now = new Date('2026-10-14T10:00:00Z');
  const raw = { source: 'reddit:forhire', url: 'https://www.reddit.com/r/forhire/comments/x?utm_source=a', title: '[Hiring] Webflow to Next.js', text: 'Our site https://acme-studio.com, mockups on https://figma.com/file/1 and https://imgur.com/a/2' };
  const a = makeItem(raw, { now });
  const b = makeItem({ ...raw, url: 'https://www.reddit.com/r/forhire/comments/x' }, { now });
  assert.equal(a.id, b.id);
  assert.deepEqual(a.siteUrls, ['https://acme-studio.com']);
  assert.equal(a.status, 'nuovo');
});
