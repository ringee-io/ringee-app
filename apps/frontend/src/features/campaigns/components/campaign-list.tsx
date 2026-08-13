'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { Plus, Search, Target, Users, Phone, Clock } from 'lucide-react';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import { useTranslations } from 'next-intl';
import type {
  Campaign,
  CampaignListResponse,
  CampaignStatus
} from '../types/campaign.types';

const STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-300',
  active: 'bg-green-100 text-green-700 border-green-300',
  paused: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  completed: 'bg-blue-100 text-blue-700 border-blue-300'
};

function CampaignCard({
  campaign,
  onClick
}: {
  campaign: Campaign;
  onClick: () => void;
}) {
  const t = useTranslations('campaigns');
  const leadCount = campaign._count?.leads ?? 0;

  return (
    <Card
      className='cursor-pointer transition-shadow hover:shadow-md'
      onClick={onClick}
    >
      <CardHeader className='pb-3'>
        <div className='flex items-start justify-between'>
          <div className='space-y-1'>
            <CardTitle className='text-lg'>{campaign.name}</CardTitle>
            {campaign.description && (
              <CardDescription className='line-clamp-2'>
                {campaign.description}
              </CardDescription>
            )}
          </div>
          <Badge variant='outline' className={STATUS_COLORS[campaign.status]}>
            {t(`status.${campaign.status}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className='text-muted-foreground flex items-center gap-4 text-sm'>
          <div className='flex items-center gap-1'>
            <Users className='h-4 w-4' />
            <span>{t('card.leads', { count: leadCount })}</span>
          </div>
          <div className='flex items-center gap-1'>
            <Phone className='h-4 w-4' />
            <span>{t(`modes.${campaign.dialerMode}`)}</span>
          </div>
          <div className='flex items-center gap-1'>
            <Clock className='h-4 w-4' />
            <span>{t('card.maxAttempts', { count: campaign.maxAttempts })}</span>
          </div>
        </div>
        <div className='text-muted-foreground mt-3 text-xs'>
          {t('card.created', {
            date: new Date(campaign.createdAt).toLocaleDateString()
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function CampaignListSkeleton() {
  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className='pb-3'>
            <Skeleton className='h-6 w-3/4' />
            <Skeleton className='h-4 w-1/2' />
          </CardHeader>
          <CardContent>
            <Skeleton className='h-4 w-full' />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function CampaignList() {
  const api = useApi();
  const router = useRouter();
  const t = useTranslations('campaigns');
  // Only org admins can create/manage campaigns; members get read-only access.
  const { isOrgAdmin } = useOrgRole();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 12;

  useEffect(() => {
    loadCampaigns();
  }, [page, statusFilter]);

  async function loadCampaigns() {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit };
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;

      const res = await api.get<CampaignListResponse>('/campaigns', params);
      setCampaigns(res.data);
      setTotal(res.meta.total);
    } catch {
      // error handled by api client
    } finally {
      setLoading(false);
    }
  }

  function handleSearch() {
    setPage(1);
    loadCampaigns();
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-3 sm:flex-row'>
        <div className='relative flex-1'>
          <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
          <Input
            placeholder={t('list.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className='pl-9'
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className='w-full sm:w-[160px]'>
            <SelectValue placeholder={t('list.allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{t('list.allStatuses')}</SelectItem>
            <SelectItem value='draft'>{t('status.draft')}</SelectItem>
            <SelectItem value='active'>{t('status.active')}</SelectItem>
            <SelectItem value='paused'>{t('status.paused')}</SelectItem>
            <SelectItem value='completed'>{t('status.completed')}</SelectItem>
          </SelectContent>
        </Select>
        {isOrgAdmin && (
          <Button onClick={() => router.push('/dashboard/campaigns/new')}>
            <Plus className='mr-2 h-4 w-4' />
            {t('newCampaign')}
          </Button>
        )}
      </div>

      {loading ? (
        <CampaignListSkeleton />
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className='flex flex-col items-center justify-center py-16'>
            <Target className='text-muted-foreground mb-4 h-12 w-12' />
            <h3 className='text-lg font-semibold'>{t('empty.title')}</h3>
            <p className='text-muted-foreground mt-1 text-sm'>
              {isOrgAdmin ? t('empty.description') : t('empty.memberDescription')}
            </p>
            {isOrgAdmin && (
              <Button
                className='mt-4'
                onClick={() => router.push('/dashboard/campaigns/new')}
              >
                <Plus className='mr-2 h-4 w-4' />
                {t('empty.action')}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
            {campaigns.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onClick={() =>
                  router.push(`/dashboard/campaigns/${campaign.id}`)
                }
              />
            ))}
          </div>
          {totalPages > 1 && (
            <div className='flex items-center justify-between'>
              <p className='text-muted-foreground text-sm'>
                {t('list.showing', {
                  from: (page - 1) * limit + 1,
                  to: Math.min(page * limit, total),
                  total
                })}
              </p>
              <div className='flex gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  {t('list.previous')}
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  {t('list.next')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
