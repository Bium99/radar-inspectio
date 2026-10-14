/**
 * email.mjs — gli avvisi ufficiali delle piattaforme (ricerche salvate di Malt, Upwork, LinkedIn, Contra)
 * letti da una casella dedicata via IMAP. È il modo lecito di «ascoltare» una piattaforma: niente bot
 * nel tuo account, niente pagine scaricate, solo le email che la piattaforma ti manda di sua iniziativa.
 *
 * Il formato degli avvisi cambia senza preavviso: il parser cerca prima i link-annuncio noti, poi i link
 * con un testo da titolo, e se non trova nulla tiene l'email intera come una richiesta sola.
 */
import { stripHtml } from '../util.mjs';

const PLATFORMS = [
  { name: 'upwork', from: /upwork\.com/i, job: /upwork\.com\/(jobs\/|freelance-jobs\/apply\/|nx\/jobs\/)/i },
  { name: 'malt', from: /malt\.(com|it|fr|es|de|nl|be|ch)/i, job: /malt\.[a-z.]+\/.*(project|mission|client-request|opportunit)/i },
  { name: 'linkedin', from: /linkedin\.com/i, job: /linkedin\.com\/(comm\/)?jobs\/view\/\d+/i },
  { name: 'contra', from: /contra\.com/i, job: /contra\.com\/.*(opportunit|job|project)/i },
];

const BOILERPLATE = /unsubscribe|disiscriv|annulla l'iscrizione|cancella l'iscrizione|email settings|notification settings|impostazioni|preferenz|privacy|terms of (use|service)|termini (d'uso|di servizio)|help center|centro assistenza|view all|vedi tutt|see all|app store|google play|\blog ?in\b|\baccedi\b|\bsign in\b|view (your )?profile|il tuo profilo|manage (your )?(alerts|notifications|email|preferences|subscriptions)|gestisci (gli )?avvisi|give feedback/i;

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#x2F;/gi, '/').replace(/&#47;/g, '/');

function anchors(html) {
  const out = [];
  for (const m of String(html ?? '').matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decode(m[1]).trim();
    const text = stripHtml(m[2]).replace(/\s+/g, ' ').trim();
    if (/^https?:\/\//i.test(href)) out.push({ href, text });
  }
  return out;
}

const looksLikeTitle = (text) => text.length >= 12 && text.length <= 200 && !BOILERPLATE.test(text);

/** Il testo dopo il titolo, fino al titolo successivo o al primo link di servizio. */
function snippetAfter(body, title, otherTitles = [], size = 600) {
  const i = body.indexOf(title);
  if (i < 0) return '';
  let window = body.slice(i + title.length, i + title.length + size);
  for (const other of otherTitles) {
    const j = other && other !== title ? window.indexOf(other) : -1;
    if (j >= 0) window = window.slice(0, j);
  }
  const stop = window.search(BOILERPLATE);
  if (stop >= 0) window = window.slice(0, stop);
  return window.replace(/\[https?:\/\/[^\]]+\]/g, '').replace(/\s+\n/g, '\n').trim();
}

/**
 * Richieste grezze da un'email di avviso. Puro.
 * @param {{from: string, subject: string, text?: string, html?: string, date?: Date|string|null, messageId?: string}} mail
 */
export function parseAlertEmail(mail) {
  const platform = PLATFORMS.find((p) => p.from.test(mail.from ?? '')) ?? { name: 'altro', job: null };
  const source = `email:${platform.name}`;
  // l'HTML ripulito è più leggibile del testo generato dai client (che mette gli URL tra parentesi)
  const body = mail.html ? stripHtml(mail.html) : String(mail.text ?? '').trim();
  const publishedAt = mail.date ? new Date(mail.date).toISOString() : null;

  const all = anchors(mail.html).filter((a) => !BOILERPLATE.test(a.href) && !BOILERPLATE.test(a.text));
  const strong = platform.job ? all.filter((a) => platform.job.test(a.href)) : [];
  const pool = strong.length ? strong : platform.name !== 'altro' ? all.filter((a) => looksLikeTitle(a.text)) : [];

  const items = [];
  for (const a of pool) {
    const title = looksLikeTitle(a.text) ? a.text : '';
    // lo stesso annuncio compare spesso due volte (immagine + titolo): si tiene quella col titolo
    const twin = items.find((it) => it.url === a.href || (title && it.title === title));
    if (twin) { if (!twin.title && title) twin.title = title; continue; }
    items.push({ source, url: a.href, title, text: '', publishedAt });
  }
  const usable = items.filter((it) => it.title).slice(0, 15);
  const titles = usable.map((it) => it.title);
  for (const it of usable) it.text = snippetAfter(body, it.title, titles);
  if (usable.length) return usable;

  return [{
    source,
    // l'id viene dal messaggio: il primo link di solito è il logo del mittente, uguale in ogni email
    url: `email:${mail.messageId ?? `${mail.subject ?? 'senza-oggetto'}|${publishedAt ?? ''}`}`,
    title: String(mail.subject ?? '').trim(),
    text: body.slice(0, 3000),
    publishedAt,
  }];
}

/**
 * Legge gli avvisi degli ultimi `days` giorni dalla cartella dedicata, in sola lettura: niente flag
 * cambiati, così una prova o un giro fallito non fanno sparire nulla. I doppioni li toglie l'archivio
 * del radar (stesso link = stessa richiesta). Le dipendenze IMAP si caricano solo qui.
 */
export async function fetchAlertEmails({ host, port = 993, user, pass, mailbox = 'INBOX', days = 4, now = new Date() }) {
  const { ImapFlow } = await import('imapflow');
  const { simpleParser } = await import('mailparser');
  const client = new ImapFlow({ host, port: Number(port), secure: true, auth: { user, pass }, logger: false });
  // un errore di rete dopo la connessione arriva come evento: senza ascoltatore farebbe cadere tutto il giro
  let socketError = null;
  client.on('error', (err) => { socketError = err; });
  await client.connect();
  const raws = [];
  const lock = await client.getMailboxLock(mailbox, { readOnly: true });
  try {
    const uids = (await client.search({ since: new Date(now.getTime() - days * 86_400_000) }, { uid: true })) || [];
    if (uids.length) {
      for await (const msg of client.fetch(uids, { source: true }, { uid: true })) {
        const mail = await simpleParser(msg.source);
        raws.push(...parseAlertEmail({
          from: mail.from?.text ?? '',
          subject: mail.subject ?? '',
          text: mail.text ?? '',
          html: typeof mail.html === 'string' ? mail.html : '',
          date: mail.date ?? null,
          messageId: mail.messageId ?? undefined,
        }));
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  if (socketError && !raws.length) throw socketError;
  return raws;
}
