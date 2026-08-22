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
import { everyMaterial, purchase } from './components.js';
import { settleHaul } from './economy.js';
import { chapterFor } from './missions.js';
import { flightAssist } from './screens.js';
import { ACTIVE_MODULES, PASSIVE_MODULES, STARTER_PASSIVES, equipInto, fitActive, moduleById } from './modules.js';
import { buySkill, skillFeatures } from './skills.js';
import { keyLabel } from './input.js';
import { audio, g, input, meta, saveSettings, setMeta, settings, ship } from './state.js';

// The loop's verbs, injected by main.js at startup.
let flow = null;
export function wireFlow(fns) { flow = fns; }

/**
 * Top the pot up to "you will not run out". Not `Infinity`: the figures are
 * formatted, summed and written to JSON, and one non-finite number would run
 * through all three. 999,999 salvage is about seventy-eight full hangars, which
 * is unlimited in every sense that matters to a test session.
 *
 * Materials are read from the cost tables rather than listed, so M28's
 * re-authoring pass cannot leave a material behind that god mode does not grant.
 * Blueprints too: the route card recommends modules for every body, and a
 * forecast saying "take: Ray Shield, Ice Cleats" is not testable if the switch
 * that unlocks Europa does not also hand over the things it tells you to bring.
 */
const GOD_STOCK = 999999;

function grantEverything() {
  const materials = { ...meta.banked.materials };
  for (const m of everyMaterial()) materials[m] = GOD_STOCK;
  meta.banked = { salvage: GOD_STOCK, data: GOD_STOCK, cores: GOD_STOCK, materials };
  const every = [...Object.keys(ACTIVE_MODULES), ...Object.keys(PASSIVE_MODULES)];
  meta.unlockedBlueprints = [...new Set([...meta.unlockedBlueprints, ...every])];
}

export function act(action) {
  audio.unlock();
  audio.ui();
  if (action.startsWith('chapter:')) {
    // The ladder decides where a run starts (decision 2), so the body named here
    // is ignored - *unless* god mode is on, which is the one thing that switch
    // exists to allow. `beginExpedition` re-checks the flag itself rather than
    // trusting the caller, so a stale button cannot start a run at Venus.
    flow.beginExpedition(action.slice(8));
    return;
  }
  if (action === 'noop') return;
  if (action.startsWith('skill:')) {
    // The lock the hidden menu button used to enforce by accident. Stated here,
    // where the spending happens, exactly as the hangar states it for `buy:`.
    if (!meta.godMode && g.run && !g.loadoutWindow) {
      flow.toast('Research is spent between bodies, at the supply stop.');
      return;
    }
    const res = buySkill(action.slice(6), meta.purchasedSkills, meta.banked.data,
      skillFeatures(meta));
    if (res) {
      meta.purchasedSkills = res.purchased;
      meta.banked.data = res.researchData;
      if (meta.godMode) grantEverything();
      Save.saveMeta(meta);
      audio.arpeggio([659.25, 880], 0.06);
    }
    flow.renderOverlay();
    return;
  }
  if (action.startsWith('equip:')) {
    if (!meta.godMode && g.run && !g.loadoutWindow) {
      flow.toast('The loadout is fixed once an expedition is under way.');
      return;
    }
    const [, kind, id] = action.split(':');
    if (kind === 'active') {
      // **One list, two slots, and the order you pick decides the button.**
      // `fitActive` is the whole rule and lives in `modules.js` so it can be
      // tested without a browser. A full board refuses and says so - the M16
      // rule - rather than silently overwriting a choice somebody made.
      const r = fitActive(meta.equipped, id);
      if (r.full) {
        flow.toast('Both active slots are taken. Tap one to free it.');
        return;
      }
      meta.equipped = r.equipped;
      const mod = moduleById(id);
      if (r.slot) {
        const key = (input.bindings[r.slot === 'active' ? 'ability' : 'ability2'] || [])[0];
        flow.toast(`${mod.name} fitted — ${keyLabel(key || '?')}`);
      }
    } else {
      meta.equipped = equipInto(meta.equipped, kind, id);
    }
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

  // --- GOD MODE (test switch) ------------------------------------------
  //
  // What it does is deliberately narrow: it hands over **resources and a
  // starting position**, and nothing else. It does not touch the simulation,
  // the landing bands, the damage numbers or the terrain, because a test build
  // that flies differently from the real one cannot answer "does this feel
  // right?" - which is the only question the playtest log exists to serve.
  //
  // Everything it grants is bought through the same `purchase()` and
  // `buySkill()` the player uses, so an upgrade fitted under god mode is the
  // same upgrade. That is what makes it useful for testing the later bodies
  // rather than a separate code path to debug.
  //
  // It is **stamped into the playtest log's header**, on purpose. Tom pastes
  // that log into chat, and a run flown with 999,999 salvage and a start at
  // Venus is not a normal run - the log has to say so without being asked.
  if (action === 'god') {
    const on = !meta.godMode;
    meta.godMode = on;
    if (on) grantEverything();
    Save.saveMeta(meta);
    Log.log('god-mode', { on: on ? 1 : 0 });
    flow.toast(on
      ? 'God mode on. Every body is startable, resources are topped up, and the playtest log now says so.'
      : 'God mode off. What you already bought stays bought.');
    flow.renderOverlay();
    return;
  }

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
    meta.equipped = { active: null, active2: null, passive: STARTER_PASSIVES[0] };
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
    // look at what the tracks cost, but salvage is only ever spent in the
    // window between bodies - the same moment the loadout opens. That is the
    // trade the run economy is built on: a permanent upgrade now, or the
    // modules and skills to survive the next body.
    // God mode opens the window too. Without that the switch grants a pot it
    // cannot spend - the whole point is fitting upgrades to test the later
    // bodies with, and outside a supply stop the hangar refuses every one of
    // them. The refusals themselves are untouched: turn god mode off and the
    // window closes again exactly as it did.
    if (!meta.godMode) {
      if (g.run && !g.loadoutWindow) {
        flow.toast('The hangar only takes work between bodies.');
        return;
      }
      if (!g.run) {
        flow.toast('Upgrades are fitted during an expedition, in the window between bodies.');
        return;
      }
    }
    const id = action.slice(4);
    const result = purchase(id, meta.componentLevels, meta.banked);
    if (result) {
      meta.banked = result.banked;
      meta.componentLevels = result.componentLevels;
      if (meta.godMode) grantEverything();
      Save.saveMeta(meta);
      audio.arpeggio([523.25, 659.25, 880], 0.07);
    }
    flow.renderOverlay();
    return;
  }
  if (action.startsWith('route:')) {
    const card = (g.routeOffers || [])[+action.slice(6)];
    if (!card || !g.run) return;
    // No replay (M27, Tom's decision 3). `routeChoices` returns only the next
    // body, so there should be no index that reaches a cleared one - this is
    // the belt to that braces, and it keeps a stale `g.routeOffers` left over
    // from a previous screen from putting the run back onto ground it has
    // already flown.
    if (!card.isNext) return;
    const run = g.run;
    if (g.state === 'checkpoint') {
      // The haul was banked on the way *in* to the supply stop (main.js), so
      // that the hangar and the loadout open on money that is actually there.
      // All that is left here is advancing the leg. (Shuttles are not restored
      // anywhere any more - M27 attrits them.)
      run.sector++;
    }
    g.loadoutWindow = false;
    run.chapterId = card.planet;
    run.missionIndex = 0;
    run.shuttles = g.lives;
    if (!run.visited.includes(card.planet)) run.visited.push(card.planet);
    g.chapter = chapterFor(card.planet, run.seed + run.sector * 101);
    g.campaign = card.planet;
    Save.saveRun(run);
    flow.startLevel(0, false);
    return;
  }
  if (action === 'resume-run') { flow.resumeExpedition(); return; }
  // **Ending a run is ending a run** - Tom, 2026-08-21. Abandoning used to bank
  // the haul, pay M13's debrief floor and keep the skills, the resources and the
  // opened map, where dying pays the floor and takes all three. That made
  // abandoning strictly better than dying, and the floor farmable: start,
  // abandon, repeat, and five cycles bank 300 salvage and 200 research for
  // nothing. 40 research is the cheapest skill rank.
  //
  // It goes through the same door as a death now. The run is resumable, so
  // abandoning is never how you stop playing - it is how you give up on a run.
  if (action === 'abandon-run') {
    if (!g.confirmAbandon) {
      g.confirmAbandon = true;
      flow.toast('Ending the expedition costs the skills, the salvage and the research, exactly like losing it. Press again to confirm.');
      flow.renderOverlay();
      return;
    }
    g.confirmAbandon = false;
    if (g.run) {
      // Score first: `bankRun` reads `run.score` for the career best, and the
      // last `persistRun` may be several screens old by the time this fires.
      g.run.score = g.score;
      const settled = settleHaul(g.run.haul, { completed: false });
      g.lastRunSummary = { missions: g.run.missionsCleared, chapter: g.run.chapterId, settled, wiped: true, abandoned: true };
      setMeta(Save.bankRun(meta, g.run, { completed: false, settled, id: 'final' }));
      Save.saveRun(g.run);
      Log.log('run-abandoned', { sector: g.run.sector, missions: g.run.missionsCleared });
      setMeta(Save.wipeForDeath(meta, { debrief: settled.debrief }));
    }
    Save.saveMeta(meta);
    Save.clearRun();
    g.run = null; g.chapter = null; g.level = null; g.campaign = 'classic';
    g.loadoutWindow = false;
    flow.setState('expedition-over');
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
    // **Readable always, spendable only in the window** - the same shape as the
    // hangar above, and it was not. M24 un-hid the hangar and left the loadout
    // hidden, so from then until M29d the skill tree simply vanished from the
    // menu for the length of an expedition, along with the only place research
    // data is shown at all (M29a took it off the hangar screen because the
    // hangar cannot spend it). Tom went looking for the button.
    //
    // The lock has not moved: skills and modules still cannot be changed
    // mid-expedition, which is M16's rule that a run is committed once begun.
    // What changed is that the refusal is now *audible* and the screen can be
    // read - a button that is simply absent is worse than one that says why,
    // which is the other half of the same M16 rule.
    case 'outfit':
      flow.setState('outfit');
      break;
    case 'settings':
      g.confirmWipe = false;
      g.confirmAbandon = false;
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
      g.confirmAbandon = false;
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
