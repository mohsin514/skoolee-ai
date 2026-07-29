import OperationalLayout from "@/app/operational-layout";
import { SuperAdminDataProvider } from "./super-data-context";

export default function SuperLayout({ children }: { children: React.ReactNode }) {
  return (
    <SuperAdminDataProvider>
      <OperationalLayout>{children}</OperationalLayout>
    </SuperAdminDataProvider>
  );
}
