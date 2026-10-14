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

export const SOURCES = [
  {
    id: 'imap',
    label: 'Avvisi email (Malt, Upwork, LinkedIn, Contra…)',
    family: 'email',
    type: 'imap',
    needs: ['IMAP_HOST', 'IMAP_USER', 'IMAP_PASS'],
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
    filter: (r) => /\b(freelanc\w*|contract\w*|hiring|seeking|looking for|need (a|an|someone)|paid|budget|remote)\b/i.test(`${r.title}\n${r.text}`),
  },
];
