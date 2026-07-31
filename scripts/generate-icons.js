import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function generateIcons() {
  const svgPath = path.resolve('public/icon.svg');
  const svgBuffer = fs.readFileSync(svgPath);

  const targets = [
    { name: 'public/apple-touch-icon.png', size: 180 },
    { name: 'public/apple-touch-icon-precomposed.png', size: 180 },
    { name: 'public/icon-192.png', size: 192 },
    { name: 'public/icon-512.png', size: 512 },
    { name: 'public/icon.png', size: 512 },
    { name: 'public/favicon.png', size: 192 },
  ];

  for (const t of targets) {
    await sharp(svgBuffer)
      .resize(t.size, t.size)
      .png({ quality: 100 })
      .toFile(path.resolve(t.name));
    console.log(`Generated ${t.name} (${t.size}x${t.size})`);
  }
}

generateIcons().catch(err => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
