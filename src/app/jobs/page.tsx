"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LocaleProvider, useLocale } from "@/components/locale/LocaleProvider";
import { jobMessages } from "@/lib/jobs/messages";
import { outcomes } from "@/lib/jobs/contract";
import type { readJob, listJobs } from "@/lib/jobs/service";
type Detail = Awaited<ReturnType<typeof readJob>>;
type Summary = Awaited<ReturnType<typeof listJobs>>[number];
export default function JobsPage() {
  return (
    <LocaleProvider>
      <Jobs />
    </LocaleProvider>
  );
}
function Jobs() {
  const { language } = useLocale(),
    t = jobMessages[language];
  const [jobs, setJobs] = useState<Summary[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [id, setId] = useState(""),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [kind, setKind] = useState(""),
    [state, setState] = useState(""),
    [search, setSearch] = useState(""),
    [channel, setChannel] = useState(""),
    [campus, setCampus] = useState(""),
    [started, setStarted] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(id ? `/api/jobs/${id}` : "/api/jobs", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (id) setDetail(data);
      else setJobs(data.jobs);
      setError(false);
    } catch {
      setError(true);
    }
  }, [id]);
  useEffect(() => {
    setId(new URLSearchParams(location.search).get("id") || "");
    const pop = () =>
      setId(new URLSearchParams(location.search).get("id") || "");
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  const open = (next: string) => {
    setId(next);
    setDetail(null);
    setSelected([]);
    setSearch("");
    history.pushState({}, "", next ? `/jobs?id=${next}` : "/jobs");
  };
  const act = async (action: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/jobs/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, items: selected }),
      });
      if (!r.ok) throw new Error();
      setSelected([]);
      await refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const counts = detail?.counts;
  const input = "rounded-lg border p-3 min-w-0 bg-white text-slate-900";
  return (
    <main
      dir={language === "en" ? "ltr" : "rtl"}
      className="mx-auto max-w-6xl p-4 sm:p-8 space-y-5 text-slate-900 bg-slate-50 min-h-screen"
    >
      <header className="flex flex-wrap gap-4 items-center justify-between">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <button className={input} onClick={() => void refresh()}>
          {t.refresh}
        </button>
      </header>
      {error && (
        <p role="alert" className="rounded-xl bg-amber-100 p-4">
          {t.unknown}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <label>
          {t.search}
          <input
            className={input + " block"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          {t.filter}
          <select
            className={input + " block"}
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">{t.all}</option>
            {outcomes.map((s) => (
              <option key={s} value={s}>
                {t[s]}
              </option>
            ))}
          </select>
        </label>
        {!id && (
          <>
            <label>
              {t.filter}
              <select
                className={input + " block"}
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="">{t.all}</option>
                {(["REPORT_DELIVERY", "PDF", "IMPORT"] as const).map((k) => (
                  <option key={k} value={k}>
                    {t[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.campus}
              <select
                className={input + " block"}
                value={campus}
                onChange={(e) => setCampus(e.target.value)}
              >
                <option value="">{t.all}</option>
                {Array.from(
                  new Map(
                    jobs.map((j) => [
                      j.campus_id,
                      j.campus_label || j.campus_id,
                    ]),
                  ),
                ).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.started}
              <input
                className={input + " block"}
                type="date"
                value={started}
                onChange={(e) => setStarted(e.target.value)}
              />
            </label>
          </>
        )}
        {id && (
          <label>
            {t.channel}
            <select
              className={input + " block"}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="">{t.all}</option>
              <option>WHATSAPP</option>
              <option>EMAIL</option>
            </select>
          </label>
        )}
      </div>
      {!id ? (
        <section className="grid gap-4 md:grid-cols-2">
          {!jobs.length && !error && <p>{t.empty}</p>}
          {jobs
            .filter(
              (j) =>
                (!kind || j.kind === kind) &&
                (!state || j.counts[state as keyof typeof j.counts] > 0) &&
                j.source_label.toLowerCase().includes(search.toLowerCase()) &&
                j.campus_id.includes(campus) &&
                (!started || String(j.created_at) >= started),
            )
            .map((j) => (
              <button
                key={j.id}
                className="rounded-xl border bg-white p-5 text-start space-y-2"
                onClick={() => open(j.id)}
              >
                <strong>{j.source_label}</strong>
                <p>{t[j.kind as "PDF"]}</p>
                <p>
                  {t.completed}: {j.counts.completed} / {j.counts.total} ·{" "}
                  {t.failed}: {j.counts.failed}
                </p>
                <p dir="ltr" className="text-xs break-all">
                  {j.id}
                </p>
              </button>
            ))}
        </section>
      ) : (
        <>
          <button className={input} onClick={() => open("")}>
            {t.back}
          </button>
          {!detail && !error && <p role="status">{t.loading}</p>}
          {detail && (
            <>
              <h2 className="text-xl font-semibold">{detail.source_label}</h2>
              <Link href={detail.sourceHref} className="underline">
                {t.source}
              </Link>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {(["total", ...outcomes] as const).map((s) => (
                  <div key={s} className="bg-white rounded-xl border p-3">
                    <p>{t[s]}</p>
                    <strong className="text-xl">{counts?.[s]}</strong>
                  </div>
                ))}
              </div>
              <p role="status" aria-live="polite">
                {counts?.running
                  ? t.running
                  : counts?.queued
                    ? t.queued
                    : counts?.failed
                      ? t.failed
                      : counts?.cancelled
                        ? t.cancelled
                        : t.completed}
                {detail.cancel_requested_at ? ` · ${t.cancelRequested}` : ""}
              </p>
              <p className="text-sm">
                {t.updated}: <bdi dir="ltr">{detail.updatedAt}</bdi>
              </p>
              <p className="rounded-xl bg-blue-50 p-4">{t.cancelNote}</p>
              <div className="flex gap-3 flex-wrap">
                {detail.canEdit && (
                  <>
                    <button
                      className={input}
                      disabled={
                        busy ||
                        error ||
                        !selected.length ||
                        !!detail.cancel_requested_at
                      }
                      onClick={() => void act("retry")}
                    >
                      {busy ? t.working : t.retry} ({selected.length})
                    </button>
                    <button
                      className={input}
                      disabled={
                        busy ||
                        error ||
                        !!detail.cancel_requested_at ||
                        !(counts!.queued + counts!.running + counts!.failed)
                      }
                      onClick={() => void act("cancel")}
                    >
                      {t.cancel}
                    </button>
                  </>
                )}
                <button
                  className={input}
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(detail, null, 2)], {
                        type: "application/json",
                      }),
                    );
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `job-${id}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  {t.receipt}
                </button>
              </div>
              <section className="space-y-3">
                {detail.items
                  .filter(
                    (i) =>
                      (!state || i.state === state) &&
                      (!channel || i.channel === channel) &&
                      `${i.label} ${i.recipient || ""}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((i) => (
                    <article
                      key={i.id}
                      className="border rounded-xl p-4 bg-white space-y-2 break-words"
                    >
                      <div className="flex gap-3 items-start">
                        {detail.canEdit && i.canRetry && (
                          <input
                            className="mt-1 size-5"
                            type="checkbox"
                            aria-label={`${t.select}: ${i.label}`}
                            disabled={busy || error}
                            checked={selected.includes(i.id)}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, i.id]
                                  : selected.filter((x) => x !== i.id),
                              )
                            }
                          />
                        )}
                        <strong>{i.label}</strong>
                        <span>{t[i.state as "queued"]}</span>
                      </div>
                      {i.recipient && (
                        <p>
                          <bdi dir="ltr">
                            {i.channel}: {i.recipient}
                          </bdi>
                        </p>
                      )}
                      {i.version_id && (
                        <p>
                          {t.version}:{" "}
                          <bdi dir="ltr" className="break-all">
                            {i.version_id}
                          </bdi>
                        </p>
                      )}
                      {i.state === "failed" && (
                        <p>{t[i.category as keyof typeof t]}</p>
                      )}
                      {i.delivery_failed_at && (
                        <p>
                          {t.deliveryFailed}{" "}
                          <bdi dir="ltr">{String(i.delivery_failed_at)}</bdi>
                        </p>
                      )}
                      {i.channel && (
                        <dl className="grid sm:grid-cols-3 gap-2">
                          {(["accepted", "delivered", "read"] as const).map(
                            (s) => (
                              <div key={s}>
                                <dt>{t[s]}</dt>
                                <dd>
                                  <bdi dir="ltr">
                                    {String(i[`${s}_at`] || t.unavailable)}
                                  </bdi>
                                </dd>
                              </div>
                            ),
                          )}
                        </dl>
                      )}
                    </article>
                  ))}
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
