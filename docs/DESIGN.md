# CabDesk Design System — Verified Decisions

Status: adopted 2026-10-18. This document is the contract for the UI overhaul.
Every decision below was checked against current (2026) sources before any file
was edited.

## 1. Directions considered

1. **Glassmorphic / gradient-heavy SaaS** — rejected. Community feedback is
   consistently negative: low contrast, noisy surfaces, reads as an AI template.
2. **Brutalist / high-contrast** — rejected. Wrong register for an operations
   product used all day; hard on long sessions.
3. **Calm operations (chosen)** — near-neutral surfaces, one accent, hairline
   borders, generous spacing, real data density where it matters. This matches
   Linear/Stripe-style restraint and the 2026 dashboard consensus.

## 2. Evidence log

| Tool | Query | Signal used |
| --- | --- | --- |
| websearch | SaaS dashboard UI trends 2026 | Calm/restrained palettes; single accent used for meaning; progressive disclosure; collapsible sidebar (256→64) with persisted state; one north-star metric top-left; empty states as onboarding; tables over chart walls; command palette expected. |
| websearch | shadcn/ui vs Base UI vs Radix 2026 | shadcn/ui with Base UI primitives is the default for new projects (Base UI 1.6 stable); Radix still supported. Copy-in components, own the code. |
| websearch | dark mode + typography 2026 | `next-themes`, class strategy, `suppressHydrationWarning`, Tailwind v4 `@custom-variant dark`; Inter Variable / Geist; OKLCH tokens; 3-tier token taxonomy; ≥16px body, 14px floor. |
| websearch | booking/scheduling UX 2026 | Soonest-available first; group slots by part of day; bottom sheets; 44px touch targets; never color alone; timezone clarity; prevent conflicts at selection. |
| websearch | SaaS landing pages 2026 | Product-first hero (real UI), specific subhead, one primary CTA, proof band, bento grid; do not fabricate testimonials or customer logos. |
| agent-reach (Reddit, web fallback) | what makes SaaS dashboards feel premium | Spacing is the #1 differentiator ("average designs aren't ugly, they're cramped"); 1px borders beat glass; high-contrast active nav; ≤2 fonts / ≤3 colors; persistent filters; 10–15 row tables; AI tells = default blue, gradient soup, emoji. |
| free-search (searx/anysearch) | OKLCH WCAG APCA | OKLCH as primary color space; lock lightness for text; WCAG 2.2 AA baseline; APCA for perception; enforce contrast in CI. |
| W3C (verified) | WCAG 2.2 new criteria | 24×24px minimum targets (2.5.8 AA), focus not obscured (2.4.11 AA), dragging alternatives (2.5.7 AA), consistent help (3.2.6 A), redundant entry (3.3.7 A), accessible auth (3.3.8 AA). 44×44 is the enhanced target (2.5.5 AAA) and our touch baseline. |
| gitmcp (shadcn-ui/ui) | component catalog | Component inventory adopted: sidebar, command, sonner, dialog/sheet, dropdown, table, chart patterns, skeleton, empty, kbd. |
| paper-search | UI research | MisVisFix reinforces honest data visualisation: zero-based axes, no misleading truncation. |
| kaggle / wiki / gsd_websearch / superpowers | coverage | No additional design-system signal (gsd_websearch has no Brave key; superpowers has no design skill). Recorded for completeness. |

Sources: <https://www.w3.org/TR/WCAG22/>, <https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/>,
<https://ui.shadcn.com/docs/theming>, <https://ui.shadcn.com/docs/dark-mode/next>,
<https://ui.shadcn.com/docs/changelog>.

## 3. Principles

1. **Calm before decoration.** No gradient walls, no glass panels, no emoji in
   product UI. Hierarchy comes from type scale, spacing and one accent.
2. **One accent.** Brand color marks actions, active navigation and focus. Status
   colors (amber/blue/green/red) never decorate — they carry state only.
3. **Hairlines, not shadows.** 1px borders define surfaces; shadows are reserved
   for overlays (dialogs, command palette, menus).
4. **Density with air.** Tables are the primary surface; 10–15 rows per screen,
   row height 44–52px, sticky headers, persistent filters.
5. **Progressive disclosure.** Primary action per page; secondary actions move to
   row menus or a "More" sheet on mobile.
6. **Honest data.** Zero-based chart axes, exact counts, no fake trends, no
   fabricated social proof.
7. **Tenant identity, not tenant chaos.** White-labeling changes `--brand` and
   logo only; layout, spacing and semantics stay constant.

## 4. Tokens (OKLCH)

Defined in `frontend/src/app/globals.css`.

| Token | Light | Dark |
| --- | --- | --- |
| `--bg` | `oklch(0.975 0.004 250)` | `oklch(0.165 0.012 255)` |
| `--surface` | `oklch(1 0 0)` | `oklch(0.196 0.014 255)` |
| `--surface-2` | `oklch(0.958 0.006 250)` | `oklch(0.238 0.016 255)` |
| `--border` | `oklch(0.912 0.008 250)` | `oklch(0.285 0.016 255)` |
| `--fg` | `oklch(0.215 0.02 255)` | `oklch(0.955 0.004 250)` |
| `--muted` | `oklch(0.52 0.018 255)` | `oklch(0.70 0.014 250)` |

- `--brand` stays a raw CSS color injected per tenant (`applyBrand()`), default
  `#0f766e`; tints use `color-mix()` so any valid hex works.
- Success / danger / warning / info are semantic tokens in OKLCH, re-tuned per
  theme for ≥4.5:1 text contrast on surfaces.
- Radius: 10px controls, 14px cards, 18px overlays, full pills.
- Type: Inter Variable (`next/font`), body 14–16px, UI floor 12px, `tabular-nums`
  for money and counts. Headings use tight tracking; body stays neutral.
- Spacing: 4px base; page gutters 16/24/32; card padding 20; section rhythm 20–24.

## 5. Component standards

- **Buttons** — 32/36/40px heights, 8–10px radius, one primary per view; icon-only
  buttons always have `aria-label` and ≥32px hit area (44px on touch rows).
- **Inputs** — 36px height, visible label (never placeholder-only), hint below,
  error replaces hint, focus ring 2px brand at 15% + brand border.
- **Cards** — `rounded-xl border bg-surface`; header title 14px semibold; no
  decorative icons unless they aid scanning.
- **Badges** — dot + label, tinted background at 12% opacity, capitalized state.
- **Tables** — 44px+ rows, hover surface tint, right-aligned numerics, status last
  before actions; mobile falls back to stacked list cards.
- **Overlays** — centered dialog on desktop, bottom sheet on mobile, Escape and
  backdrop close, scroll lock, focus moved into the panel.
- **Command palette** — `⌘K`/`Ctrl K`, pages + actions, arrow-key navigation,
  visible keyboard hints.
- **Empty states** — one sentence of context + one action; no illustrations that
  delay the task.
- **Skeletons** — layout-shaped shimmer for first load; spinners only for
  in-place mutations.

## 6. Page patterns

- **App shell** — fixed collapsible sidebar (264→76px, persisted), sticky top bar
  with page title, command trigger, theme toggle, user menu; bottom nav + More
  sheet on mobile. Active nav = surface tint + brand icon + 2px indicator.
- **Dashboard** — greeting header; four KPIs with one north-star first; bookings
  trend (zero-based); fleet status panel; recent bookings; quick actions.
- **Bookings** — segmented status filter + search; dense table; assign / complete
  / cancel actions; mutation feedback via toast.
- **Fleet / Drivers / Customers** — segmented filters, avatar-led rows, inline
  edit/delete icon buttons.
- **Reports** — date presets + custom range; KPI row; honest bar chart; status
  distribution; top drivers.
- **Settings** — sectioned cards with a live brand preview; owner/admin gating
  preserved; save feedback via toast.
- **Marketing** — product-first hero with a real UI preview, bento features,
  three-step onboarding, security band, CTA. No invented logos or quotes.
- **Auth** — split panel: tenant-branded story on the left, focused form on the
  right, theme toggle, demo credentials visible.

## 7. Accessibility baseline (WCAG 2.2 AA)

- 24×24px minimum pointer targets; 44×44px for primary touch actions.
- 2px focus outline with 2px offset; never `outline: none` without replacement.
- State never conveyed by color alone (status badges include text + dot).
- Text contrast ≥4.5:1; large text ≥3:1; verified in both themes.
- `prefers-reduced-motion` disables animations and smooth scrolling.
- Dialogs trap focus, restore it on close, close on Escape.
- Charts expose a text alternative (sr-only list) and zero-based axes.
- Forms keep labels, autocomplete hints, and inline errors.

## 8. Banned patterns

Gradient soup, glassmorphism, neon glows, emoji as icons, default Tailwind blue,
fabricated testimonials/logos/metrics, truncated chart axes, icon-only controls
without labels, text below 12px, and more than one accent hue per view.

## 9. Implementation map

- Tokens/base: `src/app/globals.css`, `src/app/layout.tsx`
- Primitives: `src/components/ui.tsx`, `src/components/Icons.tsx`
- Shell: `src/app/(dashboard)/layout.tsx`, `command-palette.tsx`, `theme-toggle.tsx`
- Marketing/auth: `src/app/page.tsx`, `src/components/AuthShell.tsx`
- Pages: dashboard, bookings, cabs, drivers, customers, reports, activity,
  settings
- Verification: `npm run typecheck`, `npm run build`, Playwright screenshots
  (desktop + mobile, light + dark), and `docs/VERIFICATION.md` updates.

## 10. Research-backed refinements (2026-10)

Applied after a cross-verified 2026/2027 UI-pattern review (sources in
`RESEARCH.md`): Carbon (overflow menus), TimelyCare (row actions), NN/g +
Atlassian (badges/dark mode/empty states), LogRocket (tables/UX).

- **Tables**: uniform 56px row height; `whitespace-nowrap` cells; numeric
  columns right-aligned with `tabular-nums`; customer/route/driver cells are
  two-line (primary + muted secondary) with truncation + `title` tooltips;
  every row reserves the same Actions column — no layout shift between
  statuses.
- **Row actions**: exactly one primary inline action (Complete for assigned,
  Assign/Reassign for pending) plus a kebab overflow menu; completed/cancelled
  rows show none. Menus render in a portal, right-aligned under the trigger,
  flip up near the viewport bottom, close on Escape (refocusing the trigger),
  outside click, scroll, or resize; first item receives focus on open; arrow
  keys cycle. Do not position menus with inline `transform` — the
  `animate-scale-in` keyframe uses `both` fill-mode and pins `transform`.
- **Dark elevation**: `elev-card` adds a 1px inset top highlight in dark mode
  (box-shadows read weakly on dark surfaces); the token ladder itself widens
  contrast — bg 0.155 / surface 0.205 / surface-2 0.262, borders 0.30 / 0.37
  (OKLCH lightness). Light mode stays flat by design.
- **Charts**: days without bookings (or fares) render no bar — never a
  minimum-height stub — so gaps read as gaps. A period with zero total shows
  a designed in-card empty state with an sr-only description instead of an
  empty axis.
- **KPI cards**: single number plus a muted sparkline summarising the last
  14 days; the sparkline is `aria-hidden` decoration, the chart card carries
  the accessible description.
- **Badges**: dot + label + tinted border retained; a ring/outline pass-off
  was evaluated and skipped (no contrast or recognition gain at this size).

## 11. P0 refinements (2026-10-19)

- **Command palette entity search**: entity rows mirror table rows — muted
  truncating hint (route / phone) + status Badge; groups per entity type.
  Implementation gotcha: cmdk's root `onValueChange` fires for the *selected
  item*; the search-text callback must sit on `<Command.Input>`. Selecting an
  entity routes to its page with `?q=<term>` and dispatches a
  `cabdesk:search` CustomEvent so the destination page can pick the term up
  without `useSearchParams`.
- **Compliance badges**: dates beyond the horizon render as muted text;
  within it (≤30d) or expired they become a Badge. Badge text is deliberately
  short — "expires 6d", "expires today", "expired 3d" — because the Badge
  primitive title-cases every word.
- **Needs-attention panel**: exception-first card above KPIs, hidden when
  empty (zero-attention tenants see the normal dashboard); each row deep
  links to the filtered page.
- **CSV exports**: server-generated with Content-Disposition filenames;
  formula-prefixed cells get an `'` guard (CSV injection) and a UTF-8 BOM so
  Excel detects Arabic/French names; exports honour active filters (`q`,
  `status`, date range).
