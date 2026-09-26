"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useApi } from "../../hooks/use.api";
import { useOrgRole } from "../../hooks/use-org-role";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { RoleGuard } from "../role-guard";

type NumberRef = { kind: "ringee" | "external"; id: string };
type Route = {
  number: NumberRef;
  phoneNumber: string;
  destinationType: string;
  destinationId: string | null;
  destinationLabel: string | null;
  configured: boolean;
  availableDestinationTypes: string[];
};
type Destination = {
  destinationType: string;
  destinationId: string;
  label: string;
  extension?: string;
};
const keyOf = (n: NumberRef) => `${n.kind}/${n.id}`;

/** Shared by Settings, My Numbers and the existing agent detail. */
export function InboundRoutingButton({
  agentId,
  number,
  onSaved,
}: {
  agentId?: string;
  number?: NumberRef;
  onSaved?: () => void;
}) {
  const t = useTranslations("settings.routing");
  const { canAccessAdminFeatures } = useOrgRole();
  const [open, setOpen] = useState(false);
  if (!canAccessAdminFeatures) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t(agentId ? "receptionistNumbers" : "assign")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(agentId ? "receptionistNumbers" : "assign")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {open && (
          <RoutingEditor
            agentId={agentId}
            number={number}
            onSaved={() => {
              onSaved?.();
              setOpen(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RoutingEditor({
  agentId,
  number,
  onSaved,
}: {
  agentId?: string;
  number?: NumberRef;
  onSaved: () => void;
}) {
  const api = useApi();
  const t = useTranslations("settings.routing");
  // Callers pass a fresh object on every render; the key is what identifies it.
  const numberKey = number ? keyOf(number) : null;
  const [numbers, setNumbers] = useState<Route[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [directory, setDirectory] = useState<Destination[]>([]);
  const [selected, setSelected] = useState<string[]>(
    number ? [keyOf(number)] : [],
  );
  const [assigned, setAssigned] = useState<string[]>([]);
  const [destination, setDestination] = useState(
    agentId ? `ai_receptionist:${agentId}` : "",
  );
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<Route[]>("/inbound-routes/numbers"),
      api.get<{ id: string; name: string }[]>("/inbound-routes/receptionists"),
    ])
      .then(([rows, options]) => {
        if (!active) return;
        setNumbers(rows);
        setAgents(options);
        if (agentId) {
          const keys = rows
            .filter(
              (r) =>
                r.destinationType === "ai_receptionist" &&
                r.destinationId === agentId,
            )
            .map((r) => keyOf(r.number));
          setSelected(keys);
          setAssigned(keys);
        }
        const existing = numberKey
          ? rows.find((r) => keyOf(r.number) === numberKey)
          : undefined;
        if (existing?.destinationId)
          setDestination(
            `${existing.destinationType}:${existing.destinationId}`,
          );
      })
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [api, numberKey, agentId]);
  useEffect(() => {
    if (agentId) return;
    let active = true;
    const timer = setTimeout(() => {
      api
        .get<{ destinations: Destination[]; hasMore: boolean }>(
          `/inbound-routes/directory?query=${encodeURIComponent(query)}`,
        )
        .then((result) => {
          if (active) {
            setDirectory(result.destinations);
            setMore(result.hasMore);
          }
        })
        .catch(() => active && setError(true));
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, query, agentId]);
  const save = async () => {
    setSaving(true);
    setError(false);
    const [destinationType, destinationId] = destination.split(":");
    // Keep failed rows selected. Successful assignments are visible immediately on retry.
    const removed = agentId
      ? assigned.filter((key) => !selected.includes(key))
      : [];
    const changes = [...selected, ...removed];
    const results = await Promise.allSettled(
      changes.map((key) =>
        destination === "default" || removed.includes(key)
          ? api.delete(`/inbound-routes/${key}`)
          : api.put(`/inbound-routes/${key}`, {
              destinationType,
              destinationId,
            }),
      ),
    );
    const failed = changes.filter(
      (_, index) => results[index].status === "rejected",
    );
    setSaving(false);
    if (failed.length) {
      setError(true);
    } else onSaved();
  };
  if (loading) return <Skeleton className="h-40 w-full" />;
  const rows = number
    ? numbers.filter((r) => keyOf(r.number) === keyOf(number))
    : numbers;
  const choices: Destination[] = [
    ...agents.map((a) => ({
      destinationType: "ai_receptionist",
      destinationId: a.id,
      label: a.name,
    })),
    ...directory,
  ];
  const destinationType = destination.split(":")[0];
  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t("error")}
        </p>
      )}
      {!agentId && (
        <div className="space-y-2">
          <Label htmlFor="routing-search">{t("destination")}</Label>
          <Input
            id="routing-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search")}
          />
          <Select
            value={destination}
            onValueChange={setDestination}
            disabled={saving}
          >
            <SelectTrigger aria-label={t("destination")}>
              <SelectValue placeholder={t("chooseDestination")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{t("default")}</SelectItem>
              {choices.map((d) => (
                <SelectItem
                  key={`${d.destinationType}:${d.destinationId}`}
                  value={`${d.destinationType}:${d.destinationId}`}
                >
                  {d.label}
                  {d.extension ? ` · ${d.extension}` : ""} ·{" "}
                  {t(`types.${d.destinationType}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {more && (
            <p className="text-muted-foreground text-xs">{t("refine")}</p>
          )}
        </div>
      )}
      {agentId && !agents.some((a) => a.id === agentId) && (
        <p className="text-muted-foreground text-sm">{t("activateAgent")}</p>
      )}
      <div className="space-y-2">
        <Label>{t("numbers")}</Label>
        {!rows.length && (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        )}
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {rows.map((route) => {
            const key = keyOf(route.number);
            const available =
              !destination ||
              destination === "default" ||
              route.availableDestinationTypes.includes(destinationType);
            return (
              <label
                key={key}
                className="hover:bg-muted flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3"
              >
                <Checkbox
                  checked={selected.includes(key)}
                  disabled={saving || !available}
                  onCheckedChange={(checked) =>
                    setSelected((current) =>
                      checked
                        ? [...current, key]
                        : current.filter((item) => item !== key),
                    )
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {route.phoneNumber}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {route.number.kind === "external" ? t("byoc") : t("ringee")}{" "}
                    · {route.destinationLabel || t("default")}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          onClick={() => void save()}
          disabled={
            saving ||
            (!selected.length && !assigned.length) ||
            !destination ||
            (Boolean(agentId) && !agents.some((a) => a.id === agentId)) ||
            rows.some(
              (r) =>
                selected.includes(keyOf(r.number)) &&
                destination !== "default" &&
                !r.availableDestinationTypes.includes(destinationType),
            )
          }
        >
          {t(saving ? "saving" : "save")}
        </Button>
      </div>
    </div>
  );
}

export function InboundRoutingPanel() {
  return (
    <RoleGuard>
      <RoutingList />
    </RoleGuard>
  );
}

function RoutingList() {
  const api = useApi();
  const t = useTranslations("settings.routing");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setRoutes(await api.get<Route[]>("/inbound-routes/numbers"));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <InboundRoutingButton onSaved={() => void load()} />
        <ExtensionsDialog />
      </div>
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : error ? (
        <div role="alert">
          <p>{t("error")}</p>
          <Button variant="outline" onClick={() => void load()}>
            {t("retry")}
          </Button>
        </div>
      ) : !routes.length ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <div className="divide-y rounded-lg border">
          {routes.map((route) => (
            <div
              key={keyOf(route.number)}
              className="flex flex-wrap items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{route.phoneNumber}</p>
                <p className="text-muted-foreground text-xs">
                  {route.destinationLabel || t("default")}
                  {route.configured
                    ? ` · ${t(`types.${route.destinationType}`)}`
                    : ""}
                </p>
              </div>
              <InboundRoutingButton
                number={route.number}
                onSaved={() => void load()}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExtensionsDialog() {
  const t = useTranslations("settings.routing");
  const { hasOrg } = useOrgRole();
  const [open, setOpen] = useState(false);
  if (!hasOrg) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {t("extensions")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("extensions")}</DialogTitle>
          <DialogDescription>{t("extensionsDescription")}</DialogDescription>
        </DialogHeader>
        {open && <ExtensionEditor />}
      </DialogContent>
    </Dialog>
  );
}

function ExtensionEditor() {
  const api = useApi();
  const t = useTranslations("settings.routing");
  const [members, setMembers] = useState<
    { userId: string; label: string; extension: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    api
      .get<typeof members>("/inbound-routes/extensions")
      .then((rows) => active && setMembers(rows))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [api]);
  const save = async (member: (typeof members)[number]) => {
    setBusy(member.userId);
    setError(false);
    try {
      await api.put(`/inbound-routes/extensions/${member.userId}`, {
        extension: member.extension?.trim() || null,
      });
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t("extensionError")}
        </p>
      )}
      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : !members.length ? (
        <p>{t("noMembers")}</p>
      ) : (
        members.map((m) => (
          <form
            key={m.userId}
            onSubmit={(event) => {
              event.preventDefault();
              void save(m);
            }}
            className="flex items-center gap-2"
          >
            <Label
              htmlFor={`extension-${m.userId}`}
              className="min-w-0 flex-1 truncate"
            >
              {m.label}
            </Label>
            <Input
              id={`extension-${m.userId}`}
              className="w-24"
              inputMode="numeric"
              pattern="[0-9]{2,6}"
              maxLength={6}
              value={m.extension ?? ""}
              onChange={(event) =>
                setMembers((rows) =>
                  rows.map((row) =>
                    row.userId === m.userId
                      ? { ...row, extension: event.target.value }
                      : row,
                  ),
                )
              }
            />
            <Button size="sm" variant="outline" disabled={!!busy}>
              {t(busy === m.userId ? "saving" : "save")}
            </Button>
          </form>
        ))
      )}
    </div>
  );
}
