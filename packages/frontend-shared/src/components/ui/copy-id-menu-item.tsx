"use client";

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { DropdownMenuItem } from "./dropdown-menu";

interface CopyIdMenuItemProps {
  /** Identifier of the row or card the menu belongs to. */
  id: string;
  /** Overrides the default "Copy ID" wording. */
  label?: string;
}

/**
 * Canonical "Copy ID" entry for row and card action menus.
 *
 * Every list surface exposes the resource id the same way so a support agent,
 * an API consumer or an MCP call can quote the exact record without opening it.
 */
export function CopyIdMenuItem({ id, label }: CopyIdMenuItemProps) {
  const t = useTranslations("common");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success(t("idCopied"));
    } catch {
      toast.error(t("copyError"));
    }
  };

  return (
    <DropdownMenuItem onClick={handleCopy}>
      <Copy className="h-4 w-4" />
      {label ?? t("copyId")}
    </DropdownMenuItem>
  );
}
