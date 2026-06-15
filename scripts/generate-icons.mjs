// Genera todos los íconos de la PWA a partir de public/logo-source.png.
//
// Uso: npm run icons
// Salida (en public/):
//   - icon-192.png            (Android home screen)
//   - icon-512.png            (Android splash)
//   - icon-maskable-192.png   (Android adaptive con safe zone)
//   - icon-maskable-512.png   (Android adaptive grande)
//   - apple-touch-icon.png    (iOS Safari add-to-home)
//   - favicon-32.png          (browser tab)
//   - favicon-16.png          (browser tab pequeño)

import sharp from "sharp";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SRC = path.join(root, "public", "logo-source.png");
const OUT = path.join(root, "public");

// Color de fondo para maskables — debe matchear el `background_color` del manifest.
// Lo dejo blanco para que el círculo del logo resalte; cambiar si querés un fondo de marca.
const MASKABLE_BG = { r: 255, g: 255, b: 255, alpha: 1 };

async function ensureSource() {
  if (!existsSync(SRC)) {
    console.error(`\n❌ No se encontró el archivo fuente: ${SRC}`);
    console.error("   Guardá el logo (preferentemente con fondo transparente) en esa ruta y volvé a correr el script.\n");
    process.exit(1);
  }
}

// Resize manteniendo aspecto, sin padding extra. Para íconos "any" (Android, iOS, favicon).
async function generateAny(size, filename) {
  const out = path.join(OUT, filename);
  await sharp(SRC)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  ✓ ${filename} (${size}×${size})`);
}

// Maskable: agrega 10% de safe zone (el logo queda al 80% del canvas).
// Esto asegura que cuando Android recorta el ícono a círculo/squircle/teardrop,
// el contenido importante no se corta.
async function generateMaskable(size, filename) {
  const inner = Math.round(size * 0.8);
  const out = path.join(OUT, filename);

  // Render del logo al 80% sobre canvas con fondo sólido.
  const innerBuffer = await sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: MASKABLE_BG,
    },
  })
    .composite([{ input: innerBuffer, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(out);

  console.log(`  ✓ ${filename} (${size}×${size}, maskable con 10% safe zone)`);
}

async function main() {
  await ensureSource();
  await mkdir(OUT, { recursive: true });

  console.log("🎨 Generando íconos PWA...\n");

  await Promise.all([
    generateAny(192, "icon-192.png"),
    generateAny(512, "icon-512.png"),
    generateAny(180, "apple-touch-icon.png"),
    generateAny(32, "favicon-32.png"),
    generateAny(16, "favicon-16.png"),
    generateMaskable(192, "icon-maskable-192.png"),
    generateMaskable(512, "icon-maskable-512.png"),
  ]);

  console.log("\n✅ Listo. Los íconos están en public/.\n");
}

main().catch((err) => {
  console.error("\n❌ Error generando íconos:", err);
  process.exit(1);
});
