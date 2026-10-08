# Public product templates

Scope: shared `src/app/(public)/product-page.tsx` and each of its six route consumers. No metadata, commercial claims, policy text, pricing terms, demo-email body or destinations changed.

Baseline actual `/ai-school-management-software`: three `a > button` nested interactive controls. At320px the logo touched Pricing and Book a demo broke across three short lines in the single-row header. These were visually inspected before editing.

Changes: CTA anchors and navigation links consume shared button variants directly; there are no nested interactive controls. Header wraps its logo/navigation with44px link targets and the Trust link remains available on phones. Feature articles adopt the existing `sk-panel` surface. Shared server rendering is preserved; no client boundary or request was introduced.

Verification: all6 routes individually passed actual-app browser checks at320/390/768/1440: visible h1 and synthetic-example disclosure, no whole-page horizontal overflow, expected pricing/login/trust/mailto hrefs, no nested anchors/buttons and minimum44px navigation targets. Keyboard Enter on Pricing reaches `/pricing`. Twelve route screenshots retained. Manual320px review confirmed a legible wrapped header. The combined product/pricing run passed9 tests. Mail links were inspected only.

Routes: `/ai-school-management-software`, `/ai-report-cards-urdu-english`, `/ai-student-performance-analytics`, `/multi-campus-school-erp`, `/school-fee-management-software`, `/whatsapp-report-card-software`.

Limits: content remains authored English, not a translated-page claim. Other engines, native screen readers, complete reduced-motion inspection and policy-page navigation acceptance remain open. Each route is PARTIAL.
