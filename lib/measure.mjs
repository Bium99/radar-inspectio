/**
 * measure.mjs — misura leggera del sito del cliente PRIMA di rispondere: una sola pagina, User-Agent
 * onesto, robots.txt rispettato, niente browser. Dice su che piattaforma è, che librerie di movimento
 * usa e in che fascia di difficoltà cade (le fasce di docs/BENCHMARKS.md di site-inspector).
 *
 * È una STIMA statica dall'HTML: le librerie dentro i bundle (Next.js, Vite) non si vedono da qui.
 * La misura vera resta l'ispezione di site-inspector, da lanciare a mano sulle richieste migliori.
 */

const SIGNATURES = {
  platform: [
    ['webflow', /data-wf-(page|site)|website-files\.com|webflow\.js/i],
    ['framer', /framerusercontent\.com|data-framer-|framer\.com\/m\//i],
    ['wordpress', /\/wp-content\/|\/wp-includes\/|<meta[^>]+generator[^>]+wordpress/i],
    ['wix', /static\.wixstatic\.com|wix-warmup-data|_wixCIDX/i],
    ['squarespace', /static1\.squarespace\.com|squarespace-cdn\.com/i],
    ['shopify', /cdn\.shopify\.com|Shopify\.theme/],
  ],
  framework: [
    ['nextjs', /\/_next\/static|__NEXT_DATA__/],
    ['nuxt', /\/_nuxt\/|__NUXT__/],
    ['astro', /\/_astro\/|data-astro-cid/],
    ['sveltekit', /__sveltekit|\/_app\/immutable\//],
    ['gatsby', /___gatsby/],
    ['elementor', /elementor/i],
  ],
  motion: [
    ['gsap', /gsap(\.min)?\.js|\/gsap@|gsap\/(dist|ScrollTrigger)|ScrollTrigger(\.min)?\.js/i],
    ['lenis', /lenis(\.min)?\.js|@studio-freight\/lenis|class="[^"]*\blenis\b/i],
    ['locomotive', /locomotive-scroll/i],
    ['webflow-interactions', /data-w-id=/],
    ['barba', /@barba|barba(\.umd)?(\.min)?\.js/i],
    ['lottie', /lottie(-web)?(\.min)?\.js|lottie-player|dotlottie/i],
    ['three', /three(\.module)?(\.min)?\.js|\/three@|three\/build/i],
    ['spline', /spline\.design|@splinetool/i],
    ['video-autoplay', /<video[^>]+autoplay/i],
    ['canvas', /<canvas\b/i],
  ],
};

const ADVANCED = new Set(['three', 'spline', 'video-autoplay', 'canvas']);
const MEDIUM = new Set(['gsap', 'lenis', 'locomotive', 'webflow-interactions', 'barba', 'lottie']);

/**
 * Stack e fascia stimata dall'HTML di una pagina. Puro.
 * @returns {{platform: string|null, frameworks: string[], motion: string[], tier: 'BASSA'|'MEDIA'|'AVANZATA', tierWhy: string}}
 */
export function detectStack(html) {
  const h = String(html ?? '');
  const platform = SIGNATURES.platform.find(([, re]) => re.test(h))?.[0] ?? null;
  const frameworks = SIGNATURES.framework.filter(([, re]) => re.test(h)).map(([n]) => n);
  const motion = SIGNATURES.motion.filter(([, re]) => re.test(h)).map(([n]) => n);

  let tier = 'BASSA';
  let tierWhy = 'nessuna libreria di movimento visibile nell\'HTML';
  const adv = motion.filter((m) => ADVANCED.has(m));
  const med = motion.filter((m) => MEDIUM.has(m));
  if (adv.length || platform === 'framer') {
    tier = 'AVANZATA';
    tierWhy = adv.length ? `elementi avanzati: ${adv.join(', ')}` : 'sito Framer (fascia avanzata nei benchmark)';
  } else if (med.length) {
    tier = 'MEDIA';
    tierWhy = `movimento DOM: ${med.join(', ')}`;
  }
  if (frameworks.some((f) => ['nextjs', 'nuxt', 'astro', 'sveltekit', 'gatsby'].includes(f)) && !motion.length) {
    tierWhy += ' (i bundle non si vedono da qui: la fascia può essere più alta)';
  }
  return { platform, frameworks, motion, tier, tierWhy };
}

/**
 * robots.txt: `true` se il percorso è permesso al nostro agente. Gruppo specifico se c'è, altrimenti `*`;
 * vince la regola più lunga, a parità Allow.
 */
export function isAllowedByRobots(robotsTxt, agentToken, path) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const rawLine of String(robotsTxt ?? '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && (key === 'allow' || key === 'disallow')) current.rules.push({ allow: key === 'allow', path: value });
    }
  }
  const token = agentToken.toLowerCase();
  const group = groups.find((g) => g.agents.some((a) => a !== '*' && token.includes(a))) ?? groups.find((g) => g.agents.includes('*'));
  if (!group) return true;
  let best = null;
  for (const r of group.rules) {
    if (!r.path) continue; // "Disallow:" vuoto = tutto permesso
    const re = new RegExp(`^${r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
    if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return best ? best.allow : true;
}

/** Solo http(s) verso host pubblici: gli URL arrivano da annunci di sconosciuti. */
export function isPublicHttpUrl(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!['http:', 'https:'].includes(u.protocol)) return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') && !host.includes(':')) return false;
  if (host.includes(':') && (host === '::1' || /^f[cd]/.test(host) || host.startsWith('fe80') || host.startsWith('::ffff:'))) return false;
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return false;
  }
  return true;
}

async function readCapped(res, maxBytes) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, maxBytes).toString('utf8');
}

/**
 * Scarica UNA pagina rispettando robots.txt. robots irraggiungibile per errore del server (5xx) = non si
 * scarica; assente (4xx) = permesso, come da standard.
 */
export async function fetchSite(url, { userAgent, agentToken = 'RadarRichieste', fetchImpl = fetch, timeoutMs = 15000, maxBytes = 2_000_000 }) {
  if (!isPublicHttpUrl(url)) return { ok: false, reason: 'URL non pubblico o non http(s)' };
  const u = new URL(url);
  const headers = { 'user-agent': userAgent };
  const robotsRes = await fetchImpl(`${u.origin}/robots.txt`, { headers, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (robotsRes && robotsRes.status >= 500) return { ok: false, reason: `robots.txt non disponibile (HTTP ${robotsRes.status}): non si scarica` };
  if (robotsRes?.ok) {
    const robots = await robotsRes.text();
    if (!isAllowedByRobots(robots, agentToken, u.pathname || '/')) return { ok: false, reason: 'vietato da robots.txt', blockedByRobots: true };
  }
  const target = u.toString();
  const res = await fetchImpl(target, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  if (res.url && !isPublicHttpUrl(res.url)) return { ok: false, reason: 'il redirect porta a un host non pubblico' };
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}`, status: res.status };
  return { ok: true, status: res.status, finalUrl: res.url || target, html: await readCapped(res, maxBytes) };
}

/** Misura il primo sito candidato di una richiesta. Un errore si dichiara, non ferma il radar. */
export async function measureItem(item, opts) {
  const url = item.siteUrls?.[0];
  if (!url) return null;
  try {
    const page = await fetchSite(url, opts);
    if (!page.ok) return { url, error: page.reason };
    return { url: page.finalUrl, measuredAt: (opts.now ?? new Date()).toISOString(), ...detectStack(page.html) };
  } catch (err) {
    return { url, error: err.name === 'TimeoutError' ? 'tempo scaduto' : err.message };
  }
}
