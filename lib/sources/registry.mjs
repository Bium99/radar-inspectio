/**
 * registry.mjs — le fonti del radar, come dati. Ogni voce dice dove leggere, come mappare i campi e
 * quali credenziali servono (`needs`); senza credenziali una fonte resta spenta e la dashboard lo dice.
 *
 * Sono ammessi solo accessi leciti e leggibili da una macchina: feed RSS/Atom, API pubbliche, API
 * ufficiali con chiave, avvisi email. Niente pagine HTML di siti che vietano lo scraping.
 */

import { stripHtml } from '../util.mjs';

const HN_SINCE = () => Math.floor(Date.now() / 1000) - 7 * 86400;
const firstLine = (html) => stripHtml(html).split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 160) ?? '';

/** I commenti di primo livello dell'ultimo thread mensile di HN con quel titolo (account whoishiring). */
async function hnMonthlyThread(getJson, titleRe) {
  const found = await getJson('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10');
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
    fetch: ({ getJson }) => hnMonthlyThread(getJson, /freelancer\? seeking freelancer/i),
    filter: (r) => /seeking freelancer/i.test(r.text),
  },
  {
    id: 'hn-hiring',
    label: 'Hacker News · Who is hiring (thread del mese)',
    family: 'community',
    type: 'custom',
    demand: true,
    fetch: ({ getJson }) => hnMonthlyThread(getJson, /who is hiring\?/i),
    prefilter: true,
  },
  {
    id: 'hn',
    label: 'Hacker News',
    family: 'community',
    type: 'json',
    url: 'https://hn.algolia.com/api/v1/search_by_date?query={q}&tags=(story,comment)&hitsPerPage=50',
    queries: 'core',
    // i commenti dei thread mensili non hanno titolo: si usa la prima riga del commento
    transform: (json) => ({ hits: (json.hits ?? []).filter((h) => (h.created_at_i ?? 0) >= HN_SINCE()).map((h) => ({ ...h, _title: h.title || firstLine(h.comment_text ?? h.story_text ?? '') })) }),
    json: { items: 'hits', url: 'https://news.ycombinator.com/item?id={objectID}', title: '_title', text: ['comment_text', 'story_text', 'story_title'], date: 'created_at' },
    filter: (r) => /\b(freelanc\w*|contract\w*|hiring|seeking|looking for|need (a|an|someone)|paid|budget)\b/i.test(`${r.title}\n${r.text}`),
  },
];
