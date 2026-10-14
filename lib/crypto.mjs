/**
 * crypto.mjs — cifratura dello stato con una sola password (RADAR_PASSWORD).
 *
 * PBKDF2-SHA256 → AES-256-GCM, nello stesso formato che la dashboard decifra nel browser con WebCrypto
 * (il testo cifrato porta in coda il tag di autenticazione, come lo produce WebCrypto). Così lo stato può
 * stare su un branch git e la dashboard su GitHub Pages senza esporre i testi degli annunci.
 */
import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto';

export const ITERATIONS = 600_000;

function deriveKey(password, salt, iterations) {
  return pbkdf2Sync(String(password), salt, iterations, 32, 'sha256');
}

/** Cifra un valore JSON. */
export function encryptJson(value, password, { iterations = ITERATIONS } = {}) {
  if (!password) throw new Error('manca la password (RADAR_PASSWORD)');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(password, salt, iterations), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { v: 1, kdf: 'PBKDF2-SHA256', iterations, salt: salt.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64') };
}

/** Decifra; una password sbagliata dà un errore chiaro, mai dati corrotti. */
export function decryptJson(box, password) {
  if (box?.v !== 1 || box.kdf !== 'PBKDF2-SHA256') throw new Error('formato cifrato sconosciuto');
  const data = Buffer.from(box.ct, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(password, Buffer.from(box.salt, 'base64'), box.iterations), Buffer.from(box.iv, 'base64'));
  decipher.setAuthTag(data.subarray(data.length - 16));
  try {
    return JSON.parse(Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString('utf8'));
  } catch {
    throw new Error('password sbagliata o dati alterati');
  }
}

/**
 * Il topic ntfy derivato dalla password: niente secondo segreto da creare. Chi non conosce la
 * password non può indovinarlo; la dashboard lo ricalcola uguale nel browser.
 */
export function ntfyTopicFromPassword(password) {
  return `radar-${createHash('sha256').update(`ntfy|${password}`).digest('hex').slice(0, 24)}`;
}
