/**
 * Schemas for the operations console — transport, dormitory, library,
 * inventory and the front desk.
 *
 * Two schemas per resource, deliberately:
 *
 *   • `…FormSchema` validates what the user typed. Every value is the string a
 *     text input actually holds, and the schema's *output* is the request body,
 *     so the rupee-to-paisa conversion and the empty-string-to-undefined
 *     normalisation happen once, inside the parse, rather than being re-derived
 *     at each call site.
 *   • `…Schema` validates what the route received. It is the only one that
 *     decides anything, because the form schema runs in a browser the caller
 *     controls.
 *
 * Sharing the field primitives between the two is what keeps them honest: the
 * client cannot accept a value the server will reject, because both sides get
 * their rules from `fields.ts`.
 *
 * Field *names* here follow the Prisma models rather than the old form state.
 * That is not cosmetic — eight of these forms were posting a different
 * vocabulary than the routes read (`visitorName` for `name`, `totalCopies` for
 * `copiesTotal`, `roomNumber` for `number`), so every save failed on a required
 * field the user could not see and the tables rendered `undefined` as an
 * em-dash. The models are the contract of record; the forms now match them.
 */

import { z } from "zod";
import {
  choice,
  id,
  integer,
  isoDate,
  money,
  optionalEmail,
  optionalId,
  optionalInteger,
  optionalIsoDate,
  optionalPhone,
  optionalText,
  personName,
  phone,
  requiredText,
  multilineText,
} from "./fields";

/**
 * Money is stored in paisa as an integer everywhere in this product, while the
 * inputs are labelled "(Rs)". Converting inside the schema means no call site
 * can forget the ×100, and none can apply it twice.
 */
const rupeesToPaisa = (label: string, options: { required?: boolean } = {}) => {
  const base = money(label, { max: 10_000_000 });
  return options.required === false
    ? z.preprocess(
        (value) => (value === "" || value == null ? undefined : value),
        base.transform((rupees) => Math.round(rupees * 100)).optional()
      )
    : base.transform((rupees) => Math.round(rupees * 100));
};

// ─── Transport ─────────────────────────────────────────────

export const transportRouteSchema = z.object({
  title: requiredText("Route name", { max: 120 }),
  description: optionalText("Description", 500),
  fare: integer("Fare", { min: 0, max: 100_000_000 }).optional().default(0),
});

export const transportRouteFormSchema = z.object({
  title: requiredText("Route name", { max: 120 }),
  description: optionalText("Description", 500),
  fare: rupeesToPaisa("Fare", { required: false }),
});

/**
 * The PATCH shape. Every field optional (the client sends only what changed),
 * but each keeps its own rule, and `id` is mandatory because the row to update
 * cannot be inferred.
 */
export const transportRoutePatchSchema = transportRouteSchema.partial().extend({
  id: id("Route"),
  vehicleIds: z.array(id("Vehicle")).max(100, "Too many vehicles selected").optional(),
});

export const vehicleSchema = z.object({
  number: requiredText("Vehicle number", { max: 30 }),
  // The column is `model`; the form previously sent `type`, so the bus/van
  // choice never reached the database.
  model: optionalText("Model", 60),
  driverName: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    personName("Driver name").optional()
  ),
  driverPhone: optionalPhone("Driver phone"),
  capacity: optionalInteger("Capacity", { min: 1, max: 200 }),
});

export const vehicleFormSchema = vehicleSchema;

export const VEHICLE_MODELS = ["BUS", "VAN", "CAR", "OTHER"] as const;

// ─── Dormitory ─────────────────────────────────────────────

export const dormRoomTypeSchema = z.object({
  name: requiredText("Type name", { max: 100 }),
  description: optionalText("Description", 500),
  costPerTerm: integer("Cost per term", { min: 0, max: 100_000_000 }).optional().default(0),
});

export const dormRoomTypeFormSchema = z.object({
  name: requiredText("Type name", { max: 100 }),
  description: optionalText("Description", 500),
  costPerTerm: rupeesToPaisa("Cost per term", { required: false }),
});

export const dormRoomSchema = z.object({
  roomTypeId: id("Room type"),
  // Was `roomNumber` on the client against `number` on the route.
  number: requiredText("Room number", { max: 30 }),
  capacity: integer("Capacity", { min: 1, max: 50 }),
});

export const dormRoomFormSchema = dormRoomSchema;

// ─── Library ───────────────────────────────────────────────

export const bookCategorySchema = z.object({
  name: requiredText("Category name", { max: 100 }),
});

export const bookSchema = z.object({
  title: requiredText("Title", { max: 200 }),
  author: optionalText("Author", 120),
  /**
   * ISBN-10 or ISBN-13 by length after the hyphens come out. Deliberately not
   * checksum-verified: school libraries hold older stock with printing errors
   * on the barcode, and refusing to catalogue a book the librarian is holding
   * is a worse failure than storing a slightly wrong number.
   */
  isbn: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value ?? undefined;
      const cleaned = value.replace(/[\s-]/g, "").toUpperCase();
      return cleaned === "" ? undefined : cleaned;
    },
    z
      .string()
      .regex(/^(\d{9}[\dX]|\d{13})$/, "ISBN must be 10 or 13 digits")
      .optional()
  ),
  subject: optionalText("Subject", 100),
  categoryId: optionalId("Category"),
  // Was `totalCopies` on the client against `copiesTotal` on the route, so
  // every attempt to add a book failed with "copiesTotal must be a number".
  copiesTotal: integer("Copies", { min: 0, max: 10_000 }),
});

export const bookFormSchema = bookSchema;

export const libraryMemberSchema = z.object({
  userId: id("Member"),
  // The route requires this and the form never sent it, so adding a library
  // member failed unconditionally.
  memberNo: requiredText("Member number", { max: 40 }),
});

export const bookIssueSchema = z
  .object({
    bookId: id("Book"),
    memberId: id("Member"),
    // Was `dueDate` on the client against `dueAt` on the route — the due date
    // silently defaulted instead of being honoured.
    dueAt: optionalIsoDate("Due date", { future: true }),
  });

// ─── Inventory ─────────────────────────────────────────────

export const itemCategorySchema = z.object({
  name: requiredText("Category name", { max: 100 }),
});

export const itemStoreSchema = z.object({
  name: requiredText("Store name", { max: 100 }),
});

export const supplierSchema = z.object({
  name: requiredText("Supplier name", { max: 120 }),
  phone: optionalPhone("Phone"),
  email: optionalEmail("Email"),
  address: multilineText("Address", 300),
});

export const itemSchema = z.object({
  name: requiredText("Item name", { max: 120 }),
  unit: optionalText("Unit", 30),
  categoryId: optionalId("Category"),
});

export const ITEM_TRANSACTION_KINDS = ["RECEIVE", "SELL", "ISSUE", "RETURN"] as const;

export const itemTransactionSchema = z.object({
  itemId: id("Item"),
  storeId: id("Store"),
  kind: choice("Transaction type", ITEM_TRANSACTION_KINDS),
  quantity: integer("Quantity", { min: 1, max: 1_000_000 }),
  unitPrice: optionalInteger("Unit price", { min: 0, max: 100_000_000 }),
  supplierId: optionalId("Supplier"),
  issuedToUserId: optionalId("Issued to"),
  note: optionalText("Note", 500),
});

export const itemTransactionFormSchema = z.object({
  itemId: id("Item"),
  storeId: id("Store"),
  kind: choice("Transaction type", ITEM_TRANSACTION_KINDS),
  quantity: integer("Quantity", { min: 1, max: 1_000_000 }),
  unitPrice: rupeesToPaisa("Unit price", { required: false }),
  supplierId: optionalId("Supplier"),
  note: optionalText("Note", 500),
});

// ─── Front desk ────────────────────────────────────────────

export const visitorSchema = z.object({
  // Was `visitorName`/`personToMeet`/`checkIn` on the client against
  // `name`/`toMeet`/`inTime` on the route. Both the write *and* the table
  // read the wrong names, so every column rendered an em-dash.
  name: personName("Visitor name"),
  phone: optionalPhone("Phone"),
  purpose: optionalText("Purpose", 200),
  toMeet: optionalText("Person to meet", 120),
  inTime: z.iso.datetime({ error: "Check-in time is required" }),
  note: optionalText("Note", 500),
});

export const visitorFormSchema = z.object({
  name: personName("Visitor name"),
  phone: optionalPhone("Phone"),
  purpose: optionalText("Purpose", 200),
  toMeet: optionalText("Person to meet", 120),
  note: optionalText("Note", 500),
});

export const visitorCheckoutSchema = z.object({
  id: id("Visitor"),
  outTime: z.iso.datetime({ error: "Check-out time is required" }),
});

export const COMPLAINT_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

export const complaintSchema = z.object({
  complainantName: personName("Complainant name"),
  type: requiredText("Complaint type", { max: 60 }),
  phone: optionalPhone("Phone"),
  // Required by the route and never sent by the form, so logging a complaint
  // always failed with "complainantName, type and date are required".
  date: isoDate("Date"),
  description: multilineText("Description", 2000),
});

export const complaintFormSchema = z.object({
  complainantName: personName("Complainant name"),
  type: requiredText("Complaint type", { max: 60 }),
  phone: optionalPhone("Phone"),
  date: isoDate("Date"),
  description: multilineText("Description", 2000),
});

export const complaintUpdateSchema = z.object({
  id: id("Complaint"),
  actionTaken: multilineText("Action taken", 2000),
  status: choice("Status", COMPLAINT_STATUSES).optional(),
});

/** The column stores RECEIVE/DISPATCH; the form used INCOMING/OUTGOING. */
export const POSTAL_DIRECTIONS = ["RECEIVE", "DISPATCH"] as const;

export const postalSchema = z.object({
  direction: choice("Direction", POSTAL_DIRECTIONS),
  fromName: optionalText("From", 120),
  toName: optionalText("To", 120),
  referenceNo: optionalText("Reference number", 60),
  date: isoDate("Date"),
  note: optionalText("Note", 500),
});

export const postalFormSchema = postalSchema;

/** The column stores IN/OUT; the form used INCOMING/OUTGOING. */
export const CALL_DIRECTIONS = ["IN", "OUT"] as const;

export const phoneCallSchema = z.object({
  name: personName("Caller name"),
  // Non-null in the model, so this is required rather than optional.
  phone: phone("Phone"),
  direction: choice("Direction", CALL_DIRECTIONS),
  date: isoDate("Date"),
  followUpDate: optionalIsoDate("Follow-up date"),
  note: optionalText("Note", 500),
});

export const phoneCallFormSchema = phoneCallSchema;

export const CERTIFICATE_KINDS = ["STUDENT_CERTIFICATE", "ID_CARD"] as const;
export const PAGE_SIZES = ["A4", "A5", "LETTER", "ID_CARD"] as const;

export const certificateTemplateSchema = z.object({
  kind: choice("Certificate type", CERTIFICATE_KINDS),
  name: requiredText("Template name", { max: 120 }),
  backgroundKey: optionalText("Background", 300),
  // `layoutJson` is a Json column and the route requires it; the form only ever
  // sent `description`/`bodyTemplate`, so saving a template always failed.
  layoutJson: z.unknown().refine((v) => v !== undefined && v !== null, "Template layout is required"),
  pageSize: choice("Page size", PAGE_SIZES).optional(),
});

export const certificateTemplateFormSchema = z.object({
  kind: choice("Certificate type", CERTIFICATE_KINDS),
  name: requiredText("Template name", { max: 120 }),
  bodyTemplate: z.preprocess(
    (v) => (typeof v === "string" ? v : ""),
    z
      .string()
      .min(1, "Template body is required")
      .max(20_000, "Template body is too long")
  ),
  pageSize: choice("Page size", PAGE_SIZES),
});

export type TransportRouteInput = z.output<typeof transportRouteSchema>;
export type VehicleInput = z.output<typeof vehicleSchema>;
export type DormRoomTypeInput = z.output<typeof dormRoomTypeSchema>;
export type DormRoomInput = z.output<typeof dormRoomSchema>;
export type BookInput = z.output<typeof bookSchema>;
export type VisitorInput = z.output<typeof visitorSchema>;
export type ComplaintInput = z.output<typeof complaintSchema>;
export type PostalInput = z.output<typeof postalSchema>;
export type PhoneCallInput = z.output<typeof phoneCallSchema>;
