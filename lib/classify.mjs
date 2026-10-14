/**
 * classify.mjs — che tipo di richiesta è, quanto è adatta, e se va scartata.
 * Regole deterministiche e leggibili: ogni punto del punteggio ha la sua ragione scritta.
 * Le regole sono tarate sugli annunci veri del collaudo su GitHub Actions (vedi test/classify.test.mjs).
 */

const PLATFORMS = 'webflow|framer|wix|squarespace|wordpress|elementor|divi|shopify|hubspot|bubble|weebly|jimdo|godaddy|carrd|ghost';
const TARGETS = 'next\\.?js|nextjs|react|astro|nuxt|vue|svelte(kit)?|gatsby|html|static|headless|code|codice|webflow|framer|wordpress|shopify';
const FROM_PLATFORM = new RegExp(`\\b(from|off|away from|leave|leaving|da|uscire da|lasciare)\\s+(${PLATFORMS})\\b`, 'i');
const PLATFORM_TO = new RegExp(`\\b(${PLATFORMS})(\\s+[\\w-]+){0,2}\\s*(to|→|->|into|in|verso|a)\\s+(${TARGETS})\\b`, 'i');
const MIGRATE_VERB = /\b(migrat\w*|migrazion\w*|migrare|port(ing)?|mov(e|ing)|transfer\w*|switch\w*|convert\w*|rebuild\w*|re-build\w*|recreat\w*|rifare|ricostruire|spostare|passare|trasferire)\b/i;
const SITE_MIGRATION = /\b((web ?site|site) migration|migrat\w* (our|my|the|a|an|this) (\w+ ){0,2}(web ?site|site)|migrazione (del|di un|dello|di) (\w+ )?sito|migrare (il|un) (\w+ )?sito)\b/i;

const REBUILD = '(rebuild\\w*|re-build\\w*|recreat\\w*|re-creat\\w*|redo|re-do|replicat\\w*|reproduc\\w*|rifare|ricostruire|replicare|riprodurre|migrat\\w*|port(ing)?|move|moving)';
const SAME = '(same (design|look|layout|site)|identical|exact(ly)? (the )?same|exact (copy|replica)|pixel[- ]perfect|1:1|one[- ]to[- ]one|keep (the )?(same|current|existing) (design|look|layout)|as it is now|stesso design|stesso aspetto|identic[oa]|uguale|così com\'è)';
const KEEP_SAME = /\b(keep(ing)? (the )?(exact(ly)? )?(same|current|existing) (design|look|layout|ui)|mantenere (lo stesso|il) (design|aspetto|layout)|stesso identico (design|sito))\b/i;
// il verbo e «identico» nella stessa frase: «pixel-perfect» da solo in un annuncio non è un rifacimento
const REBUILD_SAME = new RegExp(`\\b${REBUILD}\\b[^.\\n]{0,80}\\b${SAME}|\\b${SAME}[^.\\n]{0,80}\\b${REBUILD}\\b`, 'i');

// Movimento web: i termini «forti» bastano da soli; quelli generici solo se il contesto è web e non video/grafica.
const ANIM_STRONG = /\b(gsap|scrolltrigger|scroll[- ]trigger|lenis|locomotive[- ]?scroll|three\.?js|threejs|webgl|r3f|react[- ]three[- ]fiber|scroll[- ]?(animation|effect|driven|telling)s?|parallax|micro[- ]?interactions?|page transitions?|barba(\.?js)?|awwwards|framer[- ]motion|motion\.dev|rive(\.app| animations?| state machines?)|spline)\b/i;
// «interactive» e «3d» da soli portano strumenti di preventivo e giochi: contano solo riferiti a un sito
const ANIM_WEAK = /\b(animat\w*|animazion\w*|anim[ée]es?|lottie|interactive (web ?sites?|sites?|landing( pages?)?|experiences?|animations?|scroll\w*|storytelling)|sito interattivo|site (web )?interactif|3d (web ?sites?|web|sites?|scenes?|experiences?|configurators?|viewers?)|(web|ui) motion)\b|\banim[ée](?![\w])/i;
const WEB = /\b(web ?sites?|web ?pages?|web ?app|landing( page)?|homepage|site|sito|webflow|framer|wordpress|shopify|wix|squarespace|react|next\.?js|vue|nuxt|astro|svelte|front[- ]?end|css|html|javascript|vitrine)\b/i;
const NOT_WEB_ANIM = /\b(video edit\w*|video editor|youtube|tiktok|reels?|after effects|premiere|motion graphics|motion design(er)?|explainer (video|animation)|vid[ée]o (de )?(pr[ée]sentation|promo\w*|explicative|marketing|publicitaire)|promo(tional)? video|montage|2d (artist|animation|animator)|character animat\w*|cartoon\w*|whiteboard|slides?|powerpoint|game (art|asset)s?|blender|maya|cinema ?4d|logo animation|gif|anime|illustrat\w*)\b/i;
// un titolo da grafica o video dice di che lavoro si tratta, anche se il testo nomina un sito
const NOT_WEB_TITLE = /\b(logos?|branding|brand identity|vectori[sz]\w*|flyers?|posters?|brochures?|packaging|vid[ée]os?|montage|illustrat\w*|banner ads?|thumbnails?|games?|jeux?|gioco|giochi)\b/i;
const ANIM_NEAR = '(animat\\w*|animazion\\w*|gsap|scroll\\w*|parallax|transition\\w*|three\\.?js|webgl|lenis|motion)';
// «without lag», «glitch-free», «fixed price» non sono guasti
const BROKE_NEAR = '(?<!\\b(?:without|no|zero|free of|senza|sans|avoid\\w*|minimal)\\s(?:\\w+\\s){0,3})(broken|bugs?|buggy|jank\\w*|laggy|lagging|stutter\\w*|glitch\\w*|flicker\\w*|not working|doesn\'?t work|stopped working|non funziona\\w*|scatta|si blocca|rott[oaie]|ne fonctionne(nt)? (pas|plus)|cass[ée]e?s?)(?![- ]free)';
const FIX_VERB = '\\b(fix|fixes|fixing|repair\\w*|debug\\w*|troubleshoot\\w*|sistemare|riparare|correggere|corriger|r[ée]parer)\\b';
const BROKEN_ANIM = new RegExp(`${ANIM_NEAR}[^.\\n]{0,60}${BROKE_NEAR}|${BROKE_NEAR}[^.\\n]{0,60}${ANIM_NEAR}|${FIX_VERB}[^.\\n]{0,40}${ANIM_NEAR}`, 'i');
// «Framer Motion» è una libreria React, non il sito fatto con Framer
const NOCODE_WORK = /\bwebflow\b|\bframer\b(?![- .]?motion)/i;
const PERFORMANCE = /\b(lighthouse|core web vitals|pagespeed|page speed|slow (site|website|loading|page)|site (is )?slow|sito (è )?lento|caricamento lento|velocizzare il sito)\b/i;

const EMPLOYMENT = /\b(full[- _]?time|part[- _]time (position|role)|permanent (role|position)|annual salary|salary range|benefits package|tempo indeterminato|assunzione|equity|onsite|on-site|hybrid|visa sponsorship|401k|cdi\b)|[$€£]\s?\d{2,3}\s?k\b|\b\d{2,3}k\s?[-–]\s?[$€£]?\d{2,3}k\b/i;
const CONTRACT = /\b(contract|contractor|freelanc\w*|temporary|temp\b|project[- ]based|per hour|hourly|\/\s?hr\b|\/\s?h\b|fixed[- ]price|one[- ]off|1099|a progetto|partita iva)\b/i;

const CLONE = /\b(clone|cloning|clonare|clonar\w*|replicate|replicating|replicare|duplicate|rip[- ]?off|knock[- ]?off)\b|\bcopy (this|the|that|their|a|an|exactly) (\w+ )?(site|website|design|page|landing)\b|\bcopiare (il|un|questo|quel) (\w+ )?(sito|design)\b/i;
const THIRD_PARTY = /\b(competitors?|concorrent[ei]|this (website|site)|questo sito|site like|website like|similar to|come quello di|uguale a quello di|someone else'?s|another (site|website|company)|un altro sito)\b/i;
const OWNERSHIP = /\b(our|my|nostro|nostra|mio|mia|il nostro|il mio) (own |current |existing |old |company'?s? |attuale |vecchio )?(site|website|web site|design|landing|pages?|sito|pagina)\b|\b(client'?s|del cliente|we own|existing site|current site|sito attuale|attuale sito)\b/i;

// Qualcuno CERCA qualcuno: senza questo segnale un post è un discorso, non una richiesta.
// (le forme tra parentesi quadre stanno fuori dai \b: prima di «[» non c'è un confine di parola)
const INTENT = /\[\s*hiring\s*\]|\b(hiring|we('| a)re hiring|(looking|searching) for (a |an )?([\w.+/-]+ ){0,3}(freelanc\w*|developers?|devs?|designers?|agency|experts?|contractors?|specialists?)\b|(looking for|need|needs|seeking) (someone|somebody) (to|who|with|that)|seeking (a |an )?(freelanc\w*|developer|contractor|designer|agency|expert)|need(s|ed)? (a |an )?([\w.+-]+ ){0,3}(freelanc\w*|developers?|designers?|agency|experts?|contractors?|specialists?)\b|(developer|designer|freelancer|expert|dev) wanted|paid (project|gig|work|job|task)|budget|contract (role|position|work|gig)|freelance (project|gig|job|role)|request for proposals?|rfp|get a quote|cerc(o|hiamo|asi|ano) (un |una |uno )?(sviluppator\w*|programmator\w*|freelanc\w*|designer|web ?designer|esperto|esperta|professionista|agenzia|web ?agency|qualcuno)|ci serve (un|una|qualcuno)|mi serve (un|una|qualcuno)|qualcuno (che|in grado di) (mi |ci )?(sappia|possa|faccia|realizzi|sistemi|migri|rifaccia)|preventiv\w*|offriamo un compenso|retribuit\w*)/i;
// Qualcuno SI OFFRE: thread «who wants to be hired», «[for hire]», curriculum.
const SUPPLY = /\[\s*for hire\s*\]|\b(seeking work|for hire:|willing to relocate|r[ée]sum[ée]|cv:|hire me|available for (hire|freelance|work|new projects|projects)|(developer|designer|freelancer|animator|dev) (is )?(now )?available\b|offering (my )?(services|skills)|i('m| am) (a |an )?(freelance|web|frontend|front-end|creative|full[- ]stack) (developer|designer|dev)|open to (work|new opportunities)|cerco lavoro|mi propongo|disponibile per (progetti|collaborazioni|lavori)|offro (i miei )?servizi)\b/i;
const EXPLICIT_DEMAND = /\[\s*hiring\s*\]|\b(seeking freelancer|we('| a)re hiring|looking for a (freelancer|developer))\b/i;

export const WEIGHTS = Object.freeze({ migrazione: 40, rifacimento: 30, animazioni: 35, bug_animazione: 25, webflow_framer: 20, performance: 10 });

/**
 * @param {ReturnType<import('./item.mjs').makeItem> & {demandSource?: boolean, jobBoard?: boolean}} item
 *   `demandSource` = la fonte contiene solo richieste (l'intenzione è già data);
 *   `jobBoard` = bacheca di lavoro: è un impiego, salvo segnali di contratto o freelance.
 * @param {{preferredLangs?: string[], minBudget?: number}} config
 * @param {{now?: Date}} [opts]
 * @returns {{categories: string[], terms: Record<string, string>, redFlag: null | {kind: 'clone_terzi'|'ambiguo', reason: string}, employment: boolean, intent: boolean, supply: boolean, score: number, reasons: string[]}}
 */
export function classify(item, config = {}, { now = new Date() } = {}) {
  const t = `${item.title}\n${item.text}`;
  const categories = [];
  const reasons = [];

  // chi si offre non è un cliente: fuori subito, qualunque parola chiave contenga
  if (SUPPLY.test(t) && !EXPLICIT_DEMAND.test(t)) {
    return { categories, terms: {}, redFlag: null, employment: false, intent: false, supply: true, score: 0, reasons: ['è qualcuno che si offre (curriculum, «seeking work», «for hire»), non una richiesta'] };
  }
  const intent = Boolean(item.demandSource) || INTENT.test(t) || Boolean(item.budget);

  // la parola che ha fatto scattare ogni categoria, per spiegare il punteggio
  const terms = {};
  const hit = (re, text = t) => { const m = text.match(re); return m ? m[0].trim() : null; };
  // un segnale vale pieno nel titolo o in un post breve; in un testo lungo che lo nomina soltanto vale meno
  const longText = String(item.text ?? '').length > 700;
  const weights = {};
  const add = (cat, term, weight) => { categories.push(cat); terms[cat] = term; weights[cat] = weight; };

  const migration = hit(SITE_MIGRATION) ?? (MIGRATE_VERB.test(t) ? hit(FROM_PLATFORM) ?? hit(PLATFORM_TO) : null);
  if (migration) add('migrazione', migration, WEIGHTS.migrazione);
  // «tenere lo stesso design» basta da solo; in una migrazione basta che «identico» compaia
  const same = hit(REBUILD_SAME) ?? hit(KEEP_SAME) ?? (migration ? hit(new RegExp(`\\b${SAME}`, 'i')) : null);
  if (same) add('rifacimento', same, WEIGHTS.rifacimento);

  const strong = hit(ANIM_STRONG);
  const weak = !strong && WEB.test(t) && !NOT_WEB_ANIM.test(t) && !NOT_WEB_TITLE.test(item.title ?? '') ? hit(ANIM_WEAK) : null;
  if (strong) add('animazioni', strong, ANIM_STRONG.test(item.title ?? '') || !longText ? WEIGHTS.animazioni : 25);
  else if (weak) add('animazioni', weak, ANIM_WEAK.test(item.title ?? '') ? 25 : 12);
  const broken = categories.includes('animazioni') ? hit(BROKEN_ANIM) : null;
  if (broken) add('bug_animazione', broken, WEIGHTS.bug_animazione);
  const nocode = !migration && WEB.test(t) ? hit(NOCODE_WORK) : null;
  if (nocode) add('webflow_framer', nocode, NOCODE_WORK.test(item.title ?? '') || !longText ? WEIGHTS.webflow_framer : 10);
  const perf = hit(PERFORMANCE);
  if (perf) add('performance', perf, WEIGHTS.performance);

  let score = Math.min(70, categories.reduce((sum, c) => sum + weights[c], 0));
  if (categories.length) reasons.push(`categorie: ${categories.map((c) => `${c} «${terms[c]}»${weights[c] < WEIGHTS[c] ? ' (solo nominata nel testo)' : ''}`).join(', ')} (+${score})`);

  if (intent && categories.length) { score += 10; reasons.push(item.demandSource ? 'fonte di sole richieste (+10)' : 'qualcuno sta cercando esplicitamente (+10)'); }

  if (item.siteUrls?.length) { score += 15; reasons.push('c\'è l\'URL del sito: si può misurare prima di rispondere (+15)'); }

  const minBudget = config.minBudget ?? 300;
  if (item.budget) {
    if (item.budget.amount >= minBudget) { score += 10; reasons.push(`budget dichiarato ${item.budget.raw} (+10)`); }
    else { score -= 10; reasons.push(`budget sotto ${minBudget}: ${item.budget.raw} (−10)`); }
  }

  if ((config.preferredLangs ?? []).includes(item.lang)) { score += 5; reasons.push(`lingua ${item.lang} (+5)`); }

  const published = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
  if (Number.isFinite(published) && now - published <= 3 * 3600 * 1000) { score += 10; reasons.push('pubblicata da meno di 3 ore (+10)'); }

  const employment = EMPLOYMENT.test(t) || (Boolean(item.jobBoard) && !CONTRACT.test(t));
  if (employment) { score -= 25; reasons.push(item.jobBoard && !EMPLOYMENT.test(t) ? 'annuncio da bacheca senza segnali di contratto o freelance: probabile impiego (−25)' : 'sembra un impiego, non un lavoro a progetto (−25)'); }

  let redFlag = null;
  // un concorrente o «un sito come X» vince su ogni parola di possesso: si scarta
  if (CLONE.test(t) && THIRD_PARTY.test(t)) {
    redFlag = { kind: 'clone_terzi', reason: 'chiede di copiare il sito di qualcun altro: si scarta sempre' };
    score = 0;
  } else if (CLONE.test(t) && !OWNERSHIP.test(t)) {
    redFlag = { kind: 'ambiguo', reason: 'parla di clonare/replicare senza dire di chi è il sito: verifica la titolarità prima di rispondere' };
    score = Math.round(score / 2);
  }
  if (redFlag) reasons.push(redFlag.reason);

  if (!intent && redFlag?.kind !== 'clone_terzi') {
    score = Math.round(score * 0.25);
    reasons.push('nessun segnale che qualcuno stia cercando (hiring, «looking for», budget, «cerco»…): punteggio ×0,25');
  }

  return { categories, terms, redFlag, employment, intent, supply: false, score: Math.max(0, Math.min(100, score)), reasons };
}
