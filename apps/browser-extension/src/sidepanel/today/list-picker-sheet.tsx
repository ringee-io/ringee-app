import { useMemo, useState } from "react";
import { Check, ExternalLink, RotateCw, X } from "lucide-react";
import { cn } from "@ringee/frontend-shared/lib/utils";
import { Input } from "@ringee/frontend-shared/components/ui/input";
import type { CallList } from "../../lib/ringee-api";
import { Sheet } from "../components/sheet";
import { Spinner } from "../components/ui";

/** Past this many lists, the picker offers a search. */
const SEARCH_FROM = 7;

/**
 * Picks the list "Call next" goes through once nobody in today's queue is
 * due. Only the lists assigned to the user are offered — the server sends no
 * other.
 */
export function ListPickerSheet({
  open,
  onClose,
  lists,
  loading,
  failed,
  onRetry,
  selectedId,
  onSelect,
  onCreateList,
}: {
  open: boolean;
  onClose: () => void;
  lists: CallList[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (listId: string | null) => void;
  /** Lists are made in the web app. */
  onCreateList: () => void;
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? lists.filter((list) => list.name.toLowerCase().includes(q))
      : lists;
  }, [lists, query]);

  const pick = (listId: string | null) => {
    onSelect(listId);
    onClose();
  };

  return (
    <Sheet open={open} title="Call from a list" onClose={onClose}>
      <p className="text-muted-foreground pb-3 text-xs">
        When nobody in today&apos;s queue is due, Call next takes the next
        contact of this list.
      </p>

      {loading ? (
        <Spinner inline />
      ) : failed ? (
        <div className="flex flex-col items-center gap-2.5 py-5 text-center">
          <p className="text-sm">Your lists didn&apos;t load.</p>
          <button
            onClick={onRetry}
            className="hover:bg-accent flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition"
          >
            <RotateCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      ) : lists.length === 0 ? (
        <div className="flex flex-col items-center px-2 py-5 text-center">
          <p className="text-sm font-medium">
            No lists are assigned to you yet
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Lists you create, and the ones an admin assigns you, show up here.
          </p>
        </div>
      ) : (
        <>
          {lists.length >= SEARCH_FROM && (
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your lists"
              aria-label="Search your lists"
              className="mb-2 h-9 text-sm"
            />
          )}
          <p className="text-muted-foreground px-1 pb-1 text-[10px] font-semibold tracking-wider uppercase">
            Assigned to you
          </p>
          {shown.length === 0 ? (
            <p className="text-muted-foreground px-1 py-3 text-xs">
              No list matches
            </p>
          ) : (
            <ul className="divide-border/40 divide-y">
              {shown.map((list) => (
                <li key={list.id}>
                  <button
                    onClick={() => pick(list.id)}
                    className="hover:bg-accent flex w-full items-start gap-2.5 rounded-md px-1 py-2 text-left transition"
                  >
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0 text-emerald-600",
                        list.id === selectedId ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {list.name}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {list.remaining} left · {list.contactCount}{" "}
                        {list.contactCount === 1 ? "contact" : "contacts"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="border-border/60 mt-2 space-y-0.5 border-t pt-2 pb-1">
        {selectedId && (
          <button
            onClick={() => pick(null)}
            className="hover:bg-accent flex w-full items-center gap-2.5 rounded-md px-1 py-2 text-left text-sm transition"
          >
            <X className="text-muted-foreground h-4 w-4" />
            Stop calling from a list
          </button>
        )}
        <button
          onClick={onCreateList}
          className="hover:bg-accent flex w-full items-center gap-2.5 rounded-md px-1 py-2 text-left text-sm transition"
        >
          <ExternalLink className="text-muted-foreground h-4 w-4" />
          Create a list
        </button>
      </div>
    </Sheet>
  );
}
