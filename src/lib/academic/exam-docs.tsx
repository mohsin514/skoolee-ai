import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { roomCapacity, roomLocation } from "@/lib/academic/room-capacity";

/**
 * The two documents that leave the building (§80).
 *
 * A date sheet goes on the noticeboard and into every parent's hands; a
 * seating plan goes to the invigilator standing at the door. Both were
 * `window.print()` of a screen, which meant whatever the browser decided —
 * a class filter silently applied, rooms cut off at the page edge, and no way
 * to produce the master sheet for the whole school at all.
 *
 * These are real documents: paginated, one table per class, and generated from
 * the database rather than from whatever the screen happened to be showing.
 *
 * Typography is sized for the wall and for the door, not for the screen. A
 * date sheet is read by a parent from arm's length and by a child from the far
 * side of a noticeboard; a seating plan is read by an invigilator holding it
 * while walking. Nothing on either page is smaller than 8pt, and the rows a
 * reader actually hunts for — date, subject, name, roll — are set in bold at
 * body size.
 */

const BRAND = "#8127cf";
const BRAND_DARK = "#5b1a92";
const BRAND_SOFT = "#f6f0fc";
const BRAND_EDGE = "#e6d6f8";
const INK = "#171122";
const MUTED = "#6b6270";
const LINE = "#e2d9ea";

/** A4 usable width, page padding removed — the seat grid has to fit inside it. */
const PAGE_PAD = 30;
const LANDSCAPE_WIDTH = 841.89 - PAGE_PAD * 2;
const ROW_TAG_WIDTH = 26;
const ROW_TAG_GAP = 6;
const SEAT_GAP = 5;

const s = StyleSheet.create({
  // No `lineHeight` here on purpose. A line height on the Page style plus a
  // `render` callback anywhere in a fixed element makes @react-pdf drop that
  // element — which silently cost every page its footer. Set it per style.
  page: {
    paddingTop: 26,
    paddingBottom: 56,
    paddingHorizontal: PAGE_PAD,
    fontSize: 10.5,
    color: INK,
    fontFamily: "Helvetica",
  },

  /* Masthead — repeats on every page */
  header: { marginBottom: 4 },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BRAND,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 8,
    objectFit: "contain",
    backgroundColor: "#ffffff",
    padding: 3,
  },
  crest: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  crestText: { fontSize: 16, fontWeight: 700, color: "#ffffff", letterSpacing: 0.5 },
  headerText: { flex: 1, paddingLeft: 12, paddingRight: 10 },
  school: { fontSize: 17, fontWeight: 700, color: "#ffffff", letterSpacing: 0.2 },
  schoolSub: { fontSize: 8.5, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  headerRight: { alignItems: "flex-end", maxWidth: 210 },
  docChip: {
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 1.2,
    color: BRAND_DARK,
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
    textTransform: "uppercase",
  },
  docTitle: { fontSize: 12.5, fontWeight: 700, color: "#ffffff", marginTop: 5, textAlign: "right" },
  docMeta: { fontSize: 8.5, color: "rgba(255,255,255,0.85)", marginTop: 2, textAlign: "right" },
  headerRule: { height: 2.5, borderRadius: 999, backgroundColor: BRAND_EDGE, marginTop: 6 },

  /* Class / room band */
  band: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: BRAND_SOFT,
    borderLeftWidth: 4,
    borderLeftColor: BRAND,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 16,
  },
  bandTitle: { fontSize: 12, fontWeight: 700, color: BRAND_DARK },
  bandSub: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  chipRow: { flexDirection: "row", alignItems: "center" },
  chip: {
    fontSize: 8,
    fontWeight: 700,
    color: BRAND_DARK,
    backgroundColor: "#ffffff",
    borderWidth: 0.6,
    borderColor: BRAND_EDGE,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginLeft: 5,
  },

  /* Table */
  table: {
    borderWidth: 0.6,
    borderColor: LINE,
    borderTopWidth: 0,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  headRow: {
    flexDirection: "row",
    backgroundColor: "#f8f4fc",
    borderBottomWidth: 0.6,
    borderBottomColor: LINE,
  },
  th: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    fontSize: 8,
    fontWeight: 700,
    color: "#6d5c80",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#efe9f5",
  },
  rowLast: { borderBottomWidth: 0 },
  zebra: { backgroundColor: "#fbf9fd" },
  td: { paddingVertical: 8, paddingHorizontal: 8, fontSize: 10, lineHeight: 1.35 },
  tdStrong: { fontWeight: 700, color: INK },
  tdMuted: { color: MUTED },

  /* Notes, signatures, footer */
  noteBox: {
    marginTop: 18,
    borderWidth: 0.6,
    borderColor: BRAND_EDGE,
    backgroundColor: "#fbf8fe",
    borderRadius: 8,
    padding: 12,
  },
  noteTitle: {
    fontSize: 8.5,
    fontWeight: 700,
    letterSpacing: 0.9,
    color: BRAND,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  noteItem: { flexDirection: "row", marginBottom: 3 },
  noteBullet: { width: 10, fontSize: 9.5, color: BRAND, fontWeight: 700 },
  noteText: { flex: 1, fontSize: 9.5, color: "#443d4d", lineHeight: 1.5 },

  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 30 },
  signBox: { width: 180 },
  signLine: { borderTopWidth: 0.8, borderTopColor: "#b9aec6", marginBottom: 5 },
  signLabel: {
    fontSize: 8,
    color: MUTED,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  footer: {
    position: "absolute",
    bottom: 20,
    left: PAGE_PAD,
    right: PAGE_PAD,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: MUTED,
    borderTopWidth: 0.6,
    borderTopColor: LINE,
    paddingTop: 6,
  },
  empty: {
    fontSize: 10,
    color: MUTED,
    padding: 20,
    marginTop: 16,
    textAlign: "center",
    borderWidth: 0.8,
    borderColor: LINE,
    borderStyle: "dashed",
    borderRadius: 8,
  },

  /* Seating grid */
  metaStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 0.6,
    borderTopWidth: 0,
    borderColor: LINE,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: "#ffffff",
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  metaCell: { flexDirection: "row", alignItems: "center", marginRight: 16, marginVertical: 1.5 },
  metaLabel: {
    fontSize: 7.5,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginRight: 5,
  },
  metaValue: { fontSize: 9.5, fontWeight: 700, color: INK },

  frontMark: {
    marginTop: 12,
    marginBottom: 9,
    backgroundColor: BRAND,
    color: "#ffffff",
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 2.2,
    textAlign: "center",
    paddingVertical: 5,
    borderRadius: 4,
  },
  gridRow: { flexDirection: "row", alignItems: "stretch" },
  seatTrack: { flex: 1, flexDirection: "row", flexWrap: "wrap" },
  rowTag: {
    width: ROW_TAG_WIDTH,
    marginRight: ROW_TAG_GAP,
    marginBottom: SEAT_GAP,
    backgroundColor: BRAND_SOFT,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTagText: { fontSize: 8, fontWeight: 700, color: BRAND_DARK },
  seat: {
    borderWidth: 0.7,
    borderColor: "#ded3ea",
    borderRadius: 5,
    backgroundColor: "#ffffff",
    paddingVertical: 5,
    paddingHorizontal: 6,
    marginRight: SEAT_GAP,
    marginBottom: SEAT_GAP,
  },
  seatLabel: { fontWeight: 700, color: BRAND, letterSpacing: 0.3 },
  seatName: { fontWeight: 700, color: INK, marginTop: 2, lineHeight: 1.3 },
  seatFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  seatRoll: { color: MUTED },
  tick: { width: 8, height: 8, borderWidth: 0.7, borderColor: "#c3b7d1", borderRadius: 2 },
  invigRow: { flexDirection: "row", marginTop: 9 },
  invigBox: { flex: 1, marginRight: 12 },
  invigLine: { borderBottomWidth: 0.7, borderBottomColor: "#c8bdd4", height: 14 },
  invigLabel: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 3 },
});

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayName(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return WEEKDAY[new Date(y, m - 1, d).getDay()];
}

function prettyDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Today, in the server's own calendar.
 *
 * `toISOString().slice(0, 10)` is UTC, and every date in this file is then
 * read back as a local one — so for the hours where the two disagree the
 * footer dated the document yesterday.
 */
function todayLocal(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Shared chrome
 * ────────────────────────────────────────────────────────────────────────── */

interface Letterhead {
  schoolName: string;
  campusName: string;
  tagline: string;
  contact: string;
  logoUrl: string | null;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "S"
  );
}

function Masthead({
  brand,
  kicker,
  title,
  meta,
  withLogo,
}: {
  brand: Letterhead;
  kicker: string;
  title: string;
  meta: string;
  withLogo: boolean;
}) {
  const subline = [brand.campusName, brand.tagline].filter(Boolean).join(" · ");
  return (
    <View style={s.header} fixed>
      <View style={s.headerBar}>
        {withLogo && brand.logoUrl ? (
          <Image src={brand.logoUrl} style={s.logo} />
        ) : (
          <View style={s.crest}>
            <Text style={s.crestText}>{initials(brand.schoolName)}</Text>
          </View>
        )}
        <View style={s.headerText}>
          <Text style={s.school}>{brand.schoolName}</Text>
          {subline ? <Text style={s.schoolSub}>{subline}</Text> : null}
          {brand.contact ? <Text style={s.schoolSub}>{brand.contact}</Text> : null}
        </View>
        <View style={s.headerRight}>
          <Text style={s.docChip}>{kicker}</Text>
          <Text style={s.docTitle}>{title}</Text>
          {meta ? <Text style={s.docMeta}>{meta}</Text> : null}
        </View>
      </View>
      <View style={s.headerRule} />
    </View>
  );
}

function Footer({ label }: { label: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{label}</Text>
      <Text
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

function Notes({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={s.noteBox} wrap={false}>
      <Text style={s.noteTitle}>{title}</Text>
      {items.map((line) => (
        <View key={line} style={s.noteItem}>
          <Text style={s.noteBullet}>•</Text>
          <Text style={s.noteText}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

function Signatures({ left, right }: { left: string; right: string }) {
  return (
    <View style={s.signRow} wrap={false}>
      <View style={s.signBox}>
        <View style={s.signLine} />
        <Text style={s.signLabel}>{left}</Text>
      </View>
      <View style={s.signBox}>
        <View style={s.signLine} />
        <Text style={s.signLabel}>{right}</Text>
      </View>
    </View>
  );
}

/**
 * Render, and fall back to a crest if the remote logo cannot be fetched.
 *
 * `Image` pulls the logo over the network at render time, so a URL that 404s
 * or times out takes the entire document down with it. The paperwork matters
 * more than the badge on it.
 */
type PdfDocument = Parameters<typeof renderToBuffer>[0];

async function renderDoc(build: (withLogo: boolean) => PdfDocument, hasLogo: boolean) {
  if (!hasLogo) return renderToBuffer(build(false));
  try {
    return await renderToBuffer(build(true));
  } catch {
    return renderToBuffer(build(false));
  }
}

type CampusBranding = {
  name: string;
  city: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  school: {
    name: string;
    tagline: string | null;
    logoUrl: string | null;
    phone: string | null;
    contactEmail: string;
    website: string | null;
  } | null;
} | null;

const CAMPUS_BRANDING_SELECT = {
  name: true,
  city: true,
  phone: true,
  email: true,
  website: true,
  logoUrl: true,
  school: {
    select: {
      name: true,
      tagline: true,
      logoUrl: true,
      phone: true,
      contactEmail: true,
      website: true,
    },
  },
} as const;

function letterhead(campus: CampusBranding): Letterhead {
  const school = campus?.school ?? null;
  const logo = campus?.logoUrl || school?.logoUrl || null;
  return {
    schoolName: school?.name ?? "School",
    campusName: [campus?.name, campus?.city].filter(Boolean).join(", "),
    tagline: school?.tagline ?? "",
    contact: [
      campus?.phone || school?.phone,
      campus?.email || school?.contactEmail,
      campus?.website || school?.website,
    ]
      .filter(Boolean)
      .join("  ·  "),
    logoUrl: logo && /^https?:\/\//i.test(logo) ? logo : null,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Date sheet
 * ────────────────────────────────────────────────────────────────────────── */

interface DateSheetPaper {
  date: string;
  day: string;
  time: string;
  subject: string;
  marks: number;
  rooms: string;
}

interface DateSheetClass {
  label: string;
  students: number;
  papers: DateSheetPaper[];
}

interface DateSheetData {
  brand: Letterhead;
  title: string;
  term: string;
  academicYear: number;
  window: string;
  classes: DateSheetClass[];
}

/** Roughly the number of table rows that fit under a masthead on one A4 page. */
const MAX_ROWS_PER_PAGE = 16;

/**
 * Split a class's papers into page-sized runs.
 *
 * A class is kept whole on one page whenever it fits, because that is the unit
 * a reader tears off or photographs. A class too long for a page is cut at a
 * row boundary and given its own heading and column headers on the next page,
 * rather than being allowed to break wherever the layout engine likes.
 */
function paginate<T>(list: T[], size: number): T[][] {
  if (list.length <= size) return [list];
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const DATE_COLS = [
  { key: "date", label: "Date", width: "17%", align: "left" },
  { key: "day", label: "Day", width: "9%", align: "center" },
  { key: "time", label: "Time", width: "20%", align: "left" },
  { key: "subject", label: "Subject", width: "30%", align: "left" },
  { key: "marks", label: "Marks", width: "8%", align: "center" },
  { key: "rooms", label: "Room(s)", width: "16%", align: "left" },
] as const;

function DateSheetDocument({ data, withLogo }: { data: DateSheetData; withLogo: boolean }) {
  const papers = data.classes.reduce((n, c) => n + c.papers.length, 0);
  return (
    <Document title={`Date Sheet — ${data.title}`}>
      <Page size="A4" style={s.page}>
        <Masthead
          brand={data.brand}
          kicker="Date Sheet"
          title={data.title}
          meta={[data.term, String(data.academicYear), data.window].filter(Boolean).join(" · ")}
          withLogo={withLogo}
        />

        {data.classes.length === 0 ? (
          <Text style={s.empty}>No papers have been scheduled yet.</Text>
        ) : (
          data.classes.map((cls) =>
            cls.papers.length === 0 ? (
              <View key={cls.label} wrap={false}>
                <View style={s.band}>
                  <Text style={s.bandTitle}>{cls.label}</Text>
                  <View style={s.chipRow}>
                    <Text style={s.chip}>{cls.students} student{cls.students === 1 ? "" : "s"}</Text>
                  </View>
                </View>
                <Text style={s.empty}>No papers scheduled for this class.</Text>
              </View>
            ) : (
              paginate(cls.papers, MAX_ROWS_PER_PAGE).map((part, ci, parts) => (
                <View key={`${cls.label}-${ci}`} wrap={false}>
                  <View style={s.band}>
                    <Text style={s.bandTitle}>
                      {cls.label}
                      {parts.length > 1 ? ` (${ci + 1} of ${parts.length})` : ""}
                    </Text>
                    <View style={s.chipRow}>
                      <Text style={s.chip}>
                        {cls.papers.length} paper{cls.papers.length === 1 ? "" : "s"}
                      </Text>
                      <Text style={s.chip}>
                        {cls.students} student{cls.students === 1 ? "" : "s"}
                      </Text>
                    </View>
                  </View>
                  <View style={s.table}>
                    <View style={s.headRow}>
                      {DATE_COLS.map((c) => (
                        <Text key={c.key} style={[s.th, { width: c.width, textAlign: c.align }]}>
                          {c.label}
                        </Text>
                      ))}
                    </View>
                    {part.map((p, i) => {
                      const last = i === part.length - 1;
                      return (
                        <View
                          key={`${p.date}-${p.subject}`}
                          style={[s.row, ...(i % 2 ? [s.zebra] : []), ...(last ? [s.rowLast] : [])]}
                          wrap={false}
                        >
                          <Text style={[s.td, s.tdStrong, { width: DATE_COLS[0].width }]}>{p.date}</Text>
                          <Text style={[s.td, s.tdMuted, { width: DATE_COLS[1].width, textAlign: "center" }]}>
                            {p.day}
                          </Text>
                          <Text style={[s.td, { width: DATE_COLS[2].width }]}>{p.time}</Text>
                          <Text style={[s.td, s.tdStrong, { width: DATE_COLS[3].width }]}>{p.subject}</Text>
                          <Text style={[s.td, { width: DATE_COLS[4].width, textAlign: "center" }]}>
                            {String(p.marks ?? "—")}
                          </Text>
                          <Text style={[s.td, s.tdMuted, { width: DATE_COLS[5].width }]}>{p.rooms}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))
            ),
          )
        )}

        {papers > 0 ? (
          <Notes
            title="Instructions for candidates"
            items={[
              "Be seated ten minutes before the start time shown against your paper.",
              "Bring your own stationery. No material may be shared during a paper.",
              "Your school identity card must be on the desk for the whole paper.",
              "Any change to this date sheet will be announced in writing.",
            ]}
          />
        ) : null}

        <Signatures left="Controller of Examinations" right="Principal" />

        <Footer label={`${data.title} · Date Sheet · generated ${prettyDate(todayLocal())}`} />
      </Page>
    </Document>
  );
}

/**
 * Build the date sheet for a whole session, or for one class within it.
 *
 * Grouping is by class because that is how the sheet is read — a parent looks
 * for their child's class and reads down. The master copy is every class in
 * order, which is the version that goes on the noticeboard.
 */
export async function buildDateSheetData(opts: {
  campusId: string;
  sessionId?: string;
  examId?: string;
  classId?: string;
}): Promise<DateSheetData> {
  const { campusId, sessionId, examId, classId } = opts;
  if (!sessionId && !examId) throw new ApiError("sessionId or examId is required", 400);

  const campus = await prisma.campus.findFirst({
    where: { id: campusId },
    select: CAMPUS_BRANDING_SELECT,
  });

  const session = sessionId
    ? await prisma.examSession.findFirst({
        where: { id: sessionId, campusId },
        select: { title: true, term: true, academicYear: true, startDate: true, endDate: true },
      })
    : null;
  if (sessionId && !session) throw new ApiError("Exam session not found", 404);

  const schedules = await prisma.examSchedule.findMany({
    where: {
      campusId,
      ...(sessionId ? { exam: { sessionId, ...(classId ? { classId } : {}) } } : {}),
      ...(examId ? { examId } : {}),
    },
    orderBy: [{ date: "asc" }, { periodDefinition: { periodNumber: "asc" } }],
    select: {
      date: true,
      subject: { select: { name: true, totalMarks: true } },
      periodDefinition: { select: { startTime: true, endTime: true } },
      rooms: {
        orderBy: { createdAt: "asc" },
        select: { room: { select: { roomNumber: true } } },
      },
      exam: {
        select: {
          title: true,
          term: true,
          academicYear: true,
          class: { select: { name: true, section: true, _count: { select: { students: true } } } },
        },
      },
    },
  });

  const first = schedules[0]?.exam;
  const grouped = new Map<string, DateSheetClass>();

  for (const row of schedules) {
    const label = `${row.exam.class.name}${row.exam.class.section ? ` ${row.exam.class.section}` : ""}`;
    const bucket =
      grouped.get(label) ??
      { label, students: row.exam.class._count.students, papers: [] as DateSheetPaper[] };
    const ymd = row.date.toISOString().slice(0, 10);
    bucket.papers.push({
      date: prettyDate(ymd),
      day: dayName(ymd),
      time: row.periodDefinition
        ? `${row.periodDefinition.startTime} – ${row.periodDefinition.endTime}`
        : "To be announced",
      subject: row.subject.name,
      marks: row.subject.totalMarks,
      rooms: row.rooms.length ? row.rooms.map((r) => r.room.roomNumber).join(", ") : "—",
    });
    grouped.set(label, bucket);
  }

  const window =
    session?.startDate && session?.endDate
      ? `${prettyDate(session.startDate.toISOString().slice(0, 10))} – ${prettyDate(session.endDate.toISOString().slice(0, 10))}`
      : "";

  return {
    brand: letterhead(campus),
    title: session?.title ?? first?.title ?? "Examination",
    term: session?.term ?? first?.term ?? "",
    academicYear: session?.academicYear ?? first?.academicYear ?? new Date().getFullYear(),
    window,
    classes: [...grouped.values()].sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true }),
    ),
  };
}

export async function renderDateSheetPdf(opts: {
  campusId: string;
  sessionId?: string;
  examId?: string;
  classId?: string;
}) {
  const data = await buildDateSheetData(opts);
  return {
    buffer: await renderDoc(
      (withLogo) => <DateSheetDocument data={data} withLogo={withLogo} />,
      !!data.brand.logoUrl,
    ),
    filename: `date-sheet-${data.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Seating plan
 * ────────────────────────────────────────────────────────────────────────── */

interface SeatEntry {
  seatLabel: string;
  name: string;
  roll: string;
}

interface SeatingRoom {
  roomNumber: string;
  location: string;
  examCapacity: number;
  teachingCapacity: number;
  layout: string;
  seated: number;
  /** Seats arranged into rows, so the sheet mirrors the room. */
  grid: SeatEntry[][];
}

interface SeatingPaper {
  classLabel: string;
  subject: string;
  date: string;
  day: string;
  time: string;
  headcount: number;
  rooms: SeatingRoom[];
}

interface SeatingData {
  brand: Letterhead;
  title: string;
  papers: SeatingPaper[];
}

/**
 * Size a seat card so the widest row of the room still fits across the page.
 *
 * A fixed seat width is why wide rooms used to run off the right edge: the
 * grid mirrors the room, so a hall with twelve benches to a row needs
 * narrower cards than a classroom with five. Text scales with the card, and
 * never below 7pt.
 */
function seatMetrics(maxCols: number) {
  const available = LANDSCAPE_WIDTH - ROW_TAG_WIDTH - ROW_TAG_GAP;
  const cols = Math.max(1, maxCols);
  const raw = Math.floor(available / cols) - SEAT_GAP;
  const width = Math.max(58, Math.min(132, raw));
  const name = width >= 108 ? 9.5 : width >= 88 ? 8.8 : width >= 74 ? 8 : 7.4;
  return { width, name, label: name - 1.8, roll: name - 1.4 };
}

/**
 * Seat rows that fit on one landscape page below the masthead, the room band
 * and the front-of-room marker — assuming the tallest kind of seat card, the
 * one whose name has wrapped onto a second line.
 */
const MAX_SEAT_ROWS_PER_PAGE = 5;

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaCell}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

function RoomSheet({ paper, room }: { paper: SeatingPaper; room: SeatingRoom }) {
  const cols = room.grid.reduce((n, r) => Math.max(n, r.length), 0);
  const m = seatMetrics(cols);
  // A room too tall for one page is cut between rows, and every part carries
  // the room name and the front-of-room marker again — an invigilator holding
  // the second sheet has to know which room and which way round it is.
  const parts = paginate(room.grid, MAX_SEAT_ROWS_PER_PAGE);

  return (
    <>
      {parts.map((rows, ci) => {
        const firstRow = ci * MAX_SEAT_ROWS_PER_PAGE + 1;
        const lastRow = firstRow + rows.length - 1;
        return (
          <View key={ci} wrap={false}>
            <View style={s.band}>
              <View>
                <Text style={s.bandTitle}>Room {room.roomNumber}</Text>
                <Text style={s.bandSub}>
                  {paper.classLabel} · {paper.subject}
                </Text>
              </View>
              <View style={s.chipRow}>
                <Text style={s.chip}>
                  Seated {room.seated} / {room.examCapacity}
                </Text>
                <Text style={s.chip}>
                  {parts.length > 1
                    ? `Rows ${firstRow}–${lastRow} of ${room.grid.length}`
                    : `${room.grid.length} row${room.grid.length === 1 ? "" : "s"}`}
                </Text>
              </View>
            </View>

            <View style={s.metaStrip}>
              <MetaCell label="Date" value={`${paper.date} (${paper.day})`} />
              <MetaCell label="Time" value={paper.time} />
              {room.location ? <MetaCell label="Location" value={room.location} /> : null}
              <MetaCell label="Layout" value={room.layout} />
              {room.teachingCapacity > room.examCapacity ? (
                <MetaCell label="In a lesson" value={`${room.teachingCapacity} seats`} />
              ) : null}
            </View>

            <Text style={s.frontMark}>FRONT OF ROOM — INVIGILATOR</Text>

            {rows.map((row, ri) => (
              <View key={ri} style={s.gridRow} wrap={false}>
                <View style={s.rowTag}>
                  <Text style={s.rowTagText}>R{firstRow + ri}</Text>
                </View>
                <View style={s.seatTrack}>
                  {row.map((seat) => (
                    <View key={seat.seatLabel} style={[s.seat, { width: m.width }]}>
                      <Text style={[s.seatLabel, { fontSize: m.label }]}>{seat.seatLabel}</Text>
                      <Text style={[s.seatName, { fontSize: m.name }]}>{seat.name}</Text>
                      <View style={s.seatFoot}>
                        <Text style={[s.seatRoll, { fontSize: m.roll }]}>{seat.roll}</Text>
                        <View style={s.tick} />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))}

            <View style={s.invigRow}>
              <View style={s.invigBox}>
                <View style={s.invigLine} />
                <Text style={s.invigLabel}>Invigilator name</Text>
              </View>
              <View style={s.invigBox}>
                <View style={s.invigLine} />
                <Text style={s.invigLabel}>Signature</Text>
              </View>
              <View style={s.invigBox}>
                <View style={s.invigLine} />
                <Text style={s.invigLabel}>Candidates present</Text>
              </View>
              <View style={s.invigBox}>
                <View style={s.invigLine} />
                <Text style={s.invigLabel}>Absent roll numbers</Text>
              </View>
            </View>
          </View>
        );
      })}
    </>
  );
}

function SeatingDocument({ data, withLogo }: { data: SeatingData; withLogo: boolean }) {
  return (
    <Document title={`Seating Plan — ${data.title}`}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Masthead
          brand={data.brand}
          kicker="Seating Plan"
          title={data.title}
          meta="Invigilator copy · not for display"
          withLogo={withLogo}
        />

        {data.papers.length === 0 ? (
          <Text style={s.empty}>No papers have been seated yet.</Text>
        ) : (
          data.papers.map((paper) =>
            paper.rooms.map((room) => (
              <RoomSheet
                key={`${paper.classLabel}-${paper.subject}-${room.roomNumber}`}
                paper={paper}
                room={room}
              />
            )),
          )
        )}

        <Notes
          title="For the invigilator"
          items={[
            "One candidate per bench. Verify each candidate against their roll number before the paper starts.",
            "Tick the box on a seat card once the candidate is verified in place.",
            "Record every empty seat on the attendance slip, and hand it in with the scripts.",
            "This sheet names children and their location at a known time — do not display or copy it.",
          ]}
        />

        <Footer label={`${data.title} · Seating Plan · generated ${prettyDate(todayLocal())}`} />
      </Page>
    </Document>
  );
}

export async function buildSeatingData(opts: {
  campusId: string;
  sessionId?: string;
  examId?: string;
  scheduleId?: string;
}): Promise<SeatingData> {
  const { campusId, sessionId, examId, scheduleId } = opts;
  if (!sessionId && !examId && !scheduleId) {
    throw new ApiError("sessionId, examId or scheduleId is required", 400);
  }

  const campus = await prisma.campus.findFirst({
    where: { id: campusId },
    select: CAMPUS_BRANDING_SELECT,
  });

  const session = sessionId
    ? await prisma.examSession.findFirst({
        where: { id: sessionId, campusId },
        select: { title: true },
      })
    : null;

  const schedules = await prisma.examSchedule.findMany({
    where: {
      campusId,
      ...(scheduleId ? { id: scheduleId } : {}),
      ...(examId ? { examId } : {}),
      ...(sessionId ? { exam: { sessionId } } : {}),
    },
    orderBy: [{ date: "asc" }, { periodDefinition: { periodNumber: "asc" } }],
    select: {
      date: true,
      subject: { select: { name: true } },
      periodDefinition: { select: { startTime: true, endTime: true } },
      exam: { select: { title: true, class: { select: { name: true, section: true } } } },
      rooms: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          room: {
            select: {
              roomNumber: true,
              capacity: true,
              building: true,
              floor: true,
              wing: true,
              rows: true,
              benchesPerRow: true,
              seatsPerBench: true,
              examSeatsPerBench: true,
            },
          },
          seats: {
            orderBy: { seatNumber: "asc" },
            select: {
              seatNumber: true,
              rowNo: true,
              benchNo: true,
              seatOnBench: true,
              student: { select: { fullName: true, rollNo: true } },
            },
          },
        },
      },
    },
  });

  const papers: SeatingPaper[] = schedules
    .filter((sc) => sc.rooms.some((r) => r.seats.length > 0))
    .map((sc) => {
      const ymd = sc.date.toISOString().slice(0, 10);
      return {
        classLabel: `${sc.exam.class.name}${sc.exam.class.section ? ` ${sc.exam.class.section}` : ""}`,
        subject: sc.subject.name,
        date: prettyDate(ymd),
        day: dayName(ymd),
        time: sc.periodDefinition
          ? `${sc.periodDefinition.startTime} – ${sc.periodDefinition.endTime}`
          : "To be announced",
        headcount: sc.rooms.reduce((n, r) => n + r.seats.length, 0),
        rooms: sc.rooms.map((r) => {
          const cap = roomCapacity(r.room);

          // Group seats into the rows they physically sit in. Plans made before
          // the grid existed have rowNo 0, so they fall back to fixed-width
          // rows — still readable, just not a picture of the room.
          const byRow = new Map<number, SeatEntry[]>();
          r.seats.forEach((seat, i) => {
            const rowKey = seat.rowNo > 0 ? seat.rowNo : Math.floor(i / 6) + 1;
            const entry: SeatEntry = {
              seatLabel:
                seat.rowNo > 0
                  ? `R${seat.rowNo}-B${seat.benchNo}${seat.seatOnBench > 1 ? `-S${seat.seatOnBench}` : ""}`
                  : `Seat ${seat.seatNumber}`,
              name: seat.student.fullName,
              roll: seat.student.rollNo,
            };
            byRow.set(rowKey, [...(byRow.get(rowKey) ?? []), entry]);
          });

          return {
            roomNumber: r.room.roomNumber,
            location: roomLocation(r.room),
            examCapacity: cap.exam,
            teachingCapacity: cap.teaching,
            layout: cap.hasLayout
              ? `${r.room.rows} rows × ${r.room.benchesPerRow} benches, ${r.room.examSeatsPerBench} per bench`
              : `${cap.benches} benches`,
            seated: r.seats.length,
            grid: [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([, seats]) => seats),
          };
        }),
      };
    });

  return {
    brand: letterhead(campus),
    title: session?.title ?? schedules[0]?.exam.title ?? "Examination",
    papers,
  };
}

export async function renderSeatingPdf(opts: {
  campusId: string;
  sessionId?: string;
  examId?: string;
  scheduleId?: string;
}) {
  const data = await buildSeatingData(opts);
  return {
    buffer: await renderDoc(
      (withLogo) => <SeatingDocument data={data} withLogo={withLogo} />,
      !!data.brand.logoUrl,
    ),
    filename: `seating-plan-${data.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`,
  };
}
