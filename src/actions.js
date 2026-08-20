// The action dispatch: what every button and key command *does*.
// Extracted from main.js in M23.
//
// `act` reads the shared state directly, but the flow verbs - starting a
// level, launching, banking a run - belong to the loop in main.js, and
// importing them back from main would put a cycle in a graph that is meant to
// stay a DAG. So main injects them once at startup through `wireFlow`, and the
// dispatch stays a leaf: main knows about actions, actions never knows about
// main.

import * as Log from './gamelog.js';
import * as Save from './save.js';
import { purchase } from './components.js';
import { settleHaul } from './economy.js';
import { chapterFor } from './missions.js';
import { isExpeditionComplete, routeOffers } from './route.js';
import { flightAssist } from './screens.js';
import { STARTER_PASSIVES } from './modules.js';
import { buySkill } from './skills.js';
import { audio, g, input, meta, saveSettings, setMeta, settings, ship } from './state.js';

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
  // --- the playtest log (M24) ------------------------------------------
  // Two ways out, because "copy into chat" and "export" are different jobs:
  // the clipboard for a paste, a file for keeping. Neither reads back into the
  // game, so a browser that refuses the clipboard costs a paste and nothing else.
  if (action === 'log-copy') {
    const text = Log.asText(meta);
    const done = () => flow.toast(`Playtest log copied — ${Log.count()} events.`);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, () => flow.toast('The browser refused the clipboard. Use EXPORT instead.'));
      } else flow.toast('No clipboard here. Use EXPORT instead.');
    } catch { flow.toast('No clipboard here. Use EXPORT instead.'); }
    return;
  }
  if (action === 'log-export' || action === 'log-export-json') {
    const json = action.endsWith('json');
    const body = json ? Log.asJSON(meta) : Log.asText(meta);
    try {
      const blob = new Blob([body], { type: json ? 'application/json' : 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tv-playtest-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${json ? 'json' : 'txt'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      flow.toast(`Exported ${Log.count()} events.`);
    } catch { flow.toast('The browser refused the download.'); }
    return;
  }
  if (action === 'log-clear') { Log.clearLog(); flow.toast('Playtest log cleared.'); flow.renderOverlay(); return; }

  // --- NEW GAME --------------------------------------------------------
  // Erasing everything is one press away from a settings screen, so it arms
  // first and fires second. A refusal that is silent reads as a broken button
  // (M16), and so does a wipe that happens without warning.
  if (action === 'newgame') {
    if (!g.confirmWipe) {
      g.confirmWipe = true;
      flow.toast('This erases every upgrade, skill and record. Press again to confirm.');
      flow.renderOverlay();
      return;
    }
    g.confirmWipe = false;
    setMeta(Save.resetAll(meta));
    meta.equipped = { active: null, passive: STARTER_PASSIVES[0] };
    meta.unlockedBlueprints = [...STARTER_PASSIVES];
    Save.saveMeta(meta);
    Log.clearLog();
    Log.log('new-game');
    g.run = null; g.chapter = null; g.level = null; g.loadoutWindow = false;
    g.score = 0; g.lives = 3; g.combo = 0; g.newRecord = false;
    flow.toast('New game. Everything is back to the beginning.');
    flow.setState('menu');
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
    // M24: the hangar is a *window*, not a shop. You may always walk in and
    // look at what the tracks cost, but salvage is only ever spent at a sector
    // checkpoint - which is the same moment the loadout opens. That is the
    // trade the run economy is built on: a permanent upgrade now, or the
    // modules and skills to survive the next sector.
    if (g.run && !g.loadoutWindow) {
      flow.toast('The hangar only takes work at a sector checkpoint.');
      return;
    }
    if (!g.run) {
      flow.toast('Upgrades are fitted during an expedition, at a checkpoint.');
      return;
    }
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
        // M24: carrying an expedition through all five sectors is what opens
        // mission select. It is the only thing that does.
        if (!meta.gameCompleted) { meta.gameCompleted = true; Save.saveMeta(meta); }
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
    // M24: the classic campaign and the endless run are gone as game modes.
    // The twelve legacy missions stay in `levels.js` because they are the M0
    // physics baseline and both fixtures regress against them - deleting them
    // would delete the only proof the flight model has not drifted. They are
    // simply no longer somewhere a player can go. The refusals are kept rather
    // than the cases deleted, so a stale key binding says why (M16).
    case 'campaign':
    case 'endless':
      flow.toast('There is one game now: the expedition.');
      break;
    case 'select':
      if (g.run) { flow.toast('Finish or abandon the expedition first.'); break; }
      // Mission select is earned by carrying an expedition through all five
      // sectors. Before that it would be a way around the run.
      if (!meta.gameCompleted) {
        flow.toast('Mission select opens when an expedition is carried to the end.');
        break;
      }
      flow.setState('select');
      break;
    // Permanent upgrades belong between expeditions. Refitting mid-run turns a
    // lost lander into a shopping trip, which is the opposite of a roguelite.
    // The one exception is the sector checkpoint, which opens the loadout.
    // The hangar is readable at any time - what it will not do outside a
    // checkpoint is take your salvage. See the `buy:` handler.
    case 'hangar':
      flow.setState('hangar');
      break;
    case 'outfit':
      if (g.run && !g.loadoutWindow) { flow.toast('Loadout is locked until the next sector checkpoint.'); break; }
      flow.setState('outfit');
      break;
    case 'settings':
      g.confirmWipe = false;
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
        g.campaign = 'classic'; g.chapter = null; g.level = null;
        flow.setState('menu');
        break;
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
      flow.startLevel(0);
      break;
    case 'resume': flow.setState('play'); break;
  }
}
