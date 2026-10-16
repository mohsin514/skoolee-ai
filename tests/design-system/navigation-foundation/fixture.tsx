import { useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarCheck, FileText, Wallet, Users, Layers } from 'lucide-react';
import { RoleShell } from '../../../src/components/role-dashboard/RoleShell';
import { TeacherCommandPalette } from '../../../src/components/teacher/command-palette';
import { TEACHER_NAV } from '../../../src/components/teacher/teacher-page';
import { StaticLocaleProvider, useUiText } from '../../../src/components/locale/LocaleProvider';
import { defaultLocale, type Language } from '../../../src/lib/locale/package';
import { useNavigationAccess } from '../../../src/components/nav/NavigationAccess';
import { Button } from '../../../src/components/ui/button';
import { Input } from '../../../src/components/ui/input';
import { FormField, FormErrorSummary } from '../../../src/components/ui/form-field';
import { ModalSurface } from '../../../src/components/ui/modal';
import { usePathname, navigate } from './navigation-mock';
import { TeacherDataProvider, useTeacherData } from '../../../src/app/teacher/teacher-data-context';
import { useWorkspaceView } from '../../../src/components/nav/useWorkspaceView';
import { Checkbox } from '../../../src/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../src/components/ui/table';

const language = document.documentElement.lang as Language;
const role = new URLSearchParams(location.search).get('role') || 'parent';
const remote = new URLSearchParams(location.search).has('remote');
const copy = {
  en: { name: 'Record name', required: 'Enter a record name', review: 'Review changes', save: 'Save example changes', reviewTitle: 'Review example changes', saved: 'Example changes saved', admissions: 'Admissions', reports: 'Reports', fees: 'Fees', scope: 'Synthetic North campus · 2026–27', consequence: 'Updates this synthetic record only. Nothing is sent to families.' },
  ar: { name: 'اسم السجل', required: 'أدخل اسم السجل', review: 'مراجعة التغييرات', save: 'حفظ تغييرات المثال', reviewTitle: 'مراجعة تغييرات المثال', saved: 'تم حفظ تغييرات المثال', admissions: 'القبول', reports: 'التقارير', fees: 'الرسوم', scope: 'الحرم الشمالي التجريبي · 2026–27', consequence: 'يحدث هذا السجل التجريبي فقط. لا يُرسل شيء إلى الأسر.' },
  ur: { name: 'ریکارڈ کا نام', required: 'ریکارڈ کا نام درج کریں', review: 'تبدیلیوں کا جائزہ', save: 'مثالی تبدیلیاں محفوظ کریں', reviewTitle: 'مثالی تبدیلیوں کا جائزہ', saved: 'مثالی تبدیلیاں محفوظ ہو گئیں', admissions: 'داخلے', reports: 'رپورٹس', fees: 'فیس', scope: 'فرضی شمالی کیمپس · 2026–27', consequence: 'صرف یہ فرضی ریکارڈ تبدیل ہوگا۔ خاندانوں کو کچھ نہیں بھیجا جائے گا۔' },
}[language];
const teacherData = { classHubs: [{ id: 'class-one', name: 'Grade 5', section: 'A', academicYear: '2026–27' }], students: [{ id: 'student-one', fullName: 'Synthetic Restricted Pupil', guardianName: 'Synthetic Guardian', class: { id: 'class-one', name: 'Grade 5', section: 'A' } }] };
const DOMAINS = ['admissions', 'reports', 'fees'] as const;
function Workspace() {
  const t = useUiText(); const pathname = usePathname(); const access = useNavigationAccess();
  const [draft, setDraft] = useState(''); const [error, setError] = useState(false); const [review, setReview] = useState(false); const [saved, setSaved] = useState(false);
  const [domain, setDomain] = useWorkspaceView(DOMAINS, 'reports'); const [selected, setSelected] = useState(false); const fieldRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => { const target = window as unknown as { accessFrames?: unknown[] }; (target.accessFrames ??= []).push({ pathname, status: access.status, students: access.allows('students') }); }, [pathname, access.status, access.access]);
  return <section className="sk-panel min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
    <h1 className="text-2xl font-bold">{copy[domain]}</h1><p className="text-sm text-ink-muted">{copy.scope}</p>
    <div className="flex flex-wrap gap-2" aria-label="Synthetic equivalent workflows">{(['admissions','reports','fees'] as const).map(value => <Button key={value} variant="outline" onClick={() => { setDomain(value); setDraft(''); setError(false); setSaved(false); }}>{copy[value]}</Button>)}</div>
    <form className="max-w-lg space-y-4" onSubmit={event => { event.preventDefault(); if (!draft.trim()) { setError(true); fieldRef.current?.focus(); } else { setError(false); setReview(true); } }}>
      {error && <FormErrorSummary errors={{ record: copy.required }} />}
      <FormField name="record" label={copy.name} hint={copy.scope} error={error ? copy.required : undefined} required><Input ref={fieldRef} value={draft} onChange={event => setDraft(event.target.value)} /></FormField>
      <Button type="submit">{copy.review}</Button><Button variant="outline" type="button" disabled>{t('Delete')}</Button>
    </form>
    {saved && <p role="status">{copy.saved}</p>}
    <Table><TableHeader><TableRow><TableHead>{t('Select')}</TableHead><TableHead>{copy[domain]}</TableHead><TableHead>{t('Actions')}</TableHead></TableRow></TableHeader><TableBody><TableRow data-state={selected ? 'selected' : undefined}><TableCell><label className="inline-flex min-h-11 min-w-11 items-center justify-center"><Checkbox aria-label={`${t('Select')} ${copy[domain]}`} checked={selected} onChange={event => setSelected(event.target.checked)} /></label></TableCell><TableCell><bdi>SYN-2026-001</bdi></TableCell><TableCell><Button variant="outline" onClick={() => { setDraft('SYN-2026-001'); fieldRef.current?.focus(); }}>{t('Open')}</Button></TableCell></TableRow></TableBody></Table>

    {role === 'teacher' && <><Button variant="outline" onClick={() => navigate('/teacher/students')}>Synthetic route transition</Button><TeacherCommandPalette data={teacherData} /></>}
    {review && <ModalSurface ariaLabel={copy.reviewTitle} onClose={() => setReview(false)}><div className="space-y-4 p-5"><h2 className="text-xl font-bold">{copy.reviewTitle}</h2><p>{copy.scope}</p><p>{copy.consequence}</p><p><bdi>{draft}</bdi></p><Button onClick={() => { setReview(false); setSaved(true); }}>{copy.save}</Button><Button variant="outline" onClick={() => setReview(false)}>{t('Back')}</Button></div></ModalSurface>}
  </section>;
}
const parentItems = [{ label: 'Results', icon: FileText, href: '/parent/results' }, { label: 'Attendance', icon: CalendarCheck, href: '/parent/attendance' }, { label: 'Fees', icon: Wallet, href: '/parent/fees' }, { label: 'Hidden group', icon: Layers, children: [{ label: 'Unavailable students', icon: Users, href: '/parent/students', available: false }] }];
const access = remote ? undefined : { reports: true, attendance: true, fees: false, students: false, exams: false, timetable: false, ai: false, schoolAi: false, schoolAiExams: false };
function TeacherScopeProbe() {
  const { data, loading, error, refetch } = useTeacherData();
  return <main><h1>Teacher scope lifecycle fixture</h1><p role="status">{loading ? 'Checking current scope' : 'Scope loaded'}</p>{error && <p role="alert">{error}</p>}{data && <p data-testid="scoped-roster">{data.teacherName}</p>}<Button onClick={() => refetch()}>Refetch scope</Button></main>;
}
function TeacherScopeFixture() {
  const [scope, setScope] = useState('north');
  return <><Button onClick={() => setScope(value => value === 'north' ? 'south' : 'north')}>Switch scoped provider</Button><TeacherDataProvider key={scope}><TeacherScopeProbe /></TeacherDataProvider></>;
}
const QUERY_VIEWS = ['reports', 'fees'] as const;
function QueryAccessContent({ view }: { view: typeof QUERY_VIEWS[number] }) {
  const access = useNavigationAccess();
  const [draft, setDraft] = useState('Preserved console draft');
  const [cachedRecord] = useState('Private cached fee record');
  useLayoutEffect(() => {
    const target = window as unknown as { queryAccessFrames?: unknown[] };
    const record = document.querySelector('[data-testid=cached-fee-record]');
    (target.queryAccessFrames ??= []).push({ view, status: access.status, fees: access.allows('fees'), visible: Boolean(record?.getClientRects().length) });
  }, [view, access.status, access.access]);
  return <section><h1>{view === 'reports' ? 'Reports workspace' : 'Fees workspace'}</h1><Input aria-label="Console draft" value={draft} onChange={event => setDraft(event.target.value)} />{view === 'fees' && <p data-testid="cached-fee-record">{cachedRecord}</p>}</section>;
}
function QueryAccessFixture() {
  const [view, setView] = useWorkspaceView(QUERY_VIEWS, 'reports');
  return <StaticLocaleProvider value={{ ...defaultLocale, language }}><RoleShell userRole="PRINCIPAL" userName="Synthetic reviewer" navItems={[
    { label: 'Reports', icon: FileText, module: 'reports', active: view === 'reports', onClick: () => setView('reports') },
    { label: 'Fees', icon: Wallet, module: 'fees', active: view === 'fees', onClick: () => setView('fees') },
  ]}><QueryAccessContent view={view} /></RoleShell></StaticLocaleProvider>;
}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('query-access') ? <QueryAccessFixture /> : new URLSearchParams(location.search).has('provider') ? <TeacherScopeFixture /> : <StaticLocaleProvider value={{ ...defaultLocale, language }}><RoleShell tagline="Synthetic International School" userName="Synthetic reviewer" userRole={role === 'parent' ? 'PARENT' : 'TEACHER'} navigationAccess={access} navItems={role === 'teacher' ? TEACHER_NAV : parentItems}><Workspace /></RoleShell></StaticLocaleProvider>);
