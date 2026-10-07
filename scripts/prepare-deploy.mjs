/**
 * Build the Cloudflare Pages deploy folder (_deploy) for the PUBLIC website.
 *
 *   site-v2/  ──►  _deploy/  ──►  Cloudflare Pages
 *
 * The approved public site is the static, self-contained site in site-v2/.
 * Its contents become the site ROOT (site-v2/index.html -> _deploy/index.html).
 * Nothing from the old root-level website (index.html, css/, js/, images/ ...)
 * is copied. The portal (portal/) is a separate app and is never published.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'site-v2');
const outDir = path.join(root, '_deploy');
const MAX_BYTES = 24 * 1024 * 1024;

// Directory names that are never published, at any depth.
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', '.github', '.wrangler', '.vercel', '_deploy',
  'scripts', 'portal', '_review', 'academy images',
]);

// Exact file names that are never published (build/dev/notes files).
const EXCLUDE_FILES = new Set([
  'package.json', 'package-lock.json', 'wrangler.toml', '.gitignore',
  'build.py', 'CONTENT_REVIEW.md', 'DESIGN.md', 'README.md',
  'deploy.ps1', 'prepare-upload.ps1', 'deploy.log',
]);

// Pattern-based exclusions: env files, logs, plan/notes files, Python, maps of secrets.
const EXCLUDE_PATTERNS = [
  /^\.env(\..*)?$/i,          // .env, .env.local, .env.production ...
  /\.log$/i,
  /\.plan\.md$/i,
  /\.py$/i,
  /^\.DS_Store$/i,
  /^Thumbs\.db$/i,
];

function shouldSkip(relPath, isDir) {
  const parts = relPath.replace(/\\/g, '/').split('/');
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return true;
  if (isDir) return false;
  const name = parts[parts.length - 1];
  return EXCLUDE_FILES.has(name) || EXCLUDE_PATTERNS.some((re) => re.test(name));
}

function copyRecursive(src, dest, rel = '') {
  let skippedLarge = 0;
  for (const name of fs.readdirSync(src)) {
    const relPath = rel ? `${rel}/${name}` : name;
    const srcPath = path.join(src, name);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      if (shouldSkip(relPath, true)) continue;
      fs.mkdirSync(path.join(dest, name), { recursive: true });
      skippedLarge += copyRecursive(srcPath, path.join(dest, name), relPath);
      continue;
    }
    if (shouldSkip(relPath, false)) continue;
    if (stat.size > MAX_BYTES) {
      console.warn(`  skip (>${MAX_BYTES / 1024 / 1024} MiB): ${relPath}`);
      skippedLarge++;
      continue;
    }
    fs.mkdirSync(dest, { recursive: true });
    fs.copyFileSync(srcPath, path.join(dest, name));
  }
  return skippedLarge;
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) { out.push({ p, dir: true }); walk(p, out); }
    else out.push({ p, dir: false });
  }
  return out;
}

// ── 1. Source must be the approved site ─────────────────────────────────────
if (!fs.existsSync(path.join(srcDir, 'index.html'))) {
  console.error('ABORT: site-v2/index.html not found. Refusing to build.');
  process.exit(1);
}

// ── 2. Fresh output folder ──────────────────────────────────────────────────
if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

console.log('Copying site-v2 -> _deploy ...');
const skipped = copyRecursive(srcDir, outDir);

// ── 3. Security headers (Cloudflare Pages _headers) ─────────────────────────
// site-v2 has none of its own; reuse the reviewed repo-root _headers file.
if (!fs.existsSync(path.join(outDir, '_headers')) && fs.existsSync(path.join(root, '_headers'))) {
  fs.copyFileSync(path.join(root, '_headers'), path.join(outDir, '_headers'));
}

// ── 4. Retire the OLD site's service worker ─────────────────────────────────
// The old site registered /sw.js and cached its pages (cache "sch-v1.x").
// Returning visitors would keep seeing the old site. This replacement worker
// deletes those caches, unregisters itself and reloads open tabs.
fs.writeFileSync(path.join(outDir, 'sw.js'), `// Retires the previous site's service worker. Safe to keep.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) {}
    try { await self.registration.unregister(); } catch (e) {}
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => c.navigate(c.url));
    } catch (e) {}
  })());
});
`);

// ── 5. Guards: fail the build rather than publish something unsafe ─────────
const entries = walk(outDir);
const problems = [];
if (!fs.existsSync(path.join(outDir, 'index.html'))) problems.push('_deploy/index.html missing');
if (Buffer.compare(fs.readFileSync(path.join(outDir, 'index.html')), fs.readFileSync(path.join(srcDir, 'index.html'))) !== 0) {
  problems.push('_deploy/index.html is not site-v2/index.html');
}
const SECRET_RES = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /\bsk_(live|test)_[A-Za-z0-9]{10,}/,
  /\bre_[A-Za-z0-9_]{20,}/,
  /\bsb_secret_[A-Za-z0-9_-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(SERVICE_ROLE_KEY|PAYSTACK_SECRET_KEY|RESEND_API_KEY)\s*[=:]\s*["']?[A-Za-z0-9_.-]{16,}/,
];
let files = 0;
for (const e of entries) {
  const rel = path.relative(outDir, e.p).replace(/\\/g, '/');
  const segs = rel.split('/');
  if (segs.some((s) => /^\.env/i.test(s))) problems.push(`env file/dir present: ${rel}`);
  if (segs.includes('portal')) problems.push(`portal present: ${rel}`);
  if (segs.some((s) => ['.git', '.wrangler', '.vercel', 'node_modules', 'scripts', '.github'].includes(s))) problems.push(`forbidden dir: ${rel}`);
  if (e.dir) continue;
  files++;
  const text = fs.readFileSync(e.p);
  if (text.length < 5 * 1024 * 1024 && SECRET_RES.some((re) => re.test(text.toString('latin1')))) {
    problems.push(`possible secret in: ${rel}`);
  }
}
if (problems.length) {
  console.error('\nABORT: unsafe deploy folder:\n - ' + problems.join('\n - '));
  process.exit(1);
}

console.log(`\nReady: ${outDir} (${files} files) — source: site-v2/`);
if (skipped) console.log(`Skipped ${skipped} oversized file(s).`);
