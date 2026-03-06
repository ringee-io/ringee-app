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

export function UserNav({ useMock }: { useMock?: boolean }) {
  const { user } = useMock
    ? {
        user: {
          imageUrl: '/edison.jpg',
          fullName: 'Edison J. Padilla',
          emailAddresses: [{ emailAddress: 'edisonjpp@gmail.com' }]
        }
      }
    : useUser();
  const router = useRouter();
  if (user) {
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
                {user.emailAddresses[0].emailAddress}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
              {/* @ts-ignore */}
              <Icons.user className='mr-2 h-4 w-4' />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/dashboard/rate')}>
              {/* @ts-ignore */}
              <Icons.star className='mr-2 h-4 w-4' />
              Rate
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push('/dashboard/buy-number')}
            >
              {/* @ts-ignore */}
              <Icons.phoneCall className='mr-2 h-4 w-4' />
              Buy Number
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/dashboard/history')}>
              {/* @ts-ignore */}
              <Icons.history className='mr-2 h-4 w-4' />
              History
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <SignOutButton redirectUrl='/auth/sign-in' />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
}
