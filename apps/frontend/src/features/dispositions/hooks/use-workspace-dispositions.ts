'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import { announceDispositionsChanged } from '../events';
import type { DispositionInput, WorkspaceDisposition } from '../types';

type Status = 'loading' | 'ready' | 'error';

/**
 * The workspace's dispositions, and the canonical outcomes one can map to.
 *
 * Every rule — the defaults, unique names, what can change once a call
 * recorded a disposition, keeping one active — is the server's. This loads the
 * list, sends each change and keeps the list in step with what came back.
 * Mutations reject with the `ApiError`, for the caller to show.
 */
export function useWorkspaceDispositions() {
  const api = useApi();
  const [dispositions, setDispositions] = useState<WorkspaceDisposition[]>([]);
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  // Read by `reorder` to roll back without re-creating it on every change.
  const current = useRef(dispositions);
  current.current = dispositions;

  const refresh = useCallback(async () => {
    try {
      const [rows, values] = await Promise.all([
        api.get<WorkspaceDisposition[]>('/dispositions'),
        api.get<string[]>('/dispositions/outcomes')
      ]);
      setDispositions(rows);
      setOutcomes(values);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (input: DispositionInput) => {
      await api.post('/dispositions', input);
      announceDispositionsChanged();
      await refresh();
    },
    [api, refresh]
  );

  const update = useCallback(
    async (
      id: string,
      patch: Partial<DispositionInput> & { isActive?: boolean }
    ) => {
      const updated = await api.patch<WorkspaceDisposition>(
        `/dispositions/${id}`,
        patch
      );
      announceDispositionsChanged();
      // The answer is the row without its usage, which a patch never changes.
      setDispositions((rows) =>
        rows.map((row) => (row.id === id ? { ...row, ...updated } : row))
      );
    },
    [api]
  );

  const remove = useCallback(
    async (id: string) => {
      await api.delete(`/dispositions/${id}`);
      announceDispositionsChanged();
      setDispositions((rows) => rows.filter((row) => row.id !== id));
    },
    [api]
  );

  /** Shows the new order at once, and puts the old one back if it is refused. */
  const reorder = useCallback(
    async (ids: string[]) => {
      const previous = current.current;
      const byId = new Map(previous.map((row) => [row.id, row]));
      setDispositions(
        ids.flatMap((id) => {
          const row = byId.get(id);
          return row ? [row] : [];
        })
      );
      try {
        setDispositions(
          await api.put<WorkspaceDisposition[]>('/dispositions/order', { ids })
        );
        announceDispositionsChanged();
      } catch (error) {
        setDispositions(previous);
        throw error;
      }
    },
    [api]
  );

  return {
    dispositions,
    outcomes,
    status,
    refresh,
    create,
    update,
    remove,
    reorder
  };
}
