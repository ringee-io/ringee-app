"use client";

import type * as React from "react";

import { cn } from "../../../lib/utils";
import { TableCell, TableHead } from "../table";

export const TABLE_ACTION_COLUMN_SIZE = 160;

const pinnedActionStyles: React.CSSProperties = {
  position: "sticky",
  right: 0,
  width: TABLE_ACTION_COLUMN_SIZE,
  minWidth: TABLE_ACTION_COLUMN_SIZE,
  background: "var(--background)",
  boxShadow: "5px 0 5px -5px var(--border) inset",
  transform: "translateX(var(--table-action-pin-offset, 0px))",
};

export function TableActionHead({
  className,
  style,
  ...props
}: React.ComponentProps<"th">) {
  return (
    <TableHead
      className={cn("text-left", className)}
      style={{ ...style, ...pinnedActionStyles, zIndex: 2 }}
      {...props}
    />
  );
}

export function TableActionCell({
  className,
  style,
  ...props
}: React.ComponentProps<"td">) {
  return (
    <TableCell
      className={cn("text-left", className)}
      style={{ ...style, ...pinnedActionStyles, zIndex: 1 }}
      {...props}
    />
  );
}
