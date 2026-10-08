# Shared overlay locale and direction follow-up

Baseline: FOUNDATION C's passing RTL/Urdu phone fixture still names its dirty prompt and internal actions in English. ModalChrome, compound Dialog close controls, default ConfirmAction labels/eyebrows and NavGuardPrompt likewise contain fixed English framework copy. Caller-provided titles/descriptions remain caller-owned. ModalActions also uses physical `sm:mr-auto` for its secondary slot.

Scope: shared document-locale subscription extracted from the already tested AppToaster; a small typed EN/AR/UR overlay message registry; shared modal/dialog/confirmation internal chrome and logical footer alignment; focused tests. Do not change caller-authored content, submitted values, close policy, timing, stacking, dirty/busy state, locale persistence or server requests.

Proposed implementation follows existing LocaleRoot publication to document lang/dir. Preserve the EN initial server snapshot and caller-provided message/label overrides. One shared document observer serves mounted subscribers and disconnects when unused. Tests must check real translated chrome, focus/dirty/busy behavior and caller override preservation. This does not certify full-page translation or replace role-context acceptance.

Implemented the shared `useDocumentLocale` subscription, framework message registry and consumers. No extra locale request/provider was added. Caller overrides retain precedence; secondary actions now use logical end margin. Default confirmation/loading actions also expose `aria-busy`.

Verification: focused overlay/toaster suite **22 passed** (`test-results/overlay-locale-final`); targeted ESLint passed. It checks EN/AR/UR footer alignment, AR/UR framework labels, in-place document language changes retaining a draft, caller overrides, nested focus restoration, busy dismissal, toast palette and phone/footer coexistence. Existing fixture content remains deliberately authored English; this is framework translation evidence only.

During development one misplaced hook caused fixture render failures and was corrected. A later two-case failure came from pressing Escape while the nested dialog's exit was still in progress; the test now waits for its removal before requesting parent dismissal, matching the existing close lifecycle. No timings were shortened to satisfy tests.

Outstanding: full application locale publication/adoption, translated caller content, native-speaker review, physical devices and screen readers. Root document language controls this registry; local subtree-only language switches need separate integration checks. Background inertness and the existing phone toast/body overlap remain open.


## Action contrast and close target follow-up

Measured the compiled default small white confirmation labels in the synthetic browser fixture before changing colors: danger rose500 **3.75:1**, warning amber500 **2.13:1**, success emerald600 **3.65:1**; primary **6.72:1**. These normal-state measurements failed the4.5:1 target. A first capture sampled hover before its transition painted; final tests wait two frames and measure both endpoints. Baseline capture was diagnostic, not an acceptance pass.

Centralized the solid action classes in `src/components/ui/action-tones.ts`, used by ConfirmAction, ModalActions and the dirty discard action. Danger uses rose600, warning amber700, success emerald700; primary unchanged. Final normal/hover ratios are saved in the four `action-*-verified.json` files: danger4.53/6.03, warning5.03/7.09, success5.36/7.61, primary6.72/8.62. Disabled controls and decorative header gradients are not covered by these numbers.

ModalChrome Close now measures44×44px; the AR/UR phone tests assert both dimensions. The full modal fixture suite passed18 tests with contrast and all existing dismissal/focus/localization cases. Root typecheck passed after this change. No dismissal policy, action payload or caller label changed.

## Semantic button links

Independent review confirmed `buttonVariants` originally used `enabled:hover` and `enabled:active`; anchors never match `:enabled`. Actual pricing Log in stayed unchanged on hover, while the equivalent Annual native button changed to its shared hover colors. Two focused CTA-link baseline tests failed and the disabled-button baseline passed.

The shared action skin now uses `actionable-hover` and `actionable-active` variants, defined once in globals for native enabled controls and href anchors, excluding aria-disabled actions. Hover retains the hover-capable-device media guard. This fixes new public/auth consumers and existing older-dashboard consumers without nesting buttons in links or duplicating skins. Final state/focus results are recorded in the consolidated evidence.

The first pressed-state test inspected `transform`; Tailwind4 emits individual `scale`, so this was corrected in the test. That then demonstrated an actual reduced-motion defect: `motion-reduce:transform-none` left scale at0.98. Spatial press scaling is now limited by `motion-safe`, leaving color/shadow feedback available without motion. Final semantic-link/disabled/field focus suite: **13 passed**, including normal preference scale0.98 and reduced preference scale none. This test correction and product fix are recorded separately; no reduced-motion acceptance was inferred from the original transform assertion.
