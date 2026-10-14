/**
 * registry.mjs — le fonti del radar, come dati. Ogni voce dice dove leggere, come mappare i campi e
 * quali credenziali servono (`needs`); senza credenziali una fonte resta spenta e la dashboard lo dice.
 *
 * Sono ammessi solo accessi leciti e leggibili da una macchina: feed RSS/Atom, API pubbliche, API
 * ufficiali con chiave, avvisi email. Niente pagine HTML di siti che vietano lo scraping.
 */

import { stripHtml } from '../util.mjs';
import { getToken, fetchSubreddit, parseListing } from './reddit.mjs';

const firstLine = (html) => stripHtml(html).split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 160) ?? '';

/** I commenti di primo livello dell'ultimo thread mensile di HN con quel titolo (account whoishiring). */
async function hnMonthlyThread(getJson, titleRe, query, debug = false) {
  const found = await getJson(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story,author_whoishiring&hitsPerPage=10`);
  const story = (found.hits ?? []).find((h) => titleRe.test(h.title ?? ''));
  if (debug) console.error(`[hn] «${query}»: ${(found.hits ?? []).map((h) => `${h.objectID} ${h.title}`).join(' | ')}`);
  if (!story) throw new Error('thread del mese non trovato');
  const comments = await getJson(`https://hn.algolia.com/api/v1/search_by_date?tags=comment,story_${story.objectID}&hitsPerPage=1000`);
  if (debug) console.error(`[hn] ${story.title}: ${comments.hits?.length ?? 0} commenti, ${(comments.hits ?? []).filter((h) => String(h.parent_id) === String(story.objectID)).length} di primo livello; esempio: ${JSON.stringify((comments.hits ?? [])[0] ?? {}).slice(0, 300)}`);
  return (comments.hits ?? [])
    .filter((h) => String(h.parent_id) === String(story.objectID) && h.comment_text)
    .map((h) => ({ url: `https://news.ycombinator.com/item?id=${h.objectID}`, title: firstLine(h.comment_text), text: stripHtml(h.comment_text), publishedAt: h.created_at ?? null }));
}

export const SOURCES = [
  {
    id: 'imap',
    label: 'Avvisi email (Malt, Upwork, LinkedIn, Contra…)',
    family: 'email',
    type: 'imap',
    needs: ['IMAP_HOST', 'IMAP_USER', 'IMAP_PASS'],
  },
  {
    id: 'hn-hiring',
    label: 'Hacker News · Who is hiring (thread del mese)',
    family: 'community',
    type: 'custom',
    demand: true,
    everyMinutes: 360, // il thread esce una volta al mese
    // (il thread «Freelancer? Seeking freelancer?» non esce più da ottobre 2025)
    fetch: ({ getJson, env }) => hnMonthlyThread(getJson, /who is hiring\?/i, 'who is hiring', env.RADAR_DEBUG === '1'),
    // quasi tutto impiego a tempo pieno: si tengono solo i ruoli creativi o di movimento nella riga del titolo
    filter: (r) => /\b(webflow|framer|gsap|three\.?js|webgl|creative (developer|technologist|coder|front[- ]?end)|motion|animation|interactive developer)\b/i.test(r.title),
  },
  {
    id: 'freelancer-com', label: 'Freelancer.com (progetti)', family: 'marketplace', type: 'json', demand: true,
    url: 'https://www.freelancer.com/api/projects/0.1/projects/active/?query={q}&limit=50&full_description=true&sort_field=time_updated',
    queries: ['webflow', 'framer', 'gsap', 'website animation', 'three.js', 'website migration'],
    json: { items: 'result.projects', url: 'https://www.freelancer.com/projects/{seo_url}', title: 'title', text: ['description', 'preview_description'], date: 'time_submitted' },
  },
  {
    id: 'remotive', label: 'Remotive', family: 'jobboard', type: 'json', demand: true, everyMinutes: 360,
    url: 'https://remotive.com/api/remote-jobs?search={q}',
    queries: ['webflow', 'gsap', 'framer', 'three.js'],
    json: { items: 'jobs', url: 'url', title: 'title', text: ['job_type', 'description'], date: 'publication_date' },
  },
  {
    id: 'jobicy', label: 'Jobicy', family: 'jobboard', type: 'json', demand: true, everyMinutes: 120,
    url: 'https://jobicy.com/api/v2/remote-jobs?count=50&tag={q}',
    queries: ['webflow', 'gsap', 'framer', 'animation'],
    transform: (json) => ({ jobs: (json.jobs ?? []).map((j) => ({ ...j, _type: [].concat(j.jobType ?? []).join(' ') })) }),
    json: { items: 'jobs', url: 'url', title: 'jobTitle', text: ['_type', 'jobExcerpt', 'jobDescription'], date: 'pubDate' },
  },
  {
    id: 'remoteok', label: 'RemoteOK', family: 'jobboard', type: 'json', demand: true, everyMinutes: 120,
    url: 'https://remoteok.com/api?tags={q}',
    queries: ['webflow', 'animation', 'three.js'],
    json: { url: 'url', title: 'position', text: 'description', date: 'date', skip: (row) => !row.id },
  },
  {
    id: 'himalayas', label: 'Himalayas', family: 'jobboard', type: 'json', demand: true, everyMinutes: 120,
    url: 'https://himalayas.app/jobs/api/search?q={q}&sort=recent',
    queries: ['webflow', 'gsap', 'framer', 'three.js'],
    json: { items: 'jobs', url: 'applicationLink', title: 'title', text: ['employmentType', 'excerpt', 'description'], date: 'pubDate' },
  },
  {
    id: 'wwr-frontend', label: 'We Work Remotely · Front-end', family: 'jobboard', type: 'rss', demand: true, prefilter: true,
    url: 'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss',
  },
  {
    id: 'wwr-design', label: 'We Work Remotely · Design', family: 'jobboard', type: 'rss', demand: true, prefilter: true,
    url: 'https://weworkremotely.com/categories/remote-design-jobs.rss',
  },
  {
    id: 'workingnomads', label: 'Working Nomads', family: 'jobboard', type: 'json', demand: true, prefilter: true, everyMinutes: 120,
    url: 'https://www.workingnomads.com/api/exposed_jobs/',
    json: { url: 'url', title: 'title', text: ['job_type', 'description'], date: 'pub_date' },
  },
  {
    id: 'gsap-jobs', label: 'Forum GSAP · Jobs & Freelance', family: 'community', type: 'rss', demand: true,
    url: 'https://gsap.com/community/forums/forum/15-jobs-freelance.xml/',
  },
  {
    id: 'codeur', label: 'Codeur.com (Francia)', family: 'marketplace', type: 'rss', demand: true, everyMinutes: 60,
    url: 'https://www.codeur.com/projects?format=rss&keywords={q}&order=most_recent',
    queries: ['webflow', 'framer', 'gsap', 'animation', 'refonte site'],
  },
  {
    // nella categoria Jobs scrive anche chi si offre: l'intenzione deve dirla il post
    id: 'threejs-jobs', label: 'Forum three.js · Jobs', family: 'community', type: 'rss',
    url: 'https://discourse.threejs.org/c/jobs/9.rss',
  },
  {
    id: 'wordpress-jobs', label: 'WordPress Jobs (jobs.wordpress.net)', family: 'jobboard', type: 'rss', demand: true, prefilter: true, everyMinutes: 180,
    url: 'https://jobs.wordpress.net/feed/',
  },
  {
    id: 'reddit', label: 'Reddit (API ufficiale)', family: 'community', type: 'custom',
    needs: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'],
    // dai server di GitHub la lettura anonima di Reddit risponde 429: si usa l'API ufficiale con la chiave gratuita
    fetch: async ({ fetchImpl, userAgent, env }) => {
      const token = await getToken({ clientId: env.REDDIT_CLIENT_ID, clientSecret: env.REDDIT_CLIENT_SECRET, userAgent, fetchImpl });
      const out = [];
      for (const sub of [{ name: 'forhire', onlyHiring: true }, { name: 'webflow', onlyHiring: true }, { name: 'framer', onlyHiring: true }, { name: 'Wordpress', onlyHiring: true }, { name: 'web_design', onlyHiring: true }]) {
        out.push(...(await fetchSubreddit(sub, { token, userAgent, fetchImpl })).map((r) => ({ ...r, demand: sub.name === 'forhire' })));
      }
      for (const q of ['webflow developer', 'framer developer', 'gsap freelance', 'migrate webflow', 'three.js freelance']) {
        const res = await fetchImpl(`https://oauth.reddit.com/search?q=${encodeURIComponent(q)}&sort=new&t=week&limit=50&raw_json=1`, { headers: { authorization: `Bearer ${token}`, 'user-agent': userAgent }, signal: AbortSignal.timeout(12000) });
        if (res.ok) out.push(...parseListing(await res.json(), 'search', { onlyHiring: true }));
      }
      return out;
    },
  },
  {
    id: 'bluesky', label: 'Bluesky (ricerca)', family: 'social', type: 'custom', everyMinutes: 60,
    needs: ['BLUESKY_HANDLE', 'BLUESKY_APP_PASSWORD'],
    // la ricerca anonima risponde 403: serve un account (password per app, non quella principale)
    fetch: async ({ fetchImpl, userAgent, env }) => {
      const login = await fetchImpl('https://bsky.social/xrpc/com.atproto.server.createSession', {
        method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': userAgent },
        body: JSON.stringify({ identifier: env.BLUESKY_HANDLE, password: env.BLUESKY_APP_PASSWORD }), signal: AbortSignal.timeout(12000),
      });
      if (!login.ok) throw new Error(`accesso a Bluesky: HTTP ${login.status}`);
      const { accessJwt } = await login.json();
      const out = [];
      for (const q of ['hiring webflow', 'webflow developer', 'gsap developer', 'framer developer', 'looking for creative developer']) {
        const res = await fetchImpl(`https://bsky.social/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&sort=latest&limit=50`, { headers: { authorization: `Bearer ${accessJwt}`, 'user-agent': userAgent }, signal: AbortSignal.timeout(12000) });
        if (!res.ok) continue;
        for (const p of (await res.json()).posts ?? []) {
          const text = String(p.record?.text ?? '');
          out.push({ url: `https://bsky.app/profile/${p.author?.handle}/post/${String(p.uri).split('/').pop()}`, title: text.split('\n')[0].slice(0, 160), text, publishedAt: p.indexedAt ?? null });
        }
      }
      return out;
    },
  },
];

/**
 * Le fonti di questo radar: il registro, meno quelle spente in `radar.config.json` (`disabledSources`),
 * più i feed RSS/Atom aggiunti lì (`feeds`), senza toccare il codice. Puro.
 */
export function sourcesFor(config = {}, sources = SOURCES) {
  const off = new Set(config.disabledSources ?? []);
  const feeds = (config.feeds ?? [])
    .filter((f) => /^https?:\/\//i.test(f?.url ?? ''))
    .map((f, i) => ({
      id: String(f.id ?? `feed-${i + 1}`), label: String(f.label ?? f.url), family: 'custom', type: 'rss', url: f.url,
      demand: Boolean(f.demand), prefilter: f.prefilter !== false,
    }));
  return [...sources, ...feeds].map((s) => (off.has(s.id) ? { ...s, enabled: false } : s));
}
