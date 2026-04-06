import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/auth.decorators";

@Controller("system")
export class SystemController {
  @Public()
  @Get("health")
  health() {
    return { ok: true, service: "yanak-api" };
  }

  /**
   * Манифест обновлений десктопной админки (Electron).
   * Задаётся через ENV при деплое — клиент сравнивает latest с локальной версией.
   */
  @Public()
  @Get("desktop-admin-update")
  desktopAdminUpdate() {
    const latest = process.env.DESKTOP_ADMIN_LATEST_VERSION?.trim();
    const downloadUrl = process.env.DESKTOP_ADMIN_DOWNLOAD_URL?.trim();
    if (!latest || !downloadUrl) {
      return { ok: false as const, message: "Desktop update manifest not configured" };
    }
    return {
      ok: true as const,
      latest,
      downloadUrl,
      releaseNotes: process.env.DESKTOP_ADMIN_RELEASE_NOTES?.trim() || "",
      minRequired: process.env.DESKTOP_ADMIN_MIN_VERSION?.trim() || undefined
    };
  }
}
