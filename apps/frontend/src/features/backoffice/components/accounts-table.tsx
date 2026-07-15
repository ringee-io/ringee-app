'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import {
  Tabs,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
import {
  useBackofficeApi,
  type AccountListItem,
  type AccountType
} from '../api';
import { errorMessage, formatMoney, formatNumber } from '../lib/format';

const PAGE_SIZE = 25;

function SettingsBadges({ item }: { item: AccountListItem }) {
  const flags: { on: boolean; label: string }[] = [
    { on: item.recordAllCalls, label: 'REC' },
    { on: item.transcribeRealtime, label: 'RT' },
    { on: item.transcribeRecordings, label: 'TR' }
  ];
  return (
    <div className='flex flex-wrap gap-1'>
      {flags.map((f) => (
        <Badge
          key={f.label}
          variant={f.on ? 'default' : 'outline'}
          className={f.on ? '' : 'opacity-50'}
        >
          {f.label}
        </Badge>
      ))}
    </div>
  );
}

export function AccountsTable() {
  const api = useBackofficeApi();
  const router = useRouter();

  const [type, setType] = useState<AccountType>('user');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AccountListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listAccounts({
        type,
        search: search || undefined,
        page,
        pageSize: PAGE_SIZE
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load accounts'));
    } finally {
      setLoading(false);
    }
  }, [api, type, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className='space-y-4 sm:space-y-6'>
      <div>
        <h1 className='text-xl font-semibold sm:text-2xl'>Accounts</h1>
        <p className='text-muted-foreground text-sm'>
          Manage customers — credit, numbers, recording and AI pipeline.
        </p>
      </div>

      <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
        <CardHeader className='flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
          <CardTitle>
            {total > 0 ? `${formatNumber(total)} ` : ''}
            {type === 'user' ? 'Users' : 'Organizations'}
          </CardTitle>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
            <Tabs
              className='w-full sm:w-auto'
              value={type}
              onValueChange={(v) => {
                setType(v as AccountType);
                setPage(1);
              }}
            >
              <TabsList className='w-full sm:w-fit'>
                <TabsTrigger value='user'>Users</TabsTrigger>
                <TabsTrigger value='org'>Organizations</TabsTrigger>
              </TabsList>
            </Tabs>
            <Input
              placeholder={
                type === 'user'
                  ? 'Search name or email…'
                  : 'Search name or slug…'
              }
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className='w-full sm:w-64'
            />
          </div>
        </CardHeader>

        <CardContent className='space-y-4 px-4 sm:px-6'>
          <div className='hidden lg:block'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>{type === 'user' ? 'Email' : 'Slug'}</TableHead>
                  <TableHead className='text-right'>Credit</TableHead>
                  <TableHead className='text-right'>Numbers</TableHead>
                  <TableHead className='text-right'>Calls</TableHead>
                  <TableHead>Recording</TableHead>
                  <TableHead>AI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className='text-muted-foreground py-8 text-center'
                    >
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className='text-muted-foreground py-8 text-center'
                    >
                      No accounts found.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow
                      key={item.id}
                      className='cursor-pointer'
                      onClick={() =>
                        router.push(
                          `/backoffice/accounts/${item.type}/${item.id}`
                        )
                      }
                    >
                      <TableCell className='font-medium'>{item.name}</TableCell>
                      <TableCell className='text-muted-foreground'>
                        {item.email || item.slug || '—'}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatMoney(item.creditBalance)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatNumber(item.numbersCount)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {formatNumber(item.callsCount)}
                      </TableCell>
                      <TableCell>
                        <SettingsBadges item={item} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.aiPipelineEnabled ? 'default' : 'outline'
                          }
                          className={item.aiPipelineEnabled ? '' : 'opacity-50'}
                        >
                          {item.aiPipelineEnabled ? 'On' : 'Off'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className='divide-y lg:hidden'>
            {loading && items.length === 0 ? (
              <p className='text-muted-foreground py-8 text-center text-sm'>
                Loading…
              </p>
            ) : items.length === 0 ? (
              <p className='text-muted-foreground py-8 text-center text-sm'>
                No accounts found.
              </p>
            ) : (
              items.map((item) => (
                <Link
                  key={item.id}
                  href={`/backoffice/accounts/${item.type}/${item.id}`}
                  className='hover:bg-muted/50 focus-visible:ring-ring block rounded-md py-4 outline-none focus-visible:ring-2'
                >
                  <div className='flex min-w-0 items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <p className='truncate font-medium'>{item.name}</p>
                      <p className='text-muted-foreground truncate text-xs'>
                        {item.email || item.slug || '—'}
                      </p>
                    </div>
                    <Badge
                      variant={item.aiPipelineEnabled ? 'default' : 'outline'}
                      className={
                        item.aiPipelineEnabled ? '' : 'shrink-0 opacity-50'
                      }
                    >
                      AI {item.aiPipelineEnabled ? 'On' : 'Off'}
                    </Badge>
                  </div>

                  <dl className='mt-3 grid grid-cols-3 gap-3 text-sm'>
                    <div>
                      <dt className='text-muted-foreground text-xs'>Credit</dt>
                      <dd>{formatMoney(item.creditBalance)}</dd>
                    </div>
                    <div>
                      <dt className='text-muted-foreground text-xs'>Numbers</dt>
                      <dd>{formatNumber(item.numbersCount)}</dd>
                    </div>
                    <div>
                      <dt className='text-muted-foreground text-xs'>Calls</dt>
                      <dd>{formatNumber(item.callsCount)}</dd>
                    </div>
                  </dl>

                  <div className='mt-3'>
                    <SettingsBadges item={item} />
                  </div>
                </Link>
              ))
            )}
          </div>

          <div className='flex flex-wrap items-center justify-between gap-3'>
            <span className='text-muted-foreground text-sm'>
              Page {page} of {totalPages}
            </span>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                Previous
              </Button>
              <Button
                variant='outline'
                size='sm'
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
