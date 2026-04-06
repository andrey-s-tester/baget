# Sprint 1 Backlog

## Goal

Ship core MVP flow: constructor -> quote -> order -> production statuses.

## Tasks

1. Auth + RBAC.
2. Catalog CRUD (frame profiles, materials).
3. Stores module.
4. Pricing quote endpoint with breakdown.
5. Order creation with pricing snapshot.
6. Status transition logic + history.
7. Worker task list and status updates.
8. Basic analytics counters.

## Definition of Done

- End-to-end flow works for customer, manager, and worker roles.
- All protected routes use role guards.
- Price snapshot and status history persist correctly.
