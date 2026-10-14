/**
 * rss.mjs — feed RSS 2.0 e Atom (per esempio le categorie «lavoro» dei forum Discourse: /c/<categoria>.rss).
 */
import { XMLParser } from 'fast-xml-parser';
import { stripHtml } from '../util.mjs';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const textOf = (v) => (v == null ? '' : typeof v === 'object' ? String(v['#text'] ?? '') : String(v));

function atomLink(link) {
  const links = asArray(link);
  const alt = links.find((l) => typeof l === 'object' && (l['@_rel'] ?? 'alternate') === 'alternate') ?? links[0];
  return typeof alt === 'object' ? alt['@_href'] ?? '' : String(alt ?? '');
}

/**
 * Elementi grezzi da un feed. Puro.
 * @returns {{source: string, url: string, title: string, text: string, publishedAt: string|null}[]}
 */
// una data che il motore non capisce («CEST», formati locali) perde solo la data, non il feed intero
function isoOrNull(value) {
  const t = Date.parse(value ?? '');
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function parseFeed(xml, sourceName) {
  const doc = parser.parse(xml);
  const source = `rss:${sourceName}`;
  if (doc.rss?.channel) {
    return asArray(doc.rss.channel.item).map((it) => ({
      source,
      url: textOf(it.link) || textOf(it.guid),
      title: stripHtml(textOf(it.title)),
      text: stripHtml(textOf(it['content:encoded']) || textOf(it.description)),
      publishedAt: isoOrNull(textOf(it.pubDate)),
    })).filter((r) => r.url);
  }
  if (doc.feed) {
    return asArray(doc.feed.entry).map((e) => ({
      source,
      url: atomLink(e.link) || textOf(e.id),
      title: stripHtml(textOf(e.title)),
      text: stripHtml(textOf(e.content) || textOf(e.summary)),
      publishedAt: isoOrNull(textOf(e.published) || textOf(e.updated)),
    })).filter((r) => r.url);
  }
  throw new Error('formato del feed non riconosciuto (né RSS 2.0 né Atom)');
}

/** Scarica e legge un feed. */
export async function fetchFeed({ name, url }, { userAgent, fetchImpl = fetch }) {
  const res = await fetchImpl(url, { headers: { 'user-agent': userAgent, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`feed ${name}: HTTP ${res.status}`);
  return parseFeed(await res.text(), name);
}
