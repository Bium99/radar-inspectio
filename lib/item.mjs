/**
 * item.mjs — la forma unica di una richiesta, qualunque sia la fonte.
 */
import { hashId, extractUrls, normalizeUrl, detectLang, extractBudget, truncate } from './util.mjs';

/** Domini che non sono il sito del cliente: piattaforme, link brevi, documenti, immagini. */
const NOT_A_CLIENT_SITE = [
  'upwork.com', 'malt.', 'linkedin.com', 'lnkd.in', 'reddit.com', 'redd.it', 'contra.com', 'fiverr.com',
  'imgur.com', 'i.imgur.com', 'youtube.com', 'youtu.be', 'vimeo.com', 'loom.com', 'figma.com',
  'docs.google.com', 'drive.google.com', 'notion.so', 'notion.site', 'calendly.com', 'dropbox.com',
  't.co', 'bit.ly', 'tinyurl.com', 'awwwards.com', 'dribbble.com', 'behance.net', 'github.com',
  'webflow.com', 'framer.com', 'wix.com', 'squarespace.com', 'wordpress.org', 'telegram.me', 't.me',
];

function isClientSiteCandidate(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return !NOT_A_CLIENT_SITE.some((d) => (d.endsWith('.') ? host.startsWith(d) || host.includes(`.${d}`) : host === d || host.endsWith(`.${d}`)));
  } catch {
    return false;
  }
}

export const STATUSES = Object.freeze(['nuovo', 'notificato', 'risposto', 'vinto', 'perso', 'scartato']);

/**
 * Costruisce una richiesta normalizzata.
 * @param {{source: string, url: string, title?: string, text?: string, publishedAt?: string|null}} raw
 * @param {{now?: Date}} [opts]
 */
export function makeItem(raw, { now = new Date() } = {}) {
  const url = normalizeUrl(raw.url);
  const title = String(raw.title ?? '').trim() || '(senza titolo)';
  const text = truncate(String(raw.text ?? '').trim(), 4000);
  const whole = `${title}\n${text}`;
  return {
    id: hashId(`${raw.source}|${url}`),
    source: raw.source,
    url,
    title,
    text,
    publishedAt: raw.publishedAt ?? null,
    firstSeenAt: now.toISOString(),
    lang: detectLang(whole),
    budget: extractBudget(whole),
    siteUrls: extractUrls(whole).filter(isClientSiteCandidate).slice(0, 3),
    status: 'nuovo',
  };
}
