// Browser wrapper around the shared control law. Not loaded by the game.
//
//   const s = document.createElement('script'); s.src = '/test/autopilot.js';
//   document.head.appendChild(s);
//   await __autopilotReady;          // the law is imported as a module
//   __runAllHeadless(12)             // fly every campaign mission, stepped directly (fast)
//   await __runAll(12)               // same, driven by requestAnimationFrame (real time)
//   __flyHeadless({padIndex: 0})     // one mission, targeting a chosen pad
//
// This file used to carry its own copy of the control law, and the copy drifted:
// it never got the position hold, the wall guard or the scaled ceiling guard, so
// the browser and the node validator quietly flew differently. There is one law
// now, in test/pilot.js, and this file only adapts it to the live game objects.

(function () {
  let makeControl = null;

  /** The shared law, loaded as a module. Await this before flying. */
  window.__autopilotReady = import('/test/pilot.js').then((m) => {
    makeControl = m.makeControl;
    return true;
  });

  function requireLaw() {
    if (!makeControl) {
      throw new Error('autopilot: the control law is still loading — `await __autopilotReady` first');
    }
    return makeControl;
  }

  /**
   * Builds the control law for the current mission. Returns a function that
   * sets the input state for one step, so the timed and headless drivers below
   * fly identically to `node test/validate-missions.js`.
   */
  window.__controlLaw = function (opts = {}) {
    const g = window.__game;
    const control = requireLaw()(window.__ship, g.terrain, g.level, opts);
    return function step() {
      const phase = control(window.__input.touch);
      window.__ap = {
        phase,
        angle: +window.__ship.angle.toFixed(3),
        vx: +window.__ship.vx.toFixed(1),
        vy: +window.__ship.vy.toFixed(1),
        thrust: window.__input.touch.thrust,
      };
      return phase;
    };
  };

  const release = (input) => {
    input.touch.thrust = input.touch.left = input.touch.right = input.touch.hold = false;
  };

  /**
   * Headless flight: steps the simulation directly instead of waiting for
   * requestAnimationFrame. Runs a mission in milliseconds and works in a hidden
   * tab, where rAF never fires.
   */
  window.__flyHeadless = function (opts = {}) {
    const g = window.__game;
    const ship = window.__ship;
    const input = window.__input;
    const step = 1 / 120;
    const maxSimSeconds = opts.maxSimSeconds || 120;
    const control = window.__controlLaw(opts);
    const t0 = performance.now();
    let simTime = 0;

    while (simTime < maxSimSeconds && !ship.landed && ship.alive) {
      control();
      window.__advance(step);
      simTime += step;
    }
    release(input);

    const landed = ship.landed;
    const timedOut = !landed && ship.alive;
    const state = window.__settleNow();
    return {
      outcome: timedOut ? 'timeout' : state,
      quality: landed && g.lastResult ? g.lastResult.q : null,
      offPad: landed && g.lastResult ? !!g.lastResult.offPad : null,
      fuelLeft: +ship.fuel.toFixed(1),
      fuelUsed: +(ship.maxFuel - ship.fuel).toFixed(1),
      hull: Math.round(ship.hull),
      simSecs: +simTime.toFixed(1),
      wallMs: Math.round(performance.now() - t0),
      seed: g.seed,
    };
  };

  window.__runAllHeadless = function (count = 12, padIndex) {
    const rows = [];
    for (let i = 0; i < count; i++) {
      window.__act(`go:${i}`);
      window.__act('launch');
      const r = window.__flyHeadless({ padIndex });
      const L = window.__game.level;
      rows.push({ lvl: L.id, title: L.title, ...r });
      window.__act('menu');
    }
    return rows;
  };

  /** Every mission of a chapter, headlessly. `__runChapter('MARS')`. */
  window.__runChapter = function (planetId, padIndex) {
    const rows = [];
    for (let i = 0; i < 5; i++) {
      window.__goMission(planetId, i);
      window.__act('launch');
      const r = window.__flyHeadless({ padIndex });
      const L = window.__game.level;
      rows.push({ lvl: L.id, title: L.title, ...r });
    }
    window.__act('menu');
    return rows;
  };

  /** Real-time driver, for watching the autopilot fly in a visible tab. */
  window.__autopilot = function (opts = {}) {
    const g = window.__game;
    const ship = window.__ship;
    const input = window.__input;
    const control = window.__controlLaw(opts);
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => {
        if (g.state !== 'play') {
          release(input);
          return resolve({
            outcome: g.state,
            quality: g.lastResult && (g.state === 'result' || g.state === 'victory') ? g.lastResult.q : null,
            fuelLeft: +ship.fuel.toFixed(1),
            fuelUsed: +(ship.maxFuel - ship.fuel).toFixed(1),
            secs: +((performance.now() - t0) / 1000).toFixed(1),
          });
        }
        if (performance.now() - t0 > 75000) {
          release(input);
          return resolve({ outcome: 'timeout', fuelLeft: +ship.fuel.toFixed(1) });
        }
        control();
        requestAnimationFrame(tick);
      };
      tick();
    });
  };

  window.__runAll = async function (count = 12, padIndex) {
    await window.__autopilotReady;
    const rows = [];
    for (let i = 0; i < count; i++) {
      window.__act(`go:${i}`);
      window.__act('launch');
      const r = await window.__autopilot({ padIndex });
      const L = window.__game.level;
      rows.push({ lvl: L.id, title: L.title, ...r });
      window.__act('menu');
      await new Promise((res) => setTimeout(res, 50));
    }
    return rows;
  };
})();
