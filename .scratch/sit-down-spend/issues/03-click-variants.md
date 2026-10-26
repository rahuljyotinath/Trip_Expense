Status: open
Type: prototype
Blocked by: 01, 02

# Click the variants

## Question

Build throwaway UI per `/prototype` UI branch (UI.md): prefer **sub-shape A** — variants on an existing route via `?variant=`, floating bottom bar to switch.

Implement the path shapes chosen in [Path shapes for the prototype](01-path-shapes.md), respecting [What sit-down is](02-sit-down-identity.md).

Each variant must be **clickable through** (mock or real data OK):

- Join-from-link → seated on trip → first spend saved (or clearly stubbed)
- Open trip → first spend
- Return visit → trip visible → add another spend

**Decision this ticket resolves:** which variant feels fastest for all three moments? Link prototype branch/path in the answer; do not merge to production.

## Comments
