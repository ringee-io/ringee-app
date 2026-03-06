'use client';
import { navItems } from '../../constants/data';
import {
  KBarAnimator,
  KBarPortal,
  KBarPositioner,
  KBarProvider,
  KBarSearch,
  useRegisterActions
} from 'kbar';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import RenderResults from './render-result';
import useThemeSwitching from './use-theme-switching';
import { useOrgRole } from '../../hooks/use-org-role';

export default function KBar({ children }: { children: React.ReactNode }) {
  return (
    <KBarProvider>
      <KBarComponent>{children}</KBarComponent>
    </KBarProvider>
  );
}

const KBarComponent = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const { canAccessAdminFeatures, hiddenForMember } = useOrgRole();
  
  useThemeSwitching();

  // Build and register navigation actions dynamically based on role
  const actions = useMemo(() => {
    const navigateTo = (url: string) => {
      router.push(url);
    };

    return navItems.flatMap((navItem) => {
      // Filter base action if it's in hidden list
      const shouldShowBase = canAccessAdminFeatures || !hiddenForMember.includes(navItem.title);
      
      const baseAction =
        navItem.url !== '#' && shouldShowBase
          ? {
              id: `${navItem.title.toLowerCase()}Action`,
              name: navItem.title,
              shortcut: navItem.shortcut,
              keywords: navItem.title.toLowerCase(),
              section: 'Navigation',
              subtitle: `Go to ${navItem.title}`,
              perform: () => navigateTo(navItem.url)
            }
          : null;

      // Map child items into actions, filtering based on role
      const childActions =
        navItem.items
          ?.filter((childItem) => 
            canAccessAdminFeatures || !hiddenForMember.includes(childItem.title)
          )
          .map((childItem) => ({
            id: `${childItem.title.toLowerCase()}Action`,
            name: childItem.title,
            shortcut: childItem.shortcut,
            keywords: childItem.title.toLowerCase(),
            section: navItem.title,
            subtitle: `Go to ${childItem.title}`,
            perform: () => navigateTo(childItem.url)
          })) ?? [];

      return baseAction ? [baseAction, ...childActions] : childActions;
    });
  }, [router, canAccessAdminFeatures, hiddenForMember]);

  // Register actions dynamically - this updates when role changes
  useRegisterActions(actions, [actions]);

  return (
    <>
      <KBarPortal>
        <KBarPositioner className='bg-background/80 fixed inset-0 z-99999 p-0! backdrop-blur-sm'>
          <KBarAnimator className='bg-card text-card-foreground relative mt-64! w-full max-w-[600px] -translate-y-12! overflow-hidden rounded-lg border shadow-lg'>
            <div className='bg-card border-border sticky top-0 z-10 border-b'>
              <KBarSearch className='bg-card w-full border-none px-6 py-4 text-lg outline-hidden focus:ring-0 focus:ring-offset-0 focus:outline-hidden' />
            </div>
            <div className='max-h-[400px]'>
              <RenderResults />
            </div>
          </KBarAnimator>
        </KBarPositioner>
      </KBarPortal>
      {children}
    </>
  );
};
