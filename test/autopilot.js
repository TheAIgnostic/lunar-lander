// Test harness: a phased autopilot that flies the current mission the way a
// human does - tilt and burn to build lateral speed, coast, brake, then a
// vertical descent. Used to prove every level is landable within its fuel
// budget. Not loaded by the game itself.
//
//   await __autopilot()      fly the highest-multiplier pad
//   await __runAll(12)       fly every campaign mission, return a result table

(function () {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const norm = (a) => {
    let x = a % (Math.PI * 2);
    if (x > Math.PI) x -= Math.PI * 2;
    if (x < -Math.PI) x += Math.PI * 2;
    return x;
  };
  const THRUST = 130;

  window.__autopilot = function (opts = {}) {
    const g = window.__game;
    const ship = window.__ship;
    const input = window.__input;
    const pads = g.terrain.pads;
    const pad = opts.padIndex != null
      ? pads[opts.padIndex]
      : pads.reduce((a, b) => (b.mult > a.mult ? b : a), pads[0]);
    const tx = (pad.x1 + pad.x2) / 2;
    const grav = g.level.gravity;
    const aLat = THRUST * Math.sin(0.5) * 0.8;   // usable lateral accel at the working tilt
    let phase = 'ACCEL';

    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => {
        if (g.state !== 'play') {
          input.touch.thrust = input.touch.left = input.touch.right = input.touch.hold = false;
          return resolve({
            outcome: g.state,
            quality: g.lastResult && (g.state === 'result' || g.state === 'victory') ? g.lastResult.q : null,
            fuelLeft: +ship.fuel.toFixed(1),
            fuelUsed: +(ship.maxFuel - ship.fuel).toFixed(1),
            secs: +((performance.now() - t0) / 1000).toFixed(1),
            phase,
          });
        }
        if (performance.now() - t0 > 75000) {
          input.touch.thrust = input.touch.left = input.touch.right = input.touch.hold = false;
          return resolve({ outcome: 'timeout', fuelLeft: +ship.fuel.toFixed(1), phase });
        }

        const ground = g.terrain.heightAt(ship.x);
        const alt = ground - ship.y;
        const dx = tx - ship.x;
        const adx = Math.abs(dx);
        const brakeDist = (ship.vx * ship.vx) / (2 * aLat) + 70;

        // Descent profile: the fastest sink rate we could still arrest.
        const aUp = Math.max(18, THRUST * 0.85 - grav);
        const vyMax = clamp(Math.sqrt(2 * aUp * Math.max(alt - 40, 0)) * 0.55, 6, 130);

        // Ceiling guard for cave levels: measured in corridor fractions, not a
        // fixed distance, so tight shafts get respected earlier.
        const roofGap = g.terrain.ceiling ? ship.y - g.terrain.ceilingAt(ship.x) : Infinity;
        const roofPush = roofGap < 120;
        const roofNear = roofGap < 220;

        // Wind feed-forward: the tilt that cancels the aerodynamic push.
        const wAcc = g.level.drag ? ((ship.windNow || 0) - ship.vx) * g.level.drag : 0;
        const ff = Math.asin(clamp(-wAcc / THRUST, -0.3, 0.3));

        let wantAngle = 0;
        let thrust = false;

        if (phase === 'ACCEL') {
          const vxTarget = clamp(Math.sqrt(2 * aLat * Math.max(adx - 60, 0)) * 0.6, 18, 110);
          wantAngle = ff + Math.sign(dx) * (roofNear ? 0.28 : 0.5);
          const aligned = Math.abs(norm(ship.angle - wantAngle)) < 0.14;
          const needSpeed = Math.abs(ship.vx) < vxTarget || Math.sign(ship.vx) !== Math.sign(dx);
          thrust = aligned && needSpeed;
          if (adx < brakeDist) phase = 'BRAKE';
          else if (Math.abs(ship.vx) >= vxTarget && Math.sign(ship.vx) === Math.sign(dx)) phase = 'COAST';
        } else if (phase === 'COAST') {
          wantAngle = 0;
          thrust = ship.vy > vyMax;
          // Atmosphere drags the ground track down - build speed again if the
          // pad has stopped getting closer.
          const closing = ship.vx * Math.sign(dx);
          if (adx < brakeDist) phase = 'BRAKE';
          else if (closing < 22 && adx > 120) phase = 'ACCEL';
        } else if (phase === 'BRAKE') {
          // Brake against ground track, not just velocity, so wind drift counts.
          const closing = ship.vx * Math.sign(dx);
          wantAngle = ff - Math.sign(ship.vx || dx) * (roofNear ? 0.28 : 0.5);
          thrust = Math.abs(ship.vx) > 9 && Math.abs(norm(ship.angle - wantAngle)) < 0.14;
          if ((Math.abs(ship.vx) <= 9 && closing <= 12) || adx < 26) phase = 'DESCEND';
        } else {
          const vxWant = clamp(dx * 0.22, -26, 26);
          wantAngle = clamp(ff + (vxWant - ship.vx) * 0.012, -0.4, 0.4);
          const lined = adx < 22;
          if (alt < 55 && lined) wantAngle = clamp(wantAngle, ff - 0.06, ff + 0.06);
          // Hold altitude until lined up rather than settling next to the pad.
          thrust = ship.vy > (lined || alt > 90 ? vyMax : -6);
          if (adx > 130 && alt < 200) phase = 'ACCEL';
        }

        // Never let the sink rate or the roof run away, whatever the phase.
        if (ship.vy > vyMax * 1.25 && Math.abs(ship.angle) < 0.6) thrust = true;
        if (roofPush) { wantAngle = clamp(wantAngle, ff - 0.2, ff + 0.2); thrust = false; }
        else if (roofNear && ship.vy < 10) thrust = false;   // do not climb into the ice
        if (alt < 260 && phase !== 'DESCEND' && adx < 60) phase = 'DESCEND';

        const aErr = norm(wantAngle - ship.angle);
        const cmd = aErr * 11 - ship.spin * 2.8;
        input.touch.left = cmd < -0.35;
        input.touch.right = cmd > 0.35;
        input.touch.hold = Math.abs(aErr) < 0.05 && Math.abs(ship.spin) > 0.08;
        input.touch.thrust = thrust && ship.fuel > 0;

        window.__ap = { phase, wantAngle: +wantAngle.toFixed(3), angle: +ship.angle.toFixed(3),
          alt: alt | 0, dx: dx | 0, vx: +ship.vx.toFixed(1), vy: +ship.vy.toFixed(1),
          thrust: input.touch.thrust, L: input.touch.left, R: input.touch.right, cmd: +cmd.toFixed(2) };

        requestAnimationFrame(tick);
      };
      tick();
    });
  };

  window.__runAll = async function (count = 12, padIndex) {
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
