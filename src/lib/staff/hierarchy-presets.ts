/**
 * Starting rank ladders and unit trees, one per kind of institution.
 *
 * These are SEEDS, not rules. A tenant picks the preset that is closest to how
 * it is organised, and then renames, reorders, adds and retires ranks freely —
 * everything downstream reads the rows in `staff_designations`, never this
 * file. A school that calls its ranks something nobody else does is a
 * first-class case, which is why CUSTOM seeds nothing at all.
 *
 * On `level`: LOWER is MORE senior, and the presets step by 10 so a tenant can
 * slot a rank between two existing ones without renumbering the ladder. Two
 * ranks may legitimately share a level — a Registrar and a Dean answer to the
 * same person without either outranking the other.
 *
 * On headship: `canHeadDepartment` says a rank is SENIOR ENOUGH to run a unit;
 * it does not say the holder does. Who actually heads Science is a HEAD row in
 * `department_members`, because headship is a post that a person holds on top
 * of their rank — a Senior Teacher can be HOD of Science while the rank
 * "Senior Teacher" is held by six other people who head nothing. Schools that
 * treat "Head of Department" as a rank in its own right get it as one in the
 * SCHOOL preset; colleges and universities, where the rank is Professor and
 * the post is Chairperson, get the post from the department instead.
 */

import type { DepartmentKind, StaffTrack } from "@prisma/client";

export const INSTITUTION_TYPES = ["SCHOOL", "COLLEGE", "UNIVERSITY", "ACADEMY", "CUSTOM"] as const;
export type InstitutionType = (typeof INSTITUTION_TYPES)[number];

export interface DesignationSeed {
  name: string;
  shortName?: string;
  level: number;
  track: StaffTrack;
  canHeadDepartment?: boolean;
  isInstitutionHead?: boolean;
  /** Name of the rank this one normally promotes into, resolved after insert. */
  promotesTo?: string;
  minYearsInRank?: number;
  description?: string;
}

export interface DepartmentSeed {
  name: string;
  code?: string;
  kind: DepartmentKind;
  /** Name of the parent unit, resolved after insert. Faculty → Department. */
  parent?: string;
}

export interface InstitutionPreset {
  type: InstitutionType;
  label: string;
  blurb: string;
  designations: DesignationSeed[];
  departments: DepartmentSeed[];
}

// ─────────────────────────────────────────────────────────────────
// K-12 school
// ─────────────────────────────────────────────────────────────────
const SCHOOL_DESIGNATIONS: DesignationSeed[] = [
  { name: "Principal", shortName: "Principal", level: 10, track: "LEADERSHIP", canHeadDepartment: true, isInstitutionHead: true, description: "Head of the campus. The root of the reporting chart." },
  { name: "Vice Principal", shortName: "VP", level: 20, track: "LEADERSHIP", canHeadDepartment: true, promotesTo: "Principal", minYearsInRank: 5 },
  { name: "Head of Department", shortName: "HOD", level: 30, track: "ACADEMIC", canHeadDepartment: true, promotesTo: "Vice Principal", minYearsInRank: 4, description: "Runs a subject department and the teachers in it." },
  { name: "Section Head", shortName: "Sec. Head", level: 35, track: "ACADEMIC", canHeadDepartment: true, promotesTo: "Vice Principal", minYearsInRank: 4, description: "Runs a whole section — Primary, Middle or Senior." },
  { name: "Senior Teacher", shortName: "Sr. Teacher", level: 40, track: "ACADEMIC", canHeadDepartment: true, promotesTo: "Head of Department", minYearsInRank: 4 },
  { name: "Teacher", level: 50, track: "ACADEMIC", promotesTo: "Senior Teacher", minYearsInRank: 3 },
  { name: "Junior Teacher", shortName: "Jr. Teacher", level: 60, track: "ACADEMIC", promotesTo: "Teacher", minYearsInRank: 2 },
  { name: "Trainee Teacher", shortName: "Trainee", level: 70, track: "ACADEMIC", promotesTo: "Junior Teacher", minYearsInRank: 1 },
  { name: "Administrator", shortName: "Admin", level: 25, track: "ADMINISTRATIVE", canHeadDepartment: true },
  { name: "Accountant", level: 40, track: "ADMINISTRATIVE", canHeadDepartment: true },
  { name: "Librarian", level: 45, track: "ADMINISTRATIVE", canHeadDepartment: true },
  { name: "Admissions Officer", level: 45, track: "ADMINISTRATIVE" },
  { name: "Receptionist", level: 55, track: "ADMINISTRATIVE" },
  { name: "Lab Assistant", level: 60, track: "SUPPORT" },
  { name: "IT Support", level: 60, track: "SUPPORT" },
  { name: "Support Staff", level: 75, track: "SUPPORT", description: "Drivers, security, cleaning and maintenance." },
];

const SCHOOL_DEPARTMENTS: DepartmentSeed[] = [
  { name: "Pre-Primary Section", code: "PRE", kind: "SECTION" },
  { name: "Primary Section", code: "PRI", kind: "SECTION" },
  { name: "Middle Section", code: "MID", kind: "SECTION" },
  { name: "Senior Section", code: "SEN", kind: "SECTION" },
  { name: "Science", code: "SCI", kind: "DEPARTMENT" },
  { name: "Mathematics", code: "MTH", kind: "DEPARTMENT" },
  { name: "Languages", code: "LNG", kind: "DEPARTMENT" },
  { name: "Social Studies", code: "SST", kind: "DEPARTMENT" },
  { name: "Islamiyat", code: "ISL", kind: "DEPARTMENT" },
  { name: "Computer Science", code: "CS", kind: "DEPARTMENT" },
  { name: "Arts & Sports", code: "ART", kind: "DEPARTMENT" },
  { name: "Administration", code: "ADM", kind: "ADMIN_UNIT" },
  { name: "Accounts", code: "ACC", kind: "ADMIN_UNIT" },
  { name: "Admissions", code: "ADS", kind: "ADMIN_UNIT" },
  { name: "Library", code: "LIB", kind: "ADMIN_UNIT" },
  { name: "Transport", code: "TRN", kind: "ADMIN_UNIT" },
];

// ─────────────────────────────────────────────────────────────────
// College / intermediate
// ─────────────────────────────────────────────────────────────────
const COLLEGE_DESIGNATIONS: DesignationSeed[] = [
  { name: "Principal", level: 10, track: "LEADERSHIP", canHeadDepartment: true, isInstitutionHead: true },
  { name: "Vice Principal", shortName: "VP", level: 20, track: "LEADERSHIP", canHeadDepartment: true, promotesTo: "Principal", minYearsInRank: 5 },
  { name: "Dean", level: 25, track: "LEADERSHIP", canHeadDepartment: true, promotesTo: "Vice Principal", minYearsInRank: 5 },
  { name: "Registrar", level: 30, track: "ADMINISTRATIVE", canHeadDepartment: true },
  { name: "Controller of Examinations", shortName: "CoE", level: 30, track: "ADMINISTRATIVE", canHeadDepartment: true },
  { name: "Professor", shortName: "Prof.", level: 35, track: "ACADEMIC", canHeadDepartment: true, description: "The senior academic rank. Chairing a department is a separate post." },
  { name: "Associate Professor", shortName: "Assoc. Prof.", level: 40, track: "ACADEMIC", canHeadDepartment: true, promotesTo: "Professor", minYearsInRank: 5 },
  { name: "Assistant Professor", shortName: "Asst. Prof.", level: 45, track: "ACADEMIC", canHeadDepartment: true, promotesTo: "Associate Professor", minYearsInRank: 5 },
  { name: "Senior Lecturer", shortName: "Sr. Lecturer", level: 50, track: "ACADEMIC", promotesTo: "Assistant Professor", minYearsInRank: 4 },
  { name: "Lecturer", level: 55, track: "ACADEMIC", promotesTo: "Senior Lecturer", minYearsInRank: 3 },
  { name: "Visiting Faculty", shortName: "Visiting", level: 60, track: "ACADEMIC", description: "Paid per course or per hour; usually outside the promotion ladder." },
  { name: "Demonstrator", level: 65, track: "ACADEMIC", promotesTo: "Lecturer", minYearsInRank: 2 },
  { name: "Accounts Officer", level: 45, track: "ADMINISTRATIVE" },
  { name: "Librarian", level: 50, track: "ADMINISTRATIVE", canHeadDepartment: true },
  { name: "Admissions Officer", level: 55, track: "ADMINISTRATIVE" },
  { name: "Administrative Officer", level: 55, track: "ADMINISTRATIVE" },
  { name: "Lab Assistant", level: 65, track: "SUPPORT" },
  { name: "Support Staff", level: 75, track: "SUPPORT" },
];

const COLLEGE_DEPARTMENTS: DepartmentSeed[] = [
  { name: "Pre-Medical", code: "PMED", kind: "DEPARTMENT" },
  { name: "Pre-Engineering", code: "PENG", kind: "DEPARTMENT" },
  { name: "Computer Science", code: "CS", kind: "DEPARTMENT" },
  { name: "Commerce", code: "COM", kind: "DEPARTMENT" },
  { name: "Humanities", code: "HUM", kind: "DEPARTMENT" },
  { name: "Mathematics", code: "MTH", kind: "DEPARTMENT" },
  { name: "Languages", code: "LNG", kind: "DEPARTMENT" },
  { name: "Registrar Office", code: "REG", kind: "ADMIN_UNIT" },
  { name: "Examinations", code: "EXM", kind: "ADMIN_UNIT" },
  { name: "Accounts", code: "ACC", kind: "ADMIN_UNIT" },
  { name: "Admissions", code: "ADS", kind: "ADMIN_UNIT" },
  { name: "Library", code: "LIB", kind: "ADMIN_UNIT" },
];

// ─────────────────────────────────────────────────────────────────
// University
// ─────────────────────────────────────────────────────────────────
const UNIVERSITY_DESIGNATIONS: DesignationSeed[] = [
  { name: "Vice Chancellor", shortName: "VC", level: 5, track: "LEADERSHIP", canHeadDepartment: true, isInstitutionHead: true },
  { name: "Pro Vice Chancellor", shortName: "Pro VC", level: 10, track: "LEADERSHIP", canHeadDepartment: true, promotesTo: "Vice Chancellor", minYearsInRank: 4 },
  { name: "Dean", level: 15, track: "LEADERSHIP", canHeadDepartment: true, promotesTo: "Pro Vice Chancellor", minYearsInRank: 4, description: "Heads a faculty. Departments and their chairs sit under it." },
  { name: "Registrar", level: 15, track: "ADMINISTRATIVE", canHeadDepartment: true },
  { name: "Controller of Examinations", shortName: "CoE", level: 15, track: "ADMINISTRATIVE", canHeadDepartment: true },
  { name: "Treasurer", level: 15, track: "ADMINISTRATIVE", canHeadDepartment: true },
  { name: "Director", level: 20, track: "ADMINISTRATIVE", canHeadDepartment: true, description: "Heads a centre or directorate — ORIC, QEC, Admissions, IT." },
  { name: "Professor", shortName: "Prof.", level: 20, track: "ACADEMIC", canHeadDepartment: true, description: "The senior academic rank. Chairing a department is a separate post held on top of it." },
  { name: "Associate Professor", shortName: "Assoc. Prof.", level: 25, track: "ACADEMIC", canHeadDepartment: true, promotesTo: "Professor", minYearsInRank: 5 },
  { name: "Assistant Professor", shortName: "Asst. Prof.", level: 30, track: "ACADEMIC", canHeadDepartment: true, promotesTo: "Associate Professor", minYearsInRank: 5 },
  { name: "Senior Lecturer", shortName: "Sr. Lecturer", level: 35, track: "ACADEMIC", promotesTo: "Assistant Professor", minYearsInRank: 4 },
  { name: "Lecturer", level: 40, track: "ACADEMIC", promotesTo: "Senior Lecturer", minYearsInRank: 3 },
  { name: "Teaching Assistant", shortName: "TA", level: 45, track: "ACADEMIC", promotesTo: "Lecturer", minYearsInRank: 2 },
  { name: "Research Associate", shortName: "RA", level: 45, track: "ACADEMIC", promotesTo: "Lecturer", minYearsInRank: 2 },
  { name: "Visiting Faculty", shortName: "Visiting", level: 50, track: "ACADEMIC", description: "Paid per course; outside the tenure ladder." },
  { name: "Lab Engineer", level: 50, track: "ACADEMIC" },
  { name: "Deputy Registrar", level: 25, track: "ADMINISTRATIVE" },
  { name: "Assistant Registrar", level: 30, track: "ADMINISTRATIVE", promotesTo: "Deputy Registrar", minYearsInRank: 4 },
  { name: "Chief Librarian", level: 30, track: "ADMINISTRATIVE", canHeadDepartment: true },
  { name: "Accounts Officer", level: 40, track: "ADMINISTRATIVE" },
  { name: "Administrative Officer", level: 50, track: "ADMINISTRATIVE" },
  { name: "Lab Assistant", level: 60, track: "SUPPORT" },
  { name: "Support Staff", level: 75, track: "SUPPORT" },
];

const UNIVERSITY_DEPARTMENTS: DepartmentSeed[] = [
  { name: "Faculty of Science", code: "FSC", kind: "FACULTY" },
  { name: "Faculty of Engineering & Technology", code: "FET", kind: "FACULTY" },
  { name: "Faculty of Social Sciences", code: "FSS", kind: "FACULTY" },
  { name: "Faculty of Business Administration", code: "FBA", kind: "FACULTY" },
  { name: "Physics", code: "PHY", kind: "DEPARTMENT", parent: "Faculty of Science" },
  { name: "Chemistry", code: "CHM", kind: "DEPARTMENT", parent: "Faculty of Science" },
  { name: "Mathematics", code: "MTH", kind: "DEPARTMENT", parent: "Faculty of Science" },
  { name: "Computer Science", code: "CS", kind: "DEPARTMENT", parent: "Faculty of Engineering & Technology" },
  { name: "Electrical Engineering", code: "EE", kind: "DEPARTMENT", parent: "Faculty of Engineering & Technology" },
  { name: "Mechanical Engineering", code: "ME", kind: "DEPARTMENT", parent: "Faculty of Engineering & Technology" },
  { name: "Economics", code: "ECO", kind: "DEPARTMENT", parent: "Faculty of Social Sciences" },
  { name: "English", code: "ENG", kind: "DEPARTMENT", parent: "Faculty of Social Sciences" },
  { name: "Management Sciences", code: "MGT", kind: "DEPARTMENT", parent: "Faculty of Business Administration" },
  { name: "Registrar Office", code: "REG", kind: "ADMIN_UNIT" },
  { name: "Examinations", code: "EXM", kind: "ADMIN_UNIT" },
  { name: "Finance & Treasury", code: "FIN", kind: "ADMIN_UNIT" },
  { name: "Central Library", code: "LIB", kind: "ADMIN_UNIT" },
  { name: "ORIC", code: "ORIC", kind: "ADMIN_UNIT" },
  { name: "Quality Enhancement Cell", code: "QEC", kind: "ADMIN_UNIT" },
];

// ─────────────────────────────────────────────────────────────────
// Academy / training institute / tuition centre
// ─────────────────────────────────────────────────────────────────
const ACADEMY_DESIGNATIONS: DesignationSeed[] = [
  { name: "Director", level: 10, track: "LEADERSHIP", canHeadDepartment: true, isInstitutionHead: true },
  { name: "Centre Manager", level: 20, track: "LEADERSHIP", canHeadDepartment: true, promotesTo: "Director", minYearsInRank: 4 },
  { name: "Head Trainer", level: 30, track: "ACADEMIC", canHeadDepartment: true, promotesTo: "Centre Manager", minYearsInRank: 3 },
  { name: "Senior Instructor", level: 40, track: "ACADEMIC", canHeadDepartment: true, promotesTo: "Head Trainer", minYearsInRank: 3 },
  { name: "Instructor", level: 50, track: "ACADEMIC", promotesTo: "Senior Instructor", minYearsInRank: 2 },
  { name: "Assistant Instructor", level: 60, track: "ACADEMIC", promotesTo: "Instructor", minYearsInRank: 1 },
  { name: "Admin Officer", level: 45, track: "ADMINISTRATIVE", canHeadDepartment: true },
  { name: "Front Desk", level: 55, track: "ADMINISTRATIVE" },
  { name: "Support Staff", level: 70, track: "SUPPORT" },
];

const ACADEMY_DEPARTMENTS: DepartmentSeed[] = [
  { name: "Programmes", code: "PRG", kind: "DEPARTMENT" },
  { name: "Test Preparation", code: "TST", kind: "DEPARTMENT" },
  { name: "Languages", code: "LNG", kind: "DEPARTMENT" },
  { name: "Administration", code: "ADM", kind: "ADMIN_UNIT" },
  { name: "Accounts", code: "ACC", kind: "ADMIN_UNIT" },
];

export const INSTITUTION_PRESETS: Record<InstitutionType, InstitutionPreset> = {
  SCHOOL: {
    type: "SCHOOL",
    label: "School (K-12)",
    blurb: "Principal down to trainee teacher, with sections and subject departments. Head of Department is a rank here, the way most schools use it.",
    designations: SCHOOL_DESIGNATIONS,
    departments: SCHOOL_DEPARTMENTS,
  },
  COLLEGE: {
    type: "COLLEGE",
    label: "College",
    blurb: "Principal, deans and the lecturer-to-professor ladder. Chairing a department is a post held on top of a rank, not a rank of its own.",
    designations: COLLEGE_DESIGNATIONS,
    departments: COLLEGE_DEPARTMENTS,
  },
  UNIVERSITY: {
    type: "UNIVERSITY",
    label: "University",
    blurb: "Vice Chancellor, faculties with deans, departments with chairs, and the full academic and registry ladders.",
    designations: UNIVERSITY_DESIGNATIONS,
    departments: UNIVERSITY_DEPARTMENTS,
  },
  ACADEMY: {
    type: "ACADEMY",
    label: "Academy / Training Institute",
    blurb: "A flatter ladder for tuition centres and training institutes: director, managers, trainers and instructors.",
    designations: ACADEMY_DESIGNATIONS,
    departments: ACADEMY_DEPARTMENTS,
  },
  CUSTOM: {
    type: "CUSTOM",
    label: "Start from scratch",
    blurb: "No ranks and no departments. Build the ladder yourself — nothing here assumes any of the presets.",
    designations: [],
    departments: [],
  },
};

export function isInstitutionType(value: unknown): value is InstitutionType {
  return typeof value === "string" && (INSTITUTION_TYPES as readonly string[]).includes(value);
}

/** Track colours for chart nodes and rank chips. Kept out of the DB so a
 *  tenant's ladder inherits the palette without storing a hex on every row. */
export const TRACK_TONES: Record<StaffTrack, { hex: string; chip: string; label: string }> = {
  LEADERSHIP: { hex: "#8127cf", chip: "bg-[#fbf0fe] text-[#8127cf]", label: "Leadership" },
  ACADEMIC: { hex: "#4f46e5", chip: "bg-indigo-50 text-indigo-600", label: "Academic" },
  // cyan-700, not cyan-600: this hex is painted onto 10px bold rank labels, and
  // cyan-600 sits at 3.68:1 on white — under AA for text that small.
  ADMINISTRATIVE: { hex: "#0e7490", chip: "bg-cyan-50 text-cyan-700", label: "Administrative" },
  SUPPORT: { hex: "#64748b", chip: "bg-slate-100 text-slate-600", label: "Support" },
};

export const DEPARTMENT_KIND_LABELS: Record<DepartmentKind, string> = {
  FACULTY: "Faculty",
  SCHOOL: "School",
  DEPARTMENT: "Department",
  SECTION: "Section",
  ADMIN_UNIT: "Admin unit",
};

export const DEPARTMENT_ROLE_LABELS = {
  HEAD: "Head",
  DEPUTY_HEAD: "Deputy Head",
  COORDINATOR: "Coordinator",
  MEMBER: "Member",
} as const;

export const EMPLOYMENT_TYPE_LABELS = {
  FULL_TIME: "Full time",
  PART_TIME: "Part time",
  VISITING: "Visiting",
  ADJUNCT: "Adjunct",
  CONTRACT: "Contract",
  INTERN: "Intern",
  VOLUNTEER: "Volunteer",
} as const;

export const EMPLOYMENT_STATUS_LABELS = {
  PROBATION: "On probation",
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  SECONDED: "Seconded",
  SUSPENDED: "Suspended",
  NOTICE_PERIOD: "Serving notice",
  RESIGNED: "Resigned",
  RETIRED: "Retired",
  TERMINATED: "Terminated",
} as const;

/** Statuses that mean the person has left. They drop off the live org chart
 *  but keep their appointment history. */
export const ENDED_STATUSES = ["RESIGNED", "RETIRED", "TERMINATED"] as const;

export const CHANGE_KIND_LABELS = {
  JOINED: "Joined",
  CONFIRMED: "Confirmed",
  PROMOTION: "Promoted",
  DEMOTION: "Demoted",
  LATERAL_MOVE: "Moved",
  DEPARTMENT_TRANSFER: "Transferred department",
  CAMPUS_TRANSFER: "Transferred campus",
  REPORTING_CHANGE: "Reporting line changed",
  ACTING_ASSIGNMENT: "Given acting charge",
  ACTING_ENDED: "Acting charge ended",
  CONTRACT_RENEWAL: "Contract renewed",
  SUSPENDED: "Suspended",
  REINSTATED: "Reinstated",
  RESIGNED: "Resigned",
  RETIRED: "Retired",
  TERMINATED: "Terminated",
} as const;
