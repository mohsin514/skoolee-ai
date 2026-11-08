import { useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { PrincipalDataProvider, usePrincipalData } from "../../src/app/principal/principal-data-context";
import { SuperAdminDataProvider, useSuperAdminData } from "../../src/app/super/super-data-context";
import { StudentDataProvider, useStudentData } from "../../src/app/student/student-data-context";
import { pending } from "./dashboard-scope-actions.fixture";

type Role = "principal" | "super" | "student";
const role = new URLSearchParams(location.search).get("role") as Role;
const providers = { principal: PrincipalDataProvider, super: SuperAdminDataProvider, student: StudentDataProvider };
const hooks = { principal: usePrincipalData, super: useSuperAdminData, student: useStudentData };
function Probe() {
  const useData = hooks[role];
  const value = useData();
  return <main><output data-testid="data">{JSON.stringify(value.data)}</output><output data-testid="loading">{String(value.loading)}</output><output data-testid="error">{value.error ?? ""}</output><button onClick={() => value.refetch()}>Refresh</button></main>;
}
function Fixture() {
  const [scope, setScope] = useState("actor-a:school-a:campus-a");
  const [visible, setVisible] = useState(true);
  const Provider = providers[role] as ({ children }: { children: ReactNode }) => ReactNode;
  Object.assign(window, { dashboardFixture: {
    switchScope: (value: string) => flushSync(() => setScope(value)),
    setVisible: (value: boolean) => flushSync(() => setVisible(value)),
    requests: () => pending.map(item => ({ id: item.id, role: item.role })),
    resolve: (id: number, value: string) => pending.find(item => item.id === id)!.resolve({ privateLabel: value }),
    reject: (id: number) => pending.find(item => item.id === id)!.reject(new Error("This account cannot access that record.")),
  } });
  return visible ? <Provider key={scope}><Probe /></Provider> : <p>Unmounted</p>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
