/**
 * util.mjs — funzioni pure condivise: id, URL, lingua, budget, testo da HTML.
 */
import { createHash } from 'node:crypto';

/** Id corto e stabile di una richiesta (stessa fonte + stesso link = stesso id). */
export function hashId(input) {
  return createHash('sha1').update(String(input)).digest('hex').slice(0, 12);
}

const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/gi;

/** Tutti gli URL http(s) in un testo, senza punteggiatura finale, senza duplicati. */
export function extractUrls(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?]+$/, '');
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

const TRACKING_PARAMS = /^(utm_\w+|ref|refid|source|trk|trkemail|tracking\w*|lipi|mc_\w+|gclid|fbclid)$/i;

/** URL senza parametri di tracciamento: serve per riconoscere la stessa richiesta in due avvisi. */
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    u.hash = '';
    return u.toString();
  } catch {
    return String(url);
  }
}

const IT_WORDS = /\b(il|lo|la|gli|le|di|che|per|con|sito|cerchiamo|cerco|nostro|nostra|abbiamo|vorrei|siamo|una|sono|anche|progetto)\b/gi;
const EN_WORDS = /\b(the|and|for|with|our|we|looking|need|website|site|you|have|this|that|project|is|are)\b/gi;

/** Lingua del testo, a grandi linee: 'it' o 'en'. */
export function detectLang(text) {
  const t = String(text ?? '');
  const it = (t.match(IT_WORDS) ?? []).length;
  const en = (t.match(EN_WORDS) ?? []).length;
  return it > en ? 'it' : 'en';
}

function parseAmount(raw, hasK) {
  let s = raw.trim();
  if (hasK) return Math.round(parseFloat(s.replace(',', '.')) * 1000);
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  if (/^\d+[.,]\d{1,2}$/.test(s)) return Math.round(parseFloat(s.replace(',', '.')));
  return Number(s.replace(/[.,]/g, ''));
}

const BUDGET_RE = /(?:(€|\$|eur\b|usd\b)\s?(\d[\d.,]*)\s?(k)?\b)|(?:\b(\d[\d.,]*)\s?(k)?\s?(€|\$|euro\b|eur\b|usd\b|dollars?\b))/gi;

/** Il budget più alto dichiarato nel testo, o null. Riconosce "$1,500", "€2k", "1.500 €", "800 euro". */
export function extractBudget(text) {
  let best = null;
  for (const m of String(text ?? '').matchAll(BUDGET_RE)) {
    const symbol = (m[1] ?? m[6] ?? '').toLowerCase();
    const rawNum = m[2] ?? m[4];
    const hasK = Boolean(m[3] ?? m[5]);
    const amount = parseAmount(rawNum, hasK);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const currency = symbol === '$' || symbol.startsWith('usd') || symbol.startsWith('dollar') ? 'USD' : 'EUR';
    if (!best || amount > best.amount) best = { amount, currency, raw: m[0].trim() };
  }
  return best;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** Testo leggibile da un frammento HTML (niente parser: basta per avvisi e feed). */
export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#?\w+);/g, (all, name) => ENTITIES[name] ?? (name.startsWith('#') ? String.fromCharCode(Number(name.slice(1))) : all))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** Tronca un testo lungo a `max` caratteri, dichiarandolo. */
export function truncate(text, max) {
  const t = String(text ?? '');
  return t.length <= max ? t : `${t.slice(0, max)}… [troncato]`;
}
