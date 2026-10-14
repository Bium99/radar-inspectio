/**
 * json.mjs — lettore generico per le API pubbliche in JSON: una fonte nuova si descrive con una
 * mappatura dei campi, senza codice. Per i formati particolari c'è `transform` (vedi registry.mjs).
 */
import { stripHtml } from '../util.mjs';

/** Valore a un percorso «a.b.0.c». Puro. */
export function pick(obj, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce((v, key) => (v == null ? undefined : v[key]), obj);
}

/** Riempie «https://x/{id}/{a.b}» con i campi dell'elemento. Puro. */
export function fill(template, obj) {
  return String(template).replace(/\{([\w.]+)\}/g, (_, path) => {
    const v = pick(obj, path);
    return v == null ? '' : encodeURIComponent(String(v)).replace(/%2F/g, '/');
  });
}

function toIso(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v));
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}

/**
 * Elementi grezzi da una risposta JSON secondo la mappatura. Puro.
 * @param {any} json
 * @param {{items?: string, url: string, title?: string, text?: string|string[], date?: string, skip?: (row: any) => boolean}} map
 *   `url` può essere un percorso («url») o un modello con graffe («https://news.ycombinator.com/item?id={objectID}»).
 */
export function mapJson(json, map, source) {
  const rows = map.items ? pick(json, map.items) : json;
  if (!Array.isArray(rows)) throw new Error(`risposta inattesa: manca la lista «${map.items ?? '(radice)'}»`);
  const texts = Array.isArray(map.text) ? map.text : [map.text];
  return rows
    .filter((row) => row && typeof row === 'object' && !(map.skip && map.skip(row)))
    .map((row) => ({
      source,
      url: map.url.includes('{') ? fill(map.url, row) : String(pick(row, map.url) ?? ''),
      title: stripHtml(String(pick(row, map.title) ?? '')).slice(0, 300),
      text: stripHtml(texts.map((t) => pick(row, t)).filter(Boolean).join('\n\n')),
      publishedAt: toIso(pick(row, map.date)),
    }))
    .filter((r) => /^https?:\/\//.test(r.url));
}
