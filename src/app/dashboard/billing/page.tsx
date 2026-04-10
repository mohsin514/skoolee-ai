"use client";

import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { PLANS } from "@/config/plans";
import { Check, CreditCard, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { PlanType } from "@/types";

export default function BillingPage() {
  const [currentPlan] = useState<PlanType>("FREE");
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleUpgrade = async (plan: PlanType) => {
    setIsLoading(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error("Failed to create checkout session");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setIsLoading(null);
    }
  };

  const handleManageBilling = async () => {
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast.error("Failed to open billing portal");
    }
  };

  return (
    <>
      <Header
        title="Billing"
        description="Manage your subscription and AI credits"
        actions={
          currentPlan !== "FREE" ? (
            <Button variant="outline" size="sm" onClick={handleManageBilling}>
              <CreditCard className="h-4 w-4" />
              Manage Billing
            </Button>
          ) : undefined
        }
      />

      <div className="p-6 space-y-8">
        <div className="grid gap-6 md:grid-cols-3">
          {(Object.keys(PLANS) as PlanType[]).map((planKey) => {
            const plan = PLANS[planKey];
            const isCurrent = currentPlan === planKey;

            return (
              <Card
                key={planKey}
                className={`relative ${
                  planKey === "PRO"
                    ? "border-primary shadow-lg shadow-primary/10"
                    : ""
                }`}
              >
                {planKey === "PRO" && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="gap-1">
                      <Sparkles className="h-3 w-3" />
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>
                    <span className="text-3xl font-bold text-foreground">
                      ${plan.price}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-muted-foreground">/month</span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2.5">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-sm"
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  {isCurrent ? (
                    <Button className="w-full" variant="outline" disabled>
                      Current Plan
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      variant={planKey === "PRO" ? "default" : "outline"}
                      onClick={() => handleUpgrade(planKey)}
                      disabled={isLoading === planKey || planKey === "FREE"}
                    >
                      {isLoading === planKey
                        ? "Redirecting..."
                        : planKey === "FREE"
                          ? "Downgrade"
                          : `Upgrade to ${plan.name}`}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
