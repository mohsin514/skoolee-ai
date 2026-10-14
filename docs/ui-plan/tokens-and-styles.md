# Skoolee AI tokens and styles

This is a source audit and implementation proposal, prepared on 2026-10-08. No application code was changed. Browser rendering, interaction, device, font-shaping, and assistive-technology checks have not been attempted; execution rows begin **NOT STARTED**. Their verification outcome is **UNVERIFIED** until the required checks pass; see the separate work-status and verification rules in `execution.md`. Exact source values below are observed; any entry marked **PROPOSED** is a future implementation decision, not an existing feature or a verified visual result.

The companion generated indexes `current-css.json` (326 CSS rule blocks / 163 custom-property declarations across seven CSS files) and `current-class-usage.json` (13,354 JSX class attributes) provide exhaustive raw styling detail. Query the affected files in those indexes before changing a shared token; do not load the full indexes into the implementation model context.

## 1. Scope and source of truth

The foundation covers the 983-line global stylesheet and the shared styling helpers, shells, modal, table, logo, locale and field components. This foundation plan must be combined with the separate full route/component inventory; it does not claim to audit every page or inline style.

Repository root: `/Users/angular_dev_15/Downloads/skoolee-ai`. Do not install another component suite or replace the existing stack. Current primitives use Tailwind v4, `class-variance-authority`, `clsx`, `tailwind-merge`, Lucide, Sonner, and locally implemented React controls. Comments saying “shadcn/ui” are historical labels, not proof that Radix or shadcn behavior is present.

Primary files:

- [globals.css](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/globals.css:5): existing tokens, base selectors, animation, fields, surfaces, tables.
- [field-appearance.ts](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/ui/field-appearance.ts:1): canonical field skin. Layout callers must not fork it.
- [button.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/ui/button.tsx:9), [card.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/ui/card.tsx:8), [page-card.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/ui/page-card.tsx:4), [table.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/ui/table.tsx:8), [task-patterns.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/ui/task-patterns.tsx:6): reuse before creating another pattern.
- [module-tones.ts](/Users/angular_dev_15/Downloads/skoolee-ai/src/lib/ui/module-tones.ts:1): the existing feature-color contract.
- [utils.ts](/Users/angular_dev_15/Downloads/skoolee-ai/src/lib/utils.ts:4): `cn = twMerge(clsx(...))`; later merged utilities may override earlier ones, but CSS layer/specificity rules still apply.
- [layout.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/app/layout.tsx:9): root font and Sonner configuration.
- [modal.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/ui/modal.tsx:60): stack, focus/scroll lifecycle, mobile sheets, exit timing.
- [LocaleProvider.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/locale/LocaleProvider.tsx:6): live language/direction, translation and formatting helpers.
- [SkooleeLogo.tsx](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/SkooleeLogo.tsx:11) and its [CSS module](/Users/angular_dev_15/Downloads/skoolee-ai/src/components/SkooleeLogo.module.css:6): canonical animated wordmark.

Installed Next.js is 16.2.3, React is 19.2.4. Before future Next.js edits read the applicable installed guides, including `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`, and `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`. Async `cookies`, `headers`, `params`, and `searchParams` must remain async. Do not move authentication or tenant data into client bundles while reorganizing visual components.

## 2. Preserve the observed brand

The established look is purple primary actions, pale lilac work surfaces, warm dark ink, generous rounded corners, restrained purple shadows, Lucide icons, and a playful eye/graduate-cap wordmark. Pink is an existing secondary identity color, deliberately allocated to fees. Keep this identity. Avoid introducing an unrelated blue SaaS palette, replacing the wordmark, or globally flattening every specialized visual.

The logo uses `#8127cf`, white eye surfaces, `#1f1a23` pupils, 700 regular or 900 heavy weight, 1.5rem default size, and `dir="ltr"` with `role="img"`/`aria-label="Skoolee AI"`. The eyes animate on a 4s idle cycle, or 2s where the caller chooses loading. Reduced-motion centers them. Keep physical positions inside this deliberately LTR logo; do not mechanically replace its `margin-left` or cap geometry as an RTL “fix.”

`MODULE_TONES` has exactly these domains/raw hex values: brand/students `#8127cf`; classes `#4f46e5`; timetable `#0891b2`; attendance `#059669`; exams `#d97706`; reports `#2563eb`; fees `#b10e6b`; staff `#0d9488`; leave `#ea580c`; AI `#c026d3`. Its `tile`, `rail`, `chip`, `text`, and `hex` properties are already the shared interface. The documented rule is one domain hue per page, with purple still owning primary action and active navigation and status colors retaining their meaning. Do not turn the entire page/action palette into its domain hue. Tailwind named colors are defined by the installed theme and should not be assumed identical to the raw `hex` chart value.

## 3. Exact existing CSS tokens

### 3.1 Base HSL-channel tokens

The following values are bare HSL channels, requiring `hsl(var(--token))`, unlike the hex/RGB tokens below. Source: `globals.css:5` and `:54`.

| Token | Light | `.dark` |
|---|---|---|
| `--background` | `240 5% 97%` | `240 10% 3.9%` |
| `--foreground` | `273 15% 12%` | `0 0% 98%` |
| `--card`, `--popover` | `0 0% 100%` | `240 10% 5.5%` |
| `--card-foreground`, `--popover-foreground` | `273 15% 12%` | `0 0% 98%` |
| `--primary` | `273 68% 48%` | `263 70% 58%` |
| `--primary-foreground` | `0 0% 98%` | `0 0% 98%` |
| `--secondary`, `--accent` | `287 88% 97%` | `240 3.7% 15.9%` |
| `--secondary-foreground`, `--accent-foreground` | `273 15% 12%` | `0 0% 98%` |
| `--muted` | `230 33% 96%` | `240 3.7% 15.9%` |
| `--muted-foreground` | `278 11% 30%` | `240 5% 64.9%` |
| `--destructive` | `0 72% 40%` | `0 62.8% 50.6%` |
| `--destructive-foreground` | `0 0% 98%` | `0 0% 98%` |
| `--border`, `--input`, `--sidebar-border` | `278 17% 80%` | `240 3.7% 15.9%` |
| `--ring` | `272 30% 60%` | `272 45% 77%` |
| `--sidebar-bg` | `287 88% 97%` | `240 10% 5%` |
| `--sidebar-foreground` | `273 15% 12%` | `0 0% 98%` |
| `--success` | `142 72% 26%` | `142 71% 45%` |
| `--warning` | `32 90% 30%` | `38 92% 50%` |

`--radius = 1.5rem`. `@theme inline` maps `--radius-lg` to that token, `--radius-md` to minus 2px, and `--radius-sm` to minus 4px. At a 16px root these become 24px/22px/20px. This does **not** mean Tailwind's normal increasing small/medium/large sequence remains intact: `rounded-xl` still comes from the installed default 0.75rem and `rounded-2xl` is 1rem. See the cascade gotchas before altering these.

### 3.2 Ink and brand

| Token | Light | `.dark` |
|---|---|---|
| `--ink` | `#4d4354` | `#f5f3f7` |
| `--ink-muted` | `#635a6b` | `#cfc9d4` |
| `--ink-subtle` | `#746c7a` | `#aca5b3` |
| `--ink-faint` | `#918a95` | `#8b8494` |
| `--brand-1` | `#8127cf` | inherited |
| `--brand-2` | `#9c48ea` | inherited |

`ink-faint` is explicitly designated NON-TEXT ONLY by the source. Do not use it for small labels, disabled readable text, placeholders, empty-state descriptions, or table headers. Source comments record past contrast work; remeasure actual composites instead of treating those comments as universal proof. RGB opacity variants of ink are not substitutes for these solid colors.

### 3.3 Fields, focus and surface tokens

Source: `globals.css:647`. These values are already complete CSS colors or lengths.

| Token | Existing value |
|---|---|
| `--space-task`, `--space-control` | `1.5rem`, `0.75rem` |
| `--text-body`, `--text-heading` | `0.875rem`, `1.5rem` |
| `--focus-rgb` | `155 122 184` (= `#9b7ab8`) |
| `--focus-color` | `rgb(var(--focus-rgb))` |
| `--focus-width`, `--focus-offset` | `2px`, `3px` |
| `--field-border`, `--field-border-hover` | `#d8cfe5`, `#b39acb` |
| `--field-surface`, `--field-surface-invalid` | `#fcfaff`, `#fff5f5` |
| `--field-shadow-rest` | `0 1px 2px rgb(55 27 77 / 0.05)` |
| `--field-shadow-hover` | `var(--field-shadow-rest)` |
| `--field-focus-border` | `var(--focus-color)` |
| `--field-focus-ring` | `inset 0 0 0 1px var(--field-focus-border), 0 0 0 3px rgb(var(--focus-rgb) / 0.22), 0 0 16px 2px rgb(var(--focus-rgb) / 0.24)` |
| `--field-error-rgb` | `175 29 29` |
| `--field-error-border` | `rgb(var(--field-error-rgb))` |
| `--field-error-ring` | `inset 0 0 0 1px var(--field-error-border), 0 0 0 3px rgb(var(--field-error-rgb) / 0.16), 0 0 16px 2px rgb(var(--field-error-rgb) / 0.16)` |
| `--field-icon-focus` | `var(--brand-1)` |
| `--surface-subtle`, `--surface-hover`, `--surface-selected` | `#faf7fd`, `#faf5ff`, `#f3eafa` |
| `--border-subtle`, `--border-subtle-hover` | `#e4dced`, `#d2bfdf` |
| `--status-error-surface`, `--status-error-border`, `--status-error-text` | `#fef2f2`, `#fecaca`, `#7f1d1d` |
| `--status-warning-surface`, `--status-warning-border`, `--status-warning-text` | `#fffbeb`, `#fde68a`, `#854d0e` |

The second `.dark` block (`globals.css:695`) changes focus RGB to `196 170 222`, error RGB to `208 50 50`, field border to `hsl(var(--border))`, hover border to `#6b5a7d`, field surface to `hsl(var(--card))`, invalid surface to `#2a1215`, and restates the derived focus/error border/ring expressions. It does not override the three new surface tokens, subtle border tokens, or status fills. A working dark theme must not be inferred from this partial block.

`@theme inline` already exposes `bg-background`, `text-foreground`, `bg-card`, `bg-popover`, `bg-primary`, secondary/muted/accent/destructive pairs, `text-ink*`, `bg-brand`/`bg-brand-2`, sidebar pairs, `border-field-border`, `bg-field-surface`, surface/subtle-border/status utilities. `--color-ring` and `--color-focus` resolve through `--focus-color`, not through HSL `--ring`.

### 3.4 Existing component styling contracts

| Existing owner | Concrete appearance and contract |
|---|---|
| `fieldAppearance` | `rounded-2xl` (16px outside special scopes), 1px border, field surface, 16px semibold text, normal-weight subtle placeholder, 200ms background/border/shadow transition; focus white background; disabled solid muted background/text; invalid red tint. Input/Select merge this **after** caller `className`. |
| `Input` in `input-base.tsx` | `.sk-field`, min-height 48px, full width, 16px horizontal / 10px vertical padding. |
| `Select` | Same field skin; `.sk-select`; native selection preserved. Customizable-select is progressive enhancement. |
| `Textarea` | Same skin; min-height 104px, resizable vertically, 16px horizontal/12px vertical padding. |
| `.sk-input-group` | One shared surface/border/ring; child fields transparent and borderless; start affix order 0, field 1, end affix 2; logical inline spacing; button affix 44×44px, 14px radius. Invalid state detected with `:has`; disabled group remains solid. |
| `.sk-field-label` | 14px, weight 600, line-height 1.4, ink, 10px bottom margin. |
| `Button` | 14px bold, 16px radius, gap 8px, wraps text; default min-height 44px/padding 16px and 10px; small also min-height 44px with 12px text; large min-height 56px/16px text; icon 44×44px. 200ms transitions; active scale .98; explicit reduced-motion transform removal. |
| Primary button | Border `#6d22b4`, vertical gradient `#8c36d5` → `#7423ba`; hover border `#5d149f`, gradient `#812aca` → `#6820aa`; multi-layer purple outer/inset shadows. Keep these exact initial visuals when extracting tokens. |
| Other button variants | `dark` (`#1f1a23`), destructive, outline (white / `#d8cfe5`, hover `#faf5ff`), secondary (`#f1e7fb` / `#7020b9`), ghost (hover `#f3ecfa`), link. Reuse `buttonVariants` for links when semantics require `<a>`. |
| `.sk-panel` | 1px subtle border, 28px radius, white surface, foreground text, shadow `0 2px 4px rgb(40 23 60 / 2%), 0 12px 32px -20px rgb(80 42 118 / 24%)`; 180ms border/shadow transitions. |
| `.sk-toolbar` | 20px radius, subtle border and surface; 12px padding/gap. It does not itself select flex/grid display. |
| `Card` | Extends `.sk-panel`; shared header/content padding 24px. Title 18px weight 900. Adds hover lifting when `onClick` exists, but remains a `<div>`: keyboard semantics need explicit audit. |
| `PageCard` | 24px mobile radius / 32px at `sm`; 12px mobile padding / 28px at `sm`; white; shadow `0 2px 4px rgba(40,23,60,.02), 0 20px 60px -30px rgba(80,42,118,.25), inset 0 1px 0 white`. |
| `Table` / `.sk-data-table` | Overflow wrapper, 24px radius, white; start alignment; body 14px; shared CSS headers 12px/600; row hover/focus `surface-hover`; selected `surface-selected`. `TableHead` currently asks for weight 900, creating a competing contract. |
| `Badge` | Pill; 10px horizontal/4px vertical padding; 12px weight 900. Default purple, secondary pale purple, destructive rose, success emerald, warning amber. Status variants need rendered contrast checks; do not infer passing from the variant name. |
| `Checkbox` | Native input with custom 20px visual, 7px radius, 2px border, SVG checked/indeterminate marks, forced-colors fallback. Its surrounding label must supply a 44px hit area. |
| `TaskHeader` | Scope 14px medium; title 24px → 30px at sm, weight 800, tight tracking; description 14px relaxed; actions wrap. |

## 4. Foundation proposals: add semantic names without restyling everything

All names in this section are **PROPOSED**. Add aliases to the existing CSS foundation and expose only needed Tailwind utilities through the existing `@theme inline`. Avoid a second TS palette that drifts from CSS. Use `MODULE_TONES` for chart/domain values where that existing interface is required. Keep old names as compatibility aliases during migration. Do not globally rename all radius utilities or all `#8127cf` occurrences.

Two separate implementation categories apply: **baseline-preserving extraction** uses exactly the current source values; **reviewed accessibility/consistency change** deliberately changes an appearance only after before/after evidence. Most surface/shadow/gradient aliases below are extraction. New success/info triples, the candidate control boundary, normalized text sizes/line heights, and a script-specific web font are proposed improvements in the second category, not drop-in replacements to apply in the extraction commit.

### 4.1 Proposed color additions

| Proposed name | Initial light value | Purpose |
|---|---|---|
| `--surface-canvas` | `hsl(var(--background))` | Existing canvas. |
| `--surface-raised` | `hsl(var(--card))` | Cards/workspaces/popovers where the role fits. |
| `--surface-overlay` | `hsl(var(--popover))` | Menu/dialog surface. |
| `--text-strong` | `hsl(var(--foreground))` | Headings and strong values. |
| `--text-default` / `--text-secondary` / `--text-tertiary` | `var(--ink)` / `var(--ink-muted)` / `var(--ink-subtle)` | Readable copy levels. |
| `--icon-muted` | `var(--ink-faint)` | Non-text only; decorative or low-emphasis icon. |
| `--brand-fees` | `#b10e6b` | Alias existing fees identity; keep `MODULE_TONES.fees`. |
| `--action-primary-from` / `--action-primary-to` | `#8c36d5` / `#7423ba` | Extract existing button gradient. |
| `--action-primary-border` / `--action-primary-border-hover` | `#6d22b4` / `#5d149f` | Extract existing button edge. |
| `--action-primary-hover-from` / `--action-primary-hover-to` | `#812aca` / `#6820aa` | Extract existing hover. |
| `--action-secondary-surface` / `--action-secondary-text` | `#f1e7fb` / `#7020b9` | Existing secondary button. |
| `--status-success-surface` / `--status-success-border` / `--status-success-text` | `#ecfdf5` / `#a7f3d0` / `#065f46` | Text-and-icon success surfaces; aligns with current toast vocabulary. |
| `--status-info-surface` / `--status-info-border` / `--status-info-text` | `#eff6ff` / `#bfdbfe` / `#1e40af` | Informational status, separate from domain colors. |
| `--control-boundary` | `#9b86ac` | Candidate stronger border when the field edge is necessary to identify the control. Do not silently replace every decorative border. |
| `--overlay-scrim` | `rgb(31 26 35 / .50)` | Existing modal backdrop. |

Keep existing error/warning triples. All status output must include readable words; icons may supplement, never replace, status text. Do not use the subtle status border alone as an essential state indicator. Native disabled semantics and understandable text remain required.

Computed color-pair evidence from a local sRGB relative-luminance calculation (not a rendered browser audit): ink on white 9.35:1; muted on white 6.55:1; subtle on `#faf7fd` 4.75:1; faint on white 3.35:1; focus `#9b7ab8` on field `#fcfaff` 3.45:1; current field edge `#d8cfe5` on that field 1.45:1; proposed `#9b86ac` on field 3.17:1; success text/fill above 7.29:1; info text/fill above 8.01:1. These calculations support investigation of faint copy and control boundaries; they do not certify the actual gradients, composited transparency, all states, or fonts.

Dark behavior: preserve existing tokens and do not advertise dark-mode completion. No theme controller or custom class-based Tailwind `dark` variant was found in the scoped source searches. Before adding any dark toggle, inventory actual support. For any future supported dark mode, semantic aliases must resolve from dark base tokens and every light-only surface/status/button needs an explicit reviewed dark value. That is a distinct batch, not a prerequisite for an alias-only light-theme migration.

### 4.2 Proposed typography contract

The English face remains Plus Jakarta Sans, loaded with `next/font/google`, Latin subset, `display: swap`, variable `--font-plus-jakarta-sans`. Monospace remains the existing `"Cascadia Mono", "SFMono-Regular", Consolas, monospace` even though the variable is named `--font-geist-mono`.

Use these semantic pairs (font-size / line-height), preserving browser font scaling:

| Proposed role | Size / line-height | Weight |
|---|---|---|
| Caption, metadata, table heading | `.75rem / 1rem` (12/16) | 500 or 600 |
| Body compact, table data, help text | `.875rem / 1.375rem` (14/22) | 400 or 500 |
| Form field/body comfortable | `1rem / 1.5rem` (16/24) | 400 body, 600 current field |
| Section heading | `1.125rem / 1.625rem` (18/26) | 700 |
| Page heading mobile | `1.5rem / 2rem` (24/32) | 800 |
| Page heading at sm+ | `1.875rem / 2.25rem` (30/36) | 800 |
| Metric value | `1.875rem / 2.25rem` (30/36) | 800 or existing 900 |
| Marketing hero | Existing local responsive treatment | Preserve until marketing batch |

Proposed CSS names: `--type-caption-size`, `--type-caption-leading`, `--type-body-size`, `--type-body-leading`, `--type-control-size`, `--type-control-leading`, `--type-section-size`, `--type-section-leading`, `--type-page-size`, `--type-page-leading`; use existing `--text-heading`/`--text-body` as compatibility aliases where appropriate. Do not indiscriminately change `font-black` in the wordmark/hero/metric visual; reduce heavy body/table labeling only where it improves hierarchy. Existing 7–11px status copy must be reviewed page by page and normally raised to 12px. Avoid fixed-height containers that would clip wrapped translated copy.

Proposed Arabic/Urdu contract: add an explicit script-capable UI font family using the already present `public/fonts/NotoNaskhArabic-Regular.ttf` and `-Bold.ttf` if browser rendering confirms suitable shaping and coverage. Currently these files are registered for PDFs, not globally loaded for web text. Read the installed Next font guide before choosing local font registration. Suggested family variable `--font-arabic = "Skoolee Naskh", Tahoma, Arial, sans-serif`; regular 400, bold 700, `font-display: swap`; use on `:lang(ar)` and `:lang(ur)` only. Use normal letter spacing and initial line-height 1.6 for connected-script body and controls, expanding field height rather than clipping. Verify Urdu marks/ligatures and mixed-script names; do not claim Naskh is already the web typeface or swap to an unprovided Nastaliq dependency. Preserve the Latin logo in LTR and the English face.

## 5. Proposed spacing, shape, sizing and elevation contracts

Tailwind's installed spacing base is 0.25rem. Retain a 4px rhythm. Proposed named spacing values: `--space-inline-tight: .5rem` (8), `--space-inline: .75rem` (12, alias current control gap), `--space-field: 1rem` (16), `--space-section: 1.5rem` (24, alias task gap), `--space-page: 2rem` (32). Allow 2px/6px for icon or optical fine adjustment, and preserve observed 10px label/14px affix values inside controls until individually reviewed.

Proposed semantic radii: `--radius-selection: 7px` (checkbox); `--radius-control-small: 12px`; `--radius-control: 16px`; `--radius-toolbar: 20px`; `--radius-table: 24px`; `--radius-panel: 28px`; `--radius-dialog: 32px`; `--radius-pill: 9999px`; `--radius-workspace-mobile: 24px`; `--radius-workspace: 32px`. These match current actual components. Create semantic utilities/classes; do not redefine existing `rounded-sm/md/lg` globally in the first batch.

Proposed size tokens: `--control-min: 44px`; `--field-min: 48px`; `--control-large: 56px`; `--textarea-min: 104px`; `--icon-small: 16px`; `--icon-default: 20px`; `--icon-large: 24px`; `--sidebar-wide: 256px`; `--sidebar-rail: 72px`. Icons are decorative when adjacent text already names the action (`aria-hidden`); icon-only controls receive translated accessible names. Use `min-height`, not fixed height, for text-bearing translated actions.

Proposed shadow tokens preserve exact existing shapes:

| Name | Initial value |
|---|---|
| `--shadow-field` | alias `--field-shadow-rest` |
| `--shadow-panel` | `0 2px 4px rgb(40 23 60 / .02), 0 12px 32px -20px rgb(80 42 118 / .24)` |
| `--shadow-workspace` | `0 2px 4px rgb(40 23 60 / .02), 0 20px 60px -30px rgb(80 42 118 / .25), inset 0 1px 0 white` |
| `--shadow-popover` | `0 12px 40px -10px rgb(70 30 100 / .25)` |
| `--shadow-menu` | `0 28px 80px rgb(31 26 35 / .18)` |
| `--shadow-dialog` | `0 34px 90px rgb(31 26 35 / .28)` |
| `--shadow-sheet` | `0 -8px 60px rgb(31 26 35 / .28)` |
| `--shadow-toast` | `0 28px 70px -18px rgb(31 26 35 / .28)` |

Keep focus rings distinct from elevation. Card hover elevation is for genuinely interactive surfaces. Do not lift passive summary cards merely to make them decorative. A clickable Card must use a semantic link/button or a suitable composed pattern, not depend on `onClick` plus cursor styling.

Proposed elevation registry must preserve current modal behavior first: local table header 10, sticky tools 20, standard header 30, role header 40, sidebar/mobile nav 50, chat backdrop 55/panel 58/launcher 60; menu values currently reach 999; modal stack base **1200 + depth×10**, panel one above backdrop; skip-link 1400; splash 9999. Do not lower the modal base during token extraction. Document these numbers in one module/CSS registry where actually consumed. Audit stacking contexts and portal ownership; a z-index of 999 inside a parent stacking context is not necessarily above every 60 elsewhere. Menus/popovers opened inside modals must stay inside the appropriate focus/interaction layer. Toast stacking and placement must be tested against modal footers and mobile navigation rather than assigned a speculative new number.

## 6. Focus, interaction and CSS ownership

Preserve the current focus contract at `globals.css:711` and `:902`:

- Standard links/buttons/summary/tabbable/contenteditable nodes use a 2px solid focus outline with 3px offset. `focus-on-dark` sets the color to white; `focus-inset` makes offset minus focus width.
- Standalone `.sk-field` owns the border and halo on focus. The compound group owns the only outer ring when any child is focused. Invalid fields/groups remain red on hover/focus. Inner eye/clear/calendar actions use a separate inset outline so keyboard focus on the action is distinguishable.
- Field icon focus is the brand purple. Disabled fields/groups use solid muted colors, never opacity as the only indication. Error content is associated via `aria-describedby`, and fields have `aria-invalid` when invalid.
- Do not “fix” a visual mismatch by adding a page-specific `focus:ring-purple-*`, `outline-none`, or competing input border. Adjust the owner helper or token and verify every state.

For each canonical control record rest, hover, active, focus-visible, disabled, busy, invalid and success where meaningful. Busy actions preserve accessible names, prevent duplicate submissions, communicate progress, and keep completion feedback available beyond a disappearing toast when the result matters. Radio/switch/tab/menu behavior must follow the actual native or accessible pattern; matching colors does not supply keyboard behavior.

## 7. Motion contract and exact existing class vocabulary

Keep the following named styles recognizable during migration:

- `.animate-in`, `.fade-in-0`, `.zoom-in-95`: existing 200ms ease-out fade (the last name does not currently zoom).
- `.slide-in-from-bottom-2`: 300ms ease-out, 8px travel. `.animate-pulse-subtle`: 2s pulse to .7 opacity. `.animate-spin`: 1s linear.
- `.animate-skeleton-in`: 400ms `cubic-bezier(.4,0,.2,1)`, 4px travel. `.skeleton-shimmer`: isolated, hidden-overflow wrapper with 2s sweeping pseudo-element.
- `.animate-modal-enter`: 280ms `cubic-bezier(.16,1,.3,1)`, initial .96 scale + 8px. `.animate-modal-exit`: 180ms `cubic-bezier(.4,0,1,1)`, final .97 scale + 6px.
- `.animate-backdrop-enter`: 200ms ease-out; exit 180ms ease-in. `.animate-sheet-enter`: 320ms with decelerating curve; exit 180ms. `.animate-dropdown-enter`: 200ms decelerating, -4px/.98 initial.
- `.sk-blob`/`-2`/`-3`: 22/28/34s drift with -8/-16s delays on variants. `.sk-parallax`: .35s transform transition. `.sk-rise`: .6s. `.sk-shake`: .34s. `.sk-shimmer`: 2.6s. `.sk-check-pop`: .4s. `.sk-glow`/`.sk-float`: 3s. `.sk-sweep-trigger`/`.sk-sweep`: .85s on hover/focus.
- `.sk-typing-dot`: 1.2s with .15/.3s stagger; `.sk-bubble-in`: .32s; `.sk-ping`: 2s; `.sk-sparkle`: per-instance duration/delay, 2s default. `.sk-chat-canvas`: purple/pink radial haze and 22px dotted grid.
- `.custom-scrollbar`: 6px, rounded thumb, purple-gray opacity .55/.85. Global WebKit scrollbar is also 6px.

Proposed motion tokens: `--duration-fast: 150ms`; `--duration-control: 200ms`; `--duration-dialog-enter: 280ms`; `--duration-sheet-enter: 320ms`; `--duration-dialog-exit: 180ms`; `--ease-standard: cubic-bezier(.4,0,.2,1)`; `--ease-enter: cubic-bezier(.16,1,.3,1)`; `--ease-exit: cubic-bezier(.4,0,1,1)`. Decorative motion retains local existing timing but must stop for reduced motion. Do not attach new indefinite shimmer/glow to ordinary task controls.

Current reduced-motion rules conflict: at `globals.css:317`, dialog motion becomes a 120ms fade; at `:469`, named decoration is removed; at `:721`, all animation/transition durations are forced to **0.01ms** with `!important`. Therefore the 120ms comments are not the effective final duration. Proposed resolution: keep reduced motion effectively immediate and remove stale contradictory prose, or deliberately choose one reviewed 120ms fade policy with scoped exceptions. This plan's default is immediate reduced-motion state change. `Modal` has `EXIT_MS = 180` and sets a timeout; if timing changes, make CSS and lifecycle agree in one dedicated patch, including reduced-motion behavior. Do not allow premature unmount, lost focus restoration, or a visibly closed but still blocking dialog. CSS media queries do not control JavaScript Framer Motion; preserve/extend the existing `MotionConfig reducedMotion="user"` in chat to any animated feature that needs it.

## 8. Responsive and RTL contracts

Installed Tailwind breakpoints are `sm:40rem` (640px at normal settings), `md:48rem` (768), `lg:64rem` (1024), `xl:80rem` (1280), `2xl:96rem` (1536). No replacement breakpoint declarations were found in globals. Use these existing values; do not add 599px/1100px variants from the design reference module to app-wide CSS without a specific responsive need.

Existing shell conventions: sidebar is present from `md`, 256px expanded/72px collapsed; main uses corresponding logical margin. Under `md`, the role shell has bottom navigation and `pb-20`; main is `h-dvh`, `min-w-0`, `overflow-hidden`, with flex descendants requiring `min-h-0` for their scroll regions. Preserve scroll ownership and test nested tables/forms. ModalSurface is a bottom sheet below `sm` with 92dvh maximum; above sm it is centered with 24px outer padding and 90dvh maximum. Modal width choices are md/lg/2xl/4xl/6xl/92rem as declared in its width map. Do not change the breakpoint without updating the 640px JS matchMedia guard.

Use the authoritative per-route matrix in `execution.md`: 390×844, 768×1024 and 1440×1000, in EN/AR/UR. Its other named sizes are targeted stress cases. For changed responsive shells, modals and navigation, additionally check 639/640 and 767/768 breakpoint transitions, short mobile landscape, 200% zoom and an on-screen keyboard. Existing historical 375/1280/1536px captures are supplementary, not replacements for the core matrix. Record actual dimensions.

Proposed safe-area primitives: `--safe-area-bottom: env(safe-area-inset-bottom, 0px)`; a real `.safe-area-pb` utility or inline logical padding rule consuming it; `--mobile-nav-reserve` driven by the actual bottom bar height plus safe area. Current `RoleSidebar.tsx:102` references `safe-area-pb`, but no definition was found in `src`; verify computed styles before fixing it. Do not assume `pb-20` always protects all translated labels, zoom levels, or device insets.

Toast behavior to preserve: root Sonner is bottom-center, three visible, 5000ms duration, close button. Mobile bottom offset is `calc(74px + env(safe-area-inset-bottom, 0px))`. `.skoolee-toast` has 28px radius, 18px/20px padding, 14px blur, and the existing toast shadow. Root styles partly duplicate these CSS rules. Extract a single owner, then verify toast, modal footer, chat dock and navigation do not overlap. Replace toast icon `margin-right:12px` with `margin-inline-end` after RTL inspection.

RTL rules for future batches:

1. Continue using `LocaleProvider`, `useUiText`, `UiText`, `useLocaleFormat`, and existing catalogs. Do not introduce hard-coded English replacements or translate user-authored names/content. LocaleProvider sets `<html lang>`/`dir` in an effect; initial English defaults and direction hydration are a behavior to test, not to rewrite casually in a style batch.
2. Use logical `start/end`, `ms/me`, `ps/pe`, `border-s/e`, `text-start`, `margin-inline` for layout. Flip directional chevrons and drawer travel where appropriate. Do not flip logos, camera/media content, or every icon. Keep meaningful number/phone/email/code runs in isolated LTR spans (`bdi` or explicit local direction), using existing locale formatters for money and dates.
3. Preserve compound-field affix ordering and `.sk-select:dir(rtl)` behavior. Test mixed Arabic/English values, long Urdu labels, currency selection and caret behavior. Native date controls and localized display must preserve date-only business semantics.
4. Make sticky table identity columns use inline-start and mirror separator/shadow edges. Identified physical-left instances include teacher marks and shared-admin class tables. Verify scrolling and column order rather than text-align alone.
5. Put `lang` on script-specific authored content and preserve expected document direction. Avoid `tracking-wider`, uppercase transformations, or overly tight leading for connected scripts. The design reference has a scoped normal-tracking/1.5-leading override; equivalent production coverage is not established.

## 9. Specific risks to resolve before bulk migration

| Priority | Evidence / risk | Plan |
|---|---|---|
| High | Unlayered `* { border-color: hsl(var(--border)) }` at globals:143 outranks normal layered utility/component declarations, including intended subtle/state borders. Existing fields compensate with unlayered selectors. | Inspect computed borders in controls, checkbox checked/invalid, panels, badges, table states. Define one deliberate cascade ownership plan. Do not move this rule casually; a base-layer move affects the entire app. Capture before/after samples and inspect a cross-role pilot. |
| High | `.skoolee-dashboard-main` unlayered descendants redefine rounded-md=12px, lg=16px, xl=21.6px and border/muted styles; they also force table heading weight 800, conflicting with newer table styles. | Inventory every owner of this wrapper. Replace scoped implicit overrides with explicit semantic classes one feature at a time; retain old rule until final dependent migration. |
| High | `text-ink-faint` appears in real small UI text (e.g. `chat/new-conversation-dialog.tsx:385`), although token is non-text only. | Audit rendered backgrounds and replace readable text with ink-subtle/muted while preserving icon use. Check all states and translation. |
| High | A 7px status badge and 8px metadata exist in `role-dashboard/ManagementCard.tsx:89`/`:96`; role headers have many 9px labels. | Increase readable metadata through proposed caption scale per page; allow wrapping/reflow; verify density and no lost content. |
| High | Partial dark variables and hard-coded white/near-black component surfaces coexist; Tailwind dark variants may follow OS media while `.dark` tokens follow a class. | Do not promise dark support. Identify actual activation and test before any dark work. Scope light-theme improvements explicitly and avoid newly mixing activation systems. |
| Medium | Source `fieldAppearance` currently has `focus:bg-white`; Card/PageCard/Table/Modal/select picker/toasts hard-code white. | Replace appropriate occurrences with semantic surfaces only after light equivalence and dark policy are established. |
| Medium | `safe-area-pb` referenced with no source definition. | Verify generated/computed CSS then implement a real safe-area owner with mobile bottom reserve and toast/chat tests. |
| Medium | Native `base-select` enhancement contains physical background position fallback and hard-coded white/status colors. | Keep progressive enhancement, forced-colors fallback, and native keyboard behavior; test Chromium, Safari and Firefox, including RTL and disabled/invalid/multiple selects. |
| Medium | `.sk-date` hides the WebKit native calendar indicator. | Verify the replacement date action is focusable, labeled, usable and present before expanding this class to more inputs. |
| Medium | CSS global reduced-motion does not stop arbitrary JS animations; 120ms/0.01ms conflict and modal 180ms lifecycle. | Consolidate motion policy with exact lifecycle and keyboard regression checks. |
| Medium | Interactive Card renders a div; non-interactive cards also have hover styling. | Address semantics with real buttons/links at migrated call sites; do not add fake roles without keyboard support. |
| Medium | `Card`, `Button`, `Badge`, modal footer, and reference styles contain overlapping one-off visual decisions. | Consolidate at existing owner, not by copying reference CSS wholesale. Use reference route for fixtures only. |

## 10. Exact foundation implementation sequence for the implementing model

1. **Baseline without edits.** Read current instructions and relevant installed guides. Record Git status and preserve unrelated work. Open `/design-system` in development (it returns `notFound()` outside development), both default and `?patterns=application`; record these as fixtures, not proof of app-wide coverage. Capture actual forms/table/buttons/dialogs in one real authorized role flow as a representative baseline.
2. **Create a token manifest and aliases.** Use tables above. Put new semantic tokens alongside existing CSS tokens. Expose only needed utilities. Extract button gradient, panel/workspace shadows and sizes with unchanged initial visual values. Verify computed styles before/after. Do not change HSL representation, apply `hsl()` to hex variables, or add a parallel palette library.
3. **Resolve cascade deliberately.** Reproduce each universal-border/dashboard-override issue in a small fixture. Choose scoped fixes first. If moving the universal rule into `@layer base`, perform that as its own reviewable foundation patch with explicit border/state evidence. Keep field group invariants intact. Do not use `!important` as the default escape hatch.
4. **Normalize accessible primitives.** Reuse existing components. Add missing semantic variants only where a real caller needs them; preserve native input semantics. Align error/help text, progress/disabled behavior, caption typography, keyboard focus, and hit areas. Review button text wrapping and statuses on actual surfaces. Add the verified control-boundary adjustment only to essential boundaries.
5. **Consolidate modal/menu/toast/motion owners.** Preserve the existing `ModalSurface` stack/focus/scroll behavior, root Sonner, and native/select patterns. Background inert management is not currently implemented; verify and add it if needed as specified in the component plan, without hiding the active portal. Resolve focus ownership and motion timing. Use root-compatible portals for nested menus, not unrelated fixed overlays. Capture nested dialog + confirmation + toast and small-screen sheet + keyboard behavior.
6. **Harden responsive/script support.** Add verified safe-area handling and semantic logical layout. Register and test Arabic/Urdu web font only in its own visual batch. Normalize script tracking/leading without altering translation/business formatting. Capture Arabic and Urdu at three device categories, including long content and input editing.
7. **Pilot migration.** Choose one table/form screen and one role dashboard with real permissions; migrate only layout/style ownership, no query/action/auth changes. Preserve special calendar/timetable grids, financial semantics and reporting workflows. Compare before/after task completion and state evidence.
8. **Roll out by inventoried route groups.** Each page/state remains independent checklist work. Update NOT STARTED / IN PROGRESS / PASS / NEEDS FIX / UNVERIFIED status, device, language, role, states, evidence, issues and changes. No route is passed because it shares a component with a passing route.
9. **Retire compatibility only with proof.** Search all remaining callers, then delete now-unused visual overrides/duplicate token values. Do not remove `.dark` or module tones just because this light-theme batch did not use them.

Every foundation patch must include: exact source files touched; token/behavior delta; why the visual or interaction change is needed; the representative components/routes tested; screenshots or other reviewable evidence; checks run and exact results; unresolved/blocked states marked UNVERIFIED. Run relevant existing checks after each batch; `npm run lint` and the build are separate concerns. Build also runs Prisma generation and a commercial contract check. Avoid adding tests that merely echo CSS literal values; meaningful checks target keyboard behavior, focus restoration, invalid association, overflowing layouts, script rendering, and semantic interaction.

Example of a safe migration: a repeated card's border/shadow/radius becomes the existing `Card`/`.sk-panel` or `PageCard` with semantic aliases, while its existing data/actions/permission wrapper and translation hooks remain. Example of an unsafe migration: replace every `rounded-lg` with a new radius or every `text-ink-faint` with a single color without checking whether it is readable text, an icon, a decorative label, or inside a special scope.

## 11. Literal implementation recipes for the first extraction batch

These recipes document **current** composition. Keep them unchanged while adding aliases, then compare computed styles. Do not copy them into every page; update the existing owner once.

Current Input composition (`input-base.tsx`):

```tsx
cn("sk-field flex min-h-12 w-full px-4 py-2.5", className, fieldAppearance)
```

Current shared `fieldAppearance` literal:

```text
rounded-2xl border border-field-border bg-field-surface text-base font-semibold text-foreground shadow-(--field-shadow-rest) transition-[background-color,border-color,box-shadow] duration-200 enabled:hover:border-field-border-hover focus:bg-white placeholder:font-normal placeholder:text-ink-subtle disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-ink-muted disabled:shadow-none aria-[invalid=true]:border-destructive aria-[invalid=true]:bg-red-50/60
```

Current Select structural recipe (same final `fieldAppearance`):

```text
sk-field sk-select flex min-h-12 min-w-0 max-w-full w-full overflow-hidden text-ellipsis cursor-pointer px-4 py-2.5
```

Current Textarea structural recipe (same final `fieldAppearance`):

```text
sk-field flex min-h-[104px] w-full resize-y px-4 py-3 leading-relaxed
```

Current `pageCardSurface` literal:

```text
min-w-0 rounded-[24px] border border-[#e4dced] bg-white p-3 text-foreground shadow-[0_2px_4px_rgba(40,23,60,0.02),0_20px_60px_-30px_rgba(80,42,118,0.25),inset_0_1px_0_white] sm:rounded-[32px] sm:p-7
```

Current `cardSurface` literal is `sk-panel text-[#1f1a23] transition-all duration-200`. Current table wrapper is `relative w-full overflow-auto rounded-[24px] border border-border-subtle bg-white`; the table is `sk-data-table w-full caption-bottom text-sm`. Current Button size map is `default: min-h-11 px-4 py-2.5`, `sm: min-h-11 rounded-xl px-3 text-xs`, `lg: min-h-14 rounded-2xl px-8 py-3 text-base`, `icon: h-11 w-11`. Preserve differences until their dedicated consistency patch.

**PROPOSED baseline-preserving aliases** (illustrative planned code; not yet implemented):

```css
:root {
  --surface-canvas: hsl(var(--background));
  --surface-raised: hsl(var(--card));
  --surface-overlay: hsl(var(--popover));
  --text-strong: hsl(var(--foreground));
  --text-default: var(--ink);
  --text-secondary: var(--ink-muted);
  --text-tertiary: var(--ink-subtle);
  --icon-muted: var(--ink-faint);
  --radius-control: 1rem;
  --radius-table: 1.5rem;
  --radius-panel: 1.75rem;
  --radius-dialog: 2rem;
  --shadow-panel: 0 2px 4px rgb(40 23 60 / .02), 0 12px 32px -20px rgb(80 42 118 / .24);
}
```

Where a `.dark` subtree is supported, redeclare dependent aliases there so they resolve using the subtree variables, matching the existing focus-token strategy. `@theme inline` color aliases may directly refer to existing base tokens to avoid unnecessary intermediate resolution. Before converting a current hard-coded white component to `surface-raised`, test dark policy: that conversion preserves the light baseline but changes a `.dark` subtree's current rendering, so it is not automatically a global no-op.

Do not add a new global `.sk-field` skin after these aliases. `fieldAppearance`, existing `.sk-input-group` selectors, and the unlayered focus contract remain its owners. Page callers supply spacing/grid/width and accessible labeling, not another border/ring/gradient recipe.

No runtime route, CSS computed state, browser support combination, or customer role was exercised by this source-only token audit. Those checks are required implementation work and start with workflow status NOT STARTED and verification UNVERIFIED; record failures, missing prerequisites and untested cases explicitly.
