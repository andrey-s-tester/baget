export type FrameCategory = "plastic" | "wood" | "aluminum";

export type FrameCatalogItem = {
  sku: string;
  name: string;
  category: FrameCategory;
  widthMm: number;
  widthWithoutQuarterMm: number;
  retailPriceMeter: number;
  imageUrl: string;
  /** URL текстуры превью (файл «t» для выбранного артикула) */
  previewImageUrl?: string;
  isActive: boolean;
  /** Остаток на складе, м (из API каталога) */
  stockMeters?: number;
  minStockMeters?: number | null;
};
