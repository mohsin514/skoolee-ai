"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense } from "react";
import { Loader2, Shield, Lock, CreditCard, CheckCircle2 } from "lucide-react";

function SafePayForm() {
  const router = useRouter();
  const params = useSearchParams();
  const orderRef = params.get("orderRef") || "";
  const schoolId = params.get("schoolId") || "";
  const plan = params.get("plan") || "";
  const amountLabel = params.get("amountLabel") || "PKR 0/mo";

  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardName, setCardName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const formatCard = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const formatExpiry = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    if (digits.length > 2) return digits.slice(0, 2) + "/" + digits.slice(2);
    return digits;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardNumber.replace(/\s/g, "").length || !expiry.length || !cvv.length || !cardName.length) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/safepay/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderRef, schoolId, plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment failed");
      setDone(true);
      setTimeout(() => router.push("/dashboard/billing?safepay_status=completed"), 1500);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] p-4">
        <div className="bg-white rounded-3xl p-10 max-w-sm w-full text-center shadow-2xl">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[#1f1a23]">Payment Successful!</h2>
          <p className="text-sm text-[#4d4354]/60 mt-2">Redirecting to billing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] p-4">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#8127cf] flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#1f1a23]">SafePay</h1>
            <p className="text-[10px] font-semibold text-[#4d4354]/40 uppercase tracking-wider">Secured by HBL</p>
          </div>
        </div>

        <div className="rounded-xl bg-[#f3f4f9] p-4 mb-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#4d4354]/40">Order Reference</p>
          <p className="text-sm font-bold text-[#1f1a23]">{orderRef}</p>
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-[#cfc2d6]/20">
            <p className="text-sm font-semibold text-[#4d4354]/60">Plan: <span className="text-[#1f1a23]">{plan}</span></p>
            <p className="text-lg font-black text-[#8127cf]">{amountLabel}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 block mb-1">Cardholder Name</label>
            <input
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="John Doe"
              className="w-full rounded-xl border border-[#cfc2d6]/20 bg-white px-4 py-[10px] text-sm font-semibold text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"
              required
            />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 block mb-1">Card Number</label>
            <input
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCard(e.target.value))}
              placeholder="4242 4242 4242 4242"
              className="w-full rounded-xl border border-[#cfc2d6]/20 bg-white px-4 py-[10px] text-sm font-semibold text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"
              required
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 block mb-1">Expiry</label>
              <input
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                placeholder="MM/YY"
                className="w-full rounded-xl border border-[#cfc2d6]/20 bg-white px-4 py-[10px] text-sm font-semibold text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"
                required
              />
            </div>
            <div className="flex-1">
              <label className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 block mb-1">CVV</label>
              <input
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="123"
                type="password"
                className="w-full rounded-xl border border-[#cfc2d6]/20 bg-white px-4 py-[10px] text-sm font-semibold text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"
                required
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#8127cf] px-5 py-3 text-sm font-black text-white hover:bg-[#6a1fb3] transition-colors disabled:opacity-50 mt-2"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Lock className="w-4 h-4" />
            )}
            {submitting ? "Processing..." : `Pay ${amountLabel}`}
          </button>
          <p className="text-[10px] text-center text-[#4d4354]/30 font-semibold">
            This is a test payment page. No real payment will be charged.
          </p>
        </form>
      </div>
    </div>
  );
}

export default function SafePayPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e]">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    }>
      <SafePayForm />
    </Suspense>
  );
}
