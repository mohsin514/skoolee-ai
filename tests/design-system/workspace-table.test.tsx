import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable } from "../../src/components/shared-admin/workspace";
import { Table, TableHeader, TableHead, TableRow } from "../../src/components/ui/table";
import { Button } from "../../src/components/ui/button";

const rows = [{ id: "pupil-1", name: "Example A" }, { id: "pupil-2", name: "Example B" }];

test("sortable workspace headers expose current direction and column scope", () => {
  const html = renderToStaticMarkup(<DataTable rows={rows} rowKey={row => row.id}
    columns={[{ key: "name", label: "Student", sortable: true, render: row => row.name }]}
    sort={{ key: "name", dir: "desc" }} onSort={() => {}} />);
  assert.match(html, /<th[^>]*scope="col"[^>]*aria-sort="descending"/);
});

test("selection identifies the row, scope and mixed state without changing callbacks", () => {
  const html = renderToStaticMarkup(<DataTable rows={rows} rowKey={row => row.id}
    getRowLabel={row => row.name} caption="Synthetic pupils" selectAllLabel="Select pupils on this page"
    selected={new Set(["pupil-1"])} onToggleSelect={() => {}} onToggleAll={() => {}}
    columns={[{ key: "name", label: "Student", render: row => row.name }]} />);
  assert.match(html, /<caption[^>]*>Synthetic pupils<\/caption>/);
  assert.match(html, /aria-label="Select pupils on this page"/);
  assert.match(html, /aria-checked="mixed"/);
  assert.match(html, /aria-label="Deselect Example A"/);
  assert.match(html, /aria-label="Select Example B"/);
});

test("noninteractive first cells get a native action without wrapping cell markup", () => {
  const html = renderToStaticMarkup(<DataTable rows={rows.slice(0, 1)} rowKey={row => row.id}
    getRowLabel={row => row.name} onRowClick={() => {}}
    columns={[{ key: "name", label: "Student", render: row => <div><p>{row.name}</p></div> }]} />);
  assert.match(html, /<button[^>]*type="button"[^>]*aria-label="Open Example A"/);
  assert.doesNotMatch(html, /<button[^>]*>\s*<div/);
});

test("existing first-cell controls remain single controls and logical alignment is additive", () => {
  const html = renderToStaticMarkup(<DataTable rows={rows.slice(0, 1)} rowKey={row => row.id} onRowClick={() => {}}
    columns={[
      { key: "name", label: "Student", align: "start", render: row => <button type="button">{row.name}</button> },
      { key: "id", label: "ID", align: "end", render: row => row.id },
      { key: "legacy", label: "Legacy", align: "right", render: row => row.id },
    ]} />);
  assert.equal((html.match(/<button\b/g) || []).length, 1);
  assert.match(html, /text-start/);
  assert.match(html, /text-end/);
  assert.match(html, /text-right/);
});

test("basic column headers default scope while allowing intentional row headers", () => {
  const html = renderToStaticMarkup(<Table><TableHeader><TableRow>
    <TableHead>Name</TableHead><TableHead scope="row">Group</TableHead>
  </TableRow></TableHeader></Table>);
  assert.match(html, /<th[^>]*scope="col"[^>]*>Name/);
  assert.match(html, /<th[^>]*scope="row"[^>]*>Group/);
});

test("custom Button and link renderers retain their own action without a duplicate", () => {
  function LinkLike({ href, children }: { href: string; children: React.ReactNode }) { return <a href={href}>{children}</a>; }
  for (const content of [<Button key="button" onClick={() => {}}>Existing action</Button>, <LinkLike key="link" href="/example">Existing action</LinkLike>]) {
    const html = renderToStaticMarkup(<DataTable rows={rows.slice(0, 1)} rowKey={row => row.id} onRowClick={() => {}}
      columns={[{ key: "name", label: "Student", render: () => content }]} />);
    assert.doesNotMatch(html, /aria-label="Open /);
    assert.equal((html.match(/<(?:button|a)\b/g) || []).length, 1);
  }
});

test("opaque action renderers can declare ownership without inspecting or invoking them", () => {
  function OpaqueAction() { return <button type="button">Existing action</button>; }
  const html = renderToStaticMarkup(<DataTable rows={rows.slice(0, 1)} rowKey={row => row.id} onRowClick={() => {}}
    columns={[{ key: "name", label: "Student", rowAction: "provided", render: () => <OpaqueAction /> }]} />);
  assert.equal((html.match(/<button\b/g) || []).length, 1);
});

test("existing render callbacks run once and supply useful fallback selection names", () => {
  let renders = 0;
  const html = renderToStaticMarkup(<DataTable rows={rows} rowKey={row => row.id}
    onToggleSelect={() => {}} onToggleAll={() => {}}
    columns={[{ key: "name", label: "Student", render: row => { renders++; return <span>{row.name}</span>; } }]} />);
  assert.equal(renders, rows.length);
  assert.match(html, /aria-label="Select Example A"/);
  assert.match(html, /aria-label="Select Example B"/);
});

test("data grids follow the shell comfortable/compact control unless a screen overrides it", async () => {
  const { WorkspacePrefsContext } = await import("../../src/components/role-dashboard/workspace-controls");
  const columns = [{ key: "name", label: "Student", render: (row: { id: string; name: string }) => row.name }];
  const noop = () => undefined;
  const shell = (density: "compact" | "comfortable") => ({ focus: false, setFocus: noop, density, setDensity: noop, openShortcuts: noop });
  const inShell = (density: "compact" | "comfortable", node: React.ReactNode) =>
    renderToStaticMarkup(<WorkspacePrefsContext.Provider value={shell(density)}>{node}</WorkspacePrefsContext.Provider>);
  const compact = inShell("compact", <DataTable rows={rows.slice(0, 1)} rowKey={row => row.id} columns={columns} />);
  assert.match(compact, /px-3 py-2/);
  const comfortable = inShell("comfortable", <DataTable rows={rows.slice(0, 1)} rowKey={row => row.id} columns={columns} />);
  assert.match(comfortable, /px-4 py-3/);
  const overridden = inShell("compact", <DataTable rows={rows.slice(0, 1)} rowKey={row => row.id} columns={columns} density="comfortable" />);
  assert.match(overridden, /px-4 py-3/);
});
