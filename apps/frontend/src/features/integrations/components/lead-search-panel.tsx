'use client';

import { Alert, AlertDescription, AlertTitle } from '@ringee/frontend-shared/components/ui/alert';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Card, CardContent } from '@ringee/frontend-shared/components/ui/card';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ringee/frontend-shared/components/ui/select';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Loader2, Mail, Phone, Search, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  useEnrichmentConnections,
  useEnrichmentMutations,
} from '../hooks/use-enrichment-connections';
import {
  ENRICHMENT_PROVIDER_META,
  type EnrichmentProviderType,
  type LeadCandidate,
} from '../types/enrichment';

type RevealState = 'idle' | 'email' | 'phone';

export function LeadSearchPanel() {
  const { connections, loading: connectionsLoading } = useEnrichmentConnections();
  const { searchLeads, revealLeadContact } = useEnrichmentMutations();

  // Active providers that support lead search.
  const availableProviders = useMemo<EnrichmentProviderType[]>(
    () =>
      Array.from(
        new Set(
          connections
            .filter((c) => c.status === 'active')
            .map((c) => c.provider)
            .filter((p) => ENRICHMENT_PROVIDER_META[p]?.leadSearch),
        ),
      ),
    [connections],
  );

  const [provider, setProvider] = useState<EnrichmentProviderType | null>(null);
  const [domainsInput, setDomainsInput] = useState('');
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<LeadCandidate[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [revealing, setRevealing] = useState<Record<string, RevealState>>({});
  const [contactIdByExternal, setContactIdByExternal] = useState<Record<string, string>>({});

  // Default the selector to the first available provider, or clear it if none.
  useEffect(() => {
    if (provider && availableProviders.includes(provider)) return;
    setProvider(availableProviders[0] ?? null);
  }, [availableProviders, provider]);

  const domains = useMemo(
    () =>
      domainsInput
        .split(/[\s,]+/)
        .map((d) => d.trim())
        .filter(Boolean),
    [domainsInput],
  );

  const handleSearch = async (nextPage = 1) => {
    if (domains.length === 0) {
      toast.error('Enter at least one domain (e.g. ringee.io)');
      return;
    }
    if (!provider) {
      toast.error('Connect Prospeo or Apollo first');
      return;
    }
    setSearching(true);
    try {
      const res = await searchLeads(
        { companyDomains: domains },
        { provider, page: nextPage, perPage },
      );
      setResults(res.result.results);
      setTotal(res.result.total);
      setHasMore(res.result.hasMore);
      setPage(nextPage);
      setJobId((res as unknown as { job: { id: string } }).job?.id ?? null);
      setContactIdByExternal({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleReveal = async (
    candidate: LeadCandidate,
    revealPhone: boolean,
  ) => {
    if (!jobId) return;
    setRevealing((prev) => ({
      ...prev,
      [candidate.externalId]: revealPhone ? 'phone' : 'email',
    }));
    try {
      const res = await revealLeadContact(jobId, candidate.externalId, {
        revealPhone,
      });
      setResults((prev) =>
        prev.map((c) =>
          c.externalId === candidate.externalId ? res.candidate : c,
        ),
      );
      if (res.contactId) {
        setContactIdByExternal((prev) => ({
          ...prev,
          [candidate.externalId]: res.contactId!,
        }));
      }
      if (res.emailRevealed || res.phoneRevealed) {
        toast.success(
          revealPhone
            ? 'Email + mobile revealed and saved as contact'
            : 'Email revealed and saved as contact',
        );
      } else {
        toast.message('No contact info found for this person');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reveal failed');
    } finally {
      setRevealing((prev) => {
        const next = { ...prev };
        delete next[candidate.externalId];
        return next;
      });
    }
  };

  const showProviderSelect = availableProviders.length > 1;
  const noProviders = !connectionsLoading && availableProviders.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Find Leads by Domain
        </h2>
        <p className="text-sm text-muted-foreground">
          Enter one or more company domains (e.g. <code>ringee.io</code>,{' '}
          <code>facebook.com</code>) to find people working there. Reveal email
          or mobile per row — each reveal is saved as a contact.
        </p>
      </div>

      {noProviders && (
        <Alert>
          <AlertTitle>Connect a provider first</AlertTitle>
          <AlertDescription>
            Connect Prospeo or Apollo in the Data Enrichment tab to search for
            leads by domain.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label>Company domains</Label>
              <Input
                value={domainsInput}
                onChange={(e) => setDomainsInput(e.target.value)}
                placeholder="ringee.io, facebook.com"
                disabled={noProviders}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch(1);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Separate multiple domains with commas or spaces.
              </p>
            </div>

            {showProviderSelect && (
              <div className="space-y-1">
                <Label>Provider</Label>
                <Select
                  value={provider ?? undefined}
                  onValueChange={(v) =>
                    setProvider(v as EnrichmentProviderType)
                  }
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProviders.map((p) => (
                      <SelectItem key={p} value={p}>
                        {ENRICHMENT_PROVIDER_META[p]?.name ?? p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            {!showProviderSelect && provider && (
              <p className="text-xs text-muted-foreground">
                Using {ENRICHMENT_PROVIDER_META[provider]?.name ?? provider}
              </p>
            )}
            <div className="flex-1" />
            <Button
              onClick={() => handleSearch(1)}
              disabled={searching || domains.length === 0 || !provider}
            >
              {searching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {results.length} results{total != null ? ` of ${total}` : ''}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1 || searching}
                  onClick={() => handleSearch(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!hasMore || searching}
                  onClick={() => handleSearch(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              {results.map((c) => {
                const state = revealing[c.externalId] ?? 'idle';
                const hasEmail = (c.person.emails?.length ?? 0) > 0;
                const hasPhone = (c.person.phones?.length ?? 0) > 0;
                const contactId = contactIdByExternal[c.externalId];
                return (
                  <div
                    key={c.externalId}
                    className="flex items-start gap-3 rounded-md border p-3 text-sm"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {c.person.fullName ??
                            [c.person.firstName, c.person.lastName]
                              .filter(Boolean)
                              .join(' ') ??
                            'Unknown'}
                        </span>
                        {c.person.jobTitle && (
                          <span className="text-muted-foreground">
                            — {c.person.jobTitle}
                          </span>
                        )}
                        {contactId && (
                          <Badge variant="outline" className="text-xs">
                            saved
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground">
                        {c.company?.name && <span>{c.company.name}</span>}
                        {c.company?.industry && <span> · {c.company.industry}</span>}
                        {c.person.location?.country && (
                          <span> · {c.person.location.country}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {c.person.emails?.map((e) => (
                          <Badge key={e.value} variant="secondary">
                            {e.value}
                            {e.verified && (
                              <span className="ml-1 text-green-600">✓</span>
                            )}
                          </Badge>
                        ))}
                        {c.person.phones?.map((p) => (
                          <Badge key={p.value} variant="secondary">
                            {p.value}
                            {p.verified && (
                              <span className="ml-1 text-green-600">✓</span>
                            )}
                          </Badge>
                        ))}
                        {c.person.linkedinUrl && (
                          <a
                            href={c.person.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline text-muted-foreground"
                          >
                            LinkedIn
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={state !== 'idle' || hasEmail}
                        onClick={() => handleReveal(c, false)}
                      >
                        {state === 'email' ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Mail className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {hasEmail ? 'Email found' : 'Find email'}
                      </Button>
                      <Button
                        size="sm"
                        disabled={state !== 'idle' || hasPhone}
                        onClick={() => handleReveal(c, true)}
                      >
                        {state === 'phone' ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Phone className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {hasPhone ? 'Phone found' : 'Find phone'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {!searching && results.length === 0 && total !== null && (
        <Alert>
          <AlertTitle>No results</AlertTitle>
          <AlertDescription>
            No people indexed for those domains. Try a different domain or
            switch provider.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
