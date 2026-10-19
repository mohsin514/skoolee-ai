/**
 * Charter Desk pin guard. The decorative setup cover comes BEFORE the desk
 * in the DOM and stays in it below lg, so anything it renders can steal a
 * strict Playwright locator (getByText(...).first(), getByRole, getByLabel).
 * The cover pieces must therefore never render a pinned string, a campus
 * name, a link, a button, a focusable or a live region; and the per-step
 * plates must only use `short` labels.
 *   node --import tsx --test tests/onboarding/charter-pins.test.tsx
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthCover } from "../../src/components/auth/AuthCover";
import { InstitutionPreview } from "../../src/components/auth/InstitutionPreview";
import { CampusPlan } from "../../src/components/onboarding/CampusPlan";
import { CharterLedger } from "../../src/components/onboarding/CharterLedger";
import { ModeLedger } from "../../src/components/onboarding/ModeLedger";
import { WeekStrip } from "../../src/components/onboarding/WeekStrip";
import { fill, onboardingCopy } from "../../src/app/onboarding/copy";

const CAMPUS_NAMES = ["Gulberg campus", "DHA campus", "Beta campus", "North campus"];

const FORBIDDEN = [
  "Your campuses", "Compare packages", "Configure fees and payroll", "Set up school operations", "Use Exam Studio with my current systems", "A school group",
  "Primary campus created automatically", "Activated now:", "campus drafts are beyond", "You are completing this setup",
  'role="status"', 'role="alert"', "aria-live", "<a ", "<button", 'tabindex="0"',
];

function assertClean(label: string, html: string) {
  for (const needle of [...FORBIDDEN, ...CAMPUS_NAMES]) assert.ok(!html.includes(needle), `${label} must not render ${JSON.stringify(needle)}`);
  assert.doesNotMatch(html, /<(input|select|textarea)\b/, `${label} must not render a form control`);
  assert.doesNotMatch(html, /\btabindex="(?!-1")/, `${label} must not render a focusable`);
}

function coverPieces(language: "en" | "ar" | "ur") {
  const t = onboardingCopy(language);
  const c = t.charter;
  const ledger = (
    <CharterLedger
      title={c.ledgerTitle}
      rows={[
        { key: "type", label: c.ledger.type, value: t.types.GROUP.short },
        { key: "use", label: c.ledger.use, value: c.useShort.EXAM_STUDIO },
        { key: "city", label: c.ledger.city, value: "Lahore", flag: true },
        { key: "package", label: c.ledger.package, value: "Free" },
        { key: "campuses", label: c.ledger.campuses, value: fill(c.campusSplit, 1, 2) },
        { key: "session", label: c.ledger.session, value: "2026-27", ltr: true },
        { key: "week", label: c.ledger.week, value: t.workingDays(6) },
      ]}
      seal={{ state: "open", caption: c.sealOpen }}
    />
  );
  const plan = <CampusPlan nodes={[{ key: "c1", state: "active" }, { key: "c2", state: "draft" }, { key: "c3", state: "draft" }, { key: "slot-0", state: "slot" }]} more={2} />;
  const items = (["classes", "assessments", "admissions", "fees"] as const).map((key) => ({ key, label: c.modules[key] }));
  const labels = { inSkoolee: c.inSkoolee, stays: c.staysInSystems, modules: c.modulesLabel };
  const modes = [null, "EXAM_STUDIO", "FULL_OPERATIONS"] as const;
  const preview = (
    <InstitutionPreview
      variant="card"
      language={language}
      schoolName="Synthetic Horizon Schools"
      regId="SKL-AB12"
      kicker={t.types.GROUP.short}
      tagline="Learning together"
      details={[{ label: t.schoolId, value: "SKL-AB12", ltr: true }, { label: t.city, value: `Lahore · ${fill(c.established, 1998)}` }, { label: t.website, value: "horizon.example", ltr: true }]}
      density="compact"
    />
  );
  return { t, c, ledger, plan, items, labels, modes, preview };
}

for (const language of ["en", "ar", "ur"] as const) {
  test(`${language}: cover pieces render no pinned string, campus name, control or live region`, () => {
    const { c, ledger, plan, items, labels, modes, preview } = coverPieces(language);
    assertClean("CharterLedger", renderToStaticMarkup(ledger));
    for (const state of ["open", "pending", "pressed", "failed"] as const) {
      assertClean(`CharterLedger (${state})`, renderToStaticMarkup(<CharterLedger title={c.ledgerTitle} rows={[]} seal={{ state, caption: c.sealPressed }} />));
    }
    assertClean("CampusPlan", renderToStaticMarkup(plan));
    assertClean("CampusPlan (unlimited)", renderToStaticMarkup(<CampusPlan nodes={[{ key: "c1", state: "active" }]} unlimited />));
    for (const mode of modes) assertClean(`ModeLedger (${mode})`, renderToStaticMarkup(<ModeLedger mode={mode} labels={labels} items={items} />));
    assertClean("WeekStrip (cover)", renderToStaticMarkup(<WeekStrip variant="cover" language={language} closed={[6, 7]} />));
    assertClean("InstitutionPreview (card + details)", renderToStaticMarkup(preview));
  });

  test(`${language}: the whole charter cover is text-only and decorative`, () => {
    const { t, c, ledger, plan } = coverPieces(language);
    const html = renderToStaticMarkup(
      <AuthCover
        eyebrow={`${fill(t.stepOf, 3, 6)} · ${t.steps.package.title}`}
        heading={{ ...c.cover.package, as: "p" }}
        headingKey="package"
        art={<div className="sk-plate" data-layer="package">{plan}<p className="sk-plate-meta">{fill(t.covers, t.campusCount(1))}</p></div>}
        foot={ledger}
      />,
    );
    assertClean("AuthCover (charter)", html);
    assert.doesNotMatch(html, /<h1\b/, "the cover line is a <p>; the step card owns the only h1");
    assert.match(html, /class="sk-cover-foot"/, "the ledger sits in the cover foot");
    assert.ok(html.indexOf("sk-cover-foot") > html.indexOf("sk-display"), "foot after the heading");
  });
}

test("CampusPlan draws no text and no connector for drafts", () => {
  const html = renderToStaticMarkup(<CampusPlan nodes={[{ key: "a", state: "active" }, { key: "b", state: "draft" }, { key: "c", state: "slot" }]} />);
  assert.doesNotMatch(html, /<text\b|<title\b/);
  assert.equal(html.match(/data-link=""/g)?.length ?? 0, 1, "only the active campus is joined to the office");
  assert.equal(html.match(/data-slot=""/g)?.length ?? 0, 3);
  assert.doesNotMatch(html, /data-new/, "nothing presses in on the first render");
});

/** The per-step cover plates (Task A3/B) may only use short labels and never campus names or desk-only copy. */
test("plate and cover sources use short labels only", () => {
  const dir = "src/app/onboarding/_wizard/plates";
  const sources = [
    ...(existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".tsx")).map((name) => join(dir, name)) : []),
    "src/app/onboarding/_wizard/wizard-cover.tsx",
  ].filter((file) => existsSync(file));
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /\b(?:types|modes)\s*\[[^\]]+\]\s*\.\s*label\b/, `${file}: use .short, never .label`);
    assert.doesNotMatch(text, /\bt\s*\.\s*(?:types|modes)\s*\.\s*[A-Z_]+\s*\.\s*label\b/, `${file}: use .short, never .label`);
    for (const key of ["primaryCampusNote", "activateNote", "overLimit", "delegateBanner", "noAccessTitle", "yourCampuses", "comparePackages", "campusSaved", "revoked", "optionalWork", "errors["]) {
      assert.ok(!text.includes(key), `${file} must not reference ${key}`);
    }
    assert.doesNotMatch(text, /\b(?:campus|c|draft|planned\[[^\]]*\])\s*\.\s*name\b/, `${file}: no campus names on the cover`);
  }
});
