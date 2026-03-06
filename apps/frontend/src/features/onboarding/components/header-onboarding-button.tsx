'use client';

import { cn } from '@ringee/frontend-shared/lib/utils';
import { useOnboarding } from '../hooks/use.onboarding';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@ringee/frontend-shared/components/ui/tooltip';

/**
 * Header button that appears when user dismissed onboarding but hasn't completed all steps.
 * Clicking it brings the onboarding guide back.
 */
export function HeaderOnboardingButton() {
  const { showHeaderButton, undismiss, completedCount, totalSteps, isLoading } = useOnboarding();

  if (isLoading || !showHeaderButton) {
    return null;
  }

  const progressPercent = (completedCount / totalSteps) * 100;
  const circumference = 2 * Math.PI * 8; // radius = 8 (smaller ring)
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  const handleClick = async () => {
    try {
      await undismiss();
    } catch (err) {
      console.error('Failed to restore onboarding:', err);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={handleClick}
            variant="outline"
            size="sm"
            className={cn(
              "h-8 rounded-full gap-2 pl-2 pr-3",
              "border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/30",
              "text-primary hover:text-primary",
              "transition-all duration-300 shadow-sm cursor-pointer"
            )}
          >
            {/* Circular progress indicator */}
            <div className="relative h-4 w-4">
              <svg className="h-4 w-4 -rotate-90" viewBox="0 0 20 20">
                {/* Background circle */}
                <circle
                  cx="10"
                  cy="10"
                  r="8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="text-primary/20"
                />
                {/* Progress circle */}
                <circle
                  cx="10"
                  cy="10"
                  r="8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  className="text-primary transition-all duration-500 ease-out"
                  style={{
                    strokeDasharray: circumference,
                    strokeDashoffset: strokeDashoffset,
                  }}
                />
              </svg>
            </div>
            
            <span className="text-xs font-semibold">
              Setup guide <span className="opacity-75 font-normal ml-0.5">• {Math.round(progressPercent)}%</span>
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs font-medium">
          Resume onboarding progress
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

