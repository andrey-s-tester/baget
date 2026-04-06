/**
 * Собирает apps/backoffice (standalone) и копирует в apps/admin-desktop/bundled-ui
 * для встраивания в Electron — локальный UI без загрузки внешнего URL.
 *
 * Запуск из корня репозитория: node scripts/prepare-desktop-bundled-ui.cjs
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const backoffice = path.join(root, "apps", "backoffice");
const standaloneSrc = path.join(backoffice, ".next", "standalone");
const staticSrc = path.join(backoffice, ".next", "static");
const dest = path.join(root, "apps", "admin-desktop", "bundled-ui");

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

console.log("prepare-desktop-bundled-ui: next build backoffice…");
execSync("npm run build -w apps/backoffice", { cwd: root, stdio: "inherit" });

if (!fs.existsSync(standaloneSrc)) {
  console.error("Нет", standaloneSrc, "— проверьте output: standalone в next.config.mjs");
  process.exit(1);
}

console.log("prepare-desktop-bundled-ui: копирование standalone → bundled-ui…");
rmrf(dest);
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(standaloneSrc, dest, { recursive: true });

const staticDest = path.join(dest, "apps", "backoffice", ".next", "static");
if (!fs.existsSync(staticSrc)) {
  console.error("Нет", staticSrc);
  process.exit(1);
}
fs.mkdirSync(staticDest, { recursive: true });
fs.cpSync(staticSrc, staticDest, { recursive: true });

const publicSrc = path.join(backoffice, "public");
const publicDest = path.join(dest, "apps", "backoffice", "public");
if (fs.existsSync(publicSrc)) {
  fs.mkdirSync(path.dirname(publicDest), { recursive: true });
  fs.cpSync(publicSrc, publicDest, { recursive: true });
}

const serverJs = path.join(dest, "apps", "backoffice", "server.js");
if (!fs.existsSync(serverJs)) {
  console.error("Не найден server.js:", serverJs);
  process.exit(1);
}

console.log("prepare-desktop-bundled-ui: готово →", dest);
