/**
 * cycle.mjs — un ciclo completo, quello che gira su GitHub Actions ogni mezz'ora:
 * stato cifrato → giro → conservazione → bozze rifinite (facoltative) → stato cifrato → dashboard.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadStore, saveStore, purge } from './store.mjs';
import { runScan, describeSources } from './scan.mjs';
import { channelsFromEnv } from './notify.mjs';
import { buildPayload, writeDashboard } from './dashboard.mjs';
import { decryptJson, encryptJson } from './crypto.mjs';
import { draftProposal } from './draft.mjs';

/** L'indirizzo della dashboard su GitHub Pages, se gira su Actions. Puro. */
export function pagesUrl(env) {
  if (env.DASHBOARD_URL) return env.DASHBOARD_URL;
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) return null;
  const [owner, name] = repo.split('/');
  return name.toLowerCase() === `${owner.toLowerCase()}.github.io` ? `https://${name.toLowerCase()}/` : `https://${owner.toLowerCase()}.github.io/${name}/`;
}

/** Gli stati sincronizzati dalla dashboard (branch `stati`). File assente = nessuno stato. */
export function loadStatuses(path, password) {
  if (!path || !existsSync(path)) return {};
  return decryptJson(JSON.parse(readFileSync(path, 'utf8')), password).statuses ?? {};
}

/** Un file di stati vuoto e cifrato, per creare il branch `stati` al primo giro. */
export function writeEmptyStatuses(path, password) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(encryptJson({ version: 1, statuses: {} }, password)));
}

async function polishTop(store, config, env, log) {
  if (!env.ANTHROPIC_API_KEY) return 0;
  const { polishDraft } = await import('./llm.mjs');
  const todo = Object.values(store.items)
    .filter((it) => !it.draftLlm && it.status !== 'scartato' && (it.classification?.score ?? 0) >= (config.llmMinScore ?? 60))
    .sort((a, b) => (b.classification?.score ?? 0) - (a.classification?.score ?? 0))
    .slice(0, config.llmMaxPerRun ?? 3);
  let done = 0;
  for (const it of todo) {
    try { it.draftLlm = await polishDraft({ item: it, draft: draftProposal(it, config) }); done += 1; }
    catch (err) { log(`bozza rifinita non riuscita per ${it.id}: ${err.message}`); break; }
  }
  return done;
}

/**
 * @param {{config: object, env: object, specs: object[], statePath: string, statusesPath?: string,
 *   siteDir?: string, fetchImpl?: typeof fetch, now?: Date, log?: (m: string) => void}} opts
 */
export async function runCycle({ config, env, specs, statePath, statusesPath, siteDir, fetchImpl = fetch, now = new Date(), log = () => {} }) {
  const password = env.RADAR_PASSWORD;
  if (!password) throw new Error('manca RADAR_PASSWORD: aggiungila nei segreti del repository (Settings → Secrets and variables → Actions)');
  const store = loadStore(statePath, { password });
  const dashboardUrl = siteDir ? pagesUrl(env) : null;
  const summary = await runScan({ config, env, store, specs, fetchImpl, now, dashboardUrl, log });
  // gli stati messi dalla dashboard (branch `stati`): un lavoro vinto non scade mai
  const statuses = loadStatuses(statusesPath, password);
  const won = new Set(Object.entries(statuses).filter(([, s]) => s?.status === 'vinto').map(([id]) => id));
  const removed = purge(store, { days: config.retentionDays ?? 60, now, keep: won });
  const polished = await polishTop(store, config, env, log);
  saveStore(statePath, store, { password });

  if (siteDir) {
    const payload = buildPayload(store, {
      config,
      statuses,
      sources: describeSources(specs, env),
      channels: channelsFromEnv(env),
      repo: env.GITHUB_REPOSITORY ?? null,
      cadenceMinutes: config.cadenceMinutes ?? 30,
      now,
    });
    writeDashboard(siteDir, payload, password);
  }
  return { ...summary, removed, polished, items: Object.keys(store.items).length, seen: Object.keys(store.seen).length, dashboardUrl };
}
