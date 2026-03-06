'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Progress } from '@ringee/frontend-shared/components/ui/progress';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
} from '@ringee/frontend-shared/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ringee/frontend-shared/components/ui/collapsible';
import {
  X,
  ChevronDown,
  ChevronUp,
  Minimize2,
  Maximize2,
  Sparkles,
} from 'lucide-react';

import { useOnboarding } from '../hooks/use.onboarding';
import { useOnboardingUIStore } from '../store/onboarding.store';
import { OnboardingStepItem } from './onboarding-step';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import type { OnboardingStep, OnboardingStepConfig } from '../types/onboarding.types';

export function OnboardingGuide() {
  const router = useRouter();
  const { canAccessAdminFeatures, hasOrg, isLoaded: isOrgLoaded } = useOrgRole();
  const {
    status,
    isLoading,
    shouldShow,
    progress,
    completedCount,
    totalSteps,
    completeStep,
    dismiss,
    isStepComplete,
  } = useOnboarding();
  
  const { isExpanded, isMinimized, toggleExpanded, toggleMinimized } = useOnboardingUIStore();
  const [isDismissing, setIsDismissing] = useState(false);

  // Define step configurations with actions
  const stepConfigs: OnboardingStepConfig[] = useMemo(
    () => [
      {
        id: 'first_call' as OnboardingStep,
        title: 'Make your first call',
        description: 'Ringee offers your first call for free',
        icon: 'phone',
        action: () => {
          router.push('/dashboard/call');
        },
      },
      {
        id: 'recording' as OnboardingStep,
        title: 'Record and listen',
        description: 'Record a call and listen to the recording',
        icon: 'mic',
        action: () => {
          router.push('/dashboard/recordings');
        },
      },
      {
        id: 'check_numbers' as OnboardingStep,
        title: 'Explore available numbers',
        description: 'Discover numbers you can buy',
        icon: 'hash',
        action: () => {
          router.push('/dashboard/buy-number');
        },
      },
      {
        id: 'buy_credits' as OnboardingStep,
        title: 'Buy credits',
        description: 'Add credits to make more calls',
        icon: 'credit-card',
        requiresAdmin: true,
        action: () => {
          router.push('/dashboard/overview');
        },
      },
    ],
    [router, completeStep]
  );

  // Filter steps based on org role
  const visibleSteps = useMemo(() => {
    return stepConfigs.filter((step) => {
      // buy_credits step visibility rules:
      // - If user is NOT in an org: Always show
      // - If user is in an org: Only show if admin
      if (step.id === 'buy_credits') {
        return !hasOrg || canAccessAdminFeatures;
      }
      return true;
    });
  }, [stepConfigs, hasOrg, canAccessAdminFeatures]);

  // Handle dismiss
  const handleDismiss = async () => {
    setIsDismissing(true);
    try {
      await dismiss();
    } finally {
      setIsDismissing(false);
    }
  };

  // Don't show while loading or if dismissed/completed
  if (!isOrgLoaded || isLoading || !shouldShow) {
    return null;
  }

  // Minimized state - show just a small indicator
  if (isMinimized) {
    return (
      <Button
        onClick={toggleMinimized}
        variant="outline"
        size="sm"
        className="fixed bottom-[100px] right-4 z-50 gap-2 shadow-lg hover:shadow-xl transition-all duration-200"
      >
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium">
          {completedCount}/{visibleSteps.length} completed
        </span>
        <Maximize2 className="h-3.5 w-3.5" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-[100px] right-4 z-50  shadow-2xl border-border/50 bg-background/95 backdrop-blur-sm">
      {/* Header */}
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Setup guide</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={toggleMinimized}
              title="Minimize"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleDismiss}
              disabled={isDismissing}
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <Progress value={progress} className="h-1.5" />
          <p className="text-xs text-muted-foreground">
            {completedCount} of {visibleSteps.length} steps completed
          </p>
        </div>
      </CardHeader>

      {/* Steps list */}
      <CardContent className="px-2 pb-3">
        <Collapsible open={isExpanded} onOpenChange={toggleExpanded}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between mb-1 text-muted-foreground hover:text-foreground"
            >
              <span className="text-xs">
                {isExpanded ? 'Hide steps' : 'Show steps'}
              </span>
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-1">
            {visibleSteps.map((stepConfig, index) => (
              <OnboardingStepItem
                key={stepConfig.id}
                config={stepConfig}
                isCompleted={isStepComplete(stepConfig.id)}
                isActive={
                  !isStepComplete(stepConfig.id) &&
                  visibleSteps
                    .slice(0, index)
                    .every((s) => isStepComplete(s.id))
                }
                onClick={stepConfig.action}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
