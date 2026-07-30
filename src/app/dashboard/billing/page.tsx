"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { toast } from "sonner";
import {
  Receipt,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  CreditCard,
  FileText,
  WalletCards,
  Crown,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ClassRecord {
  id: string;
  name: string;
  section?: string | null;
  academicYear: number;
  _count?: { students: number };
}

interface FeeStructure {
  id: string;
  classId: string;
  monthlyFee: number;
  oneTimeFeesJson?: any;
  lateFeePercentage?: number;
  compoundLateFee?: boolean;
  taxPercentage?: number;
  activeFrom: string;
  activeTo?: string | null;
  class: ClassRecord;
}

interface Invoice {
  id: string;
  student: { fullName: string; rollNo: string; class: { id: string; name: string; section?: string | null } };
  term: string;
  academicYear: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  dueDate: string;
  status: "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";
  challanUrl?: string | null;
  payments: { amountPaid: number; method: string; paidAt: string }[];
}

type PlanType = "FREE" | "BASIC" | "PRO" | "ENTERPRISE";

interface PlanDetails {
  type: PlanType;
  name: string;
  price: number | null;
  priceLabel: string;
  features: string[];
  aiCredits: number;
  maxStudents: number;
  maxTeachers: number;
  maxCampuses: number;
  isCustom?: boolean;
}

interface BillingSnapshot {
  school: {
    plan: PlanType;
    status: string;
    aiCreditsUsed: number;
    aiCreditsLimit: number;
    stripeCustomerId?: string | null;
  };
  limits: PlanDetails;
  usage: {
    students: number;
    teachers: number;
    campuses: number;
    aiCredits: number;
  };
  plans: Record<PlanType, PlanDetails>;
  isOperational: boolean;
  defaultPlanPricing: Record<string, { price?: number | null }> | null;
  defaultPricingUpdatedAt: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  PAID: { label: "Paid", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  PARTIAL: { label: "Partial", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  PENDING: { label: "Pending", color: "bg-red-100 text-red-700", icon: AlertCircle },
  OVERDUE: { label: "Overdue", color: "bg-red-100 text-red-700", icon: AlertCircle },
  CANCELLED: { label: "Cancelled", color: "bg-gray-100 text-gray-500", icon: AlertCircle },
};

interface BillingPageProps {
  embedded?: boolean;
}

export default function BillingPage({ embedded = false }: BillingPageProps = {}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);
  const [isPlanAction, setIsPlanAction] = useState<PlanType | "PORTAL" | null>(null);
  const [paymentModal, setPaymentModal] = useState<Invoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amountPaid: "", method: "CASH", receiptNo: "" });
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [generateModal, setGenerateModal] = useState(false);
  const [feeModal, setFeeModal] = useState(false);
  const [genForm, setGenForm] = useState({ classId: "", term: "", academicYear: new Date().getFullYear(), dueDate: "" });
  const [feeForm, setFeeForm] = useState({ classId: "", term: "", tuitionMonthly: 0, examFee: 0, annualFee: 0, monthsCount: 1 });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingFee, setIsSavingFee] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "DUE" | "PENDING" | "PARTIAL" | "PAID" | "OVERDUE">("ALL");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [billingRes, classRes, invoiceRes] = await Promise.all([
        fetch("/api/billing"),
        fetch("/api/classes"),
        fetch("/api/billing/invoices"),
      ]);
      const [billingData, classData, invoiceData] = await Promise.all([
        billingRes.json(),
        classRes.json(),
        invoiceRes.json(),
      ]);

      if (!billingRes.ok) throw new Error(billingData.error || "Could not load fee structures");
      setBilling(billingData.billing || null);

      if (!billingData.billing?.isOperational) {
        setInvoices([]);
        setClasses([]);
        setFeeStructures(billingData.feeStructures || []);
        return;
      }

      if (!classRes.ok) throw new Error(classData.error || "Could not load classes");
      if (!invoiceRes.ok) throw new Error(invoiceData.error || "Could not load invoices");

      const loadedClasses = classData.data || [];
      setInvoices(invoiceData.invoices || []);
      setClasses(loadedClasses);
      setFeeStructures(billingData.feeStructures || []);
      setGenForm((form) => ({ ...form, classId: form.classId || loadedClasses[0]?.id || "" }));
      setFeeForm((form) => ({ ...form, classId: form.classId || loadedClasses[0]?.id || "" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Billing data failed to load");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startCheckout = async (plan: "BASIC" | "PRO") => {
    setIsPlanAction(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      window.location.href = data.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout failed");
      setIsPlanAction(null);
    }
  };

  const openPortal = async () => {
    setIsPlanAction("PORTAL");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Portal failed");
      window.location.href = data.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Portal failed");
      setIsPlanAction(null);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const recordPayment = async () => {
    if (!paymentModal) return;
    setIsSubmittingPayment(true);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record-payment",
          invoiceId: paymentModal.id,
          amountPaid: parseInt(paymentForm.amountPaid, 10),
          method: paymentForm.method,
          receiptNo: paymentForm.receiptNo || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment failed");
      toast.success(`Payment recorded. Status: ${data.status}`);
      setPaymentModal(null);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const generateInvoices = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-invoices", ...genForm, academicYear: Number(genForm.academicYear) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      toast.success(`Generated ${data.created} invoices. Skipped ${data.skipped || 0} already generated.`);
      setGenerateModal(false);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const saveFeeStructure = async () => {
    setIsSavingFee(true);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-fee-structure",
          ...feeForm,
          tuitionMonthly: Number(feeForm.tuitionMonthly),
          examFee: Number(feeForm.examFee),
          annualFee: Number(feeForm.annualFee),
          monthsCount: Number(feeForm.monthsCount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save fee structure");
      toast.success("Fee structure saved");
      setFeeModal(false);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save fee structure");
    } finally {
      setIsSavingFee(false);
    }
  };

  const dueInvoices = invoices.filter((invoice) => invoice.status !== "PAID" && invoice.status !== "CANCELLED" && new Date(invoice.dueDate) < new Date());
  const filtered =
    filter === "ALL"
      ? invoices
      : filter === "DUE"
        ? dueInvoices
        : invoices.filter((invoice) => invoice.status === filter);
  const stats = {
    total: invoices.length,
    paid: invoices.filter((invoice) => invoice.status === "PAID").length,
    pending: invoices.filter((invoice) => invoice.status === "PENDING").length,
    due: dueInvoices.length,
    collected: invoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0),
  };
  const planCards = billing ? Object.values(billing.plans) : [];
  const formatLimit = (limit: number) => (limit < 0 ? "Unlimited" : limit.toLocaleString());
  const billingActions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => setFeeModal(true)} disabled={classes.length === 0}>
        <WalletCards className="h-4 w-4" />
        Fee Structure
      </Button>
      <Button size="sm" onClick={() => setGenerateModal(true)} disabled={classes.length === 0}>
        <Plus className="h-4 w-4" />
        Generate Invoices
      </Button>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col">
      {embedded ? (
        <div className="flex flex-col gap-4 border-b border-[#f3f4f9] p-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-normal text-[#8127cf]">Owner billing control</p>
            <h2 className="mt-1 text-3xl font-black tracking-normal text-[#1f1a23]">Billing & Payments</h2>
            <p className="mt-2 text-sm font-semibold text-[#4d4354]/60">
              Fee structures, invoices, challans, payment recording, plan, and AI credit control.
            </p>
          </div>
          {billingActions}
        </div>
      ) : (
        <Header
          title="Billing & Payments"
          description="Fee structures, invoices, challans, and payment recording"
          actions={billingActions}
        />
      )}

      <div className="p-6 space-y-6">
        {billing && (
          <Card className={billing.isOperational ? "" : "border-amber-200 bg-amber-50/70 shadow-none"}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-primary" />
                  SaaS plan
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Current plan: {billing.limits.name} - {billing.school.status.toLowerCase()}
                </p>
              </div>
              {billing.school.stripeCustomerId && (
                <Button variant="outline" size="sm" onClick={openPortal} disabled={!!isPlanAction}>
                  {isPlanAction === "PORTAL" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  Manage
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-5">
              {!billing.isOperational && (
                <div className="rounded-lg border border-amber-200 bg-white/70 p-4 text-sm text-amber-800">
                  Subscription access is paused. Update billing to restore student, teacher, campus, AI, PDF, and messaging workflows.
                </div>
              )}
              {billing.defaultPlanPricing && billing.defaultPlanPricing[billing.school.plan]?.price != null && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
                  <p className="font-semibold flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" /> Platform pricing updated
                  </p>
                  <p className="mt-1">
                    From next billing cycle, your {billing.limits.name} plan rate changes to 
                    <strong> PKR {billing.defaultPlanPricing[billing.school.plan].price?.toLocaleString()}/mo</strong>.
                    {billing.defaultPricingUpdatedAt && (
                      <span className="block mt-0.5 text-xs text-sky-600/70">
                        Updated {new Date(billing.defaultPricingUpdatedAt).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  ["Students", billing.usage.students, billing.limits.maxStudents],
                  ["Teachers", billing.usage.teachers, billing.limits.maxTeachers],
                  ["Campuses", billing.usage.campuses, billing.limits.maxCampuses],
                  ["AI credits", billing.usage.aiCredits, billing.limits.aiCredits],
                ].map(([label, used, limit]) => (
                  <div key={label} className="rounded-lg border border-border bg-background p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-lg font-bold">
                      {Number(used).toLocaleString()} / {formatLimit(Number(limit))}
                    </p>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-4">
                {planCards.map((plan) => {
                  const isCurrent = plan.type === billing.school.plan;
                  const canCheckout = plan.type === "BASIC" || plan.type === "PRO";
                  return (
                    <div key={plan.type} className={`rounded-lg border p-4 ${isCurrent ? "border-primary bg-primary/5" : "border-border"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold">{plan.name}</p>
                          <p className="text-sm text-muted-foreground">{plan.priceLabel}</p>
                        </div>
                        {isCurrent && <Badge>Current</Badge>}
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        <p>{formatLimit(plan.maxStudents)} students</p>
                        <p>{formatLimit(plan.maxTeachers)} teachers</p>
                        <p>{formatLimit(plan.maxCampuses)} campuses</p>
                        <p>{formatLimit(plan.aiCredits)} AI credits</p>
                      </div>
                      <Button
                        className="mt-4 w-full"
                        variant={isCurrent ? "outline" : "default"}
                        disabled={isCurrent || !!isPlanAction || !canCheckout}
                        onClick={() => {
                          if (plan.type === "BASIC" || plan.type === "PRO") {
                            startCheckout(plan.type);
                          }
                        }}
                      >
                        {isPlanAction === plan.type ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                        {isCurrent ? "Active" : plan.isCustom ? "Contact sales" : "Upgrade"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[
            { label: "Invoices", value: stats.total, icon: Receipt, color: "text-blue-600" },
            { label: "Paid", value: stats.paid, icon: CheckCircle2, color: "text-green-600" },
            { label: "Pending", value: stats.pending, icon: AlertCircle, color: "text-red-500" },
            { label: "Due", value: stats.due, icon: Clock, color: "text-amber-600" },
            { label: "Collected", value: `Rs ${stats.collected.toLocaleString()}`, icon: CreditCard, color: "text-purple-600" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold mt-0.5">{stat.value}</p>
                  </div>
                  <stat.icon className={`h-8 w-8 ${stat.color} opacity-80`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <WalletCards className="h-4 w-4 text-primary" />
              Fee Structures
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setFeeModal(true)} disabled={classes.length === 0}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </CardHeader>
          <CardContent>
            {feeStructures.length === 0 ? (
              <div className="py-8 text-sm text-muted-foreground">No fee structures configured yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-4 py-3 text-left">Class</th>
                      <th className="px-4 py-3 text-left">Term</th>
                      <th className="px-4 py-3 text-right">Monthly</th>
                      <th className="px-4 py-3 text-right">Months</th>
                      <th className="px-4 py-3 text-right">Exam</th>
                      <th className="px-4 py-3 text-right">Annual</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeStructures.map((fee) => {
                      const total = fee.monthlyFee;
                      return (
                        <tr key={fee.id} className="border-b">
                          <td className="px-4 py-3">{fee.class.name} {fee.class.section || ""}</td>
                          <td className="px-4 py-3">—</td>
                          <td className="px-4 py-3 text-right">Rs {(fee.monthlyFee || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">1</td>
                          <td className="px-4 py-3 text-right">Rs 0</td>
                          <td className="px-4 py-3 text-right">Rs 0</td>
                          <td className="px-4 py-3 text-right font-semibold">Rs {(total || 0).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2 flex-wrap">
          {(["ALL", "DUE", "PENDING", "PARTIAL", "PAID", "OVERDUE"] as const).map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                filter === item ? "bg-primary text-white border-primary" : "border-border hover:border-primary/40"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-4 py-3 text-left">Student</th>
                      <th className="px-4 py-3 text-left">Class</th>
                      <th className="px-4 py-3 text-left">Term</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Paid</th>
                      <th className="px-4 py-3 text-right">Balance</th>
                      <th className="px-4 py-3 text-left">Due Date</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((invoice) => {
                      const cfg = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.PENDING;
                      const Icon = cfg.icon;
                      return (
                        <tr key={invoice.id} className="border-b hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium">{invoice.student?.fullName}</p>
                            <p className="text-xs text-muted-foreground">#{invoice.student?.rollNo}</p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {invoice.student?.class?.name} {invoice.student?.class?.section || ""}
                          </td>
                          <td className="px-4 py-3">{invoice.term} {invoice.academicYear}</td>
                          <td className="px-4 py-3 text-right font-semibold">Rs {invoice.totalAmount.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">Rs {invoice.paidAmount.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">Rs {invoice.balanceDue.toLocaleString()}</td>
                          <td className="px-4 py-3 text-muted-foreground">{new Date(invoice.dueDate).toLocaleDateString("en-PK")}</td>
                          <td className="px-4 py-3">
                            <Badge className={`text-xs ${cfg.color}`}>
                              <Icon className="h-3 w-3 mr-1" />
                              {cfg.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {invoice.status !== "PAID" && invoice.balanceDue > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setPaymentModal(invoice);
                                    setPaymentForm({ amountPaid: String(invoice.balanceDue), method: "CASH", receiptNo: "" });
                                  }}
                                >
                                  <CreditCard className="h-3.5 w-3.5" />
                                  Pay
                                </Button>
                              )}
                              {invoice.challanUrl && (
                                <a href={invoice.challanUrl} target="_blank" rel="noreferrer">
                                  <Button size="sm" variant="ghost" className="h-7 text-xs">
                                    <FileText className="h-3.5 w-3.5" />
                                    Challan
                                  </Button>
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-10 text-center text-muted-foreground">
                          <Receipt className="mx-auto h-8 w-8 mb-2 opacity-30" />
                          No invoices found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!paymentModal} onOpenChange={() => setPaymentModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {paymentModal && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="font-medium">{paymentModal.student?.fullName}</p>
                <p className="text-sm text-muted-foreground">
                  Balance: Rs {paymentModal.balanceDue.toLocaleString()} - {paymentModal.term} {paymentModal.academicYear}
                </p>
              </div>
              <div className="space-y-1">
                <Label>Amount Paid (Rs)</Label>
                <Input
                  type="number"
                  value={paymentForm.amountPaid}
                  max={paymentModal.balanceDue}
                  onChange={(event) => setPaymentForm((form) => ({ ...form, amountPaid: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Payment Method</Label>
                <Select value={paymentForm.method} onChange={(event) => setPaymentForm((form) => ({ ...form, method: event.target.value }))}>
                  <option value="CASH">Cash</option>
                  <option value="JAZZCASH">JazzCash</option>
                  <option value="EASYPAISA">EasyPaisa</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Receipt No. (optional)</Label>
                <Input
                  value={paymentForm.receiptNo}
                  onChange={(event) => setPaymentForm((form) => ({ ...form, receiptNo: event.target.value }))}
                  placeholder="e.g. RCT-0012"
                />
              </div>
              <Button className="w-full" onClick={recordPayment} disabled={isSubmittingPayment || !paymentForm.amountPaid}>
                {isSubmittingPayment && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm Payment
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={feeModal} onOpenChange={setFeeModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fee Structure</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Class</Label>
              <Select value={feeForm.classId} onChange={(event) => setFeeForm((form) => ({ ...form, classId: event.target.value }))}>
                <option value="">Select class</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>{cls.name} {cls.section || ""}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Term</Label>
                <Input value={feeForm.term} onChange={(event) => setFeeForm((form) => ({ ...form, term: event.target.value }))} placeholder="Term 1" />
              </div>
              <div className="space-y-1">
                <Label>Months</Label>
                <Input type="number" min={1} value={feeForm.monthsCount} onChange={(event) => setFeeForm((form) => ({ ...form, monthsCount: Number(event.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Monthly</Label>
                <Input type="number" min={0} value={feeForm.tuitionMonthly} onChange={(event) => setFeeForm((form) => ({ ...form, tuitionMonthly: Number(event.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>Exam</Label>
                <Input type="number" min={0} value={feeForm.examFee} onChange={(event) => setFeeForm((form) => ({ ...form, examFee: Number(event.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>Annual</Label>
                <Input type="number" min={0} value={feeForm.annualFee} onChange={(event) => setFeeForm((form) => ({ ...form, annualFee: Number(event.target.value) }))} />
              </div>
            </div>
            <Button className="w-full" onClick={saveFeeStructure} disabled={isSavingFee || !feeForm.classId || !feeForm.term}>
              {isSavingFee && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Fee Structure
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={generateModal} onOpenChange={setGenerateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Fee Invoices</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Class</Label>
              <Select value={genForm.classId} onChange={(event) => setGenForm((form) => ({ ...form, classId: event.target.value }))}>
                <option value="">Select class</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>{cls.name} {cls.section || ""}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Term</Label>
                <Input value={genForm.term} onChange={(event) => setGenForm((form) => ({ ...form, term: event.target.value }))} placeholder="Term 1" />
              </div>
              <div className="space-y-1">
                <Label>Academic Year</Label>
                <Input type="number" value={genForm.academicYear} onChange={(event) => setGenForm((form) => ({ ...form, academicYear: parseInt(event.target.value, 10) }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input type="date" value={genForm.dueDate} onChange={(event) => setGenForm((form) => ({ ...form, dueDate: event.target.value }))} />
            </div>
            <Button className="w-full" onClick={generateInvoices} disabled={isGenerating || !genForm.classId || !genForm.term || !genForm.dueDate}>
              {isGenerating && <Loader2 className="h-4 w-4 animate-spin" />}
              Generate Invoices
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
