/**
 * reddit.mjs — API ufficiale di Reddit, accesso «solo applicazione» (client_credentials), a basso volume.
 * Niente pagine HTML, niente login di un utente: solo /r/<sub>/new.
 */

const HIRING = /\[\s*hiring\s*\]|\bhiring\b|looking for (a |an )?(\w+ )?(dev|developer|freelancer|designer|expert|webflow|framer)|\bpaid (gig|project|work)\b|\bbudget\b|\bcerc(o|hiamo|asi) (un |una |uno )?(sviluppator\w*|programmator\w*|web ?designer|freelanc\w*|qualcuno)|\bpreventiv\w*|\ba pagamento\b/i;
const FOR_HIRE = /\[\s*for hire\s*\]/i;

/** Token dell'applicazione. */
export async function getToken({ clientId, clientSecret, userAgent, fetchImpl = fetch }) {
  const res = await fetchImpl('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': userAgent,
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`reddit token: HTTP ${res.status}`);
  const json = await res.json();
  if (!json.access_token) throw new Error('reddit token: risposta senza access_token');
  return json.access_token;
}

/**
 * Elementi grezzi da un listing di /r/<sub>/new. Puro.
 * Con `onlyHiring` tiene solo chi cerca qualcuno, non chi si offre.
 */
export function parseListing(json, sub, { onlyHiring = true } = {}) {
  return (json?.data?.children ?? [])
    .map((c) => c.data)
    .filter((d) => d && !d.stickied)
    .filter((d) => {
      if (!onlyHiring) return true;
      const head = `${d.title ?? ''} ${d.link_flair_text ?? ''}`;
      return !FOR_HIRE.test(head) && HIRING.test(`${head} ${d.selftext ?? ''}`);
    })
    .map((d) => ({
      source: `reddit:${sub}`,
      url: `https://www.reddit.com${d.permalink}`,
      title: d.title ?? '',
      text: d.selftext ?? '',
      publishedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
    }));
}

/** Gli ultimi post di un subreddit. */
export async function fetchSubreddit({ name, onlyHiring }, { token, userAgent, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://oauth.reddit.com/r/${encodeURIComponent(name)}/new?limit=50&raw_json=1`, {
    headers: { authorization: `Bearer ${token}`, 'user-agent': userAgent },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`reddit r/${name}: HTTP ${res.status}`);
  return parseListing(await res.json(), name, { onlyHiring });
}
