import { useEffect, useLayoutEffect, useState, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import * as ExamModule from '../../../src/components/academic/ExamCycleManager';
import { StaticLocaleProvider } from '../../../src/components/locale/LocaleProvider';
import { defaultLocale } from '../../../src/lib/locale/package';
// The test bundler adds an export to the unchanged source module. The actual
// CreateExamModal body, effects and controls run without copying their logic.
const CreateExamModal = (ExamModule as unknown as { CreateExamModal: ComponentType<{ campusId: string; role: 'TEACHER'; onClose: () => void; onCreated: () => void }> }).CreateExamModal;
type Request = { id: number; campus: string | null; aborted: boolean; cache: RequestCache | undefined };
declare global {
  interface Window {
    examClassFixture: {
      requests: Request[]; frames: { campus: string; disabled: boolean; options: string[] }[]; posts: unknown[]; ignoreAborts: boolean;
      resolve: (id: number, data: unknown, status?: number) => void; setScope: (campus: string) => void; setOpen: (open: boolean) => void;
    };
  }
}
const pending = new Map<number, (response: Response) => void>();
window.examClassFixture = { requests: [], frames: [], posts: [], ignoreAborts: false, setScope() {}, setOpen() {}, resolve(id, data, status = 200) { const finish = pending.get(id); if (!finish) throw new Error(`No pending request ${id}`); pending.delete(id); finish(Response.json(data, { status })); } };
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.href);
  if (url.pathname === '/api/classes') {
    const request: Request = { id: window.examClassFixture.requests.length + 1, campus: url.searchParams.get('campusId'), aborted: false, cache: init?.cache };
    window.examClassFixture.requests.push(request);
    return new Promise<Response>((resolve, reject) => {
      pending.set(request.id, resolve);
      init?.signal?.addEventListener('abort', () => { request.aborted = true; if (!window.examClassFixture.ignoreAborts) { pending.delete(request.id); reject(new DOMException('Aborted', 'AbortError')); } });
    });
  }
  if (url.pathname === '/api/exams') { window.examClassFixture.posts.push(JSON.parse(String(init?.body))); return Response.json({ success: true }); }
  throw new Error(`Unexpected fixture request ${url.pathname}`);
};
function Fixture() {
  const [campus, setCampus] = useState('north'); const [open, setOpen] = useState(true); const [created, setCreated] = useState(0);
  useEffect(() => { window.examClassFixture.setScope = setCampus; window.examClassFixture.setOpen = setOpen; }, []);
  useLayoutEffect(() => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')).find(button => button.textContent?.trim() === 'Create Test');
    window.examClassFixture.frames.push({ campus, disabled: button?.disabled ?? true, options: Array.from(document.querySelectorAll<HTMLOptionElement>('[role=dialog] select option')).map(option => option.value) });
  }, [campus, open]);
  return <StaticLocaleProvider value={defaultLocale}><p role="status">Created: {created}</p>{open && <CreateExamModal campusId={campus} role="TEACHER" onClose={() => setOpen(false)} onCreated={() => setCreated(value => value + 1)} />}</StaticLocaleProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
