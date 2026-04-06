/**
 * Полная ширина контента заказов задаётся в SidebarLayout (класс bo-main--orders-full по pathname),
 * а не через useEffect здесь — иначе первый кадр был с глобальным max-width, затем «прыжок».
 */
export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
