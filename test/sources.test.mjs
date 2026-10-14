import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../lib/sources/rss.mjs';
import { parseListing } from '../lib/sources/reddit.mjs';
import { parseAlertEmail } from '../lib/sources/email.mjs';

test('RSS 2.0', () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Lavoro</title>
    <item><title>Cerco sviluppatore Webflow</title><link>https://forum.esempio.com/t/1</link>
      <description>&lt;p&gt;Migrazione del nostro sito&lt;/p&gt;</description><pubDate>Tue, 13 Oct 2026 08:00:00 GMT</pubDate></item>
    <item><title>Seconda</title><link>https://forum.esempio.com/t/2</link><description>x</description></item>
  </channel></rss>`;
  const items = parseFeed(xml, 'forum');
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { source: 'rss:forum', url: 'https://forum.esempio.com/t/1', title: 'Cerco sviluppatore Webflow', text: 'Migrazione del nostro sito', publishedAt: '2026-10-13T08:00:00.000Z' });
  assert.equal(items[1].publishedAt, null);
});

test('Atom, con link alternate', () => {
  const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title type="html">Framer to code</title><link rel="alternate" href="https://e.com/a"/><link rel="self" href="https://e.com/a.json"/>
      <id>tag:e.com,1</id><updated>2026-10-13T08:00:00Z</updated><summary>Need help</summary></entry></feed>`;
  const [it] = parseFeed(xml, 'atom');
  assert.equal(it.url, 'https://e.com/a');
  assert.equal(it.title, 'Framer to code');
  assert.equal(it.text, 'Need help');
});

test('feed non riconosciuto: errore chiaro', () => {
  assert.throws(() => parseFeed('<html></html>', 'x'), /non riconosciuto/);
});

test('Reddit: solo chi cerca, non chi si offre; niente post fissati', () => {
  const json = { data: { children: [
    { data: { title: '[Hiring] Webflow developer to migrate our site', selftext: 'Budget $1500', permalink: '/r/forhire/comments/a/x/', created_utc: 1792000000 } },
    { data: { title: '[For Hire] Webflow dev available', selftext: 'hire me', permalink: '/r/forhire/comments/b/y/', created_utc: 1792000000 } },
    { data: { title: 'Rules', selftext: '', permalink: '/r/forhire/comments/c/z/', stickied: true } },
    { data: { title: 'Show off my portfolio', selftext: 'look', permalink: '/r/webflow/comments/d/w/' } },
  ] } };
  const items = parseListing(json, 'forhire', { onlyHiring: true });
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://www.reddit.com/r/forhire/comments/a/x/');
  assert.equal(items[0].source, 'reddit:forhire');
  assert.equal(parseListing(json, 'forhire', { onlyHiring: false }).length, 3);
});

// Avviso SINTETICO, costruito per il test: il formato vero va verificato su un'email reale (README).
const UPWORK_ALERT = {
  from: 'Upwork <donotreply@upwork.com>',
  subject: 'New jobs matching "webflow"',
  date: '2026-10-14T07:00:00Z',
  html: `<html><body>
    <a href="https://www.upwork.com/jobs/~01aaa?source=alert&amp;utm_campaign=x"><img src="logo.png"></a>
    <a href="https://www.upwork.com/jobs/~01aaa?source=alert&amp;utm_campaign=x">Migrate Webflow site to Next.js with GSAP</a>
    <p>Fixed price · $2,000 · We need the same design and animations.</p>
    <a href="https://www.upwork.com/jobs/~01bbb">Fix scroll animation on Framer site</a>
    <a href="https://www.upwork.com/ab/notification-settings">Manage your alerts</a>
    <a href="https://www.upwork.com/unsubscribe?x=1">Unsubscribe</a>
  </body></html>`,
  text: 'Migrate Webflow site to Next.js with GSAP\nFixed price · $2,000 · We need the same design and animations.\nFix scroll animation on Framer site\nOn a Framer site the parallax jumps.',
};

test('email Upwork: un elemento per annuncio, testo vicino al titolo, niente link di servizio', () => {
  const items = parseAlertEmail(UPWORK_ALERT);
  assert.equal(items.length, 2);
  assert.equal(items[0].source, 'email:upwork');
  assert.equal(items[0].title, 'Migrate Webflow site to Next.js with GSAP');
  assert.match(items[0].text, /\$2,000/);
  assert.doesNotMatch(items[0].text, /Fix scroll/, 'il testo si ferma al titolo successivo');
  assert.doesNotMatch(items[1].text, /Manage|Unsubscribe/, 'niente link di servizio nel testo');
  assert.equal(items[1].title, 'Fix scroll animation on Framer site');
  assert.equal(items[0].publishedAt, '2026-10-14T07:00:00.000Z');
});

test('email sconosciuta: una richiesta sola con oggetto e corpo', () => {
  const items = parseAlertEmail({ from: 'amico@esempio.it', subject: 'Ti segnalo un lavoro', text: 'Uno studio cerca chi migri il sito da Wix.', html: '', messageId: '<abc@x>' });
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Ti segnalo un lavoro');
  assert.equal(items[0].url, 'email:<abc@x>');
});
