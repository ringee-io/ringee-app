'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Checkbox } from '@ringee/frontend-shared/components/ui/checkbox';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import { useVoiceAgentApi, type SaveAgentBody } from '../api';
import type {
  ExtractionFieldType,
  VoiceAgent,
  VoiceAgentExtractionField,
  VoiceAgentModelOption,
  VoiceAgentModelProvider,
  VoiceAgentType,
  VoiceAgentTypeInfo,
  VoiceAgentVoice
} from '../types';

const MODEL_LABELS: Record<VoiceAgentModelProvider, string> = {
  ringee: 'Ringee AI',
  openai: 'OpenAI',
  anthropic: 'Claude',
  google: 'Gemini'
};

const FIELD_TYPES: ExtractionFieldType[] = [
  'text',
  'number',
  'boolean',
  'select'
];

interface Props {
  /** Present when editing; absent when creating. */
  agent?: VoiceAgent;
  type: VoiceAgentType;
  typeInfo?: VoiceAgentTypeInfo;
}

/**
 * Everything the user configures (§4–§8, §15). Deliberately short: the
 * instructions, greeting, tools and conversation rules are Ringee's, and never
 * appear here.
 */
export function AgentForm({ agent, type, typeInfo }: Props) {
  const api = useVoiceAgentApi();
  const router = useRouter();

  const [name, setName] = useState(agent?.name ?? '');
  const [modelProvider, setModelProvider] = useState<VoiceAgentModelProvider>(
    agent?.modelProvider ?? 'ringee'
  );
  const [apiKey, setApiKey] = useState('');
  const [keyVerified, setKeyVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [voices, setVoices] = useState<VoiceAgentVoice[]>([]);
  const [models, setModels] = useState<VoiceAgentModelOption[]>([]);
  const [language, setLanguage] = useState<string>(
    agent?.voiceLanguage ?? 'en'
  );
  const [voiceId, setVoiceId] = useState(agent?.voiceId ?? '');

  const [summary, setSummary] = useState(
    agent?.analysisSettings?.summary ?? true
  );
  const [sentiment, setSentiment] = useState(
    agent?.analysisSettings?.sentiment ?? false
  );
  const [fields, setFields] = useState<VoiceAgentExtractionField[]>(
    agent?.extractionFields ?? []
  );

  const [duration, setDuration] = useState(agent?.meetingDurationMinutes ?? 30);
  const [timezone, setTimezone] = useState(
    agent?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [meetingTitle, setMeetingTitle] = useState(
    agent?.meetingTitle ?? 'Meeting'
  );

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const [voiceList, modelList] = await Promise.all([
        api.listVoices().catch(() => []),
        api.listModels().catch(() => [])
      ]);
      setVoices(voiceList);
      setModels(modelList);
    })();
  }, [api]);

  const languages = useMemo(
    () => [...new Set(voices.map((v) => v.language))].sort(),
    [voices]
  );
  const voicesForLanguage = useMemo(
    () => voices.filter((v) => v.language === language),
    [voices, language]
  );

  const needsKey =
    models.find((m) => m.provider === modelProvider)?.requiresApiKey ?? false;
  const keyAlreadySaved = agent?.modelProvider === modelProvider;

  const verifyKey = async () => {
    setVerifying(true);
    try {
      const result = await api.verifyCredential(modelProvider, apiKey);
      setKeyVerified(result.valid);
      if (result.valid) toast.success('API key verified');
      else toast.error(result.reason ?? 'That key was rejected');
    } finally {
      setVerifying(false);
    }
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error('Give the agent a name');
      return;
    }
    if (needsKey && !keyAlreadySaved && !keyVerified) {
      toast.error('Verify the API key first');
      return;
    }

    const body: SaveAgentBody = {
      name: name.trim(),
      modelProvider,
      ...(apiKey ? { apiKey } : {}),
      voiceId: voiceId || null,
      analysis: { summary, sentiment },
      extractionFields: fields.filter((f) => f.key && f.label),
      ...(type === 'appointment_booking'
        ? {
            meetingDurationMinutes: duration,
            timezone,
            meetingTitle
          }
        : {})
    };

    setSaving(true);
    try {
      const saved = agent
        ? await api.update(agent.id, body)
        : await api.create({ ...body, type });
      toast.success(agent ? 'Agent updated' : 'Agent created');
      router.push(`/dashboard/ai-voice-agents/${saved.id}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not save the agent'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
          <CardDescription>
            The name is what the agent calls itself on the phone.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='agent-name'>Agent name</Label>
            <Input
              id='agent-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Sofia'
            />
          </div>

          <div className='space-y-2'>
            <Label>AI model</Label>
            <Select
              value={modelProvider}
              onValueChange={(value) => {
                setModelProvider(value as VoiceAgentModelProvider);
                setKeyVerified(false);
                setApiKey('');
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.provider} value={model.provider}>
                    {MODEL_LABELS[model.provider]}
                    {model.provider === 'ringee' ? ' — Recommended' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {modelProvider === 'ringee' ? (
              <p className='text-muted-foreground text-sm'>
                Optimized for real-time voice conversations. No external API key
                required.
              </p>
            ) : null}
          </div>

          {needsKey ? (
            <div className='space-y-2'>
              <Label htmlFor='agent-key'>API key</Label>
              <div className='flex gap-2'>
                <Input
                  id='agent-key'
                  type='password'
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setKeyVerified(false);
                  }}
                  placeholder={
                    keyAlreadySaved
                      ? 'Saved — enter a new key to replace it'
                      : ''
                  }
                />
                <Button
                  type='button'
                  variant='outline'
                  onClick={verifyKey}
                  disabled={verifying || !apiKey}
                >
                  {verifying ? (
                    <Loader2 className='size-4 animate-spin' />
                  ) : keyVerified ? (
                    <Check className='size-4' />
                  ) : (
                    'Verify'
                  )}
                </Button>
              </div>
              <p className='text-muted-foreground text-sm'>
                The key is held by the voice provider. Ringee never stores it.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Voice</CardTitle>
          <CardDescription>
            The agent speaks the language of the voice you pick.
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label>Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((code) => (
                  <SelectItem key={code} value={code}>
                    {new Intl.DisplayNames([code], { type: 'language' }).of(
                      code
                    ) ?? code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-2'>
            <Label>Voice</Label>
            <Select value={voiceId} onValueChange={setVoiceId}>
              <SelectTrigger>
                <SelectValue placeholder='Choose a voice' />
              </SelectTrigger>
              <SelectContent>
                {voicesForLanguage.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.displayName}
                    {voice.accent ? ` · ${voice.accent}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {type === 'appointment_booking' ? (
        <Card>
          <CardHeader>
            <CardTitle>Meetings</CardTitle>
            <CardDescription>
              {typeInfo?.requiresCalendar
                ? 'Connect a calendar in Settings before this agent can book.'
                : null}
            </CardDescription>
          </CardHeader>
          <CardContent className='grid gap-4 sm:grid-cols-3'>
            <div className='space-y-2'>
              <Label htmlFor='meeting-duration'>Duration (minutes)</Label>
              <Input
                id='meeting-duration'
                type='number'
                min={5}
                max={240}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='meeting-timezone'>Time zone</Label>
              <Input
                id='meeting-timezone'
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder='America/New_York'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='meeting-title'>Meeting title</Label>
              <Input
                id='meeting-title'
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                placeholder='Product Demo'
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>After the call</CardTitle>
          <CardDescription>
            What Ringee works out from the conversation once it ends.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <label className='flex items-center gap-2 text-sm'>
              <Checkbox
                checked={summary}
                onCheckedChange={(v) => setSummary(v === true)}
              />
              Call summary
            </label>
            <label className='text-muted-foreground flex items-center gap-2 text-sm'>
              <Checkbox checked disabled />
              Outcome — always on, it is what callers branch on
            </label>
            <label className='flex items-center gap-2 text-sm'>
              <Checkbox
                checked={sentiment}
                onCheckedChange={(v) => setSentiment(v === true)}
              />
              Sentiment
            </label>
          </div>

          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <Label>Extract custom information</Label>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() =>
                  setFields((prev) => [
                    ...prev,
                    { key: '', label: '', type: 'text', description: '' }
                  ])
                }
              >
                <Plus className='mr-1 size-3.5' />
                Add field
              </Button>
            </div>

            {fields.map((field, index) => (
              <div
                key={index}
                className='grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_140px_auto]'
              >
                <Input
                  value={field.label}
                  placeholder='Team size'
                  onChange={(e) =>
                    setFields((prev) =>
                      prev.map((f, i) =>
                        i === index
                          ? {
                              ...f,
                              label: e.target.value,
                              key: e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, '_')
                                .replace(/^_+|_+$/g, '')
                            }
                          : f
                      )
                    )
                  }
                />
                <Input
                  value={field.description}
                  placeholder='Number of people on the sales team'
                  onChange={(e) =>
                    setFields((prev) =>
                      prev.map((f, i) =>
                        i === index ? { ...f, description: e.target.value } : f
                      )
                    )
                  }
                />
                <Select
                  value={field.type}
                  onValueChange={(value) =>
                    setFields((prev) =>
                      prev.map((f, i) =>
                        i === index
                          ? { ...f, type: value as ExtractionFieldType }
                          : f
                      )
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  onClick={() =>
                    setFields((prev) => prev.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 className='size-4' />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className='flex justify-end gap-2'>
        <Button variant='outline' onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving && <Loader2 className='mr-2 size-4 animate-spin' />}
          {agent ? 'Save changes' : 'Create agent'}
        </Button>
      </div>
    </div>
  );
}
