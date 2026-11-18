import { requirePageSession } from "@/lib/auth/require-page-session";
import OperationalLayout from "@/app/operational-layout";
import { PrincipalDataProvider } from "./principal-data-context";
import { localizedTitle } from "@/lib/locale/page-title";

// §7.3 distinct <title>, in the viewer's language (SKAI-2250).
export const generateMetadata = () => localizedTitle("Academic console");

export default async function PrincipalLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageSession();
  return (
    <PrincipalDataProvider key={JSON.stringify([user.userId, user.schoolId, user.campusId, user.role, user.accessVersion ?? 0])}>
      <OperationalLayout>{children}</OperationalLayout>
    </PrincipalDataProvider>
  );
}
