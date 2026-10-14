/**
 * notify.mjs — avvisa TE (non il cliente) appena arriva una richiesta buona: la velocità conta.
 */

/** Testo dell'avviso. Puro. */
export function formatNotification(item) {
  const c = item.classification ?? {};
  const m = item.measurement;
  const lines = [
    `Radar · ${c.score ?? '?'}/100 · ${(c.categories ?? []).join(', ') || 'non classificata'}`,
    item.title,
    `${item.source}${item.budget ? ` · budget ${item.budget.raw}` : ''} · ${item.lang}`,
  ];
  if (m && !m.error) lines.push(`Sito: ${m.platform ?? 'piattaforma ?'}${m.frameworks.length ? ` + ${m.frameworks.join(', ')}` : ''} · movimento: ${m.motion.join(', ') || 'nessuno visibile'} · fascia ${m.tier}`);
  else if (m?.error) lines.push(`Sito non misurato: ${m.error}`);
  if (c.redFlag) lines.push(`ATTENZIONE: ${c.redFlag.reason}`);
  lines.push(item.url, `id ${item.id} · radar bozza ${item.id}`);
  return lines.join('\n');
}

export async function sendTelegram(text, { token, chatId, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`telegram: HTTP ${res.status}`);
}
