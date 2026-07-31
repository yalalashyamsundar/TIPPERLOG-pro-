const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- Warm Golden Yellow Background -->
  <rect width="512" height="512" fill="#FFC107" />
  
  <g fill="none" stroke="#0d0d0d" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
    <!-- Cargo Box (Rear Container) -->
    <rect x="114" y="132" width="160" height="196" rx="28" ry="28" fill="none" />
    
    <!-- Cab Body (Front Section) -->
    <path d="M 274 186 L 334 186 L 394 248 L 394 328 L 274 328 Z" fill="none" />
    
    <!-- Cab Window -->
    <path d="M 296 212 L 328 212 L 368 254 L 368 292 L 296 292 Z" fill="none" stroke-width="20" />
    
    <!-- Wheels -->
    <!-- Rear Wheel -->
    <circle cx="190" cy="338" r="42" fill="#0d0d0d" stroke="none" />
    <circle cx="190" cy="338" r="14" fill="#FFC107" stroke="none" />
    
    <!-- Front Wheel -->
    <circle cx="334" cy="338" r="42" fill="#0d0d0d" stroke="none" />
    <circle cx="334" cy="338" r="14" fill="#FFC107" stroke="none" />
  </g>
</svg>`;

const publicDir = path.join(__dirname, '../public');
const svgPath = path.join(publicDir, 'icon.svg');

fs.writeFileSync(svgPath, svgContent);

const sizes = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon.png', size: 512 },
  { name: 'favicon.png', size: 64 },
];

async function generateIcons() {
  console.log('Generating PNG icons using sharp...');
  const svgBuffer = Buffer.from(svgContent);

  for (const item of sizes) {
    const outputPath = path.join(publicDir, item.name);
    await sharp(svgBuffer)
      .resize(item.size, item.size)
      .png()
      .toFile(outputPath);
    console.log(`Rendered ${item.name} (${item.size}x${item.size})`);
  }
  console.log('All app icons generated successfully!');
}

generateIcons().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
