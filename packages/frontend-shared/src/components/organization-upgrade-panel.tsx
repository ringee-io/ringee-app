"use client";

import * as React from "react";
import { CheckCircle2, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import { useApi } from "../hooks/use.api";

type BillingInterval = "month" | "year";

/**
 * The Organization plan, sold in place: what it brings, monthly or annual, and
 * the Stripe checkout. Every upsell that sells the plan renders this body — the
 * workspace switcher, the locked Campaigns tab on the Call page — so the price
 * shown and the cadence sent to checkout cannot drift apart between them.
 *
 * It only sells. Whether the plan should be offered at all (someone already
 * paying for one is not sold a second) is the caller's decision.
 */
export function OrganizationUpgradePanel({
  title,
  description,
  ctaLabel,
  perOrg = false,
  className,
}: {
  title?: string;
  description?: string;
  ctaLabel?: string;
  /** Prices read "per org": the buyer already has an organization. */
  perOrg?: boolean;
  className?: string;
}) {
  const api = useApi();
  const tUpgrade = useTranslations("organizations.upgrade");
  const [billingInterval, setBillingInterval] =
    React.useState<BillingInterval>("month");
  const [redirecting, setRedirecting] = React.useState(false);

  const features = [
    tUpgrade("features.unlimitedMembers"),
    tUpgrade("features.cheaperRates"),
    tUpgrade("features.virtualNumbers"),
    tUpgrade("features.advancedAnalytics"),
  ];

  const proceed = async () => {
    setRedirecting(true);
    try {
      // The cadence has to be sent: without it the backend prices the
      // subscription monthly, and an annual choice is still billed $20/mo.
      const response = await api.post<{ url: string }>(
        "/stripe/checkout/organization",
        { billingInterval },
      );
      if (response?.url) {
        window.location.href = response.url;
        return;
      }
    } catch (error) {
      console.error("Error creating checkout:", error);
    }
    setRedirecting(false);
  };

  return (
    <div className={cn("space-y-5", className)}>
      {/* Header */}
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          {title ?? tUpgrade("title")}
        </h3>
        <p className="text-muted-foreground text-sm mt-1">
          {description ?? tUpgrade("description")}
        </p>
      </div>

      {/* Features */}
      <div className="space-y-2.5">
        {features.map((feature, i) => (
          <div key={i} className="flex items-center gap-2.5 text-sm">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
            </div>
            <span className="text-muted-foreground">{feature}</span>
          </div>
        ))}
      </div>

      {/* Billing interval toggle */}
      <div className="inline-flex w-full rounded-lg border border-border/50 bg-muted/50 p-1">
        <button
          type="button"
          onClick={() => setBillingInterval("month")}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            billingInterval === "month"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tUpgrade("billingMonthly")}
        </button>
        <button
          type="button"
          onClick={() => setBillingInterval("year")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            billingInterval === "year"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tUpgrade("billingAnnual")}
          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            {tUpgrade("annualSavings")}
          </span>
        </button>
      </div>

      {/* Pricing Highlight */}
      <div className="rounded-lg bg-muted/50 p-3 flex items-center justify-between border border-border/50">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {tUpgrade("pricing")}
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-foreground">
              {billingInterval === "year" ? "$200" : "$20"}
            </span>
            <span className="text-xs text-muted-foreground">
              {billingInterval === "year"
                ? tUpgrade(perOrg ? "perYearPerOrg" : "perYear")
                : tUpgrade(perOrg ? "perMonthPerOrg" : "perMonth")}
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20 px-2 py-1 rounded-full">
            {tUpgrade("proPlan")}
          </span>
        </div>
      </div>

      {/* CTA */}
      <Button
        onClick={proceed}
        size="lg"
        disabled={redirecting}
        className={cn(
          "w-full font-semibold transition-all duration-300",
          "bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-white border-0",
          "cursor-pointer shadow-[0_0_15px_-4px_rgba(45,212,191,0.5)] hover:scale-[1.02] hover:brightness-110",
        )}
      >
        <Zap className="mr-2 h-4 w-4 fill-white" />
        {ctaLabel ?? tUpgrade("proceedToUpgrade")}
      </Button>

      {/* Footer */}
      <div className="text-muted-foreground flex items-center justify-between border-t pt-3 text-[10px]">
        <div className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3 text-emerald-500" />
          {tUpgrade("secureByStripe")}
        </div>
        <div className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          {tUpgrade("cancelAnytime")}
        </div>
      </div>
    </div>
  );
}
