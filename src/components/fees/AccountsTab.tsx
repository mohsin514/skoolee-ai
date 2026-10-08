"use client";

import { Button } from "@/components/ui/button";
import { UiText, useUiText, useLocaleFormat } from "@/components/locale/LocaleProvider";
import { getFinancialLocale } from "@/app/actions/locale";
import { CURRENCIES } from "@/lib/locale/package";

import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  Building2,
  CreditCard,
  Landmark,
  Loader,
  Pencil,
  Percent,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { BrandButton, EmptyState, StatCard } from "@/components/role-dashboard";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ModalFrame, ModalActions, FormInput, FormSelect } from "@/components/shared-admin";
import { formatPKR, paisaToRupees, rupeesToPaisa } from "@/components/fees/fee-utils";
import { Select as SystemSelect } from "@/components/ui/select";
import { Input as SystemInput } from "@/components/ui/input";

const API = "/api";
const inputClass = "w-full";
const labelClass = "block mb-2 pl-2 text-[9px] font-black uppercase tracking-wider text-ink-subtle";

type AccountsTabKey = "chart" | "methods" | "banks" | "income" | "expense" | "profit";

const TABS: { key: AccountsTabKey; label: string }[] = [
  { key: "chart", label: "Chart of Accounts" },
  { key: "methods", label: "Payment Methods" },
  { key: "banks", label: "Bank Accounts" },
  { key: "income", label: "Income" },
  { key: "expense", label: "Expense" },
  { key: "profit", label: "Profit" },
];

export function AccountsTab({ campusId }: { campusId?: string }) {
  const [active, setActive] = useState<AccountsTabKey>("chart");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 rounded-2xl bg-[#f3f4f9] p-1 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = active === tab.key;
          return (
            <Button aria-pressed={isActive} variant="choice"
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={"justify-start " + (`flex items-center gap-1.5 px-4 py-2 whitespace-nowrap ${
                ""
              } `)}
            >
              {tab.label}
            </Button>
          );
        })}
      </div>

      {active === "chart" && <ChartPanel campusId={campusId} />}
      {active === "methods" && <MethodsPanel campusId={campusId} />}
      {active === "banks" && <BanksPanel campusId={campusId} />}
      {active === "income" && <EntriesPanel campusId={campusId} kind="INCOME" />}
      {active === "expense" && <EntriesPanel campusId={campusId} kind="EXPENSE" />}
      {active === "profit" && <ProfitPanel campusId={campusId} />}
    </div>
  );
}

/* ── Chart of Accounts ─────────────────────────────────── */

interface AccountRow {
  id: string;
  name: string;
  type: string;
  isSystem: boolean;
  _count?: { entries: number };
}

const TYPE_COLORS: Record<string, string> = {
  ASSET: "bg-blue-50 text-blue-600",
  LIABILITY: "bg-amber-50 text-amber-600",
  EQUITY: "bg-emerald-50 text-emerald-600",
  INCOME: "bg-green-50 text-green-600",
  EXPENSE: "bg-rose-50 text-rose-600",
};

function ChartPanel({ campusId }: { campusId?: string }) {
  const tr = useUiText();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("INCOME");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<AccountRow | null>(null);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/accounts/chart${qp}`);
      const json = await res.json();
      if (json.success) setAccounts(json.data);
    } catch {
      toast.error(tr("Failed to load accounts"));
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

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`${API}/accounts/chart?id=${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success(tr("Account deleted"));
        setDeleting(null);
        load();
      } else {
        toast.error(tr(json.error || "Failed to delete"));
      }
    } catch {
      toast.error(tr("Failed to delete account"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-wider text-ink-subtle mb-1"><UiText>{"Chart of Accounts"}</UiText></p>
          <p className="text-sm font-black text-[#1f1a23]"><UiText>{"Bookkeeping heads used by the ledger"}</UiText></p>
          <p className="text-[10px] font-semibold text-ink-subtle mt-0.5"><UiText>{"Fee income auto-posts to \"Fee Income\" — accounts with entries cannot be deleted."}</UiText></p>
        </div>
        <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New Account"}</UiText></BrandButton>
      </div>

      {loading ? (
        <SkeletonRows />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={tr("No accounts yet")}
          description={tr("Create account heads to organise income and expense entries.")}
          action={<BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New Account"}</UiText></BrandButton>}
        />
      ) : (
        <div className="space-y-3">
          {accounts.map((acc) => (
            <div key={acc.id} className="sk-panel p-5 flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#8127cf]/10 text-[#8127cf]">
                <Wallet className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-[#1f1a23]">
                  {acc.name}
                  {acc.isSystem ? <span className="ml-2 text-[9px] font-black uppercase text-ink-subtle"><UiText>{"System"}</UiText></span> : null}
                </p>
                <p className="text-[10px] font-bold text-ink-subtle mt-0.5">
                  {acc._count ? tr("{0} entries", [acc._count.entries]) : ""}
                </p>
              </div>
              <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg ${TYPE_COLORS[acc.type] || "bg-gray-50 text-gray-500"}`}>
                {acc.type}
              </span>
              <Button variant="secondary" size="icon" type="button" onClick={() => openModal(acc)} className="flex items-center justify-center" aria-label={tr("Edit account")}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="secondary" size="icon" type="button" onClick={() => setDeleting(acc)} className="flex items-center justify-center" aria-label={tr("Delete account")}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ModalFrame title={editing ? tr("Edit Account") : tr("New Account")} eyebrow={tr("Accounts · Chart")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormInput label={tr("Account Name")} value={name} placeholder={tr("e.g. Library Fee")} onChange={setName} />
            <label>
              <span className={labelClass}><UiText>{"Type"}</UiText></span>
              <SystemSelect value={type} onChange={(e) => setType(e.target.value)} className="w-full">
                <option value="INCOME"><UiText>{"Income"}</UiText></option>
                <option value="EXPENSE"><UiText>{"Expense"}</UiText></option>
                <option value="ASSET"><UiText>{"Asset"}</UiText></option>
                <option value="LIABILITY"><UiText>{"Liability"}</UiText></option>
                <option value="EQUITY"><UiText>{"Equity"}</UiText></option>
              </SystemSelect>
            </label>
            <ModalActions busy={saving} busyLabel="Saving..." actionLabel={editing ? "Save Changes" : "Create Account"} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </ModalFrame>
      )}

      {deleting && (
        <ConfirmAction
          open
          title={tr("Delete account?")}
          description={tr("\"{0}\" will be removed. Accounts with ledger entries are kept instead.", [deleting.name])}
          confirmLabel={tr("Delete")}
          tone="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
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

function MethodsPanel({ campusId }: { campusId?: string }) {
  const tr = useUiText();
  const [methods, setMethods] = useState<MethodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MethodRow | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<MethodRow | null>(null);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/accounts/payment-methods${qp}`);
      const json = await res.json();
      if (json.success) setMethods(json.data);
    } catch {
      toast.error(tr("Failed to load payment methods"));
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

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`${API}/accounts/payment-methods?id=${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success(tr("Payment method deleted"));
        setDeleting(null);
        load();
      } else {
        toast.error(tr(json.error || "Failed to delete"));
      }
    } catch {
      toast.error(tr("Failed to delete method"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-wider text-ink-subtle mb-1"><UiText>{"Payment Methods"}</UiText></p>
          <p className="text-sm font-black text-[#1f1a23]"><UiText>{"Labels used on receipts and ledger entries"}</UiText></p>
        </div>
        <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New Method"}</UiText></BrandButton>
      </div>

      {loading ? (
        <SkeletonRows />
      ) : methods.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={tr("No payment methods")}
          description={tr("Add methods like Cash, Bank Transfer, Cheque — used on receipts.")}
          action={<BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New Method"}</UiText></BrandButton>}
        />
      ) : (
        <div className="space-y-3">
          {methods.map((m) => (
            <div key={m.id} className="sk-panel p-5 flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#8127cf]/10 text-[#8127cf]">
                <CreditCard className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-[#1f1a23]">{m.name}</p>
                <p className="text-[10px] font-bold text-ink-subtle mt-0.5">{m.isActive ? tr("Active") : tr("Inactive")}</p>
              </div>
              <Button aria-pressed={m.isActive} variant="choice"
                type="button"
                onClick={() => handleToggle(m)}
                className={`px-3 py-1.5 ${""} `}
              >
                {m.isActive ? tr("Active") : tr("Inactive")}
              </Button>
              <Button variant="secondary" size="icon" type="button" onClick={() => openModal(m)} className="flex items-center justify-center" aria-label={tr("Edit method")}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="secondary" size="icon" type="button" onClick={() => setDeleting(m)} className="flex items-center justify-center" aria-label={tr("Delete method")}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ModalFrame title={editing ? tr("Edit Payment Method") : tr("New Payment Method")} eyebrow={tr("Accounts · Methods")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormInput label={tr("Name")} value={name} placeholder={tr("e.g. Cash")} onChange={setName} />
            <ModalActions busy={saving} busyLabel="Saving..." actionLabel={editing ? "Save Changes" : "Create Method"} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </ModalFrame>
      )}

      {deleting && (
        <ConfirmAction
          open
          title={tr("Delete payment method?")}
          description={tr("\"{0}\" will be removed everywhere.", [deleting.name])}
          confirmLabel={tr("Delete")}
          tone="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
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

function BanksPanel({ campusId }: { campusId?: string }) {
  const [currency, setCurrency] = useState("PKR");
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

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/accounts/bank-accounts${qp}`);
      const json = await res.json();
      if (json.success) setBanks(json.data);
    } catch {
      toast.error(tr("Failed to load bank accounts"));
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

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`${API}/accounts/bank-accounts?id=${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success(tr("Bank account deleted"));
        setDeleting(null);
        load();
      } else {
        toast.error(tr(json.error || "Failed to delete"));
      }
    } catch {
      toast.error(tr("Failed to delete bank"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-wider text-ink-subtle mb-1"><UiText>{"Bank Accounts"}</UiText></p>
          <p className="text-sm font-black text-[#1f1a23]"><UiText>{"Deposit accounts entries can be attributed to"}</UiText></p>
        </div>
        <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New Bank Account"}</UiText></BrandButton>
      </div>

      {loading ? (
        <SkeletonRows />
      ) : banks.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={tr("No bank accounts")}
          description={tr("Add a bank account to attribute ledger entries to it.")}
          action={<BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => openModal(null)}><UiText>{"New Bank Account"}</UiText></BrandButton>}
        />
      ) : (
        <div className="space-y-3">
          {banks.map((b) => (
            <div key={b.id} className="sk-panel p-5 flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#8127cf]/10 text-[#8127cf]">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-[#1f1a23]">{b.name}</p>
                <p className="text-[10px] font-bold text-ink-subtle mt-0.5">
                  {[b.bankName, b.accountNumber].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black uppercase text-ink-subtle"><UiText>{"Opening Balance"}</UiText></p>
                <p className="text-sm font-black text-[#1f1a23]">{formatPKR(b.openingBalance, b.currency)}</p>
              </div>
              <Button aria-pressed={b.isActive} variant="choice"
                type="button"
                onClick={() => handleToggle(b)}
                className={`px-3 py-1.5 ${""} `}
              >
                {b.isActive ? tr("Active") : tr("Inactive")}
              </Button>
              <Button variant="secondary" size="icon" type="button" onClick={() => openModal(b)} className="flex items-center justify-center" aria-label={tr("Edit bank")}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="secondary" size="icon" type="button" onClick={() => setDeleting(b)} className="flex items-center justify-center" aria-label={tr("Delete bank")}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ModalFrame title={editing ? tr("Edit Bank Account") : tr("New Bank Account")} eyebrow={tr("Accounts · Banks")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormInput label={tr("Account Name")} value={name} placeholder={tr("e.g. Main School Account")} onChange={setName} />
            <FormInput label={tr("Bank Name")} value={bankName} placeholder={tr("e.g. HBL")} onChange={setBankName} />
            <FormInput label={tr("Account Number")} value={accountNumber} placeholder="e.g. 1234-5678-90" onChange={setAccountNumber} />
            <FormInput label={`${tr("Opening Balance")} (${currency})`} type="number" value={openingBalance} placeholder="0" onChange={setOpeningBalance} />
            <ModalActions busy={saving} busyLabel="Saving..." actionLabel={editing ? "Save Changes" : "Create Bank Account"} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </ModalFrame>
      )}

      {deleting && (
        <ConfirmAction
          open
          title={tr("Delete bank account?")}
          description={tr("\"{0}\" will be removed if it has no ledger entries.", [deleting.name])}
          confirmLabel={tr("Delete")}
          tone="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/* ── Income / Expense entries ──────────────────────────── */

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
  account: { id: string; name: string; type: string };
  bankAccount?: { id: string; name: string } | null;
}

function EntriesPanel({ campusId, kind }: { campusId?: string; kind: "INCOME" | "EXPENSE" }) {
 const { money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  const [currency, setCurrency] = useState("");
  const [entries, setEntries] = useState<LedgerRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [banks, setBanks] = useState<BankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<LedgerRow | null>(null);
  const [total, setTotal] = useState(0);

  const qp = campusId ? `?campusId=${encodeURIComponent(campusId)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, aRes, bRes] = await Promise.all([
        fetch(`${API}/accounts/ledger${qp ? `${qp}&` : "?"}kind=${kind}${currency ? `&currency=${currency}` : ""}`),
        fetch(`${API}/accounts/chart${qp}`),
        fetch(`${API}/accounts/bank-accounts${qp}`),
      ]);
      const [eJson, aJson, bJson] = await Promise.all([eRes.json(), aRes.json(), bRes.json()]);
      if (eJson.success) {
        setEntries(eJson.data);
        if (!currency) setCurrency(eJson.currency);
        setTotal(eJson.total);
      }
      if (aJson.success) setAccounts(aJson.data);
      if (bJson.success) setBanks(bJson.data);
    } catch {
      toast.error(tr("Failed to load ledger"));
    } finally {
      setLoading(false);
    }
  }, [qp, kind, currency]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!sourceName.trim() || !accountId || !amount) {
      toast.error(tr("Source, account and amount required"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API}/accounts/ledger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campusId: campusId || undefined,
          kind,
          sourceName: sourceName.trim(),
          accountId,
          currency,
          amount: rupeesToPaisa(amount, currency || "PKR"),
          date,
          bankAccountId: bankAccountId || undefined,
          note: note.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(tr("Entry recorded"));
        setShowModal(false);
        setSourceName(""); setAmount(""); setBankAccountId(""); setNote("");
        load();
      } else {
        toast.error(tr(json.error || "Failed to save"));
      }
    } catch {
      toast.error(tr("Failed to save entry"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`${API}/accounts/ledger?id=${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success(tr("Entry deleted"));
        setDeleting(null);
        load();
      } else {
        toast.error(tr(json.error || "Failed to delete"));
      }
    } catch {
      toast.error(tr("Failed to delete entry"));
    }
  };

  const incomeAccounts = accounts.filter((a) => a.type === "INCOME");
  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE");
  const pickList = kind === "INCOME" ? incomeAccounts : expenseAccounts;

  return (
    <div className="space-y-4"><label className="block text-sm"><UiText>{"Currency"}</UiText><SystemSelect aria-label={tr("Currency")} value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full"><option value=""><UiText>{"School default"}</UiText></option>{CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}</SystemSelect></label>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-wider text-ink-subtle mb-1">{kind === "INCOME" ? tr("Income Entries") : tr("Expense Entries")}</p>
          <p className="text-sm font-black text-[#1f1a23]">
            {kind === "INCOME" ? <span className="text-emerald-600">{formatPKR(entries.reduce((s, e) => s + e.amount, 0), currency || "PKR")}</span> : <span className="text-rose-600">{formatPKR(entries.reduce((s, e) => s + e.amount, 0), currency || "PKR")}</span>}<UiText>{"total ·"}</UiText>{total}<UiText>{"records"}</UiText></p>
        </div>
        <BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>
          {kind === "INCOME" ? tr("Record Income") : tr("Record Expense")}
        </BrandButton>
      </div>

      {loading ? (
        <SkeletonRows />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={kind === "INCOME" ? TrendingUp : TrendingDown}
          title={kind === "INCOME" ? tr("No income entries") : tr("No expense entries")}
          description={kind === "INCOME"
            ? tr("Fee collections post here automatically. Add other income manually.")
            : tr("Add expenses like salaries and utilities here.")}
          action={<BrandButton icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>{kind === "INCOME" ? tr("Record Income") : tr("Record Expense")}</BrandButton>}
        />
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <div key={e.id} className="sk-panel p-5 flex items-center gap-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${e.kind === "INCOME" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                {e.kind === "INCOME" ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-[#1f1a23] truncate">{e.sourceName}</p>
                <p className="text-[10px] font-bold text-ink-subtle mt-0.5">
                  {e.account.name}
                  {e.bankAccount ? ` · ${e.bankAccount.name}` : ""}
                  {e.paymentMethod ? ` · ${e.paymentMethod}` : ""}
                  {" · "}{e.date.split("T")[0]}
                </p>
                {e.note ? <p className="text-[10px] font-semibold text-ink-subtle mt-0.5">{e.note}</p> : null}
              </div>
              <p className={`text-sm font-black ${e.kind === "INCOME" ? "text-emerald-700" : "text-rose-700"}`}>
                {e.kind === "INCOME" ? "+" : "−"}{formatPKR(e.amount, e.currency)}
              </p>
              {!e.paymentId && (
                <Button variant="secondary" size="icon" type="button" onClick={() => setDeleting(e)} className="flex items-center justify-center" aria-label={tr("Delete entry")}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ModalFrame title={kind === "INCOME" ? tr("Record Income") : tr("Record Expense")} eyebrow={tr("Accounts · Ledger")} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <FormInput label={tr("Source / Description")} value={sourceName} placeholder={kind === "INCOME" ? tr("e.g. Donation") : tr("e.g. Electricity bill")} onChange={setSourceName} />
            <FormSelect label={tr("Account")} value={accountId} onChange={setAccountId}>
              <option value=""><UiText>{"Select account..."}</UiText></option>
              {pickList.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </FormSelect>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
              <FormInput label={`${tr("Amount")} (${currency || "PKR"})`} type="number" value={amount} placeholder="0" onChange={setAmount} />
              <FormInput label={tr("Date")} type="date" value={date} placeholder="2026-08-09" onChange={setDate} />
            </div>
            <label>
              <span className={labelClass}><UiText>{"Bank Account (optional)"}</UiText></span>
              <SystemSelect value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className="w-full">
                <option value=""><UiText>{"— None —"}</UiText></option>
                {banks.filter((b) => b.isActive && b.currency === currency).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </SystemSelect>
            </label>
            <FormInput label={tr("Note (optional)")} value={note} placeholder={tr("Extra detail")} onChange={setNote} />
            <ModalActions busy={saving} busyLabel="Saving..." actionLabel={kind === "INCOME" ? "Record Income" : "Record Expense"} onClose={() => setShowModal(false)} onSave={handleSave} />
          </div>
        </ModalFrame>
      )}

      {deleting && (
        <ConfirmAction
          open
          title={tr("Delete entry?")}
          description={tr("\"{0}\" ({1}) will be removed.", [deleting.sourceName, formatPKR(deleting.amount, deleting.currency)])}
          confirmLabel={tr("Delete")}
          tone="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/* ── Profit report ─────────────────────────────────────── */

function ProfitPanel({ campusId }: { campusId?: string }) {
 const { money: formatPKR } = useLocaleFormat();
  const tr = useUiText();
  const [currency, setCurrency] = useState("");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [to, setTo] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async () => {
    if (!from || !to) { setError(tr("Select a date range")); return; }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to, ...(currency ? { currency } : {}) });
      if (campusId) params.set("campusId", campusId);
      const res = await fetch(`${API}/accounts/profit?${params}`);
      const json = await res.json();
      if (json.success) { setReport(json.data); if (!currency) setCurrency(json.data.currency); }
      else setError(tr(json.error || "Failed to load report"));
    } catch {
      setError(tr("Failed to load report"));
    } finally {
      setLoading(false);
    }
  }, [from, to, campusId, currency]);

  useEffect(() => { run(); }, [run]);

  return (
    <div className="space-y-4"><label className="block text-sm"><UiText>{"Currency"}</UiText><SystemSelect aria-label={tr("Currency")} value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full"><option value=""><UiText>{"School default"}</UiText></option>{CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}</SystemSelect></label>
      <div className="flex items-end gap-3 flex-wrap">
        <label>
          <span className={labelClass}><UiText>{"From"}</UiText></span>
          <SystemInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full" />
        </label>
        <label>
          <span className={labelClass}><UiText>{"To"}</UiText></span>
          <SystemInput type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full" />
        </label>
        <BrandButton icon={<Percent className="w-4 h-4" />} onClick={run} disabled={loading}>
          {loading ? <Loader className="w-4 h-4 animate-spin" /> : tr("Run Report")}
        </BrandButton>
      </div>

      {error ? (
        <div className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>
      ) : !report ? (
        <EmptyState icon={TrendingUp} title={tr("Run the report")} description={tr("Pick a date range to see income, expense and net profit.")} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard icon={TrendingUp} label={tr("Income")} value={formatPKR(report.income, report.currency)} tone="green" />
            <StatCard icon={TrendingDown} label={tr("Expense")} value={formatPKR(report.expense, report.currency)} tone="rose" />
            <StatCard icon={Banknote} label={tr("Net Profit")} value={formatPKR(report.net, report.currency)} tone={report.net < 0 ? "rose" : "purple"} />
          </div>

          {report.breakdown.length > 0 ? (
            <div className="space-y-3">
              {report.breakdown.map((b: any) => (
                <div key={`${b.accountId}-${b.type}`} className="sk-panel p-5 flex items-center gap-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${b.type === "INCOME" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                    {b.type === "INCOME" ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-[#1f1a23]">{b.accountName}</p>
                    <p className="text-[10px] font-bold text-ink-subtle mt-0.5">{b.entries}<UiText>{"entries"}</UiText></p>
                  </div>
                  <p className={`text-sm font-black ${b.type === "INCOME" ? "text-emerald-700" : "text-rose-700"}`}>
                    {formatPKR(b.amount, report.currency)}
                  </p>
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
              <div className="h-4 w-28 rounded-full bg-[#e8e0ec]/50 skeleton-shimmer" />
              <div className="h-3 w-40 rounded-full bg-[#e8e0ec]/40 skeleton-shimmer" />
            </div>
            <div className="h-8 w-8 rounded-xl bg-[#e8e0ec]/40 skeleton-shimmer" />
          </div>
          <div className="h-12 rounded-xl bg-[#f3f4f9]/50 skeleton-shimmer" />
        </div>
      ))}
    </div>
  );
}
