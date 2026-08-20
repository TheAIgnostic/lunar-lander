// The action dispatch: what every button and key command *does*.
// Extracted from main.js in M23.
//
// `act` reads the shared state directly, but the flow verbs - starting a
// level, launching, banking a run - belong to the loop in main.js, and
// importing them back from main would put a cycle in a graph that is meant to
// stay a DAG. So main injects them once at startup through `wireFlow`, and the
// dispatch stays a leaf: main knows about actions, actions never knows about
// main.

import * as Save from './save.js';
import { purchase } from './components.js';
import { settleHaul } from './economy.js';
import { LEVELS } from './levels.js';
import { chapterFor } from './missions.js';
import { isExpeditionComplete, routeOffers } from './route.js';
import { flightAssist } from './screens.js';
import { buySkill } from './skills.js';
import { audio, g, input, meta, saveSettings, setMeta, settings, ship, store } from './state.js';

// The loop's verbs, injected by main.js at startup.
let flow = null;
export function wireFlow(fns) { flow = fns; }

export function act(action) {
  audio.unlock();
  audio.ui();
  if (action.startsWith('chapter:')) {
    flow.beginExpedition(action.slice(8));
    return;
  }
  if (action === 'noop') return;
  if (action.startsWith('skill:')) {
    const res = buySkill(action.slice(6), meta.purchasedSkills, meta.banked.data,
      { enemies: meta.stats.threatsSeen > 0 });
    if (res) {
      meta.purchasedSkills = res.purchased;
      meta.banked.data = res.researchData;
      Save.saveMeta(meta);
      audio.arpeggio([659.25, 880], 0.06);
    }
    flow.renderOverlay();
    return;
  }
  if (action.startsWith('equip:')) {
    const [, kind, id] = action.split(':');
    meta.equipped = { ...meta.equipped, [kind]: meta.equipped[kind] === id ? null : id };
    Save.saveMeta(meta);
    flow.renderOverlay();
    return;
  }
  if (action === 'loan') {
    const assist = flightAssist();
    if (assist && assist.loaner && g.run) {
      g.run.loaner = assist.loaner.id;
      flow.persistRun();
      audio.arpeggio([523.25, 784], 0.07);
    }
    act('retry');
    return;
  }
  if (action === 'keys') { g.rebinding = null; g.rebindNote = null; flow.setState('keys'); return; }
  if (action === 'keys-reset') {
    settings.keys = null;
    input.setBindings(null);
    g.rebinding = null;
    g.rebindNote = 'Every control is back to its default key.';
    saveSettings();
    flow.renderOverlay();
    return;
  }
  if (action.startsWith('rebind:')) {
    g.rebinding = action.slice(7);
    g.rebindNote = null;
    flow.renderOverlay();
    return;
  }
  if (action.startsWith('pick:')) { g.hangarPick = action.slice(5); flow.renderOverlay(); return; }
  if (action.startsWith('buy:')) {
    const id = action.slice(4);
    const result = purchase(id, meta.componentLevels, meta.banked);
    if (result) {
      meta.banked = result.banked;
      meta.componentLevels = result.componentLevels;
      Save.saveMeta(meta);
      audio.arpeggio([523.25, 659.25, 880], 0.07);
    }
    flow.renderOverlay();
    return;
  }
  if (action.startsWith('route:')) {
    const card = (g.routeOffers || [])[+action.slice(6)];
    if (!card || !g.run) return;
    const run = g.run;
    if (g.state === 'checkpoint') {
      // A checkpoint banks everything and restores the expedition. It is also
      // the only place mid-run where the loadout may be changed, so the window
      // closes again the moment the next leg is chosen.
      const settled = settleHaul(run.haul, { completed: true });
      setMeta(Save.bankRun(meta, run, { completed: true, settled, id: `sector-${run.sector}` }));
      Save.saveRun(run);
      Save.saveMeta(meta);
      run.haul = { salvageSafe: 0, salvageCargo: 0, data: 0, cores: 0, materials: {} };
      run.sector++;
      g.lives = run.maxShuttles;
      // Five sectors is an expedition. Reaching the end of the fifth is the
      // win condition the run never had.
      if (isExpeditionComplete(run.sector)) {
        g.lastRunSummary = { missions: run.missionsCleared, chapter: run.chapterId, settled, complete: true };
        run.score = g.score;
        Save.clearRun();
        g.run = null;
        g.loadoutWindow = false;
        flow.setState('expedition-complete');
        return;
      }
    }
    g.loadoutWindow = false;
    run.chapterId = card.planet;
    run.missionIndex = 0;
    run.shuttles = g.lives;
    if (!run.visited.includes(card.planet)) run.visited.push(card.planet);
    g.chapter = chapterFor(card.planet, run.seed + run.sector * 101, run.sector);
    g.campaign = card.planet;
    Save.saveRun(run);
    flow.startLevel(0, false);
    return;
  }
  if (action === 'resume-run') { flow.resumeExpedition(); return; }
  if (action === 'abandon-run') {
    if (g.run) {
      const settled = settleHaul(g.run.haul, { completed: false });
      setMeta(Save.bankRun(meta, g.run, { completed: false, settled, id: 'final' }));
      Save.saveRun(g.run);
    }
    Save.saveMeta(meta);
    Save.clearRun();
    Save.saveMeta(meta);
    Save.clearRun();
    g.run = null; g.chapter = null; g.level = null; g.campaign = 'classic';
    flow.setState('menu');
    return;
  }
  if (action.startsWith('set:')) {
    const [, key, raw] = action.split(':');
    // Numeric settings have to come back as numbers: the option buttons compare
    // against the value with ===, and "0.5" is not 0.5.
    const numeric = raw !== '' && !Number.isNaN(Number(raw));
    settings[key] = raw === 'true' ? true : raw === 'false' ? false : numeric ? Number(raw) : raw;
    saveSettings();
    flow.renderOverlay();
    return;
  }
  if (action.startsWith('go:')) {
    const i = +action.slice(3);
    g.campaign = 'classic';
    g.endless = false;
    g.score = 0; g.lives = 3; g.combo = 0; g.newRecord = false;
    flow.startLevel(i);
    return;
  }
  switch (action) {
    case 'chapters': flow.setState('chapters'); break;
    case 'campaign':
      // Switching modes used to leave the expedition running underneath: the
      // campaign started, `g.run` and `g.chapter` stayed set, and the "classic"
      // mission you were flying was still mars-1. An expedition is left
      // deliberately, through RESUME or ABANDON, or not at all.
      if (g.run) { flow.toast('Finish or abandon the expedition first.'); break; }
      g.campaign = 'classic';
      g.chapter = null;
      g.endless = false;
      g.score = 0; g.lives = 3; g.combo = 0; g.newRecord = false;
      flow.startLevel(Math.min(store.unlocked - 1, LEVELS.length - 1));
      break;
    case 'endless':
      if (g.run) { flow.toast('Finish or abandon the expedition first.'); break; }
      g.campaign = 'classic';
      g.chapter = null;
      g.endless = true;
      g.score = 0; g.lives = 3; g.combo = 0; g.newRecord = false;
      flow.startLevel(LEVELS.length);
      break;
    case 'select':
      if (g.run) { flow.toast('Finish or abandon the expedition first.'); break; }
      flow.setState('select');
      break;
    // Permanent upgrades belong between expeditions. Refitting mid-run turns a
    // lost lander into a shopping trip, which is the opposite of a roguelite.
    // The one exception is the sector checkpoint, which opens the loadout.
    case 'hangar':
      if (g.run) { flow.toast('The hangar is closed while an expedition is under way.'); break; }
      flow.setState('hangar');
      break;
    case 'outfit':
      if (g.run && !g.loadoutWindow) { flow.toast('Loadout is locked until the next sector checkpoint.'); break; }
      flow.setState('outfit');
      break;
    case 'settings':
      if (g.state !== 'keys') g.settingsFrom = g.state;
      g.rebinding = null;
      flow.setState('settings');
      break;
    case 'help': flow.setState('help'); break;
    case 'stats': flow.setState('stats'); break;
    case 'back':
      // Coming out of the loadout during a supply stop returns to the stop,
      // not to the main menu - the expedition is still running.
      if (g.loadoutWindow && g.run) { flow.setState('checkpoint'); break; }
      flow.setState(g.settingsFrom === 'paused' ? 'paused' : 'menu');
      g.settingsFrom = null;
      break;
    case 'launch': flow.launch(); break;
    case 'next':
      if (g.state === 'victory') {
        if (g.chapter) { g.campaign = 'classic'; g.chapter = null; g.level = null; flow.setState('menu'); break; }
        g.endless = true; flow.startLevel(LEVELS.length);
      }
      else flow.startLevel(g.levelIndex + 1);
      break;
    case 'retry':
      // In an expedition you do not get to rewind. Losing the lander replays
      // the mission on the same ground; anything else is a fresh attempt you
      // have to earn. Outside a run, retry is just a retry.
      if (g.run && ship.alive && g.state !== 'crash') {
        flow.toast('No restarts on an expedition. Fly it, or lose the lander.');
        break;
      }
      flow.startLevel(g.levelIndex, !g.run);
      break;
    case 'menu':
      // Bump the token: a landing or a crash may still have a settle timer in
      // flight, and it must not fire into a menu with no level under it.
      g.token++;
      g.level = null;
      flow.setState('menu');
      break;
    case 'restart':
      g.score = 0; g.lives = 3; g.combo = 0; g.newRecord = false;
      flow.startLevel(g.endless ? LEVELS.length : 0);
      break;
    case 'resume': flow.setState('play'); break;
  }
}
