import { immutablePaymentPdf } from "@/lib/fees/receipt";
import { z } from "zod";
import { requireAuthUser, errorResponse, ApiError } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import { preview, requestCorrection, decideCorrection, history, catalog, permit } from "@/lib/corrections/service";
import { isFamily, studentScope, campusScope } from "@/lib/auth/policy";
const proposal = z.object({ kind: z.enum(["MARK", "PAYMENT"]), sourceId: z.string().min(1), expectedVersion: z.string().min(1), marksObtained: z.number().int().nonnegative().optional(), isAbsent: z.boolean().optional(), allocations: z.array(z.object({ invoiceId: z.string(), minor: z.number().int().nonnegative() })).max(100).optional(), unappliedMinor: z.number().int().nonnegative().optional() });
const body = z.discriminatedUnion("action", [
    z.object({ action: z.literal("preview"), proposal }),
    z.object({ action: z.literal("request"), proposal, reviewHash: z.string(), reason: z.string().trim().min(1).max(2000), publicExplanation: z.string().trim().min(1).max(2000), privateNote: z.string().max(4000).optional() }),
    z.object({ action: z.enum(["approve", "reject"]), id: z.string(), reviewHash: z.string() }),
]);
export async function GET(req: Request) {
    try {
        const user = await requireAuthUser();
        const url = new URL(req.url);
        const kind = z.enum(["MARK", "PAYMENT"]).parse(url.searchParams.get("kind") ?? "MARK");
        const original = url.searchParams.get("original");
        if (original) {
            await permit(user, "PAYMENT");
            const payment = await prisma.payment.findFirst({ where: { id: original, ...campusScope(user), student: studentScope(user) }, select: { id: true } });
            if (!payment)
                throw new ApiError("Receipt unavailable", 403);
            const bytes = await immutablePaymentPdf(payment.id);
            return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=original-receipt.pdf", "Cache-Control": "private, no-store" } });
        }
        const rows = await history(user, kind);
        if (url.searchParams.get("export") === "1" || url.searchParams.has("receipt")) {
            const id = url.searchParams.get("receipt");
            const result = id ? rows.filter(r => r.id === id) : rows;
            if (id && !result.length)
                throw new ApiError("Receipt unavailable", 403);
            return new Response(JSON.stringify({ format: "Skoolee correction receipt v1", history: result.map(r => ({ id: r.id, kind: r.kind, sourceId: r.sourceId, sourceVersion: r.sourceVersion, before: r.before, after: r.after, publicExplanation: r.publicExplanation, requesterName: r.requesterName, approverName: r.approverName, requestedAt: r.requestedAt, decidedAt: r.decidedAt, status: r.status, successorId: r.successorId, released: r.released })) }, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="corrections-${kind.toLowerCase()}.json"`, "Cache-Control": "private, no-store" } });
        }
        return Response.json({ records: await catalog(user, kind), history: rows, family: isFamily(user), actorId: user.userId, language: (await prisma.user.findUnique({ where: { id: user.userId }, select: { preferredLanguage: true } }))?.preferredLanguage ?? "en" }, { headers: { "Cache-Control": "private, no-store" } });
    }
    catch (e) {
        return errorResponse(e, "Correction history unavailable");
    }
}
export async function POST(req: Request) {
    try {
        const user = await requireAuthUser();
        const input = body.safeParse(await req.json());
        if (!input.success)
            throw new ApiError("Enter a valid correction, reason and public explanation", 400);
        const data = input.data;
        if (data.action === "preview")
            return Response.json(await preview(prisma, user, data.proposal));
        if (data.action === "request")
            return Response.json(await requestCorrection(user, data.proposal, data.reviewHash, data), { status: 201 });
        return Response.json(await decideCorrection(user, data.id, data.action === "approve" ? "APPLIED" : "REJECTED", data.reviewHash));
    }
    catch (e) {
        if (e instanceof Error && !("status" in e))
            return errorResponse(new ApiError(e.message), "Correction failed");
        return errorResponse(e, "Correction failed");
    }
}
