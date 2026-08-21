// One icon per body, for the route screen.
//
// The route card used to be five lines of forecast text with a coloured name on
// top, and at four cards it read as a spreadsheet. A body should be recognisable
// before you read anything, so each of the ten gets a mark drawn from what makes
// it different to fly: Europa's cracks, Io's calderas, Enceladus venting from
// the south, Titan's haze sitting well off the surface.
//
// Plain inline SVG, no external assets, sized by the caller. `accent` is passed
// in so a card stays consistent with the world palette the rest of the UI uses.

const ICONS = {
  LUNA: (a) => `
    <circle cx="24" cy="24" r="17" fill="none" stroke="${a}" stroke-width="2"/>
    <circle cx="18" cy="19" r="4.5" fill="none" stroke="${a}" stroke-width="1.4" opacity="0.8"/>
    <circle cx="30" cy="28" r="3" fill="none" stroke="${a}" stroke-width="1.2" opacity="0.7"/>
    <circle cx="27" cy="16" r="1.8" fill="none" stroke="${a}" stroke-width="1.1" opacity="0.6"/>
    <circle cx="17" cy="31" r="2.2" fill="none" stroke="${a}" stroke-width="1.1" opacity="0.6"/>`,

  MARS: (a) => `
    <circle cx="24" cy="24" r="17" fill="none" stroke="${a}" stroke-width="2"/>
    <path d="M9 19 q15 5 30 -1" fill="none" stroke="${a}" stroke-width="1.3" opacity="0.75"/>
    <path d="M8 27 q16 6 32 -2" fill="none" stroke="${a}" stroke-width="1.3" opacity="0.55"/>
    <path d="M17 9.5 a17 17 0 0 1 14 0" fill="none" stroke="${a}" stroke-width="2" opacity="0.9"/>`,

  MERCURY: (a) => `
    <circle cx="24" cy="24" r="17" fill="none" stroke="${a}" stroke-width="2"/>
    <circle cx="20" cy="20" r="5.5" fill="none" stroke="${a}" stroke-width="1.4" opacity="0.85"/>
    <circle cx="31" cy="30" r="3.4" fill="none" stroke="${a}" stroke-width="1.2" opacity="0.7"/>
    <circle cx="15" cy="30" r="2" fill="none" stroke="${a}" stroke-width="1.1" opacity="0.6"/>
    <path d="M36 13 l5 -5 M39 19 l6 -3" stroke="${a}" stroke-width="1.6" opacity="0.9"/>`,

  VENUS: (a) => `
    <circle cx="24" cy="24" r="17" fill="none" stroke="${a}" stroke-width="2"/>
    <path d="M9 17 q15 4 30 0" fill="none" stroke="${a}" stroke-width="2" opacity="0.85"/>
    <path d="M7.5 24 q16 5 33 0" fill="none" stroke="${a}" stroke-width="2" opacity="0.7"/>
    <path d="M9 31 q15 4 30 0" fill="none" stroke="${a}" stroke-width="2" opacity="0.55"/>`,

  TITAN: (a) => `
    <circle cx="24" cy="24" r="13" fill="none" stroke="${a}" stroke-width="2"/>
    <circle cx="24" cy="24" r="18.5" fill="none" stroke="${a}" stroke-width="1.3" opacity="0.55"/>
    <circle cx="24" cy="24" r="21.5" fill="none" stroke="${a}" stroke-width="1" opacity="0.3"/>
    <path d="M13 26 q11 4 22 0" fill="none" stroke="${a}" stroke-width="1.2" opacity="0.7"/>`,

  EUROPA: (a) => `
    <circle cx="24" cy="24" r="17" fill="none" stroke="${a}" stroke-width="2"/>
    <path d="M8 21 l12 3 l9 -4 l11 4" fill="none" stroke="${a}" stroke-width="1.4" opacity="0.9"/>
    <path d="M10 31 l10 -3 l8 4 l12 -2" fill="none" stroke="${a}" stroke-width="1.2" opacity="0.7"/>
    <path d="M20 8 l3 9 l-4 7" fill="none" stroke="${a}" stroke-width="1.1" opacity="0.6"/>`,

  ENCELADUS: (a) => `
    <circle cx="24" cy="24" r="14" fill="none" stroke="${a}" stroke-width="2"/>
    <path d="M19 37 l-3 9 M24 38 l0 10 M29 37 l3 9" stroke="${a}" stroke-width="1.6" opacity="0.85"/>
    <path d="M15 30 q9 4 18 0" fill="none" stroke="${a}" stroke-width="1.2" opacity="0.6"/>`,

  IO: (a) => `
    <circle cx="24" cy="24" r="17" fill="none" stroke="${a}" stroke-width="2"/>
    <circle cx="19" cy="21" r="3.6" fill="none" stroke="${a}" stroke-width="1.6"/>
    <circle cx="19" cy="21" r="1.3" fill="${a}"/>
    <circle cx="30" cy="29" r="2.8" fill="none" stroke="${a}" stroke-width="1.4" opacity="0.85"/>
    <circle cx="30" cy="29" r="1" fill="${a}" opacity="0.85"/>
    <circle cx="28" cy="16" r="1.8" fill="none" stroke="${a}" stroke-width="1.2" opacity="0.7"/>`,

  PLUTO: (a) => `
    <circle cx="24" cy="24" r="16" fill="none" stroke="${a}" stroke-width="2"/>
    <path d="M18 20 q6 -5 11 1 q4 6 -2 11 q-5 4 -9 -1 q-4 -6 0 -11 z"
          fill="none" stroke="${a}" stroke-width="1.4" opacity="0.85"/>
    <circle cx="40" cy="13" r="3.5" fill="none" stroke="${a}" stroke-width="1.2" opacity="0.6"/>`,

  GANYMEDE: (a) => `
    <circle cx="24" cy="24" r="17" fill="none" stroke="${a}" stroke-width="2"/>
    <path d="M10 18 q14 3 28 -1" fill="none" stroke="${a}" stroke-width="1.5" opacity="0.85"/>
    <path d="M8 24 q16 4 32 -1" fill="none" stroke="${a}" stroke-width="1.5" opacity="0.7"/>
    <path d="M10 30 q14 4 28 -1" fill="none" stroke="${a}" stroke-width="1.5" opacity="0.55"/>
    <path d="M20 8 l-2 32" fill="none" stroke="${a}" stroke-width="1.1" opacity="0.45"/>`,
};

/** Inline SVG for a body, drawn in `accent`. Unknown ids get a plain disc. */
export function planetIcon(planetId, accent = '#5ff5ff', size = 48) {
  const draw = ICONS[planetId]
    || ((a) => `<circle cx="24" cy="24" r="17" fill="none" stroke="${a}" stroke-width="2"/>`);
  return `<svg class="planet-icon" width="${size}" height="${size}" viewBox="0 0 48 48"
    aria-hidden="true" focusable="false">${draw(accent)}</svg>`;
}

