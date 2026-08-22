// Every overlay screen, as HTML. Extracted from main.js in M23.
//
// Presentation only: this module reads the shared state and returns markup.
// What a button *does* lives in the action dispatch, wired through the
// `data-action` attribute `btn()` stamps on it - so this file changes when a
// screen changes, and the game flow does not.

import * as Log from './gamelog.js';
import * as R from './render.js';
import * as Save from './save.js';
import { COMPONENTS, COMPONENT_IDS, purchaseCheck, tierCheck } from './components.js';
import { describeThreats } from './enemies.js';
import { hazardName } from './forces.js';
import { ACTIONS, keyLabel } from './input.js';
import { capsFor } from './landing.js';
import { LEVELS, WORLDS } from './levels.js';
import { chapterTitle } from './missions.js';
import { ACTIVE_MODULES, PASSIVE_MODULES, activeSlotOf, moduleById, recommendedFor } from './modules.js';
import { cargoFor } from './objectives.js';
import { planetIcon } from './planeticons.js';
import { PLANETS } from './planets.js';
import { PLANET_ORDER, ladderPreview, ladderTrail, routeChoices } from './route.js';
import { ENVELOPE, normalizeAngle } from './ship.js';
import { TREES, TREE_IDS, skillCheck, skillFeatures } from './skills.js';
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

/**
 * A body's forecast card. **One renderer, two screens** - the supply stop
 * between bodies and the expedition start screen - because a card that reads
 * one way when you are choosing to set out and another way when you arrive is
 * two designs pretending to be one. The card data comes from the same
 * `planetCard` either way; this only decides what the tag says and whether it
 * can be clicked.
 */
function bodyCardHTML(c, { tag, action, state = '' }) {
  const accent = WORLDS[PLANETS[c.planet].world].accent;
  const dead = !action;
  return `
    <${dead ? 'div' : 'button'} class="tile route ${state}"${dead ? '' : ` data-action="${action}"`}>
      ${tag}
      <span class="planet-mark" style="color:${accent}">${planetIcon(c.planet, accent, 62)}</span>
      <span class="world" style="color:${accent}">${c.name}</span>
      <span class="name">${'\u25ae'.repeat(c.difficulty)}${'\u25af'.repeat(5 - c.difficulty)} · ${c.atmosphere === 'none' ? 'no air' : `${c.atmosphere} air`}</span>
      <span class="best">gravity ${(c.gravity / 6).toFixed(2)} m/s² · ${c.enemyIntensity} resistance${c.machines ? ` (up to ${c.machines})` : ''}</span>
      <span class="best">weather: ${c.hazards.join(', ') || 'nothing reported'}${c.incomplete ? ' <i>· forecast incomplete</i>' : ''}</span>
      <span class="best haul">brings home: ${c.rareMaterial}</span>
      <span class="best rec">take: ${c.recommended.join(', ') || 'nothing specialised yet — fly what you have'}</span>
    </${dead ? 'div' : 'button'}>`;
}

/**
 * The ladder, drawn as a progress trail: ten bodies in order, marked cleared,
 * next, or still ahead. Non-interactive by construction - M27 removed replay,
 * so a cleared body is a thing you have done rather than a thing you can click.
 * It is the one part of the M25 route screen worth keeping: how far this run
 * got, visible at the moment you decide whether to spend or press on.
 */
function ladderHTML(cleared = []) {
  const rungs = ladderTrail(cleared).map((r) => {
    const state = r.cleared ? 'done' : (r.isNext ? 'next' : 'ahead');
    const accent = WORLDS[PLANETS[r.planet].world].accent;
    return `<li class="rung ${state}"${r.cleared || r.isNext ? ` style="--rung:${accent}"` : ''}>
      <span class="pip">${r.cleared ? '\u25cf' : (r.isNext ? '\u25c9' : '\u25cb')}</span>
      <span class="rung-name">${r.name}</span>
    </li>`;
  }).join('');
  return `<ol class="ladder">${rungs}</ol>`;
}

export function screenHTML(s) {
  switch (s) {
    case 'menu':
      const pending = Save.loadRun();
      const chapterName = pending ? chapterTitle(pending.chapterId) : null;
      return `<div class="screen menu">
        <h1 class="title">TERMINAL<span>VELOCITY</span></h1>
        <p class="tag">A vector lander. Finite fuel. One shot at the pad.</p>
        ${meta.godMode ? '<div class="notice god">GOD MODE IS ON — resources are bottomless and any body can be started. Settings → GOD MODE to turn it off.</div>' : ''}
        ${saveSource === 'corrupt' ? '<div class="notice">A damaged save was set aside and progress reset. The old data is kept under <b>tv_save_corrupt</b>.</div>' : ''}
        ${saveSource === 'newer' ? '<div class="notice">This save was written by a newer build, so it was left untouched.</div>' : ''}
        <div class="stats"><span>HIGH SCORE</span><b>${formatScore(store.high)}</b></div>
        ${chapterName ? `<div class="stats"><span>IN PROGRESS</span><b>${chapterName} · mission ${pending.missionIndex + 1} · ${pending.shuttles} left</b></div>` : ''}
        <div class="btns">
          ${chapterName ? btn('resume-run', 'RESUME EXPEDITION', true, 'SPACE') : ''}
          ${btn('chapters', 'EXPEDITION', !chapterName, chapterName ? '' : 'SPACE')}
          ${chapterName || g.run || !meta.gameCompleted ? '' : btn('select', 'MISSIONS')}
          ${chapterName || g.run ? btn('abandon-run', g.confirmAbandon ? 'YES, END IT' : 'ABANDON EXPEDITION') : ''}
          ${btn('help', 'HOW TO FLY')}
          ${btn('hangar', 'HANGAR')}
          ${btn('outfit', 'LOADOUT')}
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
        <b>${((ship.envelope || ENVELOPE).GOOD.vy / 6).toFixed(1)}</b>, drift under <b>${((ship.envelope || ENVELOPE).GOOD.vx / 6).toFixed(1)}</b>
        and tilt inside the green arc. Smaller pads pay bigger multipliers, leftover fuel is worth points,
        and so is a landing streak. Three lander losses ends the run.</p>
        <p class="body">Miss the pad and a clean touchdown on <b>level ground</b> still survives, at the base
        rate with the streak broken. Steep ground, a hard arrival, the hull touching first, or the ice
        ceiling on Europa. Those are all wreckage.</p>
        <p class="body">Some ground is defended, and it is defended properly. <b>Two hits will end
        you</b> on a hull nobody has worked on. Old security machines still telegraph: a line locks on
        and a ring closes first. It is fast now, so read it early rather than reacting to it.</p>
        <p class="body"><b>Terrain is the answer.</b> A machine cannot shoot what it cannot see, and a
        turret cannot shoot something sitting on top of it. Every mission keeps one pad no machine can
        reach, so there is always somewhere safe to put the lander down. <b>Getting there is not
        safe</b>, and that is the whole game: fly the low ground, break the lock, and take what you can
        carry. Destroying them pays, but it is never required.</p>
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
        <div class="btns">${btn('back', 'BACK', true)}</div>
      </div>`;
    }

    case 'brief': {
      const l = g.level;
      const acc = WORLDS[l.world].accent;
      const padList = g.terrain.pads.map((p) => `x${p.mult}`).join(' · ');
      // The row knows the same hazard vocabulary every other reader got in M29.
      // It used to know only `cave` and `wind` - the M0 fields - so Pluto 3
      // briefed "HAZARD: NONE" against declared cold and darkness, and Europa's
      // radiation went unmentioned under "ICE CEILING": the M29 fault (a name
      // in content, a table in code, a silent miss) in a fifth reader nobody
      // audited. The numeric wind fallback stays for the classic levels, which
      // declare no hazard list at all.
      const wx = [...new Set((l.hazards || []).map(hazardName))]
        .map((h) => h.replace(/([A-Z])/g, ' $1').toUpperCase());
      if (l.cave) wx.unshift('ICE CEILING');
      const hazardText = wx.length ? wx.join(' · ')
        : l.wind ? 'WIND ' + Math.abs(l.wind / 6).toFixed(0) : 'NONE';
      return `<div class="screen">
        <div class="eyebrow" style="color:${acc}">${l.world} · MISSION ${g.endless ? g.endlessN : l.id}</div>
        <h2>${l.title}</h2>
        <p class="body">${l.brief}</p>
        <div class="specs">
          <div><span>GRAVITY</span><b>${(l.gravity / 6).toFixed(1)} m/s²</b></div>
          <div><span>FUEL</span><b>${l.fuel}</b></div>
          <div><span>PADS</span><b>${padList}</b></div>
          <div><span>HAZARD</span><b>${hazardText}</b></div>
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
          : 'All twelve missions flown.'}</p>
        <div class="stats big"><span>SCORE</span><b>${formatScore(g.score)}</b></div>
        <div class="btns">${btn('menu', 'MENU', true, 'SPACE')}</div>
      </div>`;

    case 'chapters': {
      // The whole ladder, as the same cards the supply stop deals. It used to be
      // a single plain tile with the other nine bodies reduced to a row of
      // names, and next to the between-bodies screen it read like a different
      // game. A player about to commit to a ten-body run should be able to see
      // what the run *is*.
      //
      // Only the first is startable - a run always begins at the foot of the
      // ladder (decision 2) - and the rest are a forecast, not a menu, so they
      // render as `div`s with no action rather than as disabled buttons.
      // God mode is the only thing that makes a body other than the first
      // startable. The card still says which body it is, and says *why* it is
      // clickable, so a screen full of live cards is never a mystery.
      const god = !!meta.godMode;
      // Navigation Forecast reads off the *skills*, not the equipped loadout:
      // the ladder screen is shown before a run, where there is no ship yet.
      const cards = ladderPreview([]).map((c) => {
        const open = !c.locked || god;
        return bodyCardHTML(c, {
          tag: c.locked
            ? `<span class="route-tag ${god ? 'god' : 'done'}">BODY ${c.position}${god ? ' · JUMP HERE' : ''}</span>`
            : '<span class="route-tag next">START HERE</span>',
          action: open ? `chapter:${c.planet}` : null,
          state: c.locked ? (god ? 'is-god' : 'is-ahead') : 'is-next',
        });
      }).join('');
      return `<div class="screen wide ladder-screen">
        <h2>EXPEDITION</h2>
        <p class="tag">${PLANET_ORDER.length} bodies, in one fixed order, five missions each. Every
        run starts at the Moon and none of it can be re-flown. Clearing a body returns one lander,
        never more, so what you lose on the way down stays lost. Lose the last one and you start
        again at the Moon with whatever the hangar has bolted on.</p>
        ${god ? '<div class="notice god">GOD MODE — every body is startable and the pot is bottomless. Turn it off in settings before judging how the game plays.</div>' : ''}
        <div class="grid routes centred ladder-cards">${cards}</div>
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
            ${opt('steering', 'classic', 'CLASSIC', 'Side burners rotate the lander. Point the nose, then burn. Let go of the burner and the rotation settles, so the nose stays where you put it.')}
            ${opt('steering', 'pro', 'PRO CLASSIC (IAN)', 'The same, with nothing damping it. A burner adds spin that keeps going until you cancel it yourself. Harder, and the most precise thing in the game.')}
            ${opt('steering', 'direct', 'DIRECT', 'Side burners push the lander sideways and the hull stays upright. Left means left on its own, no attitude to manage.')}
          </div>
        </div>
        <div class="setting${settings.steering === 'direct' ? ' dimmed' : ''}">
          <div class="setting-name">ROTATION${settings.steering === 'direct' ? ' (rotating modes only)' : ''}</div>
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
        <div class="setting">
          <div class="setting-name">PLAYTEST LOG</div>
          <p class="body">An ordered trace of this sitting: every mission started, every landing and its
          numbers, every hit taken, every run lost. It is kept in memory only and never reaches the
          simulation. ${Log.count()} event${Log.count() === 1 ? '' : 's'} recorded.</p>
          <div class="btns">
            ${btn('log-copy', 'COPY TO CLIPBOARD')}${btn('log-export', 'EXPORT .TXT')}${btn('log-export-json', 'EXPORT .JSON')}${btn('log-clear', 'CLEAR')}
          </div>
        </div>
        <div class="setting">
          <div class="setting-name">GOD MODE${meta.godMode ? ' · <b style="color:#ffcf4d">ON</b>' : ''}</div>
          <div class="btns">${btn('god', meta.godMode ? 'TURN GOD MODE OFF' : 'TURN GOD MODE ON')}</div>
        </div>
        <div class="setting">
          <div class="setting-name">NEW GAME</div>
          <p class="body">Erases every hangar upgrade, skill, blueprint, resource and record, and
          abandons any expedition in progress. Your settings and key bindings are kept.
          ${g.confirmWipe ? '<b style="color:#ff3b5c">Press again to erase everything.</b>' : ''}</p>
          <div class="btns">${btn('newgame', g.confirmWipe ? 'YES, ERASE EVERYTHING' : 'NEW GAME')}</div>
        </div>
        <div class="btns">${btn('back', 'DONE', true, 'SPACE')}</div>
      </div>`;
    }

    case 'keys': {
      // **One entry per action, and `settings-tests.js` asserts it in both
      // directions.** `ACTIONS` is derived from `DEFAULT_KEYS`, so adding a
      // control gives it a row here for free - and gave it the label
      // `undefined` for free too. M34's Emergency Arrest shipped that way and
      // nothing caught it, because no node test draws this screen and the miss
      // is silent: the row is there, the binding works, and the name is gone.
      // That is the `BUILDERS` fault from M29 in a fourth place - a name in
      // content indexing a table in code.
      const names = {
        thrust: 'MAIN BOOSTER', left: 'LEFT BURNER', right: 'RIGHT BURNER',
        down: 'DESCENT THRUSTERS', hold: 'ATTITUDE HOLD',
        ability: 'ACTIVE MODULE I', ability2: 'ACTIVE MODULE II',
        arrest: 'EMERGENCY ARREST', overdrive: 'COMBAT OVERDRIVE',
      };
      const rows = ACTIONS.map((a) => {
        const listening = g.rebinding === a;
        return `<button class="opt keyrow${listening ? ' on' : ''}" data-action="rebind:${a}">
          <span class="opt-title">${names[a]}</span>
          <span class="opt-blurb">${listening ? 'press a key or a pad control…' : input.bindings[a].map(keyLabel).map((k) => `<kbd>${k}</kbd>`).join(' ')}</span>
        </button>`;
      }).join('');
      return `<div class="screen">
        <h2>CONTROLS</h2>
        <p class="body">Pick a control, then press the key — or the gamepad button or stick — you
        want on it. Keys and pad controls are kept separately, so setting one never clears the
        other. Retry, pause, mute and escape stay where they are, so the menu is always
        reachable.</p>
        <p class="body dim">A gamepad is picked up automatically; the browser will not see it until
        you have pressed something on it. Triggers and sticks are analog, so how hard you pull is
        how hard it burns. <kbd>A</kbd> confirms and <kbd>B</kbd> or <kbd>START</kbd> goes back —
        those are the interface's and cannot be reassigned, except <kbd>A</kbd>, which doubles as a
        booster exactly as <kbd>SPACE</kbd> does.</p>
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
      // The tree opens once something has actually shot at you, and the
      // capstone once five bodies have been cleared. One rule, one place.
      const features = skillFeatures(meta);
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

      // **One list, and the tile says which button it is on.** It was two
      // identical grids - one per slot - which Tom called correctly: the same
      // ten modules drawn twice is a table, not a choice. The order you pick
      // decides the slot, so the badge is the whole interface.
      const abilityKey = (n) => keyLabel((input.bindings[n ? 'ability2' : 'ability'] || [])[0] || '?');
      const slot = (map, kind) => Object.values(map).map((mod) => {
        const owned = meta.unlockedBlueprints.includes(mod.id);
        const at = kind === 'active' ? activeSlotOf(meta.equipped, mod.id) : -1;
        const on = kind === 'active' ? at >= 0 : meta.equipped[kind] === mod.id;
        return `<button class="tile mod${on ? ' on' : ''}${owned ? '' : ' locked'}"
            data-action="${owned ? `equip:${kind}:${mod.id}` : 'noop'}" ${owned ? '' : 'disabled'}>
          <span class="world">${mod.name}${at >= 0 ? `<b class="fitted">${abilityKey(at)}</b>` : ''}</span>
          <span class="best">${owned ? mod.blurb : 'Blueprint not yet recovered.'}</span>
        </button>`;
      }).join('');

      // **Readable during a run, spendable only between bodies.** The screen used
      // to be unreachable mid-expedition - the menu button was hidden and the
      // action refused - which meant the skill tree and the research total both
      // disappeared for the length of a run. The lock is unchanged; it is stated
      // instead of hidden, because a screen full of tiles that quietly refuse is
      // the "button that silently does nothing" M16 ruled against.
      const shut = !!g.run && !g.loadoutWindow && !meta.godMode;
      return `<div class="screen wide">
        <div class="eyebrow" style="color:#5ff5ff">LOADOUT</div>
        <h2>SKILLS AND MODULES</h2>
        ${shut ? '<div class="notice">Read-only while an expedition is under way. Skills and modules are changed at the supply stop between bodies.</div>' : ''}
        <div class="stats"><span>RESEARCH DATA</span><b>${formatScore(data)}</b></div>
        <div class="trees">${trees}</div>
        <div class="setting">
          <div class="setting-name">ACTIVE MODULES — PICK TWO</div>
          <!-- Tom: "how do you unlock blueprints?" - nothing on this screen said,
               and a locked tile reading "Blueprint not yet recovered" is a
               statement of fact rather than an instruction. -->
          <p class="body">Blueprints are <b>found, not bought</b>. <b>Every body you clear hands one
          over</b> — picked for the world you are about to fly — and surviving a mission that shot at
          you hands over the weapon. They are the one thing a lost expedition never takes back, so
          what you recover is yours for good. <b>Pick two.</b> The first goes on
          <kbd>${keyLabel((input.bindings.ability || [])[0] || 'e')}</kbd>, the second on
          <kbd>${keyLabel((input.bindings.ability2 || [])[0] || 'q')}</kbd> — pad
          <kbd>X</kbd> and <kbd>Y</kbd>. Tap a fitted module to take it off.</p>
          <div class="grid comps">${slot(ACTIVE_MODULES, 'active')}</div>
        </div>
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
              <span>COST</span> ${next.cost.salvage} salvage${next.cost.cores ? ` · ${next.cost.cores} tech cores` : ''}${Object.entries(next.cost.materials || {}).map(([m, v]) => ` · ${v} ${m}`).join('')}
            </div>` : ''}
            ${check.ok
              ? btn(`buy:${sel}`, 'INSTALL', true)
              : `<div class="notice">${check.reason}</div>`}
          </div>
        </div>
        <div class="grid comps">${tabs}</div>
        <!-- Salvage, cores and materials. Research is still absent because it
             buys *skills* and this screen cannot spend it - that is the M29a
             rule and it stands. Cores came off this screen for the same reason
             and go back on in M29, because they now buy the L3 and L4 rungs:
             the answer to "what do cores do?" is on the screen that spends
             them, which is the only place an answer is any use. -->
        <div class="stats"><span>BANKED</span><b>${formatScore(b.salvage)} salvage</b><b>${formatScore(b.cores || 0)} tech cores</b></div>
        <div class="mats"><span><i>Tech cores come from a PERFECT landing on a small pad, and buy the top two levels of any track.</i></span></div>
        ${mats.length ? `<div class="mats">${mats.map(([m, v]) => `<span>${v} <i>${m}</i></span>`).join('')}</div>` : ''}
        <div class="btns">${btn('back', 'LEAVE HANGAR', true, 'SPACE')}</div>
      </div>`;
    }

    case 'route':
    case 'checkpoint': {
      const run = g.run;
      const checkpoint = g.state === 'checkpoint';
      // M27: one card. The ladder is ten bodies in a fixed order and a cleared
      // body cannot be re-flown, so there is exactly one place to go from here
      // and the screen says so. What is behind the player is the trail above
      // the card - a record, not a menu.
      const cleared = run.cleared || [];
      const offers = routeChoices(cleared, run.sector, run.seed);
      g.routeOffers = offers;
      const cards = offers.map((c, i) => bodyCardHTML(c, {
        tag: `<span class="route-tag next">BODY ${cleared.length + 1} OF ${PLANET_ORDER.length}</span>`,
        action: `route:${i}`,
        state: 'is-next',
      })).join('');
      // **What this table must show depends on which screen it is.** At a
      // supply stop the haul has already been banked - M25b moved that to the
      // way *in*, so the hangar opens on money that is actually there - and a
      // table driven off `run.haul` therefore reads 0/0/0 at the exact moment
      // the player is deciding what to spend. Measured live at the first
      // checkpoint of a run: haul all zero, `meta.banked` 2,329 salvage. That is
      // the M25b run-lost fault again, on the screen it matters most, and it is
      // the third time this milestone series has printed a number that had just
      // been moved somewhere else.
      //
      // So the stop reports what it banked and what the player now has; the
      // route screen, which opens *before* any banking, still reports the haul
      // it is carrying and what is still at risk.
      const h = run.haul;
      const settled = g.lastSettled || null;
      const rows = checkpoint
        ? `<tr><td>Salvage banked at this stop</td><td>${formatScore(settled ? settled.salvage : 0)}</td></tr>
           <tr><td>Research banked at this stop</td><td>${formatScore(settled ? settled.data : 0)}</td></tr>
           <tr><td>Salvage on hand</td><td>${formatScore(meta.banked.salvage)}</td></tr>
           <tr><td>Research on hand</td><td>${formatScore(meta.banked.data)}</td></tr>
           <tr><td>Tech cores on hand</td><td>${formatScore(meta.banked.cores || 0)}</td></tr>`
        : `<tr><td>Transmitted salvage</td><td>${formatScore(h.salvageSafe)}</td></tr>
           <tr><td>Physical cargo (at risk until the next checkpoint)</td><td>${formatScore(h.salvageCargo)}</td></tr>
           <tr><td>Research data</td><td>${formatScore(h.data)}</td></tr>`;
      // What the next body expects you to be flying (M28). Printed here because
      // this is the only screen where it can still be acted on - the hangar is
      // open, the salvage is banked, and the choice is spend or press on.
      const tier = tierCheck(cleared.length + 1, meta.componentLevels);
      const full = g.lives >= run.maxShuttles;
      return `<div class="screen wide">
        <div class="eyebrow" style="color:#4dff9f">${cleared.length} OF ${PLANET_ORDER.length} BODIES CLEARED${checkpoint ? ' · SUPPLY STOP' : ''}</div>
        <h2>${checkpoint ? 'CARGO BANKED' : 'WHERE NEXT'}</h2>
        <p class="body">This is the only place the hangar takes salvage and the loadout opens, so
        spend it here or carry it on. There is no going back: the ladder runs one way, and a body
        you have cleared is behind you for the rest of the run.</p>
        ${ladderHTML(cleared)}
        <table class="score">
          ${rows}
          <tr${tier.ready ? '' : ' class="run"'}><td>Recommended lander for ${offers.length ? offers[0].name : 'the next body'}</td>
            <td>${tier.want} upgrade${tier.want === 1 ? '' : 's'} fitted · you have ${tier.have}${tier.ready ? '' : ` · <b>${tier.short} short</b>`}</td></tr>
          <tr class="tot"><td>SHUTTLES</td><td>${g.lives} / ${run.maxShuttles}${full ? '' : ' · one back per body cleared'}</td></tr>
        </table>
        <div class="grid routes centred">${cards}</div>
        <div class="btns">${btn('outfit', 'LOADOUT')}${btn('hangar', 'HANGAR')}${btn('abandon-run', g.confirmAbandon ? 'YES, END IT' : 'END EXPEDITION')}</div>
      </div>`;
    }

    case 'expedition-complete': {
      // The rarest screen in the game, and until now the plainest. Ten bodies is
      // 50 missions on three shuttles that never fully refill, so it earns the
      // trophy, the roll of what was crossed, and a way out that is not a menu
      // button squeezed between two others.
      const b = meta.banked;
      const sum = g.lastRunSummary || { missions: 0 };
      const roll = PLANET_ORDER.map((id) => {
        const acc = WORLDS[PLANETS[id].world].accent;
        return `<li style="--rung:${acc}"><span class="pip">◆</span><span class="rung-name">${PLANETS[id].displayName}</span></li>`;
      }).join('');
      return `<div class="screen wide complete">
        <div class="diamond" aria-hidden="true">◆</div>
        <div class="verdict" style="color:#9fe8ff;text-shadow:0 0 34px #9fe8ff">EXPEDITION COMPLETE</div>
        <p class="body">All ${PLANET_ORDER.length} bodies, the Moon to Venus, and the lander came
        home. Nobody has to do this twice — but the ones who do get another stone.</p>
        <ol class="ladder roll">${roll}</ol>
        <table class="score">
          <tr><td>Missions flown</td><td>${sum.missions}</td></tr>
          <tr><td>Bodies cleared</td><td>${sum.bodies || PLANET_ORDER.length} of ${PLANET_ORDER.length}</td></tr>
          <tr><td>Run score</td><td>${formatScore(g.score)}</td></tr>
          <tr><td>Banked salvage</td><td>${formatScore(b.salvage)}</td></tr>
          <tr class="tot"><td>DIAMOND RECOVERED</td><td>${'◆'.repeat(Math.min(8, meta.diamonds || 1))} ${meta.diamonds || 1}</td></tr>
        </table>
        <p class="body dim">A diamond is not spent and not lost. It is the record that you finished,
        and it is what the ship cosmetics will be cut from.</p>
        <div class="btns">${btn('menu', 'BACK TO THE START', true, 'SPACE')}</div>
      </div>`;
    }

    case 'expedition-over': {
      // The copy here used to promise "what you transmitted is still yours" and
      // print the banked totals underneath. Since M24 that is the opposite of
      // what happens: `wipeForDeath` takes the skills, the salvage and the
      // research on the way past, so the screen was reading out two numbers it
      // had just zeroed. It says what the run actually cost now, and what the
      // hangar kept - which is the only thing that carries.
      const kept = Object.entries(meta.componentLevels || {})
        .filter(([, lvl]) => lvl > 1)
        .map(([id, lvl]) => `${COMPONENTS[id] ? COMPONENTS[id].name : id} ${lvl}`);
      // M13's floor, which M28 reconnected: paid *through* the wipe, so it is
      // the one number on this screen that is still in the player's pocket.
      const debrief = (g.lastRunSummary && g.lastRunSummary.settled && g.lastRunSummary.settled.debrief) || null;
      // Two ways a run ends, one screen: the shuttles ran out, or the player
      // called it. Since M28b they cost the same thing, so the only difference
      // here is the sentence that says which happened.
      const gaveUp = !!(g.lastRunSummary && g.lastRunSummary.abandoned);
      return `<div class="screen">
        <div class="verdict bad">${gaveUp ? 'EXPEDITION ENDED' : 'EXPEDITION LOST'}</div>
        <p class="body">${gaveUp
          ? 'You called it. Ending a run costs what losing one costs: the skills, the salvage and the research go, and the route closes back to the Moon.'
          : 'All three shuttles are gone. The skills, the salvage and the research go with them, and the route closes back to the Moon.'}
        What the hangar has already bolted on is yours for good.</p>
        <table class="score">
          <tr><td>Missions cleared</td><td>${g.lastRunSummary ? g.lastRunSummary.missions : 0}</td></tr>
          <tr><td>Run score</td><td>${formatScore(g.score)}</td></tr>
          <tr class="tot"><td>KEPT — HANGAR</td><td>${kept.length ? kept.join(' · ') : 'nothing fitted yet'}</td></tr>
          <tr class="run"><td>LOST — SALVAGE &amp; RESEARCH</td><td>everything unspent</td></tr>
          ${debrief ? `<tr><td>FINAL DEBRIEF — transmitted anyway</td><td>${formatScore(debrief.salvage)} salvage · ${formatScore(debrief.data)} research</td></tr>` : ''}
        </table>
        <p class="body">${debrief
          ? 'The survey office pays a fixed rate for the wreck — the same whether the hold was full or empty. It is not much, but it is enough to start the next run with a decision rather than an empty hangar.'
          : 'The wreck is written off; the hangar is what carries forward.'}
        There is no going back to a cleared body for more — spend it at a supply stop, or lose it
        the way this run just did.</p>
        <div class="btns">${btn('menu', 'BACK TO START', true, 'SPACE')}</div>
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
 * What to say about each hazard when a player is stuck on it.
 *
 * **Keyed on the names authored content actually writes**, which is the whole
 * story of this table. It used to be keyed on the names the *builders* have -
 * `thermal`, `cryo`, `plumes` - while every planet and mission declares `heat`,
 * `cold`, `plume`. That is the M29 fault exactly, in a second table nobody
 * audited: M29 fixed `BUILDERS` and asserted every hazard name resolves to a
 * builder, and this table indexes the same names and was never checked.
 *
 * Measured before the fix: **8 of 50 missions got a hazard tip.** Every Titan,
 * Enceladus, Ganymede, Io, Mercury, Pluto and Venus mission was silent about
 * the weather, in the one feature that exists for a player who has already lost
 * three landers to it.
 *
 * `settings-tests.js` asserts that every name any planet or mission declares
 * has an entry here, with `TIPLESS` as the stated exception - the same shape as
 * the `BUILDERS` assertion, because the failure mode is the same silence.
 */
const HAZARD_TIPS = {
  dust: 'the storm runs on a cycle, so learn the ground in a clear window and commit during the next one',
  windChannels: 'the wind reverses between altitude bands, so drop through them one at a time instead of straight down',
  wind: 'the air answers late here, so start braking earlier than feels right and trim into the gust',
  drag: 'thick air holds you up on the way down and shoves you on the way across, so carry less speed than feels safe',
  radiation: 'ridges throw a shadow, and the sheltered route is slower but keeps you alive',
  heat: 'heat builds while you burn and the engine fades with it, so use short bursts rather than a long hold',
  cold: 'the cold builds while you coast and stiffens the burners, so a little thrust keeps it back',
  plume: 'the vents fire on a cycle, so cross the field between them rather than over one',
  glide: 'there is lift here, so fly it across instead of dropping onto it - a shallow approach costs less fuel than a hover',
  acid: 'the air eats the hull lowest down, so spend as little time near the deck as you can and land decisively',
  downdraft: 'there are columns of sinking air, so cross between them and keep some height in hand to trade',
  eruption: 'the vents throw on a cycle, so watch one fire and move while it is spent',
  magnetic: 'the anomalies drag the nose and pull you down, so trim early and expect to fight the attitude',
  falseRadar: 'the instruments lie here, so fly what you can see rather than what the readout says',
  darkness: 'you cannot see the ground, but the beacons and the crates draw through it - fly the lights',
  ice: 'this surface barely holds you, so arrive slow and straight and expect to slide',
};

/**
 * Hazards that deliberately have no tip. Empty, and the point of it being
 * declared is that adding a hazard makes writing one a failing test rather
 * than an omission nobody notices.
 */
export const TIPLESS_HAZARDS = [];

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
  // **The first hazard that has something to say, not simply the first.**
  // `hazards[0]` meant Titan (`wind`, then `glide`, then `dust`) and Venus
  // (`drag` first, `dust` last) threw away a tip they had, because the one they
  // led with had none.
  const named = (g.level.hazards || []).map(hazardName);
  const hazard = named.find((h) => HAZARD_TIPS[h]) || named[0];
  const tips = [];
  if (HAZARD_TIPS[hazard]) tips.push(HAZARD_TIPS[hazard]);
  if (g.level.surfaceFriction != null && g.level.surfaceFriction < 0.3 && hazard !== 'ice') {
    tips.push('this surface barely holds you, so arrive slow and straight and expect to slide');
  }
  if (g.level.cave) tips.push('the ceiling is as fatal as the floor, so climb in small steps');
  if (g.field && !g.field.empty) tips.push('the safe pad is out of every gun\'s reach. The small pad is the one being watched');
  if (!tips.length) tips.push(planet ? planet.summary.toLowerCase() : 'take the wide pad and the base rate. A landing beats a multiplier');

  // A loaner only when the player has nothing equipped for this body.
  const rec = recommendedFor(g.level.planet);
  // *Either* slot counts as owning it (M37): checking only `equipped.active`
  // meant a module fitted in the second slot was offered as a loaner anyway,
  // and the loan replaces slot one - the same module in both slots, which
  // `fitActive` exists to forbid.
  const fitted = rec.active && activeSlotOf(meta.equipped, rec.active) >= 0;
  const wanted = rec.active && !fitted ? rec.active : null;
  const loaner = wanted && !g.run.loaner ? ACTIVE_MODULES[wanted] : null;

  return {
    tip: `This ground has cost you ${tries} landers. ${tips[0].charAt(0).toUpperCase()}${tips[0].slice(1)}.`,
    loaner,
  };
}

/**
 * **What a hazard death is called.** Keyed on the `source` string the force
 * hands `damageOverTime`, which is the same shape as `HAZARD_TIPS` above and
 * the same shape as `BUILDERS` in `forces.js` - a name written in one file
 * indexing a table in another. `settings-tests.js` asserts an entry for every
 * source any force actually passes, because the failure mode is silence: a
 * missing key falls through to the generic line and nobody sees a gap.
 */
const HAZARD_DEATHS = {
  eruption: 'A fountain caught the lander and burned through the hull.',
  acid: 'The air ate through the hull. Too long down in the thick of it.',
  radiation: 'The belt burned through the hull on the way in.',
  hazard: 'The weather took the hull apart.',
};

/**
 * **Why the lander was lost, as one short tag.** The prose the crash screen
 * prints and the `reason` the playtest log records are two presentations of
 * this one answer, because they were two answers and only one of them worked:
 * the log line read `g.crashReason`, **a property nothing in the codebase has
 * ever assigned**, so every lander lost to a gun, a ram, its own charge or the
 * weather was filed as `reason=impact` in the trace Tom pastes into chat.
 *
 * The screen had the other half of the fault - it knew about fire and the
 * ceiling and every landing axis, and nothing at all about a hazard - so a hull
 * emptied by Io's fountains got the off-pad line about level ground, in mid-air.
 */
export function crashCause() {
  if (ship.lostToFire) return ship.damageSource === 'ram' ? 'ram' : (ship.damageSource || 'fire');
  if (ship.lostToHazard) return ship.damageSource || 'hazard';
  if (ship.landingResult && ship.landingResult.blocker && ship.landingResult.grade === 'CRASH') return 'landing';
  if (g.terrain && g.terrain.ceiling && ship.contact && ship.contact.y < g.terrain.height * 0.5) return 'ceiling';
  if (ship.fuel <= 0) return 'dry';
  const env = ship.envelope || ENVELOPE;
  if (Math.abs(ship.vy) > env.HARD.vy) return 'descent';
  if (Math.abs(ship.vx) > env.HARD.vx) return 'drift';
  if (Math.abs(normalizeAngle(ship.angle)) / DEG > 15) return 'attitude';
  return 'off-pad';
}

export function crashReason() {
  const cause = crashCause();
  if (cause === 'ram') return 'A drone rammed the hull and it came apart.';
  if (cause === 'blast') return 'Your own charge went off too close. The hull did not take it.';
  if (ship.lostToFire) return 'The hull failed under fire. Nothing left to absorb the next hit.';
  if (ship.lostToHazard) return HAZARD_DEATHS[cause] || HAZARD_DEATHS.hazard;
  if (cause === 'landing') return ship.landingResult.blocker;
  if (cause === 'ceiling') return 'Struck the ice ceiling.';
  if (cause === 'dry') return 'Tanks dry on final approach.';
  if (cause === 'descent') return `Descent rate ${(Math.abs(ship.vy) / 6).toFixed(1)}, far outside the envelope.`;
  if (cause === 'drift') return `Lateral drift ${(Math.abs(ship.vx) / 6).toFixed(1)}. The legs sheared off.`;
  if (cause === 'attitude') return `Attitude ${(Math.abs(normalizeAngle(ship.angle)) / DEG).toFixed(0)}° off vertical at contact.`;
  return 'Touched down off the pad. The surface is not level enough to hold a lander.';
}
