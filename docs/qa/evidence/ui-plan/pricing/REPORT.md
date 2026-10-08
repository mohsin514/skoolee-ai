# Pricing shared controls

Scope: `src/components/marketing/PricingPage.tsx`, shared Select picker chevron CSS, focused browser tests. No catalogue, entitlement, price calculation, country defaults, commercial disclosure, registration destination or sales URL changed.

Baseline from actual `/pricing` at390px: native page-owned selects measured44px and owned their focus skin; billing period buttons measured40px. Migrated to shared Select/Button and `buttonVariants` for semantic links. Controls now inherit the existing focus/state styles and minimum44px button target. Pricing content/currency language selection remains local as before.

Manual Urdu phone review then exposed a shared base-select chevron pointing left: `border-inline-end` mirrored the drawn diagonal when direction became RTL. The chevron now draws its right/bottom borders physically, while its position still follows logical spacing. This preserves the down/open-up shape in both directions. The browser test inspects the supported picker pseudo-element rather than assuming every browser implements base-select.

Verification: 3 EN/AR/UR browser cases passed, checking320/390/768/1440 page overflow and target heights, shared select adoption, country SAR display with published PKR prices, keyboard annual selection, monthly3200/annual38400 calculations for Pro and return to monthly4000, pressed state and unchanged registration/mailto destinations. Six screenshots retained. A separate9-case public-controls run passed after the shared chevron fix. Manual phone review performed in Urdu. No email CTA was invoked.

Limits: header Log in and `/mo`/`/yr` remain the pre-existing English labels; do not count complete localization. No real purchase/checkout was run. Other engines, physical touch/keyboard/safe-area and screen-reader behavior remain unverified. R017 is PARTIAL.
