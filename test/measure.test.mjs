import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectStack, isAllowedByRobots, isPublicHttpUrl, fetchSite, measureItem } from '../lib/measure.mjs';

test('detectStack: Webflow con GSAP e interazioni → MEDIA', () => {
  const html = '<html data-wf-page="1" data-wf-site="2"><body><div data-w-id="abc"></div><script src="https://cdn.jsdelivr.net/npm/gsap@3.12/dist/gsap.min.js"></script></body></html>';
  const s = detectStack(html);
  assert.equal(s.platform, 'webflow');
  assert.deepEqual(s.motion, ['gsap', 'webflow-interactions']);
  assert.equal(s.tier, 'MEDIA');
});

test('detectStack: Framer → AVANZATA, come nei benchmark', () => {
  const s = detectStack('<div data-framer-component-type="x"><img src="https://framerusercontent.com/images/a.png"></div>');
  assert.equal(s.platform, 'framer');
  assert.equal(s.tier, 'AVANZATA');
});

test('detectStack: Next.js senza movimento visibile lo dichiara', () => {
  const s = detectStack('<script src="/_next/static/chunks/main.js"></script>');
  assert.deepEqual(s.frameworks, ['nextjs']);
  assert.equal(s.tier, 'BASSA');
  assert.match(s.tierWhy, /bundle/);
});

test('detectStack: canvas o three.js → AVANZATA', () => {
  assert.equal(detectStack('<canvas id="gl"></canvas>').tier, 'AVANZATA');
  assert.equal(detectStack('<script src="/js/three.module.min.js"></script>').tier, 'AVANZATA');
});

test('robots: gruppo specifico, regola più lunga, Disallow vuoto', () => {
  const robots = 'User-agent: *\nDisallow: /privato\nAllow: /privato/pubblico\n\nUser-agent: RadarRichieste\nDisallow: /\n';
  assert.equal(isAllowedByRobots(robots, 'RadarRichieste', '/'), false);
  assert.equal(isAllowedByRobots(robots, 'AltroBot', '/'), true);
  assert.equal(isAllowedByRobots(robots, 'AltroBot', '/privato/x'), false);
  assert.equal(isAllowedByRobots(robots, 'AltroBot', '/privato/pubblico/x'), true);
  assert.equal(isAllowedByRobots('User-agent: *\nDisallow:\n', 'X', '/qualsiasi'), true);
  assert.equal(isAllowedByRobots('User-agent: *\nDisallow: /*.pdf$\n', 'X', '/doc.pdf'), false);
  assert.equal(isAllowedByRobots('', 'X', '/'), true);
});

test('isPublicHttpUrl: niente host interni o protocolli strani', () => {
  assert.equal(isPublicHttpUrl('https://acme-studio.com/'), true);
  assert.equal(isPublicHttpUrl('https://fcbarcelona.com/'), true);
  for (const bad of ['http://localhost:3000', 'http://127.0.0.1', 'http://10.0.0.5', 'http://192.168.1.1', 'http://172.20.0.1', 'http://[::1]/', 'file:///etc/passwd', 'http://intranet/', 'http://169.254.169.254/latest']) {
    assert.equal(isPublicHttpUrl(bad), false, bad);
  }
});

function fakeFetch(routes) {
  return async (url) => {
    const r = routes[url];
    if (!r) return new Response('not found', { status: 404 });
    if (r instanceof Error) throw r;
    return new Response(r.body ?? '', { status: r.status ?? 200 });
  };
}

test('fetchSite: rispetta robots.txt', async () => {
  const fetchImpl = fakeFetch({ 'https://a.com/robots.txt': { body: 'User-agent: *\nDisallow: /\n' }, 'https://a.com/': { body: '<html></html>' } });
  const r = await fetchSite('https://a.com/', { userAgent: 'RadarRichieste/0.1', fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.blockedByRobots, true);
});

test('fetchSite: robots assente (404) = permesso; 5xx = non si scarica', async () => {
  const ok = await fetchSite('https://b.com/', { userAgent: 'R', fetchImpl: fakeFetch({ 'https://b.com/': { body: '<p>ok</p>' } }) });
  assert.equal(ok.ok, true);
  assert.equal(ok.html, '<p>ok</p>');
  const no = await fetchSite('https://c.com/', { userAgent: 'R', fetchImpl: fakeFetch({ 'https://c.com/robots.txt': { status: 503 }, 'https://c.com/': { body: 'x' } }) });
  assert.equal(no.ok, false);
});

test('measureItem: un errore si dichiara, non lancia', async () => {
  const m = await measureItem({ siteUrls: ['https://d.com/'] }, { userAgent: 'R', fetchImpl: fakeFetch({ 'https://d.com/': new Error('rete giù') }) });
  assert.deepEqual(m, { url: 'https://d.com/', error: 'rete giù' });
  assert.equal(await measureItem({ siteUrls: [] }, { userAgent: 'R' }), null);
});
