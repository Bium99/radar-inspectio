/**
 * draft.mjs — la bozza della risposta, da un modello fisso e dai fatti misurati. Mai inviata da sola:
 * la rileggi, la correggi, la mandi tu. Non promette ciò che la misura non dice.
 */

const PRIORITY = ['migrazione', 'rifacimento', 'bug_animazione', 'animazioni', 'webflow_framer', 'performance'];

function mainCategory(item) {
  const cats = item.classification?.categories ?? [];
  return PRIORITY.find((c) => cats.includes(c)) ?? null;
}

const TARGET_RE = /\b(next\.?js|react|astro|nuxt|vue|sveltekit|svelte|html\/css|plain html)\b/i;

const STEP = {
  it: {
    migrazione: (target) => `Ricompilo le pagine in ${target ?? 'codice pulito'} mantenendo struttura, font e movimento; i contenuti restano vostri.`,
    rifacimento: () => 'Rifaccio il sito partendo dalle misure di quello attuale, così il risultato resta uguale dove deve restare uguale.',
    bug_animazione: () => 'Individuo cosa rompe l\'animazione confrontando il comportamento attuale con quello atteso, e lo correggo senza toccare il resto.',
    animazioni: () => 'Costruisco le animazioni con parametri misurati (durate, curve, trigger), senza dipendenze superflue.',
    performance: () => 'Misuro dove si perde tempo al caricamento e intervengo prima sui punti che pesano di più.',
    webflow_framer: () => 'Costruisco le pagine in Webflow o Framer, oppure in codice se vi serve più libertà, con il movimento curato al dettaglio.',
    generico: () => 'Vi preparo una proposta concreta partendo dalla misura.',
  },
  en: {
    migrazione: (target) => `I recompile the pages into ${target ?? 'clean code'}, keeping structure, fonts and motion; the content stays yours.`,
    rifacimento: () => 'I rebuild the site starting from measurements of the current one, so it stays identical where it should.',
    bug_animazione: () => 'I find what breaks the animation by comparing the current behaviour with the expected one, and fix it without touching the rest.',
    animazioni: () => 'I build the animations from measured parameters (durations, easing curves, triggers), with no unnecessary dependencies.',
    performance: () => 'I measure where load time goes and fix the heaviest points first.',
    webflow_framer: () => 'I build the pages in Webflow or Framer, or in code if you need more freedom, with carefully crafted motion.',
    generico: () => 'I prepare a concrete proposal starting from the measurement.',
  },
};

function measuredLine(lang, m) {
  if (!m) {
    return lang === 'it'
      ? 'Se mi mandate l\'URL del sito attuale, lo misuro prima di proporvi tempi e prezzo.'
      : 'If you send me the URL of the current site, I will measure it before quoting time and price.';
  }
  if (m.error) {
    return lang === 'it'
      ? 'Ho provato a guardare il sito attuale ma non sono riuscito a misurarlo da qui: lo verifico con voi.'
      : 'I tried to look at the current site but could not measure it from here: I will check it with you.';
  }
  const host = new URL(m.url).hostname;
  const stack = [m.platform, ...m.frameworks].filter(Boolean).join(' + ') || (lang === 'it' ? 'uno stack personalizzato' : 'a custom stack');
  const motion = m.motion.filter((x) => x !== 'canvas').join(', ');
  return lang === 'it'
    ? `Ho già dato un'occhiata a ${host}: è su ${stack}${motion ? `, con ${motion} per il movimento` : ''}.`
    : `I already looked at ${host}: it runs on ${stack}${motion ? `, with ${motion} for motion` : ''}.`;
}

/**
 * @param {object} item richiesta con `classification` e, se c'è, `measurement`
 * @param {{pricing?: object, timeline?: object, signature?: string}} config
 */
export function draftProposal(item, config = {}) {
  const lang = item.lang === 'it' ? 'it' : 'en';
  const m = item.measurement;
  const cat = mainCategory(item);
  const tier = m && !m.error ? m.tier : null;
  const target = `${item.title} ${item.text}`.match(TARGET_RE)?.[0] ?? null;
  const step = (STEP[lang][cat] ?? STEP[lang].generico)(target);
  const price = cat && tier ? config.pricing?.[cat]?.[tier] : null;
  const time = tier ? config.timeline?.[tier] : null;
  const sign = config.signature ?? '';

  if (lang === 'it') {
    return [
      `Ciao, ho letto la richiesta "${item.title}".`,
      '',
      measuredLine('it', m),
      '',
      'Come lavorerei:',
      '1. Misuro il sito attuale (layout, font, animazioni) a desktop e mobile, così si parte da numeri e non da stime.',
      `2. ${step}`,
      '3. Vi consegno il codice con un report di fedeltà: cosa è identico, cosa no e perché.',
      '',
      ...(tier === 'AVANZATA' ? ['Nota onesta: vedo elementi 3D, canvas o video; quelli li valuto a parte, non li prometto identici a scatola chiusa.', ''] : []),
      `Tempi: ${time ?? 'li fisso dopo la misura'}. Prezzo: ${price ?? 'lo fisso dopo la misura'}.`,
      '',
      'Se vi va, vi mando prima un estratto della misura sul vostro sito, gratis.',
      sign,
    ].join('\n').trim();
  }
  return [
    `Hi, I read your request "${item.title}".`,
    '',
    measuredLine('en', m),
    '',
    'How I would work:',
    '1. I measure the current site (layout, fonts, animations) on desktop and mobile, so we start from numbers, not guesses.',
    `2. ${step}`,
    '3. I deliver the code with a fidelity report: what is identical, what is not, and why.',
    '',
    ...(tier === 'AVANZATA' ? ['Honest note: I see 3D, canvas or video elements; I assess those separately and do not promise them identical up front.', ''] : []),
    `Timeline: ${time ?? 'set after the measurement'}. Price: ${price ?? 'set after the measurement'}.`,
    '',
    'If you like, I can first send you an excerpt of the measurement of your site, for free.',
    sign,
  ].join('\n').trim();
}
