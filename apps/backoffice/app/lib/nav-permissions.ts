/** Доступ к пунктам меню с учётом устаревшей сессии после добавления новых ключей прав. */
export function canSeeNavItem(
  user: { role: string } | null,
  permissions: Record<string, boolean> | null | undefined,
  key: string,
  failOpen: boolean
): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  if (failOpen) return true;
  const allowed = permissions?.[key];
  if (allowed === true) return true;
  if (
    user.role === "admin" &&
    allowed === undefined &&
    permissions &&
    Object.keys(permissions).length > 0
  ) {
    return true;
  }
  return false;
}
