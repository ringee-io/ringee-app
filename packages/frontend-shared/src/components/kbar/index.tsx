"use client";
import { navItems } from "../../constants/data";
import {
  KBarAnimator,
  KBarPortal,
  KBarPositioner,
  KBarProvider,
  KBarSearch,
  useRegisterActions,
} from "kbar";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import RenderResults from "./render-result";
import useThemeSwitching from "./use-theme-switching";
import { useOrgRole } from "../../hooks/use-org-role";
import { useTranslations } from "next-intl";

export default function KBar({ children }: { children: React.ReactNode }) {
  return (
    <KBarProvider>
      <KBarComponent>{children}</KBarComponent>
    </KBarProvider>
  );
}

const ITEM_TITLE_KEYS: Record<string, string> = {
  Dashboard: "items.dashboard",
  Contacts: "items.contacts",
  Activities: "items.activities",
  Meetings: "items.meetings",
  Call: "items.call",
  Inbox: "items.inbox",
  Campaigns: "items.campaigns",
  Callbacks: "items.callbacks",
  DNC: "items.dnc",
  "AI Agents": "items.aiAgents",
  Overview: "items.overview",
  Integrations: "items.integrations",
};

const KBarComponent = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const { canAccessAdminFeatures, hiddenForMember } = useOrgRole();
  const t = useTranslations("navigation.kbar");
  const tNav = useTranslations("navigation");
  const localizeTitle = (title: string) => {
    const key = ITEM_TITLE_KEYS[title];
    return key ? tNav(key) : title;
  };

  useThemeSwitching();

  // Build and register navigation actions dynamically based on role
  const actions = useMemo(() => {
    const navigateTo = (url: string) => {
      router.push(url);
    };

    return navItems.flatMap((navItem) => {
      const shouldShowBase =
        canAccessAdminFeatures || !hiddenForMember.includes(navItem.title);
      const navLabel = localizeTitle(navItem.title);

      const baseAction =
        navItem.url !== "#" && shouldShowBase
          ? {
              id: `${navItem.title.toLowerCase()}Action`,
              name: navLabel,
              shortcut: navItem.shortcut,
              keywords: `${navItem.title.toLowerCase()} ${navLabel.toLowerCase()}`,
              section: t("navigation"),
              subtitle: t("goTo", { page: navLabel }),
              perform: () => navigateTo(navItem.url),
            }
          : null;

      const childActions =
        navItem.items
          ?.filter(
            (childItem) =>
              canAccessAdminFeatures ||
              !hiddenForMember.includes(childItem.title),
          )
          .map((childItem) => {
            const childLabel = localizeTitle(childItem.title);
            return {
              id: `${childItem.title.toLowerCase()}Action`,
              name: childLabel,
              shortcut: childItem.shortcut,
              keywords: `${childItem.title.toLowerCase()} ${childLabel.toLowerCase()}`,
              section: navLabel,
              subtitle: t("goTo", { page: childLabel }),
              perform: () => navigateTo(childItem.url),
            };
          }) ?? [];

      return baseAction ? [baseAction, ...childActions] : childActions;
    });
  }, [router, canAccessAdminFeatures, hiddenForMember, t, tNav]);

  // Register actions dynamically - this updates when role changes
  useRegisterActions(actions, [actions]);

  return (
    <>
      <KBarPortal>
        <KBarPositioner className="bg-background/80 fixed inset-0 z-99999 p-0! backdrop-blur-sm">
          <KBarAnimator className="bg-card text-card-foreground relative mt-64! w-full max-w-[600px] -translate-y-12! overflow-hidden rounded-lg border shadow-lg">
            <div className="bg-card border-border sticky top-0 z-10 border-b">
              <KBarSearch className="bg-card w-full border-none px-6 py-4 text-lg outline-hidden focus:ring-0 focus:ring-offset-0 focus:outline-hidden" />
            </div>
            <div className="max-h-[400px]">
              <RenderResults />
            </div>
          </KBarAnimator>
        </KBarPositioner>
      </KBarPortal>
      {children}
    </>
  );
};
