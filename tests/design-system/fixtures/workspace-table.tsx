import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Users } from "lucide-react";
import { DataTable, WorkspaceHeader, type SortDir } from "../../../src/components/shared-admin/workspace";

declare global { interface Window { __tableLanguage?: "en" | "ar" | "ur" } }

const language = window.__tableLanguage ?? "en";
const titles = {
  en: "Shared workspace components with a long descriptive title",
  ar: "مكونات مساحة العمل المشتركة مع عنوان وصفي طويل للاختبار",
  ur: "مشترکہ ورک اسپیس کے اجزاء کا طویل وضاحتی عنوان برائے جانچ",
};
const rows = [{ id: "example-a", name: "Example A" }, { id: "example-b", name: "مثال B" }];

function TableFixture() {
  const [selected, setSelected] = useState(new Set([rows[0].id]));
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({ key: "name", dir: "asc" });
  const [opened, setOpened] = useState(0);
  const [empty, setEmpty] = useState(false);
  const increment = () => setOpened(count => count + 1);
  return <main className="min-h-dvh space-y-4 bg-background p-4 sm:p-8" dir={language === "en" ? "ltr" : "rtl"}>
    <WorkspaceHeader icon={Users} eyebrow="Synthetic fixture" title={titles[language]} />
    <p role="status">Opened {opened}</p>
    <button type="button" onClick={() => setEmpty(value => !value)}>Toggle empty</button>
    <DataTable rows={empty ? [] : rows} rowKey={row => row.id} getRowLabel={row => row.name}
      caption="Synthetic workspace table" minWidth={480} selected={selected} onToggleSelect={id => setSelected(current => {
        const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
      })} onToggleAll={() => setSelected(current => rows.every(row => current.has(row.id)) ? new Set() : new Set(rows.map(row => row.id)))}
      sort={sort} onSort={key => setSort(current => ({ key, dir: current.dir === "asc" ? "desc" : "asc" }))}
      onRowClick={increment} empty="No synthetic rows"
      columns={[
        { key: "name", label: "Student", sortable: true, align: "start", render: row => row.id === "example-a"
          ? <div><p>{row.name}</p><span>Read-only cell content</span></div>
          : <button type="button" onClick={increment}>{row.name}</button> },
        { key: "logical", label: "Logical end", align: "end", render: row => row.id },
        { key: "physical", label: "Physical right", align: "right", render: row => row.id },
      ]} />
  </main>;
}
createRoot(document.getElementById("table-fixture")!).render(<TableFixture />);
