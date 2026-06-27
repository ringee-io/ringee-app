import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, Plus, Search, Users } from "lucide-react";
import { formatForDisplay } from "@ringee/dialer-core/phone";
import type { ContactSummary } from "../../lib/ringee-api";
import { Avatar, EmptyState, Spinner } from "../components/ui";
import { useApp, useNav } from "../navigation";

const PAGE_SIZE = 25;

/** The Contacts tab: debounced search, infinite list, and a "new contact" CTA. */
export function ContactsScreen() {
  const { api, onDial } = useApp();
  const nav = useNav();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<ContactSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  const fetchPage = useCallback(
    (nextPage: number, replace: boolean) => {
      const token = ++reqId.current;
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError(false);
      api
        .listContacts({
          search: debounced || undefined,
          page: nextPage,
          limit: PAGE_SIZE,
        })
        .then((res) => {
          if (token !== reqId.current) return;
          setItems((prev) => (replace ? res.data : [...prev, ...res.data]));
          setPage(res.page);
          setTotalPages(res.totalPages);
        })
        .catch(() => token === reqId.current && setError(true))
        .finally(() => {
          if (token !== reqId.current) return;
          setLoading(false);
          setLoadingMore(false);
        });
    },
    [api, debounced],
  );

  useEffect(() => fetchPage(1, true), [fetchPage]);

  const hasMore = page < totalPages;
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!hasMore || loadingMore || loading) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) {
      fetchPage(page + 1, false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="bg-muted/60 flex h-9 flex-1 items-center gap-2 rounded-lg px-3">
          <Search className="text-muted-foreground h-4 w-4 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, phone"
            className="placeholder:text-muted-foreground/60 h-full flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <button
          onClick={() => nav.push({ name: "contact-form" })}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm transition hover:bg-emerald-600"
          aria-label="New contact"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" onScroll={onScroll}>
        {loading && items.length === 0 ? (
          <Spinner />
        ) : error && items.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-xs">
            Couldn&apos;t load contacts.
          </p>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Users}
            title={debounced ? "No matches" : "No contacts yet"}
            message={
              debounced
                ? "Try a different name or number."
                : "Add a contact or place a call to get started."
            }
          />
        ) : (
          <ul className="divide-y divide-border/40">
            {items.map((c) => (
              <ContactRow
                key={c.id}
                contact={c}
                onOpen={() => nav.push({ name: "contact", id: c.id })}
                onCall={() => onDial(c.phoneNumber, c.name ?? undefined)}
              />
            ))}
            {loadingMore && <Spinner inline />}
          </ul>
        )}
      </div>
    </div>
  );
}

function ContactRow({
  contact,
  onOpen,
  onCall,
}: {
  contact: ContactSummary;
  onOpen: () => void;
  onCall: () => void;
}) {
  return (
    <li className="flex items-center">
      <button
        onClick={onOpen}
        className="hover:bg-accent flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-2 pl-3 text-left transition"
      >
        <Avatar name={contact.name} fallback={contact.phoneNumber} size={38} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {contact.name || formatForDisplay(contact.phoneNumber)}
          </span>
          <span className="text-muted-foreground block truncate text-xs">
            {contact.company || formatForDisplay(contact.phoneNumber)}
          </span>
        </span>
      </button>
      <button
        onClick={onCall}
        className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 transition hover:bg-emerald-500/20"
        aria-label={`Call ${contact.name || contact.phoneNumber}`}
      >
        <Phone className="h-4 w-4" />
      </button>
    </li>
  );
}
