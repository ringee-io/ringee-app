'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Copy, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@ringee/frontend-shared/components/ui/dropdown-menu';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { useVoiceAgentApi } from '../api';
import { describeApiError } from '../lib/api-error';
import type { CompanyProfile, ReusableCompanyContext } from '../types';
import { Field, controlClass, textAreaClass } from './fields/field';

interface Props {
  value: CompanyProfile;
  onChange: (value: CompanyProfile) => void;
  /** Excluded from the reuse list — an agent cannot copy from itself. */
  currentAgentId?: string;
  /** Field-addressed errors from the draft, keyed the way the API sends them. */
  errors?: Record<string, string>;
}

/**
 * The company an agent speaks for. It belongs to the agent, because one
 * workspace runs agents for several brands or clients, and the two shortcuts
 * are what keep that from being tedious: copy another agent's context, or let
 * Ringee draft one from the website.
 */
export function CompanyContextFields({
  value,
  onChange,
  currentAgentId,
  errors = {}
}: Props) {
  const api = useVoiceAgentApi();
  const [reusable, setReusable] = useState<ReusableCompanyContext[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const contexts = await api.listCompanyContexts().catch(() => []);
      setReusable(contexts.filter((c) => c.agentId !== currentAgentId));
    })();
  }, [api, currentAgentId]);

  const set = useCallback(
    (patch: Partial<CompanyProfile>) => onChange({ ...value, ...patch }),
    [onChange, value]
  );

  const adopt = (source: ReusableCompanyContext) => {
    onChange({
      companyName: source.companyName,
      companyWebsite: source.companyWebsite,
      companyDescription: source.companyDescription
    });
    toast.success(`Copied the context from ${source.label}`);
  };

  const generate = async () => {
    const website = value.companyWebsite?.trim();
    if (!website) {
      setGenerateError('Add the website first, then draft from it.');
      return;
    }
    setGenerateError(null);
    setGenerating(true);
    try {
      const { description } = await api.generateCompanyDescription(website);
      set({ companyDescription: description });
      toast.success('Drafted from the website — review it before saving');
    } catch (error) {
      setGenerateError(describeApiError(error, 'Could not read that website.'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className='space-y-5'>
      {reusable.length > 0 ? (
        <div className='bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border p-3'>
          <Copy className='text-muted-foreground size-4 shrink-0' />
          <span className='text-sm'>Reuse a context</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type='button'
                variant='outline'
                className='bg-background ml-auto h-10 w-full justify-between rounded-lg sm:w-64'
              >
                Copy from…
                <ChevronDown className='size-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-64'>
              {reusable.map((context) => (
                <DropdownMenuItem
                  key={context.agentId ?? 'workspace'}
                  onSelect={() => adopt(context)}
                  className='flex-col items-start gap-0'
                >
                  <span className='font-medium'>{context.label}</span>
                  {context.companyName ? (
                    <span className='text-muted-foreground text-xs'>
                      {context.companyName}
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      <div className='grid gap-4 sm:grid-cols-2'>
        <Field
          label='Company name'
          htmlFor='company-name'
          error={errors.companyName}
          hint='The name the agent says it is calling from.'
        >
          <Input
            id='company-name'
            value={value.companyName ?? ''}
            onChange={(e) => set({ companyName: e.target.value })}
            placeholder='Acme'
            maxLength={120}
            aria-invalid={Boolean(errors.companyName)}
            className={controlClass}
          />
        </Field>

        <Field
          label='Website'
          htmlFor='company-website'
          error={errors.companyWebsite}
          hint='acme.com is enough — Ringee can read it for you.'
        >
          <Input
            id='company-website'
            value={value.companyWebsite ?? ''}
            onChange={(e) => set({ companyWebsite: e.target.value })}
            placeholder='acme.com'
            maxLength={300}
            aria-invalid={Boolean(errors.companyWebsite)}
            className={controlClass}
          />
        </Field>
      </div>

      <Field
        label='What the company does'
        htmlFor='company-description'
        error={errors.companyDescription ?? generateError ?? undefined}
        hint='The agent introduces itself with this on every call.'
        action={
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='rounded-lg'
            onClick={() => void generate()}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className='size-3.5 animate-spin' />
            ) : (
              <Sparkles className='size-3.5' />
            )}
            Draft from website
          </Button>
        }
      >
        <Textarea
          id='company-description'
          value={value.companyDescription ?? ''}
          onChange={(e) => set({ companyDescription: e.target.value })}
          rows={6}
          maxLength={4000}
          placeholder='What you do, who you serve, what you offer.'
          aria-invalid={Boolean(errors.companyDescription)}
          className={textAreaClass}
        />
      </Field>
    </div>
  );
}
