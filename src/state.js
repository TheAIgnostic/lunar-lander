// The shared mutable state: the meta-save, the run, the settings, and the
// device singletons every layer reads.
//
// Extracted from main.js in M23. `screenHTML` closed over 26 module-scope
// bindings, which meant the screens could not leave main without threading a
// 26-field context through every one of them - so the state moved first, and
// the screens and the action dispatch simply followed it. This module owns the
// bindings; main.js owns the loop that drives them.
//
// `meta` is the one binding that is *reassigned* (banking a run replaces it),
// so importers read the live binding and writers go through `setMeta` - an ES
// import cannot assign to what it imports.

import { Audio } from './audio.js';
import { Input } from './input.js';
import { Particles } from './particles.js';
import { Ship, DEFAULT_SETTINGS } from './ship.js';
import * as Save from './save.js';
import { STARTER_PASSIVES } from './modules.js';

export const audio = new Audio();
export const input = new Input();
export const particles = new Particles();
export const ship = new Ship();

const loaded = Save.loadMeta();
export let meta = loaded.meta;
export function setMeta(m) { meta = m; }
meta.equipped = meta.equipped || { active: null, passive: STARTER_PASSIVES[0] };
meta.unlockedBlueprints = meta.unlockedBlueprints && meta.unlockedBlueprints.length
  ? meta.unlockedBlueprints : [...STARTER_PASSIVES];
export const saveSource = loaded.source;

export const store = {
  get high() { return meta.classic.high; },
  set high(v) { meta.classic.high = v; Save.saveMeta(meta); },
  get unlocked() { return meta.classic.unlocked; },
  set unlocked(v) { meta.classic.unlocked = Math.max(v, meta.classic.unlocked); Save.saveMeta(meta); },
  get bests() { return meta.classic.bests; },
  setBest(id, v) {
    if (!meta.classic.bests[id] || v > meta.classic.bests[id]) {
      meta.classic.bests[id] = v;
      Save.saveMeta(meta);
    }
  },
};

export const settings = { ...DEFAULT_SETTINGS, ...meta.settings };
input.setBindings(settings.keys);
export function saveSettings() {
  meta.settings = { ...meta.settings, ...settings };
  Save.saveMeta(meta);
  applyPresentation();
}

/**
 * Push the presentation settings into the places that are not redrawn from `g`
 * every frame: the stylesheet, which sizes every overlay screen.
 */
export function applyPresentation() {
  document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale || 1));
  document.documentElement.classList.toggle('high-contrast', !!settings.highContrast);
  document.documentElement.classList.toggle('reduce-motion', (settings.shake || 0) < 0.5);
}
applyPresentation();

export const g = {
  settings,
  state: 'menu',           // menu | select | brief | play | result | crash | gameover | victory | paused | help | settings
  level: null,
  levelIndex: 0,
  endless: false,
  endlessN: 0,
  campaign: 'classic',      // 'classic' = the original 12 | a chapter id = expedition
  run: null,                // active expedition, persisted between sessions
  terrain: null,
  backdrop: null,
  field: null,             // enemies for the current mission, null when it has none
  abilities: null,         // the equipped active module, live for this mission
  cam: { x: 0, y: 0, scale: 1, trauma: 0, tx: 0, ty: 0 },
  score: 0,
  lives: 3,
  combo: 0,
  time: 0,
  levelTime: 0,
  ship,
  compact: false,
  lastResult: null,
  newRecord: false,
  freeze: 0,
  seed: 1,
  forcedSeed: null,   // pinned by ?seed= or __setSeed() so runs are reproducible
  warn: { low: false, crit: false, dry: false },
  token: 0,          // invalidates pending outcome timers when the level changes
};
