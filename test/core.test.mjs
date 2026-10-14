import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encryptJson, decryptJson, ntfyTopicFromPassword } from '../lib/crypto.mjs';
import { emptyStore, loadStore, saveStore, upsertItems, markSeen, isKnown, recordRun, purge, setStatus, findItem } from '../lib/store.mjs';
import { channelsFromEnv, notifyAll, formatNotification, itemLink } from '../lib/notify.mjs';

const FAST = { iterations: 1000 };

test('crypto: andata e ritorno, sale e iv nuovi a ogni cifratura', () => {
  const value = { a: 1, testo: 'àèìòù €' };
  const one = encryptJson(value, 'segreta', FAST);
  const two = encryptJson(value, 'segreta', FAST);
  assert.notEqual(one.ct, two.ct);
  assert.deepEqual(decryptJson(one, 'segreta'), value);
});

test('crypto: password sbagliata o dati alterati = errore chiaro', () => {
  const box = encryptJson({ a: 1 }, 'giusta', FAST);
  assert.throws(() => decryptJson(box, 'sbagliata'), /password sbagliata/);
  const tampered = { ...box, ct: Buffer.from(Buffer.from(box.ct, 'base64').map((b, i) => (i === 0 ? b ^ 1 : b))).toString('base64') };
  assert.throws(() => decryptJson(tampered, 'giusta'), /password sbagliata o dati alterati/);
  assert.throws(() => encryptJson({}, ''), /manca la password/);
});

test('crypto: il topic ntfy è stabile e non rivela la password', () => {
  const t = ntfyTopicFromPassword('una password lunga');
  assert.match(t, /^radar-[0-9a-f]{24}$/);
  assert.equal(t, ntfyTopicFromPassword('una password lunga'));
  assert.notEqual(t, ntfyTopicFromPassword('un\'altra'));
  assert.ok(!t.includes('password'));
});

test('store: file assente = vuoto; v1 si aggiorna a v2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'radar-'));
  try {
    assert.deepEqual(loadStore(join(dir, 'nessuno.json')), emptyStore());
    const v1 = join(dir, 'v1.json');
    saveStore(v1, { version: 1, items: { a: { id: 'a' } } });
    const up = loadStore(v1);
    assert.equal(up.version, 2);
    assert.deepEqual(up.items, { a: { id: 'a' } });
    assert.deepEqual(up.seen, {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('store: cifrato su disco, leggibile solo con la password', () => {
  const dir = mkdtempSync(join(tmpdir(), 'radar-'));
  try {
    const path = join(dir, 'stato.json');
    const store = emptyStore();
    store.items.x = { id: 'x', title: 'Mario Rossi cerca uno sviluppatore' };
    saveStore(path, store, { password: 'pw' });
    assert.ok(!readFileSync(path, 'utf8').includes('Mario'));
    assert.throws(() => loadStore(path), /serve RADAR_PASSWORD/);
    assert.equal(loadStore(path, { password: 'pw' }).items.x.title, 'Mario Rossi cerca uno sviluppatore');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const it = (id, firstSeenAt, extra = {}) => ({ id, title: `t-${id}`, text: '', source: 's', url: `https://x/${id}`, lang: 'en', status: 'nuovo', firstSeenAt, siteUrls: [], ...extra });

test('store: id visti non tornano, le richieste note conservano stato', () => {
  const store = emptyStore();
  const now = new Date('2026-10-14T00:00:00Z');
  markSeen(store, 'irrilevante', { now });
  assert.ok(isKnown(store, 'irrilevante'));
  assert.equal(upsertItems(store, [it('irrilevante', now.toISOString()), it('buona', now.toISOString())], { now }).length, 1);
  setStatus(store, 'buo', 'risposto', 'mandata');
  assert.equal(upsertItems(store, [it('buona', now.toISOString())], { now }).length, 0);
  assert.equal(findItem(store, 'buona').status, 'risposto');
  assert.throws(() => setStatus(store, 'buona', 'boh'), /stato non valido/);
});

test('store: purge tiene i vinti e fa scadere gli id visti', () => {
  const now = new Date('2026-10-14T00:00:00Z');
  const store = emptyStore();
  store.items = { old: it('old', '2026-07-01T00:00:00Z'), won: it('won', '2026-07-01T00:00:00Z', { status: 'vinto' }), recent: it('recent', '2026-10-10T00:00:00Z') };
  markSeen(store, 'vecchio', { now: new Date('2026-07-01T00:00:00Z') });
  markSeen(store, 'nuovo', { now });
  assert.equal(purge(store, { days: 60, now }), 1);
  assert.deepEqual(Object.keys(store.items).sort(), ['recent', 'won']);
  assert.deepEqual(Object.keys(store.seen), ['nuovo']);
});

test('store: si tengono solo gli ultimi 200 giri', () => {
  const store = emptyStore();
  for (let i = 0; i < 205; i += 1) recordRun(store, { at: String(i) });
  assert.equal(store.runs.length, 200);
  assert.equal(store.runs[0].at, '5');
});

test('notify: canali dall\'ambiente; ntfy dalla password senza secondo segreto', () => {
  assert.deepEqual(channelsFromEnv({}), []);
  const [ntfy] = channelsFromEnv({ RADAR_PASSWORD: 'pw' });
  assert.equal(ntfy.kind, 'ntfy');
  assert.equal(ntfy.topic, ntfyTopicFromPassword('pw'));
  assert.equal(channelsFromEnv({ RADAR_PASSWORD: 'pw', NTFY_OFF: '1' }).length, 0);
  assert.equal(channelsFromEnv({ NTFY_TOPIC: 'mio-topic' })[0].topic, 'mio-topic');
  const kinds = channelsFromEnv({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1', DISCORD_WEBHOOK_URL: 'https://d', SLACK_WEBHOOK_URL: 'https://s', SMTP_URL: 'smtps://u:p@h', EMAIL_TO: 'a@b.c' }).map((c) => c.kind);
  assert.deepEqual(kinds, ['telegram', 'discord', 'slack', 'email']);
});

const lead = (id, score) => ({ ...it(id, ''), title: `Migrate Webflow ${id}`, url: `https://www.reddit.com/r/forhire/${id}`, classification: { score, categories: ['migrazione'], redFlag: null } });

test('notify: ntfy riceve JSON con titolo, priorità, link alla dashboard', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response('{}'); };
  const r = await notifyAll([lead('a1', 90)], { channels: channelsFromEnv({ NTFY_TOPIC: 'tp' }), dashboardUrl: 'https://bium99.github.io/radar-inspectio/', fetchImpl });
  assert.deepEqual(r, { sent: 1, errors: [] });
  assert.equal(calls[0].url, 'https://ntfy.sh');
  assert.equal(calls[0].body.topic, 'tp');
  assert.equal(calls[0].body.priority, 4);
  assert.equal(calls[0].body.click, 'https://bium99.github.io/radar-inspectio/#/r/a1');
  assert.match(calls[0].body.title, /^90\/100 · Migrate Webflow a1/);
});

test('notify: oltre 6 richieste arriva un riepilogo; un canale guasto non ferma gli altri', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    if (url.includes('discord')) return new Response('no', { status: 500 });
    calls.push(JSON.parse(init.body));
    return new Response('{}');
  };
  const items = Array.from({ length: 8 }, (_, i) => lead(`b${i}`, 60));
  const r = await notifyAll(items, { channels: channelsFromEnv({ NTFY_TOPIC: 'tp', DISCORD_WEBHOOK_URL: 'https://discord.test/h' }), fetchImpl });
  assert.equal(calls.length, 7);
  assert.match(calls[6].title, /Altre 2 richieste nuove/);
  assert.deepEqual(r.errors, [{ channel: 'discord', error: 'HTTP 500' }]);
  assert.equal(r.sent, 1);
});

test('notify: email = un riepilogo per giro', async () => {
  const mails = [];
  await notifyAll([lead('c1', 70), lead('c2', 50)], { channels: channelsFromEnv({ SMTP_URL: 'smtps://u:p@h', EMAIL_TO: 'me@x.it' }), sendMail: async (m) => mails.push(m) });
  assert.equal(mails.length, 1);
  assert.equal(mails[0].subject, 'Radar: 2 richieste nuove');
  assert.match(mails[0].text, /Migrate Webflow c1[\s\S]*Migrate Webflow c2/);
});

test('notify: testo con misura, link e collegamento alla richiesta', () => {
  const text = formatNotification({ ...lead('d1', 95), budget: { raw: '$2,000' }, measurement: { platform: 'webflow', frameworks: [], motion: ['gsap'], tier: 'MEDIA' } }, { dashboardUrl: 'https://x.io/r' });
  assert.match(text, /95\/100 · migrazione · s · \$2,000/);
  assert.match(text, /fascia MEDIA/);
  assert.match(text, /https:\/\/x\.io\/r\/#\/r\/d1$/);
  assert.equal(itemLink('https://x.io/r/#/r/old', 'z'), 'https://x.io/r/#/r/z');
});
