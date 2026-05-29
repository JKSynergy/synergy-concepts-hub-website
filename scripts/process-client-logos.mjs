/**
 * Process client logos for the showcase section.
 * - Prefers files already in images/clients/ (your edited replacements)
 * - Falls back to client logos/ source files
 * - Removes near-white/near-black matte backgrounds
 * - Outputs transparent PNGs (never overwrites your file if it already has alpha)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'images', 'clients');
const sourceDir = path.join(root, 'client logos');

const CLIENTS = [
  { id: 'afrisites', sources: ['afrisites.png', 'afrisites.webp', 'afrisites logo.png'] },
  { id: 'davy', sources: ['davy.png', 'davy.webp', 'DAVY LOGO.png'] },
  { id: 'destination-diani', sources: ['destination-diani.png', 'destination-diani.webp', 'Destination Diani.png'] },
  { id: 'diani-art-gallery', sources: ['diani-art-gallery.png', 'diani-art-gallery.webp', 'Diani Art Gallery.png'] },
  { id: 'elgon', sources: ['elgon.png', 'elgon.webp', 'Elgon Logo.png', 'Elgon Logo copy.jpg'] },
  { id: 'octagon', sources: ['octagon.png', 'octagon.webp', 'Octagon_logo.png'] },
  { id: 'quickcredit', sources: ['quickcredit.png', 'quickcredit.webp', 'Quick Credit white.png', 'Quick Credit Square.png'] },
  { id: 'synergy-academy', sources: ['synergy-academy.png', 'synergy-academy.webp', 'SMA LOGO  TRANSPARENT-02.png', 'SMA LOGO  TRANSPARENT-06.png'] },
  { id: 'solvers', sources: ['solvers.png', 'solvers.webp', 'Solvers logo.jpg'] },
];

function resolveInput(sources) {
  for (const name of sources) {
    const inClients = path.join(outDir, name);
    if (fs.existsSync(inClients)) return inClients;
    const inSource = path.join(sourceDir, name);
    if (fs.existsSync(inSource)) return inSource;
  }
  return null;
}

function hasTransparency(data, channels, width, height) {
  if (channels < 4) return false;
  const step = Math.max(1, Math.floor((width * height) / 4000));
  let transparent = 0;
  let sampled = 0;
  for (let i = 0; i < width * height; i += step) {
    const o = i * channels;
    sampled++;
    if (data[o + 3] < 200) transparent++;
  }
  return sampled > 0 && transparent / sampled > 0.08;
}

async function stripMatte(inputPath, outputPath) {
  const pipeline = sharp(inputPath).ensureAlpha().resize(560, 200, {
    fit: 'inside',
    withoutEnlargement: false,
  });

  const { data, info } = await pipeline
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;

  if (hasTransparency(data, channels, width, height)) {
    await sharp(data, { raw: { width, height, channels } })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(outputPath);
    return 'kept-alpha';
  }

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const isWhite = r > 232 && g > 232 && b > 232;
    const isBlack = r < 28 && g < 28 && b < 28;
    if (isWhite || isBlack) data[i + 3] = 0;
  }

  await sharp(data, { raw: { width, height, channels } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);

  return 'stripped-matte';
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  for (const client of CLIENTS) {
    const input = resolveInput(client.sources);
    const output = path.join(outDir, `${client.id}.png`);

    if (!input) {
      console.warn(`  skip (missing): ${client.id}`);
      continue;
    }

    const mode = await stripMatte(input, output);
    const stat = fs.statSync(output);
    console.log(`  ${client.id}.png ← ${path.basename(input)} (${mode}, ${Math.round(stat.size / 1024)} KB)`);
  }

  // Remove old webp deploy artifacts so only PNGs are used
  for (const name of fs.readdirSync(outDir)) {
    if (name.endsWith('.webp') || name.endsWith('-opt.webp')) {
      try {
        fs.unlinkSync(path.join(outDir, name));
        console.log(`  removed legacy: ${name}`);
      } catch {
        console.warn(`  could not remove (in use): ${name}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
