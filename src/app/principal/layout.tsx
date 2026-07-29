import OperationalLayout from "@/app/operational-layout";
import { PrincipalDataProvider } from "./principal-data-context";

export default function PrincipalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrincipalDataProvider>
      <OperationalLayout>{children}</OperationalLayout>
    </PrincipalDataProvider>
  );
}
