#!/usr/bin/env node
// Bundles the game into one self-contained HTML file that runs from a
// double-click - no server, no network. The modules are concatenated into a
// single inline <script type="module">, which browsers happily execute from
// file:// (only *external* module files are blocked there).
//
//   node build.js   ->  dist/terminal-velocity.html

const fs = require('fs');
const path = require('path');

const root = __dirname;
const dist = path.join(root, 'dist');

// Dependency order: every module must appear after everything it imports.
const MODULES = [
  'util.js', 'audio.js', 'input.js', 'levels.js',
  'archetypes.js', 'planets.js', 'missions.js', 'terrain.js', 'spawn.js', 'validate.js', 'particles.js', 'landing.js', 'ship.js', 'debug.js', 'render.js', 'main.js',
];

// A module added to src/ but not listed above would simply vanish from the
// bundle, so refuse to build instead.
const onDisk = fs.readdirSync(path.join(root, 'src')).filter((f) => f.endsWith('.js')).sort();
const missing = onDisk.filter((f) => !MODULES.includes(f));
if (missing.length) {
  console.error(`\nBUILD FAILED: src/${missing.join(', src/')} not listed in MODULES.\n` +
    `Add it in dependency order (after everything it imports).\n`);
  process.exit(1);
}

// main.js uses `import * as R from './render.js'`, so the namespace object has
// to be rebuilt by hand once render's declarations are in scope.
const R_NAMESPACE = ['buildBackdrop', 'drawBackground', 'drawTerrain', 'drawShip', 'drawTrajectory', 'drawHUD'];

function stripModuleSyntax(src) {
  return src
    // drop `import ... from '...';` (single and multi-line forms)
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^import\s+['"][^'"]+['"];?\s*$/gm, '')
    // `export const X` -> `const X`, `export function`, `export class`
    .replace(/^export\s+(const|let|var|function|class)\b/gm, '$1')
    // bare `export { a, b };`
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
}

const parts = MODULES.map((name) => {
  const src = fs.readFileSync(path.join(root, 'src', name), 'utf8');
  const body = stripModuleSyntax(src).trim();
  const banner = `/* ---------- src/${name} ---------- */`;
  if (name === 'render.js') {
    return `${banner}\n${body}\n\nconst R = { ${R_NAMESPACE.join(', ')} };`;
  }
  return `${banner}\n${body}`;
});

// Concatenating modules into one scope means two files cannot declare the same
// top-level name. Catch that here with a clear message rather than as a blank
// page at runtime.
const seen = new Map();
const DECL = /^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
MODULES.forEach((name, i) => {
  const src = fs.readFileSync(path.join(root, 'src', name), 'utf8');
  for (const m of src.matchAll(DECL)) {
    const sym = m[1];
    if (seen.has(sym)) {
      console.error(`\nBUILD FAILED: '${sym}' is declared at top level in both ` +
        `src/${seen.get(sym)} and src/${name}.\nThe bundle puts every module in one scope - rename one of them.\n`);
      process.exit(1);
    }
    seen.set(sym, name);
  }
});

const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Reuse the real index.html body so the markup never drifts from the source.
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1]
  .replace(/\s*<script[\s\S]*?<\/script>/g, '')
  .trim();
// The favicon href is an inline SVG data URI containing '>' characters, so it
// has to be matched to end-of-line rather than to the first '>'.
const favicon = html.match(/^<link rel="icon".*$/m)[0];

const out = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<title>TERMINAL VELOCITY — a vector lander</title>
<meta name="theme-color" content="#05060c" />
${favicon}
<style>
${css}
</style>
</head>
<body>
${body}
<script type="module">
${parts.join('\n\n')}
</script>
</body>
</html>
`;

fs.mkdirSync(dist, { recursive: true });
const target = path.join(dist, 'terminal-velocity.html');
fs.writeFileSync(target, out);
console.log(`${target}  ${(Buffer.byteLength(out) / 1024).toFixed(1)} KB`);
