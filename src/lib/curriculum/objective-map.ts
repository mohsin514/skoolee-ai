import type { CurriculumData, PaperData } from "@/lib/school-ai/assessment";

// SKO-406 objective map: pure functions over saved curriculum versions, papers, resources and
// released assignments. Coverage states stay separate and each carries the evidence behind it;
// nothing here infers mastery or relates objectives by similar titles or codes.

export type Outcome = CurriculumData["outcomes"][number];
export type PaperRef = { id: string; title: string; version: number; status: string; data: PaperData };
export type ReleaseRef = { id: string; paperId: string; paperVersion: number; snapshot: PaperData };
export type ResourceRef = { id: string; title: string; status: string; objectives: { curriculumId: string; curriculumVersion: number; outcomeIds: string[] } | null };
export type TopicRef = { id: string; title: string; description: string | null; status: string };

export type ObjectiveCoverage = {
  outcomeId: string;
  planned: { topics: Array<{ id: string; title: string; status: string }> };
  taught: { sections: Array<{ section: string; taughtOn: string }> };
  assessed: { releases: Array<{ assignmentId: string; paperId: string; paperVersion: number; questions: number }> };
  resources: Array<{ id: string; title: string }>;
  drafts: Array<{ paperId: string; title: string; questions: number }>;
};

/** Topics imported from an approved curriculum carry "Approved workspace <record>, version <n>; outcome <id>." */
export function topicOutcome(description: string | null, recordId: string): string | null {
  const match = description?.match(/Approved workspace (\S+), version \d+; outcome (.+)\.$/m);
  return match && match[1] === recordId ? match[2] : null;
}

export function objectiveCoverage(recordId: string, curriculum: CurriculumData, version: number, input: { topics: TopicRef[]; releases: ReleaseRef[]; papers: PaperRef[]; resources: ResourceRef[] }): ObjectiveCoverage[] {
  const pinned = (data: PaperData) => data.curriculumId === recordId && data.curriculumVersion === version;
  return curriculum.outcomes.map(outcome => {
    const asks = (data: PaperData) => data.questions.filter(question => question.outcomeIds.includes(outcome.id)).length;
    return {
      outcomeId: outcome.id,
      planned: { topics: input.topics.filter(topic => topicOutcome(topic.description, recordId) === outcome.id).map(({ id, title, status }) => ({ id, title, status })) },
      // Taught requires a teacher-confirmed coverage row; a timetable or imported topic is only "planned".
      taught: { sections: (curriculum.sectionCoverage ?? []).filter(row => row.confirmed && row.outcomeIds.includes(outcome.id)).map(row => ({ section: row.section, taughtOn: row.taughtOn })) },
      assessed: { releases: input.releases.filter(release => pinned(release.snapshot) && asks(release.snapshot) > 0).map(release => ({ assignmentId: release.id, paperId: release.paperId, paperVersion: release.paperVersion, questions: asks(release.snapshot) })) },
      // A resource mapped to several objectives counts once for each, and never twice for one.
      resources: input.resources.filter(resource => resource.objectives?.curriculumId === recordId && resource.objectives.curriculumVersion === version && new Set(resource.objectives.outcomeIds).has(outcome.id)).map(({ id, title }) => ({ id, title })),
      drafts: input.papers.filter(paper => pinned(paper.data) && asks(paper.data) > 0 && !input.releases.some(release => release.paperId === paper.id && release.paperVersion === paper.version)).map(paper => ({ paperId: paper.id, title: paper.title, questions: asks(paper.data) })),
    };
  });
}

/** Questions without objectives and resources without a mapping are review work, never auto-assigned. */
export function unmappedWork(recordId: string, curriculum: CurriculumData, input: { papers: PaperRef[]; resources: ResourceRef[] }) {
  const known = new Set(curriculum.outcomes.map(outcome => outcome.id));
  return {
    questions: input.papers.filter(paper => paper.data.curriculumId === recordId).flatMap(paper => paper.data.questions
      .filter(question => !question.outcomeIds.length || question.outcomeIds.some(id => !known.has(id)))
      .map(question => ({ paperId: paper.id, paperTitle: paper.title, paperVersion: paper.version, questionId: question.id, prompt: question.prompt.slice(0, 160) }))),
    resources: input.resources.filter(resource => resource.status !== "RETIRED" && (!resource.objectives || resource.objectives.curriculumId !== recordId || !resource.objectives.outcomeIds.length)).map(({ id, title }) => ({ id, title })),
  };
}

export type VersionChange = { outcomeId: string; change: "ADDED" | "CHANGED" | "RETIRED"; before?: Outcome; after?: Outcome };
/** Objectives are compared by stable id, so renames and moves are changes, not new objectives. */
export function compareVersions(before: CurriculumData, after: CurriculumData): VersionChange[] {
  const changes: VersionChange[] = [];
  const shape = (outcome: Outcome) => JSON.stringify([outcome.title, outcome.code ?? "", outcome.description ?? "", outcome.sourceId, outcome.sourcePage, [...(outcome.prerequisiteIds ?? [])].sort(), outcome.included]);
  for (const outcome of after.outcomes) {
    const previous = before.outcomes.find(row => row.id === outcome.id);
    if (!previous) changes.push({ outcomeId: outcome.id, change: "ADDED", after: outcome });
    else if (shape(previous) !== shape(outcome)) changes.push({ outcomeId: outcome.id, change: "CHANGED", before: previous, after: outcome });
  }
  for (const outcome of before.outcomes) if (!after.outcomes.some(row => row.id === outcome.id)) changes.push({ outcomeId: outcome.id, change: "RETIRED", before: outcome });
  return changes;
}

/** Unreleased papers pinned to an earlier version that assess a changed or retired objective need review; released snapshots never change. */
export function versionImpact(recordId: string, changes: VersionChange[], currentVersion: number, papers: PaperRef[], releases: ReleaseRef[]) {
  const touched = new Set(changes.filter(change => change.change !== "ADDED").map(change => change.outcomeId));
  const affected = papers.filter(paper => paper.data.curriculumId === recordId && paper.data.curriculumVersion < currentVersion && !releases.some(release => release.paperId === paper.id && release.paperVersion === paper.version))
    .map(paper => ({ paperId: paper.id, title: paper.title, curriculumVersion: paper.data.curriculumVersion, questions: paper.data.questions.filter(question => question.outcomeIds.some(id => touched.has(id))).map(question => question.id) }))
    .filter(paper => paper.questions.length > 0);
  const preserved = releases.filter(release => release.snapshot.curriculumId === recordId && release.snapshot.curriculumVersion < currentVersion).map(release => ({ assignmentId: release.id, paperId: release.paperId, curriculumVersion: release.snapshot.curriculumVersion }));
  return { affected, preserved };
}
