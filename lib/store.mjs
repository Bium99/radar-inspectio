/**
 * store.mjs — le richieste viste, in un file JSON locale (data/, mai versionato: contiene testi di terzi).
 * Scrittura atomica; una richiesta già vista conserva stato e note.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { STATUSES } from './item.mjs';

export function loadStore(path) {
  if (!existsSync(path)) return { version: 1, items: {} };
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data.version !== 1 || typeof data.items !== 'object') throw new Error(`${path}: formato sconosciuto`);
  return data;
}

export function saveStore(path, store) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`);
  renameSync(tmp, path);
}

/** Aggiunge le richieste nuove e restituisce solo quelle; le già viste aggiornano `lastSeenAt`. */
export function upsertItems(store, items, { now = new Date() } = {}) {
  const fresh = [];
  for (const item of items) {
    const known = store.items[item.id];
    if (known) { known.lastSeenAt = now.toISOString(); continue; }
    store.items[item.id] = item;
    fresh.push(item);
  }
  return fresh;
}

/** Trova una richiesta dall'id o da un suo prefisso non ambiguo. */
export function findItem(store, idOrPrefix) {
  const ids = Object.keys(store.items).filter((id) => id.startsWith(idOrPrefix));
  if (ids.length === 1) return store.items[ids[0]];
  if (ids.length > 1) throw new Error(`id ambiguo: ${idOrPrefix} corrisponde a ${ids.length} richieste`);
  throw new Error(`nessuna richiesta con id ${idOrPrefix}`);
}

export function setStatus(store, idOrPrefix, status, note, { now = new Date() } = {}) {
  if (!STATUSES.includes(status)) throw new Error(`stato non valido: ${status} (validi: ${STATUSES.join(', ')})`);
  const item = findItem(store, idOrPrefix);
  item.status = status;
  item.history = [...(item.history ?? []), { at: now.toISOString(), status, ...(note ? { note } : {}) }];
  return item;
}

/**
 * Conservazione minima: le richieste più vecchie di `days` si cancellano, tranne quelle diventate
 * lavoro («vinto»), che restano come rapporto con il cliente.
 */
export function purge(store, { days, now = new Date() }) {
  const limit = now.getTime() - days * 24 * 3600 * 1000;
  let removed = 0;
  for (const [id, item] of Object.entries(store.items)) {
    if (item.status === 'vinto') continue;
    if (Date.parse(item.firstSeenAt) < limit) { delete store.items[id]; removed += 1; }
  }
  return removed;
}
