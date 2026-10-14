import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Modal, ModalActions, useDialogBehaviour } from "../../src/components/ui/modal";
import { ConfirmAction } from "../../src/components/ui/confirm-action";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "../../src/components/ui/dialog";

/** Browser-only synthetic harness: no API calls, records, or persistence. */
function ModalFoundationFixture() {
  const [autoFocusOpen, setAutoFocusOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [compoundOpen, setCompoundOpen] = useState(false);
  const [tone, setTone] = useState<"primary" | "danger" | "warning" | "success">("primary");
  const [busy, setBusy] = useState(false);
  const [authoredCopy, setAuthoredCopy] = useState(false);
  const [name, setName] = useState("");
  const [closeCount, setCloseCount] = useState(0);

  useEffect(() => {
    const release = () => setBusy(false);
    window.addEventListener("fixture:release-operation", release);
    return () => window.removeEventListener("fixture:release-operation", release);
  }, []);

  const closeForm = () => { setFormOpen(false); setName(""); setCloseCount((value) => value + 1); };
  return <main className="p-6">
    <h1>Modal foundation synthetic fixture</h1>
    <button type="button" onClick={() => setAutoFocusOpen(true)}>Open autofocus example</button>
    {autoFocusOpen && <Modal title="Autofocus example" onClose={() => setAutoFocusOpen(false)}><input aria-label="Autofocus field" autoFocus /></Modal>}
    <InactiveDialogExample />
    <button type="button" onClick={() => setFormOpen(true)}>Open form</button>
    <button type="button" onClick={() => setConfirmOpen(true)}>Open confirmation</button>
    <button type="button" onClick={() => setCompoundOpen(true)}>Open compound dialog</button>
    <label><input type="checkbox" checked={authoredCopy} onChange={event => setAuthoredCopy(event.target.checked)} />Use authored warning</label>
    <label>Synthetic confirmation tone<select value={tone} onChange={event => setTone(event.target.value as typeof tone)}>{["primary", "danger", "warning", "success"].map(value => <option key={value}>{value}</option>)}</select></label>
    <output aria-label="Form close count">{closeCount}</output>
    {formOpen && <Modal title="Edit synthetic record" onClose={closeForm} dirty={name.length > 0} dirtyMessage={authoredCopy ? "Author-owned warning." : undefined}
      footer={<ModalActions actionLabel="Finish example" onAction={closeForm} onCancel={closeForm} secondary={<button type="button">Save example draft</button>} />}>
      <label htmlFor="synthetic-name">Synthetic name</label>
      <input id="synthetic-name" value={name} onChange={(event) => setName(event.target.value)} />
      <button type="button" onClick={() => setConfirmOpen(true)}>Open nested confirmation</button>
    </Modal>}
    <ConfirmAction open={confirmOpen} title="Confirm synthetic change" description="Only this browser fixture changes."
      tone={tone} confirmLabel="Start example operation" cancelLabel={authoredCopy ? "Author-owned cancel" : undefined} busy={busy} onConfirm={() => setBusy(true)} onCancel={() => setConfirmOpen(false)} />
    <Dialog open={compoundOpen} onOpenChange={setCompoundOpen}>
      <DialogContent dismissible={!busy}>
        <DialogHeader><DialogTitle>Compound synthetic dialog</DialogTitle></DialogHeader>
        <button type="button" onClick={() => setBusy(true)}>Start compound operation</button>
        <DialogClose>Close compound</DialogClose>
      </DialogContent>
    </Dialog>
  </main>;
}

function InactiveDialogExample() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { z } = useDialogBehaviour(ref, { active: open, onClose: () => setOpen(false) });
  return <><button type="button" onClick={() => setOpen(true)}>First inactive example trigger</button><button type="button" onClick={() => setOpen(true)}>Second inactive example trigger</button>
    {open && <div ref={ref} role="dialog" aria-label="Inactive hook example" style={{ position: 'fixed', inset: 20, zIndex: z, background: 'white' }}><input aria-label="Inactive autofocus field" autoFocus /><button type="button" onClick={() => setOpen(false)}>Close inactive example</button></div>}</>;
}

createRoot(document.getElementById("fixture-root")!).render(<ModalFoundationFixture />);
