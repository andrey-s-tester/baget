# Architecture: Framing Workshop MVP

## Stack

- Frontend: Next.js + TypeScript + Tailwind + React Query.
- Backend: NestJS + TypeScript.
- DB: PostgreSQL.
- ORM: Prisma.
- Cache/queues: Redis.
- Files: S3-compatible storage.
- Preview: 2D Canvas.

## Platform Shape

Single platform with role-based routes:

- Customer app.
- Backoffice app (admin/manager/worker).
- Unified API.

## Suggested Monorepo

```txt
apps/
  web/
  backoffice/
  api/
packages/
  pricing/
  types/
  ui/
```

## Core API Modules

- auth, users, stores, catalog, pricing, discounts, orders, production, analytics, payroll, files.

## Key Decisions

- Pricing source of truth is backend/shared pricing package.
- Order stores immutable pricing snapshot.
- Server enforces status transitions.
- All status updates are logged to history with actor/timestamp.
