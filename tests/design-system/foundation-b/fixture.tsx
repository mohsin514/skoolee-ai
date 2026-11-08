import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { FormField, FormErrorSummary } from "../../../src/components/ui/form-field";
import { Input } from "../../../src/components/ui/input-base";
import { InputGroup } from "../../../src/components/ui/input-group";
import { DatePicker } from "../../../src/components/ui/date-picker";
import { UrduInput } from "../../../src/components/ui/urdu-input";

function Fixture() {
  const [revised, setRevised] = useState(false);
  const [changed, setChanged] = useState("");
  const [valueChanged, setValueChanged] = useState("");
  const [urdu, setUrdu] = useState("");
  return <main>
    <h1>Isolated shared-field contract fixture</h1>
    <form aria-label="Legacy form">
      <FormField name="legacy" label="Legacy field"><Input name="legacy" /></FormField>
      <FormErrorSummary errors={{ legacy: "Focus legacy field" }} />
    </form>
    {['first', 'second'].map(scope => <form key={scope} aria-label={`${scope} form`}>
      <FormField idScope={scope} name="name" label={`${scope} name`} error={`${scope} error`} hint={`${scope} hint`}><Input id="field-name" name="name" aria-describedby="field-name-hint field-name-error" /></FormField>
      <FormErrorSummary errors={{ name: `Focus ${scope} name` }} />
    </form>)}
    <form aria-label="Compound form">
      <p id="external-one">External first instruction</p>
      <p id="external-two">External revised instruction</p>
      <FormField name="compound" label="Compound field" hint={revised ? undefined : "Shared hint"} error={revised ? undefined : "Shared error"} required={!revised}>
        <InputGroup><Input id="nested-custom" name="compound" aria-invalid="spelling" aria-required={false} aria-describedby={revised ? "external-two" : "external-one"} /></InputGroup>
      </FormField>
      <FormField id="explicit-field" name="explicit" label="Explicit field"><InputGroup id="group-id"><Input id="overridden-child" name="explicit" /></InputGroup></FormField>
      <FormField name="wrapper" label="Wrapper ID"><InputGroup id="wrapper-control"><Input id="nested-wrapper-child" /></InputGroup></FormField>
      <FormField name="direct" label="Direct field" hint={revised ? undefined : "Shared hint"} error={revised ? undefined : "Shared error"} required={!revised}>
        <Input id="direct-id" name="direct" aria-invalid="spelling" aria-required={false} aria-describedby={revised ? "external-two" : "external-one"} />
      </FormField>
      <FormField name="urdu" label="Urdu field" hint="Urdu hint" required={!revised}><UrduInput value={urdu} onChange={setUrdu} /></FormField>
      <button type="button" onClick={() => setRevised(value => !value)}>Update field state</button>
    </form>
    <div role="dialog" aria-label="Summary dialog">
      <FormField id="dialog-name" name="name" label="Dialog name"><Input /></FormField>
      <FormErrorSummary errors={{ name: "Focus dialog name" }} />
    </div>
    <form aria-label="Date form">
      <FormField name="date" label="Campus date" hint="Date hint" required>
        <DatePicker id="campus-date" name="date" label="Campus date" todayDate="2026-10-08" min="2026-10-08" max="2026-10-08" onChange={event => setChanged(event.target.value)} onValueChange={setValueChanged} />
      </FormField>
      <output aria-label="Native change">{changed}</output>
      <output aria-label="Value change">{valueChanged}</output>
    </form>
    <div role="alertdialog" aria-label="Summary confirmation">
      <FormField id="confirmation-name" name="name" label="Confirmation name"><Input /></FormField>
      <FormErrorSummary errors={{ name: "Focus confirmation name" }} />
    </div>
  </main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
