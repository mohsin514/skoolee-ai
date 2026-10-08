"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, CheckCheck, ClipboardList, FileText, Home, Mail, Search, Settings, ShieldCheck } from "lucide-react";
import { RoleSidebar, type SidebarEntry } from "@/components/role-dashboard/RoleSidebar";
import { NavigationAccessProvider, NavigationAccessNotice } from "@/components/nav/NavigationAccess";
import { Checkbox } from "@/components/ui/checkbox";
import styles from "./reference.module.css";
import { PageCard } from "@/components/ui/page-card";
import { cardSurface } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatePicker, type DatePickerMessages } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField, FormErrorSummary } from "@/components/ui/form-field";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TaskHeader, TaskFeedback, TaskLoading, TaskStatus } from "@/components/ui/task-patterns";

// Synthetic Arabic locale example; real callers supply school/user settings.
const ARABIC_CALENDAR: DatePickerMessages = {
  openCalendar: (field) => `اختيار ${field}`, dialogTitle: 'اختيار التاريخ', title: 'اختر تاريخًا', close: 'إغلاق التقويم',
  selected: 'التاريخ المحدد', unselected: 'لم يتم تحديد تاريخ', chooseDay: 'اختر يومًا أدناه',
  previousMonth: 'الشهر السابق', nextMonth: 'الشهر التالي', days: 'أيام الشهر', today: 'اليوم', cancel: 'إلغاء',
  keyboardHelp: 'استخدم الأسهم للتنقل بين الأيام، وHome وEnd للتنقل داخل الأسبوع، وPage Up وPage Down لتغيير الشهر. اضغط Shift لتغيير السنة.',
};
const ACCESS = { reports: true, attendance: true, fees: false };
const TASKS = [
  { id: 'REF-021', task: 'Review report batch', owner: 'Academic office', due: 'Today', state: 'Needs review' },
  { id: 'REF-022', task: 'Check attendance', owner: 'Class teacher', due: '09:00', state: 'One class missing' },
  { id: 'REF-023', task: 'Resolve delivery', owner: 'School office', due: 'Today', state: 'Delivery unconfirmed' },
];
const INITIAL = { name: 'Autumn report review', campus: '', date: '2026-10-12', reason: 'Review the current report version before release.' };
const DRAFT_KEY = 'skoolee.reference.F61.synthetic-draft';
type View = 'queue' | 'form' | 'family';
type State = 'ready' | 'empty' | 'loading' | 'error' | 'permission' | 'success';

/** Local, synthetic interaction fixture. No school APIs or real records are called. */
export function DesignSystemReference({ liveAccess = false }: { liveAccess?: boolean }) {
  const [view, setView] = useState<View>('queue');
  const [state, setState] = useState<State>('ready');
  const [rtl, setRtl] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState(false);
  const [failCommit, setFailCommit] = useState(false);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('screen') === 'form') setView('form');
    if (params.get('screen') === 'family') setView('family');
    setRtl(params.get('rtl') === '1');
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
      if (draft && Object.keys(INITIAL).every((key) => typeof draft[key] === 'string')) setForm(draft);
    } catch { /* A blocked store does not prevent the manual task. */ }
  }, []);
  useEffect(() => {
    const previous = document.documentElement.dir;
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    return () => { document.documentElement.dir = previous; };
  }, [rtl]);
  const navigate = (next: View) => { setView(next); setState('ready'); setNotice(''); requestAnimationFrame(() => heading.current?.focus()); };
  const nav: SidebarEntry[] = [
    { lang: rtl ? 'ar' : undefined, label: rtl ? 'مساحة العمل' : 'Workspace', icon: Home, active: view === 'queue', onClick: () => navigate('queue') },
    { lang: rtl ? 'ar' : undefined, label: rtl ? 'مراجعة' : 'Review', icon: FileText, active: view === 'form', onClick: () => navigate('form'), module: 'reports' },
    { lang: rtl ? 'ar' : undefined, label: rtl ? 'الأسرة' : 'Family view', icon: BookOpen, active: view === 'family', onClick: () => navigate('family') },
    { label: 'Unavailable fees', icon: Settings, href: '/parent/fees' },
  ];
  const rows = TASKS.filter((row) => `${row.task} ${row.state}`.toLowerCase().includes(search.toLowerCase()));
  const saveDraft = () => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form)); setNotice('Example draft saved in this tab. Nothing has been published.'); }
    catch { setNotice('Draft could not be stored. Keep this tab open; your entries are still here.'); }
  };
  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Enter a record name.';
    if (!form.campus) next.campus = 'Choose a campus to continue.';
    if (!form.date) next.date = 'Choose an effective date.';
    if (!form.reason.trim()) next.reason = 'Explain the change.';
    setErrors(next);
    if (Object.keys(next).length) requestAnimationFrame(() => document.getElementById(`field-${Object.keys(next)[0]}`)?.focus());
    else setReview(true);
  };
  const toggleRow = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  return <NavigationAccessProvider access={liveAccess ? undefined : ACCESS}>
    <div dir={rtl ? 'rtl' : 'ltr'} className={`${styles.reference} min-h-dvh bg-background text-foreground`}>
      <RoleSidebar taglineLang={rtl ? 'ar' : undefined} tagline={rtl ? 'مدرسة تجريبية' : 'Northstar School · Example'} items={nav} collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
      <main className={`${styles.canvas} min-w-0 p-4 pb-28 sm:p-8 sm:pb-28 ${collapsed ? 'md:ms-[72px]' : 'md:ms-64'}`}>
        <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border/60 pb-4 text-xs text-ink-muted">
          <strong className="font-semibold">F61 · Synthetic reference</strong><span className="text-ink-muted">No real school records</span>
          <label className="flex min-h-11 cursor-pointer items-center gap-2"><Checkbox checked={rtl} onChange={(event) => setRtl(event.target.checked)} />Arabic / RTL layout</label>
          <label className="flex min-w-0 flex-wrap items-center gap-2">State <Select aria-label="Reference state" value={state} onChange={(event) => setState(event.target.value as State)} className="min-h-11 w-auto max-w-full rounded-xl bg-white/60 text-sm font-medium shadow-none">{['ready','empty','loading','error','permission','success'].map((value) => <option key={value}>{value}</option>)}</Select></label>
        </div>
        <PageCard className={styles.pageCard}>
        <div ref={heading} tabIndex={-1} className={styles.hero}>
          <TaskHeader scope={rtl ? <span lang="ar">مدرسة تجريبية / الحرم الشمالي / الفصل الأول</span> : 'Northstar School / North campus / Autumn 2026'}
            title={view === 'queue' ? (rtl ? <span lang="ar">مهام تحتاج إلى مراجعة</span> : 'Work that needs attention') : view === 'form' ? (rtl ? <span lang="ar">مراجعة تغييرات السجل</span> : 'Review record changes') : 'Your next step'}
            description={view === 'queue' ? 'Review the source record before changing a school outcome.' : view === 'form' ? 'Example draft · Editing this reference does not change a report or release results.' : 'A phone-first family reference. Only published information belongs here.'}
            action={view === 'queue' ? <Button disabled={state !== 'ready'} onClick={() => navigate('form')}>{rtl ? 'مراجعة التالي' : 'Review next'}<ArrowRight aria-hidden="true" className="rtl:rotate-180" /></Button> : <Button variant="outline" onClick={() => navigate('queue')}>Back to workspace</Button>} />
        </div>
        {view === 'queue' && <ol aria-label="School record workflow" className={styles.workflow}>
          {[{ label: 'Review', detail: 'Check the source', icon: FileText }, { label: 'Approval', detail: 'Authorized decision', icon: ShieldCheck }, { label: 'Publication', detail: 'Release the result', icon: BookOpen }, { label: 'Delivery', detail: 'Confirm receipt', icon: CheckCheck }].map((step, index) => <li key={step.label}><span className={styles.stepIcon}><step.icon aria-hidden="true" /></span><span><span className={styles.stepLabel}>{step.label}</span><span className={styles.stepDetail}>{step.detail}</span></span><span aria-hidden="true" className={styles.stepNumber}>0{index + 1}</span></li>)}
        </ol>}
        <NavigationAccessNotice />
        {notice && <p role="status" className={`mb-4 ${cardSurface} p-4 text-sm`}>{notice}</p>}
        {state === 'loading' && <TaskLoading label="Loading tasks" />}
        {state === 'empty' && <TaskFeedback kind="empty" title="No tasks need review">Change your filters or return when new work is assigned.</TaskFeedback>}
        {state === 'error' && <TaskFeedback kind="error" title="Tasks could not be loaded" action={<Button variant="outline" onClick={() => setState('ready')}>Retry</Button>}>Your filters and draft have been kept.</TaskFeedback>}
        {state === 'permission' && <TaskFeedback kind="permission" title="This workspace is unavailable">Choose an available section or contact your school administrator.</TaskFeedback>}
        {state === 'success' && <TaskFeedback kind="success" title="Example changes saved" action={<Button variant="outline" onClick={() => { setState('ready'); navigate('queue'); }}>Return to workspace</Button>}>Reference receipt <bdi>REF-021 · version 4</bdi>. No report was published and no message was sent.</TaskFeedback>}
        {state === 'ready' && view === 'queue' && <>
          <section aria-label="Task filters" className={`${styles.filters} mb-6 grid gap-5 p-5 sm:p-6 sm:grid-cols-3`}>
            <FormField name="search" label={<span className="flex items-center gap-2"><Search aria-hidden="true" className="h-4 w-4" />Search tasks</span>}><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Task or status" /></FormField>
            <FormField name="period" label="Academic period"><Select defaultValue="autumn"><option value="autumn">Autumn 2026</option></Select></FormField>
            <FormField name="responsibility" label="Responsibility"><Select defaultValue="all"><option value="all">All assigned work</option></Select></FormField>
          </section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-3 text-lg font-bold">Assigned work <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-primary/10 px-2 text-xs text-primary">{rows.length}</span></h2><p role="status" className="text-sm text-ink-muted">{selected.length} selected · Selection does not approve records</p></div>
          {!rows.length ? <TaskFeedback kind="empty" title="No matching tasks" action={<Button variant="outline" onClick={() => setSearch('')}>Clear search</Button>} /> : <>
          <div className={`${styles.taskTable} hidden md:block`}><Table>
            <caption className="sr-only">Synthetic assigned tasks</caption>
            <TableHeader><TableRow><TableHead scope="col">Select</TableHead><TableHead scope="col">Task / source</TableHead><TableHead scope="col">Responsible team</TableHead><TableHead scope="col">Due</TableHead><TableHead scope="col">State</TableHead><TableHead scope="col"><span className="sr-only">Action</span></TableHead></TableRow></TableHeader>
            <TableBody>{rows.map((row, index) => {
              const Icon = row.id === 'REF-021' ? FileText : row.id === 'REF-022' ? ClipboardList : Mail;
              return <TableRow key={row.id} data-state={selected.includes(row.id) ? 'selected' : undefined} className={styles.taskRow}>
                <TableCell className="w-16"><label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl"><Checkbox aria-label={`Select ${row.task}`} checked={selected.includes(row.id)} onChange={() => toggleRow(row.id)} /></label></TableCell>
                <TableCell><div className="flex items-center gap-3"><span aria-hidden="true" className={`${styles.taskIcon} ${index === 1 ? styles.taskIconTeal : index === 2 ? styles.taskIconAmber : ''}`}><Icon /></span><div><p className="font-bold text-foreground">{row.task}</p><p className="mt-1 text-xs text-ink-muted"><bdi>{row.id}</bdi> · Source record</p></div></div></TableCell>
                <TableCell className="text-sm text-ink-muted">{row.owner}</TableCell><TableCell><span className={styles.due}>{row.due}</span></TableCell>
                <TableCell><TaskStatus attention>{row.state}</TaskStatus></TableCell>
                <TableCell><Button type="button" variant="ghost" size="icon" aria-label={`Open ${row.task}`} className={styles.rowAction} onClick={() => { setForm({ ...INITIAL, name: row.task }); navigate('form'); }}><ArrowRight className="rtl:rotate-180" /></Button></TableCell>
              </TableRow>;
            })}</TableBody>
          </Table></div>
          <div className="space-y-3 md:hidden">{rows.map((row) => <article key={row.id} className={`space-y-4 ${cardSurface} p-5 sm:p-6`}><label className="flex min-h-11 cursor-pointer items-center gap-3"><Checkbox checked={selected.includes(row.id)} onChange={() => toggleRow(row.id)} /><span className="font-semibold">{row.task}</span></label><p className="text-sm">Owner: {row.owner} · Due: {row.due}</p><TaskStatus attention>{row.state}</TaskStatus><div><Button variant="outline" onClick={() => { setForm({ ...INITIAL, name: row.task }); navigate('form'); }}>Open task</Button></div></article>)}</div></>}
          <p className="mt-5 text-sm text-ink-muted">Review, approval, publication and delivery are separate stages.</p>
        </>}
        {state === 'ready' && view === 'form' && <form noValidate onSubmit={(event) => { event.preventDefault(); validate(); }} className={styles.formLayout}>
          <FormErrorSummary errors={errors} className="xl:col-span-2" />
          <section className={`space-y-5 ${cardSurface} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-5"><div className="flex items-center gap-3"><span className={styles.taskIcon}><FileText aria-hidden="true" /></span><div><h2 className="text-lg font-bold">Draft details</h2><p className="mt-1 text-xs text-ink-muted">Prepare the record for review</p></div></div><TaskStatus>Not published</TaskStatus></div>
            <FormField name="name" label="Record name" required error={errors.name}><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></FormField>
            <div className="grid gap-5 sm:grid-cols-2"><FormField name="campus" label="Campus" required error={errors.campus} hint="Only campuses in your authorized scope appear."><Select value={form.campus} onChange={(event) => setForm({ ...form, campus: event.target.value })}><option value="">Choose campus</option><option value="north">North campus</option></Select></FormField>
            <FormField name="date" label="Effective date" required error={errors.date}>{rtl ? <DatePicker locale={rtl ? 'ar-EG' : 'en-US'} dir={rtl ? 'rtl' : 'ltr'} weekStartsOn={rtl ? 6 : 0} label={rtl ? 'تاريخ السريان' : 'Effective date'} messages={rtl ? ARABIC_CALENDAR : undefined} value={form.date} onValueChange={(date) => setForm({ ...form, date })} /> : <Input type="date" aria-label="Effective date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />}</FormField></div>
            <FormField name="reason" label="Reason for change" required error={errors.reason} hint="Explain the decision for the next reviewer."><Textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></FormField>
          </section>
          <section className={`${styles.impact} p-5 sm:p-6`}><span className={styles.taskIcon}><ShieldCheck aria-hidden="true" /></span><p className="mb-2 mt-5 text-xs font-bold uppercase tracking-widest text-primary">Before you save</p><h2 className="text-xl font-bold">Impact preview</h2><p className="mt-2 text-sm text-ink-muted">One example record will change from version 3 to version 4. School reviewers see it after a successful save. Families see no change.</p><p className="mt-2 text-sm">Source: <bdi>REF-021 · version 3</bdi></p></section>
          <div className={`${styles.formActions} flex flex-wrap gap-3`}><Button type="submit">Review changes<ArrowRight aria-hidden="true" className="rtl:rotate-180" /></Button><Button type="button" variant="outline" onClick={saveDraft}>Save draft</Button></div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm xl:col-span-2"><Checkbox checked={failCommit} onChange={(event) => setFailCommit(event.target.checked)} />Simulate a stale version on save</label>
        </form>}
        {state === 'ready' && view === 'family' && <div className="max-w-lg space-y-4"><section className={`space-y-4 ${cardSurface} p-5 sm:p-6`}><TaskStatus>Published example</TaskStatus><h2 className="text-xl font-semibold">Review the learning summary</h2><p className="text-sm text-ink-muted">Example pupil · Class 6 · Autumn 2026</p><p>Read the reviewed feedback, then discuss the next practice task with your child.</p><Button onClick={() => setNotice('Example summary opened. Opening is not acknowledgement or task completion.')}>Open summary</Button><p className="text-sm text-ink-muted">No payment module is enabled in this example.</p></section><TaskFeedback kind="permission" title="Another child is missing?">Ask your school to check the guardian link. Similar names do not establish access.</TaskFeedback></div>}
        </PageCard>
        <Dialog open={review} onOpenChange={setReview}><DialogContent>
          <DialogHeader><DialogTitle>Review example changes</DialogTitle><DialogDescription>North campus · Autumn 2026</DialogDescription></DialogHeader>
          <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-4 text-sm"><p><strong>{form.name}</strong></p><dl className="grid grid-cols-2 gap-3"><dt>Scope</dt><dd>North campus</dd><dt>Effective date</dt><dd><bdi>{form.date}</bdi></dd><dt>Version</dt><dd><bdi>3 → 4</bdi></dd></dl><p>{form.reason}</p><p className="rounded-xl bg-muted p-3">This saves only a synthetic example. It does not approve reports, publish results or notify families.</p></div>
          <DialogFooter><div className="flex flex-wrap justify-end gap-3"><Button variant="outline" onClick={() => setReview(false)}>Keep editing</Button><Button onClick={() => { setReview(false); if (failCommit) { setNotice('This record changed while you were editing. Your draft is kept. Compare the latest version before saving.'); } else { try { sessionStorage.removeItem(DRAFT_KEY); } catch {} setState('success'); } }}>Save example changes</Button></div></DialogFooter>
        </DialogContent></Dialog>
      </main>
    </div>
  </NavigationAccessProvider>;
}
