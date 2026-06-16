"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Users } from "lucide-react";
import { useOrganization } from "@clerk/nextjs";
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
import { useApi } from "../hooks/use.api";

interface MemberFilterProps {
  /** Selected member DB userId, or null for "all members". */
  value: string | null;
  onChange: (memberId: string | null) => void;
  className?: string;
}

/**
 * Admin-only member picker (DB userId). Lists the active organization's members
 * via Clerk + `/user/by-clerk-ids`. Render this only for org admins — callers
 * gate visibility with `useOrgRole().isOrgAdmin`.
 */
export function MemberFilter({
  value,
  onChange,
  className,
}: MemberFilterProps) {
  const t = useTranslations("common.memberFilter");
  const { organization } = useOrganization();
  const api = useApi();
  const [open, setOpen] = React.useState(false);
  const [members, setMembers] = React.useState<{ id: string; name: string }[]>(
    [],
  );

  React.useEffect(() => {
    if (!organization) return;
    let active = true;
    organization.getMemberships().then(async (res) => {
      const clerkIds = res.data
        .map((m) => m.publicUserData?.userId)
        .filter(Boolean) as string[];
      if (clerkIds.length === 0) {
        if (active) setMembers([]);
        return;
      }
      const map = await api.get<{ clerkId: string; id: string }[]>(
        `/user/by-clerk-ids?ids=${clerkIds.join(",")}`,
      );
      if (!active) return;
      const lookup = new Map(map.map((u) => [u.clerkId, u.id]));
      setMembers(
        res.data
          .map((m) => {
            const clerkId = m.publicUserData?.userId || "";
            const name =
              `${m.publicUserData?.firstName || ""} ${
                m.publicUserData?.lastName || ""
              }`.trim() ||
              m.publicUserData?.identifier ||
              t("member");
            return { id: lookup.get(clerkId) || "", name };
          })
          // Drop members whose DB user couldn't be resolved — an empty id is
          // useless for filtering and produces duplicate empty React keys.
          .filter((m) => m.id),
      );
    });
    return () => {
      active = false;
    };
  }, [organization, api, t]);

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
