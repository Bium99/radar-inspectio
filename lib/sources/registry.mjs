/**
 * registry.mjs — le fonti del radar, come dati. Ogni voce dice dove leggere, come mappare i campi e
 * quali credenziali servono (`needs`); senza credenziali una fonte resta spenta e la dashboard lo dice.
 *
 * Sono ammessi solo accessi leciti e leggibili da una macchina: feed RSS/Atom, API pubbliche, API
 * ufficiali con chiave, avvisi email. Niente pagine HTML di siti che vietano lo scraping.
 */

import { stripHtml } from '../util.mjs';

const firstLine = (html) => stripHtml(html).split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 160) ?? '';

/** I commenti di primo livello dell'ultimo thread mensile di HN con quel titolo (account whoishiring). */
async function hnMonthlyThread(getJson, titleRe, query) {
  const found = await getJson(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story,author_whoishiring&hitsPerPage=10`);
  const story = (found.hits ?? []).find((h) => titleRe.test(h.title ?? ''));
  if (!story) throw new Error('thread del mese non trovato');
  const comments = await getJson(`https://hn.algolia.com/api/v1/search_by_date?tags=comment,story_${story.objectID}&hitsPerPage=1000`);
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
    id: 'hn-freelancer',
    label: 'Hacker News · Seeking freelancer (thread del mese)',
    family: 'community',
    type: 'custom',
    demand: true,
    // nel thread chi cerca scrive «SEEKING FREELANCER», chi si offre «SEEKING WORK»: si tengono solo i primi
    fetch: ({ getJson }) => hnMonthlyThread(getJson, /seeking freelancer/i, 'seeking freelancer'),
    filter: (r) => /seeking freelancer/i.test(r.text),
  },
  {
    id: 'hn-hiring',
    label: 'Hacker News · Who is hiring (thread del mese)',
    family: 'community',
    type: 'custom',
    demand: true,
    fetch: ({ getJson }) => hnMonthlyThread(getJson, /who is hiring\?/i, 'who is hiring'),
    // quasi tutto impiego a tempo pieno: si tengono solo i ruoli creativi o di movimento nella riga del titolo
    filter: (r) => /\b(webflow|framer|gsap|three\.?js|webgl|creative (developer|technologist|coder|front[- ]?end)|motion|animation|interactive developer)\b/i.test(r.title),
  },
  // ——— candidate: spente finché il collaudo dal vivo (prova-fonti --candidati) e la verifica dei termini non le confermano ———
  {
    id: 'reddit-forhire', label: 'Reddit r/forhire ([Hiring])', family: 'community', type: 'rss', candidate: true, enabled: false, demand: true,
    url: 'https://www.reddit.com/r/forhire/new/.rss?limit=100',
    filter: (r) => /\[\s*hiring\s*\]/i.test(r.title),
  },
  {
    id: 'reddit-search', label: 'Reddit (ricerca)', family: 'community', type: 'rss', candidate: true, enabled: false,
    url: 'https://www.reddit.com/search.rss?q={q}&sort=new&t=week',
    queries: ['webflow hiring', 'framer developer hiring', 'gsap freelance', 'migrate webflow', 'three.js freelance', 'webflow to nextjs'],
    delayMs: 1500,
  },
  {
    id: 'reddit-webflow', label: 'Reddit r/webflow', family: 'community', type: 'rss', candidate: true, enabled: false,
    url: 'https://www.reddit.com/r/webflow/new/.rss?limit=100',
  },
  {
    id: 'reddit-framer', label: 'Reddit r/framer', family: 'community', type: 'rss', candidate: true, enabled: false,
    url: 'https://www.reddit.com/r/framer/new/.rss?limit=100',
  },
  {
    id: 'freelancer-com', label: 'Freelancer.com (progetti)', family: 'marketplace', type: 'json', candidate: true, enabled: false, demand: true,
    url: 'https://www.freelancer.com/api/projects/0.1/projects/active/?query={q}&limit=50&full_description=true&sort_field=time_updated',
    queries: ['webflow', 'framer', 'gsap', 'website animation', 'three.js', 'website migration'],
    json: { items: 'result.projects', url: 'https://www.freelancer.com/projects/{seo_url}', title: 'title', text: ['description', 'preview_description'], date: 'time_submitted' },
  },
  {
    id: 'remotive', label: 'Remotive', family: 'jobboard', type: 'json', candidate: true, enabled: false, demand: true, everyMinutes: 360,
    url: 'https://remotive.com/api/remote-jobs?search={q}',
    queries: ['webflow', 'gsap', 'framer', 'three.js'],
    json: { items: 'jobs', url: 'url', title: 'title', text: 'description', date: 'publication_date' },
  },
  {
    id: 'jobicy', label: 'Jobicy', family: 'jobboard', type: 'json', candidate: true, enabled: false, demand: true, everyMinutes: 120,
    url: 'https://jobicy.com/api/v2/remote-jobs?count=50&tag={q}',
    queries: ['webflow', 'gsap', 'framer', 'animation'],
    json: { items: 'jobs', url: 'url', title: 'jobTitle', text: ['jobExcerpt', 'jobDescription'], date: 'pubDate' },
  },
  {
    id: 'remoteok', label: 'RemoteOK', family: 'jobboard', type: 'json', candidate: true, enabled: false, demand: true, everyMinutes: 120,
    url: 'https://remoteok.com/api?tag={q}',
    queries: ['webflow', 'animation', 'three.js'],
    json: { url: 'url', title: 'position', text: 'description', date: 'date', skip: (row) => !row.id },
  },
  {
    id: 'himalayas', label: 'Himalayas', family: 'jobboard', type: 'json', candidate: true, enabled: false, demand: true, everyMinutes: 120,
    url: 'https://himalayas.app/jobs/api/search?q={q}',
    queries: ['webflow', 'gsap', 'framer', 'three.js'],
    json: { items: 'jobs', url: 'applicationLink', title: 'title', text: ['excerpt', 'description'], date: 'pubDate' },
  },
  {
    id: 'wwr-frontend', label: 'We Work Remotely · Front-end', family: 'jobboard', type: 'rss', candidate: true, enabled: false, demand: true, prefilter: true,
    url: 'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss',
  },
  {
    id: 'wwr-design', label: 'We Work Remotely · Design', family: 'jobboard', type: 'rss', candidate: true, enabled: false, demand: true, prefilter: true,
    url: 'https://weworkremotely.com/categories/remote-design-jobs.rss',
  },
  {
    id: 'workingnomads', label: 'Working Nomads', family: 'jobboard', type: 'json', candidate: true, enabled: false, demand: true, prefilter: true, everyMinutes: 120,
    url: 'https://www.workingnomads.com/api/exposed_jobs/',
    json: { url: 'url', title: 'title', text: 'description', date: 'pub_date' },
  },
  {
    id: 'arbeitnow', label: 'Arbeitnow', family: 'jobboard', type: 'json', candidate: true, enabled: false, demand: true, prefilter: true, everyMinutes: 120,
    url: 'https://www.arbeitnow.com/api/job-board-api',
    json: { items: 'data', url: 'url', title: 'title', text: 'description', date: 'created_at' },
  },
  {
    id: 'bluesky', label: 'Bluesky (ricerca)', family: 'social', type: 'json', candidate: true, enabled: false,
    url: 'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q={q}&sort=latest&limit=50',
    queries: ['hiring webflow', 'webflow developer', 'gsap developer', 'framer developer', 'freelance creative developer'],
    transform: (json) => ({ posts: (json.posts ?? []).map((p) => ({ ...p, _url: `https://bsky.app/profile/${p.author?.handle}/post/${String(p.uri).split('/').pop()}`, _title: String(p.record?.text ?? '').split('\n')[0].slice(0, 160) })) }),
    json: { items: 'posts', url: '_url', title: '_title', text: 'record.text', date: 'indexedAt' },
  },
  {
    id: 'mastodon', label: 'Mastodon (hashtag)', family: 'social', type: 'json', candidate: true, enabled: false, prefilter: true,
    url: 'https://mastodon.social/api/v1/timelines/tag/{q}?limit=40',
    queries: ['webflow', 'gsap', 'framer', 'hiring', 'freelance'],
    transform: (rows) => (Array.isArray(rows) ? rows : []).map((p) => ({ ...p, _title: firstLine(p.content ?? '') })),
    json: { url: 'url', title: '_title', text: 'content', date: 'created_at' },
  },
];
