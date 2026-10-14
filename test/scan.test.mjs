import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pick, fill, mapJson } from '../lib/sources/json.mjs';
import { collect, runSources, isActive, urlsFor } from '../lib/sources/run.mjs';
import { runScan, describeSources } from '../lib/scan.mjs';
import { runCycle, pagesUrl, loadStatuses, writeEmptyStatuses } from '../lib/cycle.mjs';
import { emptyStore, loadStore } from '../lib/store.mjs';
import { decryptJson } from '../lib/crypto.mjs';
import { SOURCES, sourcesFor } from '../lib/sources/registry.mjs';
import { hashId } from '../lib/util.mjs';

test('json: percorsi, modelli di URL, mappatura', () => {
  assert.equal(pick({ a: { b: [{ c: 3 }] } }, 'a.b.0.c'), 3);
  assert.equal(fill('https://x/item?id={objectID}&u={user.name}', { objectID: 42, user: { name: 'a b' } }), 'https://x/item?id=42&u=a%20b');
  const rows = mapJson({ jobs: [
    { url: 'https://r.com/1', title: '<b>Webflow</b> dev', description: '<p>Migrate</p>', publication_date: '2026-10-13T10:00:00' },
    { url: 'javascript:alert(1)', title: 'bad' },
    null,
  ] }, { items: 'jobs', url: 'url', title: 'title', text: 'description', date: 'publication_date' }, 'remotive');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { source: 'remotive', url: 'https://r.com/1', title: 'Webflow dev', text: 'Migrate', publishedAt: new Date('2026-10-13T10:00:00').toISOString() });
  assert.throws(() => mapJson({}, { items: 'jobs', url: 'url' }, 'x'), /manca la lista/);
});

test('run: una richiesta per ricerca, fonti spente senza credenziali', () => {
  assert.equal(urlsFor({ url: 'https://a/?q={q}', queries: ['web flow', 'gsap'] }).map((u) => u.url).join(' '), 'https://a/?q=web%20flow https://a/?q=gsap');
  assert.equal(urlsFor({ url: 'https://a/feed' }).length, 1);
  assert.equal(isActive({ needs: ['K'] }, {}), false);
  assert.equal(isActive({ needs: ['K'] }, { K: 'x' }), true);
  assert.equal(isActive({ enabled: false }, {}), false);
});

const rss = (items) => `<?xml version="1.0"?><rss version="2.0"><channel>${items.map(([t, l, d]) => `<item><title>${t}</title><link>${l}</link><description>${d}</description></item>`).join('')}</channel></rss>`;

test('run: errori parziali dichiarati, risultati tenuti; 429 ferma la fonte', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    if (url.includes('q=b')) return new Response('', { status: 500 });
    return new Response(rss([['Webflow job', `https://s.com/${url.slice(-1)}`, 'x']]));
  };
  const r = await collect({ id: 's', type: 'rss', url: 'https://s.com/?q={q}', queries: ['a', 'b', 'c'], delayMs: 0 }, { userAgent: 'T', fetchImpl });
  assert.equal(r.raws.length, 2);
  assert.match(r.error, /^1\/3 ricerche fallite: HTTP 500/);

  calls = 0;
  const limited = async () => { calls += 1; return new Response('', { status: 429 }); };
  const r2 = await collect({ id: 's', type: 'rss', url: 'https://s.com/?q={q}', queries: ['a', 'b', 'c'], delayMs: 0 }, { userAgent: 'T', fetchImpl: limited });
  assert.equal(calls, 1);
  assert.match(r2.error, /429/);
});

test('run: prefiltro per le fonti senza ricerca; una fonte che esplode non ferma le altre', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('boom')) throw new Error('rete giù');
    return new Response(rss([['Need GSAP animation', 'https://b.com/1', 'paid'], ['Accountant wanted', 'https://b.com/2', 'tax']]));
  };
  const results = await runSources([
    { id: 'board', label: 'Board', type: 'rss', url: 'https://b.com/feed', prefilter: true },
    { id: 'boom', label: 'Boom', type: 'rss', url: 'https://boom.com/feed' },
  ], { userAgent: 'T', fetchImpl, concurrency: 2 });
  assert.equal(results[0].count, 1);
  assert.equal(results[0].raws[0].title, 'Need GSAP animation');
  assert.equal(results[1].count, 0);
  assert.match(results[1].error, /rete giù/);
});

const SPECS = [
  { id: 'a', label: 'Fonte A', type: 'rss', url: 'https://a.com/feed' },
  { id: 'b', label: 'Fonte B', type: 'rss', url: 'https://b.com/feed' },
  { id: 'off', label: 'Spenta', type: 'rss', url: 'https://off.com/feed', needs: ['MANCA'] },
];
const config = { userAgent: 'T', preferredLangs: ['it'], minBudget: 300, notifyMinScore: 45, measureMinScore: 30, storeMinScore: 20 };
const now = new Date('2026-10-14T10:00:00Z');

function siteFetch(feeds) {
  return async (url) => {
    if (feeds[url]) return new Response(feeds[url]);
    if (url === 'https://acme-studio.com/robots.txt') return new Response('User-agent: *\nAllow: /\n');
    if (url === 'https://acme-studio.com/') return new Response('<html data-wf-page="1"><script src="/gsap.min.js"></script></html>');
    if (url.startsWith('https://ntfy.sh')) return new Response('{}');
    return new Response('', { status: 404 });
  };
}

test('scan: doppioni tra fonti, rumore ricordato come visto, copia scartata, misura, notifiche', async () => {
  const feeds = {
    'https://a.com/feed': rss([
      ['Migrate our Webflow site to Next.js', 'https://post.com/1', 'Same design. https://acme-studio.com Budget $2,000'],
      ['Looking for an accountant', 'https://post.com/2', 'taxes'],
      ['Clone our competitor website', 'https://post.com/3', 'Replicate the site of our competitor'],
    ]),
    'https://b.com/feed': rss([['Migrate our Webflow site to Next.js', 'https://post.com/1', 'dup from another source']]),
  };
  const store = emptyStore();
  store.runs.push({ at: 'prima' }); // non è il primo giro
  const sent = [];
  const fetchImpl = async (url, init) => { if (url.startsWith('https://ntfy.sh')) sent.push(JSON.parse(init.body)); return siteFetch(feeds)(url, init); };
  const s = await runScan({ config, env: { NTFY_TOPIC: 't' }, store, specs: SPECS, fetchImpl, now });

  assert.deepEqual(s.sources.map((x) => x.id), ['a', 'b']);
  assert.equal(s.fresh, 3, 'il doppione da B non conta');
  assert.equal(s.relevant, 1);
  assert.equal(s.measured, 1);
  assert.equal(s.notified, 1);
  const good = Object.values(store.items).find((i) => i.url === 'https://post.com/1');
  assert.equal(good.sourceId, 'a');
  assert.equal(good.status, 'notificato');
  assert.equal(good.measurement.platform, 'webflow');
  assert.equal(Object.values(store.items).find((i) => i.url === 'https://post.com/3').status, 'scartato');
  assert.ok(store.seen[hashId('https://post.com/2')], 'il rumore resta solo come id');
  assert.ok(!Object.values(store.items).some((i) => i.url === 'https://post.com/2'));
  assert.equal(sent.length, 1);
  assert.equal(store.runs.at(-1).relevant, 1);
  assert.equal(store.runs.at(-1).sources.length, 2);
  assert.ok(!('raws' in store.runs.at(-1).sources[0]));

  const again = await runScan({ config, env: { NTFY_TOPIC: 't' }, store, specs: SPECS, fetchImpl, now });
  assert.equal(again.fresh, 0);
  assert.equal(sent.length, 1, 'nessuna notifica ripetuta');
});

test('scan: al primo giro un solo riepilogo; annunci vecchi non suonano', async () => {
  const feeds = { 'https://a.com/feed': `<?xml version="1.0"?><rss version="2.0"><channel>
    <item><title>Migrate Webflow site to Astro</title><link>https://p.com/1</link><description>same design</description><pubDate>Tue, 14 Oct 2026 09:00:00 GMT</pubDate></item>
    <item><title>Framer to Next.js migration</title><link>https://p.com/2</link><description>pixel perfect</description><pubDate>Tue, 14 Oct 2026 08:00:00 GMT</pubDate></item>
    <item><title>Old: GSAP animation rebuild of our site</title><link>https://p.com/3</link><description>migrate webflow</description><pubDate>Mon, 01 Sep 2026 08:00:00 GMT</pubDate></item>
  </channel></rss>` };
  const sent = [];
  const fetchImpl = async (url, init) => { if (url.startsWith('https://ntfy.sh')) { sent.push(JSON.parse(init.body)); return new Response('{}'); } return siteFetch(feeds)(url); };
  const store = emptyStore();
  const s = await runScan({ config, env: { NTFY_TOPIC: 't' }, store, specs: [{ ...SPECS[0], demand: true }], fetchImpl, now, dashboardUrl: 'https://u.github.io/r/' });
  assert.equal(s.firstRun, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].title, /Radar attivo: 2 richieste da valutare/);
  assert.equal(s.notified, 2);
  const old = Object.values(store.items).find((i) => i.url === 'https://p.com/3');
  assert.equal(old.status, 'nuovo', 'in dashboard, ma senza notifica');
});

test('describeSources: attive e spente con le credenziali che mancano', () => {
  assert.deepEqual(describeSources(SPECS, {}).map((s) => [s.id, s.active]), [['a', true], ['b', true], ['off', false]]);
  assert.ok(SOURCES.every((s) => s.id && s.label && s.type), 'ogni fonte del registro ha id, etichetta e tipo');
  assert.equal(new Set(SOURCES.map((s) => s.id)).size, SOURCES.length, 'id unici');
});

test('cycle: URL di Pages, stato e dashboard cifrati, stati sincronizzati letti', async () => {
  assert.equal(pagesUrl({ GITHUB_REPOSITORY: 'Bium99/radar-inspectio' }), 'https://bium99.github.io/radar-inspectio/');
  assert.equal(pagesUrl({ GITHUB_REPOSITORY: 'Bium99/bium99.github.io' }), 'https://bium99.github.io/');
  assert.equal(pagesUrl({ DASHBOARD_URL: 'https://x.it/' }), 'https://x.it/');
  assert.equal(pagesUrl({}), null);

  const dir = mkdtempSync(join(tmpdir(), 'radar-cycle-'));
  try {
    const feeds = { 'https://a.com/feed': rss([['Migrate our Webflow site to Next.js', 'https://post.com/1', 'Same design, budget $2,000']]) };
    const statePath = join(dir, 'state.enc.json');
    const statusesPath = join(dir, 'stati.enc.json');
    writeEmptyStatuses(statusesPath, 'pw');
    assert.deepEqual(loadStatuses(statusesPath, 'pw'), {});
    await assert.rejects(runCycle({ config, env: {}, specs: SPECS.slice(0, 1), statePath }), /manca RADAR_PASSWORD/);

    const s = await runCycle({ config, env: { RADAR_PASSWORD: 'pw', NTFY_OFF: '1', GITHUB_REPOSITORY: 'o/r' }, specs: SPECS.slice(0, 1), statePath, statusesPath, siteDir: join(dir, 'site'), fetchImpl: siteFetch(feeds), now });
    assert.equal(s.items, 1);
    assert.equal(s.dashboardUrl, 'https://o.github.io/r/');
    assert.ok(!readFileSync(statePath, 'utf8').includes('Webflow'));
    assert.equal(Object.values(loadStore(statePath, { password: 'pw' }).items)[0].title, 'Migrate our Webflow site to Next.js');
    const payload = decryptJson(JSON.parse(readFileSync(join(dir, 'site', 'data.enc.json'), 'utf8')), 'pw');
    assert.equal(payload.repo, 'o/r');
    assert.equal(payload.items.length, 1);
    assert.match(payload.items[0].draft, /Migrate our Webflow site/);
    assert.ok(existsSync(join(dir, 'site', 'index.html')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cadenza per fonte: una fonte «ogni 6 ore» salta i giri intermedi e lo dichiara', async () => {
  const feeds = { 'https://a.com/feed': rss([['Looking for a GSAP developer', 'https://p.com/x', 'paid']]) };
  const store = emptyStore();
  const spec = { id: 'slow', label: 'Lenta', type: 'rss', url: 'https://a.com/feed', everyMinutes: 360 };
  store.runs.push({ at: '2026-10-14T08:00:00Z', sources: [{ id: 'slow', count: 3, error: null }] });
  const s = await runScan({ config, env: {}, store, specs: [spec], fetchImpl: siteFetch(feeds), now, notify: false });
  assert.deepEqual(s.sources, [{ id: 'slow', label: 'Lenta', count: 0, requests: 0, ms: 0, error: null, skipped: true }]);
  const later = await runScan({ config, env: {}, store, specs: [spec], fetchImpl: siteFetch(feeds), now: new Date('2026-10-14T14:30:00Z'), notify: false });
  assert.equal(later.sources[0].skipped, undefined);
  assert.equal(later.sources[0].count, 1);
});

test('fonte custom: thread mensile di HN, solo i commenti di primo livello con un ruolo creativo nel titolo', async () => {
  const spec = SOURCES.find((s) => s.id === 'hn-hiring');
  const fetchImpl = async (url) => {
    if (url.includes('author_whoishiring')) return Response.json({ hits: [{ objectID: '200', title: 'Ask HN: Who is hiring? (October 2026)' }, { objectID: '100', title: 'Ask HN: Who wants to be hired? (October 2026)' }] });
    if (url.includes('story_200')) return Response.json({ hits: [
      { objectID: '1', parent_id: 200, comment_text: 'Studio X | Creative Developer (GSAP, WebGL) | Remote | Contract<p>Scroll animations for client sites.', created_at: '2026-10-02T10:00:00Z' },
      { objectID: '2', parent_id: 200, comment_text: 'Bank Y | Backend Engineer | NYC | Full-time', created_at: '2026-10-02T11:00:00Z' },
      { objectID: '3', parent_id: 1, comment_text: 'Creative Developer reply', created_at: '2026-10-02T12:00:00Z' },
    ] });
    return new Response('', { status: 404 });
  };
  const r = await collect(spec, { userAgent: 'T', fetchImpl });
  assert.equal(r.error, null);
  assert.deepEqual(r.raws.map((x) => x.url), ['https://news.ycombinator.com/item?id=1']);
  assert.equal(r.raws[0].title, 'Studio X | Creative Developer (GSAP, WebGL) | Remote | Contract');
  assert.equal(r.raws[0].source, 'hn-hiring');
});

test('registro: fonti spente e feed aggiunti da radar.config.json', () => {
  const specs = sourcesFor({ disabledSources: ['codeur'], feeds: [{ url: 'https://forum.esempio.it/c/lavoro.rss', label: 'Forum' }, { url: 'javascript:alert(1)' }] });
  assert.equal(specs.find((s) => s.id === 'codeur').enabled, false);
  const feed = specs.find((s) => s.id === 'feed-1');
  assert.deepEqual({ type: feed.type, url: feed.url, prefilter: feed.prefilter, demand: feed.demand }, { type: 'rss', url: 'https://forum.esempio.it/c/lavoro.rss', prefilter: true, demand: false });
  assert.equal(specs.filter((s) => s.family === 'custom').length, 1, 'un URL non http(s) non diventa una fonte');
  assert.equal(new Set(SOURCES.map((s) => s.id)).size, SOURCES.length, 'id unici');
});

test('scan: lo stesso annuncio con un altro link (bacheche, due fonti) è una richiesta sola, anche al giro dopo', async () => {
  const body = 'Contract role. We need a GSAP developer for scroll animations on our marketing site, three months.';
  const feed = (links) => rss(links.map((l) => ['Senior Frontend Developer', l, body]));
  const specs = [{ id: 'b', label: 'B', type: 'rss', demand: true, url: 'https://b.com/feed' }];
  const store = emptyStore();
  let links = ['https://b.com/jobs/1', 'https://b.com/jobs/2', 'https://b.com/jobs/3'];
  const fetchImpl = async () => new Response(feed(links));
  const config = { userAgent: 'T' };
  const first = await runScan({ config, env: {}, store, specs, fetchImpl, notify: false, now: new Date('2026-10-14T10:00:00Z') });
  assert.equal(first.fresh, 1);
  links = ['https://b.com/jobs/4'];
  const second = await runScan({ config, env: {}, store, specs, fetchImpl, notify: false, now: new Date('2026-10-14T11:00:00Z') });
  assert.equal(second.fresh, 0, 'ripubblicato con un link nuovo: già visto');
});
