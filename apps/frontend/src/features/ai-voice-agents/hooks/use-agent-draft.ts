'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction
} from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useVoiceAgentApi, type SaveAgentBody } from '../api';
import { describeApiError, fieldErrorsFrom } from '../lib/api-error';
import type {
  CalendarIntegrationOption,
  CompanyProfile,
  VoiceAgent,
  VoiceAgentCallerNumber,
  VoiceAgentConversationSettings,
  VoiceAgentExtractionField,
  VoiceAgentModelOption,
  VoiceAgentModelProvider,
  VoiceAgentType,
  VoiceAgentVoice
} from '../types';

/**
 * Everything the create wizard and the edit screen both need.
 *
 * The two surfaces show the same fields in a different frame — a guided flow
 * versus a settings screen — so the state, the validation and the save live
 * here once instead of being written twice and drifting apart.
 *
 * Errors are field-addressed, not a stream of toasts. `errors[path]` is what a
 * control renders under itself, and it is filled from two places that agree on
 * the same paths: this file's own checks, which run before a request is made,
 * and the `fields` map the API returns when it rejects one. A user who submits
 * something the server refuses ends up looking at the input that caused it.
 */

/** Which step of the form a field belongs to, so a wizard can jump to it. */
export const FIELD_STEPS: Record<
  string,
  'setup' | 'voice' | 'company' | 'conversation'
> = {
  name: 'setup',
  modelProvider: 'setup',
  apiKey: 'setup',
  callerNumberId: 'setup',
  calendarIntegrationId: 'setup',
  meetingDurationMinutes: 'setup',
  timezone: 'setup',
  meetingTitle: 'setup',
  voiceId: 'voice',
  companyName: 'company',
  companyWebsite: 'company',
  companyDescription: 'company',
  'conversation.greeting': 'conversation',
  'conversation.instructions': 'conversation',
  'conversation.postConversationInstructions': 'conversation'
};

export type DraftErrors = Record<string, string>;

/** A website the user can type either way: "acme.com" or "https://acme.com". */
function looksLikeWebsite(value: string): boolean {
  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`
    );
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function isKnownTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function useAgentDraft(type: VoiceAgentType, agent?: VoiceAgent) {
  const t = useTranslations('aiVoiceAgents.validation');
  const tBlockers = useTranslations('aiVoiceAgents.blockers');
  const api = useVoiceAgentApi();

  const [name, setName] = useState(agent?.name ?? '');
  const [modelProvider, setModelProvider] = useState<VoiceAgentModelProvider>(
    agent?.modelProvider ?? 'ringee'
  );
  const [apiKey, setApiKeyValue] = useState('');
  const [keyVerified, setKeyVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [voices, setVoices] = useState<VoiceAgentVoice[]>([]);
  const [models, setModels] = useState<VoiceAgentModelOption[]>([]);
  const [calendars, setCalendars] = useState<CalendarIntegrationOption[]>([]);
  const [callerNumbers, setCallerNumbers] = useState<VoiceAgentCallerNumber[]>(
    []
  );
  /**
   * Which number the agent presents. Empty means the agent has none of its own
   * and whoever triggers a call picks one — see `StartCallDialog`.
   */
  const [callerNumberId, setCallerNumberId] = useState(
    agent?.callerNumberId ?? ''
  );
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [voiceId, setVoiceId] = useState(agent?.voiceId ?? '');

  const [company, setCompany] = useState<CompanyProfile>({
    companyName: agent?.companyName ?? '',
    companyWebsite: agent?.companyWebsite ?? '',
    companyDescription: agent?.companyDescription ?? ''
  });

  const [summary, setSummary] = useState(
    agent?.analysisSettings?.summary ?? true
  );
  const [sentiment, setSentiment] = useState(
    agent?.analysisSettings?.sentiment ?? false
  );
  const [fields, setFields] = useState<VoiceAgentExtractionField[]>(
    agent?.extractionFields ?? []
  );

  // Creation still follows the blueprint without sending an override. The
  // detail endpoint resolves that blueprint into concrete values for editing.
  const [conversation, setConversationState] =
    useState<VoiceAgentConversationSettings | null>(
      agent?.conversationSettings ?? null
    );
  const conversationBaseline = useRef(
    JSON.stringify(agent?.conversationSettings ?? null)
  );
  const [conversationChanged, setConversationChanged] = useState(false);

  const setConversation = useCallback(
    (value: SetStateAction<VoiceAgentConversationSettings | null>) => {
      setConversationState((current) => {
        const next = typeof value === 'function' ? value(current) : value;
        setConversationChanged(
          JSON.stringify(next) !== conversationBaseline.current
        );
        return next;
      });
    },
    []
  );

  const [calendarId, setCalendarId] = useState(
    agent?.calendarIntegrationId ?? ''
  );
  const [duration, setDuration] = useState(agent?.meetingDurationMinutes ?? 30);
  const [timezone, setTimezone] = useState(
    agent?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [meetingTitle, setMeetingTitle] = useState(
    agent?.meetingTitle ?? 'Meeting'
  );

  const [saving, setSaving] = useState(false);

  /**
   * Errors the server sent back, plus the ones a submit produced locally. They
   * are kept apart from the live checks below so a message the user has already
   * fixed disappears the moment they fix it.
   */
  const [submittedErrors, setSubmittedErrors] = useState<DraftErrors>({});
  /** The reason a save failed outright, shown once at the top of the form. */
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [voiceList, modelList, calendarList, numberList] =
        await Promise.all([
          api.listVoices().catch(() => []),
          api.listModels().catch(() => []),
          api.listCalendars().catch(() => []),
          api.listCallerNumbers().catch(() => [])
        ]);
      setVoices(voiceList);
      setModels(modelList);
      setCalendars(calendarList.filter((c) => c.isActive));
      setCallerNumbers(numberList);
      setCatalogueLoading(false);
    })();
  }, [api]);

  const selectedVoice = useMemo(
    () => voices.find((v) => v.id === voiceId) ?? null,
    [voices, voiceId]
  );

  const selectedModel = useMemo(
    () => models.find((m) => m.provider === modelProvider) ?? null,
    [models, modelProvider]
  );

  const needsKey = selectedModel?.requiresApiKey ?? false;
  const keyAlreadySaved = agent?.modelProvider === modelProvider;

  /**
   * Everything wrong with the draft right now, by field path. The paths match
   * what the API's `fields` map uses, so the two sources merge cleanly.
   */
  const liveErrors = useMemo<DraftErrors>(() => {
    const found: DraftErrors = {};

    if (!name.trim()) found.name = t('nameRequired');
    else if (name.trim().length > 60) {
      found.name = t('nameTooLong');
    }

    if (needsKey && !keyAlreadySaved && !keyVerified) {
      found.apiKey = apiKey ? t('verifyKey') : t('pasteKey');
    }

    const website = company.companyWebsite?.trim();
    if (website && !looksLikeWebsite(website)) {
      found.companyWebsite = t('websiteInvalid');
    }

    if (type === 'appointment_booking') {
      if (!Number.isInteger(duration) || duration < 5 || duration > 240) {
        found.meetingDurationMinutes = t('durationRange');
      }
      if (timezone && !isKnownTimezone(timezone)) {
        found.timezone = t('timezoneInvalid');
      }
    }

    fields.forEach((field, index) => {
      if (!field.label.trim()) {
        found[`extractionFields.${index}.label`] = t('fieldLabelRequired');
      } else if (!/^[a-z][a-z0-9_]*$/.test(field.key)) {
        found[`extractionFields.${index}.key`] = t('fieldKeyInvalid');
      }
    });

    if (conversation) {
      if (!conversation.instructions.trim()) {
        found['conversation.instructions'] = t('instructionsRequired');
      } else if (conversation.instructions.length > 100000) {
        found['conversation.instructions'] = t('instructionsTooLong');
      }
      if (
        conversation.greetingMode === 'assistant_speaks_first' &&
        !conversation.greeting.trim()
      ) {
        found['conversation.greeting'] = t('greetingRequired');
      } else if (conversation.greeting.length > 3000) {
        found['conversation.greeting'] = t('greetingTooLong');
      }
      if (conversation.postConversationInstructions.length > 20000) {
        found['conversation.postConversationInstructions'] = t(
          'postInstructionsTooLong'
        );
      }
    }

    return found;
  }, [
    name,
    needsKey,
    keyAlreadySaved,
    keyVerified,
    apiKey,
    company.companyWebsite,
    type,
    duration,
    timezone,
    fields,
    conversation,
    t
  ]);

  const errors = useMemo<DraftErrors>(
    () => ({ ...submittedErrors, ...liveErrors }),
    [submittedErrors, liveErrors]
  );

  const setApiKey = useCallback((value: string) => {
    setApiKeyValue(value);
    setKeyVerified(false);
  }, []);

  const verifyKey = useCallback(async () => {
    setVerifying(true);
    try {
      const result = await api.verifyCredential(modelProvider, apiKey);
      setKeyVerified(result.valid);
      if (result.valid) {
        setSubmittedErrors((prev) => {
          const { apiKey: _cleared, ...rest } = prev;
          return rest;
        });
        toast.success(t('keyVerified'));
      } else {
        setSubmittedErrors((prev) => ({
          ...prev,
          apiKey: result.reason ?? t('keyRejected')
        }));
      }
    } catch (error) {
      setSubmittedErrors((prev) => ({
        ...prev,
        apiKey: describeApiError(error, t('keyCheckError'))
      }));
    } finally {
      setVerifying(false);
    }
  }, [api, apiKey, modelProvider, t]);

  const chooseModel = useCallback((provider: VoiceAgentModelProvider) => {
    setModelProvider(provider);
    setKeyVerified(false);
    setApiKeyValue('');
    setSubmittedErrors((prev) => {
      const { apiKey: _cleared, ...rest } = prev;
      return rest;
    });
  }, []);

  /**
   * What still stands between this draft and an agent that can take calls.
   * A blocker is not an error: a draft may be saved without a calendar, it
   * just cannot be activated. `errors` is what stops a save.
   */
  const blockers = useMemo(() => {
    const list: string[] = [];
    if (!name.trim()) list.push(tBlockers('name'));
    if (!voiceId) list.push(tBlockers('voice'));
    if (needsKey && !keyAlreadySaved && !keyVerified)
      list.push(tBlockers('apiKey'));
    if (type === 'appointment_booking' && !calendarId)
      list.push(tBlockers('calendar'));
    return list;
  }, [
    name,
    voiceId,
    needsKey,
    keyAlreadySaved,
    keyVerified,
    type,
    calendarId,
    tBlockers
  ]);

  const body = useMemo<SaveAgentBody>(
    () => ({
      name: name.trim(),
      modelProvider,
      ...(apiKey ? { apiKey } : {}),
      voiceId: voiceId || null,
      companyName: company.companyName?.trim() || null,
      companyWebsite: company.companyWebsite?.trim() || null,
      companyDescription: company.companyDescription?.trim() || null,
      analysis: { summary, sentiment },
      extractionFields: fields.filter((f) => f.key && f.label),
      ...(conversationChanged && conversation ? { conversation } : {}),
      callerNumberId: callerNumberId || null,
      ...(type === 'appointment_booking'
        ? {
            calendarIntegrationId: calendarId || null,
            meetingDurationMinutes: duration,
            timezone,
            meetingTitle
          }
        : {})
    }),
    [
      name,
      modelProvider,
      apiKey,
      voiceId,
      company,
      summary,
      sentiment,
      fields,
      conversation,
      conversationChanged,
      callerNumberId,
      type,
      calendarId,
      duration,
      timezone,
      meetingTitle
    ]
  );

  /**
   * The saved baseline the "unsaved changes" footer compares against.
   *
   * The API key is left out of it and tracked on its own: it is write-only, so
   * it is cleared after a save, and a baseline that still carried it would keep
   * the footer on screen forever after saving a key.
   */
  const persisted = useMemo(() => {
    const { apiKey: _writeOnly, ...rest } = body;
    return JSON.stringify(rest);
  }, [body]);

  const savedSnapshot = useRef(persisted);
  const dirty = persisted !== savedSnapshot.current || apiKey.length > 0;

  /**
   * Returns the errors it ended with rather than only `null`, because the state
   * it just set is not readable from the caller's closure — and the caller is
   * the one that has to move the user to the field that failed.
   */
  const save = useCallback(async (): Promise<{
    saved: VoiceAgent | null;
    errors: DraftErrors;
  }> => {
    setSaveError(null);

    if (Object.keys(liveErrors).length > 0) {
      // Nothing is sent: the same rules run on the server, and a round trip
      // only delays a message the form can already show against the field.
      setSubmittedErrors(liveErrors);
      return { saved: null, errors: liveErrors };
    }
    setSubmittedErrors({});

    setSaving(true);
    try {
      const saved = agent
        ? await api.update(agent.id, body)
        : await api.create({ ...body, type });
      savedSnapshot.current = persisted;
      setApiKeyValue('');
      return { saved, errors: {} };
    } catch (error) {
      const fromFields = fieldErrorsFrom(error);
      setSubmittedErrors(fromFields);
      const message = describeApiError(error, t('saveError'));
      // A field-addressed failure is already on the inputs; a general one is
      // the only thing the user has to go on, so it is kept at the top.
      if (Object.keys(fromFields).length === 0) setSaveError(message);
      toast.error(message);
      return { saved: null, errors: fromFields };
    } finally {
      setSaving(false);
    }
  }, [agent, api, body, liveErrors, persisted, type, t]);

  return {
    name,
    setName,
    modelProvider,
    chooseModel,
    models,
    selectedModel,
    apiKey,
    setApiKey,
    keyVerified,
    verifying,
    verifyKey,
    needsKey,
    keyAlreadySaved,
    voices,
    catalogueLoading,
    voiceId,
    setVoiceId,
    selectedVoice,
    company,
    setCompany,
    summary,
    setSummary,
    sentiment,
    setSentiment,
    fields,
    setFields,
    conversation,
    setConversation,
    calendars,
    calendarId,
    setCalendarId,
    callerNumbers,
    callerNumberId,
    setCallerNumberId,
    duration,
    setDuration,
    timezone,
    setTimezone,
    meetingTitle,
    setMeetingTitle,
    blockers,
    errors,
    saveError,
    clearSaveError: () => setSaveError(null),
    dirty,
    saving,
    save
  };
}

export type AgentDraft = ReturnType<typeof useAgentDraft>;
