/**
 * После правки resources/app-icon.svg: npm run icons -w @yanak/admin-desktop
 * sharp — из корневого node_modules; to-ico — devDependency пакета admin-desktop.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const toIco = require("to-ico");

const root = path.join(__dirname, "..");
const svgPath = path.join(root, "resources", "app-icon.svg");
const pngPath = path.join(root, "build", "icon.png");
const icoPath = path.join(root, "build", "icon.ico");

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  if (!fs.existsSync(svgPath)) {
    console.error("Нет файла:", svgPath);
    process.exit(1);
  }
  const svg = fs.readFileSync(svgPath);
  fs.mkdirSync(path.dirname(pngPath), { recursive: true });

  const pngBuffers = await Promise.all(
    ICO_SIZES.map((s) => sharp(svg).resize(s, s).png().toBuffer())
  );
  const icoBuf = await toIco(pngBuffers);
  fs.writeFileSync(icoPath, icoBuf);

  await sharp(svg).resize(512, 512).png().toFile(pngPath);

  console.log("generate-icon:", icoPath, pngPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
