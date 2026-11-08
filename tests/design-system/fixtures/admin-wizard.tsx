import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen, Check } from 'lucide-react';
import { WizardShell, Field, ReviewSection } from '../../../src/components/shared-admin/wizard-shell';
import { Button } from '../../../src/components/ui/button';
import { Input } from '../../../src/components/ui/input-base';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../src/components/ui/table';

function Example() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => {
    const release = () => setBusy(false);
    window.addEventListener('fixture:release', release);
    return () => window.removeEventListener('fixture:release', release);
  }, []);
  return <main><h1>Shared admin wizard fixture</h1><Button onClick={() => setOpen(true)}>Open admission example</Button>
    <Table aria-label="Example bounded roster" containerClassName="max-h-32 max-w-full" className="min-w-[600px]">
      <TableHeader className="sticky top-0"><TableRow><TableHead>Example name</TableHead><TableHead>Example class</TableHead></TableRow></TableHeader>
      <TableBody>{Array.from({ length: 12 }, (_, index) => <TableRow key={index}><TableCell>Example {index + 1}</TableCell><TableCell>Class A</TableCell></TableRow>)}</TableBody>
    </Table>
    {open && <WizardShell eyebrow="Synthetic admission" icon={BookOpen} steps={[{label:'Details',icon:BookOpen,blurb:'Enter an example name.'},{label:'Review',icon:Check,blurb:'Review the example.'}]} step={step} onStepChange={setStep} onClose={() => setOpen(false)} onBack={() => setStep(0)} onNext={() => setStep(1)} onSubmit={() => setBusy(true)} submitLabel="Submit example" submitting={busy}>
      {step === 0 ? <><Field label="Example name" required error={name ? undefined : 'Enter an example name.'}><Input value={name} onChange={event => setName(event.target.value)} /></Field><Field label="Example note" hint="This data remains in this fixture."><Input /></Field></> : <ReviewSection title="Example details" icon={BookOpen} onEdit={() => setStep(0)}><p>{name}</p></ReviewSection>}
    </WizardShell>}
  </main>;
}
createRoot(document.getElementById('fixture-root')!).render(<Example />);
