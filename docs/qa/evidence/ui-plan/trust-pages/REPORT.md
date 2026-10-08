# Trust and policy shared surfaces

Scope: `src/app/(public)/trust-page.tsx`, four existing consumer routes and focused tests. Policy sections, headings, descriptions, metadata and JSON-LD remain unchanged.

Baseline: actual Privacy page at320px had a34px Product link target and an inline text-only return link. Policy cards maintained a horizontal icon/text split even on narrow phones, using their own radius/shadow recipe. Cross-navigation offered only three policies, omitting the existing Human Review Policy route and not indicating the current page.

Changes: Product and return links consume shared button variants; the hero link uses the existing focus-on-dark adapter. Interior cards/navigation consume `sk-panel`; phone sections stack icon above text. Named Trust policies navigation includes all four existing routes, with aria-current for the active policy. This stays a server-rendered template without a new client boundary.

Verification: all4 routes individually passed at320/390/768/1440: visible h1, no page overflow,44px Product/return target heights, all4 navigation destinations and exactly one current item. Keyboard Enter on Human Review Policy reaches its existing page. Existing reduced-motion background reports animation-name none. Eight screenshots retained; manual Privacy320px review confirmed readable stacked cards and usable hero navigation.

Limits: policies remain authored English; translation/native-speaker/legal-content review was outside this visual batch. No claim of screen-reader, other-engine or physical-device acceptance. R011/R015/R018/R020 are PARTIAL.
