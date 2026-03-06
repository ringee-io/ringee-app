'use client';

import { cn } from '@ringee/frontend-shared/lib/utils';
import {
  Phone,
  Mic,
  Hash,
  CreditCard,
  Check,
  ChevronRight,
  Lock,
} from 'lucide-react';
import type { OnboardingStep, OnboardingStepConfig } from '../types/onboarding.types';

interface OnboardingStepItemProps {
  config: OnboardingStepConfig;
  isCompleted: boolean;
  isLocked?: boolean;
  isActive?: boolean;
  onClick?: () => void;
}

const iconMap = {
  phone: Phone,
  mic: Mic,
  hash: Hash,
  'credit-card': CreditCard,
};

export function OnboardingStepItem({
  config,
  isCompleted,
  isLocked = false,
  isActive = false,
  onClick,
}: OnboardingStepItemProps) {
  const Icon = iconMap[config.icon];

  return (
    <button
      onClick={isLocked ? undefined : onClick}
      disabled={isLocked}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200',
        isLocked
          ? 'cursor-not-allowed opacity-50'
          : 'hover:bg-accent/50 cursor-pointer',
        isActive && !isCompleted && 'bg-accent/30',
        isCompleted && 'opacity-80'
      )}
    >
      {/* Status Icon */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200',
          isCompleted
            ? 'bg-primary/20 text-primary'
            : isLocked
              ? 'bg-muted text-muted-foreground'
              : 'bg-accent text-foreground group-hover:bg-primary/20 group-hover:text-primary'
        )}
      >
        {isCompleted ? (
          <Check className="h-4 w-4" />
        ) : isLocked ? (
          <Lock className="h-3.5 w-3.5" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm font-medium truncate',
            isCompleted && 'line-through text-muted-foreground'
          )}
        >
          {config.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {config.description}
        </p>
      </div>

      {/* Arrow indicator */}
      {!isCompleted && !isLocked && (
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}
