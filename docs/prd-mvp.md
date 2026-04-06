# PRD: Framing Workshop MVP

## Goal

Build an MVP web/PWA platform for a framing workshop with 3 core role areas:

- Customer: constructor and order placement.
- Admin/Manager: catalog, pricing, stores, orders.
- Worker: assigned production tasks and statuses.

## MVP Scope

- Upload image, set dimensions, choose frame/materials.
- 2D preview and price breakdown.
- Promo code and store selection.
- Submit order.
- Backoffice CRUD for catalog/pricing/stores.
- Worker task board with status transitions.

## Out of Scope

- 3D preview, AI recommendations, full online payments, deep accounting automation.

## Roles

- Customer: own orders only.
- Manager: order operations and assignment.
- Admin: full access.
- Worker: assigned tasks only.
- Accountant/Owner: analytics and payroll read access.

## Statuses

`new -> assigned -> in_progress -> assembling -> waiting_materials -> ready -> issued`

Terminal alternative: `canceled`.

## Acceptance Criteria

- Customer can complete constructor to order flow.
- Admin can update catalog/pricing and changes affect new quotes.
- Worker sees only own tasks and updates valid statuses.
- System stores price snapshot and status history per order.
