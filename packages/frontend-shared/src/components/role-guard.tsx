"use client";

import * as React from "react";
import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOrgRole } from "../hooks/use-org-role";

/**
 * Standalone "Access restricted" card shown when a non-admin member reaches an
 * admin-only page (e.g. via direct URL). The link itself is hidden from their
 * navigation, so this is the fallback for bookmarks / typed URLs.
 */
export function AccessRestricted() {
  const t = useTranslations("common.accessRestricted");
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-full">
        <ShieldAlert className="text-muted-foreground h-7 w-7" />
      </div>
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-muted-foreground max-w-sm text-sm">
        {t("description")}
      </p>
    </div>
  );
}

/**
 * Gate for admin-only page bodies. Renders children when the user can access
 * admin features (freelancer with no org, or org admin); otherwise renders the
 * "Access restricted" card. While the role is still loading, renders nothing to
 * avoid a flash of either state.
 */
export function RoleGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, canAccessAdminFeatures } = useOrgRole();
  if (!isLoaded) return null;
  if (!canAccessAdminFeatures) return <AccessRestricted />;
  return <>{children}</>;
}
