/**
 * scan.mjs — un giro del radar: raccoglie, deduplica, classifica, misura, avvisa, salva.
 * Una fonte che fallisce si dichiara nel riepilogo e il giro continua con le altre.
 */
import { makeItem } from './item.mjs';
import { classify } from './classify.mjs';
import { measureItem } from './measure.mjs';
import { formatNotification, sendTelegram } from './notify.mjs';
import { upsertItems } from './store.mjs';
import { fetchFeed } from './sources/rss.mjs';
import { getToken, fetchSubreddit } from './sources/reddit.mjs';
import { fetchAlertEmails } from './sources/email.mjs';

/** Le fonti attive, secondo config e credenziali presenti. */
export function plannedSources(config, env) {
  const out = [];
  const s = config.sources ?? {};
  if (s.email?.enabled && env.IMAP_HOST && env.IMAP_USER && env.IMAP_PASS) out.push({ kind: 'email', label: `email:${s.email.mailbox ?? 'INBOX'}` });
  if (s.reddit?.enabled && env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET) {
    for (const sub of s.reddit.subreddits ?? []) out.push({ kind: 'reddit', label: `reddit:${sub.name}`, sub });
  }
  for (const feed of s.rss ?? []) if (feed.enabled) out.push({ kind: 'rss', label: `rss:${feed.name}`, feed });
  return out;
}

/**
 * @param {{config: object, env: object, store: object, fetchImpl?: typeof fetch, now?: Date,
 *   readEmails?: typeof fetchAlertEmails, notify?: (text: string) => Promise<void>, log?: (msg: string) => void}} deps
 */
export async function runScan({ config, env, store, fetchImpl = fetch, now = new Date(), readEmails = fetchAlertEmails, notify, log = () => {} }) {
  const userAgent = config.userAgent;
  const summary = { sources: [], fetched: 0, fresh: 0, discarded: 0, measured: 0, notified: 0, errors: [] };
  const raws = [];
  let redditToken = null;

  for (const src of plannedSources(config, env)) {
    try {
      let got = [];
      if (src.kind === 'email') {
        got = await readEmails({ host: env.IMAP_HOST, port: env.IMAP_PORT, user: env.IMAP_USER, pass: env.IMAP_PASS, mailbox: config.sources.email.mailbox });
      } else if (src.kind === 'reddit') {
        redditToken ??= await getToken({ clientId: env.REDDIT_CLIENT_ID, clientSecret: env.REDDIT_CLIENT_SECRET, userAgent, fetchImpl });
        got = await fetchSubreddit(src.sub, { token: redditToken, userAgent, fetchImpl });
      } else if (src.kind === 'rss') {
        got = await fetchFeed(src.feed, { userAgent, fetchImpl });
      }
      raws.push(...got);
      summary.sources.push({ source: src.label, count: got.length });
    } catch (err) {
      summary.errors.push({ source: src.label, error: err.message });
      log(`fonte ${src.label} non letta: ${err.message}`);
    }
  }
  summary.fetched = raws.length;

  const items = raws.map((r) => makeItem(r, { now }));
  const fresh = upsertItems(store, items, { now });
  summary.fresh = fresh.length;

  for (const item of fresh) {
    item.classification = classify(item, config, { now });
    if (item.classification.redFlag?.kind === 'clone_terzi') { item.status = 'scartato'; summary.discarded += 1; continue; }
    if (item.classification.score >= (config.measureMinScore ?? 30) && item.siteUrls.length) {
      item.measurement = await measureItem(item, { userAgent, fetchImpl, now });
      summary.measured += 1;
    }
  }

  const worth = fresh
    .filter((it) => it.status === 'nuovo' && it.classification.score >= (config.notifyMinScore ?? 45))
    .sort((a, b) => b.classification.score - a.classification.score);
  for (const item of worth) {
    const text = formatNotification(item);
    try {
      if (notify) await notify(text);
      else if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) await sendTelegram(text, { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID, fetchImpl });
      else log(`\n${text}\n`);
      item.status = 'notificato';
      summary.notified += 1;
    } catch (err) {
      summary.errors.push({ source: 'notifica', error: err.message });
    }
  }
  return summary;
}
