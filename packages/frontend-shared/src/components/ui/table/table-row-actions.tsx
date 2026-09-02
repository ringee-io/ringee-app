"use client";

import { EllipsisVertical, Loader2 } from "lucide-react";
import type * as React from "react";

import { Button } from "../button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../dropdown-menu";
import { cn } from "../../../lib/utils";

interface TableRowActionsProps {
  children: React.ReactNode;
  label: string;
  menuLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
}

/**
 * Canonical row-actions trigger for Ringee tables.
 *
 * Keep row-level operations behind this compact, right-aligned menu instead of
 * spreading several icon buttons across the final cell.
 */
export function TableRowActions({
  children,
  label,
  menuLabel,
  loading = false,
  disabled = false,
  className,
  contentClassName,
}: TableRowActionsProps) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "relative h-8 w-8 p-0 after:absolute after:-inset-1.5",
            className,
          )}
          aria-label={label}
          disabled={disabled || loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <EllipsisVertical className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="sr-only">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn("min-w-40", contentClassName)}
      >
        {menuLabel ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>{menuLabel}</DropdownMenuLabel>
          </DropdownMenuGroup>
        ) : null}
        <DropdownMenuGroup>{children}</DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
