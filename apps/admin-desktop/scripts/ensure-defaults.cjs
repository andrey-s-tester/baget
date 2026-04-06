/**
 * Перед сборкой: если нет сгенерированного app-defaults.json — копируем из .example
 * (сборка с ngrok: scripts/build-desktop-ngrok.ps1 перезаписывает JSON с публичными URL).
 */
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "electron");
const target = path.join(dir, "app-defaults.json");
const example = path.join(dir, "app-defaults.json.example");

if (!fs.existsSync(target)) {
  fs.copyFileSync(example, target);
  console.log("ensure-defaults: скопирован electron/app-defaults.json из .example");
}
