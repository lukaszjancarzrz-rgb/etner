// Ikony PWA z public/icon.svg: `node scripts/icons.mjs` (sharp z pakietu serwera, bez nowej zależności).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const sharp = createRequire(new URL('../../server/package.json', import.meta.url))('sharp');
const pub = new URL('../public/', import.meta.url);
// ikona na białym tle; w PNG impuls zawsze granatowy (bez trybu ciemnego)
const svg = readFileSync(new URL('icon.svg', pub), 'utf8').replace(/<style>.*?<\/style>/, '').replace('class="n"', 'stroke="#262b6b"');
async function icon(file, size, scale) {
  const m = Math.round(size * scale);
  const mark = await sharp(Buffer.from(svg), { density: (72 * m) / 100 * 2 }).resize(m, m).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } })
    .composite([{ input: mark, left: Math.round((size - m) / 2), top: Math.round((size - m) / 2) }]).png().toFile(fileURLToPath(new URL(file, pub)));
}
await icon('icon-192.png', 192, 0.84);
await icon('icon-512.png', 512, 0.84);
await icon('apple-touch-icon.png', 180, 0.8);
await icon('icon-maskable-512.png', 512, 0.68); // strefa bezpieczna: koło o promieniu 40%
