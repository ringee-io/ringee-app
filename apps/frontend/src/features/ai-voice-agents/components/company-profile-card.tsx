'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Label } from '@ringee/frontend-shared/components/ui/label';
import { Textarea } from '@ringee/frontend-shared/components/ui/textarea';
import { useVoiceAgentApi } from '../api';

/**
 * Company context (§6). It belongs to the workspace, not to an agent: every
 * agent interpolates it, and a caller never passes it per call.
 */
export function CompanyProfileCard() {
  const api = useVoiceAgentApi();
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    void (async () => {
      const profile = await api.getCompanyProfile().catch(() => null);
      if (!profile) return;
      setName(profile.companyName ?? '');
      setWebsite(profile.companyWebsite ?? '');
      setDescription(profile.companyDescription ?? '');
    })();
  }, [api]);

  const save = async () => {
    setSaving(true);
    try {
      await api.saveCompanyProfile({
        companyName: name,
        companyWebsite: website,
        companyDescription: description
      });
      toast.success('Company context saved');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not save the context'
      );
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    if (!website.trim()) {
      toast.error('Add your website first');
      return;
    }
    setGenerating(true);
    try {
      const { description: draft } =
        await api.generateCompanyDescription(website);
      setDescription(draft);
      toast.success(
        'Draft written from your website — review it before saving'
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not read that website'
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company context</CardTitle>
        <CardDescription>
          Every AI agent in this workspace introduces itself with this. You only
          fill it in once.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='company-name'>Company name</Label>
            <Input
              id='company-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Acme'
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='company-website'>Website</Label>
            <Input
              id='company-website'
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder='https://acme.com'
            />
          </div>
        </div>

        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <Label htmlFor='company-description'>Description</Label>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={generate}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className='mr-1 size-3.5 animate-spin' />
              ) : (
                <Sparkles className='mr-1 size-3.5' />
              )}
              Generate from website
            </Button>
          </div>
          <Textarea
            id='company-description'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder='What the company does, who it serves, what it offers.'
          />
        </div>

        <div className='flex justify-end'>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className='mr-2 size-4 animate-spin' />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
