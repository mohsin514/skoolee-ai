"use client";
import { useListField } from "@/hooks/use-list-field";

import { Button, buttonVariants } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { UiText, useUiText, useLocaleFormat, useLocale } from "@/components/locale/LocaleProvider";
import { getFinancialLocale } from "@/app/actions/locale";
import { CURRENCIES } from "@/lib/locale/package";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  Banknote,
  Building2,
  CreditCard,
  Download,
  Landmark,
  Loader,
  MoreHorizontal,
  Pencil,
  Percent,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Undo2,
  Wallet,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { BrandButton, EmptyState, StatCard } from "@/components/role-dashboard";
import { ReviewedDeleteDialog } from "@/components/ui/reviewed-delete";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ModalActions, FormInput, FormSelect } from "@/components/shared-admin";
import { Modal } from "@/components/ui/modal";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { formatPKR, forwardCommand, paisaToRupees, rupeesToPaisa, usePanelCommand } from "@/components/fees/fee-utils";
import type { PanelCommand } from "@/components/fees/fee-types";
import { SectionPicker } from "@/components/operations/console-page";
import { Select as SystemSelect } from "@/components/ui/select";
import { Input as SystemInput } from "@/components/ui/input";

const API = "/api";
const inputClass = "w-full";
const labelClass = "block mb-2 ps-2 text-2xs font-semibold uppercase tracking-wider text-ink-subtle";

export type AccountsTabKey = "chart" | "methods" | "banks" | "income" | "expense" | "profit";

/** Accounts & ledger sections (also the accountant's PageHeader tabs). */
export const ACCOUNTS_TABS: { id: AccountsTabKey; label: string }[] = [
  { id: "chart", label: "Chart of accounts" },
  { id: "methods", label: "Payment methods" },
  { id: "banks", label: "Bank accounts" },
  { id: "income", label: "Income" },
  { id: "expense", label: "Expense" },
  { id: "profit", label: "Profit" },
];

/** The section a `?tab=` value opens (unknown values open the chart of accounts). */
export function accountsSection(tab: string | null | undefined): AccountsTabKey {
  return ACCOUNTS_TABS.some((item) => item.id === tab) ? (tab as AccountsTabKey) : "chart";
}

/**
 * The PageHeader primary for each Accounts & ledger section (role-ux §4.4b; EN UI keys). The profit report has
 * none: "Run report" is the report's own filter action.
 */
export const ACCOUNTS_CREATE: Record<AccountsTabKey, string | null> = {
  chart: "Add account",
  methods: "New payment method",
  banks: "New bank account",
  income: "Record income",
  expense: "Record expense",
  profit: null,
};

/**
 * Accounts & ledger. `tab`/`onTabChange` let a console persist the section as `?tab=`. `command` "create" (the
 * accountant's PageHeader primary, role-ux §4.4b; label `ACCOUNTS_CREATE[section]`) runs the open section's create
 * action, and "add-account" opens the chart of accounts with the new-account form. `hideHeader` removes the
 * sections' own create buttons so the screen has one primary action (the empty state may still repeat it, §4.5.7).
 */
export function AccountsTab({ campusId, command, hideHeader = false, tab, onTabChange, sectionNav = "picker" }: { campusId?: string; command?: PanelCommand | null; hideHeader?: boolean; tab?: string | null; onTabChange?: (tab: AccountsTabKey) => void; sectionNav?: "picker" | "none" }) {
  const [localTab, setLocalTab] = useState<AccountsTabKey>("chart");
  const active: AccountsTabKey = ACCOUNTS_TABS.some((item) => item.id === tab) ? (tab as AccountsTabKey) : onTabChange ? "chart" : localTab;
  // A header command for another section first opens the section it belongs to. Changing section (here or in the
  // console's PageHeader tabs) drops it, so a section opened later never replays an old command.
  // Each forwarded command is tagged with the section it is for and reaches only that section.
  const [forwarded, setForwarded] = useState<{ section: AccountsTabKey; command: PanelCommand } | null>(null);
  const select = (next: AccountsTabKey) => { setLocalTab(next); onTabChange?.(next); setForwarded(null); };
  const forward = (section: AccountsTabKey, id?: string) => { const copy = forwardCommand(command, id); setForwarded(copy ? { section, command: copy } : null); };
  usePanelCommand(command, {
    "add-account": () => { select("chart"); forward("chart", "create"); },
    create: () => forward(active),
    // "Export ledger" (accountant PageHeader): the income, expense and profit sections export their filtered rows.
    export: () => forward(active),
  });
  const panel = { campusId, command: forwarded?.section === active ? forwarded.command : null, hideCreate: hideHeader };

  return (
    <div className="space-y-5">
      {/* One tab row per screen (§3.1): the accountant console shows these as PageHeader tabs ("none"); inside the
          campus admin's Fees tabs they are a section picker. */}
      {sectionNav === "picker" ? <SectionPicker label="Accounts section" items={ACCOUNTS_TABS} value={active} onChange={select} /> : null}

      {active === "chart" && <ChartPanel {...panel} />}
      {active === "methods" && <MethodsPanel {...panel} />}
      {active === "banks" && <BanksPanel {...panel} />}
      {active === "income" && <EntriesPanel {...panel} kind="INCOME" />}
      {active === "expense" && <EntriesPanel {...panel} kind="EXPENSE" />}
      {active === "profit" && <ProfitPanel {...panel} />}
    </div>
  );
}

type SectionProps = { campusId?: string; command?: PanelCommand | null; hideCreate?: boolean };

/* ── Chart of Accounts ─────────────────────────────────── */

interface AccountRow {
  id: string;
  name: string;
  type: string;
  isSystem: boolean;
  isActive?: boolean;
  _count?: { entries: number };
}

const TYPE_TONES: Record<string, "info" | "warning" | "secondary" | "success" | "danger"> = {
  ASSET: "info",
  LIABILITY: "warning",
  EQUITY: "secondary",
  INCOME: "success",
  EXPENSE: "danger",
};

function ChartPanel({ campusId, command, hideCreate = false }: SectionProps) {
  const tr = useUiText();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("INCOME");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<AccountRow | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch(`${API}/accounts/chart${qp}`);
      const json = await res.json();
      if (json.success) setAccounts(json.data);
      else setLoadFailed(true);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [qp]);

  useEffect(() => { load(); }, [load]);

  const openModal = (row: AccountRow | null) => {
    setEditing(row);
    setName(row?.name ?? "");
    setType(row?.type ?? "INCOME");
    setShowModal(true);
  };
  usePanelCommand(command, { create: () => openModal(null), "add-account": () => openModal(null) }, !loading);

  const handleSave = async () => {
    if (!name.trim()) { toast.error(tr("Name is required")); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/accounts/chart`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing ? { id: editing.id, name: name.trim(), type }
            : { campusId: campusId || undefined, name: name.trim(), type }
        ),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(tr(json.message || "Account saved"));
        setShowModal(false);
        load();
      } else {
        toast.error(tr(json.error || "Failed to save"));
      }
    } catch {
      toast.error(tr("Failed to save account"));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: AccountRow) => {
    try {
      const res = await fetch(`${API}/accounts/chart`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, isActive: row.isActive === false }) });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) { toast.success(row.isActive === false ? tr("Account reactivated") : tr("Account deactivated. Its history stays in reports.")); load(); }
      else toast.error(tr(json.error || "Failed to save"));
    } catch {
      toast.error(tr("Failed to save account"));
    }
  };


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="sk-eyebrow mb-1"><UiText>{"Chart of accounts"}</UiText></p>
          <p className="text-sm font-bold text-ink-strong"><UiText>{"Bookkeeping heads used by the ledger"}</UiText></p>
          <p className="text-xs leading-relaxed text-ink-muted mt-0.5"><UiText>{"Fee income auto-posts to \"Fee Income\" and payroll to \"Salaries Expense\". Accounts with entries keep their type and cannot be deleted; deactivate them to stop new entries."}</UiText></p>
        </div>
        {hideCreate ? null : <Button onClick={() => openModal(null)}><Plus className="size-4" aria-hidden="true" /><UiText>{"Add account"}</UiText></Button>}
      </div>

      {loading ? (
        <SkeletonRows />
      ) : loadFailed ? (
        <ErrorState title={tr("Accounts could not be loaded")} description={tr("Check your connection and try again.")} onRetry={() => void load()} />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={tr("No accounts yet")}
          description={tr("Create account heads to organise income and expense entries.")}
          action={<Button onClick={() => openModal(null)}><Plus className="size-4" aria-hidden="true" /><UiText>{"Add account"}</UiText></Button>}
        />
      ) : (
        <div className="space-y-3">
          {accounts.map((acc) => (
            <div key={acc.id} className="sk-panel flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap sm:gap-4 sm:p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Wallet className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold text-ink-strong">
                  <span className="min-w-0 truncate">{acc.name}</span>
                  {acc.isSystem ? <Badge variant="neutral" size="sm"><UiText>{"System"}</UiText></Badge> : null}
                  {acc.isActive === false ? <Badge variant="warning" size="sm" dot data-account-inactive><UiText>{"Inactive"}</UiText></Badge> : null}
                </p>
                <p className="text-xs tabular-nums text-ink-subtle mt-0.5">
                  {acc._count ? tr("{0} entries", [acc._count.entries]) : ""}
                </p>
              </div>
              <Badge size="sm" variant={TYPE_TONES[acc.type] ?? "neutral"}>
                {acc.type}
              </Badge>
              {/* Row overflow (role-ux §4.5.2–3): Edit · Deactivate/Reactivate · Delete (last, danger, confirmed).
                  An account with entries is kept for audit, so it offers Deactivate and explains why it cannot be deleted. */}
              <RowMenu
                items={[
                  { id: "edit", label: "Edit", icon: Pencil, onSelect: () => openModal(acc) },
                  ...(!acc.isSystem && (acc._count?.entries ?? 0) > 0
                    ? [{ id: "toggle", label: acc.isActive === false ? "Reactivate" : "Deactivate", icon: acc.isActive === false ? Undo2 : Archive, onSelect: () => void toggleActive(acc) }]
                    : []),
                  (acc._count?.entries ?? 0) > 0
                    ? { id: "delete", label: "Delete", icon: Trash2, tone: "danger" as const, disabled: true, description: "Accounts with entries are kept for audit; deactivate instead." }
                    : { id: "delete", label: "Delete", icon: Trash2, tone: "danger" as const, onSelect: () => setDeleting(acc) },
                ]}
              />
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? tr("Edit account") : tr("New account")} eyebrow={tr("Accounts · Chart")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormInput label={tr("Account name")} value={name} placeholder={tr("e.g. Library Fee")} onChange={setName} />
            <label>
              <span className={labelClass}><UiText>{"Type"}</UiText></span>
              <SystemSelect value={type} onChange={(e) => setType(e.target.value)} className="w-full" disabled={Boolean(editing && ((editing._count?.entries ?? 0) > 0 || editing.isSystem))}>
                <option value="INCOME"><UiText>{"Income"}</UiText></option>
                <option value="EXPENSE"><UiText>{"Expense"}</UiText></option>
                <option value="ASSET"><UiText>{"Asset"}</UiText></option>
                <option value="LIABILITY"><UiText>{"Liability"}</UiText></option>
                <option value="EQUITY"><UiText>{"Equity"}</UiText></option>
              </SystemSelect>
              <span className="mt-1 block text-xs leading-relaxed text-ink-subtle">{editing && ((editing._count?.entries ?? 0) > 0 || editing.isSystem) ? tr("The type is locked because this account is a system account or already has entries.") : tr("Income and expense heads are used for ledger entries. The type cannot be changed once the account has entries.")}</span>
            </label>
            <ModalActions busy={saving} busyLabel={tr("Saving...")} actionLabel={editing ? tr("Save changes") : tr("Create account")} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </Modal>
      )}

      {deleting && (
        <ReviewedDeleteDialog endpoint="accounts/chart" record={{ id: deleting.id, campusId }} label={deleting.name} onCancel={() => setDeleting(null)} onDeleted={load} />
      )}
    </div>
  );
}

/* ── Payment Methods ───────────────────────────────────── */

interface MethodRow {
  id: string;
  name: string;
  isActive: boolean;
}

function MethodsPanel({ campusId, command, hideCreate = false }: SectionProps) {
  const tr = useUiText();
  const [methods, setMethods] = useState<MethodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MethodRow | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<MethodRow | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch(`${API}/accounts/payment-methods${qp}`);
      const json = await res.json();
      if (json.success) setMethods(json.data);
      else setLoadFailed(true);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [qp]);

  useEffect(() => { load(); }, [load]);

  const openModal = (row: MethodRow | null) => {
    setEditing(row);
    setName(row?.name ?? "");
    setShowModal(true);
  };
  usePanelCommand(command, { create: () => openModal(null) }, !loading);

  const handleSave = async () => {
    if (!name.trim()) { toast.error(tr("Name is required")); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/accounts/payment-methods`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, name: name.trim() } : { campusId: campusId || undefined, name: name.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(tr(json.message || "Payment method saved"));
        setShowModal(false);
        load();
      } else {
        toast.error(tr(json.error || "Failed to save"));
      }
    } catch {
      toast.error(tr("Failed to save payment method"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (m: MethodRow) => {
    try {
      const res = await fetch(`${API}/accounts/payment-methods`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, isActive: !m.isActive }),
      });
      const json = await res.json();
      if (json.success) toast.success(tr(m.isActive ? "Method deactivated" : "Method activated"));
      else toast.error(tr(json.error || "Failed to toggle"));
      load();
    } catch {
      toast.error(tr("Failed to toggle method"));
    }
  };


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle mb-1"><UiText>{"Payment methods"}</UiText></p>
          <p className="text-sm font-bold text-ink-strong"><UiText>{"Labels used on receipts and ledger entries"}</UiText></p>
        </div>
        {hideCreate ? null : <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New payment method"}</UiText></BrandButton>}
      </div>

      {loading ? (
        <SkeletonRows />
      ) : loadFailed ? (
        <ErrorState title={tr("Payment methods could not be loaded")} description={tr("Check your connection and try again.")} onRetry={() => void load()} />
      ) : methods.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={tr("No payment methods")}
          description={tr("Add methods like cash, bank transfer, cheque — used on receipts.")}
          action={<BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New payment method"}</UiText></BrandButton>}
        />
      ) : (
        <div className="space-y-3">
          {methods.map((m) => (
            <div key={m.id} className="sk-panel p-5 flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CreditCard className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink-strong">{m.name}</p>
                <p className="text-2xs font-bold text-ink-subtle mt-0.5">{m.isActive ? tr("Active") : tr("Inactive")}</p>
              </div>
              <Button aria-pressed={m.isActive} variant="choice"
                type="button"
                onClick={() => handleToggle(m)}
                className={`px-3 py-1.5 ${""} `}
              >
                {m.isActive ? tr("Active") : tr("Inactive")}
              </Button>
              <RowMenu
                items={[
                  { id: "edit", label: "Edit", icon: Pencil, onSelect: () => openModal(m) },
                  { id: "delete", label: "Delete", icon: Trash2, tone: "danger", onSelect: () => setDeleting(m) },
                ]}
              />
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? tr("Edit payment method") : tr("New payment method")} eyebrow={tr("Accounts · Methods")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormInput label={tr("Name")} value={name} placeholder={tr("e.g. Cash")} onChange={setName} />
            <ModalActions busy={saving} busyLabel={tr("Saving...")} actionLabel={editing ? tr("Save changes") : tr("Create method")} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </Modal>
      )}

      {deleting && (
        <ReviewedDeleteDialog endpoint="accounts/payment-methods" record={{ id: deleting.id, campusId }} label={deleting.name} onCancel={() => setDeleting(null)} onDeleted={load} />
      )}
    </div>
  );
}

/* ── Bank Accounts ─────────────────────────────────────── */

interface BankRow {
  currency: string;
  id: string;
  name: string;
  bankName?: string | null;
  accountNumber?: string | null;
  openingBalance: number;
  isActive: boolean;
}

function BanksPanel({ campusId, command, hideCreate = false }: SectionProps) {
  const [currency, setCurrency] = useState<string>(useLocale().currency);
  const [defaultCurrency, setDefaultCurrency] = useState("");
  useEffect(() => { void getFinancialLocale(campusId).then(policy => setDefaultCurrency(policy.currency)); }, [campusId]);
 const { money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  const [banks, setBanks] = useState<BankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<BankRow | null>(null);
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<BankRow | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch(`${API}/accounts/bank-accounts${qp}`);
      const json = await res.json();
      if (json.success) setBanks(json.data);
      else setLoadFailed(true);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [qp]);

  useEffect(() => { load(); }, [load]);

  const openModal = (row: BankRow | null) => {
    setEditing(row);
    setName(row?.name ?? "");
    setBankName(row?.bankName ?? "");
    setAccountNumber(row?.accountNumber ?? "");
    setCurrency(row?.currency || defaultCurrency);
    setOpeningBalance(row ? String(paisaToRupees(row.openingBalance, row.currency)) : "");
    setShowModal(true);
  };
  usePanelCommand(command, { create: () => openModal(null) }, !loading);

  const handleSave = async () => {
    if (!name.trim()) { toast.error(tr("Name is required")); return; }
    if (!currency) { toast.error(tr("Currency could not be loaded")); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/accounts/bank-accounts`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : { campusId: campusId || undefined }),
          name: name.trim(),
          bankName: bankName.trim() || undefined,
          accountNumber: accountNumber.trim() || undefined,
          currency,
          openingBalance: rupeesToPaisa(openingBalance || "0", currency),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(tr(json.message || "Bank account saved"));
        setShowModal(false);
        load();
      } else {
        toast.error(tr(json.error || "Failed to save"));
      }
    } catch {
      toast.error(tr("Failed to save bank account"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (b: BankRow) => {
    try {
      const res = await fetch(`${API}/accounts/bank-accounts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id, isActive: !b.isActive }),
      });
      const json = await res.json();
      if (json.success) toast.success(tr(b.isActive ? "Bank deactivated" : "Bank activated"));
      else toast.error(tr(json.error || "Failed to toggle"));
      load();
    } catch {
      toast.error(tr("Failed to toggle bank"));
    }
  };


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle mb-1"><UiText>{"Bank accounts"}</UiText></p>
          <p className="text-sm font-bold text-ink-strong"><UiText>{"Deposit accounts entries can be attributed to"}</UiText></p>
        </div>
        {hideCreate ? null : <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New bank account"}</UiText></BrandButton>}
      </div>

      {loading ? (
        <SkeletonRows />
      ) : loadFailed ? (
        <ErrorState title={tr("Bank accounts could not be loaded")} description={tr("Check your connection and try again.")} onRetry={() => void load()} />
      ) : banks.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={tr("No bank accounts")}
          description={tr("Add a bank account to attribute ledger entries to it.")}
          action={<BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New bank account"}</UiText></BrandButton>}
        />
      ) : (
        <div className="space-y-3">
          {banks.map((b) => (
            <div key={b.id} className="sk-panel p-5 flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink-strong">{b.name}</p>
                <p className="text-2xs font-bold text-ink-subtle mt-0.5">
                  {[b.bankName, b.accountNumber].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <div className="text-end">
                <p className="text-2xs font-semibold uppercase text-ink-subtle"><UiText>{"Opening balance"}</UiText></p>
                <p className="text-sm font-bold tabular-nums text-ink-strong">{formatPKR(b.openingBalance, b.currency)}</p>
              </div>
              <Button aria-pressed={b.isActive} variant="choice"
                type="button"
                onClick={() => handleToggle(b)}
                className={`px-3 py-1.5 ${""} `}
              >
                {b.isActive ? tr("Active") : tr("Inactive")}
              </Button>
              <RowMenu
                items={[
                  { id: "edit", label: "Edit", icon: Pencil, onSelect: () => openModal(b) },
                  { id: "delete", label: "Delete", icon: Trash2, tone: "danger", onSelect: () => setDeleting(b) },
                ]}
              />
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? tr("Edit bank account") : tr("New bank account")} eyebrow={tr("Accounts · Banks")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormInput label={tr("Account name")} value={name} placeholder={tr("e.g. Main School Account")} onChange={setName} />
            <FormInput label={tr("Bank name")} value={bankName} placeholder={tr("e.g. HBL")} onChange={setBankName} />
            <FormInput label={tr("Account number")} value={accountNumber} placeholder={tr("e.g. {0}", ["1234-5678-90"])} onChange={setAccountNumber} />
            <FormInput label={`${tr("Opening balance")} (${currency})`} type="number" value={openingBalance} placeholder="0" onChange={setOpeningBalance} />
            <ModalActions busy={saving} busyLabel={tr("Saving...")} actionLabel={editing ? tr("Save changes") : tr("Create bank account")} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </Modal>
      )}

      {deleting && (
        <ReviewedDeleteDialog endpoint="accounts/bank-accounts" record={{ id: deleting.id, campusId }} label={deleting.name} onCancel={() => setDeleting(null)} onDeleted={load} />
      )}
    </div>
  );
}

/* ── Income / Expense entries ──────────────────────────── */
// SKO-468: filters stay visible; totals come from the server for exactly the filtered rows (not the
// loaded page); the export uses the same filter; posted entries are corrected, never edited.

interface LedgerRow {
  currency: string;
  id: string;
  kind: string;
  sourceName: string;
  amount: number;
  date: string;
  paymentMethod?: string | null;
  note?: string | null;
  paymentId?: string | null;
  payrollLineId?: string | null;
  reversalOfId?: string | null;
  source: "MANUAL" | "FEE" | "PAYROLL" | "CORRECTION";
  account: { id: string; name: string; type: string; isActive?: boolean };
  bankAccount?: { id: string; name: string } | null;
  payment?: { receiptNo: string | null; invoiceId: string | null } | null;
  payrollLine?: { id: string; payrollRun: { month: number; year: number } } | null;
  reversedBy?: { id: string; date: string } | null;
  reversalOf?: { id: string; sourceName: string; date: string } | null;
}
type LedgerTotals = { income: number; expense: number; net: number; incomeCount: number; expenseCount: number; count: number };

const SOURCE_LABEL: Record<LedgerRow["source"], string> = { MANUAL: "Manual", FEE: "Fee payment", PAYROLL: "Payroll", CORRECTION: "Correction" };
const PAGE_SIZE = 50;

function EntriesPanel({ campusId, kind, command, hideCreate = false }: SectionProps & { kind: "INCOME" | "EXPENSE" }) {
  const { money, date: formatDate } = useLocaleFormat();
  // Until the ledger reports its currency, amounts are in the campus currency (locale package, R7).
  const { currency: campusCurrency } = useLocale();
  const tr = useUiText();
  const [currency, setCurrency] = useState("");
  const [from, setFrom] = useListField<string>(`ledger.${kind}.from`, "", `ledger.${kind}.page`);
  const [to, setTo] = useListField<string>(`ledger.${kind}.to`, "", `ledger.${kind}.page`);
  const [filterAccount, setFilterAccount] = useListField<string>(`ledger.${kind}.filterAccount`, "", `ledger.${kind}.page`);
  const [source, setSource] = useListField<string>(`ledger.${kind}.source`, "", `ledger.${kind}.page`);
  const [status, setStatus] = useListField<string>(`ledger.${kind}.status`, "all", `ledger.${kind}.page`);
  const [page, setPage] = useListField<number>(`ledger.${kind}.page`, 1, `ledger.${kind}.page`);
  const [entries, setEntries] = useState<LedgerRow[]>([]);
  const [totals, setTotals] = useState<LedgerTotals | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [banks, setBanks] = useState<BankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleting, setDeleting] = useState<LedgerRow | null>(null);
  const [correcting, setCorrecting] = useState<LedgerRow | null>(null);
  const [reason, setReason] = useState(""), [correctionError, setCorrectionError] = useState(""), [acting, setActing] = useState(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);

  const filterParams = useCallback(() => {
    const params = new URLSearchParams({ kind });
    if (campusId) params.set("campusId", campusId);
    if (currency) params.set("currency", currency);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (filterAccount) params.set("accountId", filterAccount);
    if (source) params.set("source", source);
    if (status !== "all") params.set("status", status);
    return params;
  }, [campusId, kind, currency, from, to, filterAccount, source, status]);
  const filtered = Boolean(from || to || filterAccount || source || status !== "all");

  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadError("");
    try {
      const params = filterParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      const scope = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";
      const [eRes, aRes, bRes] = await Promise.all([
        fetch(`${API}/accounts/ledger?${params}`, { cache: "no-store" }),
        fetch(`${API}/accounts/chart${scope}`, { cache: "no-store" }),
        fetch(`${API}/accounts/bank-accounts${scope}`, { cache: "no-store" }),
      ]);
      const [eJson, aJson, bJson] = await Promise.all([eRes.json().catch(() => ({})), aRes.json().catch(() => ({})), bRes.json().catch(() => ({}))]);
      if (version !== requestVersion.current) return;
      if (!eRes.ok || !eJson.success) throw new Error(eRes.status === 403 ? tr("You do not have access to the ledger for this campus.") : eJson.error || tr("Failed to load ledger"));
      setEntries(eJson.data);
      setTotals(eJson.totals);
      if (eJson.page !== page) setPage(eJson.page);
      if (!currency) setCurrency(eJson.currency);
      if (aJson.success) setAccounts(aJson.data);
      if (bJson.success) setBanks(bJson.data);
    } catch (failure) {
      if (version !== requestVersion.current) return;
      setLoadError(failure instanceof Error ? tr(failure.message) : tr("Failed to load ledger"));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [filterParams, page, campusId, currency, tr]);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => { clearTimeout(timer); requestVersion.current++; }; }, [load]);

  const openNew = () => { setFormError(""); setShowModal(true); };
  // "Export ledger" in the accountant's PageHeader downloads exactly the filtered rows (the same filter as the list).
  usePanelCommand(command, { create: openNew, export: () => { const params = filterParams(); params.set("format", "csv"); window.location.assign(`${API}/accounts/ledger?${params}`); } });
  const handleSave = async () => {
    setFormError("");
    if (sourceName.trim().length < 3 || !accountId || !amount || Number(amount) <= 0 || !date) {
      setFormError(tr("Enter a description, account, amount greater than zero and date."));
      return;
    }
    const payload = { campusId: campusId || undefined, kind, sourceName: sourceName.trim(), accountId, currency, amount: rupeesToPaisa(amount, currency || campusCurrency), date, bankAccountId: bankAccountId || undefined, note: note.trim() || undefined };
    const fingerprint = JSON.stringify(payload);
    // A retry of the same entry reuses its key, so a lost response never posts the money twice.
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    setSaving(true);
    try {
      const res = await fetch(`${API}/accounts/ledger`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, idempotencyKey: attempt.current.key }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) { setFormError(tr(json.error || "The entry was not saved. Your details are kept; try again.")); return; }
      toast.success(json.replayed ? tr("This entry was already recorded; nothing was posted twice.") : tr("Entry recorded"));
      attempt.current = null;
      setShowModal(false);
      setSourceName(""); setAmount(""); setBankAccountId(""); setNote("");
      void load();
    } catch {
      setFormError(tr("The connection failed before the server answered. Your details are kept; retrying will not post twice."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setActing(true);
    try {
      const res = await fetch(`${API}/accounts/ledger?id=${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) { toast.success(tr("Entry deleted")); setDeleting(null); void load(); }
      else toast.error(tr(json.error || "Failed to delete"));
    } catch {
      toast.error(tr("Failed to delete entry"));
    } finally { setActing(false); }
  };

  const handleCorrect = async () => {
    if (!correcting) return;
    if (reason.trim().length < 5) { setCorrectionError(tr("Explain why this entry is being corrected (5–500 characters).")); return; }
    setActing(true);
    setCorrectionError("");
    try {
      const res = await fetch(`${API}/accounts/ledger`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: correcting.id, action: "reverse", reason: reason.trim() }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) { setCorrectionError(tr(json.error || "The correction was not posted.")); return; }
      toast.success(tr("Correction posted. The original entry is kept and now shows as reversed."));
      setCorrecting(null); setReason(""); void load();
    } catch {
      setCorrectionError(tr("The connection failed. Retrying is safe: an entry is only corrected once."));
    } finally { setActing(false); }
  };

  const pickList = accounts.filter((a) => a.type === kind);
  const activePickList = pickList.filter((a) => a.isActive !== false);
  const shownCurrency = currency || campusCurrency;
  const kindTotal = totals ? (kind === "INCOME" ? totals.income : totals.expense) : 0;
  const pages = totals ? Math.max(1, Math.ceil(totals.count / PAGE_SIZE)) : 1;
  const exportParams = filterParams(); exportParams.set("format", "csv");
  const setFilter = (apply: () => void) => { apply(); };

  return (
    <div className="space-y-4" data-ledger-panel={kind}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle mb-1">{kind === "INCOME" ? tr("Income entries") : tr("Expense entries")}</p>
          <p className="text-sm font-bold text-ink-strong" data-ledger-total={kindTotal} aria-live="polite">
            <span className={kind === "INCOME" ? "text-status-success-text" : "text-status-error-text"}><bdi>{money(kindTotal, shownCurrency)}</bdi></span>{" "}
            {tr("total across {0} matching records", [totals?.count ?? 0])}
          </p>
          <p className="text-2xs font-semibold text-ink-subtle mt-0.5" data-ledger-scope>
            {tr("{0} only · {1} to {2} · corrections are negative rows that offset the entry they reverse.", [shownCurrency, from ? formatDate(from) : tr("first entry"), to ? formatDate(to) : tr("today")])}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hideCreate ? null : <a className={buttonVariants({ variant: "outline" })} href={`${API}/accounts/ledger?${exportParams}`} data-ledger-export><Download className="w-4 h-4" aria-hidden="true" />{tr("Export these rows (CSV)")}</a>}
          {hideCreate ? null : <BrandButton icon={<Plus className="w-4 h-4" />} onClick={openNew}>{kind === "INCOME" ? tr("Record income") : tr("Record expense")}</BrandButton>}
        </div>
      </div>

      <fieldset className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3 rounded-2xl border border-border p-3" data-ledger-filters>
        <legend className="px-1 text-2xs font-semibold uppercase tracking-wider text-ink-subtle">{tr("Filters")}</legend>
        <label className="text-xs font-bold">{tr("Currency")}<SystemSelect aria-label={tr("Currency")} value={currency} onChange={(e) => setFilter(() => setCurrency(e.target.value))} className="w-full">{CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}</SystemSelect></label>
        <label className="text-xs font-bold">{tr("From")}<SystemInput type="date" value={from} onChange={(e) => setFilter(() => setFrom(e.target.value))} className="w-full" /></label>
        <label className="text-xs font-bold">{tr("To")}<SystemInput type="date" value={to} onChange={(e) => setFilter(() => setTo(e.target.value))} className="w-full" /></label>
        <label className="text-xs font-bold">{tr("Account")}<SystemSelect value={filterAccount} onChange={(e) => setFilter(() => setFilterAccount(e.target.value))} className="w-full"><option value="">{tr("All accounts")}</option>{pickList.map((a) => <option key={a.id} value={a.id}>{a.name}{a.isActive === false ? ` (${tr("inactive")})` : ""}</option>)}</SystemSelect></label>
        <label className="text-xs font-bold">{tr("Source")}<SystemSelect value={source} onChange={(e) => setFilter(() => setSource(e.target.value))} className="w-full"><option value="">{tr("All sources")}</option>{(Object.keys(SOURCE_LABEL) as LedgerRow["source"][]).map((key) => <option key={key} value={key}>{tr(SOURCE_LABEL[key])}</option>)}</SystemSelect></label>
        <label className="text-xs font-bold">{tr("Status")}<SystemSelect value={status} onChange={(e) => setFilter(() => setStatus(e.target.value))} className="w-full"><option value="all">{tr("All")}</option><option value="open">{tr("Posted, not corrected")}</option><option value="reversed">{tr("Corrected and corrections")}</option></SystemSelect></label>
      </fieldset>

      {loading ? (
        <div role="status" aria-label={tr("Loading ledger")}><SkeletonRows /></div>
      ) : loadError ? (
        <div data-ledger-error>
          <ErrorState description={loadError} onRetry={() => void load()} retryLabel={tr("Retry")} />
        </div>
      ) : entries.length === 0 ? (
        filtered ? (
          <EmptyState icon={kind === "INCOME" ? TrendingUp : TrendingDown} title={tr("No entries match these filters")} description={tr("Clear or widen the filters to see more of the ledger.")} action={<Button variant="secondary" onClick={() => { setFrom(""); setTo(""); setFilterAccount(""); setSource(""); setStatus("all"); setPage(1); }}>{tr("Clear filters")}</Button>} />
        ) : (
          <EmptyState
            icon={kind === "INCOME" ? TrendingUp : TrendingDown}
            title={kind === "INCOME" ? tr("No income entries") : tr("No expense entries")}
            description={kind === "INCOME" ? tr("Fee collections post here automatically. Add other income manually.") : tr("Payroll posts here when salaries are paid. Add other expenses manually.")}
            action={<BrandButton icon={<Plus className="w-4 h-4" />} onClick={openNew}>{kind === "INCOME" ? tr("Record income") : tr("Record expense")}</BrandButton>}
          />
        )
      ) : (
        <>
          <ul className="space-y-3" aria-label={kind === "INCOME" ? tr("Income entries") : tr("Expense entries")}>
            {entries.map((e) => {
              const reference = e.payment?.receiptNo ? tr("Receipt {0}", [e.payment.receiptNo]) : e.payrollLine ? tr("Payroll {0}/{1}", [e.payrollLine.payrollRun.month, e.payrollLine.payrollRun.year]) : e.reversalOf ? tr("Corrects “{0}” of {1}", [e.reversalOf.sourceName, formatDate(e.reversalOf.date)]) : "";
              const correctable = e.source === "MANUAL" && !e.reversedBy;
              return (
                <li key={e.id} className="sk-panel p-5 flex flex-wrap items-center gap-4" data-ledger-row={e.id} data-ledger-source={e.source} data-ledger-reversed={e.reversedBy ? "true" : "false"}>
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${e.kind === "INCOME" ? "bg-status-success-surface text-status-success-text" : "bg-status-error-surface text-status-error-text"}`}>
                    {e.kind === "INCOME" ? <TrendingUp className="w-5 h-5" aria-hidden="true" /> : <TrendingDown className="w-5 h-5" aria-hidden="true" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink-strong break-words"><bdi>{e.sourceName}</bdi></p>
                    <p className="text-2xs font-bold text-ink-subtle mt-0.5">
                      <span className="rounded bg-muted px-1.5 py-0.5">{tr(SOURCE_LABEL[e.source])}</span>
                      {" · "}<bdi>{e.account.name}</bdi>{e.account.isActive === false ? ` (${tr("inactive")})` : ""}
                      {e.bankAccount ? <> · <bdi>{e.bankAccount.name}</bdi></> : null}
                      {" · "}{formatDate(e.date)}
                      {reference ? <> · <bdi>{reference}</bdi></> : null}
                    </p>
                    {e.reversedBy ? <p className="text-2xs font-bold text-status-warning-text mt-0.5">{tr("Corrected on {0}; the original stays for audit.", [formatDate(e.reversedBy.date)])}</p> : null}
                    {e.note ? <p className="text-2xs font-semibold text-ink-subtle mt-0.5"><bdi>{e.note}</bdi></p> : null}
                  </div>
                  <p className={`text-sm font-bold ${e.amount < 0 ? "text-ink-muted" : e.kind === "INCOME" ? "text-status-success-text" : "text-status-error-text"}`}><bdi>{money(e.amount, e.currency)}</bdi></p>
                  {correctable && (
                    <Button variant="secondary" size="sm" type="button" onClick={() => { setReason(""); setCorrectionError(""); setCorrecting(e); }} aria-label={tr("Correct entry {0}", [e.sourceName])}>
                      <Undo2 className="w-4 h-4" aria-hidden="true" />{tr("Correct")}
                    </Button>
                  )}
                  {correctable && (
                    <Button variant="secondary" size="icon" type="button" onClick={() => setDeleting(e)} className="flex items-center justify-center" aria-label={tr("Delete entry {0}", [e.sourceName])}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {pages > 1 && (
            <nav className="flex items-center justify-between gap-2 text-xs font-bold" aria-label={tr("Ledger pages")}>
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tr("Previous")}</Button>
              <span>{tr("Page {0} of {1}", [page, pages])}</span>
              <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>{tr("Next")}</Button>
            </nav>
          )}
        </>
      )}

      {showModal && (
        <Modal
          title={kind === "INCOME" ? tr("Record income") : tr("Record expense")}
          eyebrow={tr("Accounts · Ledger")}
          subtitle={kind === "INCOME" ? tr("Money received by the school. It increases income for {0}.", [shownCurrency]) : tr("Money paid out by the school. It increases expense for {0}.", [shownCurrency])}
          onClose={() => setShowModal(false)}
          dirty={Boolean(sourceName || amount || note)}
        >
          <div className="space-y-4">
            {formError ? <p role="alert" className="rounded-xl bg-status-error-surface px-3 py-2 text-xs font-bold text-status-error-text" data-ledger-form-error>{formError}</p> : null}
            <FormInput label={tr("Source / Description")} value={sourceName} placeholder={kind === "INCOME" ? tr("e.g. Donation") : tr("e.g. Electricity bill")} onChange={setSourceName} />
            <FormSelect label={tr("Account")} value={accountId} onChange={setAccountId}>
              <option value=""><UiText>{"Select account..."}</UiText></option>
              {activePickList.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </FormSelect>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
              <FormInput label={`${tr("Amount")} (${shownCurrency})`} type="number" value={amount} placeholder="0" onChange={setAmount} />
              <FormInput label={tr("Date")} type="date" value={date} placeholder="2026-08-09" onChange={setDate} />
            </div>
            <label>
              <span className={labelClass}><UiText>{"Bank account (optional)"}</UiText></span>
              <SystemSelect value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className="w-full">
                <option value=""><UiText>{"— None —"}</UiText></option>
                {banks.filter((b) => b.isActive && b.currency === currency).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </SystemSelect>
            </label>
            <FormInput label={tr("Note (optional)")} value={note} placeholder={tr("Extra detail")} onChange={setNote} />
            <ModalActions busy={saving} busyLabel={tr("Saving...")} actionLabel={kind === "INCOME" ? tr("Record income") : tr("Record expense")} onClose={() => setShowModal(false)} onSave={() => void handleSave()} hint={tr("Posted entries are not edited. Mistakes are fixed with a correction that keeps the original.")} />
          </div>
        </Modal>
      )}

      {correcting && (
        <ConfirmAction
          open
          title={tr("Correct this entry?")}
          description={tr("A correction of {0} is posted today against {1}. “{2}” dated {3} stays in the ledger, marked as corrected.", [money(-correcting.amount, correcting.currency), correcting.account.name, correcting.sourceName, formatDate(correcting.date)])}
          detail={<div className="space-y-2">
            <label className="block text-xs font-bold" htmlFor="ledger-correction-reason">{tr("Reason for the correction")}</label>
            <SystemInput id="ledger-correction-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} aria-invalid={Boolean(correctionError)} aria-describedby={correctionError ? "ledger-correction-error" : undefined} />
            {correctionError ? <p id="ledger-correction-error" role="alert" className="text-xs font-bold text-status-error-text">{correctionError}</p> : null}
          </div>}
          confirmLabel={tr("Post correction")}
          tone="warning"
          busy={acting}
          onConfirm={() => handleCorrect()}
          onCancel={() => setCorrecting(null)}
        />
      )}

      {deleting && (
        <ConfirmAction
          open
          title={tr("Delete entry?")}
          description={tr("\"{0}\" ({1}) will be removed. Entries in a reconciled bank period cannot be deleted; correct them instead.", [deleting.sourceName, money(deleting.amount, deleting.currency)])}
          confirmLabel={tr("Delete")}
          tone="danger"
          busy={acting}
          onConfirm={() => handleDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/* ── Profit report ─────────────────────────────────────── */

type ProfitReport = { currency: string; from: string; to: string; income: number; expense: number; net: number; incomeCount: number; expenseCount: number; count: number; breakdown: { accountId: string; accountName: string; accountActive: boolean; type: string; amount: number; entries: number }[]; bySource: Record<string, { income: number; expense: number; count: number }>; otherCurrencies: { currency: string; entries: number }[] };

function ProfitPanel({ campusId, command, hideCreate = false }: SectionProps) {
  const { money, date: formatDate } = useLocaleFormat();
  const tr = useUiText();
  const [currency, setCurrency] = useState("");
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [report, setReport] = useState<ProfitReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async () => {
    if (!from || !to) { setError(tr("Select a date range")); return; }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to, ...(currency ? { currency } : {}) });
      if (campusId) params.set("campusId", campusId);
      const res = await fetch(`${API}/accounts/profit?${params}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) { setReport(json.data); if (!currency) setCurrency(json.data.currency); }
      else setError(tr(json.error || "Failed to load report"));
    } catch {
      setError(tr("Failed to load report"));
    } finally {
      setLoading(false);
    }
  }, [from, to, campusId, currency, tr]);

  useEffect(() => { const timer = setTimeout(() => void run(), 0); return () => clearTimeout(timer); }, [run]);

  const exportParams = new URLSearchParams({ from, to, ...(currency ? { currency } : {}), ...(campusId ? { campusId } : {}), format: "csv" });
  // "Export ledger" in the accountant's PageHeader downloads the rows behind this report (same filter).
  usePanelCommand(command, { export: () => window.location.assign(`${API}/accounts/ledger?${exportParams}`) });

  return (
    <div className="space-y-4" data-profit-panel>
      <div className="flex items-end gap-3 flex-wrap">
        <label className="text-xs font-bold">{tr("Currency")}<SystemSelect aria-label={tr("Currency")} value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full">{CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}</SystemSelect></label>
        <label>
          <span className={labelClass}><UiText>{"From"}</UiText></span>
          <SystemInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full" />
        </label>
        <label>
          <span className={labelClass}><UiText>{"To"}</UiText></span>
          <SystemInput type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full" />
        </label>
        <BrandButton icon={<Percent className="w-4 h-4" />} onClick={() => void run()} disabled={loading}>
          {loading ? <Loader className="w-4 h-4 animate-spin" /> : tr("Run report")}
        </BrandButton>
        {hideCreate ? null : <a className={buttonVariants({ variant: "outline" })} href={`${API}/accounts/ledger?${exportParams}`} data-profit-export><Download className="w-4 h-4" aria-hidden="true" />{tr("Export the rows behind this report (CSV)")}</a>}
      </div>

      {error ? (
        <ErrorState title={tr("The report could not be loaded")} description={error} onRetry={() => void run()} retryLabel={tr("Retry")} />
      ) : !report ? (
        loading ? <div role="status" aria-label={tr("Loading report")}><SkeletonRows /></div> : <EmptyState icon={TrendingUp} title={tr("Run the report")} description={tr("Pick a date range to see income, expense and net profit.")} />
      ) : (
        <div className="space-y-4">
          <p className="rounded-2xl bg-muted px-4 py-3 text-xs font-semibold text-ink" data-profit-basis>
            {tr("Cash basis, {0} only, {1} to {2} inclusive. Includes fee payments and refunds, paid payroll, manual entries and corrections recorded in this period; unpaid invoices and draft payroll are not included. Totals are the sum of the {3} rows in the export.", [report.currency, formatDate(report.from), formatDate(report.to), report.count])}
          </p>
          {report.otherCurrencies.length > 0 ? (
            <p className="rounded-2xl border border-status-warning-border bg-status-warning-surface px-4 py-3 text-xs font-bold text-status-warning-text" data-profit-other-currencies>
              {tr("This period also has entries in {0}. They are reported separately and never added to {1} totals.", [report.otherCurrencies.map((row) => `${row.currency} (${row.entries})`).join(", "), report.currency])}
            </p>
          ) : null}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-profit-totals data-income={report.income} data-expense={report.expense} data-net={report.net}>
            <StatCard icon={TrendingUp} label={tr("Income")} value={money(report.income, report.currency)} tone="green" />
            <StatCard icon={TrendingDown} label={tr("Expense")} value={money(report.expense, report.currency)} tone="rose" />
            <StatCard icon={Banknote} label={tr("Net profit")} value={money(report.net, report.currency)} tone={report.net < 0 ? "rose" : "purple"} />
          </div>

          {Object.keys(report.bySource).length > 0 ? (
            <table className="w-full text-xs" data-profit-sources>
              <caption className="text-start text-2xs font-semibold uppercase tracking-wider text-ink-subtle pb-2">{tr("By source")}</caption>
              <thead><tr className="text-start text-ink-subtle"><th scope="col" className="text-start py-1">{tr("Source")}</th><th scope="col" className="text-end">{tr("Income")}</th><th scope="col" className="text-end">{tr("Expense")}</th><th scope="col" className="text-end">{tr("Rows")}</th></tr></thead>
              <tbody>{Object.entries(report.bySource).map(([key, row]) => <tr key={key} className="border-t border-border"><th scope="row" className="text-start py-1.5 font-bold">{tr(SOURCE_LABEL[key as LedgerRow["source"]] ?? key)}</th><td className="text-end"><bdi>{money(row.income, report.currency)}</bdi></td><td className="text-end"><bdi>{money(row.expense, report.currency)}</bdi></td><td className="text-end">{row.count}</td></tr>)}</tbody>
            </table>
          ) : null}

          {report.breakdown.length > 0 ? (
            <div className="space-y-3">
              {report.breakdown.map((b) => (
                <div key={`${b.accountId}-${b.type}`} className="sk-panel p-5 flex items-center gap-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${b.type === "INCOME" ? "bg-status-success-surface text-status-success-text" : "bg-status-error-surface text-status-error-text"}`}>
                    {b.type === "INCOME" ? <TrendingUp className="w-5 h-5" aria-hidden="true" /> : <TrendingDown className="w-5 h-5" aria-hidden="true" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink-strong"><bdi>{b.accountName}</bdi>{b.accountActive ? "" : ` (${tr("inactive")})`}</p>
                    <p className="text-2xs font-bold text-ink-subtle mt-0.5">{tr("{0} entries", [b.entries])}</p>
                  </div>
                  <p className={`text-sm font-bold ${b.type === "INCOME" ? "text-status-success-text" : "text-status-error-text"}`}><bdi>{money(b.amount, report.currency)}</bdi></p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Banknote} title={tr("No ledger activity")} description={tr("No income or expense in this period.")} />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Shared ────────────────────────────────────────────── */

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="sk-panel p-5 animate-skeleton-in" style={{ animationDelay: `${i * 80}ms` }}>
          <div className="flex items-start justify-between mb-3">
            <div className="space-y-2">
              <div className="h-4 w-28 rounded-full bg-border-subtle/50 skeleton-shimmer" />
              <div className="h-3 w-40 rounded-full bg-border-subtle/40 skeleton-shimmer" />
            </div>
            <div className="h-8 w-8 rounded-xl bg-border-subtle/40 skeleton-shimmer" />
          </div>
          <div className="h-12 rounded-xl bg-muted/50 skeleton-shimmer" />
        </div>
      ))}
    </div>
  );
}

/** One row overflow menu (role-ux §4.5.2–3); item labels are EN UI keys, translated by `Menu`. */
function RowMenu({ items }: { items: MenuItem[] }) {
  const tr = useUiText();
  return (
    <Menu
      label="More actions"
      items={items}
      trigger={<IconButton variant="ghost" label={tr("More actions")}><MoreHorizontal aria-hidden="true" /></IconButton>}
    />
  );
}
