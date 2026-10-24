import { prisma } from "@/lib/db/prisma";
import type { CapabilityContext } from "../registry/types";
import { InputRequired, WorkflowError } from "../errors";
import { matchPupil } from "./pupils";

/**
 * Library resolvers (Slice 6): a member by member number, name or pupil class; a physical copy by its
 * accession/barcode label ("LB-0042") or by title when exactly one copy is in the wanted state; a catalogue
 * title by ISBN or name. Everything is matched on the server against this campus only; the model never
 * receives a member list. No match or several become a question with choices, never a guess.
 */
const fold = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[ً-ٰٟ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const BARCODE = /^[A-Za-z0-9-]{3,40}$/u;
const isbnOf = (value: string) => { const raw = value.replace(/[\s-]/g, "").toUpperCase(); return /^(?:97[89])?\d{9}[\dX]$/.test(raw) ? raw : null; };
export const normalIsbn = (value: string | null | undefined) => (value ? value.replace(/[\s-]/g, "").toUpperCase() : "");

export interface LibraryMemberRow { id: string; memberNo: string; userId: string; name: string }
export interface CopyRow { id: string; barcode: string; status: string; bookId: string; title: string; updatedAt: Date; holdFor: string | null }
export interface TitleRow { id: string; title: string; author: string | null; isbn: string | null; categoryId: string | null; subject: string | null; copiesTotal: number; copiesAvailable: number }

/** The job's campus must be the actor's own (the desk services act on the session campus). */
export function libraryCampus(ctx: CapabilityContext) {
  if (!ctx.campusId || (ctx.user.role !== "SUPER_ADMIN" && ctx.campusId !== ctx.user.campusId)) throw new WorkflowError("SCOPE_DENIED");
  return ctx.campusId;
}

/** Library members of this campus, optionally only pupils of one class (a class handle, scope-checked by the caller). */
export async function libraryMembers(ctx: CapabilityContext, classId?: string): Promise<LibraryMemberRow[]> {
  const campusId = libraryCampus(ctx);
  let userIds: string[] | undefined;
  if (classId) {
    const pupils = await prisma.student.findMany({ where: { schoolId: ctx.user.schoolId, campusId, classId, archivedAt: null, studentUserId: { not: null } }, select: { studentUserId: true } });
    userIds = pupils.map(row => row.studentUserId!).filter(Boolean);
  }
  const rows = await prisma.libraryMember.findMany({
    where: { schoolId: ctx.user.schoolId, campusId, ...(userIds ? { userId: { in: userIds } } : {}) },
    select: { id: true, memberNo: true, userId: true, user: { select: { fullName: true } } }, orderBy: { memberNo: "asc" },
  });
  return rows.map(row => ({ id: row.id, memberNo: row.memberNo, userId: row.userId, name: row.user.fullName }));
}

export const memberLabel = (row: LibraryMemberRow) => `${row.name} · ${row.memberNo}`;

/** One member the user named: member number first, then the person's name (narrowed by class when given). */
export async function bindMember(ctx: CapabilityContext, text: string, pointer: string, classId?: string): Promise<LibraryMemberRow> {
  const rows = await libraryMembers(ctx, classId);
  const said = text.trim();
  const byNumber = rows.filter(row => row.memberNo.toLowerCase() === said.toLowerCase());
  if (byNumber.length === 1) return byNumber[0];
  const found = matchPupil(rows.map(row => ({ id: row.id, fullName: row.name, nameUr: null, rollNo: row.memberNo })), said).map(match => rows.find(row => row.id === match.id)!);
  if (found.length === 1) return found[0];
  throw new InputRequired([found.length
    ? { pointer, promptKey: "LIBRARY_MEMBER_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: row.memberNo, label: memberLabel(row) })) }
    : { pointer, promptKey: "LIBRARY_MEMBER_NOT_FOUND" }]);
}

/** A member id bound earlier, re-checked on this campus now. */
export async function memberById(ctx: CapabilityContext, id: string): Promise<LibraryMemberRow> {
  const campusId = libraryCampus(ctx);
  const row = await prisma.libraryMember.findFirst({ where: { id, schoolId: ctx.user.schoolId, campusId }, select: { id: true, memberNo: true, userId: true, user: { select: { fullName: true } } } });
  if (!row) throw new WorkflowError("SCOPE_DENIED");
  return { id: row.id, memberNo: row.memberNo, userId: row.userId, name: row.user.fullName };
}

export const titleLabel = (row: Pick<TitleRow, "title" | "author">) => (row.author ? `${row.title} · ${row.author}` : row.title);

/** Catalogue titles matching what the user said (ISBN, exact name, then by words). */
export async function matchTitles(ctx: CapabilityContext, text: string): Promise<TitleRow[]> {
  const campusId = libraryCampus(ctx);
  const rows = await prisma.book.findMany({ where: { schoolId: ctx.user.schoolId, campusId }, select: { id: true, title: true, author: true, isbn: true, categoryId: true, subject: true, copiesTotal: true, copiesAvailable: true }, orderBy: { title: "asc" } });
  const isbn = isbnOf(text);
  if (isbn) return rows.filter(row => normalIsbn(row.isbn) === isbn);
  const wanted = fold(text);
  if (!wanted) return [];
  const exact = rows.filter(row => fold(row.title) === wanted || fold(titleLabel(row)) === wanted);
  if (exact.length) return exact;
  const parts = wanted.split(" ");
  return rows.filter(row => { const words = fold(`${row.title} ${row.author ?? ""}`).split(" "); return parts.every(part => words.some(word => word.startsWith(part))); });
}

/** One title the user named, or a question. */
export async function bindTitle(ctx: CapabilityContext, text: string, pointer: string): Promise<TitleRow> {
  const found = await matchTitles(ctx, text);
  if (found.length === 1) return found[0];
  throw new InputRequired([found.length
    ? { pointer, promptKey: "BOOK_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: row.isbn ?? row.title, label: titleLabel(row) })) }
    : { pointer, promptKey: "BOOK_NOT_FOUND" }]);
}

export async function titleById(ctx: CapabilityContext, id: string): Promise<TitleRow> {
  const campusId = libraryCampus(ctx);
  const row = await prisma.book.findFirst({ where: { id, schoolId: ctx.user.schoolId, campusId }, select: { id: true, title: true, author: true, isbn: true, categoryId: true, subject: true, copiesTotal: true, copiesAvailable: true } });
  if (!row) throw new WorkflowError("SCOPE_DENIED");
  return row;
}

async function copiesWhere(ctx: CapabilityContext, where: Record<string, unknown>): Promise<CopyRow[]> {
  const campusId = libraryCampus(ctx);
  const rows = await prisma.bookCopy.findMany({ where: { schoolId: ctx.user.schoolId, campusId, ...where }, select: { id: true, barcode: true, status: true, bookId: true, updatedAt: true, holdFor: true }, orderBy: { barcode: "asc" } });
  const books = new Map((await prisma.book.findMany({ where: { id: { in: [...new Set(rows.map(row => row.bookId))] } }, select: { id: true, title: true } })).map(book => [book.id, book.title]));
  return rows.map(row => ({ ...row, title: books.get(row.bookId) ?? "" }));
}

/**
 * One physical copy: by its label (any state; the caller checks the state), or by title when exactly one of
 * that title's copies is in `want` (AVAILABLE to lend, ON_LOAN to return or renew). Several become a choice
 * of labels; a title with none in that state is refused with the reason.
 */
export async function bindCopy(ctx: CapabilityContext, text: string, pointer: string, want: "AVAILABLE" | "ON_LOAN"): Promise<CopyRow> {
  const said = text.trim();
  if (BARCODE.test(said)) {
    const byLabel = await copiesWhere(ctx, { barcode: said });
    const loose = byLabel.length ? byLabel : await copiesWhere(ctx, { barcode: { equals: said, mode: "insensitive" } });
    if (loose.length === 1) return loose[0];
  }
  const titles = await matchTitles(ctx, said);
  if (!titles.length) throw new InputRequired([{ pointer, promptKey: "LIBRARY_COPY_NOT_FOUND" }]);
  if (titles.length > 1) throw new InputRequired([{ pointer, promptKey: "BOOK_AMBIGUOUS", params: { count: titles.length }, options: titles.slice(0, 8).map(row => ({ value: row.isbn ?? row.title, label: titleLabel(row) })) }]);
  const copies = await copiesWhere(ctx, { bookId: titles[0].id, status: want });
  if (copies.length === 1) return copies[0];
  if (!copies.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: want === "AVAILABLE" ? "NO_COPY_AVAILABLE" : "NO_COPY_ON_LOAN" });
  throw new InputRequired([{ pointer, promptKey: "LIBRARY_COPY_AMBIGUOUS", params: { count: copies.length }, options: copies.slice(0, 8).map(row => ({ value: row.barcode, label: `${row.barcode} · ${row.title}` })) }]);
}

export async function copyById(ctx: CapabilityContext, id: string): Promise<CopyRow> {
  const [row] = await copiesWhere(ctx, { id });
  if (!row) throw new WorkflowError("SCOPE_DENIED");
  return row;
}

/** A category of this campus by name (folded); null when there is none. */
export async function bindCategory(ctx: CapabilityContext, name: string, pointer: string) {
  const campusId = libraryCampus(ctx);
  const rows = await prisma.bookCategory.findMany({ where: { schoolId: ctx.user.schoolId, campusId }, select: { id: true, name: true } });
  const found = rows.filter(row => fold(row.name) === fold(name));
  if (found.length === 1) return found[0];
  if (found.length > 1) throw new InputRequired([{ pointer, promptKey: "BOOK_CATEGORY_AMBIGUOUS", options: found.map(row => ({ value: row.name, label: row.name })) }]);
  return null;
}
