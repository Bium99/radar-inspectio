/**
 * notify.mjs — avvisa TE (mai il cliente) appena arriva una richiesta buona.
 *
 * Canali, ognuno attivo solo se trova le sue credenziali:
 *  - ntfy: nessun account. Il topic è NTFY_TOPIC, oppure si ricava da RADAR_PASSWORD (lib/crypto.mjs):
 *    basta installare l'app ntfy e iscriversi al topic che mostra la dashboard.
 *  - telegram (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID), discord (DISCORD_WEBHOOK_URL),
 *    slack (SLACK_WEBHOOK_URL), email (SMTP_URL + EMAIL_TO, un riepilogo per giro).
 */
import { ntfyTopicFromPassword } from './crypto.mjs';

const MAX_SINGLE = 6;

/** Testo breve dell'avviso. Puro. */
export function formatNotification(item, { dashboardUrl } = {}) {
  const c = item.classification ?? {};
  const m = item.measurement;
  const lines = [
    item.title,
    `${c.score ?? '?'}/100 · ${(c.categories ?? []).join(', ') || 'non classificata'} · ${item.sourceLabel ?? item.source}${item.budget ? ` · ${item.budget.raw}` : ''}`,
  ];
  if (m && !m.error) lines.push(`Sito: ${m.platform ?? 'stack ?'}${m.frameworks?.length ? ` + ${m.frameworks.join(', ')}` : ''} · ${m.motion?.join(', ') || 'nessun movimento visibile'} · fascia ${m.tier}`);
  else if (m?.error) lines.push(`Sito non misurato: ${m.error}`);
  if (c.redFlag) lines.push(`Attenzione: ${c.redFlag.reason}`);
  lines.push(item.url);
  if (dashboardUrl) lines.push(itemLink(dashboardUrl, item.id));
  return lines.join('\n');
}

export function itemLink(dashboardUrl, id) {
  return `${dashboardUrl.replace(/#.*$/, '').replace(/\/?$/, '/')}#/r/${id}`;
}

/** I canali attivi secondo l'ambiente. Puro. */
export function channelsFromEnv(env) {
  const out = [];
  const topic = env.NTFY_TOPIC || (env.RADAR_PASSWORD && env.NTFY_OFF !== '1' ? ntfyTopicFromPassword(env.RADAR_PASSWORD) : null);
  if (topic) out.push({ kind: 'ntfy', server: (env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, ''), topic, custom: Boolean(env.NTFY_TOPIC), token: env.NTFY_TOKEN || null });
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) out.push({ kind: 'telegram', token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID });
  if (env.DISCORD_WEBHOOK_URL) out.push({ kind: 'discord', url: env.DISCORD_WEBHOOK_URL });
  if (env.SLACK_WEBHOOK_URL) out.push({ kind: 'slack', url: env.SLACK_WEBHOOK_URL });
  if (env.SMTP_URL && env.EMAIL_TO) out.push({ kind: 'email', smtpUrl: env.SMTP_URL, to: env.EMAIL_TO, from: env.EMAIL_FROM || env.EMAIL_TO });
  return out;
}

async function post(fetchImpl, url, body, headers = {}) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function sendOne(channel, item, text, { dashboardUrl, fetchImpl }) {
  const score = item.classification?.score ?? 0;
  switch (channel.kind) {
    case 'ntfy':
      return post(fetchImpl, channel.server, {
        topic: channel.topic,
        title: `${score}/100 · ${item.title}`.slice(0, 200),
        message: text,
        priority: score >= 80 ? 4 : 3,
        tags: (item.classification?.categories ?? []).slice(0, 3),
        click: dashboardUrl ? itemLink(dashboardUrl, item.id) : item.url,
        actions: [
          { action: 'view', label: 'Apri annuncio', url: item.url, clear: false },
          ...(dashboardUrl ? [{ action: 'view', label: 'Dashboard', url: itemLink(dashboardUrl, item.id), clear: false }] : []),
        ],
      }, channel.token ? { authorization: `Bearer ${channel.token}` } : {});
    case 'telegram':
      return post(fetchImpl, `https://api.telegram.org/bot${channel.token}/sendMessage`, { chat_id: channel.chatId, text, disable_web_page_preview: true });
    case 'discord':
      return post(fetchImpl, channel.url, { content: text.slice(0, 1900) });
    case 'slack':
      return post(fetchImpl, channel.url, { text });
    default:
      throw new Error(`canale sconosciuto: ${channel.kind}`);
  }
}

async function sendEmailDigest(channel, items, { dashboardUrl, sendMail }) {
  const subject = items.length === 1 ? `Radar: ${items[0].title}` : `Radar: ${items.length} richieste nuove`;
  const text = items.map((it) => formatNotification(it, { dashboardUrl })).join('\n\n———\n\n');
  if (sendMail) return sendMail({ to: channel.to, from: channel.from, subject, text });
  const { default: nodemailer } = await import('nodemailer');
  await nodemailer.createTransport(channel.smtpUrl).sendMail({ to: channel.to, from: channel.from, subject, text });
}

/**
 * Manda gli avvisi di un giro su tutti i canali attivi. Oltre MAX_SINGLE richieste, le prime arrivano
 * una per una e il resto in un messaggio di riepilogo. Un canale che fallisce non ferma gli altri.
 * @returns {Promise<{sent: number, errors: {channel: string, error: string}[]}>}
 */
export async function notifyAll(items, { channels, dashboardUrl, fetchImpl = fetch, sendMail, log = () => {}, echo = false }) {
  const errors = [];
  let sent = 0;
  if (!items.length) return { sent, errors };
  if (!channels.length) {
    // senza canali, in locale l'avviso si stampa; su GitHub Actions mai: i log possono essere pubblici
    if (echo) for (const it of items) log(`\n${formatNotification(it, { dashboardUrl })}\n`);
    return { sent: items.length, errors };
  }
  const single = items.slice(0, MAX_SINGLE);
  const rest = items.slice(MAX_SINGLE);
  for (const channel of channels) {
    try {
      if (channel.kind === 'email') {
        await sendEmailDigest(channel, items, { dashboardUrl, sendMail });
      } else {
        for (const it of single) await sendOne(channel, it, formatNotification(it, { dashboardUrl }), { dashboardUrl, fetchImpl });
        if (rest.length) {
          const summary = { id: '', title: `Altre ${rest.length} richieste nuove`, url: dashboardUrl ?? '', classification: { score: rest[0].classification?.score ?? 0, categories: [] } };
          await sendOne(channel, summary, rest.map((it) => `${it.classification?.score ?? '?'} · ${it.title}`).join('\n'), { dashboardUrl, fetchImpl });
        }
      }
      sent += 1;
    } catch (err) {
      errors.push({ channel: channel.kind, error: err.message });
    }
  }
  return { sent, errors };
}
