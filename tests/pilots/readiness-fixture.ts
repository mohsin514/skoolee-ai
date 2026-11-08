// Synthetic SKAI-1016/1018 fixtures: pseudonymous roles and QA references only, no real school data.
import { READINESS_ITEMS } from "../../src/lib/school-ai/pilot-readiness";
import { TRUST_REQUIREMENTS, REQUIRED_NOTICE_LOCALES, type TrustMarket } from "../../src/lib/school-ai/market-trust-readiness";

export const readyRecord = (geography = "PAKISTAN_LAHORE") => ({
  schoolScope: { schoolRef: "SYN-SCHOOL-A", campusRefs: ["CAMPUS-1", "CAMPUS-2"], academicLead: "Lead L-01", teachers: ["T-01", "T-02"] },
  pack: { geography, board: "BISE Lahore", grade: "9", subject: "Mathematics", examYear: "2027", academicYear: "2026-27", term: "Annual", tier: "Core", language: "en", approvalStatus: "APPROVED", approvedAt: "2026-01-10", reviewDueAt: "2099-01-01", localBudgetApprover: true },
  evidence: Object.keys(READINESS_ITEMS).map((item) => ({ item, status: "PASSED", reference: `QA-LINK-${item}`, reviewer: "Reviewer R-01", reviewedOn: "2026-01-15" })),
  measurement: { pilotId: "pilot-syn-1", thresholdsAgreedOn: "2026-01-16", thresholdsReference: "charter v1", baselineDefined: true },
  decision: { outcome: "GO", rationale: "All readiness items evidenced; thresholds agreed with school.", founderApprover: "Founder", schoolApprover: "Principal P-01", decidedOn: "2026-01-20", rollbackPlan: "disable pack flag", exitExportPlan: "SKAI-1015 export", salesClaimsReviewed: true, negativeEvidence: [] },
});

export const trustRows = (market: TrustMarket = "PAKISTAN") => TRUST_REQUIREMENTS.map((requirement) => ({
  market, requirement, reference: `QA-TRUST-${requirement}`, reviewer: "Counsel C-01", reviewedAt: new Date("2026-01-05"),
  reviewDueAt: new Date("2099-01-01"), locales: [...REQUIRED_NOTICE_LOCALES[market]], supersededAt: null, createdAt: new Date("2026-01-05"),
}));
