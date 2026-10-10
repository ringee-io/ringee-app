'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { describeApiError } from '@/features/ai-voice-agents/lib/api-error';
import type {
  ContactList,
  ContactListImportSummary
} from '@/features/lists/types';
import type { FirstListCompletion } from '../types/onboarding.types';

export type FirstListSource = 'file' | 'typed' | 'contacts';

/** A person typed in by hand. */
export interface TypedPerson {
  /** E.164. */
  phoneNumber: string;
  name: string;
}

/** Who goes into the list, from wherever the user brought them. */
export type FirstListPeople =
  | { source: 'file'; file: File }
  | { source: 'typed'; people: TypedPerson[] }
  | { source: 'contacts'; contactIds: string[] };

/** Somebody the list could not take, and why. */
export interface SkippedPerson {
  /** The file's row, for a CSV. */
  row?: number;
  /** The number typed in, for a person added by hand. */
  phoneNumber?: string;
  message: string;
}

export type FirstListResult =
  | {
      ok: true;
      list: { id: string; name: string };
      /** Everyone in the list now. */
      count: number;
      skipped: SkippedPerson[];
      /** USD the onboarding added to the balance. */
      rewardGranted: number;
    }
  /** The list exists, but nobody could go in it: fix and try again. */
  | { ok: false; skipped: SkippedPerson[] };

interface CreateListResponse {
  list: ContactList;
  import: ContactListImportSummary | null;
}

function fileSkips(summary: ContactListImportSummary | null): SkippedPerson[] {
  return (summary?.errors ?? []).map((error) => ({
    row: error.row,
    message: error.message
  }));
}

/**
 * Makes the onboarding's list through the Lists API — the same validation
 * and contact matching as everywhere else (LIST-003) — then finishes the
 * onboarding with it, which is where the server decides the gift.
 *
 * A list that ends up with nobody in it is kept for the next attempt, so a
 * second try never leaves two lists behind, and `discard` takes it back when
 * the user walks away.
 */
export function useFirstListBuilder() {
  const api = useApi();
  const t = useTranslations('onboarding.firstList');
  const [completionPending, setCompletionPending] = useState(false);
  const made = useRef<{ id: string; name: string; filled: boolean } | null>(
    null
  );
  const prepared = useRef<Omit<
    Extract<FirstListResult, { ok: true }>,
    'rewardGranted'
  > | null>(null);

  const build = useCallback(
    async (
      name: string,
      people: FirstListPeople,
      onProgress?: (done: number, total: number) => void
    ): Promise<FirstListResult> => {
      const complete = async () => {
        const result = prepared.current!;
        const done = await api.post<FirstListCompletion>(
          `/onboarding/first-list/${result.list.id}`
        );
        return { ...result, rewardGranted: done.rewardGranted };
      };
      // Completion retries never import a CSV or add the typed contacts again.
      if (prepared.current) return complete();
      let list = made.current;
      let count: number | null = null;
      let skipped: SkippedPerson[] = [];

      if (!list && people.source === 'file') {
        // One request makes and fills it; a file the server cannot read at
        // all is refused before any list exists.
        const body = new FormData();
        body.append('name', name);
        body.append('file', people.file);
        const created = await api.upload<CreateListResponse>(
          '/contact-lists',
          body
        );
        list = made.current = {
          id: created.list.id,
          name: created.list.name,
          filled: false
        };
        count = created.list.contactCount;
        skipped = fileSkips(created.import);
      } else {
        if (!list) {
          const created = await api.post<CreateListResponse>('/contact-lists', {
            name
          });
          list = made.current = {
            id: created.list.id,
            name: created.list.name,
            filled: false
          };
        } else if (list.name !== name) {
          const renamed = await api.patch<ContactList>(
            `/contact-lists/${list.id}`,
            { name }
          );
          list.name = renamed.name;
        }

        if (people.source === 'file') {
          const body = new FormData();
          body.append('file', people.file);
          const summary = await api.upload<ContactListImportSummary>(
            `/contact-lists/${list.id}/import`,
            body
          );
          skipped = fileSkips(summary);
        } else if (people.source === 'typed') {
          // One by one, so the list is called in the order they were typed.
          for (const [index, person] of people.people.entries()) {
            onProgress?.(index, people.people.length);
            try {
              await api.post(`/contact-lists/${list.id}/contacts/new`, {
                phoneNumber: person.phoneNumber,
                name: person.name.trim() || undefined
              });
            } catch (error) {
              skipped.push({
                phoneNumber: person.phoneNumber,
                message: describeApiError(error, t('personFailed'))
              });
            }
          }
        } else {
          await api.post(`/contact-lists/${list.id}/contacts`, {
            contactIds: people.contactIds
          });
        }
      }

      if (count === null) {
        count = (await api.get<ContactList>(`/contact-lists/${list.id}`))
          .contactCount;
      }
      if (count === 0) return { ok: false, skipped };

      list.filled = true;
      prepared.current = {
        ok: true,
        list: { id: list.id, name: list.name },
        count,
        skipped
      };
      setCompletionPending(true);
      return complete();
    },
    [api, t]
  );

  /** Forgets this run's list — and deletes it when nobody made it in. */
  const discard = useCallback(async () => {
    const list = made.current;
    made.current = null;
    prepared.current = null;
    setCompletionPending(false);
    if (list && !list.filled) {
      // The server checks emptiness in the delete itself. A failed count read
      // or a lost response from adding contacts cannot turn into data loss.
      await api
        .delete(`/contact-lists/${list.id}/empty`)
        .catch(() => undefined);
    }
  }, [api]);

  return { build, discard, completionPending };
}
