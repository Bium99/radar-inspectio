/**
 * store.mjs — lo stato del radar: le richieste pertinenti, gli id già visti, la salute delle fonti.
 *
 * In locale è `data/radar.json`; su GitHub Actions lo stesso oggetto viaggia cifrato (lib/crypto.mjs)
 * su un branch a parte. Scrittura atomica; una richiesta già vista conserva stato e note.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { STATUSES } from './item.mjs';
import { decryptJson, encryptJson } from './crypto.mjs';

export const VERSION = 2;
const MAX_RUNS = 200;

export function emptyStore() {
  return { version: VERSION, items: {}, seen: {}, runs: [] };
}

/** Porta uno stato vecchio alla forma attuale (v1 aveva solo `items`). */
export function upgrade(store) {
  if (store.version === VERSION) return store;
  if (store.version === 1) return { ...emptyStore(), items: store.items ?? {} };
  throw new Error(`stato in un formato sconosciuto (version ${store.version})`);
}

/** Legge lo stato, in chiaro o cifrato (serve RADAR_PASSWORD). File assente = stato vuoto. */
export function loadStore(path, { password } = {}) {
  if (!existsSync(path)) return emptyStore();
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (raw.ct && raw.kdf) {
    if (!password) throw new Error(`${path} è cifrato: serve RADAR_PASSWORD`);
    return upgrade(decryptJson(raw, password));
  }
  return upgrade(raw);
}

/** Salva; con `password` il file su disco è cifrato. */
export function saveStore(path, store, { password } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  const body = password ? encryptJson(store, password) : store;
  writeFileSync(tmp, `${JSON.stringify(body, password ? undefined : null, password ? undefined : 2)}\n`);
  renameSync(tmp, path);
}

const dayOf = (date) => Math.floor(date.getTime() / 86_400_000);

/** `true` se l'id è già passato dal radar (pertinente o no). */
export function isKnown(store, id) {
  return Boolean(store.items[id] || store.seen[id]);
}

/** Ricorda un id non pertinente senza conservarne il testo. */
export function markSeen(store, id, { now = new Date() } = {}) {
  store.seen[id] = dayOf(now);
}

/** Aggiunge le richieste nuove e restituisce solo quelle; le già viste aggiornano `lastSeenAt`. */
export function upsertItems(store, items, { now = new Date() } = {}) {
  const fresh = [];
  for (const item of items) {
    const known = store.items[item.id];
    if (known) { known.lastSeenAt = now.toISOString(); continue; }
    if (store.seen[item.id]) continue;
    store.items[item.id] = item;
    fresh.push(item);
  }
  return fresh;
}

/** Registra un giro: fonti lette con conteggi ed errori, per il pannello «salute delle fonti». */
export function recordRun(store, run) {
  store.runs = [...(store.runs ?? []), run].slice(-MAX_RUNS);
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
 * lavoro («vinto», nell'archivio o negli stati della dashboard: `keep`); gli id visti scadono con la stessa finestra.
 */
export function purge(store, { days, now = new Date(), keep = new Set() }) {
  const limit = now.getTime() - days * 86_400_000;
  let removed = 0;
  for (const [id, item] of Object.entries(store.items)) {
    if (item.status === 'vinto' || keep.has(id)) continue;
    if (Date.parse(item.firstSeenAt) < limit) { delete store.items[id]; removed += 1; }
  }
  const limitDay = dayOf(new Date(limit));
  for (const [id, day] of Object.entries(store.seen)) if (day < limitDay) delete store.seen[id];
  return removed;
}
