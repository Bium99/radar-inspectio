/**
 * profile.mjs — che cosa cerchiamo, in un posto solo: le parole chiave per le fonti che hanno la
 * ricerca. La classificazione (lib/classify.mjs) decide poi che cosa è pertinente.
 */

/** Ricerche in inglese: strette, per non portare rumore. */
export const QUERIES_EN = [
  'webflow developer',
  'webflow migration',
  'migrate webflow',
  'framer developer',
  'framer to code',
  'wix migration',
  'squarespace migration',
  'wordpress to nextjs',
  'gsap developer',
  'gsap animation',
  'scrolltrigger',
  'three.js developer',
  'webgl developer',
  'lottie animation',
  'scroll animation website',
  'awwwards website',
  'pixel perfect rebuild',
  'creative developer freelance',
];

/** Ricerche in italiano. */
export const QUERIES_IT = [
  'sviluppatore webflow',
  'migrazione sito web',
  'rifare sito web',
  'animazioni sito web',
  'sviluppatore gsap',
  'sito wordpress next.js',
  'creative developer freelance',
];

/** Un sottoinsieme fisso, per le fonti dove ogni ricerca costa una richiesta. */
export const CORE_QUERIES = ['webflow', 'framer', 'gsap', 'three.js', 'webgl', 'lottie', 'scroll animation', 'migrate website'];

/** Parole che rendono un post candidato quando una fonte non ha la ricerca (filtro grezzo, prima della classificazione). */
export const PREFILTER = /\b(webflow|framer|wix|squarespace|wordpress|elementor|shopify|gsap|scrolltrigger|lenis|locomotive|three\.?js|webgl|lottie|animat\w*|animazion\w*|parallax|awwwards|migrat\w*|migrazion\w*|rebuild|re-build|rifare|pixel[- ]perfect|next\.?js|astro|creative dev\w*|motion design)\b/i;

export function queriesFor(spec) {
  if (Array.isArray(spec)) return spec;
  if (spec === 'core') return CORE_QUERIES;
  if (spec === 'en') return QUERIES_EN;
  if (spec === 'it') return QUERIES_IT;
  if (spec === 'all') return [...QUERIES_EN, ...QUERIES_IT];
  return [null];
}
