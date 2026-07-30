'use client';

import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@ringee/frontend-shared/components/ui/alert';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Card, CardContent } from '@ringee/frontend-shared/components/ui/card';
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
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import {
  Database,
  Linkedin,
  Loader2,
  Mail,
  Phone,
  Search,
  Sparkles
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  useEnrichmentConnections,
  useEnrichmentMutations
} from '../hooks/use-enrichment-connections';
import {
  ENRICHMENT_PROVIDER_META,
  type EnrichmentProviderType,
  type LeadCandidate,
  type LeadSearchFilters
} from '../types/enrichment';

type RevealState = 'idle' | 'email' | 'phone';

function parseList(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function LeadSearchPanel() {
  const { connections, loading: connectionsLoading } =
    useEnrichmentConnections();
  const { searchLeads, searchLeadsByLinkedin, revealLeadContact } =
    useEnrichmentMutations();

  // Active providers that support lead search.
  const availableProviders = useMemo<EnrichmentProviderType[]>(
    () =>
      Array.from(
        new Set(
          connections
            .filter((c) => c.status === 'active')
            .map((c) => c.provider)
            .filter((p) => ENRICHMENT_PROVIDER_META[p]?.leadSearch)
        )
      ),
    [connections]
  );

  const [provider, setProvider] = useState<EnrichmentProviderType | null>(null);
  const [useCache, setUseCache] = useState(true);

  // Filter inputs
  const [domainsInput, setDomainsInput] = useState('');
  const [jobTitlesInput, setJobTitlesInput] = useState('');
  const [seniorityInput, setSeniorityInput] = useState('');
  const [departmentInput, setDepartmentInput] = useState('');
  const [locationsInput, setLocationsInput] = useState('');
  const [industriesInput, setIndustriesInput] = useState('');
  const [keywords, setKeywords] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');

  const [page, setPage] = useState(1);
  const perPage = 25;
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<LeadCandidate[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [lastCached, setLastCached] = useState(false);
  const [revealing, setRevealing] = useState<Record<string, RevealState>>({});
  const [contactIdByExternal, setContactIdByExternal] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (provider && availableProviders.includes(provider)) return;
    setProvider(availableProviders[0] ?? null);
  }, [availableProviders, provider]);

  const buildFilters = (): LeadSearchFilters => ({
    companyDomains: parseList(domainsInput),
    jobTitles: parseList(jobTitlesInput),
    seniorities: parseList(seniorityInput),
    departments: parseList(departmentInput),
    personLocations: parseList(locationsInput),
    industries: parseList(industriesInput),
    keywords: keywords.trim() || undefined
  });

  const handleSearch = async (nextPage = 1) => {
    if (!provider) {
      toast.error('Connect Prospeo or Apollo first');
      return;
    }
    const filters = buildFilters();
    const hasAnyFilter =
      (filters.companyDomains?.length ?? 0) +
        (filters.jobTitles?.length ?? 0) +
        (filters.seniorities?.length ?? 0) +
        (filters.departments?.length ?? 0) +
        (filters.personLocations?.length ?? 0) +
        (filters.industries?.length ?? 0) >
        0 || !!filters.keywords;
    if (!hasAnyFilter) {
      toast.error('Enter at least one filter (domain, job title, location…)');
      return;
    }
    setSearching(true);
    try {
      const res = await searchLeads(filters, {
        provider,
        page: nextPage,
        perPage,
        useCache
      });
      setResults(res.result.results);
      setTotal(res.result.total);
      setHasMore(res.result.hasMore);
      setPage(nextPage);
      setJobId(res.job.id);
      setLastCached(!!res.cached);
      setContactIdByExternal({});
      if (res.cached) {
        toast.success('Loaded from cache — no provider credits used');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleLinkedinSearch = async () => {
    if (!provider) {
      toast.error('Connect Prospeo or Apollo first');
      return;
    }
    const url = linkedinUrl.trim();
    if (!/linkedin\.com\//i.test(url)) {
      toast.error('Enter a valid LinkedIn profile URL');
      return;
    }
    setSearching(true);
    try {
      const res = await searchLeadsByLinkedin(url, { provider, useCache });
      setResults(res.result.results);
      setTotal(res.result.total);
      setHasMore(false);
      setPage(1);
      setJobId(res.job.id);
      setLastCached(!!res.cached);
      setContactIdByExternal({});
      if (res.cached) {
        toast.success('Loaded from cache — no provider credits used');
      } else if (res.result.results.length === 0) {
        toast.message('No profile found for that URL');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setSearching(false);
    }
  };

  const handleReveal = async (
    candidate: LeadCandidate,
    revealPhone: boolean
  ) => {
    if (!jobId) return;
    setRevealing((prev) => ({
      ...prev,
      [candidate.externalId]: revealPhone ? 'phone' : 'email'
    }));
    try {
      const res = await revealLeadContact(jobId, candidate.externalId, {
        revealPhone
      });
      setResults((prev) =>
        prev.map((c) =>
          c.externalId === candidate.externalId ? res.candidate : c
        )
      );
      if (res.contactId) {
        setContactIdByExternal((prev) => ({
          ...prev,
          [candidate.externalId]: res.contactId!
        }));
      }
      if (res.emailRevealed || res.phoneRevealed) {
        toast.success(
          revealPhone
            ? 'Email + mobile revealed and saved as contact'
            : 'Email revealed and saved as contact'
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
    <div className='space-y-6'>
      <div>
        <h2 className='flex items-center gap-2 text-lg font-semibold'>
          <Sparkles className='h-5 w-5' />
          Find Leads
        </h2>
        <p className='text-muted-foreground text-sm'>
          Search by company, job title, location and more — or look up a single
          profile by LinkedIn URL. Reveal email or mobile per row; each reveal
          is saved as a contact.
        </p>
      </div>

      {noProviders && (
        <Alert>
          <AlertTitle>Connect a provider first</AlertTitle>
          <AlertDescription>
            Connect Prospeo or Apollo in the Data Enrichment tab to search for
            leads.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className='space-y-4 pt-6'>
          <div className='flex flex-wrap items-end justify-between gap-3'>
            {showProviderSelect ? (
              <div className='space-y-1'>
                <Label>Provider</Label>
                <Select
                  value={provider ?? undefined}
                  onValueChange={(v) =>
                    setProvider(v as EnrichmentProviderType)
                  }
                >
                  <SelectTrigger className='w-[180px]'>
                    <SelectValue placeholder='Provider' />
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
            ) : provider ? (
              <p className='text-muted-foreground text-xs'>
                Using {ENRICHMENT_PROVIDER_META[provider]?.name ?? provider}
              </p>
            ) : null}

            <div className='flex items-center gap-2'>
              <Checkbox
                id='use-cache'
                checked={useCache}
                onCheckedChange={(v) => setUseCache(v === true)}
                disabled={noProviders}
              />
              <Label
                htmlFor='use-cache'
                className='flex cursor-pointer items-center gap-1.5 text-xs'
              >
                <Database className='h-3.5 w-3.5' />
                Use cached results (save provider credits)
              </Label>
            </div>
          </div>

          <Separator />

          <Tabs defaultValue='filters'>
            <TabsList>
              <TabsTrigger value='filters'>
                <Search className='mr-1.5 h-3.5 w-3.5' />
                Filters
              </TabsTrigger>
              <TabsTrigger value='linkedin'>
                <Linkedin className='mr-1.5 h-3.5 w-3.5' />
                LinkedIn URL
              </TabsTrigger>
            </TabsList>

            <TabsContent value='filters' className='space-y-3 pt-4'>
              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='space-y-1'>
                  <Label>Company domains</Label>
                  <Input
                    value={domainsInput}
                    onChange={(e) => setDomainsInput(e.target.value)}
                    placeholder='ringee.io, facebook.com'
                    disabled={noProviders}
                  />
                </div>
                <div className='space-y-1'>
                  <Label>Job titles</Label>
                  <Input
                    value={jobTitlesInput}
                    onChange={(e) => setJobTitlesInput(e.target.value)}
                    placeholder='CEO, Head of Sales'
                    disabled={noProviders}
                  />
                </div>
                <div className='space-y-1'>
                  <Label>Seniorities</Label>
                  <Input
                    value={seniorityInput}
                    onChange={(e) => setSeniorityInput(e.target.value)}
                    placeholder='c_suite, vp, director'
                    disabled={noProviders}
                  />
                </div>
                <div className='space-y-1'>
                  <Label>Departments</Label>
                  <Input
                    value={departmentInput}
                    onChange={(e) => setDepartmentInput(e.target.value)}
                    placeholder='sales, marketing'
                    disabled={noProviders}
                  />
                </div>
                <div className='space-y-1'>
                  <Label>Person locations</Label>
                  <Input
                    value={locationsInput}
                    onChange={(e) => setLocationsInput(e.target.value)}
                    placeholder='United States, Spain'
                    disabled={noProviders}
                  />
                </div>
                <div className='space-y-1'>
                  <Label>Industries</Label>
                  <Input
                    value={industriesInput}
                    onChange={(e) => setIndustriesInput(e.target.value)}
                    placeholder='software, saas'
                    disabled={noProviders}
                  />
                </div>
              </div>

              <div className='space-y-1'>
                <Label>Keywords</Label>
                <Input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder='Free-form keywords (e.g. fintech founder)'
                  disabled={noProviders}
                />
              </div>

              <p className='text-muted-foreground text-xs'>
                Separate multiple values with commas or line breaks.
              </p>

              <div className='flex justify-end'>
                <Button
                  onClick={() => handleSearch(1)}
                  disabled={searching || !provider}
                >
                  {searching ? (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  ) : (
                    <Search className='mr-2 h-4 w-4' />
                  )}
                  Search
                </Button>
              </div>
            </TabsContent>

            <TabsContent value='linkedin' className='space-y-3 pt-4'>
              <div className='space-y-1'>
                <Label>LinkedIn profile URL</Label>
                <Input
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder='https://www.linkedin.com/in/janedoe'
                  disabled={noProviders}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLinkedinSearch();
                  }}
                />
                <p className='text-muted-foreground text-xs'>
                  Paste a public LinkedIn profile URL to find the matching lead.
                </p>
              </div>
              <div className='flex justify-end'>
                <Button
                  onClick={handleLinkedinSearch}
                  disabled={searching || !provider}
                >
                  {searching ? (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  ) : (
                    <Linkedin className='mr-2 h-4 w-4' />
                  )}
                  Look up profile
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardContent className='space-y-3 pt-6'>
            <div className='flex items-center justify-between'>
              <div className='text-muted-foreground flex items-center gap-2 text-sm'>
                <span>
                  {results.length} results{total != null ? ` of ${total}` : ''}
                </span>
                {lastCached && (
                  <Badge variant='outline' className='text-[10px]'>
                    <Database className='mr-1 h-3 w-3' />
                    from cache
                  </Badge>
                )}
              </div>
              <div className='flex gap-2'>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={page <= 1 || searching}
                  onClick={() => handleSearch(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={!hasMore || searching}
                  onClick={() => handleSearch(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>

            <Separator />

            <div className='space-y-2'>
              {results.map((c) => {
                const state = revealing[c.externalId] ?? 'idle';
                const hasEmail = (c.person.emails?.length ?? 0) > 0;
                const hasPhone = (c.person.phones?.length ?? 0) > 0;
                const contactId = contactIdByExternal[c.externalId];
                return (
                  <div
                    key={c.externalId}
                    className='flex items-start gap-3 rounded-md border p-3 text-sm'
                  >
                    <div className='flex-1 space-y-1'>
                      <div className='flex items-center gap-2'>
                        <span className='font-medium'>
                          {c.person.fullName ??
                            [c.person.firstName, c.person.lastName]
                              .filter(Boolean)
                              .join(' ') ??
                            'Unknown'}
                        </span>
                        {c.person.jobTitle && (
                          <span className='text-muted-foreground'>
                            — {c.person.jobTitle}
                          </span>
                        )}
                        {contactId && (
                          <Badge variant='outline' className='text-xs'>
                            saved
                          </Badge>
                        )}
                      </div>
                      <div className='text-muted-foreground'>
                        {c.company?.name && <span>{c.company.name}</span>}
                        {c.company?.industry && (
                          <span> · {c.company.industry}</span>
                        )}
                        {c.person.location?.country && (
                          <span> · {c.person.location.country}</span>
                        )}
                      </div>
                      <div className='flex flex-wrap gap-2 text-xs'>
                        {c.person.emails?.map((e) => (
                          <Badge key={e.value} variant='secondary'>
                            {e.value}
                            {e.verified && (
                              <span className='ml-1 text-green-600'>✓</span>
                            )}
                          </Badge>
                        ))}
                        {c.person.phones?.map((p) => (
                          <Badge key={p.value} variant='secondary'>
                            {p.value}
                            {p.verified && (
                              <span className='ml-1 text-green-600'>✓</span>
                            )}
                          </Badge>
                        ))}
                        {c.person.linkedinUrl && (
                          <a
                            href={c.person.linkedinUrl}
                            target='_blank'
                            rel='noreferrer'
                            className='text-muted-foreground underline'
                          >
                            LinkedIn
                          </a>
                        )}
                      </div>
                    </div>
                    <div className='flex flex-col gap-1.5'>
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={state !== 'idle' || hasEmail}
                        onClick={() => handleReveal(c, false)}
                      >
                        {state === 'email' ? (
                          <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                        ) : (
                          <Mail className='mr-1.5 h-3.5 w-3.5' />
                        )}
                        {hasEmail ? 'Email found' : 'Find email'}
                      </Button>
                      <Button
                        size='sm'
                        disabled={state !== 'idle' || hasPhone}
                        onClick={() => handleReveal(c, true)}
                      >
                        {state === 'phone' ? (
                          <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                        ) : (
                          <Phone className='mr-1.5 h-3.5 w-3.5' />
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
            Try different filters, switch provider, or paste a LinkedIn URL.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
