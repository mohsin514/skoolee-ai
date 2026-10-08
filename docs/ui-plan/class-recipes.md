# Exact class recipes for implementation

Use these recipes inside the existing shared components or the specific feature being migrated. They are planned compositions, not a second component library. Prefer importing an existing component/helper over copying its class string into pages. Read the shared component source and `src/app/globals.css` for current class expressions and CSS declarations.

Values marked **EXISTING** describe current source. Recipes marked **TARGET** are proposed layout/hierarchy improvements: verify them against the page baseline before applying. `tokens-and-styles.md` owns token names and values if another document disagrees. `execution.md` owns the batch order and validation matrix.

## Existing classes to reuse directly

| Class or helper | Owner and rule |
| --- | --- |
| `sk-field` plus `fieldAppearance` | `Input`, `Textarea`, `Select` own the actual surface/skin. Pages must not add a competing border/ring/fill |
| `sk-input-group` | `InputGroup` owns a single outer surface and focus halo; direct children use the affix attributes |
| `sk-select` | Shared native Select; retain progressive enhancement and forced-colors fallback |
| `sk-field-label` | Shared label contract, 14px/600 with 10px gap; do not combine a second margin recipe unintentionally |
| `actionable-hover` / `actionable-active` | Shared Button variants for enabled native controls or href anchors, excluding aria-disabled; hover keeps the device capability media guard |
| `sk-panel` / `cardSurface` | Reusable interior card; cardSurface adds current source text/transition behavior |
| `pageCardSurface` | Outer workspace surface; use `PageCard` or the existing role-page wrapper |
| `sk-toolbar` | Toolbar surface only; caller still supplies flex/grid behavior |
| `sk-data-table` | Semantic data table rules shared by the primitive and workspace table |
| `focus-on-dark` | Existing focus-color override for dark interactive surfaces |
| `focus-inset` | Existing focus-offset override for confined controls |
| `sr-only`, `focus:not-sr-only` | Accessible auxiliary text and skip-link presentation; do not hide required visual help |
| `custom-scrollbar` | Existing scroll treatment; never hide a needed scroll affordance |
| `skeleton-shimmer` and shared `Skeleton*` components | Loading shape implementation; shared component owns animation and semantics |
| `skoolee-toast` | Root toast host only; callers choose message/severity, not a new skin |
| `animate-modal-*`, `animate-backdrop-*`, `animate-sheet-*` | Modal engine only; keep timing in sync with its unmount lifecycle |

`rounded-sm/md/lg` are overridden by the current theme, and `/dashboard` has additional scoped overrides. Do not assume their default Tailwind pixel values. Keep existing helpers during the baseline extraction; use proposed semantic radius utilities only after they are registered and verified.

## Planned Tailwind token exposure

**PROPOSED.** Merge only needed aliases into the existing `@theme inline` block; do not paste a second theme system or overwrite existing aliases. Define the underlying custom properties using the values in the token plan first.

```css
@theme inline {
  --color-surface-canvas: hsl(var(--background));
  --color-surface-raised: hsl(var(--card));
  --color-surface-overlay: hsl(var(--popover));
  --color-text-strong: hsl(var(--foreground));
  --color-text-default: var(--ink);
  --color-text-secondary: var(--ink-muted);
  --color-text-tertiary: var(--ink-subtle);
  --color-icon-muted: var(--ink-faint);
  --color-status-success-surface: var(--status-success-surface);
  --color-status-success-border: var(--status-success-border);
  --color-status-success-text: var(--status-success-text);
  --color-status-info-surface: var(--status-info-surface);
  --color-status-info-border: var(--status-info-border);
  --color-status-info-text: var(--status-info-text);
}
```

This exposes such utilities as `bg-surface-raised`, `text-text-secondary`, `border-status-success-border` and `bg-status-info-surface`. Existing `bg-card` and `text-ink-muted` remain valid; do not rename them throughout the app just for consistency. Direct references above avoid intermediate alias resolution in `.dark` subtrees.

For proposed non-color tokens, prefer explicit Tailwind v4 custom-property references at the shared owner: `rounded-(--radius-control)`, `rounded-(--radius-panel)`, `shadow-(--shadow-panel)`, `min-h-(--control-min)`, `min-h-(--field-min)`. Underlying variables must exist before these classes are used. Do not redefine a variable in terms of itself inside `@theme`, and do not construct class names dynamically from arbitrary token strings.

Keep all variants as complete static strings in component CVA/maps so Tailwind discovers them. Use `cn` for conditional composition and remember it cannot fix CSS layer/specificity conflicts.

## Layout recipes

**TARGET.** These compose existing spacing utilities. Existing role wrappers should own them; do not nest another `h-dvh` shell inside `TeacherPage`, `StudentPage`, `ParentPage`, or `ConsolePage`.

| Pattern | Exact classes | Behavior |
| --- | --- | --- |
| Vertical flex content inside bounded shell | `flex min-h-0 min-w-0 flex-1 flex-col` | Allows a child scroll region to shrink rather than overflow |
| The one intended vertical scroll region | `min-h-0 min-w-0 flex-1 overflow-y-auto` | Add to the wrapper that owns scrolling; avoid competing nested vertical scrollbars |
| Simple content stack | `min-w-0 space-y-6` | 24px task section spacing |
| Compact related stack | `min-w-0 space-y-3` | 12px related-item spacing |
| Feature section grid | `grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2` | Two columns only at sufficient width |
| Basic form grid | `grid min-w-0 grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2` | One column below tablet; long/complex fields use `md:col-span-2` |
| Header layout | `flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between` | Title/action wrapping without truncating the title |
| Header text group | `min-w-0 flex-1 space-y-2` | Content wraps inside flex parents |
| Header action group | `flex w-full flex-wrap items-center gap-2 sm:w-auto` | Buttons can fit phones; primary uses full width only if the page needs it |
| Toolbar layout | `flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end` | Uses WorkspaceToolbar where available |
| Search/filter flex item | `w-full min-w-0 sm:flex-1` | No fixed minimum width larger than the phone viewport |
| Short filter item | `w-full min-w-0 sm:w-auto sm:min-w-40` | Preserve native labels and meaningful option widths |
| Form footer | `flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end` | DOM order remains meaningful for keyboard; avoid visual reordering of primary/cancel |
| Labelled toggle row | `flex min-h-11 cursor-pointer items-center gap-3 py-2` | Whole label is a touch target; actual native control stays operable |
| Inline icon and text | `inline-flex min-w-0 items-center gap-2` | Icon uses `size-4 shrink-0`; text can wrap |
| Flexible text value | `min-w-0 break-words` | Long names wrap; long unbroken URLs/IDs may use `[overflow-wrap:anywhere]` |
| Read-only description grid | `grid min-w-0 grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2` | Use `dl`, `dt`, `dd`; no fake disabled form |
| Numeric value | `tabular-nums` | Combine with existing money/date formatter and appropriate local direction |
| Inner horizontal table region | `max-w-full overflow-x-auto` | Keep the table semantic; visible hint and keyboard focus only when overflow requires them |
| Nonmodal popup surface | `rounded-2xl border border-border-subtle bg-popover p-1 text-popover-foreground shadow-(--shadow-popover)` | Only after shared positioning/focus/layer contract exists; do not paste fixed overlays in pages |

Spacing rules are layout choices, not permission to override the shared control skin. Do not pass `h-8`, tiny text, custom focus rings, or white backgrounds to shared inputs in an attempt to force a dense form. Define a supported component variant only if a real use case and accessibility validation justify it.

## Typography recipes

**TARGET for Latin UI; validate Arabic/Urdu leading and glyph shaping separately.** Prefer heading elements whose level matches the page structure. Classes alone do not provide semantics.

| Role | Exact initial class recipe |
| --- | --- |
| Main page heading | `break-words text-2xl font-extrabold leading-8 tracking-tight text-foreground sm:text-3xl sm:leading-9` |
| Section heading | `text-lg font-bold leading-[1.625rem] text-foreground` |
| Standard readable paragraph | `text-base leading-6 text-ink` |
| Compact body/help | `text-sm leading-[1.375rem] text-ink-muted` |
| Field label | Reuse `FormField` / `Label` and their own label contract |
| Caption/metadata | `text-xs font-medium leading-4 text-ink-muted` |
| Table header target | `text-start text-xs font-semibold normal-case tracking-normal text-ink-muted` |
| Metric value | `text-3xl font-extrabold leading-9 tabular-nums text-foreground` |
| Ordinary text link | `text-primary underline underline-offset-4` plus native Link/anchor semantics |
| Visually hidden supporting label | `sr-only`; only when a visible context already supplies the visual meaning |

Do not put `text-ink-faint` on readable text. Avoid alpha-muted ink, tiny 7–11px metadata, and `whitespace-nowrap` on headings, status explanations or translated buttons. Keep Latin brand/metric-specific typography until its own review. Arabic/Urdu targets use normal tracking and the token plan's candidate 1.6 body/control leading after font checks.

## State classes and ownership

| State | Shared owner | Planned implementation rule |
| --- | --- | --- |
| Hover | Button/CVA or relevant control | Use `enabled:hover:*` for native buttons; do not give disabled actions a hover affordance |
| Pressed | Button | Existing `enabled:active:scale-[0.98] motion-reduce:transform-none`; retain only where it does not shift layout |
| Focus | Global focus rules, field/group owner | Use existing outline/halo; no caller focus-ring recipes |
| Disabled | Native control plus existing variant | `disabled` attribute and solid muted surface/text; do not use opacity as the whole contract |
| Read-only | Field | Native `readOnly`, retained value, appropriate focus/copy; not the same as disabled |
| Invalid | FormField and field/group owner | Error association plus `aria-invalid`; field owner supplies error border/fill/focus |
| Busy | Button/form/action | Proposed Button loading API or existing explicit busy composition; `aria-busy`, stable label, duplicate-submit guard |
| Selected row | Shared table | `data-state="selected"` triggers existing `.sk-data-table` surface; keep checkbox state and selection scope |
| Active navigation | Sidebar/Subnav | `aria-current="page"` for route links; existing selected accent/primary styles |
| True selected tab | Proposed Tabs | `aria-selected`, roving tabindex, tabpanel relationships and existing accent/primary surface |
| Empty/error/permission | TaskFeedback or domain empty state | Correct words/action/status role; no single no-data message for all conditions |
| Success/warning/info | Existing Badge/TaskStatus or proposed Alert | Semantic text/fill/border token pair; include status words; no global recoloring of domain identity |

For proposed Radio, Switch, Tabs, Menu, Popover, Tooltip, Drawer, Alert and Spinner, implement the API and behavior in `component-contracts.md` before using a new style recipe. Native semantics and focus/layer handling are part of the component, not optional follow-up work.

## A concrete migration example

For a new or migrated student-name field, the feature imports `FormField` and public `Input`, retains its current name/value/change/validation logic, and wraps the field in the existing form grid. It does not copy `fieldAppearance` into the page. A date field uses the same public Input with its existing date type so locale/calendar behavior remains centralized. A SearchField uses the shared workspace helper or InputGroup, not a separately positioned magnifier over native text.

For a fee list, use the existing fee panel and workspace table. Change its spacing/header/selection styles through the shared contract and leave money parsing, invoice state, API payload and payment permissions unchanged. A visual change is accepted only after checking populated, empty, filtered-empty, failed-load, selected, pending-action and RTL states in that panel's real role contexts.

These recipes make the intended outcome precise while keeping implementation work in the current shared owners. Record any necessary deviation in the batch note with the source constraint and validation evidence.
