'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { Switch } from '@ringee/frontend-shared/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ringee/frontend-shared/components/ui/select';
import {
  useBackofficeApi,
  type OfferAudienceType,
  type OfferDetail,
  type OfferPlacement,
  type OfferStatus,
  type OfferWriteBody
} from '../api';
import { errorMessage } from '../lib/format';

const STATUSES: OfferStatus[] = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'ENDED',
  'ARCHIVED'
];

const PLACEMENTS: OfferPlacement[] = [
  'TOP_BANNER',
  'DASHBOARD_CARD',
  'MODAL',
  'SIDEBAR',
  'SETTINGS',
  'CHECKOUT',
  'CAMPAIGN_PAGE',
  'INBOX'
];

const AUDIENCES: OfferAudienceType[] = ['PERSONAL', 'ORGANIZATION', 'BOTH'];

/** The four blocks the engine reads. Editing them is how a promotion is built. */
const CONFIG_FIELDS = [
  {
    key: 'eligibilityConfig' as const,
    label: 'Eligibility',
    hint: 'Rule tree. Flat `{ all: [...] }`, or `{ personal, organization: { workspace, member } }`. Operators: eq, neq, gt, gte, lt, lte, in, not_in, exists.'
  },
  {
    key: 'rewardConfig' as const,
    label: 'Reward',
    hint: '`{ type: "CREDIT" | "NONE", amount, currency, destination }`, optionally split into `personal` / `organization`.'
  },
  {
    key: 'actionConfig' as const,
    label: 'Action',
    hint: '`{ type: "EXTERNAL_URL_SUBMISSION" | "INTERNAL_ACTION" | "CTA_ONLY", field, allowedDomains, unique, href, hrefLabel, fieldLabel, fieldPlaceholder, helpText, helpImage, helpImageAlt, submitLabel }`. `helpImage` is a screenshot shown in the dialog — a /public path or absolute URL.'
  },
  {
    key: 'displayConfig' as const,
    label: 'Display',
    hint: 'Copy templates per workspace. Tokens: {{rewardAmount}}, {{potentialReward}}, {{currency}}, {{eligibleParticipants}}, {{remainingParticipants}}.'
  },
  {
    key: 'frequencyConfig' as const,
    label: 'Frequency',
    hint: '`{ mode: "ONCE_PER_USER" | ..., dismissible, showAgainAfterHours }`.'
  }
];

type ConfigKey = (typeof CONFIG_FIELDS)[number]['key'];

interface FormState {
  slug: string;
  name: string;
  internalName: string;
  title: string;
  description: string;
  status: OfferStatus;
  placement: OfferPlacement;
  audienceType: OfferAudienceType;
  priority: string;
  startsAt: string;
  endsAt: string;
  maxClaims: string;
  maxClaimsPerUser: string;
  requiresApproval: boolean;
  configs: Record<ConfigKey, string>;
}

/** `2026-08-18T12:00:00.000Z` → `2026-08-18T12:00`, what the input wants. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const EMPTY_CONFIGS: Record<ConfigKey, string> = {
  eligibilityConfig: '{}',
  rewardConfig: '{\n  "type": "NONE"\n}',
  actionConfig: '{\n  "type": "CTA_ONLY"\n}',
  displayConfig: '{}',
  frequencyConfig: '{\n  "dismissible": true\n}'
};

function initialState(offer?: OfferDetail): FormState {
  if (!offer) {
    return {
      slug: '',
      name: '',
      internalName: '',
      title: '',
      description: '',
      status: 'DRAFT',
      placement: 'TOP_BANNER',
      audienceType: 'BOTH',
      priority: '50',
      startsAt: '',
      endsAt: '',
      maxClaims: '',
      maxClaimsPerUser: '1',
      requiresApproval: false,
      configs: { ...EMPTY_CONFIGS }
    };
  }

  const pretty = (value: unknown) => JSON.stringify(value ?? {}, null, 2);
  return {
    slug: offer.slug,
    name: offer.name,
    internalName: offer.internalName ?? '',
    title: offer.title,
    description: offer.description ?? '',
    status: offer.status,
    placement: offer.placement,
    audienceType: offer.audienceType,
    priority: String(offer.priority),
    startsAt: toLocalInput(offer.startsAt),
    endsAt: toLocalInput(offer.endsAt),
    maxClaims: offer.maxClaims === null ? '' : String(offer.maxClaims),
    maxClaimsPerUser: String(offer.maxClaimsPerUser),
    requiresApproval: offer.requiresApproval,
    configs: {
      eligibilityConfig: pretty(offer.eligibilityConfig),
      rewardConfig: pretty(offer.rewardConfig),
      actionConfig: pretty(offer.actionConfig),
      displayConfig: pretty(offer.displayConfig),
      frequencyConfig: pretty(offer.frequencyConfig)
    }
  };
}

/**
 * Create/edit form for an offer.
 *
 * The structured fields are ordinary inputs; the five JSON blocks are edited
 * raw, because they are exactly what the engine reads. That is what makes a new
 * promotion a form submission instead of a deploy — this component has no idea
 * what any particular offer does.
 */
export function OfferForm({
  offer,
  onSaved
}: {
  offer?: OfferDetail;
  onSaved?: (offer: OfferDetail) => void;
}) {
  const api = useBackofficeApi();
  const router = useRouter();
  const [state, setState] = useState<FormState>(() => initialState(offer));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((current) => ({ ...current, [key]: value }));

  const setConfig = (key: ConfigKey, value: string) =>
    setState((current) => ({
      ...current,
      configs: { ...current.configs, [key]: value }
    }));

  /** Per-block JSON errors, so a typo is caught before it reaches the API. */
  const jsonErrors = useMemo(() => {
    const errors: Partial<Record<ConfigKey, string>> = {};
    for (const field of CONFIG_FIELDS) {
      const raw = state.configs[field.key].trim();
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          errors[field.key] = 'Must be a JSON object.';
        }
      } catch (error) {
        errors[field.key] =
          error instanceof Error ? error.message : 'Invalid JSON.';
      }
    }
    return errors;
  }, [state.configs]);

  const hasJsonError = Object.keys(jsonErrors).length > 0;
  const canSave =
    !hasJsonError &&
    state.slug.trim() &&
    state.name.trim() &&
    state.title.trim();

  const buildBody = (): OfferWriteBody => {
    const configs = Object.fromEntries(
      CONFIG_FIELDS.map((field) => [
        field.key,
        JSON.parse(state.configs[field.key].trim() || '{}')
      ])
    );

    return {
      slug: state.slug.trim(),
      name: state.name.trim(),
      internalName: state.internalName.trim() || null,
      title: state.title.trim(),
      description: state.description.trim() || null,
      status: state.status,
      placement: state.placement,
      audienceType: state.audienceType,
      priority: Number(state.priority) || 0,
      ...(state.startsAt
        ? { startsAt: new Date(state.startsAt).toISOString() }
        : {}),
      ...(state.endsAt ? { endsAt: new Date(state.endsAt).toISOString() } : {}),
      maxClaims: state.maxClaims ? Number(state.maxClaims) : null,
      maxClaimsPerUser: Number(state.maxClaimsPerUser) || 1,
      requiresApproval: state.requiresApproval,
      ...configs
    };
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = buildBody();
      const saved = offer
        ? await api.updateOffer(offer.id, body)
        : await api.createOffer(body);
      toast.success(offer ? 'Offer updated.' : 'Offer created.');
      if (onSaved) onSaved(saved);
      else router.push(`/backoffice/offers/${saved.id}`);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save this offer.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{offer ? 'Edit offer' : 'New offer'}</CardTitle>
          <CardDescription>
            An offer is configuration. Nothing here needs a deploy — the engine
            reads these fields directly.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-1.5'>
              <Label htmlFor='offer-slug'>Slug</Label>
              <Input
                id='offer-slug'
                value={state.slug}
                placeholder='customer-review'
                onChange={(event) =>
                  set(
                    'slug',
                    event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')
                  )
                }
              />
              <p className='text-muted-foreground text-xs'>
                Lowercase kebab-case. Used in URLs and by seeds.
              </p>
            </div>

            <div className='grid gap-1.5'>
              <Label htmlFor='offer-name'>Name</Label>
              <Input
                id='offer-name'
                value={state.name}
                onChange={(event) => set('name', event.target.value)}
              />
            </div>

            <div className='grid gap-1.5'>
              <Label htmlFor='offer-internal'>Internal name</Label>
              <Input
                id='offer-internal'
                value={state.internalName}
                placeholder='Shown in this table only'
                onChange={(event) => set('internalName', event.target.value)}
              />
            </div>

            <div className='grid gap-1.5'>
              <Label htmlFor='offer-title'>Default title</Label>
              <Input
                id='offer-title'
                value={state.title}
                onChange={(event) => set('title', event.target.value)}
              />
              <p className='text-muted-foreground text-xs'>
                Fallback when Display has no variant for the workspace.
              </p>
            </div>
          </div>

          <div className='grid gap-1.5'>
            <Label htmlFor='offer-description'>Default description</Label>
            <Textarea
              id='offer-description'
              rows={2}
              value={state.description}
              onChange={(event) => set('description', event.target.value)}
            />
          </div>

          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <div className='grid gap-1.5'>
              <Label>Status</Label>
              <Select
                value={state.status}
                onValueChange={(value) => set('status', value as OfferStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='grid gap-1.5'>
              <Label>Placement</Label>
              <Select
                value={state.placement}
                onValueChange={(value) =>
                  set('placement', value as OfferPlacement)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLACEMENTS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='grid gap-1.5'>
              <Label>Audience</Label>
              <Select
                value={state.audienceType}
                onValueChange={(value) =>
                  set('audienceType', value as OfferAudienceType)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='grid gap-1.5'>
              <Label htmlFor='offer-priority'>Priority</Label>
              <Input
                id='offer-priority'
                type='number'
                value={state.priority}
                onChange={(event) => set('priority', event.target.value)}
              />
              <p className='text-muted-foreground text-xs'>
                Higher wins the slot.
              </p>
            </div>
          </div>

          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <div className='grid gap-1.5'>
              <Label htmlFor='offer-starts'>Starts at</Label>
              <Input
                id='offer-starts'
                type='datetime-local'
                value={state.startsAt}
                onChange={(event) => set('startsAt', event.target.value)}
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='offer-ends'>Ends at</Label>
              <Input
                id='offer-ends'
                type='datetime-local'
                value={state.endsAt}
                onChange={(event) => set('endsAt', event.target.value)}
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='offer-max-claims'>Max claims (total)</Label>
              <Input
                id='offer-max-claims'
                type='number'
                min={1}
                value={state.maxClaims}
                placeholder='Unlimited'
                onChange={(event) => set('maxClaims', event.target.value)}
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='offer-max-per-user'>Max claims per user</Label>
              <Input
                id='offer-max-per-user'
                type='number'
                min={1}
                value={state.maxClaimsPerUser}
                onChange={(event) =>
                  set('maxClaimsPerUser', event.target.value)
                }
              />
            </div>
          </div>

          <div className='flex items-center gap-3 rounded-lg border p-3'>
            <Switch
              id='offer-approval'
              checked={state.requiresApproval}
              onCheckedChange={(checked) => set('requiresApproval', checked)}
            />
            <div>
              <Label htmlFor='offer-approval'>Requires manual approval</Label>
              <p className='text-muted-foreground text-xs'>
                On: submissions wait in Pending approval. Off: they complete and
                pay out immediately.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>
            The blocks the engine evaluates. Invalid JSON blocks saving.
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4 lg:grid-cols-2'>
          {CONFIG_FIELDS.map((field) => (
            <div key={field.key} className='grid gap-1.5'>
              <Label htmlFor={`offer-${field.key}`}>{field.label}</Label>
              <Textarea
                id={`offer-${field.key}`}
                rows={10}
                spellCheck={false}
                className='font-mono text-[11px]'
                value={state.configs[field.key]}
                onChange={(event) => setConfig(field.key, event.target.value)}
              />
              {jsonErrors[field.key] ? (
                <p className='text-destructive text-xs'>
                  {jsonErrors[field.key]}
                </p>
              ) : (
                <p className='text-muted-foreground text-xs'>{field.hint}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className='flex justify-end gap-2'>
        <Button variant='outline' onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving || !canSave}>
          {saving ? 'Saving…' : offer ? 'Save changes' : 'Create offer'}
        </Button>
      </div>
    </div>
  );
}
