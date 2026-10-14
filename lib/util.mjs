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

// parole frequenti e distintive di ogni lingua (quelle in comune, come «la» o «con», non contano)
const LANG_WORDS = {
  it: /\b(il|lo|gli|di|che|per|sito|cerchiamo|cerco|nostro|nostra|abbiamo|vorrei|siamo|sono|anche|progetto|della|del|sviluppatore|preventivo|grazie)\b/gi,
  en: /\b(the|and|for|with|our|we|looking|need|website|you|have|this|that|project|is|are|will)\b/gi,
  fr: /\b(les|des|du|est|et|pour|avec|nous|vous|une|dans|sur|pas|qui|notre|votre|je|recherche|projet|cherche|site internet)\b/gi,
  es: /\b(los|las|del|para|necesito|buscamos|proyecto|sitio|nuestro|nuestra|desarrollador|página|es|y|el)\b/gi,
  de: /\b(der|die|das|und|für|mit|wir|ist|nicht|eine|suchen|unsere|webseite|entwickler)\b/gi,
};

/** Lingua del testo, a grandi linee: 'it', 'en', 'fr', 'es' o 'de' (a parità vince l'inglese). */
export function detectLang(text) {
  const t = String(text ?? '');
  let best = 'en';
  let bestCount = (t.match(LANG_WORDS.en) ?? []).length;
  for (const lang of ['it', 'fr', 'es', 'de']) {
    const n = (t.match(LANG_WORDS[lang]) ?? []).length;
    if (n > bestCount) { best = lang; bestCount = n; }
  }
  return best;
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
    // «moins de 500 €», «under $300», «fino a 400 €»: è un tetto, non il budget
    const upTo = /(moins de|less than|under|up to|max(imum)?|meno di|fino a|al massimo|hasta|bis zu)\s*:?\s*$/i.test(String(text).slice(Math.max(0, m.index - 16), m.index));
    if (!best || amount > best.amount) best = { amount, currency, raw: m[0].trim(), ...(upTo ? { upTo: true } : {}) };
  }
  return best;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decodeEntity(name) {
  if (ENTITIES[name] != null) return ENTITIES[name];
  const code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : name.startsWith('#') ? Number(name.slice(1)) : NaN;
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : null;
}

/** Testo leggibile da un frammento HTML (niente parser: basta per avvisi e feed). */
export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/?(p|div|li|tr|h\d)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, name) => decodeEntity(name) ?? all)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** Tronca un testo lungo a `max` caratteri, dichiarandolo. */
export function truncate(text, max) {
  const t = String(text ?? '');
  return t.length <= max ? t : `${t.slice(0, max)}… [troncato]`;
}
