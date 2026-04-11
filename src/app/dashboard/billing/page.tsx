"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Invoice {
  id: string;
  student: { fullName: string; rollNo: string; class: { name: string } };
  term: string;
  academicYear: number;
  totalAmount: number;
  dueDate: string;
  status: "PENDING" | "PARTIAL" | "PAID" | "CANCELLED";
  challanUrl?: string;
}

const STATUS_CONFIG = {
  PAID: { label: "Paid", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  PARTIAL: { label: "Partial", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  PENDING: { label: "Pending", color: "bg-red-100 text-red-700", icon: AlertCircle },
  CANCELLED: { label: "Cancelled", color: "bg-gray-100 text-gray-500", icon: AlertCircle },
};

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentModal, setPaymentModal] = useState<Invoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amountPaid: "", method: "CASH", receiptNo: "" });
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [generateModal, setGenerateModal] = useState(false);
  const [genForm, setGenForm] = useState({ classId: "", term: "", academicYear: new Date().getFullYear(), dueDate: "" });
  const [isGenerating, setIsGenerating] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "PARTIAL" | "PAID">("ALL");

  const loadInvoices = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/billing/invoices");
      const data = await res.json();
      setInvoices(data.invoices || []);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadInvoices(); }, []);

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
          amountPaid: parseInt(paymentForm.amountPaid),
          method: paymentForm.method,
          receiptNo: paymentForm.receiptNo || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Payment recorded. Status: ${data.status}`);
      setPaymentModal(null);
      await loadInvoices();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
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
        body: JSON.stringify({ action: "generate-invoices", campusId: "", ...genForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Generated ${data.created} invoices out of ${data.total} students`);
      setGenerateModal(false);
      await loadInvoices();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const filtered = filter === "ALL" ? invoices : invoices.filter((i) => i.status === filter);
  const stats = {
    total: invoices.length,
    paid: invoices.filter((i) => i.status === "PAID").length,
    pending: invoices.filter((i) => i.status === "PENDING").length,
    partial: invoices.filter((i) => i.status === "PARTIAL").length,
    collected: invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.totalAmount, 0),
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Billing & Payments"
        description="Fee invoices · Challans · Payment recording"
        actions={
          <Button size="sm" onClick={() => setGenerateModal(true)}>
            <Plus className="mr-2 h-4 w-4" /> Generate Invoices
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Invoices", value: stats.total, icon: Receipt, color: "text-blue-600" },
            { label: "Paid", value: stats.paid, icon: CheckCircle2, color: "text-green-600" },
            { label: "Pending", value: stats.pending, icon: AlertCircle, color: "text-red-500" },
            { label: "Collected", value: `Rs ${stats.collected.toLocaleString()}`, icon: CreditCard, color: "text-purple-600" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
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

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {(["ALL", "PENDING", "PARTIAL", "PAID"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                filter === f ? "bg-primary text-white border-primary" : "border-border hover:border-primary/40"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Invoices table */}
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
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-left">Due Date</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((inv) => {
                      const cfg = STATUS_CONFIG[inv.status];
                      const Icon = cfg.icon;
                      return (
                        <tr key={inv.id} className="border-b hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium">{inv.student?.fullName}</p>
                            <p className="text-xs text-muted-foreground">#{inv.student?.rollNo}</p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{inv.student?.class?.name}</td>
                          <td className="px-4 py-3">
                            {inv.term} {inv.academicYear}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">Rs {inv.totalAmount.toLocaleString()}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(inv.dueDate).toLocaleDateString("en-PK")}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={`text-xs ${cfg.color}`}>
                              <Icon className="h-3 w-3 mr-1" />
                              {cfg.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {inv.status !== "PAID" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setPaymentModal(inv);
                                    setPaymentForm({ amountPaid: String(inv.totalAmount), method: "CASH", receiptNo: "" });
                                  }}
                                >
                                  <CreditCard className="h-3.5 w-3.5 mr-1" /> Pay
                                </Button>
                              )}
                              {inv.challanUrl && (
                                <a href={inv.challanUrl} target="_blank" rel="noreferrer">
                                  <Button size="sm" variant="ghost" className="h-7 text-xs">
                                    <FileText className="h-3.5 w-3.5 mr-1" /> Challan
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
                        <td colSpan={7} className="py-10 text-center text-muted-foreground">
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

      {/* ── Record Payment Modal ── */}
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
                  Total: Rs {paymentModal.totalAmount.toLocaleString()} · {paymentModal.term} {paymentModal.academicYear}
                </p>
              </div>
              <div className="space-y-1">
                <Label>Amount Paid (Rs)</Label>
                <Input
                  type="number"
                  value={paymentForm.amountPaid}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, amountPaid: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Payment Method</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={paymentForm.method}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, method: e.target.value }))}
                >
                  <option value="CASH">Cash</option>
                  <option value="JAZZCASH">JazzCash</option>
                  <option value="EASYPAISA">EasyPaisa</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Receipt No. (optional)</Label>
                <Input
                  value={paymentForm.receiptNo}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, receiptNo: e.target.value }))}
                  placeholder="e.g. RCT-0012"
                />
              </div>
              <Button className="w-full" onClick={recordPayment} disabled={isSubmittingPayment}>
                {isSubmittingPayment && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Payment
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Generate Invoices Modal ── */}
      <Dialog open={generateModal} onOpenChange={setGenerateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Fee Invoices</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generates invoices for all students in the selected class based on the fee structure.
            </p>
            <div className="space-y-1">
              <Label>Class ID</Label>
              <Input value={genForm.classId} onChange={(e) => setGenForm((p) => ({ ...p, classId: e.target.value }))} placeholder="Enter class ID" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Term</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={genForm.term}
                  onChange={(e) => setGenForm((p) => ({ ...p, term: e.target.value }))}
                >
                  <option value="">Select term</option>
                  <option value="Term 1">Term 1</option>
                  <option value="Term 2">Term 2</option>
                  <option value="Term 3">Term 3</option>
                  <option value="Annual">Annual</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Academic Year</Label>
                <Input type="number" value={genForm.academicYear} onChange={(e) => setGenForm((p) => ({ ...p, academicYear: parseInt(e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input type="date" value={genForm.dueDate} onChange={(e) => setGenForm((p) => ({ ...p, dueDate: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={generateInvoices} disabled={isGenerating}>
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate Invoices
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
