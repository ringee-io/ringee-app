'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@ringee/frontend-shared/components/ui/tooltip';
import { CircleCheck, CircleHelp, Building2 } from 'lucide-react';
import Link from 'next/link';

const tooltipContent = {
  calls:
    'Pay only for what you use. Outbound calls start at $0.020/min and vary by destination.',
  numbers:
    'Rent local or international phone numbers starting at $1.90/month in over 50 countries.',
  recording:
    'Record and download your calls for quality assurance and compliance.',
  coverage:
    'Ringee lets you call and receive calls in more than 180 countries with high-quality VoIP routes.',
  business:
    'Designed for teams and sales operations — includes everything in the individual plan plus team features, better rates and priority support.'
};

export default function Pricing() {
  return (
    <div
      id="pricing"
      className="xs:py-20 flex flex-col items-center justify-center px-6 py-12"
    >
      <h1 className="xs:text-4xl text-center text-3xl font-bold tracking-tight md:text-5xl">
        Pricing for Individuals & Teams
      </h1>
      <p className="text-muted-foreground mt-3 max-w-2xl text-center text-base">
        Start as an individual with pay-as-you-go, or upgrade to a business
        plan for collaboration and better volume pricing. Make and receive
        calls to <strong>180+ countries</strong> and rent numbers in{' '}
        <strong>50+</strong> — instant setup, full control.
      </p>

      <div className="mx-auto mt-12 grid max-w-screen-lg grid-cols-1 gap-8 md:grid-cols-2">
        {/* Individuals / B2C */}
        <div className="bg-background/50 relative flex flex-col rounded-xl border p-6">
          <div className="flex flex-1 flex-col">
            <h3 className="text-lg font-medium">For Individuals (Pay as You Go)</h3>
            <p className="mt-2 text-4xl font-bold">$0.020</p>
            <p className="text-muted-foreground text-sm font-medium">
              per minute (starting rate) — numbers from $1.90/month
            </p>
            <Separator className="my-6" />
            <ul className="flex-1 space-y-2">
              <li className="flex items-start gap-1.5">
                <CircleCheck className="mt-1 h-4 w-4 text-green-600" />
                Outbound calling worldwide
                <Tooltip>
                  <TooltipTrigger className="cursor-help">
                    <CircleHelp className="mt-1 h-4 w-4 text-gray-500" />
                  </TooltipTrigger>
                  <TooltipContent>{tooltipContent.coverage}</TooltipContent>
                </Tooltip>
              </li>
              <li className="flex items-start gap-1.5">
                <CircleCheck className="mt-1 h-4 w-4 text-green-600" />
                Real-time billing by second
              </li>
              <li className="flex items-start gap-1.5">
                <CircleCheck className="mt-1 h-4 w-4 text-green-600" />
                Optional call recording
                <Tooltip>
                  <TooltipTrigger className="cursor-help">
                    <CircleHelp className="mt-1 h-4 w-4 text-gray-500" />
                  </TooltipTrigger>
                  <TooltipContent>{tooltipContent.recording}</TooltipContent>
                </Tooltip>
              </li>
              <li className="flex items-start gap-1.5">
                <CircleCheck className="mt-1 h-4 w-4 text-green-600" />
                Rent local or toll-free numbers
                <Tooltip>
                  <TooltipTrigger className="cursor-help">
                    <CircleHelp className="mt-1 h-4 w-4 text-gray-500" />
                  </TooltipTrigger>
                  <TooltipContent>{tooltipContent.numbers}</TooltipContent>
                </Tooltip>
              </li>
              <li className="flex items-start gap-1.5">
                <CircleCheck className="mt-1 h-4 w-4 text-green-600" />
                Instant activation and verification
              </li>
              <li className="flex items-start gap-1.5">
                <CircleCheck className="mt-1 h-4 w-4 text-green-600" />
                Manage multiple numbers easily
              </li>
            </ul>
          </div>

          <Link href="/auth/sign-up">
            <Button size="lg" className="mt-4 w-full cursor-pointer">
              Make a Free 1-Minute Call
            </Button>
          </Link>
        </div>

        {/* Business / B2B */}
        <div className="bg-background/50 relative flex flex-col rounded-xl border p-6">
          <div className="flex flex-1 flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">For Teams & Companies</h3>
              <Building2 className="text-primary h-5 w-5" />
            </div>
            <p className="mt-2 text-4xl font-bold">$20.00</p>
            <p className="text-muted-foreground text-sm font-medium">
              per month — business features on top of pay-as-you-go usage
            </p>
            <Separator className="my-6" />
            <ul className="flex-1 space-y-2">
              <li className="flex items-start gap-1.5">
                <CircleCheck className="mt-1 h-4 w-4 text-green-600" />
                Everything in the Individual plan
              </li>
              <li className="flex items-start gap-1.5">
                <CircleCheck className="mt-1 h-4 w-4 text-green-600" />
                Team collaboration and shared dashboards
              </li>
              <li className="flex items-start gap-1.5">
                <CircleCheck className="mt-1 h-4 w-4 text-green-600" />
                Unlimited members in your team
              </li>
              <li className="flex items-start gap-1.5">
                <CircleCheck className="mt-1 h-4 w-4 text-green-600" />
                Cheaper per-minute rates with volume
                <Tooltip>
                  <TooltipTrigger className="cursor-help">
                    <CircleHelp className="mt-1 h-4 w-4 text-gray-500" />
                  </TooltipTrigger>
                  <TooltipContent>{tooltipContent.business}</TooltipContent>
                </Tooltip>
              </li>
              <li className="flex items-start gap-1.5">
                <CircleCheck className="mt-1 h-4 w-4 text-green-600" />
                Priority support and onboarding
              </li>
            </ul>
          </div>

          <Link href="/auth/sign-up">
            <Button className="mt-4 w-full cursor-pointer" size="lg">
              Go to Sign Up
            </Button>
          </Link>
        </div>
      </div>

      <div className="text-muted-foreground mt-10 text-center text-sm">
        * Rates may vary slightly by country. Taxes and carrier fees not
        included.
      </div>
    </div>
  );
}
