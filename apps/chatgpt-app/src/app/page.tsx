import { TOOL_CATALOG } from "@ringee-io/agent/tools";
import { PRIMARY_FLOW } from "@ringee-io/agent/flows";
import {
  ArrowRight,
  PhoneCall,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { COMPONENT_LIST } from "@/components/registry";
import { ThemeToggle } from "@/components/theme-toggle";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";

function ComponentFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <div className="flex min-h-48 items-start justify-center rounded-xl border border-dashed bg-[color-mix(in_oklab,var(--muted)_40%,transparent)] p-4">
        {children}
      </div>
    </section>
  );
}

const SENSITIVITY_LEGEND = [
  {
    icon: ShieldCheck,
    label: "Read / Write",
    tone: "var(--info)",
    note: "Safe — normal intent.",
  },
  {
    icon: Sparkles,
    label: "Sensitive",
    tone: "var(--warning)",
    note: "Spends credits or mints magic links — confirm.",
  },
  {
    icon: Trash2,
    label: "Destructive",
    tone: "var(--destructive)",
    note: "Deletes or revokes — strict confirmation.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <PhoneCall className="size-4" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Ringee for ChatGPT</div>
              <div className="text-muted-foreground text-[11px]">
                Component gallery · design preview
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">v0.1</Badge>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-12 px-5 py-10">
        {/* Hero */}
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Outbound sales, operated from chat.
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm">
            These are the visual components the Ringee ChatGPT App renders on
            top of the existing Ringee backend/MCP. The data here is sample data
            — in ChatGPT each card is driven by real tool output. Every surface
            is built to match the Ringee dashboard: clear hierarchy, real
            states, and risk-aware actions.
          </p>
        </section>

        {/* Flow */}
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            The flow
          </h2>
          <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
            {PRIMARY_FLOW.steps.map((step, i) => (
              <div key={step.id} className="flex items-center gap-1">
                <span className="rounded-md border bg-card px-2.5 py-1 text-xs font-medium">
                  {step.title}
                </span>
                {i < PRIMARY_FLOW.steps.length - 1 ? (
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {/* Sensitivity legend */}
        <section className="grid gap-3 sm:grid-cols-3">
          {SENSITIVITY_LEGEND.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className="flex items-start gap-3 rounded-xl border bg-card p-4"
              >
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    color: s.tone,
                    background: `color-mix(in oklab, ${s.tone} 14%, transparent)`,
                  }}
                >
                  <Icon className="size-4" />
                </div>
                <div>
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="text-muted-foreground text-xs">{s.note}</div>
                </div>
              </div>
            );
          })}
        </section>

        {/* Components */}
        <section className="space-y-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            Components
            <ShieldAlert className="size-4 text-muted-foreground" />
          </h2>
          <div className="grid gap-8 md:grid-cols-2">
            {COMPONENT_LIST.map((entry) => (
              <ComponentFrame
                key={entry.name}
                title={entry.title}
                description={entry.description}
              >
                {entry.render(entry.mock)}
              </ComponentFrame>
            ))}
          </div>
        </section>

        {/* States */}
        <section className="space-y-5">
          <h2 className="text-lg font-semibold">States</h2>
          <div className="grid gap-8 md:grid-cols-3">
            <ComponentFrame
              title="Loading"
              description="Skeleton while a tool runs."
            >
              <div className="w-full max-w-sm">
                <LoadingState label="Searching contacts…" />
              </div>
            </ComponentFrame>
            <ComponentFrame
              title="Empty"
              description="No results, with a way forward."
            >
              <div className="w-full max-w-sm">
                <EmptyState
                  title="No contacts found"
                  description="Try a different name, phone or company — or prospect new leads."
                />
              </div>
            </ComponentFrame>
            <ComponentFrame
              title="Error"
              description="A failed tool call, explained."
            >
              <div className="w-full max-w-sm">
                <ErrorState description="The enrichment provider isn't connected. Connect Apollo or Prospeo in Settings." />
              </div>
            </ComponentFrame>
          </div>
        </section>

        {/* Capabilities */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Capabilities</h2>
          <p className="text-muted-foreground text-sm">
            {TOOL_CATALOG.length} actions, all backed by the Ringee MCP.
          </p>
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">MCP tool</th>
                  <th className="px-4 py-2 font-medium">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {TOOL_CATALOG.map((t) => (
                  <tr key={t.action}>
                    <td className="px-4 py-2 font-medium">{t.action}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {t.tool}
                    </td>
                    <td className="px-4 py-2">
                      <RiskBadge level={t.sensitivity} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="border-t pt-6 text-xs text-muted-foreground">
          Ringee agent layer · the backend/MCP is the single source of truth ·{" "}
          <code className="font-mono">@ringee-io/chatgpt-app</code>
        </footer>
      </div>
    </main>
  );
}

function RiskBadge({ level }: { level: string }) {
  const map: Record<
    string,
    { variant: "default" | "info" | "warning" | "destructive"; label: string }
  > = {
    read: { variant: "default", label: "read" },
    write: { variant: "info", label: "write" },
    sensitive: { variant: "warning", label: "sensitive" },
    destructive: { variant: "destructive", label: "destructive" },
  };
  const cfg = map[level] ?? map.read;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
