# packages/ui

Shared UI component library (Tailwind CSS + Radix UI, shadcn-style components).

Houses presentational, app-agnostic components reused across `apps/desktop` and any
future surfaces: buttons, cards, dialogs, tables, layout primitives, theme tokens.

Keep components dumb: no runtime/agent coupling, no data fetching. Feature-specific
composition lives in `apps/desktop/src/features`.
