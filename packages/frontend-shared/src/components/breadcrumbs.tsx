"use client";

import { useBreadcrumbs } from "../hooks/use-breadcrumbs";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function Breadcrumbs() {
  const items = useBreadcrumbs();
  const t = useTranslations("common");
  if (items.length === 0) return null;

  if (items.length === 1) {
    return (
      <span className="text-sm font-medium text-foreground py-1 mt-0.5">
        {items[0].title}
      </span>
    );
  }

  const previousItem = items[items.length - 2];

  if (previousItem.title === "Dashboard") return null;

  return (
    <Link
      href={previousItem.link}
      className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-1 mt-0.5"
    >
      <ArrowLeft className="h-4 w-4" />
      {t("backTo", { title: previousItem.title })}
    </Link>
  );
}
