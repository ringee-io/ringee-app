'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, Gift, Loader2, X } from 'lucide-react';
import {
  formatForDisplay,
  isValidPhoneNumber,
  type CountryCode
} from '@ringee/dialer-core/phone';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@ringee/frontend-shared/components/ui/dialog';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { describeApiError } from '@/features/ai-voice-agents/lib/api-error';
import {
  CsvDropzone,
  CsvFormatHelp
} from '@/features/contact/components/csv-import-fields';
import {
  type FirstListPeople,
  type FirstListSource,
  type SkippedPerson,
  useFirstListBuilder
} from '../../hooks/use.first.list.builder';
import { ContactPicker, type PickedContact } from './contact-picker';
import { ListReady } from './list-ready';
import { SourceChoice } from './source-choice';
import { blankRow, type PersonRow, TypedPeople } from './typed-people';

type Step = 'choose' | 'add' | 'ready';

const STEPS: Step[] = ['choose', 'add', 'ready'];

/** `CONTACT_LIST_LIMITS.NAME_MAX` on the server. */
const NAME_MAX = 120;

interface ReadyList {
  list: { id: string; name: string };
  count: number;
  skipped: SkippedPerson[];
  rewardGranted: number;
}

interface Problem {
  title: string;
  skipped: SkippedPerson[];
}

/** "leads_october-2026.csv" → "Leads october 2026". */
function nameFromFile(fileName: string): string {
  const base = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base
    ? `${base[0]!.toUpperCase()}${base.slice(1)}`.slice(0, NAME_MAX)
    : '';
}

export interface FirstListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** USD finishing adds (BILL-022); nothing about credit is said at zero. */
  reward: number;
  /** The user's first list ever, and named as one. */
  firstTime: boolean;
  /** Where a number typed without its country code belongs. */
  defaultCountry: CountryCode;
  /** The list has people in it: the Call page can work it right away. */
  onListReady: (
    list: { id: string; name: string },
    rewardGranted: number
  ) => void;
  /** Closed with a list made: time to call. */
  onFinish: () => void;
}

/**
 * The Call page's onboarding: who to call, a list made of them, and straight
 * to the first call — all without leaving the page. Three steps: where the
 * people come from (a file, typed in, or contacts already saved), the people
 * themselves with the list's name, and the list ready with the credit it
 * earned. Walking away part-way takes back a list nobody made it into.
 */
export function FirstListDialog({
  open,
  onOpenChange,
  reward,
  firstTime,
  defaultCountry,
  onListReady,
  onFinish
}: FirstListDialogProps) {
  const t = useTranslations('onboarding.firstList');
  const api = useApi();
  const reduceMotion = useReducedMotion();
  const builder = useFirstListBuilder();
  const createRef = useRef<HTMLButtonElement>(null);
  const problemRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>('choose');
  const [source, setSource] = useState<FirstListSource | null>(null);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [rows, setRows] = useState<PersonRow[]>(() => [blankRow()]);
  const [picked, setPicked] = useState<Map<string, PickedContact>>(
    () => new Map()
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [ready, setReady] = useState<ReadyList | null>(null);
  const [contactTotal, setContactTotal] = useState<number | null>(null);

  const defaultName = firstTime ? t('name.first') : t('name.next');
  const rewardLabel = `$${reward.toFixed(2)}`;

  // "From your contacts" is offered only to a workspace that has some.
  useEffect(() => {
    if (!open) return;
    let active = true;
    api
      .get<{ meta?: { total?: number } }>('/contacts', { page: 1, limit: 1 })
      .then((res) => {
        if (active) setContactTotal(res?.meta?.total ?? 0);
      })
      .catch(() => {
        if (active) setContactTotal(0);
      });
    return () => {
      active = false;
    };
  }, [api, open]);

  // What went wrong is read before anything else, even on a short screen.
  useEffect(() => {
    if (problem) problemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [problem]);

  /** Back to a blank wizard — once it is out of sight. */
  const reset = () => {
    setStep('choose');
    setSource(null);
    setName('');
    setNameTouched(false);
    setFile(null);
    setFileError(null);
    setRows([blankRow()]);
    setPicked(new Map());
    setProblem(null);
    setReady(null);
  };

  const close = () => {
    if (busy) return;
    const finished = ready !== null;
    void builder.discard();
    onOpenChange(false);
    if (finished) onFinish();
  };

  const choose = (next: FirstListSource) => {
    setSource(next);
    setProblem(null);
    if (!nameTouched && !name) setName(defaultName);
    setStep('add');
  };

  const filledRows = rows.filter((row) => row.phone.trim());
  const people =
    source === 'typed'
      ? filledRows.length
      : source === 'contacts'
        ? picked.size
        : null;
  const canCreate =
    !busy &&
    (builder.completionPending ||
      (source === 'file'
        ? file !== null
        : source === 'typed'
          ? filledRows.length > 0
          : picked.size > 0));

  const create = async () => {
    if (!source || !canCreate) return;

    let input: FirstListPeople;
    if (builder.completionPending) {
      input = { source: 'contacts', contactIds: [] };
    } else if (source === 'file') {
      input = { source, file: file! };
    } else if (source === 'typed') {
      const checked = rows.map((row) => ({
        ...row,
        invalid: !!row.phone && !isValidPhoneNumber(row.phone)
      }));
      const firstInvalid = checked.find((row) => row.invalid);
      if (firstInvalid) {
        setRows(checked);
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLInputElement>(
              `[data-row="${firstInvalid.key}"] input[type="tel"]`
            )
            ?.focus()
        );
        return;
      }
      // The same number twice is one person.
      const seen = new Set<string>();
      const unique = filledRows.filter((row) => {
        if (seen.has(row.phone)) return false;
        seen.add(row.phone);
        return true;
      });
      input = {
        source,
        people: unique.map((row) => ({
          phoneNumber: row.phone,
          name: row.name
        }))
      };
    } else {
      input = { source, contactIds: [...picked.keys()] };
    }

    setBusy(true);
    setProblem(null);
    try {
      const result = await builder.build(
        name.trim() || defaultName,
        input,
        (done, total) => setProgress({ done, total })
      );
      if (!result.ok) {
        setProblem({ title: t('nothingAdded'), skipped: result.skipped });
        return;
      }
      setReady(result);
      setStep('ready');
      onListReady(result.list, result.rewardGranted);
    } catch (error) {
      setProblem({ title: describeApiError(error, t('failed')), skipped: [] });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const index = STEPS.indexOf(step);
  const slide = reduceMotion ? 0 : 14;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        // The Call page takes the focus where it belongs: the next call.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          reset();
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
        className='top-[max(1rem,9dvh)] flex max-h-[min(calc(100dvh-2rem),46rem)] w-[calc(100%-2rem)] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-[40rem]'
      >
        <div className='flex items-center gap-3 px-6 pt-5 pr-14'>
          <div className='flex flex-1 gap-1.5' aria-hidden>
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors duration-500',
                  i <= index ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-muted'
                )}
              />
            ))}
          </div>
          <span className='text-muted-foreground shrink-0 text-xs font-medium tabular-nums'>
            {t('stepOf', { current: index + 1, total: STEPS.length })}
          </span>
        </div>

        <AnimatePresence mode='wait' initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: slide }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -slide }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className='flex min-h-0 flex-1 flex-col'
          >
            {step === 'choose' ? (
              <>
                <DialogHeader className='gap-1.5 px-6 pt-4 pb-5 text-left'>
                  <DialogTitle className='text-xl font-semibold tracking-tight'>
                    {t('choose.title')}
                  </DialogTitle>
                  <DialogDescription className='text-[14px]'>
                    {t('choose.description')}
                  </DialogDescription>
                  {reward > 0 ? (
                    <span className='mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-600/15 ring-inset dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20'>
                      <Gift className='size-3.5' />
                      {t('rewardChip', { amount: rewardLabel })}
                    </span>
                  ) : null}
                </DialogHeader>
                <div className='min-h-0 flex-1 overflow-y-auto px-6 pb-6'>
                  <SourceChoice contactTotal={contactTotal} onChoose={choose} />
                </div>
                <div className='bg-muted/30 flex items-center justify-between gap-3 border-t px-6 py-3.5'>
                  <p className='text-muted-foreground text-xs'>
                    {t('choose.time')}
                  </p>
                  <Button variant='ghost' size='sm' onClick={close}>
                    {t('notNow')}
                  </Button>
                </div>
              </>
            ) : step === 'add' && source ? (
              <>
                <DialogHeader className='gap-1.5 px-6 pt-4 pb-5 text-left'>
                  <DialogTitle className='text-xl font-semibold tracking-tight'>
                    {t(`${source}.title`)}
                  </DialogTitle>
                  <DialogDescription className='text-[14px]'>
                    {t(`${source}.description`)}
                  </DialogDescription>
                </DialogHeader>

                <div
                  className='min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-6'
                  onKeyDown={(event) => {
                    // ⌘/Ctrl + Enter creates from anywhere in the step.
                    if (
                      event.key === 'Enter' &&
                      (event.metaKey || event.ctrlKey)
                    ) {
                      event.preventDefault();
                      void create();
                    }
                  }}
                >
                  {source === 'file' ? (
                    <div className='space-y-3'>
                      <CsvDropzone
                        file={file}
                        onFileChange={(picked) => {
                          if (busy || builder.completionPending) return;
                          setFile(picked);
                          setFileError(null);
                          setProblem(null);
                          if (!nameTouched) setName(nameFromFile(picked.name));
                          // One Enter away from the list.
                          requestAnimationFrame(() =>
                            createRef.current?.focus()
                          );
                        }}
                        onError={setFileError}
                        className='p-6'
                      />
                      {fileError ? (
                        <p className='text-destructive flex items-center gap-1.5 text-sm'>
                          <X className='size-4' />
                          {fileError}
                        </p>
                      ) : null}
                      <CsvFormatHelp />
                    </div>
                  ) : source === 'typed' ? (
                    <TypedPeople
                      rows={rows}
                      onRowsChange={setRows}
                      defaultCountry={defaultCountry}
                      disabled={busy || builder.completionPending}
                    />
                  ) : (
                    <ContactPicker
                      picked={picked}
                      onPickedChange={setPicked}
                      disabled={busy || builder.completionPending}
                    />
                  )}

                  <div className='space-y-1.5'>
                    <Label htmlFor='first-list-name'>{t('name.label')}</Label>
                    <Input
                      id='first-list-name'
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        setNameTouched(true);
                      }}
                      placeholder={defaultName}
                      maxLength={NAME_MAX}
                      disabled={busy || builder.completionPending}
                      className='h-10'
                    />
                    <p className='text-muted-foreground text-xs'>
                      {t('name.hint')}
                    </p>
                  </div>

                  {problem ? (
                    <div
                      ref={problemRef}
                      role='alert'
                      className='border-destructive/30 bg-destructive/5 rounded-lg border p-3 text-sm'
                    >
                      <p className='text-destructive flex items-start gap-2 font-medium'>
                        <AlertTriangle className='mt-0.5 size-4 shrink-0' />
                        {builder.completionPending
                          ? t('completionFailed')
                          : problem.title}
                      </p>
                      {problem.skipped.length > 0 ? (
                        <ul className='text-muted-foreground mt-2 max-h-28 space-y-0.5 overflow-y-auto pl-6 text-xs'>
                          {problem.skipped.map((person, i) => (
                            <li key={i}>
                              {person.row !== undefined
                                ? t('skippedRow', {
                                    row: person.row,
                                    message: person.message
                                  })
                                : t('skippedPerson', {
                                    phone: formatForDisplay(
                                      person.phoneNumber ?? ''
                                    ),
                                    message: person.message
                                  })}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className='bg-muted/30 flex flex-wrap items-center justify-between gap-2 border-t px-6 py-3.5'>
                  <Button
                    variant='ghost'
                    onClick={() => {
                      setProblem(null);
                      setStep('choose');
                    }}
                    disabled={busy || builder.completionPending}
                    className='-ml-2 gap-1.5'
                  >
                    <ArrowLeft className='size-4' />
                    {t('back')}
                  </Button>
                  <Button
                    ref={createRef}
                    onClick={() => void create()}
                    disabled={!canCreate}
                    aria-keyshortcuts='Meta+Enter Control+Enter'
                    className='h-10 min-w-[11rem] gap-2 bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500'
                  >
                    {busy ? (
                      <>
                        <Loader2 className='size-4 animate-spin' />
                        {progress && progress.total > 1
                          ? t('adding', {
                              done: progress.done + 1,
                              total: progress.total
                            })
                          : t('creating')}
                      </>
                    ) : builder.completionPending ? (
                      t('finishSetup')
                    ) : people ? (
                      t('createCount', { count: people })
                    ) : (
                      t('create')
                    )}
                  </Button>
                </div>
              </>
            ) : ready ? (
              <ListReady
                name={ready.list.name}
                count={ready.count}
                rewardGranted={ready.rewardGranted}
                skipped={ready.skipped}
                onStart={close}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
