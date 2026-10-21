/**
 * Tests for scripts/prepare-deploy.mjs failure handling.   Run:  node --test scripts/prepare-deploy.test.mjs
 * Each test copies the real script into a throwaway repository in the system temp folder;
 * the actual repository, site-v2/ and _deploy/ are never touched.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'prepare-deploy.mjs');

function makeRepo(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sch-deploy-test-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const w = (rel, body) => {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), body);
  };
  w('scripts/prepare-deploy.mjs', fs.readFileSync(SCRIPT));
  w('_headers', '/*\n  X-Frame-Options: DENY\n');
  w('site-v2/index.html', '<!doctype html><title>One company. Four Synergy businesses.</title>');
  w('site-v2/capture-films/index.html', '<!doctype html><title>Capture Films</title>');
  w('site-v2/_redirects', '/creative/ /creative-hub/ 301\n');
  w('site-v2/sitemap.xml', '<urlset></urlset>');
  w('site-v2/assets/css/sch.css', 'body{}');
  // Repository files outside site-v2 that must never be published or deleted.
  w('index.html', 'OLD ROOT SITE');
  w('portal/.env.local', 'SUPABASE_SERVICE_ROLE_KEY=should-never-ship');
  w('_deploy.keep/note.txt', 'unrelated');
  w('_deployment/note.txt', 'unrelated');
  return { repo, w };
}

const run = (repo) => spawnSync(process.execPath, [path.join(repo, 'scripts', 'prepare-deploy.mjs')], { encoding: 'utf8' });
const exists = (repo, rel) => fs.existsSync(path.join(repo, rel));
const read = (repo, rel) => fs.readFileSync(path.join(repo, rel), 'utf8');

function assertNothingDeployable(repo, r) {
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /ABORT/);
  assert.ok(!exists(repo, '_deploy'), '_deploy must not exist after a failed run');
  assert.ok(!exists(repo, '_deploy.staging'), 'staging folder must be cleaned up');
}

function assertUnrelatedIntact(repo) {
  for (const f of ['index.html', 'portal/.env.local', '_deploy.keep/note.txt', '_deployment/note.txt', 'site-v2/index.html']) {
    assert.ok(exists(repo, f), `unrelated file deleted: ${f}`);
  }
}

test('normal packaging builds _deploy from site-v2 with _headers and sw.js', (t) => {
  const { repo } = makeRepo(t);
  const r = run(repo);
  assert.equal(r.status, 0, r.stderr);
  assert.match(read(repo, '_deploy/index.html'), /Four Synergy businesses/);
  for (const f of ['capture-films/index.html', '_redirects', 'sitemap.xml', 'assets/css/sch.css', '_headers', 'sw.js']) {
    assert.ok(exists(repo, `_deploy/${f}`), f);
  }
  assert.match(read(repo, '_deploy/sw.js'), /unregister/);
  assert.ok(!exists(repo, '_deploy.staging'));
  assert.ok(!exists(repo, '_deploy/portal') && !exists(repo, '_deploy/scripts'));
  assertUnrelatedIntact(repo);
});

test('missing site-v2/index.html fails and removes a previous _deploy', (t) => {
  const { repo, w } = makeRepo(t);
  w('_deploy/index.html', 'STALE PREVIOUS BUILD');
  fs.rmSync(path.join(repo, 'site-v2/index.html'));
  assertNothingDeployable(repo, run(repo));
  for (const f of ['index.html', 'portal/.env.local', '_deploy.keep/note.txt', '_deployment/note.txt', 'site-v2/capture-films/index.html']) {
    assert.ok(exists(repo, f), `unrelated file deleted: ${f}`);
  }
});

test('missing site-v2 fails safely', (t) => {
  const { repo, w } = makeRepo(t);
  w('_deploy/index.html', 'STALE PREVIOUS BUILD');
  fs.rmSync(path.join(repo, 'site-v2'), { recursive: true });
  assertNothingDeployable(repo, run(repo));
});

test('forbidden folders and env files in the source are excluded', (t) => {
  const { repo, w } = makeRepo(t);
  w('site-v2/portal/.env.local', 'SECRET');
  w('site-v2/.env', 'SECRET');
  w('site-v2/.env.production', 'SECRET');
  w('site-v2/node_modules/x/index.js', 'x');
  w('site-v2/.git/config', 'x');
  w('site-v2/_review/held/photo.jpg', 'x');
  w('site-v2/build.py', 'print()');
  w('site-v2/DESIGN.md', '#');
  const r = run(repo);
  assert.equal(r.status, 0, r.stderr);
  for (const f of ['portal', '.env', '.env.production', 'node_modules', '.git', '_review', 'build.py', 'DESIGN.md']) {
    assert.ok(!exists(repo, `_deploy/${f}`), `${f} must not be published`);
  }
});

test('a secret in a page is rejected and leaves nothing deployable', (t) => {
  const { repo, w } = makeRepo(t);
  assert.equal(run(repo).status, 0);           // a good _deploy exists first
  w('site-v2/about/index.html', 'key sk_live_ABCDEFGHIJKLMNOPQR');
  const r = run(repo);
  assertNothingDeployable(repo, r);
  assert.match(r.stderr, /possible secret in: about\/index\.html/);
  assertUnrelatedIntact(repo);
});

test('a copy error part-way through leaves no partial _deploy', (t) => {
  const { repo } = makeRepo(t);
  // A dangling symlink makes the copy throw mid-way (works without special permissions).
  try { fs.symlinkSync(path.join(repo, 'does-not-exist'), path.join(repo, 'site-v2', 'zz-broken')); }
  catch (e) { t.skip(`cannot create symlinks here (${e.code})`); return; }
  const r = run(repo);
  assertNothingDeployable(repo, r);
  assertUnrelatedIntact(repo);
});

test('a leftover staging folder is replaced, and a later good run recovers', (t) => {
  const { repo, w } = makeRepo(t);
  w('_deploy.staging/stale.txt', 'from a killed run');
  w('site-v2/about/index.html', 'sk_live_ABCDEFGHIJKLMNOPQR');
  assertNothingDeployable(repo, run(repo));
  w('site-v2/about/index.html', '<!doctype html><title>About</title>');
  const r = run(repo);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(exists(repo, '_deploy/about/index.html') && !exists(repo, '_deploy/stale.txt'));
  assert.ok(!exists(repo, '_deploy.staging'));
  assertUnrelatedIntact(repo);
});
