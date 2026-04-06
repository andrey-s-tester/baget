export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="app-header">
        <a href="/" className="app-header__link">
          <span className="app-header__logo">Янак</span>
          <span className="app-header__tagline">багетная мастерская</span>
        </a>
        <nav className="app-header__nav" aria-label="Основная навигация">
          <a href="/" className="app-header__nav-link">
            Конструктор
          </a>
          <a href="/showcase" className="app-header__nav-link">
            Витрина
          </a>
        </nav>
        <div className="app-header__title-block">
          <h1 className="app-header__title">Янак — багетная мастерская</h1>
          <p className="app-header__subtitle">
            Конструктор стоимости и витрина готовых картин.
          </p>
        </div>
      </header>
      {children}
    </>
  );
}
