'use client';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { UserAvatarProfile } from '@ringee/frontend-shared/components/user-avatar-profile';
import { SignOutButton, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Icons } from '@ringee/frontend-shared/components/icons';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { useTranslations } from 'next-intl';

export function UserNav({ useMock }: { useMock?: boolean }) {
  const { user } = useMock
    ? {
        user: {
          imageUrl: '/edison.jpg',
          fullName: 'Edison J. Padilla',
          emailAddresses: [{ emailAddress: 'edisonjpp@gmail.com' }],
          phoneNumbers: []
        }
      }
    : useUser();
  const router = useRouter();

  const { canAccessAdminFeatures } = useMock
    ? { canAccessAdminFeatures: true }
    : useOrgRole();
  const t = useTranslations('navigation.userMenu');
  const tNavigation = useTranslations('navigation');

  if (user) {
    const identity =
      user.emailAddresses[0]?.emailAddress ??
      user.phoneNumbers[0]?.phoneNumber ??
      '';

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='relative h-8 w-8 rounded-full'>
            <UserAvatarProfile user={user} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className='w-56'
          align='end'
          sideOffset={10}
          forceMount
        >
          <DropdownMenuLabel className='font-normal'>
            <div className='flex flex-col space-y-1'>
              <p className='text-sm leading-none font-medium'>
                {user.fullName}
              </p>
              <p className='text-muted-foreground text-xs leading-none'>
                {identity}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
              {/* @ts-ignore */}
              <Icons.user className='mr-2 h-4 w-4' />
              {t('profile')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/dashboard/history')}>
              {/* @ts-ignore */}
              <Icons.history className='mr-2 h-4 w-4' />
              {t('history')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push('/dashboard/recordings')}
            >
              {/* @ts-ignore */}
              <Icons.mic className='mr-2 h-4 w-4' />
              {t('recordings')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push('/dashboard/settings/overview')}
            >
              {/* @ts-ignore */}
              <Icons.settings className='mr-2 h-4 w-4' />
              {tNavigation('groups.settings')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push('/dashboard/settings/integrations')}
            >
              {/* @ts-ignore */}
              <Icons.plug className='mr-2 h-4 w-4' />
              {tNavigation('items.integrations')}
            </DropdownMenuItem>
          </DropdownMenuGroup>

          {canAccessAdminFeatures && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => router.push('/dashboard/rate')}
                >
                  {/* @ts-ignore */}
                  <Icons.star className='mr-2 h-4 w-4' />
                  {t('rate')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push('/dashboard/buy-number')}
                >
                  {/* @ts-ignore */}
                  <Icons.phoneCall className='mr-2 h-4 w-4' />
                  {t('buyNumber')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push('/dashboard/billing')}
                >
                  <Icons.billing className='mr-2 h-4 w-4' />
                  {t('billing')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <SignOutButton redirectUrl='/auth/sign-in' />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
}
