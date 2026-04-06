/**
 * Скачивает portable node.exe (Windows x64) в apps/admin-desktop/vendor/node-win/
 * для запуска встроенного Next из Electron.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const NODE_VERSION = process.env.DESKTOP_NODE_VERSION || "20.18.1";
const ZIP_NAME = `node-v${NODE_VERSION}-win-x64.zip`;
const URL = `https://nodejs.org/dist/v${NODE_VERSION}/${ZIP_NAME}`;

const root = path.join(__dirname, "..");
const vendorDir = path.join(root, "apps", "admin-desktop", "vendor", "node-win");
const nodeExe = path.join(vendorDir, "node.exe");
const zipPath = path.join(vendorDir, ZIP_NAME);

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const f = fs.createWriteStream(dest);
    const req = (u) => {
      https
        .get(u, (res) => {
          if (res.statusCode === 302 || res.statusCode === 301) {
            req(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          res.pipe(f);
          f.on("finish", () => f.close(resolve));
        })
        .on("error", reject);
    };
    req(url);
  });
}

async function main() {
  if (fs.existsSync(nodeExe)) {
    console.log("fetch-node-win: node.exe уже есть:", nodeExe);
    return;
  }

  fs.mkdirSync(vendorDir, { recursive: true });

  console.log("fetch-node-win: загрузка", URL);
  await download(URL, zipPath);

  console.log("fetch-node-win: распаковка…");
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${vendorDir.replace(/'/g, "''")}' -Force"`,
    { stdio: "inherit" }
  );

  const extracted = path.join(vendorDir, `node-v${NODE_VERSION}-win-x64`, "node.exe");
  if (fs.existsSync(extracted)) {
    fs.copyFileSync(extracted, nodeExe);
    fs.rmSync(path.join(vendorDir, `node-v${NODE_VERSION}-win-x64`), { recursive: true, force: true });
  }
  try {
    fs.unlinkSync(zipPath);
  } catch (_) {}

  if (!fs.existsSync(nodeExe)) {
    console.error("fetch-node-win: не удалось получить node.exe");
    process.exit(1);
  }
  console.log("fetch-node-win:", nodeExe);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
