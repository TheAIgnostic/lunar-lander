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

// Dependency order, derived from the import graph rather than hand-written.
//
// The hand-kept list caught real faults (M8's vanished namespace import, M15's
// load-order crash) but was itself a trip hazard: M17 hit it, and a module
// added to src/ but left off the list simply vanished from the bundle. Every
// file on disk is bundled now, sorted so each appears after everything it
// imports, and a cycle - which module concatenation cannot express and the
// architecture forbids anyway - fails the build loudly.
const onDisk = fs.readdirSync(path.join(root, 'src')).filter((f) => f.endsWith('.js')).sort();
const IMPORT_FROM_RE = /^import[\s\S]*?from\s+['"]\.\/([\w-]+\.js)['"]/gm;
const deps = {};
for (const name of onDisk) {
  const src = fs.readFileSync(path.join(root, 'src', name), 'utf8');
  deps[name] = [...src.matchAll(IMPORT_FROM_RE)].map((m) => m[1])
    .filter((f) => onDisk.includes(f));
}
const MODULES = [];
const state = {};                         // undefined -> visiting -> done
function visit(name, chain) {
  if (state[name] === 'done') return;
  if (state[name] === 'visiting') {
    console.error(`\nBUILD FAILED: import cycle ${[...chain, name].join(' -> ')}\n` +
      `Module concatenation cannot express a cycle, and the dependency graph is meant to be a DAG.\n`);
    process.exit(1);
  }
  state[name] = 'visiting';
  for (const d of deps[name]) visit(d, [...chain, name]);
  state[name] = 'done';
  MODULES.push(name);
}
for (const name of onDisk) visit(name, []);

// `import * as X from './y.js'` has no meaning once every module shares one
// scope, so each namespace object is rebuilt from that module's exports. This
// is derived rather than hand-listed: a hand-listed version silently missed
// `import * as Save` and shipped a bundle that threw on load.
const EXPORT_RE = /^export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
const NAMESPACE_RE = /import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"]\.\/([\w-]+)\.js['"]/g;

const exportsOf = {};
for (const name of MODULES) {
  const src = fs.readFileSync(path.join(root, 'src', name), 'utf8');
  exportsOf[name] = [...src.matchAll(EXPORT_RE)].map((m) => m[1]);
}

const namespaces = {};   // module file -> [alias, ...]
for (const name of MODULES) {
  const src = fs.readFileSync(path.join(root, 'src', name), 'utf8');
  for (const m of src.matchAll(NAMESPACE_RE)) {
    const file = `${m[2]}.js`;
    (namespaces[file] ||= []).push(m[1]);
  }
}

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
  const aliases = namespaces[name] || [];
  if (!aliases.length) return `${banner}\n${body}`;
  const rebuilt = aliases
    .map((alias) => `const ${alias} = { ${exportsOf[name].join(', ')} };`)
    .join('\n');
  return `${banner}\n${body}\n\n${rebuilt}`;
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
