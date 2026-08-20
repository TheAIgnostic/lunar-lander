// Every overlay screen, as HTML. Extracted from main.js in M23.
//
// Presentation only: this module reads the shared state and returns markup.
// What a button *does* lives in the action dispatch, wired through the
// `data-action` attribute `btn()` stamps on it - so this file changes when a
// screen changes, and the game flow does not.

import * as R from './render.js';
import * as Save from './save.js';
import { COMPONENTS, COMPONENT_IDS, purchaseCheck } from './components.js';
import { describeThreats } from './enemies.js';
import { ACTIONS, keyLabel } from './input.js';
import { LANDING, capsFor } from './landing.js';
import { LEVELS, WORLDS } from './levels.js';
import { CHAPTERS, chapterTitle } from './missions.js';
import { ACTIVE_MODULES, PASSIVE_MODULES, moduleById, recommendedFor } from './modules.js';
import { cargoFor } from './objectives.js';
import { planetIcon } from './planeticons.js';
import { PLANETS, gravityFor } from './planets.js';
import { SECTORS, routeOffers } from './route.js';
import { ENVELOPE, normalizeAngle } from './ship.js';
import { TREES, TREE_IDS, skillCheck } from './skills.js';
import { audio, g, input, meta, saveSource, settings, ship, store } from './state.js';
import { DEG, formatScore } from './util.js';

export const btn = (action, text, primary = false, key = '') =>
  `<button class="btn${primary ? ' primary' : ''}" data-action="${action}">${text}${key ? `<span class="key">${key}</span>` : ''}</button>`;

export function drawHangarPreview() {
  const c = document.getElementById('hangar-view');
  if (!c) return;
  const cx = c.getContext('2d');
  const grd = cx.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, '#070d1a');
  grd.addColorStop(1, '#05060c');
  cx.fillStyle = grd;
  cx.fillRect(0, 0, c.width, c.height);
  cx.strokeStyle = 'rgba(95,245,255,0.10)';
  cx.lineWidth = 1;
  for (let y = 40; y < c.height; y += 40) {
    cx.beginPath(); cx.moveTo(0, y); cx.lineTo(c.width, y); cx.stroke();
  }
  R.drawHangarShip(cx, c.width / 2, c.height / 2 + 10, 4.2, meta.componentLevels, g.hangarPick || 'gear', g.time);
}

export function screenHTML(s) {
  switch (s) {
    case 'menu':
      const pending = Save.loadRun();
      const chapterName = pending ? chapterTitle(pending.chapterId) : null;
      return `<div class="screen menu">
        <h1 class="title">TERMINAL<span>VELOCITY</span></h1>
        <p class="tag">A vector lander. Finite fuel. One shot at the pad.</p>
        ${saveSource === 'corrupt' ? '<div class="notice">A damaged save was set aside and progress reset. The old data is kept under <b>tv_save_corrupt</b>.</div>' : ''}
        ${saveSource === 'newer' ? '<div class="notice">This save was written by a newer build, so it was left untouched.</div>' : ''}
        <div class="stats"><span>HIGH SCORE</span><b>${formatScore(store.high)}</b></div>
        ${chapterName ? `<div class="stats"><span>IN PROGRESS</span><b>${chapterName} · mission ${pending.missionIndex + 1} · ${pending.shuttles} left</b></div>` : ''}
        <div class="btns">
          ${chapterName ? btn('resume-run', 'RESUME EXPEDITION', true, 'SPACE') : ''}
          ${btn('chapters', 'EXPEDITION', !chapterName, chapterName ? '' : 'SPACE')}
          ${chapterName || g.run ? '' : btn('campaign', 'CLASSIC CAMPAIGN')}
          ${chapterName || g.run ? '' : btn('select', 'MISSIONS')}
          ${chapterName || g.run ? '' : btn('endless', 'ENDLESS RUN')}
          ${chapterName || g.run ? btn('abandon-run', 'ABANDON EXPEDITION') : ''}
          ${btn('help', 'HOW TO FLY')}
          ${chapterName || g.run ? '' : btn('hangar', 'HANGAR')}
          ${chapterName || g.run ? '' : btn('outfit', 'LOADOUT')}
          ${btn('stats', 'LOGBOOK')}
          ${btn('settings', 'SETTINGS')}
        </div>
        <div class="foot">${audio.muted ? '🔇' : '🔊'} press M to ${audio.muted ? 'unmute' : 'mute'}</div>
      </div>`;

    case 'help':
      return `<div class="screen">
        <h2>HOW TO FLY</h2>
        <div class="keys">
          <div><kbd>SPACE</kbd><kbd>W</kbd><kbd>↑</kbd><span>Main booster, pushes along the nose</span></div>
          <div><kbd>A</kbd><kbd>←</kbd><span>Left attitude burner (rotates you)</span></div>
          <div><kbd>D</kbd><kbd>→</kbd><span>Right attitude burner</span></div>
          <div><kbd>S</kbd><kbd>↓</kbd><span>Attitude hold, burns fuel to kill spin</span></div>
          <div><kbd>E</kbd><kbd>Q</kbd><span>Fire the equipped active module</span></div>
          <div><kbd>R</kbd><span>Retry</span><kbd>P</kbd><span>Pause</span><kbd>M</kbd><span>Mute</span></div>
        </div>
        <p class="body">Prefer arrows that just move the lander? <b>Settings → Steering → Direct</b> turns the
        side burners into sideways thrusters and keeps the hull upright, so left means left with no attitude
        to manage. Classic rotation can also be inverted there.</p>
        <div class="keys">
        </div>
        <p class="body">Land with <b>both legs</b> inside a flashing pad. Keep descent under
        <b>${(ENVELOPE.GOOD.vy / 6).toFixed(1)}</b>, drift under <b>${(ENVELOPE.GOOD.vx / 6).toFixed(1)}</b>
        and tilt inside the green arc. Smaller pads pay bigger multipliers, and leftover fuel is worth points, so
        so is a landing streak. Three lander losses ends the run.</p>
        <p class="body">Miss the pad and a clean touchdown on <b>level ground</b> still survives, at the base
        rate with the streak broken. Steep ground, a hard arrival, the hull touching first, or the ice
        ceiling on Europa. Those are all wreckage.</p>
        <p class="body">Some ground is defended. Old security machines <b>telegraph every shot</b>: a
        line locks on and a ring closes before anything is fired. Hits cost <b>hull</b>, not control.
        Terrain is cover, a turret cannot shoot at something sitting on top of it, and every mission
        keeps one pad no machine can reach. Destroying them pays, but it is never the way through.</p>
        <div class="btns">${btn('back', 'BACK', true, 'SPACE')}</div>
      </div>`;

    case 'select': {
      const bests = store.bests;
      const tiles = LEVELS.map((l, i) => {
        const locked = i + 1 > store.unlocked;
        const b = bests[l.id];
        return `<button class="tile${locked ? ' locked' : ''}" data-action="go:${i}" ${locked ? 'disabled' : ''}>
          <span class="num">${String(l.id).padStart(2, '0')}</span>
          <span class="world" style="color:${WORLDS[l.world].accent}">${l.world}</span>
          <span class="name">${locked ? 'LOCKED' : l.title}</span>
          <span class="best">${b ? formatScore(b) : '—'}</span>
        </button>`;
      }).join('');
      return `<div class="screen wide">
        <h2>MISSIONS</h2>
        <div class="grid">${tiles}</div>
        <div class="btns">${btn('endless', 'ENDLESS RUN')}${btn('back', 'BACK', true)}</div>
      </div>`;
    }

    case 'brief': {
      const l = g.level;
      const acc = WORLDS[l.world].accent;
      const padList = g.terrain.pads.map((p) => `x${p.mult}`).join(' · ');
      return `<div class="screen">
        <div class="eyebrow" style="color:${acc}">${l.world} · MISSION ${g.endless ? g.endlessN : l.id}</div>
        <h2>${l.title}</h2>
        <p class="body">${l.brief}</p>
        <div class="specs">
          <div><span>GRAVITY</span><b>${(l.gravity / 6).toFixed(1)} m/s²</b></div>
          <div><span>FUEL</span><b>${l.fuel}</b></div>
          <div><span>PADS</span><b>${padList}</b></div>
          <div><span>HAZARD</span><b>${l.cave ? 'ICE CEILING' : l.wind ? 'WIND ' + Math.abs(l.wind / 6).toFixed(0) : 'NONE'}</b></div>
        </div>
        ${cargoFor(l) ? `<div class="objective"><span>RECOVERY</span> The ${cargoFor(l).label.toLowerCase()}
          is out past the far landing zone. Nothing is stopping you landing short and going home instead.</div>` : ''}
        ${threatBrief()}
        ${l.optionalObjective ? `<div class="objective"><span>OPTIONAL</span> ${l.optionalObjective.text}</div>` : ''}
        <div class="btns">${btn('launch', 'LAUNCH', true, 'SPACE')}${btn('menu', 'ABORT')}</div>
      </div>`;
    }

    case 'result': {
      const r = g.lastResult;
      const color = r.offPad ? '#ffb347' : r.q === 'PERFECT' ? '#4dff9f' : r.q === 'GOOD' ? '#5ff5ff' : '#ffb347';
      const head = r.offPad ? 'DOWN SAFE, OFF PAD' : `${r.q} LANDING`;
      return `<div class="screen">
        <div class="verdict" style="color:${color};text-shadow:0 0 30px ${color}">${head}</div>
        ${r.offPad ? '<p class="body">Level ground held the legs. There is no bonus off the pad, and the streak resets.</p>' : ''}
        ${r.detail ? metricsTable(r.detail) : ''}
        ${r.objective ? `<div class="objective${r.objective.met ? ' met' : ''}">
          <span>${r.objective.met ? 'OBJECTIVE MET' : 'OBJECTIVE'}</span> ${r.objective.text}
          · <b>${r.objective.progress}</b>${r.objective.met && r.objective.reward
            ? ` · +${Object.entries(r.objective.reward).map(([k, v]) => `${v} ${k}`).join(', ')}` : ''}</div>` : ''}
        ${haulPanel(r)}
        ${r.combat ? `<div class="objective"><span>THREATS</span>
          ${r.combat.total} on this ground · ${r.combat.kills} destroyed ·
          ${r.combat.hitsTaken} hit${r.combat.hitsTaken === 1 ? '' : 's'} taken ·
          hull ${Math.round((r.hull / r.hullMax) * 100)}%${r.combatSalvage ? ` · +${r.combatSalvage} salvage` : ''}</div>` : ''}
        <table class="score">
          <tr><td>${r.offPad ? 'Open ground x1' : `Pad x${r.mult}`} · quality x${r.qf.toFixed(1)}</td><td>${formatScore(r.landing)}</td></tr>
          <tr><td>Fuel remaining ${r.fuel.toFixed(0)}</td><td>${formatScore(r.fuelPts)}</td></tr>
          <tr><td>Streak multiplier</td><td>x${r.comboMult.toFixed(2)}</td></tr>
          <tr class="tot"><td>MISSION TOTAL</td><td>${formatScore(r.total)}</td></tr>
          <tr class="run"><td>RUN SCORE</td><td>${formatScore(g.score)}</td></tr>
        </table>
        <div class="btns">${btn('next', 'NEXT MISSION', true, 'SPACE')}${btn('retry', 'REPLAY', false, 'R')}${btn('menu', 'MENU')}</div>
      </div>`;
    }

    case 'crash': {
      const assist = flightAssist();
      return `<div class="screen">
        <div class="verdict bad">LANDER LOST</div>
        <p class="body">${crashReason()}</p>
        <div class="stats"><span>SHUTTLES LEFT</span><b>${g.lives}</b></div>
        ${g.carried && g.carried.nodes ? `<div class="stats lost"><span>CARGO LOST</span><b>${g.carried.material} MATERIAL · ${g.carried.salvage} SALVAGE</b></div>` : ''}
        ${g.run ? '<p class="body">The same ground, the same seed. Fly it again knowing what it does.</p>' : ''}
        ${assist ? `<div class="objective assist"><span>FLIGHT ASSIST</span> ${assist.tip}</div>` : ''}
        <div class="btns">${btn('retry', 'TRY AGAIN', true, 'SPACE')}${
          assist && assist.loaner ? btn('loan', `TAKE THE ${assist.loaner.name}`) : ''
        }${btn(g.run ? 'abandon-run' : 'menu', g.run ? 'ABANDON' : 'MENU')}</div>
      </div>`;
    }

    case 'gameover':
      return `<div class="screen">
        <div class="verdict bad">MISSION OVER</div>
        <div class="stats big"><span>FINAL SCORE</span><b>${formatScore(g.score)}</b></div>
        ${g.newRecord ? '<div class="record">NEW RECORD</div>' : `<div class="stats"><span>BEST</span><b>${formatScore(store.high)}</b></div>`}
        <div class="btns">${btn('restart', 'NEW RUN', true, 'SPACE')}${btn('menu', 'MENU')}</div>
      </div>`;

    case 'victory':
      return `<div class="screen">
        <div class="verdict" style="color:#4dff9f;text-shadow:0 0 30px #4dff9f">${g.chapter ? 'CHAPTER COMPLETE' : 'PROGRAM COMPLETE'}</div>
        <p class="body">${g.chapter
          ? `${chapterTitle(g.campaign)} is surveyed. Five landings, and the lander still flies.`
          : 'All twelve missions flown. The unsurveyed sectors are open, and they do not end.'}</p>
        <div class="stats big"><span>SCORE</span><b>${formatScore(g.score)}</b></div>
        <div class="btns">${btn('next', 'ENTER ENDLESS', true, 'SPACE')}${btn('menu', 'MENU')}</div>
      </div>`;

    case 'chapters': {
      const cards = Object.values(CHAPTERS).map((ch) => {
        const p = PLANETS[ch.planet];
        const acc = WORLDS[p.world].accent;
        return `<button class="tile chapter" data-action="chapter:${ch.planet}">
          <span class="world" style="color:${acc}">${p.displayName}</span>
          <span class="name">${ch.levels.length} MISSIONS</span>
          <span class="best">${p.summary}</span>
          <span class="best">gravity ${(gravityFor(ch.planet) / 6).toFixed(2)} m/s² · ${p.atmosphere} atmosphere${p.hazards.length ? ' · ' + p.hazards.join(', ') : ''}</span>
        </button>`;
      }).join('');
      return `<div class="screen wide">
        <h2>EXPEDITION</h2>
        <p class="tag">Choose a body. Five missions, escalating from introduction to mastery.</p>
        <div class="grid chapters">${cards}</div>
        <div class="btns">${btn('back', 'BACK', true, 'SPACE')}</div>
      </div>`;
    }

    case 'settings': {
      const opt = (key, value, title, blurb) => `
        <button class="opt${settings[key] === value ? ' on' : ''}" data-action="set:${key}:${value}">
          <span class="opt-title">${title}</span>
          <span class="opt-blurb">${blurb}</span>
        </button>`;
      return `<div class="screen">
        <h2>SETTINGS</h2>
        <div class="setting">
          <div class="setting-name">STEERING</div>
          <div class="opts">
            ${opt('steering', 'classic', 'CLASSIC', 'Side burners rotate the lander. Point the nose, then burn. The 1969 problem, and the only way to fly the tight pads well.')}
            ${opt('steering', 'direct', 'DIRECT', 'Side burners push the lander sideways and the hull stays upright. Left means left on its own, no attitude to manage.')}
          </div>
        </div>
        <div class="setting${settings.steering === 'direct' ? ' dimmed' : ''}">
          <div class="setting-name">ROTATION${settings.steering === 'direct' ? ' (classic only)' : ''}</div>
          <div class="opts">
            ${opt('invertRotation', false, 'NORMAL', 'Left burner tips the nose left, so left plus booster drifts you left.')}
            ${opt('invertRotation', true, 'INVERTED', 'Left burner tips the nose right. Some pilots read the stick the other way round.')}
          </div>
        </div>
        <div class="setting">
          <div class="setting-name">MOTION</div>
          <div class="opts">
            ${opt('shake', 1, 'FULL SHAKE', 'The camera kicks on impacts, hard burns and hits.')}
            ${opt('shake', 0.5, 'REDUCED', 'Half the movement. Still readable as force, far less motion.')}
            ${opt('shake', 0, 'NONE', 'The camera never shakes. Nothing else changes.')}
          </div>
        </div>
        <div class="setting">
          <div class="setting-name">FLASHING</div>
          <div class="opts">
            ${opt('flash', 1, 'FULL', 'Alarms pulse, beacons strobe, telegraphs throb.')}
            ${opt('flash', 0.35, 'REDUCED', 'The same warnings, held much steadier.')}
            ${opt('flash', 0, 'STEADY', 'No pulsing at all. Warnings stay lit instead.')}
          </div>
        </div>
        <div class="setting">
          <div class="setting-name">INSTRUMENT SIZE</div>
          <div class="opts">
            ${opt('uiScale', 0.85, 'COMPACT', 'Smaller panels, more sky.')}
            ${opt('uiScale', 1, 'NORMAL', 'The standard instrument panel.')}
            ${opt('uiScale', 1.25, 'LARGE', 'Bigger readouts and bigger text everywhere.')}
          </div>
        </div>
        <div class="setting">
          <div class="setting-name">CONTRAST</div>
          <div class="opts">
            ${opt('highContrast', false, 'STANDARD', 'Pads and threats in their usual colours.')}
            ${opt('highContrast', true, 'HIGH', 'Pads outlined and labelled, threats ringed and lettered, so every marker reads without relying on colour.')}
          </div>
        </div>
        <div class="setting">
          <div class="setting-name">CONTROLS</div>
          <div class="opts">
            <button class="opt" data-action="keys">
              <span class="opt-title">REBIND KEYS</span>
              <span class="opt-blurb">${ACTIONS.map((a) => keyLabel(input.bindings[a][0])).join(' · ')}</span>
            </button>
          </div>
        </div>
        <div class="btns">${btn('back', 'DONE', true, 'SPACE')}</div>
      </div>`;
    }

    case 'keys': {
      const names = {
        thrust: 'MAIN BOOSTER', left: 'LEFT BURNER', right: 'RIGHT BURNER',
        hold: 'ATTITUDE HOLD', ability: 'ACTIVE MODULE',
      };
      const rows = ACTIONS.map((a) => {
        const listening = g.rebinding === a;
        return `<button class="opt keyrow${listening ? ' on' : ''}" data-action="rebind:${a}">
          <span class="opt-title">${names[a]}</span>
          <span class="opt-blurb">${listening ? 'press any key…' : input.bindings[a].map(keyLabel).map((k) => `<kbd>${k}</kbd>`).join(' ')}</span>
        </button>`;
      }).join('');
      return `<div class="screen">
        <h2>CONTROLS</h2>
        <p class="body">Pick a control, then press the key you want on it. Retry, pause, mute and
        escape stay where they are, so the menu is always reachable.</p>
        <div class="setting"><div class="opts keys-list">${rows}</div></div>
        ${g.rebindNote ? `<div class="notice">${g.rebindNote}</div>` : ''}
        <div class="btns">${btn('keys-reset', 'RESET TO DEFAULT')}${btn('settings', 'DONE', true, 'SPACE')}</div>
      </div>`;
    }

    case 'stats': {
      const st = meta.stats;
      const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');
      const flights = st.attempts || (st.landings + st.crashes);
      const efficiency = st.fuelCarried > 0
        ? `${Math.round((1 - st.fuelBurned / st.fuelCarried) * 100)}% left on average` : '—';

      const row = (name, value, note = '') =>
        `<tr><td>${name}</td><td class="m-val">${value}</td><td class="m-w">${note}</td></tr>`;

      const bodies = Object.entries(st.bodies || {})
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${chapterTitle(id)} ×${n}`).join(' · ') || 'none yet';

      const graded = Object.entries(st.missionGrades || {});
      const perfectRuns = graded.filter(([, v]) => v === 'PERFECT').length;

      const modules = Object.entries(st.moduleFlights || {})
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([id, n]) => {
          const m = moduleById(id);
          const used = (st.moduleUses || {})[id];
          return `${m ? m.name : id} ×${n}${used ? ` (fired ${used})` : ''}`;
        }).join(' · ') || 'none yet';

      const threatTotal = st.threatsDestroyed + st.threatsPassed;

      return `<div class="screen wide">
        <div class="eyebrow" style="color:#5ff5ff">LOGBOOK</div>
        <h2>STATISTICS</h2>
        <table class="metrics stats-table">
          ${row('Missions flown', formatScore(flights))}
          ${row('Landed', formatScore(st.landings), pct(st.landings, flights))}
          ${row('Lost', formatScore(st.crashes), pct(st.crashes, flights))}
          ${row('Perfect landings', formatScore(st.perfect), pct(st.perfect, st.landings))}
          ${row('Fuel efficiency', efficiency)}
          ${row('Time flown', `${Math.round(st.flightSeconds / 60)} min`)}
          ${row('Chapters cleared', bodies)}
          ${row('Missions at PERFECT', `${perfectRuns} of ${graded.length} flown`)}
          ${row('Best score', formatScore(Math.max(st.bestScore, meta.classic.high)))}
          ${row('Threats met', formatScore(st.threatsSeen), st.threatsSeen ? 'under fire' : '')}
          ${row('Threats destroyed', formatScore(st.threatsDestroyed), pct(st.threatsDestroyed, threatTotal))}
          ${row('Threats flown past', formatScore(st.threatsPassed), pct(st.threatsPassed, threatTotal))}
          ${row('Hits taken', formatScore(st.hitsTaken))}
          ${row('Most-flown gear', modules)}
        </table>
        <div class="btns">${btn('back', 'DONE', true, 'SPACE')}</div>
      </div>`;
    }

    case 'outfit': {
      const data = meta.banked.data;
      // The tree opens once something has actually shot at you.
      const features = { enemies: meta.stats.threatsSeen > 0 };
      const trees = TREE_IDS.map((tid) => {
        const tree = TREES[tid];
        const nodes = tree.nodes.map((n) => {
          const rank = meta.purchasedSkills[n.id] || 0;
          const chk = skillCheck(n.id, meta.purchasedSkills, data, features);
          const cls = rank >= n.ranks ? ' maxed' : chk.ok ? ' can' : '';
          return `<button class="node${cls}" data-action="skill:${n.id}" ${chk.ok ? '' : 'disabled'}>
            <span class="node-name">${n.name} <i>${rank}/${n.ranks}</i></span>
            <span class="node-eff">${n.describe(Math.max(1, rank))}</span>
            <span class="node-cost">${rank >= n.ranks ? 'complete' : chk.ok ? `${chk.cost} data` : chk.reason}</span>
          </button>`;
        }).join('');
        // A tree is only dimmed while its feature is genuinely locked. Once
        // something has shot at you, Combat Systems reads like any other tree.
        const locked = tree.nodes.some((n) => n.requiresFeature && !features[n.requiresFeature]);
        return `<div class="tree${locked ? ' gated' : ''}">
          <div class="tree-name">${tree.name}</div>
          <div class="tree-blurb">${locked ? tree.gated : tree.blurb}</div>
          ${nodes}
        </div>`;
      }).join('');

      const slot = (map, kind) => Object.values(map).map((mod) => {
        const owned = meta.unlockedBlueprints.includes(mod.id);
        const on = (meta.equipped[kind] === mod.id);
        return `<button class="tile mod${on ? ' on' : ''}${owned ? '' : ' locked'}"
            data-action="${owned ? `equip:${kind}:${mod.id}` : 'noop'}" ${owned ? '' : 'disabled'}>
          <span class="world">${mod.name}</span>
          <span class="best">${owned ? mod.blurb : 'Blueprint not yet recovered.'}</span>
        </button>`;
      }).join('');

      return `<div class="screen wide">
        <div class="eyebrow" style="color:#5ff5ff">LOADOUT</div>
        <h2>SKILLS AND MODULES</h2>
        <div class="stats"><span>RESEARCH DATA</span><b>${formatScore(data)}</b></div>
        <div class="trees">${trees}</div>
        <div class="setting"><div class="setting-name">ACTIVE MODULE</div><div class="grid comps">${slot(ACTIVE_MODULES, 'active')}</div></div>
        <div class="setting"><div class="setting-name">PASSIVE MODULE</div><div class="grid comps">${slot(PASSIVE_MODULES, 'passive')}</div></div>
        <div class="btns">${btn('back', 'DONE', true, 'SPACE')}</div>
      </div>`;
    }

    case 'hangar': {
      const b = meta.banked;
      const sel = g.hangarPick || 'gear';
      const comp = COMPONENTS[sel];
      const level = Math.max(1, meta.componentLevels[sel] || 1);
      const check = purchaseCheck(sel, meta.componentLevels, b);
      const cur = comp.levels[level - 1];
      const next = level < 4 ? comp.levels[level] : null;
      const mats = Object.entries(b.materials || {}).filter(([, v]) => v > 0);

      const tabs = COMPONENT_IDS.map((id) => {
        const lv = Math.max(1, meta.componentLevels[id] || 1);
        return `<button class="tile comp${id === sel ? ' on' : ''}" data-action="pick:${id}">
          <span class="world">${COMPONENTS[id].name}</span>
          <span class="pips">${'▮'.repeat(lv)}${'▯'.repeat(4 - lv)}</span>
        </button>`;
      }).join('');

      return `<div class="screen wide hangar">
        <div class="eyebrow" style="color:#5ff5ff">HANGAR</div>
        <h2>${comp.name} · LEVEL ${level}</h2>
        <div class="hangar-grid">
          <canvas id="hangar-view" width="340" height="300"></canvas>
          <div class="hangar-detail">
            <p class="body">${comp.blurb}</p>
            <table class="score">
              <tr><td>Now</td><td>${cur.describe}</td></tr>
              ${next ? `<tr class="tot"><td>Next</td><td>${next.describe}</td></tr>` : '<tr class="tot"><td>Next</td><td>—</td></tr>'}
            </table>
            ${next ? `<div class="cost">
              <span>COST</span> ${next.cost.salvage} salvage${Object.entries(next.cost.materials || {}).map(([m, v]) => ` · ${v} ${m}`).join('')}
            </div>` : ''}
            ${check.ok
              ? btn(`buy:${sel}`, 'INSTALL', true)
              : `<div class="notice">${check.reason}</div>`}
          </div>
        </div>
        <div class="grid comps">${tabs}</div>
        <div class="stats"><span>BANKED</span><b>${formatScore(b.salvage)} salvage · ${formatScore(b.data)} data · ${b.cores} cores</b></div>
        ${mats.length ? `<div class="mats">${mats.map(([m, v]) => `<span>${v} <i>${m}</i></span>`).join('')}</div>` : ''}
        <div class="btns">${btn('back', 'LEAVE HANGAR', true, 'SPACE')}</div>
      </div>`;
    }

    case 'route':
    case 'checkpoint': {
      const run = g.run;
      const checkpoint = g.state === 'checkpoint';
      const offers = routeOffers(
        [...meta.clearedChapters, ...(run.visited || [])],
        run.seed, run.sector,
      );
      g.routeOffers = offers;
      const cards = offers.map((c, i) => {
        const accent = WORLDS[PLANETS[c.planet].world].accent;
        return `
        <button class="tile route" data-action="route:${i}">
          <span class="planet-mark" style="color:${accent}">${planetIcon(c.planet, accent, 62)}</span>
          <span class="world" style="color:${accent}">${c.name}</span>
          <span class="name">${'▮'.repeat(c.difficulty)}${'▯'.repeat(5 - c.difficulty)} · ${c.atmosphere === 'none' ? 'no air' : `${c.atmosphere} air`}</span>
          <span class="best">gravity ${(c.gravity / 6).toFixed(2)} m/s² · ${c.enemyIntensity} resistance</span>
          <span class="best">weather: ${c.hazards.join(', ') || 'nothing reported'}${c.incomplete ? ' <i>· forecast incomplete</i>' : ''}</span>
          <span class="best haul">brings home: ${c.rareMaterial}</span>
          <span class="best rec">take: ${c.recommended.join(', ')}</span>
        </button>`;
      }).join('');
      const h = run.haul;
      return `<div class="screen wide">
        <div class="eyebrow" style="color:#4dff9f">SECTOR ${run.sector} OF ${SECTORS}${checkpoint ? ' · CHECKPOINT' : ''}</div>
        <h2>${checkpoint ? 'CARGO BANKED. SHUTTLES BACK.' : 'WHERE NEXT?'}</h2>
        ${checkpoint ? '<p class="body">Supply stop. Change your loadout here if you want to, then pick the next world.</p>' : ''}
        <table class="score">
          <tr><td>Transmitted salvage</td><td>${formatScore(h.salvageSafe)}</td></tr>
          <tr><td>Physical cargo ${checkpoint ? '(banking now)' : '(at risk until the next checkpoint)'}</td><td>${formatScore(h.salvageCargo)}</td></tr>
          <tr><td>Research data</td><td>${formatScore(h.data)}</td></tr>
          <tr class="tot"><td>SHUTTLES</td><td>${g.lives} / ${run.maxShuttles}</td></tr>
        </table>
        <div class="grid routes">${cards}</div>
        <div class="btns">${checkpoint ? btn('outfit', 'CHANGE LOADOUT') : ''}${btn('abandon-run', 'END EXPEDITION')}</div>
      </div>`;
    }

    case 'expedition-complete': {
      const b = meta.banked;
      const sum = g.lastRunSummary || { missions: 0 };
      return `<div class="screen">
        <div class="verdict" style="color:#4dff9f;text-shadow:0 0 30px #4dff9f">EXPEDITION COMPLETE</div>
        <p class="body">Five sectors, and the lander came home. Everything you carried is banked.
        The next expedition starts wherever you want it to.</p>
        <table class="score">
          <tr><td>Missions flown</td><td>${sum.missions}</td></tr>
          <tr><td>Run score</td><td>${formatScore(g.score)}</td></tr>
          <tr class="tot"><td>BANKED SALVAGE</td><td>${formatScore(b.salvage)}</td></tr>
          <tr class="run"><td>BANKED RESEARCH</td><td>${formatScore(b.data)}</td></tr>
        </table>
        <div class="btns">${btn('chapters', 'NEW EXPEDITION', true, 'SPACE')}${btn('hangar', 'HANGAR')}${btn('menu', 'MENU')}</div>
      </div>`;
    }

    case 'expedition-over': {
      const b = meta.banked;
      return `<div class="screen">
        <div class="verdict bad">EXPEDITION LOST</div>
        <p class="body">All three shuttles are gone. What you transmitted is still yours.
        The expedition ends. The programme does not.</p>
        <table class="score">
          <tr><td>Missions cleared</td><td>${g.lastRunSummary ? g.lastRunSummary.missions : 0}</td></tr>
          <tr><td>Run score</td><td>${formatScore(g.score)}</td></tr>
          <tr class="tot"><td>BANKED SALVAGE</td><td>${formatScore(b.salvage)}</td></tr>
          <tr class="run"><td>BANKED RESEARCH</td><td>${formatScore(b.data)}</td></tr>
        </table>
        ${g.lastRunSummary && g.lastRunSummary.settled && g.lastRunSummary.settled.debrief
          ? `<div class="objective"><span>DEBRIEF</span> The flight recorders came home:
             +${g.lastRunSummary.settled.debrief.salvage} salvage, +${g.lastRunSummary.settled.debrief.data} research.
             Enough to change something before the next attempt.</div>` : ''}
        <div class="btns">${btn('chapters', 'NEW EXPEDITION', true, 'SPACE')}${btn('menu', 'MENU')}</div>
      </div>`;
    }

    case 'paused':
      return `<div class="screen">
        <h2>PAUSED</h2>
        <div class="btns">${btn('resume', 'RESUME', true, 'P')}${
          g.run ? '' : btn('retry', 'RESTART MISSION', false, 'R')}${btn('settings', 'SETTINGS')}${btn('menu', 'MENU')}</div>
      </div>`;
  }
  return '';
}

/** Post-landing breakdown: every number the grade was made of. */
/**
 * What is waiting on this ground, and how to beat it without a weapon. The
 * counterplay is printed because an untelegraphed threat and an unexplained one
 * cost the player the same thing: a lander they had no way to save.
 */
export function threatBrief() {
  const threats = describeThreats(g.level);
  if (!threats.length) return '';
  const rows = threats.map((t) =>
    `<div><b>${t.name}</b> <i>${t.kind === 'air' ? 'airborne' : 'ground'}</i> · ${t.counterplay}</div>`).join('');
  return `<div class="threats"><span>HOSTILE SYSTEMS</span>${rows}</div>`;
}

/**
 * The hold, on the results screen. The point of M15 is that the reward is a
 * thing you went and got, so what came home is shown next to what was left
 * lying out there - that gap is the whole invitation to fly it again.
 */
export function haulPanel(r) {
  const c = r.carried || { material: 0, salvage: 0, nodes: 0 };
  const left = r.materialLeft || { material: 0, salvage: 0, nodes: 0 };
  if (!c.nodes && !left.nodes) return '';
  const rw = g.lastReward;
  const mult = rw && rw.haulMult != null ? rw.haulMult : 1;
  return `<div class="objective haul${c.nodes ? ' met' : ''}">
    <span>${c.nodes ? 'RECOVERED' : 'NOTHING RECOVERED'}</span>
    ${c.nodes} of ${c.nodes + left.nodes} deposit${c.nodes + left.nodes === 1 ? '' : 's'} ·
    <b>${c.material} material · ${c.salvage} salvage</b>${mult !== 1 ? ` × ${mult.toFixed(2)} landing` : ''}${
    left.nodes ? ` · <i>${left.material} material still out there</i>` : ''}</div>`;
}

export function metricsTable(d) {
  const rows = [
    ['DESCENT', `${(d.parts.vy.value / 6).toFixed(2)} m/s`, d.parts.vy, 'vy'],
    ['DRIFT', `${(d.parts.vx.value / 6).toFixed(2)} m/s`, d.parts.vx, 'vx'],
    ['TILT', `${(d.parts.tilt.value / DEG).toFixed(1)}°`, d.parts.tilt, 'tilt'],
    ['PAD CENTRE', d.onPad ? `${Math.round(d.parts.center.value * 100)}% off` : 'off pad', d.parts.center, 'center'],
  ].map(([name, shown, part, axis]) => {
    const caps = capsFor(axis);
    const band = part.value <= caps.perfect ? 'perfect' : part.value <= caps.safe ? 'good' : 'hard';
    const pct = Math.min(100, (part.value / (caps.crash || 1)) * 100);
    return `<tr class="m-${band}">
      <td>${name}</td>
      <td class="m-val">${shown}</td>
      <td class="m-bar"><span style="width:${pct.toFixed(0)}%"></span></td>
      <td class="m-w">+${part.weighted.toFixed(2)}</td>
    </tr>`;
  }).join('');
  return `<table class="metrics">
    ${rows}
    <tr class="m-total"><td>SEVERITY</td><td class="m-val">${d.score.toFixed(2)}</td><td colspan="2">
      ${d.blocker ? d.blocker : 'Textbook.'}${d.bounces > 1 ? ` ${d.bounces} bounces.` : ''}</td></tr>
  </table>`;
}

/**
 * Offered after a mission has cost three landers (roadmap section 13: "if the
 * player fails the same mission repeatedly, offer an optional forecast tip,
 * practice mode, or temporary loaner module - not an invisible difficulty
 * reduction"). Nothing here changes the mission. It names what is killing you,
 * and offers to lend the tool for it.
 */
export function flightAssist() {
  if (!g.run || !g.level) return null;
  const key = g.level.missionId || g.level.id;
  const tries = (g.run.attempts && g.run.attempts[key]) || 0;
  if (tries < 3) return null;

  const planet = PLANETS[g.level.planet] || null;
  const hazard = (g.level.hazards || []).map((h) => (typeof h === 'string' ? h : h.type))[0];
  const TIPS = {
    dust: 'the storm runs on a cycle, so learn the ground in a clear window and commit during the next one',
    windChannels: 'the wind reverses between altitude bands, so drop through them one at a time instead of straight down',
    atmosphere: 'the air answers late here, so start braking earlier than feels right and trim into the gust',
    radiation: 'ridges throw a shadow, and the sheltered route is slower but keeps you alive',
    thermal: 'heat builds while you burn, so use short bursts rather than a long hold',
    cryo: 'the cold builds while you coast, and a little thrust keeps it back',
    plumes: 'the vents fire on a cycle, so cross the field between them',
  };
  const tips = [];
  if (TIPS[hazard]) tips.push(TIPS[hazard]);
  if (g.level.surfaceFriction != null && g.level.surfaceFriction < 0.3) {
    tips.push('this surface barely holds you, so arrive slow and straight and expect to slide');
  }
  if (g.level.cave) tips.push('the ceiling is as fatal as the floor, so climb in small steps');
  if (g.field && !g.field.empty) tips.push('the safe pad is out of every gun\'s reach. The small pad is the one being watched');
  if (!tips.length) tips.push(planet ? planet.summary.toLowerCase() : 'take the wide pad and the base rate. A landing beats a multiplier');

  // A loaner only when the player has nothing equipped for this body.
  const rec = recommendedFor(g.level.planet);
  const owned = meta.equipped && meta.equipped.active;
  const wanted = rec.active && rec.active !== owned ? rec.active : null;
  const loaner = wanted && !g.run.loaner ? ACTIVE_MODULES[wanted] : null;

  return {
    tip: `This ground has cost you ${tries} landers. ${tips[0].charAt(0).toUpperCase()}${tips[0].slice(1)}.`,
    loaner,
  };
}

export function crashReason() {
  if (ship.lostToFire) {
    return ship.damageSource === 'ram'
      ? 'A drone rammed the hull and it came apart.'
      : 'The hull failed under fire. Nothing left to absorb the next hit.';
  }
  if (ship.landingResult && ship.landingResult.blocker && ship.landingResult.grade === 'CRASH') {
    return ship.landingResult.blocker;
  }
  const tilt = Math.abs(normalizeAngle(ship.angle)) / DEG;
  if (g.terrain.ceiling && ship.contact && ship.contact.y < g.terrain.height * 0.5) return 'Struck the ice ceiling.';
  if (ship.fuel <= 0) return 'Tanks dry on final approach.';
  if (Math.abs(ship.vy) > ENVELOPE.HARD.vy) return `Descent rate ${(Math.abs(ship.vy) / 6).toFixed(1)}, far outside the envelope.`;
  if (Math.abs(ship.vx) > ENVELOPE.HARD.vx) return `Lateral drift ${(Math.abs(ship.vx) / 6).toFixed(1)}. The legs sheared off.`;
  if (tilt > 15) return `Attitude ${tilt.toFixed(0)}° off vertical at contact.`;
  return 'Touched down off the pad. The surface is not level enough to hold a lander.';
}
