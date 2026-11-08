# Shared component implementation plan

This is a source-audited implementation plan, not a completed UI audit or implementation. No application files were changed and no browser state was certified. Repository root: `/Users/angular_dev_15/Downloads/skoolee-ai`. Paths below are relative to that root. Re-read a file immediately before editing it because other work may have changed it. The enclosing route inventory must account for every route and every important interaction independently; these reusable components do not substitute for page validation.

## 1. Execution rules and dependencies

1. Read `AGENTS.md`. Before touching Next.js code read the installed guides, at minimum `node_modules/next/dist/docs/03-architecture/accessibility.md`, `01-app/01-getting-started/05-server-and-client-components.md`, `01-app/01-getting-started/11-css.md`, and the forms/layout/routing guide relevant to the particular edit. These were inspected while preparing this plan. Preserve server/client boundaries and server-side authorization. Do not turn a whole layout into a Client Component merely to add an interactive control.
2. Reuse the current stack: Next 16.2.3, React 19.2.4, Tailwind 4, `class-variance-authority`, `clsx`, `tailwind-merge`, Lucide, Framer Motion, Sonner, Zod, React Hook Form, and Playwright. `cn` is already in `src/lib/utils.ts`. There is no installed Radix/Headless UI component system to assume. Do not run a shadcn generator or install another design system.
3. Names in the EXISTING sections are real exports. Names marked PROPOSED do not yet exist and must first be implemented and verified in their listed location. Do not write feature imports for proposed APIs before their foundation task lands.
4. Scope every migration to a named component and named consuming screens. Preserve existing event handlers, `name`, `id`, `ref`, `form`, `type`, validation bounds, autocomplete, disabled conditions, permission checks, data loading, error recovery, draft fields, and URL/view behavior. Compare the old and new markup and behavior together.
5. Source behavior takes precedence over old audit prose. In particular, the actual focus shadow now includes an inset edge, a 3px halo, and a diffuse glow. Do not restore older values from a previous design document.
6. Use `useUiText`, `UiText`, and `useLocale` from `src/components/locale/LocaleProvider.tsx`; translations live in `src/lib/locale/ui-messages.ts`. Translate explicit interface copy, including accessible names. Never translate names, IDs, authored messages, server codes, or other user content. Add and verify English/Arabic/Urdu copy together. Avoid dynamic English string concatenation: use the existing numbered placeholder convention.

## 2. Foundation: retain the actual product appearance

The implementation should consolidate the existing violet brand and neutral work surfaces. It should not invent a new visual identity. Keep `SkooleeLogo.tsx` and its CSS, the existing favicon/app icons, and domain tones in `src/lib/ui/module-tones.ts`. The main text font is Plus Jakarta Sans, loaded with the Latin subset in `src/app/layout.tsx`; the current document uses system fallback for other scripts. Noto Naskh Arabic font files exist in `public/fonts/` and are registered by PDF code, not by the web stylesheet. Web Arabic/Urdu font adoption is a separate measured change: verify glyph shaping, line height, weight, and line wrapping before proposing to load these fonts for the browser. Do not claim the PDF font is already the web font.

### Existing token and class contracts

All current CSS values live in `src/app/globals.css`; field utilities additionally live in `src/components/ui/field-appearance.ts`.

| Concern | Current source contract to preserve during extraction |
| --- | --- |
| Brand | `--brand-1: #8127cf`, `--brand-2: #9c48ea`; primary HSL `273 68% 48%` |
| Text | `--ink: #4d4354`, `--ink-muted: #635a6b`, `--ink-subtle: #746c7a`, `--ink-faint: #918a95`; faint is for non-text only |
| Surface | `background` = HSL `240 5% 97%`; card/popover are white; `--surface-subtle: #faf7fd`, hover `#faf5ff`, selected `#f3eafa` |
| Borders | `--border-subtle: #e4dced`, hover `#d2bfdf`; input border `#d8cfe5`, hover `#b39acb` |
| Error | surface `#fef2f2`, border `#fecaca`, text `#7f1d1d`; field error RGB `175 29 29` |
| Warning | surface `#fffbeb`, border `#fde68a`, text `#854d0e` |
| Field | fill `#fcfaff`; invalid fill `#fff5f5`; shadow `0 1px 2px rgb(55 27 77 / 0.05)` |
| Focus | RGB `155 122 184` (`#9b7ab8`), outline width 2px, outline offset 3px |
| Field focus shadow | `inset 0 0 0 1px var(--field-focus-border), 0 0 0 3px rgb(var(--focus-rgb) / 0.22), 0 0 16px 2px rgb(var(--focus-rgb) / 0.24)` |
| Error focus shadow | Same inset/halo/glow structure; error halo and glow use 0.16 alpha |
| Spacing | Existing `--space-task: 1.5rem` (24px), `--space-control: .75rem` (12px); use 4px increments |
| Type | `--text-body: .875rem` (14px), `--text-heading: 1.5rem` (24px); text entry fields use 16px; large task heading rises to 30px at `sm` |
| Panel | `.sk-panel`: 1px subtle border, radius 28px, white, foreground text; shadow `0 2px 4px rgb(40 23 60 / 2%), 0 12px 32px -20px rgb(80 42 118 / 24%)`; border/shadow transition 180ms |
| Toolbar | `.sk-toolbar`: 1px subtle border, radius 20px, subtle surface, padding/gap 12px |
| Field label | `.sk-field-label`: block, bottom margin 10px, ink, 14px/600, line height 1.4 |
| Table | `.sk-data-table`: width 100%, logical text-start, 14px; headers 12px/600; neutral hover/focus and selected surface |
| Breakpoints | Existing responsive usage is Tailwind default `sm=640`, `md=768`, `lg=1024`, `xl=1280`, `2xl=1536`; confirm installed theme before changing it |
| Motion | Field/button transition 200ms; panel transition 180ms; modal exit 180ms (`EXIT_MS` must match CSS); CSS has a global reduced-motion override |

**Required consolidation task:** add narrowly named aliases for the repeated existing values, without changing rendered values in the same commit: control minimum 44px, field minimum 48px, large action 56px; radii 12/16/20/24/28/32px plus pill; panel/page/popover/modal shadows; fast/normal/slow transition durations; layer tokens for toolbar/navigation/popover/modal/toast. Expose Tailwind aliases through the current `@theme inline`; do not add a Tailwind v3 config. Use the exact authoritative names/values in `tokens-and-styles.md`: in particular `--radius-control-small`, `--radius-control`, `--radius-toolbar`, `--radius-table`, `--radius-panel`, `--radius-dialog`, `--duration-fast`, `--duration-control` and the explicit dialog/sheet duration tokens. Do not invent competing card/normal/slow aliases. Map current values, then change one component at a time. These tokens and their utilities do not exist until the foundation implements them.

Layer tokens must preserve modal stack arithmetic: existing modal base is 1200 with 10 per level; a popup within a modal must belong to that modal, and a tooltip must never cover a later modal. Do not give every overlay the same `z-50`. Preserve root toast placement and safe-area offsets. Do not globally activate dark mode: `.dark` values exist but multiple components hard-code white backgrounds, so it remains UNVERIFIED unless explicitly included in the page matrix.

**Cascade prerequisite:** the current unlayered `* { border-color: hsl(var(--border)); }` overrides layered Tailwind border colors. Do not assume a `border-*` class changed the computed color. Capture computed styles on representative field/card/table/dialog controls first. If fixing the base-rule layering, isolate that in its own foundation change and review all affected surfaces; do not silently recolor the entire app inside a page migration. Explicit unlayered field rules must retain precedence. Do not modify token values and migrate dozens of pages in one diff.

### Invariant focus and state behavior

- Ordinary links/buttons use the global `:focus-visible` outline. `focus-on-dark` changes its color to white; `focus-inset` moves it inside the control. No new screen-level `focus:ring-*`, `focus:border-*`, `focus:outline-*`, or `focus:shadow-*` rules.
- Standalone `.sk-field` draws its own border/halo. Within `.sk-input-group`, only the group draws the surface, border, and halo. Inner fields are transparent with zero border/shadow/outline. Affix actions use the existing inset outline, so Tab identifies the action without a second outer ring.
- Invalid retains error styling while focused. Disabled fields are solid muted surfaces with readable ink and no opacity fade or focus halo. Read-only remains focusable/copyable where appropriate; it is distinct from disabled.
- Every asynchronous action shows pending text or equivalent accessible progress, prevents duplicate activation, and retains relevant input after failure. Success is tied to the server result. Do not say “Saved” for merely local draft storage.
- Decorative motion is removed under reduced motion; do not rely solely on CSS if a Framer Motion animation or JS count-up continues independently.

## 3. Existing reusable components: exact APIs and intended use

### 3.1 Buttons and links

**EXISTING `src/components/ui/button.tsx`:** exports `Button`, `buttonVariants`, `ButtonProps`; props are native button attributes plus `variant` and `size`, with a forwarded HTMLButtonElement ref. Variants: `default | dark | destructive | outline | secondary | ghost | link | choice`. Sizes: `default | sm | lg | icon`. Default is violet primary; default/sm minimum height 44px; lg minimum 56px; icon is 44×44px. Base is inline-flex, gap 8px, radius 16px, 14px bold, normal wrapping, 200ms transition, motion-safe active scale .98, direct action SVG 16px, minimum width 44px. `sm` uses 12px text and radius 12px. Preserve current gradient/shadow strings initially; extract their values, rather than approximating them.

`Button` currently has no `asChild`, `loading`, or `icon` prop and does not assign a default HTML `type`. Set `type="button"` explicitly for non-submit actions in forms; do not globally change its implicit submit behavior without auditing callers. Give an icon-only button a translated `aria-label`; icon SVG is `aria-hidden`. Keep a 44px hit target, including mobile clear/search/close actions.

**INTENTIONAL ADAPTER `src/components/role-dashboard/BrandButton.tsx`:** `variant?: gradient | dark | soft | danger`, `icon?: ReactNode`, native button props. Maps to canonical Button default/dark/secondary/destructive. Keep this adapter until all consumers deliberately migrate; it is not an independent button engine.

**PROPOSED small extensions:** optional `loading?: boolean` and `loadingLabel?: string` on Button, implemented within the existing component. Loading adds `aria-busy`, disables activation, preserves width where possible, keeps text visible, and uses a decorative Lucide spinner. Existing `disabled`, `type`, handler, and variant behavior remain unchanged. Do not intercept server-action submission or switch React Hook Form libraries as part of this extension.

**EXISTING link pattern:** Next `Link` for internal navigation and native `<a>` for external URLs/downloads. Use `buttonVariants` for an action-looking link, never wrap a link in a button. Ordinary text links are primary, underlined with a visible underline offset, and retain browser open/copy/new-tab behavior.

**PROPOSED `src/components/ui/link-button.tsx`:** import the installed type as `import type { LinkProps as NextLinkProps } from "next/link"` (there is no named `NextLinkProps` export). Planned signature: `LinkButton(props: NextLinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof NextLinkProps> & { variant?: ButtonProps['variant']; size?: ButtonProps['size'] })`. This is only a style adapter using `buttonVariants`; no disabled link API, no fake button `role`, no loading API. If navigation is unavailable, omit the link or render explained noninteractive text according to existing permission policy.

### 3.2 Inputs, selects, date fields, groups, and validation

| Existing path/export | Real API and usage |
| --- | --- |
| `ui/input.tsx` → `Input` | Native input props/ref. Public input entry point. Date type delegates to DatePicker with school locale/timezone/week start/messages. Tel/email/url/number default to LTR. |
| `ui/input-base.tsx` → `Input` | Internal native input, used by the public wrapper and DatePicker. Avoid direct feature imports. Base `sk-field flex min-h-12 w-full px-4 py-2.5`. |
| `ui/textarea.tsx` → `Textarea` | Native textarea props/ref. `sk-field flex min-h-[104px] w-full resize-y px-4 py-3 leading-relaxed`. |
| `ui/select.tsx` → `Select` | Native select props/ref/children. `sk-field sk-select flex min-h-12 min-w-0 max-w-full w-full overflow-hidden text-ellipsis cursor-pointer px-4 py-2.5`. Preserve native keyboard and form semantics. |
| `ui/input-group.tsx` → `InputGroup` | Div attributes/ref plus `surfaceClassName?`; layout `className` and optional explicit surface fill are separate. Uses `fieldAppearance` and `sk-input-group group relative flex min-h-12 min-w-0 items-center`. |
| `ui/label.tsx` → `Label` | Native label attributes/ref, `text-sm font-semibold leading-snug text-ink`; `htmlFor` must target the actual form control. |
| `ui/form-field.tsx` → `FormField` | `{ name: string; label?: ReactNode; error?: string; hint?: ReactNode; required?: boolean; className?: string; children: ReactNode }`. Derives `field-${name}` unless child has an ID; connects label, hint and error. |
| same → `FieldError` | `{ id?: string; children?: ReactNode }`; alert for grouped controls/steps. |
| same → `FormErrorSummary` | `{ errors: Record<string,string|undefined>; onFocusField?: (field:string)=>void; className?:string }`; lists errors with focus actions. |
| `ui/urdu-input.tsx` → `UrduInput` | `{ value:string; onChange:(value:string)=>void; placeholder?:string; textarea?:boolean }`; native shared field plus on-screen Urdu keyboard. |

All Input/Select/Textarea implementations append `fieldAppearance` after caller layout classes. Do not rely on passing competing field skins via className. Do not duplicate border/fill/shadow on compound children. Affixes must be direct `InputGroup` children with `data-field-affix="start"` or `"end"`; icons and controls remain in normal flow. Text affix actions may use `data-field-action="text"`. The current CSS corrects older absolute-position affix classes; new markup must use normal flow directly.

`fieldAppearance` is exactly: radius 16px; 1px field border; field surface; 16px semibold foreground; rest shadow; 200ms background/border/shadow transition; hover border; focused white fill; normal-weight subtle placeholder; solid disabled treatment; invalid destructive border/red surface. The unlayered CSS is the final focus/group state authority.

**DatePicker real API (`ui/date-picker.tsx`):** native input props minus value/defaultValue/type, plus `value?:string`, `defaultValue?:string`, `onValueChange?:(value:string)=>void`, `label?:string`, `locale?:string`, `todayDate?:string`, `weekStartsOn?:0|1|2|3|4|5|6`, `messages?:Partial<DatePickerMessages>`. Value is always Gregorian ISO `YYYY-MM-DD`; localization changes presentation only. Keep refs, native `input` events, name/form association, required/min/max/readOnly/disabled. Calendar opens in ModalSurface; left/right follow RTL; up/down ±7; Home/End honor weekStartsOn; PageUp/Down move month; Shift moves year; Enter/Space select; Escape returns focus. Check typed dates, leap days, month/year boundaries, and bounds.

**Source-level issue to verify/fix in the foundation batch:** `todayDate` changes today's marker, but the current Today action uses `new Date()` for selection and disabled calculation. Use the supplied campus date consistently after proving the issue with a synthetic timezone boundary test. Do not change date-only storage semantics.

**FormField contract corrections before wide reuse:** preserve caller `aria-describedby` IDs when effects wire compound fields; do not erase caller validation attributes when `error` is absent; remove `aria-required` when required becomes false; make IDs unique for two simultaneous forms/dialogs with the same field names. Current code derives IDs only from names and imperatively reassigns compound children, so these are explicit regression cases, not claimed guarantees. Add a backward-compatible `id?: string`/scoped form prefix only after tracing existing `field()` and error-summary focus logic. Keep label focus working for UrduInput and InputGroup.

**Existing validation hook `src/lib/hooks/use-validated-form.ts`:** `useValidatedForm({schema,initialValues,onSubmit?,onInvalid?})` returns `values, errors, touched, submitting, submitted, isValid, formRef, field, setValue, setValues, setErrors, setServerErrors, validate, validateField, validateFields, handleSubmit, focusField, reset`. Reuse existing schemas from `src/lib/validators/`; do not weaken domain validation for visual simplicity. Blur/submit reveal errors, already-errored fields revalidate as corrected, server field errors merge and focus. Use native `<form>` semantics. Checkbox binding needs checked from boolean state; do not blindly spread the string `value` binder and assume it controls checked state.

**Drafts:** preserve `useFormDraft` in `src/lib/hooks/use-form-draft.ts` and `DraftRecovery` in `ui/draft-recovery.tsx`. Hook options are `{record,schema,values,baseline,fields,enabled?,section?,apply,current?}`. UI props are `{draft,saving?,excluded?,labels?}`. Device drafts are session-scoped, field-allowlisted, expiring, and distinct from saved server records. Existing scope rechecks/conflict review/clear-on-logout are security behavior, not styling. Localize messages without changing those transitions.

### 3.3 Checkboxes, radios, switches

**EXISTING Checkbox (`ui/checkbox.tsx`):** all native input attributes except type; forwarded input ref; native `type=checkbox`. Visual mark 20px, 2px border, 7px radius; checked/indeterminate/invalid/disabled/forced-colors styles already exist. Indeterminate is an input DOM property, not a JSX boolean attribute; set through a ref/effect. Wrap in a label of minimum 44px height; clicking text toggles; Space toggles; disabled remains legible. Keep name/value and native form submission.

**PROPOSED Radio (`ui/radio.tsx`):** `RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>`; forwardRef, native radio type, 20px visual circle, primary accent, inherited global focus, solid disabled state, forced-colors native appearance. Group using fieldset/legend and shared name. Native arrows select within group; Tab enters once; no custom div-based radio keyboard engine. Existing raw radios are intentionally exempt from adoption checks; migrate only specific instances once the component exists.

**PROPOSED Switch (`ui/switch.tsx`):** `SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>`; forwardRef native checkbox with `role="switch"`, checked/defaultChecked/onChange/name/form preserved. Hit target 44×44px minimum; visual track 44×24px and thumb 20px centered inside that target. Visible focus on track when input focuses. Off uses muted border/surface, on uses primary; translate thumb with logical direction so RTL is correct. Pair with a real label; keep aria-checked synchronized with native checked state. On/off must not be communicated only by color. Save-on-toggle callers must retain their existing pending/failure rollback and permission behavior.

Existing switch consumers include `src/components/chat/chat-settings-dialog.tsx` and `src/components/shared-admin/index.tsx` role permissions. These are migration targets, not replacements for the Radio/Checkbox semantics. Registration institution-choice cards and attendance status choices may remain function-specific controls when their semantics and keyboard behavior are validated.

### 3.4 Badges, cards, headers, alerts, empty states

- **Badge `ui/badge.tsx`:** div attributes plus `variant: default | secondary | destructive | outline | success | warning`. Base pill border, horizontal 10px/vertical 4px padding, 12px/900 text. It is not interactive. Keep status words beside color/icons. Audit current success/warning/destructive text/background computed contrast before using those variants broadly; replace values with semantic status tokens in a measured batch.
- **Card `ui/card.tsx`:** native div props/ref; exports `cardSurface`, `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`. `cardSurface` delegates to `.sk-panel`. Header p24/bottom16; content/footer p24/top0. CardTitle currently renders a div, not a heading. Plan an additive `as?: 'h2'|'h3'|'h4'|'div'` for titles with default preserving current output. A Card with onClick currently only gains visual treatment; do not call it keyboard-accessible. Use explicit Link/Button inside the card, or add a separately verified interactive composition. Do not wrap an entire card in a link if it contains other buttons/links.
- **PageCard `ui/page-card.tsx`:** native div props/ref; exports `pageCardSurface`; `min-w-0`, white foreground surface, 1px subtle border, 24px radius/p12 on phone, 32px radius/p28 at sm, existing layered page shadow. Navigation belongs outside it and task sections inside it. Do not nest a PageCard around every internal card.
- **Task patterns `ui/task-patterns.tsx`:** `TaskHeader({scope,title,description?,action?})`, `TaskFeedback({kind:'empty'|'error'|'permission'|'success',title,children?,action?})`, `TaskLoading({label})`, `TaskStatus({children,attention?})`. TaskHeader emits h1 and wraps actions; TaskFeedback errors use role alert, others status; TaskStatus is a noninteractive worded pill. Reuse these rather than introducing separate ErrorState/SuccessState systems.
- **Role EmptyState `role-dashboard/EmptyState.tsx`:** `{icon,title,description?,action?}`, centered icon/copy/action for role dashboards. Keep this role-specific visual composition; generic feedback stays TaskFeedback. `student/student-ui.tsx` has StudentEmptyState, Panel, PanelHeading, CountUp, ProgressRing, and StatCard; these are domain patterns, not proof of an accidental duplicate. Role and student StatCards are both showcased in the current application reference.
- **PROPOSED `ui/alert.tsx`:** only for compact inline warnings/information that do not fit TaskFeedback. API `{tone:'info'|'success'|'warning'|'error'; title?:ReactNode; children:ReactNode; action?:ReactNode; announce?:'off'|'polite'|'assertive'; className?:string}`. Default announcement off; caller chooses assertive only for new urgent error. Radius16/p12/gap12, status token border/fill/text, 16px decorative icon, 14px text. No close action by default; never auto-dismiss validation. Avoid nested live regions when used inside another alert.
- **WorkspaceHeader `shared-admin/workspace.tsx`:** `{icon,eyebrow,title,summary?,actions?,children?,tone?:ModuleTone}`; use for existing list workspaces, while TaskHeader owns simple task pages. It currently emits h2; ensure the page has one descriptive h1. Do not add a second h1 to an existing Header page.

### 3.5 Tables, filtering, selection, and pagination

**Basic table `ui/table.tsx`:** `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` with corresponding HTML props/ref. Table includes an overflow-auto bordered white wrapper radius24; table `sk-data-table w-full caption-bottom text-sm`; head h48/px16/12px bold/text-start; cells p16; rows have hover/focus-within/selected surfaces. Use real `<caption>`, scope on column/row headers, and meaningful textual empty states. Do not add ARIA grid to an ordinary data table.

**Enhanced existing DataTable (`shared-admin/workspace.tsx:554`):** `DataColumn<T> = {key,label,sortable?,align?:'left'|'right'|'center',width?,secondary?,render:(row:T)=>ReactNode}`. `DataTable<T>` accepts `{rows,columns,rowKey,selected?:Set<string>,onToggleSelect?,onToggleAll?,sort?:{key,dir:'asc'|'desc'},onSort?,onRowClick?,rowClassName?,density?:'compact'|'comfortable',empty?,minWidth?:number}`. Default minWidth 900; compact cells px12/py8, comfortable px16/py12; secondary columns hidden below lg. This is the list-management composition; basic Table is the lower-level semantic primitive. `insights/chart-kit.tsx` also has a DataTable for a chart's exact data twin; preserve that specialized contract.

**Required additive table corrections:**

1. Add `caption?:ReactNode`, `getRowLabel?:(row:T)=>string`, localized selection labels, `aria-sort` on sorted th, and header indeterminate property for partial selection. Keep source column keys and sorting callbacks unchanged.
2. Replace first-cell mouse-only `onRowClick` behavior with an explicit first-cell native button or a new `rowHref?:(row:T)=>string` Link. If a caller's first cell already renders an interactive child, it must supply the explicit child instead; never nest button/link controls. Keep onRowClick as compatibility callback while migrating callers individually.
3. Add `align:'start'|'end'` as preferred options; preserve old left/right aliases until each caller's numeric/text meaning has been reviewed. Monetary amounts are formatted by existing locale utilities and remain tabular; IDs/email keep LTR isolation.
4. Add a named focusable scroll region only when overflow exists; provide a translated scroll hint on small screens. Preserve headers and primary action. If secondary columns disappear, expose those values in an existing detail view or approved mobile row expansion; do not silently drop essential data.
5. Selection must state its scope (visible page/current list/all matched records) based on the existing business behavior. Never change a bulk API's scope as a style migration. Keep selection stable on sorting, and define whether filtering clears it based on existing functionality. Verify that destructive bulk actions still confirm and respect authorization.

**Related existing workspace exports:** `useWorkspacePrefs(scope,defaults?)` for `view:'cards'|'table'|'board',density,sortKey,sortDir,perPage`; `WorkspaceToolbar({children,trailing?})`; `SearchField({value,onChange,placeholder?,label?,autoFocusKey?:string|null,className?})`; `ToolbarSelect({value,onChange,label,options:[string,string][]})`; `ToolbarToggle({active,icon,label,count?,tone?:'amber'|'rose'|'violet',onClick})`; `ViewSwitch`; `SelectionBar({total,actions,onClear,busy?,note?})`; `Pagination({page,totalPages,perPage,total,firstShown,lastShown,onPage,onPerPage,perPageOptions?})`; `usePaged(rows,perPage)`; `ModalPager`.

Keep search, filter, sort, view and pagination state on recoverable errors. Don't replace a filtered-empty state with the initial empty illustration: offer Clear filters and preserve the query. Source SearchField installs a `/` shortcut per instance; permit at most one visible page-level shortcut or set `autoFocusKey={null}` in dialogs/secondary lists. Make it ignore modifier keys and inactive/hidden/modal-obscured fields before broad adoption. Translate clear/search/page-count text. Do not reset page size preferences merely to normalize appearance.

### 3.6 Navigation, tabs, and layouts

**RoleShell `role-dashboard/RoleShell.tsx`:** props `{navigationAccess?,navigationAccessFallback?,tagline?,navItems:SidebarEntry[],bottomItems?,searchPlaceholder?,eyebrow?,userName?,userRole?,avatarSeed?,dashboardHref?,logoUrl?,headerActions?,children,className?}`. It composes LocaleProvider, NavigationAccessProvider, RoleSidebar, RoleHeader, ChatProvider/ChatDock, skip link, and the scrolling workspace. Main is `min-w-0`, h-dvh, p12/md:p20, pb80/md:pb20; margin starts at sidebar width. Retain one chat provider/event source and permission recovery surface.

**RoleSidebar:** `RoleNavItem` has label/icon plus href/onClick/active/available/module/lang; groups have label/icon/children/available. Props `{tagline?,taglineLang?,items,bottomItems?,logoUrl?,collapsed?,onToggleCollapse?}`. Desktop is 256px or collapsed72 at md; phone uses bottom navigation and More opens shared ModalSurface. Links keep href and aria-current, local views use buttons, expanders expose aria-expanded. Do not convert role navigation to arbitrary tabs or duplicate permission filtering. Keep logical start/end, translated labels and narrow-phone rules. Test keyboard expand, mobile open/close, focus return, and actual sidebar layout in both RTL languages.

**NavigationAccess `components/nav/NavigationAccess.tsx`:** provider accepts `{children,access?:NavigationAccess|null}`; use hook for `allows`, `allowsHref`, and status; notice has `{denied?,fallback?}`. Unknown access hides protected routes until verified, and failures offer recovery. `src/lib/navigation/modules.ts` maps URL/local-view to permission modules, and `items.ts` handles route boundaries. Preserve all of this; visibility alone does not authorize an API.

**WorkspaceSubnav (`nav/WorkspaceSubnav.tsx`):** `{label,items:{id,label,href?}[],active?,onSelect?}` with wrapping min44 links/buttons and permission filtering. **SectionSubnav** accepts `{ariaLabel,items:SectionNavItem[],active,onNavigate,allowed?}` and adapts into WorkspaceSubnav. Keep these as route/local-workspace navigation; they are not true tab panels.

**Intentional older adapters:** `components/layout/sidebar.tsx` uses RoleSidebar for `/dashboard`; `components/layout/header.tsx` remains the older dashboard header and account/notification menu host. `src/app/dashboard/layout.tsx` composes PageCard and its older shell. Keep it live until each dashboard route has been reviewed; do not delete it because RoleShell also exists. Domain page shells in teacher/student/parent/operations retain their local behavior.

**PROPOSED true Tabs (`ui/tabs.tsx`):** controlled API `{id:string,label:string,value:string,onValueChange:(id:string)=>void,items:{id:string,label:ReactNode,disabled?:boolean,panel:ReactNode}[],activation?:'manual'|'automatic',orientation?:'horizontal'|'vertical'}`. Default manual; do not add a second route system. Render tablist/tab/tabpanel with IDs, aria-selected/controls/labelledby, roving tabindex, and hidden inactive panels. Left/right respect RTL; up/down for vertical; Home/End; Enter/Space activates manual tabs. Skip disabled items. Changing focus does not activate an expensive async view. Keep panel state mounted with hidden attribute unless a documented caller requirement says otherwise. Use a wrapping neutral strip; selected primary text/accent background; min44 targets. Existing chat conversation filters are a semantic decision: either filter buttons with aria-pressed or real panels, not `role=tab` without a tabpanel. Record this change before migrating.

### 3.7 Dialogs, confirmations, drawers, and layered interactions

**Use `ui/modal.tsx` for new modal work.** `ModalProps`: required `{title:string,children,onClose}`; optional `eyebrow,subtitle,icon,avatar,chips,tone,size,wide,footer,headerActions,dirty,dirtyMessage,disableBackdropClose,hideClose,className,bodyClassName,role:'dialog'|'alertdialog'`. Tone `violet|emerald|amber|rose|sky`; size xs/sm/md/lg/xl/full maps to sm:max-w-md/lg/2xl/4xl/6xl/[92rem]. `wide` is a legacy lg alias. Body scrolls independently; header/footer remain reachable. Under640px it is a bottom sheet max92dvh/radius-top32; desktop max90dvh/radius32; safe-area footer padding. ModalSurface owns portal, scroll lock, stack, focus/Tab, Escape, mobile drag and close animation.

`ModalSurface` accepts `{onClose,size?,wide?,dirty?,dirtyMessage?,disableBackdropClose?,role?,labelledBy?,describedBy?,ariaLabel?,className?,children}`. `useModalSurface()` provides `{requestClose,dragHandleProps,titleId,descId}` for custom chrome. `useDialogBehaviour(panelRef,{onClose,active?})` is an escape hatch for existing specialized drawer/command palette, not a new parallel overlay system.

**Compatibility APIs:** `ui/dialog.tsx` exports Dialog/Trigger/Content/Close/Header/Title/Description/Footer and delegates to ModalSurface. `shared-admin/index.tsx` ModalFrame delegates to Modal; it must remain until its consumers migrate. Its separately named ModalActions is an older admin footer, while `ui/modal.tsx` ModalActions has `{busy?,busyLabel?,actionLabel,onCancel,onAction,cancelLabel?,blockedReason?,tone?:'violet'|'rose'|'emerald',secondary?}`. These props are not interchangeable; migrate by explicit adapter, never import-name replacement. `shared-admin/wizard-shell.tsx` and its FormSection/Field/Review* exports are existing domain wizard composition.

**ConfirmAction (`ui/confirm-action.tsx`):** `{open,title,description,confirmLabel?,cancelLabel?,busy?,tone?:'danger'|'warning'|'primary'|'success',detail?,onConfirm,onCancel}`; based on Modal role alertdialog. NavGuardPrompt consumes `{pendingHref,message,proceed,cancel}` from existing guard hook. Preserve impact details and business confirmation; do not add confirmations to every low-impact toggle.

**Required overlay foundation corrections, each with a targeted behavior test:**

1. Add `dismissible?:boolean` default true to Modal/ModalSurface; false blocks Escape, backdrop, drag and close controls together. Use `dismissible={!busy}` for blocking confirmations. Existing disableBackdropClose alone only blocks the backdrop; Escape and drag currently still close.
2. Replace the internal discard prompt's untrapped overlay with the shared stacked alertdialog/focus machinery, without creating recursive dirty prompts. On opening, focus safe Keep editing; Tab stays in prompt; Escape cancels discard; cancel returns focus into original form; discard exits once. The current parent trap is disabled while askDiscard is true and the internal prompt lacks its own focus management.
3. Add optional `initialFocusRef?:RefObject<HTMLElement|null>` and a labeled dialog description contract where needed. Default current first-field focus remains compatible. Destructive confirmations focus Cancel/safe action first. Only the top layer handles Escape; closing a child restores focus to its parent trigger, closing parent returns to page trigger if still present.
4. Localize internal close/discard/header/footer strings. Add a small `labels` prop where a provider is absent; preserve defaults for existing callers. Dialog title and actual description must be linked; verify screen-reader accessible name, not only visible title.
5. When a modal is active, verify background focus and virtual-cursor behavior. Add top-layer background inert management with restoration if needed, accounting for sibling portals/toasts/stacked dialogs; never hide the active portal from assistive tech.
6. Preserve 180ms exit timing or adjust CSS and JS together; reduced-motion may use immediate or minimal exit without stranding focus. Pointer selection leaving a text field must not dismiss a dialog. Native submit/Enter must not accidentally press the close control.

**PROPOSED shared Drawer:** extend ModalSurface internally with `placement?:'auto'|'center'|'start'|'end'|'bottom'` default auto. Auto preserves the current bottom-sheet-below-640px / centered-desktop behavior; an explicit center remains centered. Then expose `Drawer` from `ui/drawer.tsx` with `{open:boolean,title:string,children,footer?,onClose,side?:'start'|'end',size?:'sm'|'md',dirty?,dirtyMessage?,dismissible?,labels?}`. It must reuse the same portal/stack/focus/scroll/dirty handling; do not build another `fixed z-50` shell. End/start are logical RTL edges. The first side-drawer version disables the existing Y-axis drag handler; use logical horizontal entrance/exit translation with reduced-motion support. Add horizontal swipe dismissal only in a separately tested change, never reuse clientY/translateY for a side drawer. Desktop width sm=28rem, md=36rem bounded by viewport; phone full width with safe-area padding, max100dvh and internally scrollable body. Migrate `SettingsDrawer` in `shared-admin/class-manager.tsx:206` as first proving consumer; preserve save handlers and state. Command palette is another specialized consumer; do not force it into a title-heavy settings form.

### 3.8 Menus, popovers, tooltips

There are no shared generic Menu/Popover/Tooltip files under ui. Account menus live in both header files; chat options in `chat/message-thread.tsx`; calendar `DayPopover` in `academic/AcademicCalendar.tsx`; UrduInput hosts its own keyboard popup; timetable currently relies on title text for some tooltips. These must each be inventoried as states, even when the owning route otherwise looks complete.

**PROPOSED internal `ui/floating-surface.tsx`:** shared non-modal positioning/dismissal infrastructure for Menu/Popover/Tooltip only. Reuse current React/ReactDOM and CSS. Anchor rect, viewport clamp with 8px margin, 8px gap, logical start/end alignment, flip above if bottom space insufficient, recalculate on resize/scroll/element resize, and render portal content without a fixed hard-coded global z. Inherit an enclosing modal's layer and focus scope. Prefer a modal-local portal host that stays inside its focus root while avoiding scroll clipping; otherwise explicitly register portalled branches with the focus/inert manager. A z-index alone does not keep a body portal inside the parent trap. Copy the anchor's effective `dir` and `lang` when the portal loses local ancestry. Test Tab/Shift+Tab, nested Escape and RTL positioning. Shared surface classes are `rounded-2xl border border-border-subtle bg-popover text-popover-foreground p-1 shadow-(--shadow-popover)` with max-width `calc(100vw - 16px)` and scrollable maximum height. Open interactions must be dismissible by Escape/outside pointer, listeners cleaned up, and handlers must not close unrelated layers. A menu inside a modal must consume Escape before the modal; add explicit child-layer coordination to ModalSurface rather than assuming `stopPropagation` prevents same-document listeners. This module is internal, not another public design system.

**PROPOSED Menu (`ui/menu.tsx`) small API:** `{trigger:ReactNode,triggerLabel:string,items:({id,label,icon?,disabled?,danger?,onSelect:()=>void}|{id,label,icon?,disabled?,href:string})[],align?:'start'|'end',open?:boolean,onOpenChange?:(open:boolean)=>void}`. Trigger means button CONTENT, never a nested button/link; component owns real trigger button/ref. Native links remain links inside menuitem semantics. Open with click/Enter/Space or ArrowDown (first) and ArrowUp (last); menu uses roving focus; arrows/Home/End/typeahead skip disabled entries; Escape closes/returns focus; Tab closes and proceeds, never traps; selection closes once; links preserve modified-click semantics. Disabled entries expose aria-disabled and do not invoke actions. No submenu support in first API. Account identity header can be an optional presentation slot added only after required behavior passes. Keep account profile/logout and permission logic in the caller.

**PROPOSED Popover (`ui/popover.tsx`) API:** `{trigger:ReactNode,triggerLabel:string,title:string,children:ReactNode,open:boolean,onOpenChange:(open:boolean)=>void,align?:'start'|'end',initialFocusRef?:RefObject<HTMLElement|null>}`. Trigger content only. Non-modal by default, role dialog with a name, no aria-modal and no scroll lock; focus enters interactive content on keyboard open, Tab can leave; Escape returns to trigger; pointer outside closes without stealing focus back from clicked target. Do not put long data-entry or dirty forms inside this small API; use Modal/Drawer for those, or preserve the existing calendar's dirty guard until its dedicated migration. Read-only explanatory material can stay in-flow instead of becoming a popup.

**PROPOSED Tooltip (`ui/tooltip.tsx`) API:** `{content:string,children:ReactElement,side?:'top'|'bottom',delayMs?:number}`. Child must be a focusable control; compose its existing ref/event handlers and aria-describedby, do not overwrite them. Hover/focus opens; Escape hides without deactivating control; pointer may move onto tooltip; leave/blur closes; no interactive content and no focus trap. Suggested delay 400ms on hover, immediate focus. Use 12px readable text, 8×12px padding, radius12, 280px maximum width, high-contrast surface. Do not require a tooltip to understand the action or read a record: use labels/help text, and keep essential timetable details reachable on touch. Disabled-button explanations belong in visible help or a focusable adjacent help control, not an unreachable tooltip.

`insights/chart-kit.tsx` already exports VizTooltip, InsightCard, SeriesLegend, data-table twin, and EmptyChart. Reuse chart-specific APIs; generic Tooltip is for controls. Every interactive chart keeps its accessible tabular equivalent and visible series legend. Do not replace Recharts tooltip behavior with a text tooltip.

### 3.9 Toasts, loaders, skeletons, connectivity

**EXISTING Sonner root in `src/app/layout.tsx:91`:** bottom-center, richColors, closeButton, visibleToasts=3, default duration5000; phone bottom offset `calc(74px + env(safe-area-inset-bottom, 0px))`; current toast radius28, padding18×20, type13/700 and `.skoolee-toast`. Keep one Toaster. Do not mount another in a page or raise it over dialog actions. Standardize tokens in this root and CSS, not per-call skins. Existing `toast.success/error/message/loading/promise` remain valid; translate at the call site because the root may be outside a page LocaleProvider. Every actionable error also stays on the page/form; toast alone is not sufficient for validation or recovery. Pending notifications get updated/dismissed by the same operation ID. Never show success on request start. Allow long/translatable text and touch dismissal; verify keyboard action/close controls and screen-reader announcement.

**EXISTING `ui/skeleton.tsx`:** `Skeleton({className?,delay?})`, `SkeletonBar({className?,tone?:'light'|'dark',delay?})`, `SkeletonRegion({children,className?,label?})`, `SkeletonList({rows?,className?,label?})`, `SkeletonCards({count?,className?,cardClassName?,label?})`, `SkeletonTable({rows?,columns?,className?,label?})`, `SkeletonBlock({className?,label?})`. Shapes are aria-hidden; one outer status/busy announcement. Match the actual content shape and height to reduce layout jump. Translate loading labels. Domain shell skeletons remain deliberate compositions of these.

**PROPOSED `ui/spinner.tsx`:** `{label:string,size?:'sm'|'md',inline?:boolean}` with Lucide Loader2, 16/20px, status/sr-only label. When inside an already-announced loading Button, icon is decorative and caller owns announcement; do not nest duplicate status regions. Use a spinner for action progress, skeleton for content loading.

**Existing app behavior:** `ui/app-loader.tsx`, `providers/app-loader-provider.tsx`, `ui/offline-banner.tsx` plus its CSS module, and `providers/network-provider.tsx`. Keep network-vs-auth distinctions and `/api/public/health` probe behavior. A recoverable network failure preserves input/filters and gives retry. Do not conflate an access-denied screen, empty data, and offline state under one generic “No data” treatment.

## 4. Compatibility and adoption constraints

`tests/design-system/adoption.test.ts` walks source and rejects raw standard inputs/selects/textareas outside `components/ui`; raw file/range/radio/hidden/color controls and hidden switch checkboxes are deliberate exceptions. It also bans custom focus ring/outline/border/shadow utilities and retired #aa8bc4 literals. Do not bypass the guard with arbitrary wrappers or add exemptions to make a migration pass.

Current declared debt paths, each needing its own eventual page/state review:

1. `src/app/(auth)/protect-account/page.tsx`
2. `src/app/account/security/page.tsx`
3. `src/app/memberships/page.tsx`
4. `src/app/parent/fees/page.tsx`
5. `src/app/pupils/[id]/page.tsx`
6. `src/app/student/fees/page.tsx`
7. `src/components/academic/ReportCardPipeline.tsx`
8. `src/components/fees/AccountsTab.tsx`
9. `src/components/fees/FeePaymentsTab.tsx`
10. `src/components/locale/CurrencySelect.tsx`
11. `src/components/settings/LocaleSettingsPanel.tsx`

Remove a debt entry only after its associated controls and every affected important state are migrated and verified. Specialized canvas/timetable/chat/finance interfaces keep their domain structure. No blind global replace of button/div/input/ModalActions/StatCard/DataTable names.

Contracts currently requiring additive fixes rather than promises: FormField ID and aria merging; native checkbox checked binding; mouse-only Card/DataTable actions; table header sorting/selection labels; busy modal dismissal; dirty-prompt focus; account-menu keyboard behavior; source strings in shared navigation/dialog/draft/table components; RTL physical align/translate styles; DatePicker Today timezone consistency; CollapsiblePanel's header action key events bubbling into its div-button. For CollapsiblePanel, replace the div-button-with-nested-actions with a native expand button and sibling header actions, add aria-controls and panel ID, and test Space/Enter on the action does not toggle the panel. These are source observations to reproduce and resolve, not browser-certified findings.

## 5. Implementation sequence with reviewable boundaries

| Batch | Files and task | Required proving consumers / acceptance |
| --- | --- | --- |
| C01 | Record actual computed token/focus/border styles; add token aliases only; build reference inventory of variants | Both reference routes plus real login, one table, one long modal in en/ar/ur; no unexplained computed-style changes |
| C02 | Input/FormField/checkbox/DatePicker contract corrections and localization; Radio/Switch only after native semantics specified | Two concurrent same-name forms, compound field, invalid summary, date bounds/timezone, keyboard/forced-colors, chat setting toggle rollback |
| C03 | Modal dismissal/focus/dirty/description/localization corrections; Drawer adapter | Long form, stacked confirm, dirty cancel/discard, pending Escape/drag, class settings drawer, command palette; focus returns correctly |
| C04 | Menu/Popover/Tooltip small infrastructure and keyboard tests; preserve feature callbacks | Both account headers individually, chat options, touch tooltip alternative; then calendar popup in its own follow-up |
| C05 | Table semantic/RTL corrections; loading/empty/error/localization; small LinkButton/Spinner/Alert adapters | One basic table, enhanced roster, dense finance list, chart data twin; visible-page selection, numeric direction, narrow overflow, keyboard row action |
| C06 | Tabs and navigation polish with existing permission mapping | Real tabs vs filters classified, mobile More, collapsed sidebar, restricted role, access-load failure/retry, old dashboard header |
| C07+ | Route-by-route feature migrations from enclosing plan | Every route and important state receives its own checklist rows/evidence; no inferred pass from shared component usage |

For every batch first create/adjust a synthetic reference example for the changed state, make the smallest implementation, run targeted checks, inspect the actual affected feature screens, and review diff. Do not change permission/business rules, data shape, or workflow order under a “shared styles” title. A workflow change needs a recorded user problem, before/after behavior, data/permission invariants, and validation evidence.

## 6. Validation protocol and evidence required

Reference URLs are development-only: `/design-system` and `/design-system?patterns=application`, routed by `src/app/design-system/page.tsx`; production returns notFound. Components are `components/design-system/DesignSystemReference.tsx` and `ApplicationPatternsReference.tsx`. These are useful fixtures but currently offer only synthetic English/Arabic direction controls; they do not certify Urdu or real school flows. Extend fixtures for all new component variants and all three supported languages before using them as evidence.

Run existing suites appropriate to the change:

```sh
node --import tsx --test tests/design-system/adoption.test.ts tests/design-system/navigation.test.ts tests/design-system/navigation-recovery.test.tsx
npx playwright test --config tests/design-system/playwright.config.ts
node --import tsx --test tests/locale/ui-coverage.test.ts
```

Run targeted ESLint for changed files and TypeScript without incremental output; use generated Next types per installed docs if needed. Run the project's required build checks after the batch; `npm run build` also invokes Prisma generation and commercial contract checks. Do not run destructive database reset/seed scripts as a UI check. Real role validation requires an explicitly isolated synthetic fixture and the existing audited setup; never exercise writes on real customer records. Existing package `test:e2e` uses `playwright.config.ts` and only tests/e2e, so it does not automatically run the separate design-system suite.

Meaningful new behavioral tests (not snapshots of implementation details):

- Two forms with same field names have unique label/error associations; compound input hint IDs preserved; error summary focuses the right form; invalid/read-only/disabled distinction; file/number/date input semantics survive.
- Native checkbox/radio/switch keyboard/label behavior, indeterminate state, disabled form submission, forced-colors; save failure visibly rolls back only if the existing domain contract requires it.
- Modal trap/top-layer Escape/restore, dirty nested prompt, pending-dismiss prevention, outside pointer semantics, scroll lock cleanup, drag on phone, reduced-motion exit; dismissing popup inside modal does not close modal.
- Menu roving focus, first/last/typeahead, disabled items, Tab exit, modified link click; popover focus and clipping; tooltip hover persistence/Escape/keyboard and essential text outside tooltip.
- Table aria-sort, row button/link keyboard activation, selection scope/indeterminate, labels with row identity, filter recovery, large translations, logical alignment.
- Navigation access loading/error/denied/ready and retry remain closed until explicit allowed map; route boundary matching and local view active behavior survive.

Use the authoritative matrix in `execution.md` for every touched route and important state: core 390×844 phone, 768×1024 tablet and 1440×1000 desktop in English, Arabic and Urdu, plus the documented targeted stress sizes. Check 639/640 and 767/768 transitions for changed shells/modal/navigation. Include the representative authorized role and relevant restricted role; default, focus/hover/pressed, pending, success, invalid/server error, empty/no-results, disabled/read-only, overlay open/stacked/dirty and 200% text/zoom when relevant. Use real browser viewport sizes, not only CSS device screenshots. Verify document width does not overflow; only designated tables/timelines scroll horizontally. Touch/keyboard actions and safe-area/toast/footer intersections must be checked visually and functionally.

Each evidence row records route plus query/view, component/state, role, synthetic fixture, viewport, language/dir, keyboard steps, outcome, screenshot/trace path, issue and fix, and status `NOT STARTED | IN PROGRESS | PASS | NEEDS FIX | UNVERIFIED`. An unavailable role, missing synthetic data or required check that cannot be completed is UNVERIFIED with a reason, never PASS. A reproduced untranslated string or interaction failure is NEEDS FIX. A discovered overlay whose audit has not begun is NOT STARTED. All failed, blocked or untested cases keep a separate verification outcome UNVERIFIED until a successful retest, as specified in execution.md. Capture before/after evidence for an intentional visual or workflow change. Keep screenshot artifacts in ignored `test-results/design-system/` or the enclosing audit's specified evidence directory; do not commit secrets/session cookies.

Completion of the shared foundation means its components and proving consumers pass their stated contracts. It does not mean the entire application passed. The final report must name created vs reused components, compatibility adapters retained, exact pages/states inspected, unresolved issues, and all coverage limits.


## Implemented application-wide adoption extensions

- `Button variant="choice"` owns standard selected-card/selector borders and surfaces through `aria-checked`, `aria-pressed`, `aria-current="step"` and `data-selected`. Keep caller layout and domain status semantics; do not copy the ordinary action skin.
- `FieldAction` from `ui/input-group` owns inline reveal, regenerate and clear actions. It forwards native button props/ref, defaults to `type="button"`, and shares 44px group geometry and 16px direct icon sizing. It has no Button `variant` or `size` props.
- `Table containerClassName` puts existing scroll bounds on the shared wrapper, preserving one scroll owner for sticky headers/cells.
- `Modal`, `ModalSurface`, `DialogContent` and `useDialogBehaviour` accept `returnFocusRef` for async or temporarily disabled openers. The default captures the opener before descendant autofocus; mounted-inactive overlays track the opening pointer/keyboard interaction. Busy dismissal and nested stack behavior remain shared.
- `npm run check:ui` has no route exemptions and runs during production builds. It rejects ordinary native actions/fields outside shared UI, focus-token forks and duplicate Toaster owners. Native file/range/radio/hidden/color and visually hidden checkbox contracts remain the plan's explicit specialized cases.
- `npm run audit:ui` regenerates the source coverage inventory. Static reachability is not runtime acceptance of every role/data/language/state.
