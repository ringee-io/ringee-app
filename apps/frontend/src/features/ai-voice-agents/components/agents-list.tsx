'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot } from 'lucide-react';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ringee/frontend-shared/components/ui/table';
import { Card } from '@ringee/frontend-shared/components/ui/card';
import { useVoiceAgentApi } from '../api';
import type { VoiceAgent, VoiceAgentTypeInfo } from '../types';
import { AgentStatusBadge } from './agent-status-badge';
import { AgentTypeCards } from './agent-type-cards';
import { CompanyProfileCard } from './company-profile-card';

const MODEL_LABELS: Record<string, string> = {
  ringee: 'Ringee AI',
  openai: 'OpenAI',
  anthropic: 'Claude',
  google: 'Gemini'
};

/** The module's home: what you can create, and what already exists (§3). */
export function AgentsList() {
  const api = useVoiceAgentApi();
  const [types, setTypes] = useState<VoiceAgentTypeInfo[]>([]);
  const [agents, setAgents] = useState<VoiceAgent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [typeList, page] = await Promise.all([api.listTypes(), api.list()]);
      setTypes(typeList);
      setAgents(page.data);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const titleByType = new Map(types.map((t) => [t.type, t.title]));

  return (
    <div className='space-y-8'>
      <section className='space-y-3'>
        <h2 className='text-lg font-medium'>Create an AI Agent</h2>
        {loading ? (
          <div className='grid gap-4 sm:grid-cols-2'>
            <Skeleton className='h-40 w-full' />
            <Skeleton className='h-40 w-full' />
          </div>
        ) : (
          <AgentTypeCards types={types} />
        )}
      </section>

      <CompanyProfileCard />

      <section className='space-y-3'>
        <h2 className='text-lg font-medium'>Your agents</h2>
        {loading ? (
          <Skeleton className='h-40 w-full' />
        ) : agents.length === 0 ? (
          <Card className='text-muted-foreground flex flex-col items-center gap-2 py-10 text-sm'>
            <Bot className='size-6' />
            No agents yet. Pick one of the two above to get started.
          </Card>
        ) : (
          <Card className='p-0'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Voice</TableHead>
                  <TableHead>AI model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='text-right'>Calls</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent) => (
                  <TableRow key={agent.id} className='cursor-pointer'>
                    <TableCell className='font-medium'>
                      <Link
                        href={`/dashboard/ai-voice-agents/${agent.id}`}
                        className='hover:underline'
                      >
                        {agent.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {titleByType.get(agent.type) ?? agent.type}
                    </TableCell>
                    <TableCell>{agent.voiceLabel ?? '—'}</TableCell>
                    <TableCell>
                      {MODEL_LABELS[agent.modelProvider] ?? agent.modelProvider}
                    </TableCell>
                    <TableCell>
                      <AgentStatusBadge status={agent.status} />
                    </TableCell>
                    <TableCell className='text-right'>
                      {agent.callCount ?? 0}
                    </TableCell>
                    <TableCell>
                      {new Date(agent.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
