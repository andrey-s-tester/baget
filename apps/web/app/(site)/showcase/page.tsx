type ShowcaseProduct = {
  id: string;
  title: string;
  artist: string;
  sizeLabel: string;
  priceRub: number;
  imageUrl: string;
  description: string | null;
  inStock: boolean;
};

const FALLBACK_PRODUCTS: ShowcaseProduct[] = [
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
  }
];

async function loadProducts(): Promise<ShowcaseProduct[]> {
  const base =
    process.env.BACKEND_API_URL?.trim() ||
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    "http://localhost:4000";
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/products/active`, { cache: "no-store" });
    if (!res.ok) return FALLBACK_PRODUCTS;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data : FALLBACK_PRODUCTS;
  } catch {
    return FALLBACK_PRODUCTS;
  }
}

export default async function ShowcasePage() {
  const products = await loadProducts();
  return (
    <main style={{ padding: "20px clamp(12px, 3vw, 28px) 28px" }}>
      <section
        style={{
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "16px 18px",
          marginBottom: 16
        }}
      >
        <h2 style={{ margin: 0, fontSize: "clamp(1.2rem, 2vw, 1.45rem)" }}>Витрина готовых картин</h2>
        <p style={{ margin: "8px 0 0", color: "var(--muted)" }}>
          Тестовая подборка товаров: готовые картины в багете, доступные к продаже.
        </p>
      </section>

      <section className="showcase-grid">
        {products.map((item) => (
          <article key={item.id} className="showcase-card">
            <img src={item.imageUrl} alt={item.title} className="showcase-card__img" />
            <div className="showcase-card__body">
              <h3 className="showcase-card__title">{item.title}</h3>
              <p className="showcase-card__meta">{item.artist}</p>
              <p className="showcase-card__meta">{item.sizeLabel}</p>
              <p className="showcase-card__desc">{item.description}</p>
              <div className="showcase-card__footer">
                <strong>{item.priceRub.toLocaleString("ru-RU")} руб.</strong>
                <span className={item.inStock ? "showcase-chip showcase-chip--ok" : "showcase-chip"}>
                  {item.inStock ? "В наличии" : "Под заказ"}
                </span>
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
