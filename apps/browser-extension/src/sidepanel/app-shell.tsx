import { AlertCircle, Home, Users } from "lucide-react";
import { cn } from "@ringee/frontend-shared/lib/utils";
import { RingeeLogo } from "./ringee-logo";
import { CreditPill } from "./credit/credit-pill";
import { useApp, useNav, type Route, type Tab } from "./navigation";
import { TodayScreen } from "./screens/today-screen";
import { ContactsScreen } from "./screens/contacts-screen";
import { ContactDetailScreen } from "./screens/contact-detail-screen";
import { ContactFormScreen } from "./screens/contact-form-screen";
import { CallDetailScreen } from "./screens/call-detail-screen";
import { CallbackDetailScreen } from "./screens/callback-detail-screen";
import { MeetingDetailScreen } from "./screens/meeting-detail-screen";
import { ScheduleScreen } from "./screens/schedule-screen";

/**
 * The signed-in side-panel shell: a branded header (with the admin-only credit
 * pill), the routed body, and a bottom tab bar. Header + tabs show on the two
 * tab roots; pushed detail screens own their own back header and take the panel.
 */
export function AppShell({
  error,
  dncBlocked,
  creditRefreshKey,
}: {
  error?: string;
  dncBlocked?: boolean;
  creditRefreshKey?: number;
}) {
  const nav = useNav();
  const { api, me, notify } = useApp();
  const isRoot = nav.route.name === "today" || nav.route.name === "contacts";

  return (
    <div className="bg-muted/30 text-foreground flex h-full flex-col">
      {isRoot && (
        <header className="bg-background flex items-center justify-between px-4 py-3">
          <RingeeLogo className="h-6" />
          <div className="flex items-center gap-2">
            {me?.isAdmin ? (
              <CreditPill
                api={api}
                notify={notify}
                refreshKey={creditRefreshKey}
              />
            ) : (
              me && (
                <span className="bg-muted text-muted-foreground max-w-[140px] truncate rounded-full px-2.5 py-1 text-xs font-medium">
                  {me.firstName || me.workspaceName || "Ringee"}
                </span>
              )
            )}
          </div>
        </header>
      )}

      {error && (
        <div
          className={cn(
            "mx-3 mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs",
            dncBlocked
              ? "bg-rose-500/10 text-rose-600"
              : "bg-amber-500/10 text-amber-700",
          )}
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        <div key={routeKey(nav.route)} className="h-full animate-[screenIn_0.16s_ease]">
          <ScreenForRoute route={nav.route} />
        </div>
      </div>

      {isRoot && <BottomTabs tab={nav.tab} onSwitch={nav.switchTab} />}
    </div>
  );
}

function ScreenForRoute({ route }: { route: Route }) {
  switch (route.name) {
    case "today":
      return <TodayScreen />;
    case "contacts":
      return <ContactsScreen />;
    case "schedule":
      return <ScheduleScreen mode={route.mode} />;
    case "contact":
      return <ContactDetailScreen id={route.id} />;
    case "contact-form":
      return (
        <ContactFormScreen id={route.id} initialPhone={route.initialPhone} />
      );
    case "call":
      return <CallDetailScreen id={route.id} />;
    case "callback":
      return <CallbackDetailScreen item={route.item} />;
    case "meeting":
      return <MeetingDetailScreen id={route.id} />;
  }
}

/** A stable key per visible screen so same-type pushes remount cleanly. */
function routeKey(route: Route): string {
  switch (route.name) {
    case "contact":
    case "contact-form":
    case "call":
    case "meeting":
      return `${route.name}:${route.id ?? "new"}`;
    case "callback":
      return `callback:${route.item.id}`;
    case "schedule":
      return `schedule:${route.mode}`;
    default:
      return route.name;
  }
}

function BottomTabs({
  tab,
  onSwitch,
}: {
  tab: Tab;
  onSwitch: (tab: Tab) => void;
}) {
  return (
    <nav className="bg-background flex shrink-0 items-stretch shadow-[0_-2px_10px_-6px_rgba(0,0,0,0.12)]">
      <TabButton
        label="Today"
        icon={Home}
        active={tab === "today"}
        onClick={() => onSwitch("today")}
      />
      <TabButton
        label="Contacts"
        icon={Users}
        active={tab === "contacts"}
        onClick={() => onSwitch("contacts")}
      />
    </nav>
  );
}

function TabButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof Home;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
        active
          ? "text-emerald-600"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}
