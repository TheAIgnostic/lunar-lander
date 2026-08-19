#!/usr/bin/env node
// Static dev server. The only reason this exists instead of `python3 -m
// http.server` is caching: ES modules are cached hard, and a reload after
// editing src/ would happily serve the previous file - which has cost real
// debugging time more than once. Everything here goes out `no-store`.
//
//   node serve.js [port]        default 8791

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const port = Number(process.argv[2] || process.env.PORT || 8791);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  // Never serve outside the project, whatever the request says.
  const file = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, body) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store, must-revalidate',
    }).end(body);
  });
}).listen(port, () => {
  console.log(`serving ${root} on http://localhost:${port}  (no-store, so edits always land)`);
});
