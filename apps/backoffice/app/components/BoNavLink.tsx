"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";

type Props = ComponentProps<typeof Link>;

/** Сайдбар: один маршрут при наведении — без шторма prefetch по всему меню. */
export function BoNavLink({ href, onMouseEnter, ...rest }: Props) {
  const router = useRouter();
  const path = typeof href === "string" ? href : typeof href.pathname === "string" ? href.pathname : "";
  return (
    <Link
      href={href}
      onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) => {
        onMouseEnter?.(e);
        if (path) void router.prefetch(path);
      }}
      {...rest}
    />
  );
}
