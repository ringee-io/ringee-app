import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { CurrentUser, RingeeApi } from "../lib/ringee-api";

/** The two bottom-tab roots. */
export type Tab = "today" | "contacts";

/** Minimal callback shape carried into the callback detail (no GET-by-id route). */
export interface CallbackNavItem {
  id: string;
  contactId: string | null;
  contactName: string | null;
  phoneNumber: string | null;
  scheduledAt: string;
  status: string;
  note: string | null;
}

/** Every screen the side panel can show. Roots are the tabs; the rest stack. */
export type Route =
  | { name: "today" }
  | { name: "contacts" }
  | { name: "schedule"; mode: "callback" | "meeting" }
  | { name: "contact"; id: string }
  | { name: "contact-form"; id?: string; initialPhone?: string }
  | { name: "call"; id: string }
  | { name: "callback"; item: CallbackNavItem }
  | { name: "meeting"; id: string };

function rootFor(tab: Tab): Route {
  return tab === "today" ? { name: "today" } : { name: "contacts" };
}

// ── Navigation: a tab + a push stack on top of that tab's root ───────────────

interface NavState {
  tab: Tab;
  stack: Route[];
}

type NavAction =
  | { type: "push"; route: Route }
  | { type: "replace"; route: Route }
  | { type: "back" }
  | { type: "switchTab"; tab: Tab };

function reducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case "push":
      return { ...state, stack: [...state.stack, action.route] };
    case "replace":
      return {
        ...state,
        stack: state.stack.length
          ? [...state.stack.slice(0, -1), action.route]
          : [action.route],
      };
    case "back":
      return { ...state, stack: state.stack.slice(0, -1) };
    case "switchTab":
      // Tapping the active tab pops to its root; switching tabs resets the stack.
      return { tab: action.tab, stack: [] };
    default:
      return state;
  }
}

interface NavValue {
  tab: Tab;
  route: Route;
  canGoBack: boolean;
  push: (route: Route) => void;
  replace: (route: Route) => void;
  back: () => void;
  switchTab: (tab: Tab) => void;
}

const NavContext = createContext<NavValue | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { tab: "today", stack: [] });

  const push = useCallback(
    (route: Route) => dispatch({ type: "push", route }),
    [],
  );
  const replace = useCallback(
    (route: Route) => dispatch({ type: "replace", route }),
    [],
  );
  const back = useCallback(() => dispatch({ type: "back" }), []);
  const switchTab = useCallback(
    (tab: Tab) => dispatch({ type: "switchTab", tab }),
    [],
  );

  const value = useMemo<NavValue>(() => {
    const route = state.stack.length
      ? state.stack[state.stack.length - 1]
      : rootFor(state.tab);
    return {
      tab: state.tab,
      route,
      canGoBack: state.stack.length > 0,
      push,
      replace,
      back,
      switchTab,
    };
  }, [state, push, replace, back, switchTab]);

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within a NavProvider");
  return ctx;
}

// ── App data shared by every screen (transport, identity, dial, toasts) ──────

export interface AppData {
  api: RingeeApi;
  me: CurrentUser | null;
  onDial: (raw: string, name?: string) => void;
  notify: (kind: "success" | "error", message: string) => void;
}

const AppContext = createContext<AppData | null>(null);

export function AppProvider({
  value,
  children,
}: {
  value: AppData;
  children: ReactNode;
}) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppData {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within an AppProvider");
  return ctx;
}
