/**
 * classify.mjs — che tipo di richiesta è, quanto è adatta, e se va scartata.
 * Regole deterministiche e leggibili: ogni punto del punteggio ha la sua ragione scritta.
 */

const PLATFORM = /\b(webflow|framer|wix|squarespace|wordpress|elementor|divi|shopify|aem|adobe experience manager|jimdo|bubble|hubspot cms)\b/i;
const MIGRATE = /\b(migrat\w*|migrazion\w*|migrare|(move|moving|get|getting|switch\w*)( \w+)? (away from|off|from)|leav(e|ing) (webflow|framer|wix|squarespace|wordpress)|export\w*|convert\w*|port(ing)? \w+( \w+)? to|rebuild\w*|re-build\w*|replicat\w* (our|my|the) (own |current |existing )?(site|website)|spostare|convertire|uscire da|passare da|rifare)\b/i;
const TARGET = /\b(next\.?js|react|astro|nuxt|vue|svelte(kit)?|html\/css|plain html|static site|headless|codice)\b/i;
const IDENTICAL = /\b(pixel[- ]perfect|1:1|identical|identic[oa]|same (design|look|layout)|exact(ly)? (the )?same|keep (the )?(same |current |existing )?design|stesso design|mantenere (lo stesso|il) design|uguale)\b/i;
const ANIMATION = /\b(gsap|scrolltrigger|scroll[- ]trigger|lenis|locomotive|scroll[- ]?(animation|effect|driven|telling)s?|parallax|micro[- ]?interactions?|motion design|web animations?|animat\w*|animazion\w*|three\.?js|webgl|awwwards|lottie|barba|page transitions?)\b/i;
const BROKEN = /\b(bugs?|broken|fix\w*|jank\w*|laggy|lag|stutter\w*|not working|doesn'?t work|glitch\w*|non funziona\w*|scatta|si blocca|rott[oaie])\b/i;
const PERFORMANCE = /\b(slow|lighthouse|core web vitals|pagespeed|page speed|performance|lento|lentezza|cls|lcp)\b/i;
const EMPLOYMENT = /\b(full[- ]time|part[- ]time position|permanent (role|position)|annual salary|salary range|benefits package|tempo indeterminato|assunzione)\b/i;

const CLONE = /\b(clone|cloning|clonare|clonar\w*|replicate|replicating|replicare|duplicate|rip[- ]?off|knock[- ]?off)\b|\bcopy (this|the|that|their|a|an|exactly) (\w+ )?(site|website|design|page|landing)\b|\bcopiare (il|un|questo|quel) (\w+ )?(sito|design)\b/i;
const THIRD_PARTY = /\b(competitors?|concorrent[ei]|this (website|site)|questo sito|site like|website like|similar to|come quello di|uguale a quello di|someone else'?s|another (site|website|company)|un altro sito)\b/i;
const OWNERSHIP = /\b(our|my|nostro|nostra|mio|mia|il nostro|il mio) (own |current |existing |old |company'?s? |attuale |vecchio )?(site|website|web site|design|landing|pages?|sito|pagina)\b|\b(client'?s|del cliente|we own|existing site|current site|sito attuale|attuale sito)\b/i;

export const WEIGHTS = Object.freeze({ migrazione: 40, rifacimento: 30, animazioni: 30, bug_animazione: 25, performance: 10 });

/**
 * @param {ReturnType<import('./item.mjs').makeItem>} item
 * @param {{preferredLangs?: string[], minBudget?: number}} config
 * @param {{now?: Date}} [opts]
 * @returns {{categories: string[], redFlag: null | {kind: 'clone_terzi'|'ambiguo', reason: string}, employment: boolean, score: number, reasons: string[]}}
 */
export function classify(item, config = {}, { now = new Date() } = {}) {
  const t = `${item.title}\n${item.text}`;
  const categories = [];
  const reasons = [];

  if (MIGRATE.test(t) && (PLATFORM.test(t) || TARGET.test(t))) categories.push('migrazione');
  if (IDENTICAL.test(t)) categories.push('rifacimento');
  const animated = ANIMATION.test(t);
  if (animated) categories.push('animazioni');
  if (animated && BROKEN.test(t)) categories.push('bug_animazione');
  if (PERFORMANCE.test(t)) categories.push('performance');

  let score = Math.min(70, categories.reduce((sum, c) => sum + WEIGHTS[c], 0));
  if (categories.length) reasons.push(`categorie: ${categories.join(', ')} (+${score})`);

  if (item.siteUrls?.length) { score += 15; reasons.push('c\'è l\'URL del sito: si può misurare prima di rispondere (+15)'); }

  const minBudget = config.minBudget ?? 300;
  if (item.budget) {
    if (item.budget.amount >= minBudget) { score += 10; reasons.push(`budget dichiarato ${item.budget.raw} (+10)`); }
    else { score -= 10; reasons.push(`budget sotto ${minBudget}: ${item.budget.raw} (−10)`); }
  }

  if ((config.preferredLangs ?? []).includes(item.lang)) { score += 5; reasons.push(`lingua ${item.lang} (+5)`); }

  const published = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
  if (Number.isFinite(published) && now - published <= 3 * 3600 * 1000) { score += 10; reasons.push('pubblicata da meno di 3 ore (+10)'); }

  const employment = EMPLOYMENT.test(t);
  if (employment) { score -= 25; reasons.push('sembra un impiego, non un lavoro a progetto (−25)'); }

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

  return { categories, redFlag, employment, score: Math.max(0, Math.min(100, score)), reasons };
}
