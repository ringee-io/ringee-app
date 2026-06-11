'use client';

import { Button } from '@ringee/frontend-shared/components/ui/button';
import { FileText, Loader2, Mic } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useCallTranscription } from '../hooks/use-call-transcription';
import { CallTranscriptionView } from '../types';

interface ButtonState {
  label: string;
  onClick?: () => void;
  disabled: boolean;
  busy: boolean;
  icon: 'mic' | 'file' | 'none';
}

interface Props {
  callId: string | null | undefined;
  /** "active" during a live call, "history" after the call ended. */
  mode: 'active' | 'history';
  /** Invoked when the user clicks "View transcript". */
  onView?: () => void;
  size?: 'sm' | 'default';
  className?: string;
}

export function TranscribeCallButton({
  callId,
  mode,
  onView,
  size = 'sm',
  className
}: Props) {
  const t = useTranslations('transcription');
  const { data, actionPending, startRealtime, transcribeRecording, retry } =
    useCallTranscription(callId, { live: mode === 'active' });

  const state = deriveState({
    data,
    mode,
    t,
    actions: {
      startRealtime: () => withToast(startRealtime, t('errors.startFailed')),
      transcribeRecording: () =>
        withToast(transcribeRecording, t('errors.transcribeFailed')),
      retryRealtime: () =>
        withToast(() => retry('realtime'), t('errors.startFailed')),
      retryRecording: () =>
        withToast(() => retry('recording'), t('errors.transcribeFailed')),
      view: onView
    }
  });

  if (!callId) return null;

  return (
    <Button
      type='button'
      size={size}
      variant='outline'
      className={className}
      disabled={state.disabled || actionPending}
      onClick={state.onClick}
    >
      {state.busy || actionPending ? (
        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
      ) : state.icon === 'mic' ? (
        <Mic className='mr-2 h-4 w-4' />
      ) : state.icon === 'file' ? (
        <FileText className='mr-2 h-4 w-4' />
      ) : null}
      {state.label}
    </Button>
  );
}

async function withToast(fn: () => Promise<unknown>, message: string) {
  try {
    await fn();
  } catch {
    toast.error(message);
  }
}

function deriveState({
  data,
  mode,
  t,
  actions
}: {
  data: CallTranscriptionView | null;
  mode: 'active' | 'history';
  t: ReturnType<typeof useTranslations>;
  actions: {
    startRealtime: () => void;
    transcribeRecording: () => void;
    retryRealtime: () => void;
    retryRecording: () => void;
    view?: () => void;
  };
}): ButtonState {
  if (data && !data.transcriptionEnabled) {
    return {
      label: t('unavailable'),
      disabled: true,
      busy: false,
      icon: 'none'
    };
  }

  if (mode === 'active') {
    const status = data?.realtime?.status;
    if (status === 'starting' || status === 'transcribing') {
      return {
        label: t('transcribing'),
        disabled: true,
        busy: true,
        icon: 'none'
      };
    }
    if (status === 'failed') {
      return {
        label: t('tryAgain'),
        onClick: actions.retryRealtime,
        disabled: false,
        busy: false,
        icon: 'mic'
      };
    }
    if (status === 'completed') {
      return {
        label: t('viewTranscript'),
        onClick: actions.view,
        disabled: !actions.view,
        busy: false,
        icon: 'file'
      };
    }
    return {
      label: t('transcribe'),
      onClick: actions.startRealtime,
      disabled: false,
      busy: false,
      icon: 'mic'
    };
  }

  // History mode
  const recording = data?.recording;
  const realtime = data?.realtime;

  if (recording?.status === 'completed' || realtime?.status === 'completed') {
    return {
      label: t('viewTranscript'),
      onClick: actions.view,
      disabled: !actions.view,
      busy: false,
      icon: 'file'
    };
  }
  if (recording?.status === 'processing') {
    return { label: t('processing'), disabled: true, busy: true, icon: 'none' };
  }
  if (recording?.status === 'failed') {
    return {
      label: t('tryAgain'),
      onClick: actions.retryRecording,
      disabled: false,
      busy: false,
      icon: 'file'
    };
  }
  if (data?.recordingAvailable) {
    return {
      label: t('transcribe'),
      onClick: actions.transcribeRecording,
      disabled: false,
      busy: false,
      icon: 'file'
    };
  }
  return { label: t('unavailable'), disabled: true, busy: false, icon: 'none' };
}
