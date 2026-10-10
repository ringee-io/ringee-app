"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import { useOrgMembers } from "../hooks/use-org-members";

interface MemberFilterProps {
  /** Selected member DB userId, or null for "all members". */
  value: string | null;
  onChange: (memberId: string | null) => void;
  className?: string;
}

/**
 * Admin-only member picker (DB userId) over the active organization's members
 * (`useOrgMembers`). Render this only for org admins — callers gate visibility
 * with `useOrgRole().isOrgAdmin`.
 */
export function MemberFilter({
  value,
  onChange,
  className,
}: MemberFilterProps) {
  const t = useTranslations("common.memberFilter");
  const { members: orgMembers } = useOrgMembers();
  const [open, setOpen] = React.useState(false);
  const members = React.useMemo(
    () => orgMembers.map((m) => ({ id: m.id, name: m.name ?? t("member") })),
    [orgMembers, t],
  );

  const selected = members.find((m) => m.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-9 w-[200px] justify-between", className)}
        >
          <span className="flex items-center gap-2 truncate">
            <Users className="h-4 w-4 shrink-0 opacity-60" />
            {selected?.name ?? t("all")}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0">
        <Command>
          <CommandInput placeholder={t("search")} />
          <CommandList>
            <CommandEmpty>{t("noMembers")}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === null ? "opacity-100" : "opacity-0",
                  )}
                />
                {t("all")}
              </CommandItem>
              {members.map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.name}
                  onSelect={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === m.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {m.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
