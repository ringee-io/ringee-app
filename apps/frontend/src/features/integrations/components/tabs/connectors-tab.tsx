'use client';

import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@ringee/frontend-shared/components/ui/alert';
import { Badge } from '@ringee/frontend-shared/components/ui/badge';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@ringee/frontend-shared/components/ui/card';
import { Input } from '@ringee/frontend-shared/components/ui/input';
import { Skeleton } from '@ringee/frontend-shared/components/ui/skeleton';
import { useApi } from '@ringee/frontend-shared/hooks/use.api';
import {
  AlertCircle,
  Bot,
  Building2,
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  User as UserIcon
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

type ConnectionMode = 'organization' | 'freelancer';

interface ConnectionInfo {
  mode: ConnectionMode;
  userId: string;
  organizationId: string | null;
  url: string;
}

export function ConnectorsTab() {
  return (
    <div className='flex flex-col gap-6'>
      <header className='flex flex-col gap-1'>
        <h2 className='text-muted-foreground text-sm font-semibold tracking-wide uppercase'>
          Connectors
        </h2>
        <p className='text-muted-foreground max-w-2xl text-xs'>
          Connect external AI assistants and automation tools directly to your
          Ringee account. Connectors expose your Ringee data and actions (calls,
          contacts, callbacks, meetings) through a standardized protocol so any
          compatible client can use them.
        </p>
      </header>

      <McpSection />
    </div>
  );
}

function McpSection() {
  const api = useApi();
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ConnectionInfo>('/mcp/connection-info');
      setInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MCP info');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-4'>
          <div className='flex items-start gap-3'>
            <div className='bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg'>
              <Bot className='text-primary h-5 w-5' />
            </div>
            <div className='flex flex-col gap-1'>
              <CardTitle className='flex items-center gap-2 text-base'>
                MCP
                <Badge variant='secondary' className='gap-1 text-[10px]'>
                  <Sparkles className='h-3 w-3' /> AI connector
                </Badge>
              </CardTitle>
              <CardDescription className='max-w-xl'>
                The Model Context Protocol (MCP) lets AI clients like Claude
                Desktop, ChatGPT and other agents read and act on your Ringee
                data. Paste the URL below into your client to connect.
              </CardDescription>
            </div>
          </div>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => load()}
            disabled={loading}
            className='h-8'
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className='flex flex-col gap-5'>
        {loading ? (
          <div className='flex flex-col gap-3'>
            <Skeleton className='h-4 w-32' />
            <Skeleton className='h-10 w-full' />
            <Skeleton className='h-20 w-full' />
          </div>
        ) : error ? (
          <Alert variant='destructive'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Could not load MCP connection info</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : info ? (
          <McpDetails info={info} />
        ) : null}

        <SecurityNote />
        <HowToConnect />
      </CardContent>
    </Card>
  );
}

function McpDetails({ info }: { info: ConnectionInfo }) {
  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <ModeBadge mode={info.mode} />
        <span className='text-muted-foreground text-xs'>
          {info.mode === 'organization'
            ? 'This URL gives access to the active organization.'
            : 'This URL gives access to your personal (freelancer) workspace.'}
        </span>
      </div>

      <CopyableUrl url={info.url} />

      {/* <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <Detail label="User ID" value={info.userId} />
        {info.organizationId && (
          <Detail label="Organization ID" value={info.organizationId} />
        )}
      </dl> */}
    </div>
  );
}

function ModeBadge({ mode }: { mode: ConnectionMode }) {
  if (mode === 'organization') {
    return (
      <Badge variant='default' className='gap-1.5'>
        <Building2 className='h-3 w-3' /> Organization mode
      </Badge>
    );
  }
  return (
    <Badge variant='outline' className='gap-1.5'>
      <UserIcon className='h-3 w-3' /> Freelancer mode
    </Badge>
  );
}

function CopyableUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('MCP URL copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <div className='flex items-center gap-2'>
      <Input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className='font-mono text-xs'
      />
      <Button
        variant='outline'
        size='sm'
        onClick={handleCopy}
        className='shrink-0'
      >
        {copied ? (
          <>
            <Check className='mr-1.5 h-3.5 w-3.5' /> Copied
          </>
        ) : (
          <>
            <Copy className='mr-1.5 h-3.5 w-3.5' /> Copy
          </>
        )}
      </Button>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className='bg-muted/30 flex flex-col gap-0.5 rounded-md border px-3 py-2'>
      <dt className='text-muted-foreground text-[10px] font-medium tracking-wide uppercase'>
        {label}
      </dt>
      <dd className='font-mono text-[11px] break-all'>{value}</dd>
    </div>
  );
}

function SecurityNote() {
  return (
    <Alert>
      <ShieldCheck className='h-4 w-4' />
      <AlertTitle className='text-sm'>Treat this URL as a secret</AlertTitle>
      <AlertDescription className='text-xs'>
        Anyone with this URL can read and act on your Ringee data via MCP. Only
        share it with trusted AI clients. If it leaks, contact support to rotate
        your account.
      </AlertDescription>
    </Alert>
  );
}

function HowToConnect() {
  return (
    <div className='bg-muted/20 flex flex-col gap-2 rounded-lg border p-4'>
      <div className='flex items-center gap-2 text-sm font-medium'>
        <ExternalLink className='h-3.5 w-3.5' />
        How to connect
      </div>
      <ol className='text-muted-foreground ml-4 list-decimal space-y-1 text-xs'>
        <li>Copy the URL above.</li>
        <li>
          Open your MCP-compatible client (Claude Desktop, ChatGPT, Cursor,
          etc.) and add a new remote MCP server.
        </li>
        <li>
          Paste the URL as the SSE endpoint. No additional API key is required —
          the URL is the credential.
        </li>
        <li>
          Once connected, the client will see Ringee tools for searching
          contacts, starting calls, scheduling callbacks and meetings, and
          logging outcomes.
        </li>
      </ol>
    </div>
  );
}
