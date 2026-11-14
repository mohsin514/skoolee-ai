import { getLocalePackage } from "@/lib/locale/store";
import { redirect } from "next/navigation";
import { requireAuthUser } from "@/lib/api/scope";
import { permittedKinds } from "@/lib/corrections/service";
import { prisma } from "@/lib/db/prisma";
import CorrectionClient from "./view";

export const metadata = { title: "Record corrections" };

/** The kind a role opens on: the finance desk and campus operators work payment corrections first. */
function defaultKind(role: string): "PAYMENT" | "MARK" {
  return role === "ACCOUNTANT" || role === "CAMPUS_ADMIN" || role === "ADMIN" ? "PAYMENT" : "MARK";
}

export default async function CorrectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    let user;
    try {
        user = await requireAuthUser();
    }
    catch {
        redirect("/login");
    }
    // `?kind=PAYMENT|MARK` comes from the Today queue and CORRECTION_REQUESTED notifications (G28a, G39).
    const requested = (await searchParams).kind;
    const kind = Array.isArray(requested) ? requested[0] : requested;
    // SKAI-336: decide access on the server. A role with no correction kind gets an explicit denied state instead of a client fetch that fails.
    const permitted = await permittedKinds(user);
    const denied = permitted.length === 0;
    const wanted = kind === "PAYMENT" || kind === "MARK" ? kind : defaultKind(user.role);
    const initialKind = permitted.includes(wanted) ? wanted : permitted[0] ?? wanted;
    const prefs = await prisma.user.findUnique({ where: { id: user.userId }, select: { preferredLanguage: true } });
    const locale = await getLocalePackage(user.schoolId, user.campusId);
    return <CorrectionClient initialLocale={locale} actorId={user.userId} schoolId={user.schoolId} initialLanguage={prefs?.preferredLanguage ?? "en"} initialKind={initialKind} denied={denied}/>;
}
