import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { TeamSettingsView } from '@/features/settings/components/team-settings-view';

export const metadata = {
  title: 'Team | Ringee',
  description: 'Invite teammates and manage who can use this workspace.'
};

/**
 * Team management.
 *
 * This route exists because the Journey's `invite_team` action had nowhere to
 * go — `/dashboard/organization` was referenced in the action map but has never
 * existed. Rather than build a second invitation system, it surfaces Clerk's
 * own organization profile, which is already the system of record: memberships
 * arrive in Ringee through the Clerk webhook, so inviting anywhere else would
 * create two sources of truth for the same fact.
 *
 * Admin-only, mirroring every other workspace-level surface. A personal
 * workspace has no team to manage and is sent back to settings.
 */
export default async function TeamSettingsPage() {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) redirect('/auth/sign-in');
  // No organization means no team: a freelancer is their own workspace.
  if (!orgId) redirect('/dashboard/settings/overview');
  if (orgRole !== 'org:admin') redirect('/dashboard/overview');

  return (
    <PageContainer scrollable>
      <div className='flex flex-1 flex-col space-y-4'>
        <Heading
          title='Team'
          description='Invite teammates and manage who can use this workspace.'
        />
        <Separator />
        <TeamSettingsView />
      </div>
    </PageContainer>
  );
}
