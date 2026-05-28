/**
 * Build a Cloudflare-safe deploy folder (_deploy).
 * Excludes node_modules, git, local videos, and any file over 24 MiB.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, '_deploy');
const MAX_BYTES = 24 * 1024 * 1024;

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  '_deploy',
  '.github',
  'academy images',
  'scripts',
]);

const EXCLUDE_DIR_PREFIXES = ['images/albums/videos'];

const EXCLUDE_FILES = new Set([
  'package.json',
  'package-lock.json',
  'tailwind.config.js',
  'deploy.ps1',
  'prepare-upload.ps1',
  '.gitignore',
  'wrangler.toml',
  'README.md',
]);

function shouldSkip(relPath, isDir) {
  const normalized = relPath.replace(/\\/g, '/');
  if (EXCLUDE_DIR_PREFIXES.some((p) => normalized === p || normalized.startsWith(p + '/'))) {
    return true;
  }
  const parts = normalized.split('/');
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return true;
  if (!isDir && EXCLUDE_FILES.has(parts[parts.length - 1])) return true;
  if (!isDir && parts[parts.length - 1] === 'tailwind.input.css') return true;
  return false;
}

function copyRecursive(src, dest, rel = '') {
  let skippedLarge = 0;

  for (const name of fs.readdirSync(src)) {
    const relPath = rel ? `${rel}/${name}` : name;
    const srcPath = path.join(src, name);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      if (shouldSkip(relPath, true)) continue;
      const destPath = path.join(dest, name);
      fs.mkdirSync(destPath, { recursive: true });
      skippedLarge += copyRecursive(srcPath, destPath, relPath);
      continue;
    }

    if (shouldSkip(relPath, false)) continue;

    if (stat.size > MAX_BYTES) {
      console.warn(`  skip (>${Math.round(MAX_BYTES / 1024 / 1024)} MiB): ${relPath} (${(stat.size / 1024 / 1024).toFixed(1)} MiB)`);
      skippedLarge++;
      continue;
    }

    fs.mkdirSync(path.dirname(path.join(dest, name)), { recursive: true });
    fs.copyFileSync(srcPath, path.join(dest, name));
  }

  return skippedLarge;
}

console.log('Building Tailwind CSS...');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

console.log('Copying site files to _deploy...');
const skipped = copyRecursive(root, outDir);

let count = 0;
function countFiles(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) countFiles(p);
    else count++;
  }
}
countFiles(outDir);

console.log(`\nReady: ${outDir} (${count} files)`);
if (skipped) console.log(`Skipped ${skipped} oversized file(s). Host large videos on Cloudinary/YouTube, not Pages.`);
