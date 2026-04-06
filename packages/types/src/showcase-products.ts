export type ShowcaseProduct = {
  id: string;
  title: string;
  artist: string;
  sizeLabel: string;
  priceRub: number;
  imageUrl: string;
  description: string;
  inStock: boolean;
};

export const SHOWCASE_PRODUCTS: ShowcaseProduct[] = [
  {
    id: "art-001",
    title: "Тихая гавань",
    artist: "М. Орлова",
    sizeLabel: "40×60 см",
    priceRub: 6900,
    imageUrl: "https://images.unsplash.com/photo-1577083552431-6e5fd01aa342?auto=format&fit=crop&w=900&q=80",
    description: "Пейзаж с мягким вечерним светом, оформлен в деревянный багет.",
    inStock: true
  },
  {
    id: "art-002",
    title: "Северный берег",
    artist: "А. Лебедев",
    sizeLabel: "50×70 см",
    priceRub: 8200,
    imageUrl: "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=900&q=80",
    description: "Графичный морской сюжет в холодной палитре.",
    inStock: true
  },
  {
    id: "art-003",
    title: "Лавандовый ветер",
    artist: "Е. Нечаева",
    sizeLabel: "30×45 см",
    priceRub: 5400,
    imageUrl: "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=900&q=80",
    description: "Интерьерная картина с акцентом на пастельные оттенки.",
    inStock: true
  },
  {
    id: "art-004",
    title: "Старая улочка",
    artist: "И. Громов",
    sizeLabel: "60×80 см",
    priceRub: 11900,
    imageUrl: "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=1000&q=80",
    description: "Архитектурный сюжет в теплых тонах, готов к продаже.",
    inStock: true
  },
  {
    id: "art-005",
    title: "Туманное утро",
    artist: "К. Данилова",
    sizeLabel: "35×50 см",
    priceRub: 6100,
    imageUrl: "https://images.unsplash.com/photo-1508261303786-5c4cc498f45d?auto=format&fit=crop&w=900&q=80",
    description: "Спокойный городской пейзаж в узком серебряном багете.",
    inStock: false
  },
  {
    id: "art-006",
    title: "Летний сад",
    artist: "С. Анисимов",
    sizeLabel: "45×60 см",
    priceRub: 7600,
    imageUrl: "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=960&q=80",
    description: "Декоративная работа для гостиной или офиса.",
    inStock: true
  }
];
