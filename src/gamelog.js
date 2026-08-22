// The playtest log (M24).
//
// Tom's ask: "a log that tracks all relevant game data for gameplay test that I
// can copy into chat and can be exported". So this is not the logbook - the
// logbook (`meta.stats`) is the player's career record, aggregated and lossy.
// This is the opposite: an *ordered event trace* of one sitting, kept in memory
// only, written to be read by a person or pasted into a conversation.
//
// Two rules it is built on:
//
//  - it never touches the simulation. Nothing here is read back by the game,
//    so a log that is off, full, or broken cannot change a flight. That is the
//    same rule the accessibility settings live under (`test/settings-tests.js`).
//  - it records what was *measured*, not what was intended: the actual grade,
//    the actual fuel, the actual hull, the seed that produced them. A log that
//    records the plan is worth nothing when the complaint is "that felt wrong".

const CAP = 400;   // a long sitting, then the oldest go. Memory, not history.

const state = {
  entries: [],
  started: Date.now(),
  seq: 0,
};

/** Wipe the trace. Called on NEW GAME, and available on the settings screen. */
export function clearLog() {
  state.entries = [];
  state.started = Date.now();
  state.seq = 0;
}

/**
 * Record one event. `kind` is a short tag; `data` is a flat bag of values that
 * are already numbers or strings - nothing is serialized deeply, because a log
 * line that holds a live object holds it against the garbage collector.
 */
export function log(kind, data = {}) {
  const flat = {};
  for (const [k, v] of Object.entries(data)) {
    if (v == null) continue;
    if (typeof v === 'number') flat[k] = Number.isInteger(v) ? v : Math.round(v * 100) / 100;
    else if (typeof v === 'boolean' || typeof v === 'string') flat[k] = v;
  }
  state.entries.push({ n: ++state.seq, t: Math.round((Date.now() - state.started) / 100) / 10, kind, ...flat });
  if (state.entries.length > CAP) state.entries.splice(0, state.entries.length - CAP);
}

export function entries() { return state.entries.slice(); }
export function count() { return state.entries.length; }

/**
 * The trace as text, which is the format the ask is actually about: something
 * that survives being pasted into a chat window. Tab-free, one event per line,
 * with a header that says what build and what session produced it.
 */
export function asText(meta = null) {
  const head = [
    `TERMINAL VELOCITY playtest log`,
    `session ${new Date(state.started).toISOString()} · ${state.entries.length} events`,
  ];
  if (meta) {
    const b = meta.banked || {};
    const st = meta.stats || {};
    // A run flown under the test switch is not a normal run, and the person
    // reading this log did not necessarily fly it. It says so, first, before
    // any number that god mode could have produced.
    if (meta.godMode) head.push('*** GOD MODE WAS ON — resources granted, any body startable ***');
    const comp = Object.entries(meta.componentLevels || {}).map(([k, v]) => `${k}${v}`).join(' ');
    head.push(`components ${comp}`);
    head.push(`skills ${Object.keys(meta.purchasedSkills || {}).length} · equipped ${(meta.equipped && [meta.equipped.active, meta.equipped.active2, meta.equipped.passive].filter(Boolean).join('+')) || 'nothing'}`);
    head.push(`banked salvage ${b.salvage || 0} · data ${b.data || 0} · cores ${b.cores || 0}`);
    head.push(`career attempts ${st.attempts || 0} · landings ${st.landings || 0} · crashes ${st.crashes || 0} · hits ${st.hitsTaken || 0}`);
  }
  const body = state.entries.map((e) => {
    const { n, t, kind, ...rest } = e;
    const pairs = Object.entries(rest).map(([k, v]) => `${k}=${v}`).join(' ');
    return `${String(n).padStart(4, '0')}  ${String(t).padStart(7)}s  ${kind.padEnd(14)} ${pairs}`;
  });
  return [...head, '', ...body].join('\n');
}

/** The same trace as JSON, for anything that wants to compute over it. */
export function asJSON(meta = null) {
  return JSON.stringify({
    session: new Date(state.started).toISOString(),
    meta: meta ? {
      componentLevels: meta.componentLevels,
      purchasedSkills: meta.purchasedSkills,
      equipped: meta.equipped,
      banked: meta.banked,
      stats: meta.stats,
      gameCompleted: meta.gameCompleted,
      godMode: !!meta.godMode,
    } : null,
    events: state.entries,
  }, null, 2);
}
