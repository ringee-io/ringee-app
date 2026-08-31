'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, Pause, Play, Search, Volume2 } from 'lucide-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useVoicePreview } from '../hooks/use-voice-preview';
import {
  flagEmoji,
  genderLabel,
  languageName,
  voiceOrigin
} from '../lib/voice-format';
import { controlClass } from './fields/field';
import type { VoiceAgentVoice } from '../types';

type GenderFilter = 'all' | VoiceAgentVoice['gender'];

const GENDER_FILTERS: Array<{ value: GenderFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' }
];

interface Props {
  voices: VoiceAgentVoice[];
  loading?: boolean;
  selectedId: string;
  onSelect: (voice: VoiceAgentVoice) => void;
}

/**
 * Pick a voice by hearing it.
 *
 * The language of the voice is the language the agent speaks, so language is
 * the first filter rather than a field buried under the name. Every voice can
 * be played before it is chosen — selecting one is a separate click from
 * hearing it, so a user can audition the whole list without changing anything.
 */
export function VoicePicker({ voices, loading, selectedId, onSelect }: Props) {
  const { play, playingId, loadingId } = useVoicePreview();
  const [language, setLanguage] = useState<string | null>(null);
  const [gender, setGender] = useState<GenderFilter>('all');
  const [query, setQuery] = useState('');

  const languages = useMemo(
    () => [...new Set(voices.map((v) => v.language))].sort(),
    [voices]
  );

  // The selected voice's language wins until the user picks another, so an
  // agent being edited opens on the language it already speaks.
  const selectedVoice = voices.find((v) => v.id === selectedId);
  const activeLanguage =
    language ?? selectedVoice?.language ?? languages[0] ?? null;

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return voices.filter((voice) => {
      if (activeLanguage && voice.language !== activeLanguage) return false;
      if (gender !== 'all' && voice.gender !== gender) return false;
      if (!needle) return true;
      return `${voice.displayName} ${voice.description ?? ''} ${
        voice.accent ?? ''
      }`
        .toLowerCase()
        .includes(needle);
    });
  }, [voices, activeLanguage, gender, query]);

  if (loading) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-9 w-full' />
        <div className='grid gap-3 sm:grid-cols-2'>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className='h-[72px] w-full' />
          ))}
        </div>
      </div>
    );
  }

  if (voices.length === 0) {
    return (
      <div className='text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm'>
        No voices available right now. Try again in a moment.
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        {languages.map((code) => {
          const sample = voices.find((v) => v.language === code);
          const active = code === activeLanguage;
          return (
            <button
              key={code}
              type='button'
              onClick={() => setLanguage(code)}
              className={cn(
                'focus-visible:ring-ring flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              )}
            >
              <span aria-hidden>{flagEmoji(sample?.countryCode)}</span>
              {languageName(code)}
            </button>
          );
        })}
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <div className='bg-muted flex h-10 items-center rounded-lg p-1'>
          {GENDER_FILTERS.map((option) => (
            <button
              key={option.value}
              type='button'
              onClick={() => setGender(option.value)}
              className={cn(
                'h-8 rounded-lg px-3 text-sm transition-colors',
                gender === option.value
                  ? 'bg-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className='relative min-w-[180px] flex-1'>
          <Search className='text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2' />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search voices'
            className={cn(controlClass, 'pl-9')}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <div className='text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm'>
          No voice matches those filters.
        </div>
      ) : (
        <div
          role='radiogroup'
          aria-label='Voice'
          className='grid gap-3 sm:grid-cols-2'
        >
          {shown.map((voice) => {
            const selected = voice.id === selectedId;
            const isPlaying = playingId === voice.id;
            const isLoading = loadingId === voice.id;
            return (
              <div
                key={voice.id}
                role='radio'
                aria-checked={selected}
                tabIndex={0}
                onClick={() => onSelect(voice)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(voice);
                  }
                }}
                className={cn(
                  'focus-visible:ring-ring group flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-all focus-visible:ring-2 focus-visible:outline-none',
                  selected
                    ? 'border-primary ring-primary/20 bg-primary/5 ring-2'
                    : 'hover:border-primary/40 hover:bg-muted/40'
                )}
              >
                <Button
                  type='button'
                  size='icon'
                  variant={isPlaying ? 'default' : 'secondary'}
                  className='size-10 shrink-0 rounded-lg'
                  aria-label={
                    isPlaying
                      ? `Stop ${voice.displayName}`
                      : `Play ${voice.displayName}`
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    void play(voice.id);
                  }}
                >
                  {isLoading ? (
                    <Loader2 className='size-4 animate-spin' />
                  ) : isPlaying ? (
                    <Pause className='size-4' />
                  ) : (
                    <Play className='size-4' />
                  )}
                </Button>

                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-1.5'>
                    <span className='truncate font-medium'>
                      {voice.displayName}
                    </span>
                    <span aria-hidden className='text-base leading-none'>
                      {flagEmoji(voice.countryCode)}
                    </span>
                    {isPlaying ? (
                      <Volume2 className='text-primary size-3.5 shrink-0 animate-pulse' />
                    ) : null}
                  </div>
                  <p className='text-muted-foreground truncate text-xs'>
                    {voice.description || voiceOrigin(voice)}
                  </p>
                </div>

                {selected ? (
                  <Badge className='shrink-0 gap-1 rounded-lg'>
                    <Check className='size-3' />
                    Selected
                  </Badge>
                ) : (
                  <span className='text-muted-foreground shrink-0 text-xs'>
                    {genderLabel(voice.gender)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
