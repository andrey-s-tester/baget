/**
 * Лёгкий индикатор маршрута: без второго тяжёлого скелетона поверх скелетона страницы.
 */
export default function Loading() {
  return (
    <div
      className="bo-route-progress"
      role="progressbar"
      aria-label="Загрузка страницы"
      aria-busy="true"
    />
  );
}
