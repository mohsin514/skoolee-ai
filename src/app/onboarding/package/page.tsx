import { redirect } from "next/navigation";

/**
 * The package chooser is a modal inside the setup wizard now
 * (src/components/onboarding/PackageChooser.tsx). Old links — bookmarks,
 * emails, provider "back" buttons — land on the wizard step they came from
 * with the chooser open.
 */
const STEPS = new Set(["structure", "identity", "package", "campuses", "academic", "review"]);

export default async function OnboardingPackageRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const step = STEPS.has(one("returnStep")) ? one("returnStep") : "package";
  const next = new URLSearchParams({ step, packages: "open" });
  const enrollment = Number(one("enrollment"));
  if (Number.isSafeInteger(enrollment) && enrollment > 0) next.set("students", String(enrollment));
  redirect(`/onboarding?${next.toString()}`);
}
