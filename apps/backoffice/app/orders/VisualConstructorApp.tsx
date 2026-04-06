"use client";

/**
 * Локальная обёртка: Next/Turbopack надёжнее подхватывает изменения workspace-пакета, чем прямой dynamic('@yanak/constructor').
 *
 * Превью багета (canvas, тайлинг текстуры без швов) — тот же `FramePreview`, что и на витрине: `packages/constructor/src/FramePreview.tsx`.
 */
export { ConstructorApp } from "@yanak/constructor";
