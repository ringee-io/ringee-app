'use client';

import { useEffect, useState } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import { UserPlus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { CampaignStatus } from '../types/campaign.types';

interface CampaignMember {
  id: string;
  campaignId: string;
  userId: string;
  role: string;
  assignedAt: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    clerkId: string | null;
    emails?: { email: string }[];
  };
}

interface OrgMember {
  clerkUserId: string;
  dbUserId: string;
  name: string;
  email: string;
}

interface Props {
  campaignId: string;
  campaignStatus: CampaignStatus;
  /** Org admins (and freelancers) can add/remove members; members are read-only. */
  canManage?: boolean;
}

export function CampaignMembersTab({
  campaignId,
  campaignStatus,
  canManage = false
}: Props) {
  const api = useApi();
  const t = useTranslations('campaigns.members');
  const { organization, isLoaded: isOrgLoaded } = useOrganization();

  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const isCompleted = campaignStatus === 'completed';

  useEffect(() => {
    loadMembers();
  }, [campaignId]);

  useEffect(() => {
    if (isOrgLoaded && organization) {
      loadOrgMembers();
    }
  }, [isOrgLoaded, organization]);

  async function loadMembers() {
    setLoading(true);
    try {
      const data = await api.get<CampaignMember[]>(
        `/campaigns/${campaignId}/members`
      );
      setMembers(data);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }

  async function loadOrgMembers() {
    if (!organization) return;
    try {
      const res = await organization.getMemberships();
      const clerkUserIds = res.data
        .map((m) => m.publicUserData?.userId)
        .filter(Boolean) as string[];

      if (clerkUserIds.length === 0) {
        setOrgMembers([]);
        return;
      }

      const dbUserMap = await api.get<{ clerkId: string; id: string }[]>(
        `/user/by-clerk-ids?ids=${clerkUserIds.join(',')}`
      );
      const clerkToDbId = new Map(dbUserMap.map((u) => [u.clerkId, u.id]));

      setOrgMembers(
        res.data
          .map((m) => {
            const clerkUserId = m.publicUserData?.userId || '';
            return {
              clerkUserId,
              dbUserId: clerkToDbId.get(clerkUserId) || '',
              name:
                `${m.publicUserData?.firstName || ''} ${m.publicUserData?.lastName || ''}`.trim() ||
                'Unknown',
              email: m.publicUserData?.identifier || ''
            };
          })
          .filter((m) => m.dbUserId)
      );
    } catch {
      // handled
    }
  }

  async function handleAdd() {
    if (!selectedUserId) return;
    setAdding(true);
    try {
      await api.post(`/campaigns/${campaignId}/members`, {
        userId: selectedUserId
      });
      setSelectedUserId('');
      await loadMembers();
      toast.success(t('toasts.added'));
    } catch (err: any) {
      toast.error(err?.message || t('toasts.addError'));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(userId: string) {
    setRemovingId(userId);
    try {
      await api.delete(`/campaigns/${campaignId}/members/${userId}`);
      await loadMembers();
      toast.success(t('toasts.removed'));
    } catch (err: any) {
      toast.error(err?.message || t('toasts.removeError'));
    } finally {
      setRemovingId(null);
    }
  }

  const assignedUserIds = new Set(members.map((m) => m.userId));
  const availableMembers = orgMembers.filter(
    (m) => !assignedUserIds.has(m.dbUserId)
  );

  function getMemberName(member: CampaignMember): string {
    const { firstName, lastName } = member.user;
    const name = `${firstName || ''} ${lastName || ''}`.trim();
    return name || t('unknown');
  }

  function getMemberEmail(member: CampaignMember): string {
    return member.user.emails?.[0]?.email || '';
  }

  if (loading) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-[200px] w-full' />
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {canManage && !isCompleted && (
        <Card>
          <CardHeader>
            <CardTitle>{t('add.title')}</CardTitle>
            <CardDescription>{t('add.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='flex items-end gap-3'>
              <div className='flex-1'>
                <Select
                  value={selectedUserId}
                  onValueChange={setSelectedUserId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('add.placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMembers.length === 0 ? (
                      <SelectItem value='__none' disabled>
                        {t('add.noneAvailable')}
                      </SelectItem>
                    ) : (
                      availableMembers.map((m) => (
                        <SelectItem key={m.dbUserId} value={m.dbUserId}>
                          <span className='flex flex-col'>
                            <span>{m.name}</span>
                            <span className='text-muted-foreground text-xs'>
                              {m.email}
                            </span>
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAdd} disabled={!selectedUserId || adding}>
                {adding ? (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                ) : (
                  <UserPlus className='mr-2 h-4 w-4' />
                )}
                {t('add.submit')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('list.title', { count: members.length })}</CardTitle>
          <CardDescription>{t('list.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className='text-muted-foreground text-sm'>{t('list.empty')}</p>
          ) : (
            <div className='space-y-2'>
              {members.map((member) => (
                <div
                  key={member.id}
                  className='flex items-center justify-between rounded-md border px-4 py-3'
                >
                  <div className='flex items-center gap-3'>
                    <div>
                      <div className='flex items-center gap-2'>
                        <span className='font-medium'>
                          {getMemberName(member)}
                        </span>
                        <Badge
                          variant='outline'
                          className='text-xs capitalize'
                        >
                          {t.has(`roles.${member.role}`)
                            ? t(`roles.${member.role}`)
                            : member.role}
                        </Badge>
                      </div>
                      {getMemberEmail(member) && (
                        <p className='text-muted-foreground text-xs'>
                          {getMemberEmail(member)}
                        </p>
                      )}
                    </div>
                  </div>
                  {canManage && !isCompleted && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant='ghost'
                          size='icon'
                          disabled={removingId === member.userId}
                        >
                          {removingId === member.userId ? (
                            <Loader2 className='h-4 w-4 animate-spin' />
                          ) : (
                            <Trash2 className='text-muted-foreground h-4 w-4' />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t('removeDialog.title')}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('removeDialog.description', {
                              name: getMemberName(member)
                            })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t('removeDialog.cancel')}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleRemove(member.userId)}
                          >
                            {t('removeDialog.confirm')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
