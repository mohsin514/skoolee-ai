import { AI_FEATURE_LABELS, type AIFeature } from "./prompts";

/** Fixed fictional fixtures for an explicit preview. These never read or write school records. */
const samples: Record<AIFeature, string> = {
  generate_remarks: "Sample learner scored 82/100 in English and 68/100 in Mathematics.\n\nYou explain ideas clearly in English and are making steady progress in Mathematics. Practise equivalent fractions for ten minutes each day and show each calculation step. Your consistent effort will help you build confidence.",
  rewrite_remark: "Original sample: Needs to improve fractions.\n\nEncouraging draft: You are developing confidence with fractions. Keep practising equivalent fractions with visual models, and explain each step in your own words. We will review your progress together next week.",
  translate_remark: "English sample: You are making steady progress. Keep practising every day.\n\nUrdu draft: آپ مسلسل ترقی کر رہے ہیں۔ ہر روز مشق جاری رکھیں۔",
  weak_topics: "Sample class: 24 learners; fractions exit ticket.\n\nEquivalent fractions: 14 of 24 correct. Comparing fractions: 19 of 24 correct.\n\nSuggested focus: revisit equivalent fractions using fraction strips. Use three short questions at the next lesson's start to check understanding. These sample results are practice data.",
  homework_suggestions: "Sample topic: Grade 5 equivalent fractions.\n\n1. Draw two models showing that 1/2 = 2/4.\n2. Complete 2/3 = __/12 and explain your method.\n3. Write one example of equivalent fractions from everyday life.\n\nEstimated time: 15 minutes. Bring one question to the next class.",
  lesson_plan: "Sample topic: Grade 5 equivalent fractions · 40 minutes.\n\nLearning goal: identify and create equivalent fractions.\n5 min — Recall halves and quarters with a diagram.\n10 min — Model 1/2 = 2/4 using fraction strips.\n15 min — Pairs build and explain three equivalent fractions.\n5 min — Compare two worked examples.\n5 min — Exit ticket: explain why 2/3 = 4/6.\n\nSupport: offer pre-drawn strips. Extension: find two equivalent fractions for 3/5.",
  at_risk_students: "Sample review: Learner A has 78% attendance and a mathematics score of 52/100, down from 61/100.\n\nSuggested staff review: check whether attendance records are complete, speak with the learner, and offer a short fractions support session. A teacher must review the context before taking action; these fictional indicators are not a student diagnosis.",
  class_performance_summary: "Sample class: Grade 5 A · 24 learners.\n\nAverage: 74/100. Previous assessment: 69/100.\nStrength: reading comprehension, 82% average.\nPractice focus: equivalent fractions, 58% average.\n\nNext step: revisit fraction models and compare the next exit ticket with this sample baseline.",
  teacher_class_comparison: "Sample classes: Grade 5 A averages 74/100; Grade 5 B averages 71/100 on the same assessment.\n\nThe three-point difference alone does not establish teaching quality. Review attendance, prior attainment and question-level results together. Both classes can share a fractions practice activity.",
  intervention_suggestions: "Sample support draft: small-group fractions practice.\n\nGoal: explain equivalent fractions using a visual model.\nPlan: two 15-minute sessions this week, then a three-question exit ticket.\nOwner: class teacher.\nReview: compare the work and learner feedback after one week.\n\nThis sample has not been assigned to a learner.",
  pending_review_queue: "Sample review queue: 3 remark drafts and 1 support plan.\n\n1. Check remarks against the recorded assessment evidence.\n2. Review language and tone before family communication.\n3. Assign an owner and review date to the support plan.\n\nNo live approvals are changed by this preview.",
  campus_comparison: "Sample campuses: North has 120 learners and a 76% assessment average; South has 100 learners and a 72% average.\n\nCompare matching year groups and assessment coverage before drawing conclusions. Share North's worked-example activity and review both campuses' next exit-ticket results.",
  weak_campuses: "Sample review: South Campus mathematics average is 64%, compared with 71% in the previous term.\n\nCheck cohort changes and assessment difficulty first. Ask the subject team to review question-level evidence and prepare a two-week practice plan. This sample does not rate any real campus.",
  ai_usage_by_campus: "Sample monthly usage: North Campus 34 requests; South Campus 26 requests. Total: 60 requests.\n\nMost-used activity: lesson-plan drafting. Suggested review: check whether staff find the drafts useful and whether each campus has access to the same training.",
  fee_recovery_insights: "Sample ledger: 20 invoices of 5,000 each; 16 paid and 4 outstanding. Collection rate: 80%. Outstanding total: 20,000.\n\nNext steps: reconcile recent payments, check disputed balances, and prepare reminders for staff review. This preview sends no messages and changes no balances.",
  academic_trend_summary: "Sample term averages: 66%, 70%, 74%. Overall change: +8 percentage points.\n\nReading results improved consistently; fractions still need practice. Confirm that the assessments and learner cohorts are comparable before interpreting this pattern.",
  explain_report_card: "Sample report: English 82/100; Mathematics 68/100. Total 150/200 (75%).\n\nEnglish is a strength in this sample. For Mathematics, practise equivalent fractions and explain the steps aloud. Ask the teacher which classroom activities best support the next goal.",
  study_plan: "Sample five-day study plan: equivalent fractions.\n\nMonday — Draw halves and quarters (10 min).\nTuesday — Build three equivalent pairs (15 min).\nWednesday — Explain one pair to a family member (10 min).\nThursday — Solve four practice questions (15 min).\nFriday — Review mistakes and ask your teacher one question (10 min).",
  school_faq: "Fictional policy for this sample: library books are borrowed for seven days and may be renewed once at the library desk.\n\nSample question: Can I renew my library book?\nAnswer: In this sample policy, you may renew once at the library desk. Ask your own school for its approved borrowing policy.",
};

export function getAIPrototypeDraft(feature: string) {
  if (!Object.prototype.hasOwnProperty.call(samples, feature)) return null;
  const key = feature as AIFeature;
  return {
    output: `SAMPLE DATA — ${AI_FEATURE_LABELS[key]}\nFictional preview; no school records were used or saved.\n\n${samples[key]}`,
    model: "demo:school-workflows-v1",
    tokensUsed: 0,
    saved: false,
  } as const;
}
