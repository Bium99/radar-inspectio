import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../lib/classify.mjs';
import { makeItem } from '../lib/item.mjs';

const now = new Date('2026-10-14T10:00:00Z');
const cfg = { preferredLangs: ['it'], minBudget: 300 };
const item = (title, text = '', extra = {}) => ({ ...makeItem({ source: 'test', url: `https://x.test/${title.length}${text.length}`, title, text }, { now }), ...extra });

test('migrazione in inglese, con sito e budget', () => {
  const c = classify(item('Migrate our Webflow site to Next.js', 'Keep the exact same design. Site: https://acme-studio.com Budget $2,000'), cfg, { now });
  assert.deepEqual(c.categories, ['migrazione', 'rifacimento']);
  assert.equal(c.redFlag, null);
  assert.equal(c.score, 100, '70 categorie + 10 intenzione + 15 sito + 10 budget, tetto 100');
});

test('migrazione in italiano: bonus lingua', () => {
  const c = classify(item('Rifare il sito WordPress in Astro', 'Vogliamo uscire da WordPress e mantenere lo stesso design.'), cfg, { now });
  assert.ok(c.categories.includes('migrazione'));
  assert.ok(c.reasons.some((r) => r.includes('lingua it')));
});

test('animazione rotta', () => {
  const c = classify(item('GSAP ScrollTrigger animation broken on mobile', 'The pinned section stutters on iOS, need a fix.'), cfg, { now });
  assert.deepEqual(c.categories, ['animazioni', 'bug_animazione']);
});

test('bandiera rossa: copiare il sito di un concorrente si scarta sempre', () => {
  const c = classify(item('Clone our competitor website', 'We want to replicate the site of our main competitor, same animations.'), cfg, { now });
  assert.equal(c.redFlag.kind, 'clone_terzi');
  assert.equal(c.score, 0);
});

test('replicare IL PROPRIO sito non è una bandiera rossa', () => {
  const c = classify(item('Replicate our current site in React', 'We own the design; move it off Webflow.'), cfg, { now });
  assert.equal(c.redFlag, null);
  assert.ok(c.categories.includes('migrazione'));
});

test('clonare senza dire di chi è il sito: ambiguo, punteggio dimezzato', () => {
  const base = classify(item('Need a developer for GSAP animations'), cfg, { now }).score;
  const c = classify(item('Need someone to clone this landing with GSAP animations'), cfg, { now });
  assert.equal(c.redFlag.kind, 'ambiguo');
  assert.equal(c.score, Math.round(base / 2));
});

test('impiego a tempo pieno: penalità', () => {
  const c = classify(item('We are hiring: full-time frontend developer, GSAP animations', 'Annual salary and benefits package.'), cfg, { now });
  assert.ok(c.employment);
  assert.equal(c.score, 35 + 10 - 25);
});

test('richiesta fresca: bonus', () => {
  const fresh = classify(item('Looking for a Webflow animations expert', '', { publishedAt: '2026-10-14T09:00:00Z' }), cfg, { now });
  const old = classify(item('Looking for a Webflow animations expert', '', { publishedAt: '2026-10-13T09:00:00Z' }), cfg, { now });
  assert.equal(fresh.score - old.score, 10);
});

test('budget sotto la soglia: penalità', () => {
  const c = classify(item('Fix GSAP animation bug', 'Budget $50'), cfg, { now });
  assert.ok(c.reasons.some((r) => r.includes('sotto 300')));
});

test('chi si offre non è una richiesta, qualunque parola chiave contenga', () => {
  const c = classify(item('Location: Riga, Latvia Remote: Yes Willing to relocate: No Technologies: GSAP, Three.js', 'SEEKING WORK | migrations from Webflow, animations. Résumé: link'), cfg, { now });
  assert.equal(c.supply, true);
  assert.equal(c.score, 0);
  assert.deepEqual(c.categories, []);
  assert.equal(classify(item('Cerco lavoro come sviluppatore Webflow', 'disponibile per progetti'), cfg, { now }).supply, true);
});

test('«seeking freelancer» batte le parole da curriculum', () => {
  const c = classify(item('SEEKING FREELANCER | Remote | GSAP + Three.js landing page', 'Willing to pay well. Send your résumé.'), cfg, { now });
  assert.equal(c.supply, false);
  assert.equal(c.intent, true);
  assert.equal(c.score, 35 + 10);
});

test('un discorso senza richiesta resta sotto la soglia di archivio', () => {
  const c = classify(item('Show HN: a from-scratch web browser for the PSP', 'smooth animations and great performance'), cfg, { now });
  assert.equal(c.intent, false);
  assert.ok(c.score < 20, `punteggio ${c.score}`);
});

test('una fonte di sole richieste porta già l\'intenzione', () => {
  const c = classify({ ...item('Webflow to Next.js migration', 'Contract, 2 months'), demandSource: true }, cfg, { now });
  assert.equal(c.intent, true);
  assert.ok(c.reasons.includes('fonte di sole richieste (+10)'));
});

test('italiano: «cerco sviluppatore … preventivo» è una richiesta', () => {
  const c = classify(item('Cerco sviluppatore per rifare il sito WordPress in Next.js', 'mantenere lo stesso design, mandatemi un preventivo'), cfg, { now });
  assert.equal(c.intent, true);
  assert.ok(c.categories.includes('migrazione'));
});

// ——— casi veri dal collaudo su GitHub Actions del 2026-10-14 ———
const fromBoard = (title, text = '') => ({ ...item(title, text), demandSource: true, jobBoard: true });
const fromMarket = (title, text = '') => ({ ...item(title, text), demandSource: true });

test('collaudo: video, 2D, cartoni e slide non sono animazioni web', () => {
  for (const [title, text] of [
    ['Educational YouTube Video Editor Needed', 'Need a video editor for animated educational videos, after effects.'],
    ['Cartoonish 3D Entertainment Animation', 'Looking for a 3D animator for a cartoon character animation.'],
    ['Photo Edit & Motion Graphics', 'Motion graphics for Instagram reels.'],
    ['Visual Primary Math Google Slides -- 2', 'Animated slides for kids.'],
  ]) {
    const c = classify(fromMarket(title, text), cfg, { now });
    assert.ok(!c.categories.includes('animazioni'), title);
  }
  assert.ok(!classify(fromBoard('2D Artist', 'Create 2D animations and illustrations for slot games.'), cfg, { now }).categories.includes('animazioni'));
});

test('collaudo: animazioni web vere riconosciute', () => {
  assert.ok(classify(fromMarket('React/Vite/Three.js 3D Development Specialist', 'Interactive 3D configurator.'), cfg, { now }).categories.includes('animazioni'));
  assert.ok(classify(fromMarket('Animated Corporate Landing Page Design', 'Modern landing page with scroll animations.'), cfg, { now }).categories.includes('animazioni'));
});

test('collaudo: «convert», «export», «pixel-perfect» in un annuncio qualsiasi non fanno migrazione né rifacimento', () => {
  const c = classify(fromBoard('Senior Shopify Developer', 'Build pixel-perfect themes, export data, convert designs from Figma, improve Core Web Vitals. Full-time.'), cfg, { now });
  assert.ok(!c.categories.includes('migrazione'));
  assert.ok(!c.categories.includes('rifacimento'));
  assert.ok(c.employment);
  const s = classify(fromBoard('Solutions Engineer - French Speaker', 'Help customers migrate their workflows; React knowledge a plus.'), cfg, { now });
  assert.ok(!s.categories.includes('migrazione'));
});

test('collaudo: le migrazioni vere restano migrazioni', () => {
  for (const t of ['Migrate our site from Webflow to Next.js', 'Website migration: WordPress to Astro', 'Move our Framer site to code', 'Migrazione del sito da Wix a WordPress']) {
    assert.ok(classify(fromMarket(t), cfg, { now }).categories.includes('migrazione'), t);
  }
});

test('collaudo: «[For Hire]» si riconosce anche tra parentesi quadre', () => {
  const c = classify(item('[For Hire] Web Designer & Developer | Webflow, Framer, Shopify, WordPress & Custom Website', 'DM me'), cfg, { now });
  assert.equal(c.supply, true);
  assert.equal(c.score, 0);
});

test('collaudo: bacheca senza segnali di contratto = impiego; con «contract» no', () => {
  assert.ok(classify(fromBoard('Webflow Developer', 'Join our team and build our marketing site in Webflow.'), cfg, { now }).employment);
  assert.ok(!classify(fromBoard('Webflow Developer', 'contract, 3 months, hourly rate. Build our marketing site in Webflow.'), cfg, { now }).employment);
});

test('collaudo: progetti Webflow/Framer hanno la loro categoria', () => {
  const c = classify(fromMarket('Bilingual Framer Website Design', 'Design and build a bilingual website in Framer.'), cfg, { now });
  assert.deepEqual(c.categories, ['webflow_framer']);
  assert.equal(c.score, 20 + 10);
});

// ——— quarto collaudo (2026-10-14): Codeur, Freelancer, Himalayas ———
test('collaudo 4: «fixed price», «without lag», «glitch-free» non sono animazioni rotte', () => {
  const c = classify(fromMarket('Fixed price: landing page with GSAP animations', 'Smooth scroll animations without lag or jank. Glitch-free transitions.'), cfg, { now });
  assert.deepEqual(c.categories, ['animazioni']);
  assert.ok(classify(fromMarket('Our GSAP scroll animation is broken on Safari', 'Need someone to fix it.'), cfg, { now }).categories.includes('bug_animazione'));
});

test('collaudo 4: Framer Motion è una libreria, non un sito Framer', () => {
  const c = classify(fromBoard('Frontend Developer (React / Next.js)', 'React, Next.js, Framer Motion, Tailwind. Contract role.'), cfg, { now });
  assert.ok(!c.categories.includes('webflow_framer'));
  assert.ok(c.categories.includes('animazioni'));
});

test('collaudo 4: video, logo, giochi e preventivatori «interattivi» non sono animazioni web', () => {
  for (const [title, text] of [
    ['Une vidéo de présentation pour un site web.', 'Nous voulons une animation pour notre site.'],
    ['Vectorize Logos & Develop Complete Branding', 'Animated logo for the website.'],
    ['Interactive Flooring Quote Tool', 'An interactive tool on our website.'],
    ['Creer un jeu interactif', 'Jeu interactif sur notre site web, animé.'],
    ['Création d\'une plateforme de montage vidéo et motion design en web', 'Plateforme web.'],
  ]) assert.deepEqual(classify(fromMarket(title, text), cfg, { now }).categories, [], title);
  assert.deepEqual(classify(fromMarket('Création d\'un site web dynamique et animé', 'Site vitrine.'), cfg, { now }).categories, ['animazioni']);
});

test('collaudo 4: un segnale solo nominato in un testo lungo vale meno che nel titolo', () => {
  const filler = ' We need a modern responsive website for our travel community with blog, booking and member area.'.repeat(8);
  const body = classify(fromMarket('Modern Global Travel Community Website', `${filler} Built with Webflow, nice animations.`), cfg, { now });
  const title = classify(fromMarket('Webflow website with animations', filler), cfg, { now });
  assert.deepEqual(body.categories, ['animazioni', 'webflow_framer']);
  assert.equal(body.score, 12 + 10 + 10, 'animazione generica 12 + Webflow nominato 10 + fonte di richieste 10');
  assert.equal(title.score, 25 + 20 + 10);
  assert.ok(body.reasons[0].includes('solo nominata nel testo'));
  assert.equal(body.terms.webflow_framer, 'Webflow');
});

// ——— quinto collaudo (2026-10-14): Codeur in francese, annunci chiusi, Framer Motion come competenza ———
test('collaudo 5: il francese non è italiano (niente bonus lingua); «moins de 500 €» è un tetto', () => {
  const it = fromMarket('Recherche développeur Webflow', 'Budget : Moins de 500 € - Catégories : Migration ou refonte de site, CMS. Nous cherchons un développeur pour notre site.');
  assert.equal(it.lang, 'fr');
  assert.equal(it.budget.upTo, true);
  const c = classify(it, cfg, { now });
  assert.ok(!c.reasons.some((r) => r.startsWith('lingua')));
  assert.ok(c.reasons.some((r) => r.includes('al massimo')));
  assert.equal(c.score, 20 + 10 - 10);
});

test('collaudo 5: annunci chiusi fuori, qualunque cosa contengano', () => {
  for (const t of ['Job Filled: GSAP Developer for Cinematic Scroll Experience', '[COMPLETED]Scroll Trigger that updates menu colors', '[Hired] Webflow migration']) {
    const c = classify(fromMarket(t, 'GSAP scroll animations'), cfg, { now });
    assert.equal(c.score, 0, t);
    assert.equal(c.closed, true, t);
  }
  assert.ok(!classify(fromMarket('Found a bug in my GSAP scroll animation, need a fix'), cfg, { now }).closed);
});

test('collaudo 5: Framer Motion o GSAP nell\'elenco delle competenze valgono meno che nel titolo', () => {
  const stack = classify(fromMarket('Claude Code / automatisation IA / Mac', 'Workflow website builder avec Claude Code, composants React, Framer Motion.'), cfg, { now });
  assert.deepEqual(stack.categories, ['animazioni']);
  assert.equal(stack.score, 12 + 10);
  const skills = classify(fromMarket('Creation de sites web', 'React.js ou Vue.js. GSAP ou Framer Motion pour des animations modernes.'), cfg, { now });
  assert.equal(skills.score, 25 + 10);
  assert.ok(!classify(fromMarket('React/Vite/Three.js 3D Development Specialist', 'Debugging visual, positioning, animation, and performance issues.'), cfg, { now }).categories.includes('bug_animazione'));
});
