import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AcademicCalendar } from "@/components/academic/AcademicCalendar";
import { AcademicModelPanel } from "@/components/academic/AcademicModelPanel";
import { FeeInvoicesTab } from "@/components/fees/FeeInvoicesTab";
import { CurrencySelect } from "@/components/locale/CurrencySelect";
import AccountSecurity from "@/app/account/security/page";
import { LocaleProvider } from "@/components/locale/LocaleProvider";

type FixtureWindow = Window & { __ownedView: string; __ownedReadOnly: boolean };
function Fixture() {
  const [currency, setCurrency] = useState("KWD");
  const view = (window as unknown as FixtureWindow).__ownedView;
  return <LocaleProvider><main className="mx-auto max-w-6xl p-4">
    {view === "calendar" && <AcademicCalendar campusId="synthetic-campus" role={(window as unknown as FixtureWindow).__ownedReadOnly ? "PARENT" : "ADMIN"} />}
    {view === "model" && <AcademicModelPanel campusId="synthetic-campus" />}
    {view === "invoices" && <FeeInvoicesTab campusId="synthetic-campus" />}
    {view === "currency" && <><CurrencySelect value={currency} onChange={setCurrency} /><output>{currency}</output></>}
    {view === "account" && <AccountSecurity />}
  </main></LocaleProvider>;
}
createRoot(document.getElementById("owned-ui-fixture")!).render(<Fixture />);
