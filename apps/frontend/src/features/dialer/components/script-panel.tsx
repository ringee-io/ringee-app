'use client';

import { useEffect, useState } from 'react';
import { useDialerLeadStore } from '../store/dialer-lead.store';
import { PANEL_HEADER_CLASS, PANEL_TAB_CLASS } from './panel-header';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { InCallScript } from '@/features/calls/components/in-call-script';
import { LiveTranscriptPanel } from '@/features/transcription';
import { FileText, Mic } from 'lucide-react';
import { useTranslations } from 'next-intl';

type ScriptTab = 'script' | 'transcript';

/**
 * The middle of the workspace: what to say, and — once the live call has a
 * transcript — what has been said, one tab each.
 */
export function ScriptPanel({
  transcriptionCallId
}: {
  /** The Ringee call behind the live leg; the transcript tab needs it. */
  transcriptionCallId: string | null;
}) {
  const t = useTranslations('dialer.workspace.columns');
  const leadId = useDialerLeadStore((s) => s.currentLead?.id ?? null);
  const [tab, setTab] = useState<ScriptTab>('script');

  // Every lead opens on the script: a transcript left open belongs to the
  // call before.
  useEffect(() => {
    setTab('script');
  }, [leadId]);

  const active: ScriptTab = transcriptionCallId ? tab : 'script';

  return (
    <Tabs
      value={active}
      onValueChange={(value) => setTab(value as ScriptTab)}
      className='flex h-full min-h-0 flex-col gap-0'
    >
      <TabsList className={PANEL_HEADER_CLASS}>
        <TabsTrigger value='script' className={PANEL_TAB_CLASS}>
          <FileText className='h-3.5 w-3.5' />
          {t('script')}
        </TabsTrigger>
        {transcriptionCallId ? (
          <TabsTrigger value='transcript' className={PANEL_TAB_CLASS}>
            <Mic className='h-3.5 w-3.5' />
            {t('transcript')}
          </TabsTrigger>
        ) : null}
      </TabsList>
      {/* Kept mounted, so a look at the transcript does not lose the section
          the agent was reading. */}
      <TabsContent
        value='script'
        forceMount
        className='m-0 min-h-[320px] flex-1 data-[state=inactive]:hidden lg:min-h-0'
      >
        <InCallScript />
      </TabsContent>
      {transcriptionCallId ? (
        <TabsContent
          value='transcript'
          className='m-0 min-h-0 flex-1 overflow-y-auto p-4'
        >
          <LiveTranscriptPanel callId={transcriptionCallId} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
