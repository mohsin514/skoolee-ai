import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
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
 */

const BRAND = "#8127cf";
const INK = "#1f1a23";
const MUTED = "#6b6270";
const LINE = "#d9d0e0";

const s = StyleSheet.create({
  page: { padding: 30, fontSize: 9, color: INK, fontFamily: "Helvetica" },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: BRAND,
    paddingBottom: 10,
    marginBottom: 14,
  },
  school: { fontSize: 15, fontWeight: 700, color: INK },
  title: { fontSize: 11, fontWeight: 700, color: BRAND, marginTop: 3 },
  meta: { fontSize: 8, color: MUTED, marginTop: 3 },

  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: INK,
    marginTop: 14,
    marginBottom: 5,
    backgroundColor: "#f6f2fa",
    padding: 5,
    borderLeftWidth: 3,
    borderLeftColor: BRAND,
  },

  table: { borderWidth: 0.5, borderColor: LINE, borderBottomWidth: 0 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE },
  headRow: { flexDirection: "row", backgroundColor: "#f2eef5", borderBottomWidth: 0.5, borderBottomColor: LINE },
  th: { padding: 5, fontSize: 7, fontWeight: 700, color: MUTED, textTransform: "uppercase" },
  td: { padding: 5, fontSize: 8.5 },
  zebra: { backgroundColor: "#fbfafc" },

  note: { fontSize: 7.5, color: MUTED, marginTop: 8, lineHeight: 1.4 },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 30,
    right: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: MUTED,
    borderTopWidth: 0.5,
    borderTopColor: LINE,
    paddingTop: 5,
  },
  empty: { fontSize: 9, color: MUTED, padding: 12, textAlign: "center" },

  // Seating grid
  gridRow: { flexDirection: "row", marginBottom: 3 },
  seat: {
    width: 78,
    marginRight: 3,
    padding: 3,
    borderWidth: 0.5,
    borderColor: LINE,
    borderRadius: 2,
    backgroundColor: "#fbfafc",
  },
  seatLabel: { fontSize: 5.5, color: BRAND, fontWeight: 700 },
  seatName: { fontSize: 6.5, color: INK, fontWeight: 700 },
  seatRoll: { fontSize: 5.5, color: MUTED },
  rowTag: { width: 22, fontSize: 6, color: MUTED, paddingTop: 6 },
  frontMark: {
    fontSize: 6,
    color: MUTED,
    textAlign: "center",
    marginBottom: 4,
    backgroundColor: "#f2eef5",
    padding: 2,
  },
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
  schoolName: string;
  campusName: string;
  title: string;
  term: string;
  academicYear: number;
  window: string;
  classes: DateSheetClass[];
}

const DATE_COLS = [
  { key: "date", label: "Date", width: "16%" },
  { key: "day", label: "Day", width: "10%" },
  { key: "time", label: "Time", width: "18%" },
  { key: "subject", label: "Subject", width: "30%" },
  { key: "marks", label: "Marks", width: "10%" },
  { key: "rooms", label: "Room(s)", width: "16%" },
] as const;

function DateSheetDocument({ data }: { data: DateSheetData }) {
  return (
    <Document title={`Date Sheet — ${data.title}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <Text style={s.school}>{data.schoolName}</Text>
          <Text style={s.title}>{data.title} — Date Sheet</Text>
          <Text style={s.meta}>
            {data.campusName} · {data.term} · {data.academicYear}
            {data.window ? ` · ${data.window}` : ""}
          </Text>
        </View>

        {data.classes.length === 0 ? (
          <Text style={s.empty}>No papers have been scheduled yet.</Text>
        ) : (
          data.classes.map((cls) => (
            <View key={cls.label} wrap={false}>
              <Text style={s.sectionTitle}>
                {cls.label} — {cls.papers.length} paper{cls.papers.length === 1 ? "" : "s"} ·{" "}
                {cls.students} student{cls.students === 1 ? "" : "s"}
              </Text>
              {cls.papers.length === 0 ? (
                <Text style={s.empty}>No papers scheduled for this class.</Text>
              ) : (
                <View style={s.table}>
                  <View style={s.headRow}>
                    {DATE_COLS.map((c) => (
                      <Text key={c.key} style={[s.th, { width: c.width }]}>
                        {c.label}
                      </Text>
                    ))}
                  </View>
                  {cls.papers.map((p, i) => (
                    <View key={`${p.date}-${p.subject}`} style={[s.row, ...(i % 2 ? [s.zebra] : [])]}>
                      {DATE_COLS.map((c) => (
                        <Text key={c.key} style={[s.td, { width: c.width }]}>
                          {String(p[c.key as keyof DateSheetPaper] ?? "—")}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))
        )}

        <Text style={s.note}>
          Candidates must be seated ten minutes before the start time. Bring your
          own stationery; no material may be shared during a paper. Any change to
          this date sheet will be announced in writing.
        </Text>

        <Footer label={`${data.title} · generated ${prettyDate(todayLocal())}`} />
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
    select: { name: true, school: { select: { name: true } } },
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
    schoolName: campus?.school?.name ?? "School",
    campusName: campus?.name ?? "",
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
    buffer: await renderToBuffer(<DateSheetDocument data={data} />),
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
  schoolName: string;
  campusName: string;
  title: string;
  papers: SeatingPaper[];
}

function SeatingDocument({ data }: { data: SeatingData }) {
  return (
    <Document title={`Seating Plan — ${data.title}`}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.header} fixed>
          <Text style={s.school}>{data.schoolName}</Text>
          <Text style={s.title}>{data.title} — Seating Plan</Text>
          <Text style={s.meta}>{data.campusName} · Invigilator copy · Not for display</Text>
        </View>

        {data.papers.length === 0 ? (
          <Text style={s.empty}>No papers have been seated yet.</Text>
        ) : (
          data.papers.map((paper) =>
            paper.rooms.map((room) => (
              <View key={`${paper.classLabel}-${paper.subject}-${room.roomNumber}`} wrap={false}>
                <Text style={s.sectionTitle}>
                  Room {room.roomNumber} — {paper.classLabel} · {paper.subject}
                </Text>
                <Text style={s.meta}>
                  {paper.date} ({paper.day}) · {paper.time}
                  {room.location ? ` · ${room.location}` : ""} · {room.layout} · seated{" "}
                  {room.seated} of {room.examCapacity} exam seats
                  {room.teachingCapacity > room.examCapacity
                    ? ` (${room.teachingCapacity} in a lesson)`
                    : ""}
                </Text>

                <Text style={s.frontMark}>FRONT OF ROOM — INVIGILATOR</Text>
                {room.grid.map((row, ri) => (
                  <View key={ri} style={s.gridRow}>
                    <Text style={s.rowTag}>R{ri + 1}</Text>
                    {row.map((seat) => (
                      <View key={seat.seatLabel} style={s.seat}>
                        <Text style={s.seatLabel}>{seat.seatLabel}</Text>
                        <Text style={s.seatName}>{seat.name}</Text>
                        <Text style={s.seatRoll}>Roll {seat.roll}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )),
          )
        )}

        <Text style={s.note}>
          One candidate per bench. Verify each candidate against their roll number
          before the paper starts, and record any empty seat on the attendance
          slip.
        </Text>

        <Footer label={`${data.title} · seating · generated ${prettyDate(todayLocal())}`} />
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
    select: { name: true, school: { select: { name: true } } },
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
    schoolName: campus?.school?.name ?? "School",
    campusName: campus?.name ?? "",
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
    buffer: await renderToBuffer(<SeatingDocument data={data} />),
    filename: `seating-plan-${data.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`,
  };
}
