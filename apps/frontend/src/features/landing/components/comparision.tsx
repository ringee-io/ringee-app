'use client';

import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@ringee/frontend-shared/lib/utils';

const comparisonData = [
  {
    feature: 'Browser-based (no install)',
    ringee:
      'Make and receive calls directly from your web browser — no softphone install required.',
    adversus:
      'Web-based platform focused on outbound campaigns and call-center workflows.',
    genesys:
      'Cloud contact-center suite; agents typically use dedicated web or desktop apps.'
  },
  {
    feature: 'Start with 1 user',
    ringee: 'No minimum users — start solo and add team members as you grow.',
    adversus: false, // min. 3 agents
    genesys: false // enterprise focus, no solo user
  },
  {
    feature: 'Pricing model',
    ringee:
      'Pay-as-you-go for minutes & numbers + optional $20/month business plan per organization (unlimited members).',
    adversus:
      'Per-seat subscription with monthly/annual billing and a minimum number of agent users.',
    genesys:
      'Enterprise per-seat / contract pricing, usually tied to larger deployments.'
  },
  {
    feature: 'Per-seat subscription',
    ringee:
      'NO PER-SEAT PRICING — flat $20/month per organization with unlimited team members.',
    adversus: true,
    genesys: true
  },
  {
    feature: 'Typical monthly minimum',
    ringee:
      'Start with $0 in fixed fees — just top up credits. Add the $20/month business plan only when you need team features.',
    adversus:
      'From 122 €/month per agent, minimum 3 agent users (366 €/month) for unlimited EU + US + Canada calls, excl. VAT.',
    genesys:
      'Custom enterprise quote, typically higher ACV and multi-year contracts.'
  },
  {
    feature: 'Global coverage',
    ringee:
      'Call and receive in 180+ countries with transparent global rates.',
    adversus:
      'Core focus on unlimited calls in EU + US + Canada. Other destinations depend on your plan and carrier setup.',
    genesys: true // global enterprise reach
  },
  {
    feature: 'Outbound sales dialer',
    ringee:
      'Great for manual and semi-structured outbound and cold calling from browser or mobile.',
    adversus: true,
    genesys: true
  },
  {
    feature: 'Ideal for small teams & startups',
    ringee:
      'Designed so solo founders and small teams can start small, then scale usage and members without extra seat fees.',
    adversus:
      'Better fit once you already have a dedicated outbound team and steady call volume.',
    genesys: false
  },
  {
    feature: 'Setup time',
    ringee:
      'Sign up and start calling in minutes — no implementation project required.',
    adversus:
      'Requires setting up campaigns, dispositions, lead flows and agent configuration.',
    genesys:
      'Enterprise onboarding, integrations and configuration with IT involvement.'
  }
];

export default function Comparison() {
  return (
    <div id="comparison" className="xs:py-20 w-full px-6 py-12">
      <h2 className="xs:text-4xl text-center text-3xl font-bold tracking-tight sm:text-5xl">
        Compare <span className="text-primary">Ringee.io</span>
      </h2>
      <p className="text-muted-foreground mt-3 text-center text-sm md:text-base">
        How Ringee compares to Adversus and Genesys if you want flexible, browser-based outbound calling
        without expensive per-seat contracts.
      </p>

      {/* Scrollable wrapper */}
      <div className="bg-background/50 mx-auto mt-12 w-full max-w-screen-lg overflow-x-auto rounded-xl border">
        <div className="min-w-[700px]">
          <table className="w-full text-sm md:text-base">
            <thead>
              <tr className="bg-muted/40 text-muted-foreground">
                <th className="text-foreground/90 px-4 py-4 text-left font-semibold">
                  Features
                </th>
                <th className="text-primary px-4 py-4 text-left font-semibold">
                  Ringee.io
                </th>
                <th className="px-4 py-4 text-left font-semibold">
                  Adversus
                </th>
                <th className="px-4 py-4 text-left font-semibold">
                  Genesys
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map((item, i) => (
                <tr
                  key={i}
                  className={cn(
                    'border-border/40 border-t transition-colors',
                    i % 2 === 0 ? 'bg-muted/20' : 'bg-background/30'
                  )}
                >
                  {/* Feature */}
                  <td className="text-muted-foreground px-4 py-4 font-medium">
                    {item.feature}
                  </td>

                  {/* Ringee (siempre con check + texto) */}
                  <td className="text-foreground px-4 py-4">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      <span>{item.ringee}</span>
                    </div>
                  </td>

                  {/* Adversus */}
                  <td className="text-foreground px-4 py-4">
                    {item.adversus === true ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : item.adversus === false ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <div className="flex items-center gap-2 text-yellow-500">
                        <AlertTriangle className="h-8 w-8" />
                        <span className="text-[13px] text-foreground/80">
                          {item.adversus}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Genesys */}
                  <td className="text-foreground px-4 py-4">
                    {item.genesys === true ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : item.genesys === false ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <div className="flex items-center gap-2 text-yellow-500">
                        <AlertTriangle className="h-8 w-8" />
                        <span className="text-[13px] text-foreground/80">
                          {item.genesys}
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-muted-foreground mt-8 mb-5 text-center text-xs md:text-sm">
        * Adversus and Genesys typically charge per seat with higher fixed monthly commitments, while Ringee
        keeps a flat $20/month per organization with unlimited members.
      </p>
    </div>
  );
}
