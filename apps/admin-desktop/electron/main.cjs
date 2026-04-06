const { app, BrowserWindow, Menu, dialog, shell, ipcMain, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");
const { spawn } = require("child_process");
const semver = require("semver");

const pkg = require(path.join(__dirname, "..", "package.json"));

/** Как в docker-compose: API с хоста на 4001 (внутри контейнера 4000). */
const DEFAULT_API_BASE_URL = "http://localhost:4001";

const CONFIG_FILENAME = "yanak-admin-config.json";

function configPath() {
  return path.join(app.getPath("userData"), CONFIG_FILENAME);
}

/** В сборке: extraResources кладёт app-defaults.json рядом с app.asar (process.resourcesPath). */
function bundledDefaultsPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app-defaults.json");
  }
  return path.join(__dirname, "app-defaults.json");
}

function normalizeConfig(raw) {
  const backofficeUrl =
    typeof raw.backofficeUrl === "string" ? raw.backofficeUrl.trim() : "";
  const updateManifestUrl =
    typeof raw.updateManifestUrl === "string" ? raw.updateManifestUrl.trim() : "";
  let apiBaseUrl = typeof raw.apiBaseUrl === "string" ? raw.apiBaseUrl.trim() : "";
  if (!apiBaseUrl && backofficeUrl) {
    try {
      const u = new URL(backofficeUrl);
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
        apiBaseUrl = `http://${u.hostname}:4001`;
      }
    } catch (_) {}
  }
  if (!apiBaseUrl) apiBaseUrl = DEFAULT_API_BASE_URL;
  return { backofficeUrl, updateManifestUrl, apiBaseUrl };
}

function readDefaultsFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return normalizeConfig(raw);
  } catch (_) {
    return null;
  }
}

function loadConfig() {
  try {
    const p = configPath();
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      return normalizeConfig(raw);
    }
  } catch (_) {}
  const envUrl = process.env.BACKOFFICE_URL || process.env.YANAK_BACKOFFICE_URL || "";
  const envManifest =
    process.env.YANAK_UPDATE_MANIFEST_URL || process.env.DESKTOP_UPDATE_MANIFEST_URL || "";
  const envApi = process.env.BACKEND_API_URL || process.env.YANAK_API_BASE_URL || "";
  if (envUrl.trim() || envManifest.trim() || envApi.trim()) {
    return normalizeConfig({
      backofficeUrl: envUrl.trim() || "http://localhost:3001",
      updateManifestUrl: envManifest.trim(),
      apiBaseUrl: envApi.trim()
    });
  }
  const bundled = readDefaultsFile(bundledDefaultsPath());
  if (bundled && (bundled.backofficeUrl || bundled.updateManifestUrl || bundled.apiBaseUrl)) {
    return normalizeConfig(bundled);
  }
  return normalizeConfig({});
}

function saveConfig(cfg) {
  const next = normalizeConfig(cfg);
  fs.writeFileSync(
    configPath(),
    JSON.stringify(
      {
        backofficeUrl: next.backofficeUrl,
        updateManifestUrl: next.updateManifestUrl,
        apiBaseUrl: next.apiBaseUrl
      },
      null,
      2
    ),
    "utf8"
  );
  return next;
}

/** Корень standalone Next, подготовленный scripts/prepare-desktop-bundled-ui.cjs */
function windowIconPath() {
  const base = path.join(__dirname, "..", "build");
  const ico = path.join(base, "icon.ico");
  const png = path.join(base, "icon.png");
  if (process.platform === "win32" && fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  return fs.existsSync(ico) ? ico : undefined;
}

function pathToBundledUi() {
  const dev = path.join(__dirname, "..", "bundled-ui");
  if (fs.existsSync(path.join(dev, "apps", "backoffice", "server.js"))) {
    return dev;
  }
  if (app.isPackaged) {
    const packed = path.join(process.resourcesPath, "bundled-ui");
    if (fs.existsSync(path.join(packed, "apps", "backoffice", "server.js"))) {
      return packed;
    }
  }
  return null;
}

function pathToNodeExe() {
  const winVendor = path.join(__dirname, "..", "vendor", "node-win", "node.exe");
  if (fs.existsSync(winVendor)) return winVendor;
  if (app.isPackaged) {
    const packed = path.join(process.resourcesPath, "node-win", "node.exe");
    if (fs.existsSync(packed)) return packed;
  }
  return "node";
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : null;
      s.close(() => (port ? resolve(port) : reject(new Error("no port"))));
    });
    s.on("error", reject);
  });
}

async function waitForHttp(url, maxMs = 90000) {
  const interval = 250;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 4000);
      const r = await fetch(url, { signal: ac.signal, cache: "no-store" });
      clearTimeout(t);
      if (r.ok || (r.status >= 200 && r.status < 500)) return;
    } catch (_) {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("Таймаут ожидания локального сервера админки");
}

let mainWindow = null;
let nextChild = null;
let bundledLocalOrigin = null;

/** ПКМ: копировать/вставить в полях и копирование выделенного текста / ссылки. */
function attachStandardContextMenu(browserWindow) {
  const wc = browserWindow.webContents;
  wc.on("context-menu", (_event, params) => {
    const { editFlags, isEditable, selectionText, linkURL } = params;
    const items = [];

    if (linkURL) {
      items.push({
        label: "Открыть ссылку",
        click: () => shell.openExternal(linkURL)
      });
      items.push({
        label: "Копировать ссылку",
        click: () => clipboard.writeText(linkURL)
      });
      items.push({ type: "separator" });
    }

    if (isEditable) {
      items.push(
        { role: "undo", label: "Отменить", enabled: editFlags.canUndo },
        { role: "redo", label: "Вернуть", enabled: editFlags.canRedo },
        { type: "separator" },
        { role: "cut", label: "Вырезать", enabled: editFlags.canCut },
        { role: "copy", label: "Копировать", enabled: editFlags.canCopy },
        { role: "paste", label: "Вставить", enabled: editFlags.canPaste },
        { role: "delete", label: "Удалить", enabled: editFlags.canDelete },
        { type: "separator" },
        { role: "selectAll", label: "Выделить всё", enabled: editFlags.canSelectAll }
      );
    } else if (selectionText && String(selectionText).length > 0) {
      items.push({
        label: "Копировать",
        click: () => clipboard.writeText(selectionText)
      });
    }

    if (items.length === 0) return;
    Menu.buildFromTemplate(items).popup({ window: browserWindow });
  });
}

function stopBundledServer() {
  if (nextChild && !nextChild.killed) {
    try {
      nextChild.kill();
    } catch (_) {}
  }
  nextChild = null;
  bundledLocalOrigin = null;
}

async function startBundledServer(cfg) {
  const root = pathToBundledUi();
  if (!root) throw new Error("bundled-ui не найден");
  const cwd = path.join(root, "apps", "backoffice");
  const serverJs = path.join(cwd, "server.js");
  if (!fs.existsSync(serverJs)) throw new Error("Нет server.js: " + serverJs);

  stopBundledServer();
  const port = await getFreePort();
  const nodeExe = pathToNodeExe();
  const api = (cfg.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/$/, "");

  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    BACKEND_API_URL: api,
    NEXT_PUBLIC_API_BASE_URL: api
  };

  nextChild = spawn(nodeExe, ["server.js"], {
    cwd,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const logPrefix = "[next] ";
  nextChild.stdout?.on("data", (d) => process.stdout.write(logPrefix + d));
  nextChild.stderr?.on("data", (d) => process.stderr.write(logPrefix + d));
  nextChild.on("error", (err) => console.error("next spawn:", err));

  const origin = `http://127.0.0.1:${port}`;
  bundledLocalOrigin = origin;
  await waitForHttp(origin + "/");
  return origin;
}

function guessApiManifestFromBackoffice(backofficeUrl) {
  try {
    const u = new URL(backofficeUrl);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      return `${u.protocol}//${u.hostname}:4001/api/system/desktop-admin-update`;
    }
    if (u.hostname.includes("ngrok")) {
      return "";
    }
    const host = u.hostname.replace(/^admin\./, "api.");
    return `${u.protocol}//${host}/api/system/desktop-admin-update`;
  } catch {
    return "";
  }
}

function guessManifestFromApiBase(apiBaseUrl) {
  try {
    const u = new URL(apiBaseUrl);
    return `${u.origin}/api/system/desktop-admin-update`;
  } catch {
    return "";
  }
}

async function fetchUpdateManifest(cfg) {
  let url = cfg.updateManifestUrl;
  if (!url) {
    if (pathToBundledUi()) {
      url = guessManifestFromApiBase(cfg.apiBaseUrl || DEFAULT_API_BASE_URL);
    } else {
      url = guessApiManifestFromBackoffice(cfg.backofficeUrl);
    }
  }
  if (!url) return null;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data || data.ok === false) return null;
  if (typeof data.latest !== "string" || typeof data.downloadUrl !== "string") return null;
  return data;
}

async function checkForUpdates(fromUserMenu = false) {
  const cfg = loadConfig();
  let manifest;
  try {
    manifest = await fetchUpdateManifest(cfg);
  } catch (e) {
    if (fromUserMenu) {
      await dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Обновления",
        message: "Не удалось проверить обновления",
        detail: String(e?.message || e)
      });
    }
    return;
  }
  if (!manifest) {
    if (fromUserMenu) {
      await dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Обновления",
        message: "Манифест обновлений не настроен или недоступен",
        detail:
          "На API задайте DESKTOP_ADMIN_LATEST_VERSION и DESKTOP_ADMIN_DOWNLOAD_URL или укажите свой URL в настройках программы."
      });
    }
    return;
  }

  const current = pkg.version;
  const latest = manifest.latest;
  const lv = semver.valid(semver.coerce(latest));
  const cv = semver.valid(semver.coerce(current));
  if (!lv || !cv) {
    if (fromUserMenu) {
      await dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "Обновления",
        message: "Некорректный формат версии в манифесте или в программе",
        detail: `manifest latest=${latest}, app=${current}`
      });
    }
    return;
  }
  const cmp = semver.compare(lv, cv);

  if (cmp <= 0) {
    if (fromUserMenu) {
      await dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Обновления",
        message: `У вас актуальная версия (${current}).`
      });
    }
    return;
  }

  const mr = semver.valid(semver.coerce(manifest.minRequired || ""));
  const mustUpdate = mr && cv ? semver.lt(cv, mr) : false;

  const notes = manifest.releaseNotes ? `\n\n${manifest.releaseNotes}` : "";
  const ret = await dialog.showMessageBox(mainWindow, {
    type: mustUpdate ? "warning" : "info",
    title: "Доступно обновление",
    message: `Новая версия: ${latest} (у вас ${current})${mustUpdate ? "\n\nТребуется обновление." : ""}${notes}`,
    buttons: ["Скачать", "Позже"],
    defaultId: 0,
    cancelId: 1
  });
  if (ret.response === 0) {
    await shell.openExternal(manifest.downloadUrl);
  }
}

async function loadBackofficeIntoWindow(win) {
  const cfg = loadConfig();
  const bundled = pathToBundledUi();
  if (bundled) {
    try {
      const origin = await startBundledServer(cfg);
      await win.loadURL(origin);
    } catch (err) {
      await dialog.showMessageBox({
        type: "error",
        title: "Yanak Admin",
        message: "Не удалось запустить встроенную админку",
        detail: String(err?.message || err)
      });
    }
    return;
  }

  const url = cfg.backofficeUrl || "http://localhost:3001";
  win.loadURL(url).catch(async (err) => {
    await dialog.showMessageBox({
      type: "error",
      title: "Yanak Admin",
      message: "Не удалось открыть админку",
      detail: `${url}\n\n${err?.message || err}\n\nПроверьте URL в меню «Файл → Настройки».`
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: false,
    icon: windowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  attachStandardContextMenu(mainWindow);

  void loadBackofficeIntoWindow(mainWindow);

  mainWindow.webContents.setWindowOpenHandler((details) => {
    const target = details.url ?? "";
    // Квитанции / отчёты: window.open("") → about:blank + document.write + print
    if (
      target === "" ||
      target === "about:blank" ||
      target.startsWith("blob:") ||
      target.startsWith("data:text/html")
    ) {
      return { action: "allow" };
    }
    shell.openExternal(target);
    return { action: "deny" };
  });

  const template = [
    {
      label: "Файл",
      submenu: [
        {
          label: "Настройки…",
          accelerator: "CmdOrCtrl+,",
          click: () => openSettingsWindow()
        },
        {
          label: "Перезагрузить страницу",
          accelerator: "CmdOrCtrl+R",
          click: () => mainWindow?.reload()
        },
        { type: "separator" },
        { role: "quit", label: "Выход" }
      ]
    },
    {
      label: "Правка",
      submenu: [
        { role: "undo", label: "Отменить" },
        { role: "redo", label: "Вернуть" },
        { type: "separator" },
        { role: "cut", label: "Вырезать" },
        { role: "copy", label: "Копировать" },
        { role: "paste", label: "Вставить" },
        { role: "pasteAndMatchStyle", label: "Вставить без форматирования" },
        { role: "delete", label: "Удалить" },
        { type: "separator" },
        { role: "selectAll", label: "Выделить всё" }
      ]
    },
    {
      label: "Справка",
      submenu: [
        {
          label: "Проверить обновления…",
          click: () => void checkForUpdates(true)
        },
        {
          label: `Версия ${pkg.version}`,
          enabled: false
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

let settingsWindow = null;
function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 520,
    height: pathToBundledUi() ? 620 : 560,
    parent: mainWindow,
    modal: true,
    show: true,
    icon: windowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  attachStandardContextMenu(settingsWindow);
  settingsWindow.loadFile(path.join(__dirname, "settings.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
    if (mainWindow) {
      void loadBackofficeIntoWindow(mainWindow);
    }
  });
}

function registerIpc() {
  ipcMain.handle("yanak:config-load", () => loadConfig());
  ipcMain.handle("yanak:config-save", (_evt, cfg) => {
    saveConfig(cfg);
    return true;
  });
  ipcMain.handle("yanak:app-version", () => pkg.version);
  ipcMain.handle("yanak:ui-mode", () => ({
    bundled: Boolean(pathToBundledUi())
  }));
  ipcMain.handle("yanak:clipboard-write", (_evt, text) => {
    clipboard.writeText(String(text ?? ""));
    return true;
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  setTimeout(() => void checkForUpdates(false), 10000);
});

app.on("before-quit", () => {
  stopBundledServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
