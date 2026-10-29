'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  IconArrowBackUp,
  IconExternalLink,
  IconUserMinus,
  IconUserPlus
} from '@tabler/icons-react';
import {
  Card,
  CardContent,
  CardDescription,
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
import { DropdownMenuItem } from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { TableRowActions } from '@ringee/frontend-shared/components/ui/table/table-row-actions';
import {
  TableActionCell,
  TableActionHead
} from '@ringee/frontend-shared/components/ui/table/table-action-column';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import {
  useBackofficeApi,
  type NumberInventoryStatus,
  type NumberListItem
} from '../api';
import { errorMessage, formatDate, formatNumber } from '../lib/format';
import { AccountPicker, type PickedAccount } from './account-picker';
import { AddNumbersDialog } from './add-numbers-dialog';
import {
  describeRegistration,
  registrationSucceeded
} from './registration-results';

/** The API returns the newest numbers first, this many at most. */
const LIMIT = 200;

const TABS: { value: NumberInventoryStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'retired', label: 'Retired' },
  { value: 'all', label: 'All' }
];

const EMPTY: Record<NumberInventoryStatus, string> = {
  available: 'No numbers available. Add numbers to assign them.',
  assigned: 'No numbers assigned.',
  retired: 'No retired numbers.',
  all: 'No numbers yet.'
};

type NumberState = 'available' | 'assigned' | 'retired';

function stateOf(n: NumberListItem): NumberState {
  if (n.retiredAt) return 'retired';
  return n.assigned ? 'assigned' : 'available';
}

/** The account a number is assigned to, for its account page. */
function ownerOf(n: NumberListItem): {
  type: 'user' | 'org';
  id: string;
  name: string;
  detail: string | null;
} | null {
  if (n.organization) {
    return {
      type: 'org',
      id: n.organization.id,
      name: n.organization.name,
      detail: n.user ? `held by ${n.user.name}` : n.organization.slug
    };
  }
  if (n.user) {
    return {
      type: 'user',
      id: n.user.id,
      name: n.user.name,
      detail: n.user.email
    };
  }
  return null;
}

export function NumbersInventory() {
  const api = useBackofficeApi();
  const [status, setStatus] = useState<NumberInventoryStatus>('available');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<NumberListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<NumberListItem | null>(null);
  const [unassigning, setUnassigning] = useState<NumberListItem | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(
        await api.listNumbers({
          status,
          search: search || undefined,
          limit: LIMIT
        })
      );
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load numbers'));
    } finally {
      setLoading(false);
    }
  }, [api, status, search]);

  useEffect(() => {
    load();
  }, [load]);

  /** A retired number comes back through registration, unassigned. */
  const restore = async (n: NumberListItem) => {
    setRestoringId(n.id);
    try {
      const { results } = await api.registerNumbers({
        phoneNumbers: [n.phoneNumber]
      });
      const result = results[0];
      if (result && registrationSucceeded(result)) {
        toast.success(`${n.phoneNumber} is available again.`);
      } else {
        toast.error(
          result
            ? describeRegistration(result, null)
            : 'Could not add the number back'
        );
      }
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not add the number back'));
    } finally {
      setRestoringId(null);
    }
  };

  const tabLabel = TABS.find((t) => t.value === status)?.label ?? '';
  const countLabel = `${formatNumber(items.length)}${items.length >= LIMIT ? '+' : ''} ${
    status === 'all' ? 'numbers' : tabLabel.toLowerCase()
  }`;
  const actions = (n: NumberListItem) => (
    <NumberActions
      number={n}
      busy={restoringId === n.id}
      onAssign={() => setAssigning(n)}
      onUnassign={() => setUnassigning(n)}
      onRestore={() => restore(n)}
    />
  );

  return (
    <div className='space-y-4 sm:space-y-6'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h1 className='text-xl font-semibold sm:text-2xl'>Numbers</h1>
          <p className='text-muted-foreground text-sm'>
            Add numbers to Ringee and assign them to a user or an organization.
          </p>
        </div>
        <AddNumbersDialog onAdded={load} />
      </div>

      <Card className='gap-4 py-4 sm:gap-6 sm:py-6'>
        <CardHeader className='flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
          <div className='space-y-1'>
            <CardTitle>{loading || error ? tabLabel : countLabel}</CardTitle>
            {status === 'retired' ? (
              <CardDescription>
                Their subscription ended. Some were also released in Telnyx, so
                check a number still exists there before adding it back.
              </CardDescription>
            ) : null}
          </div>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
            <Tabs
              className='w-full sm:w-auto'
              value={status}
              onValueChange={(v) => setStatus(v as NumberInventoryStatus)}
            >
              <TabsList className='w-full sm:w-fit'>
                {TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Input
              placeholder='Search number or owner…'
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className='w-full sm:w-64'
            />
          </div>
        </CardHeader>

        <CardContent className='space-y-4 px-4 sm:px-6'>
          {error ? (
            <div className='flex flex-col items-center gap-3 py-8 text-center'>
              <p className='text-destructive text-sm'>{error}</p>
              <Button variant='outline' size='sm' onClick={load}>
                Try again
              </Button>
            </div>
          ) : (
            <>
              <div className='hidden lg:block'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Assigned to</TableHead>
                      <TableHead>Added</TableHead>
                      <TableActionHead>
                        <span className='sr-only'>Actions</span>
                      </TableActionHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && items.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className='text-muted-foreground py-8 text-center'
                        >
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : items.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className='text-muted-foreground py-8 text-center'
                        >
                          {search ? 'No numbers match.' : EMPTY[status]}
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((n) => (
                        <TableRow key={n.id}>
                          <TableCell>
                            <NumberLabel number={n} />
                          </TableCell>
                          <TableCell>
                            <StateBadge number={n} />
                          </TableCell>
                          <TableCell>
                            <OwnerLink number={n} />
                          </TableCell>
                          <TableCell className='text-muted-foreground'>
                            {formatDate(n.createdAt)}
                          </TableCell>
                          <TableActionCell>{actions(n)}</TableActionCell>
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
                    {search ? 'No numbers match.' : EMPTY[status]}
                  </p>
                ) : (
                  items.map((n) => (
                    <div key={n.id} className='space-y-2 py-4'>
                      <div className='flex min-w-0 items-start justify-between gap-3'>
                        <NumberLabel number={n} />
                        <div className='flex shrink-0 items-center gap-1'>
                          <StateBadge number={n} />
                          {actions(n)}
                        </div>
                      </div>
                      {ownerOf(n) ? <OwnerLink number={n} /> : null}
                    </div>
                  ))
                )}
              </div>

              {items.length >= LIMIT ? (
                <p className='text-muted-foreground text-xs'>
                  Showing the {LIMIT} newest. Search to find the others.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <AssignDialog
        number={assigning}
        onClose={() => setAssigning(null)}
        onAssigned={load}
      />
      <UnassignDialog
        number={unassigning}
        onClose={() => setUnassigning(null)}
        onUnassigned={load}
      />
    </div>
  );
}

function NumberLabel({ number }: { number: NumberListItem }) {
  return (
    <div className='min-w-0'>
      <p className='truncate font-medium tabular-nums'>{number.phoneNumber}</p>
      <p className='text-muted-foreground text-xs'>
        {number.isoCountry}
        {number.phoneNumberType
          ? ` · ${number.phoneNumberType.replace('_', ' ')}`
          : ''}
      </p>
    </div>
  );
}

function StateBadge({ number }: { number: NumberListItem }) {
  const state = stateOf(number);
  if (state === 'retired') {
    return (
      <Badge
        variant='secondary'
        title={`Retired ${formatDate(number.retiredAt)}`}
      >
        Retired
      </Badge>
    );
  }
  return state === 'assigned' ? (
    <Badge title={`Since ${formatDate(number.assignedDate)}`}>Assigned</Badge>
  ) : (
    <Badge variant='outline'>Available</Badge>
  );
}

function OwnerLink({ number }: { number: NumberListItem }) {
  const owner = ownerOf(number);
  if (!owner) {
    return <span className='text-muted-foreground text-sm'>—</span>;
  }
  return (
    <div className='min-w-0'>
      <Link
        href={`/backoffice/accounts/${owner.type}/${owner.id}`}
        className='block truncate text-sm font-medium underline-offset-4 hover:underline'
      >
        {owner.name}
      </Link>
      <p className='text-muted-foreground truncate text-xs'>
        {owner.type === 'org' ? 'Organization' : 'User'}
        {owner.detail ? ` · ${owner.detail}` : ''}
      </p>
    </div>
  );
}

function NumberActions({
  number,
  busy,
  onAssign,
  onUnassign,
  onRestore
}: {
  number: NumberListItem;
  busy: boolean;
  onAssign: () => void;
  onUnassign: () => void;
  onRestore: () => void;
}) {
  const router = useRouter();
  const state = stateOf(number);
  const owner = ownerOf(number);

  return (
    <TableRowActions
      label={`Actions for ${number.phoneNumber}`}
      menuLabel='Actions'
      loading={busy}
    >
      {state === 'assigned' ? (
        <>
          {owner ? (
            <DropdownMenuItem
              onClick={() =>
                router.push(`/backoffice/accounts/${owner.type}/${owner.id}`)
              }
            >
              <IconExternalLink className='size-4' />
              Open account
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem variant='destructive' onClick={onUnassign}>
            <IconUserMinus className='size-4' />
            Unassign
          </DropdownMenuItem>
        </>
      ) : (
        <DropdownMenuItem onClick={onAssign}>
          <IconUserPlus className='size-4' />
          Assign…
        </DropdownMenuItem>
      )}
      {state === 'retired' ? (
        <DropdownMenuItem onClick={onRestore}>
          <IconArrowBackUp className='size-4' />
          Add back as available
        </DropdownMenuItem>
      ) : null}
    </TableRowActions>
  );
}

function AssignDialog({
  number,
  onClose,
  onAssigned
}: {
  number: NumberListItem | null;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const api = useBackofficeApi();
  const [account, setAccount] = useState<PickedAccount | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAccount(null);
  }, [number?.id]);

  const assign = async () => {
    if (!number || !account) return;
    setSaving(true);
    try {
      if (number.retiredAt) {
        // A retired number comes back through registration, assigned on the way.
        const { results } = await api.registerNumbers({
          phoneNumbers: [number.phoneNumber],
          accountType: account.type,
          accountId: account.id
        });
        const result = results[0];
        if (!result || !registrationSucceeded(result) || !result.assigned) {
          toast.error(
            result
              ? describeRegistration(result, account.name)
              : 'Failed to assign number'
          );
          onAssigned();
          return;
        }
      } else {
        await api.assignNumber(account.type, account.id, number.id);
      }
      toast.success(`${number.phoneNumber} assigned to ${account.name}.`);
      onAssigned();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to assign number'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={!!number}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className='max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:max-w-lg sm:p-6'>
        <DialogHeader>
          <DialogTitle>Assign {number?.phoneNumber}</DialogTitle>
          <DialogDescription>
            {number?.retiredAt
              ? 'It is added back to Ringee and assigned. Check it still exists in Telnyx first.'
              : 'They can call from it right away. It becomes their primary number if they have none.'}
          </DialogDescription>
        </DialogHeader>
        <AccountPicker
          value={account}
          onChange={setAccount}
          disabled={saving}
        />
        <DialogFooter>
          <Button variant='outline' disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!account || saving} onClick={assign}>
            {saving ? 'Assigning…' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnassignDialog({
  number,
  onClose,
  onUnassigned
}: {
  number: NumberListItem | null;
  onClose: () => void;
  onUnassigned: () => void;
}) {
  const api = useBackofficeApi();
  const [saving, setSaving] = useState(false);
  const owner = number ? ownerOf(number) : null;

  const unassign = async () => {
    if (!number || !owner) return;
    setSaving(true);
    try {
      await api.unassignNumber(owner.type, owner.id, number.id);
      toast.success(`${number.phoneNumber} is available again.`);
      onUnassigned();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to unassign number'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog
      open={!!number}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unassign {number?.phoneNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            {owner?.name ?? 'The account'} can no longer call from it, and it
            goes back to Available. Its inbound route and its campaign and desk
            phone settings are cleared.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={saving}
            onClick={(e) => {
              e.preventDefault();
              unassign();
            }}
          >
            {saving ? 'Unassigning…' : 'Unassign'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
