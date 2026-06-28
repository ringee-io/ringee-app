import { useState } from "react";
import type { ContactSummary } from "../../lib/ringee-api";
import { ScreenHeader } from "../components/ui";
import { ContactPicker } from "../components/contact-picker";
import { ScheduleCallbackForm } from "../schedule-callback.form";
import { BookMeetingForm } from "../book-meeting.form";
import { useApp, useNav } from "../navigation";

/**
 * Standalone scheduling (reached from the Today shortcuts): pick a contact, then
 * the same lean callback/meeting form used post-call and on the contact detail.
 */
export function ScheduleScreen({ mode }: { mode: "callback" | "meeting" }) {
  const { api, notify } = useApp();
  const nav = useNav();
  const [contact, setContact] = useState<ContactSummary | null>(null);

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title={mode === "callback" ? "New callback" : "New meeting"}
        onBack={nav.back}
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <label className="text-muted-foreground block text-[10px] font-medium tracking-wider uppercase">
            Contact
          </label>
          <ContactPicker api={api} value={contact} onChange={setContact} />
        </div>

        {contact && (
          <div className="bg-card rounded-xl p-3 shadow-sm">
            {mode === "callback" ? (
              <ScheduleCallbackForm
                api={api}
                notify={notify}
                contactId={contact.id}
                onScheduled={nav.back}
                onCancel={nav.back}
              />
            ) : (
              <BookMeetingForm
                api={api}
                notify={notify}
                contactId={contact.id}
                onBooked={nav.back}
                onCancel={nav.back}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
