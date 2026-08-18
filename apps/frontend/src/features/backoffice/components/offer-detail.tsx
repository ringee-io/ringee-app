'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  IconArrowLeft,
  IconExternalLink,
  IconPencil,
  IconTrash
} from '@tabler/icons-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
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
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import {
  useBackofficeApi,
  type OfferDetail as OfferDetailData,
  type OfferParticipationRow,
  type OfferParticipationStatus
} from '../api';
import {
  errorMessage,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent
} from '../lib/format';
import {
  OfferStatusBadge,
  ParticipationStatusBadge,
  SubmissionPreview
} from './offer-bits';
import { OfferForm } from './offer-form';

const PAGE_SIZE = 25;

const STATUS_FILTERS: Array<{
  value: OfferParticipationStatus | 'all';
  label: string;
}> = [
  { value: 'all', label: 'All statuses' },
  { value: 'PENDING_APPROVAL', label: 'Pending approval' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'REWARDED', label: 'Rewarded' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'STARTED', label: 'Started' }
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-lg border p-3'>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <p className='text-lg font-semibold'>{value}</p>
    </div>
  );
}

function ConfigBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className='space-y-1'>
      <p className='text-muted-foreground text-xs font-medium'>{label}</p>
      <pre className='bg-muted/50 max-h-64 overflow-auto rounded-md p-3 text-[11px] leading-relaxed'>
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </div>
  );
}

export function OfferDetail({ offerId }: { offerId: string }) {
  const api = useBackofficeApi();
  const router = useRouter();
  const [offer, setOffer] = useState<OfferDetailData | null>(null);
  const [rows, setRows] = useState<OfferParticipationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [participationStatus, setParticipationStatus] = useState<
    OfferParticipationStatus | 'all'
  >('all');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approving, setApproving] = useState<OfferParticipationRow | null>(
    null
  );
  const [rejecting, setRejecting] = useState<OfferParticipationRow | null>(
    null
  );
  const [rejectReason, setRejectReason] = useState('');

  const loadOffer = useCallback(async () => {
    try {
      setOffer(await api.getOffer(offerId));
    } catch (error) {
      toast.error(errorMessage(error, 'Could not load this offer.'));
    }
  }, [api, offerId]);

  const loadParticipations = useCallback(async () => {
    try {
      const res = await api.listOfferParticipations(offerId, {
        status: participationStatus,
        page,
        pageSize: PAGE_SIZE
      });
      setRows(res?.items ?? []);
      setTotal(res?.total ?? 0);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not load participants.'));
    }
  }, [api, offerId, participationStatus, page]);

  useEffect(() => {
    loadOffer();
  }, [loadOffer]);

  useEffect(() => {
    loadParticipations();
  }, [loadParticipations]);

  const approve = async (row: OfferParticipationRow) => {
    setBusyId(row.id);
    try {
      const updated = await api.approveParticipation(row.id);
      setRows((current) =>
        current.map((r) => (r.id === updated.id ? updated : r))
      );
      toast.success('Approved and credited.');
      loadOffer();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not approve this submission.'));
      // A conflict means someone else already handled it — refresh to show who.
      loadParticipations();
    } finally {
      setBusyId(null);
      setApproving(null);
    }
  };

  const reject = async (row: OfferParticipationRow, reason: string) => {
    setBusyId(row.id);
    try {
      const updated = await api.rejectParticipation(
        row.id,
        reason.trim() || undefined
      );
      setRows((current) =>
        current.map((r) => (r.id === updated.id ? updated : r))
      );
      toast.success('Rejected.');
      loadOffer();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not reject this submission.'));
      loadParticipations();
    } finally {
      setBusyId(null);
      setRejecting(null);
      setRejectReason('');
    }
  };

  const remove = async () => {
    if (!offer) return;
    setDeleting(true);
    try {
      await api.deleteOffer(offer.id);
      toast.success('Offer deleted.');
      router.push('/backoffice/offers');
    } catch (error) {
      // The server refuses once anyone has participated — its message says so.
      toast.error(errorMessage(error, 'Could not delete this offer.'));
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  const changeStatus = async (status: OfferDetailData['status']) => {
    if (!offer) return;
    try {
      setOffer(await api.updateOffer(offer.id, { status }));
      toast.success(`Offer ${status.toLowerCase()}.`);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not update this offer.'));
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** The exact money and destination the approval will move. */
  const approvalSummary = (row: OfferParticipationRow | null): string => {
    if (!row) return '';
    const amount = row.rewardAmount;
    const target =
      row.organizationName ?? row.userName ?? row.userEmail ?? 'this user';
    return amount
      ? `Approve submission and issue $${formatMoney(amount)} to ${target}?`
      : `Approve this submission for ${target}? The reward is calculated from the offer's configuration.`;
  };

  if (editing && offer) {
    return (
      <div className='space-y-4'>
        <Button
          variant='ghost'
          size='sm'
          className='-ml-2'
          onClick={() => setEditing(false)}
        >
          <IconArrowLeft className='size-4' />
          Back to offer
        </Button>
        <OfferForm
          offer={offer}
          onSaved={(saved) => {
            setOffer(saved);
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <Button variant='ghost' size='sm' asChild className='-ml-2'>
        <Link href='/backoffice/offers'>
          <IconArrowLeft className='size-4' />
          Back to offers
        </Link>
      </Button>

      {offer && (
        <Card>
          <CardHeader>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div className='space-y-1.5'>
                <div className='flex flex-wrap items-center gap-2'>
                  <CardTitle>{offer.internalName || offer.name}</CardTitle>
                  <OfferStatusBadge status={offer.status} />
                </div>
                <CardDescription>
                  {offer.slug} · {offer.placement} · {offer.audienceType} ·
                  priority {offer.priority}
                  {offer.requiresApproval && ' · manual approval'}
                </CardDescription>
              </div>

              <div className='flex flex-wrap items-center gap-2'>
                {offer.status === 'ACTIVE' ? (
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => changeStatus('PAUSED')}
                  >
                    Pause
                  </Button>
                ) : (
                  offer.status !== 'ARCHIVED' && (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => changeStatus('ACTIVE')}
                    >
                      Activate
                    </Button>
                  )
                )}
                {offer.status !== 'ARCHIVED' && (
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => changeStatus('ARCHIVED')}
                  >
                    Archive
                  </Button>
                )}
                <Button size='sm' onClick={() => setEditing(true)}>
                  <IconPencil className='size-3.5' />
                  Edit
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  className='text-destructive'
                  disabled={deleting}
                  onClick={() => setConfirmingDelete(true)}
                >
                  <IconTrash className='size-3.5' />
                  Delete
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-6'>
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6'>
              <Stat
                label='Impressions'
                value={formatNumber(offer.impressions)}
              />
              <Stat
                label='Participants'
                value={formatNumber(offer.participants)}
              />
              <Stat label='Completed' value={formatNumber(offer.completed)} />
              <Stat
                label='Rewards issued'
                value={formatNumber(offer.rewardsIssued)}
              />
              <Stat
                label='Credits issued'
                value={`$${formatMoney(offer.creditsIssued)}`}
              />
              <Stat label='Dismissals' value={formatNumber(offer.dismissals)} />
            </div>

            <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
              <Stat
                label='Click-through'
                value={formatPercent(offer.conversion.clickThrough)}
              />
              <Stat
                label='Submission rate'
                value={formatPercent(offer.conversion.submission)}
              />
              <Stat
                label='Completion rate'
                value={formatPercent(offer.conversion.completion)}
              />
            </div>

            <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
              <ConfigBlock
                label='Eligibility'
                value={offer.eligibilityConfig}
              />
              <ConfigBlock label='Reward' value={offer.rewardConfig} />
              <ConfigBlock label='Action' value={offer.actionConfig} />
              <ConfigBlock label='Display' value={offer.displayConfig} />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Participants</CardTitle>
          <CardDescription>
            Each member claims their own reward — an admin can never claim on
            someone else&apos;s behalf.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <Select
            value={participationStatus}
            onValueChange={(value) => {
              setParticipationStatus(value as OfferParticipationStatus | 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className='h-9 w-full sm:w-56'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((filter) => (
                <SelectItem key={filter.value} value={filter.value}>
                  {filter.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submission</TableHead>
                  <TableHead className='text-right'>Reward</TableHead>
                  <TableHead>Submitted at</TableHead>
                  <TableHead className='text-right'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className='text-muted-foreground py-8 text-center text-sm'
                    >
                      No participants yet.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row) => {
                  const actionable =
                    row.status === 'PENDING_APPROVAL' ||
                    row.status === 'SUBMITTED';
                  const link = extractLink(row.submissionData);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className='font-medium'>
                        {row.userName ?? '—'}
                      </TableCell>
                      <TableCell className='text-xs'>
                        {row.userEmail ?? '—'}
                      </TableCell>
                      <TableCell className='text-xs'>
                        {row.organizationName ?? 'Personal'}
                      </TableCell>
                      <TableCell>
                        <ParticipationStatusBadge status={row.status} />
                        {row.rejectionReason && (
                          <p className='text-muted-foreground mt-1 text-[11px]'>
                            {row.rejectionReason}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className='max-w-[300px]'>
                        <SubmissionPreview data={row.submissionData} />
                      </TableCell>
                      <TableCell className='text-right text-xs'>
                        {row.rewardAmount
                          ? `$${formatMoney(row.rewardAmount)}`
                          : '—'}
                      </TableCell>
                      <TableCell className='text-xs'>
                        {formatDateTime(row.submittedAt)}
                      </TableCell>
                      <TableCell className='text-right'>
                        <div className='flex justify-end gap-1'>
                          {link && (
                            <Button variant='outline' size='sm' asChild>
                              <a
                                href={link}
                                target='_blank'
                                rel='noopener noreferrer'
                              >
                                <IconExternalLink className='size-3.5' />
                                Open
                              </a>
                            </Button>
                          )}
                          {actionable && (
                            <>
                              <Button
                                size='sm'
                                disabled={busyId === row.id}
                                onClick={() => setApproving(row)}
                              >
                                Approve
                              </Button>
                              <Button
                                size='sm'
                                variant='outline'
                                disabled={busyId === row.id}
                                onClick={() => {
                                  setRejectReason('');
                                  setRejecting(row);
                                }}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {pages > 1 && (
            <div className='flex items-center justify-end gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className='text-muted-foreground text-xs'>
                Page {page} of {pages}
              </span>
              <Button
                variant='outline'
                size='sm'
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!approving}
        onOpenChange={(open) => !open && setApproving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve submission</AlertDialogTitle>
            <AlertDialogDescription>
              {approvalSummary(approving)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!busyId}
              onClick={() => approving && approve(approving)}
            >
              Approve and issue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmingDelete}
        onOpenChange={(open) => !open && setConfirmingDelete(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this offer?</AlertDialogTitle>
            <AlertDialogDescription>
              {offer && offer.participants > 0
                ? `${offer.internalName || offer.name} has ${offer.participants} participation(s). Deleting is refused while any exist — archive it instead to take it out of circulation without losing the reward history.`
                : 'This removes the offer permanently. It has no participations, so nothing is lost.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={remove}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!rejecting}
        onOpenChange={(open) => !open && setRejecting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject submission</AlertDialogTitle>
            <AlertDialogDescription>
              The reason is stored on the participation. Rejecting does not burn
              the user&apos;s claim — they can submit again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder='Reason (optional)'
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!busyId}
              onClick={() => rejecting && reject(rejecting, rejectReason)}
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** First http(s) value in the submission, whatever the offer named its field. */
function extractLink(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  for (const value of Object.values(data as Record<string, unknown>)) {
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  }
  return null;
}
