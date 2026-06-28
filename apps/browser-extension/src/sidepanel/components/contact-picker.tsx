import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { formatForDisplay } from "@ringee/dialer-core/phone";
import type { ContactSummary, RingeeApi } from "../../lib/ringee-api";
import { Avatar } from "./ui";

/**
 * A debounced contact search + select control. When a contact is chosen it
 * collapses to a compact chip with a "change" affordance. Used by the standalone
 * schedule screen where the contact isn't known up front.
 */
export function ContactPicker({
  api,
  value,
  onChange,
}: {
  api: RingeeApi;
  value: ContactSummary | null;
  onChange: (contact: ContactSummary | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (value) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const token = ++reqId.current;
    setSearching(true);
    const id = setTimeout(() => {
      api
        .listContacts({ search: q, limit: 8 })
        .then((res) => token === reqId.current && setResults(res.data ?? []))
        .catch(() => token === reqId.current && setResults([]))
        .finally(() => token === reqId.current && setSearching(false));
    }, 250);
    return () => clearTimeout(id);
  }, [query, value, api]);

  if (value) {
    return (
      <div className="bg-muted/60 flex items-center gap-3 rounded-xl px-3 py-2.5">
        <Avatar name={value.name} fallback={value.phoneNumber} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {value.name || "Unknown"}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {value.company || formatForDisplay(value.phoneNumber)}
          </p>
        </div>
        <button
          onClick={() => {
            onChange(null);
            setQuery("");
          }}
          className="hover:bg-accent text-muted-foreground flex h-7 w-7 items-center justify-center rounded-md transition"
          aria-label="Change contact"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-muted/60 flex h-10 items-center gap-2 rounded-lg px-3">
        <Search className="text-muted-foreground h-4 w-4 shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or number"
          className="placeholder:text-muted-foreground/60 h-full flex-1 bg-transparent text-sm outline-none"
        />
        {searching && (
          <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
        )}
      </div>

      {results.length > 0 && (
        <div className="bg-card mt-2 divide-y divide-border/40 overflow-hidden rounded-xl shadow-md">
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onChange(c);
                setQuery("");
                setResults([]);
              }}
              className="hover:bg-accent flex w-full items-center gap-3 px-3 py-2.5 text-left transition"
            >
              <Avatar name={c.name} fallback={c.phoneNumber} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {c.name || "Unknown"}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {c.company || formatForDisplay(c.phoneNumber)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
