import type { PropsWithChildren } from "react";

type CardProps = PropsWithChildren<{
  className?: string;
}>;

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={className}
      style={{
        border: "1px solid var(--border, #e5e7eb)",
        borderRadius: 12,
        padding: 20,
        background: "var(--surface, #fff)",
        boxShadow: "var(--shadow, 0 1px 3px rgba(15, 23, 42, 0.08))"
      }}
    >
      {children}
    </div>
  );
}
