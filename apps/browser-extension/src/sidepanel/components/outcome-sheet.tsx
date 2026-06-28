import { useState } from "react";
import {
  CalendarCheck,
  Clock,
  DollarSign,
  Loader2,
  PhoneCall,
  PhoneMissed,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  Voicemail,
  PhoneOff,
  type LucideIcon,
} from "lucide-react";
import type { CallOutcome } from "@ringee/dialer-core/contracts";
import { cn } from "@ringee/frontend-shared/lib/utils";
import { Textarea } from "@ringee/frontend-shared/components/ui/textarea";
import { Button } from "@ringee/frontend-shared/components/ui/button";
import { Sheet } from "./sheet";

const OPTIONS: {
  id: CallOutcome;
  label: string;
  icon: LucideIcon;
  color: string;
  active: string;
}[] = [
  { id: "meeting_booked", label: "Meeting booked", icon: CalendarCheck, color: "text-emerald-500", active: "border-emerald-500 bg-emerald-500/10 text-emerald-600" },
  { id: "sale", label: "Sale", icon: DollarSign, color: "text-green-500", active: "border-green-500 bg-green-500/10 text-green-600" },
  { id: "interested", label: "Interested", icon: ThumbsUp, color: "text-blue-500", active: "border-blue-500 bg-blue-500/10 text-blue-600" },
  { id: "follow_up", label: "Follow up", icon: Clock, color: "text-amber-500", active: "border-amber-500 bg-amber-500/10 text-amber-600" },
  { id: "callback_scheduled", label: "Callback", icon: PhoneCall, color: "text-amber-500", active: "border-amber-500 bg-amber-500/10 text-amber-600" },
  { id: "no_answer", label: "No answer", icon: PhoneMissed, color: "text-gray-400", active: "border-gray-400 bg-gray-500/10 text-gray-500" },
  { id: "voicemail", label: "Voicemail", icon: Voicemail, color: "text-purple-400", active: "border-purple-400 bg-purple-500/10 text-purple-500" },
  { id: "gatekeeper", label: "Gatekeeper", icon: ShieldAlert, color: "text-orange-400", active: "border-orange-400 bg-orange-500/10 text-orange-500" },
  { id: "wrong_number", label: "Wrong number", icon: PhoneOff, color: "text-red-400", active: "border-red-400 bg-red-500/10 text-red-500" },
  { id: "not_interested", label: "Not interested", icon: ThumbsDown, color: "text-slate-400", active: "border-slate-400 bg-slate-500/10 text-slate-500" },
];

/** A bottom-sheet outcome picker + optional note, used from the call detail. */
export function OutcomeSheet({
  open,
  initialOutcome,
  initialNote,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initialOutcome?: CallOutcome | null;
  initialNote?: string | null;
  onClose: () => void;
  onSubmit: (data: { outcome: CallOutcome; note?: string }) => Promise<void>;
}) {
  const [selected, setSelected] = useState<CallOutcome | null>(
    initialOutcome ?? null,
  );
  const [note, setNote] = useState(initialNote ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await onSubmit({ outcome: selected, note: note.trim() || undefined });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      title="Call outcome"
      onClose={onClose}
      footer={
        <Button
          onClick={handleSave}
          disabled={!selected || saving}
          className="w-full"
          size="sm"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save outcome"}
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-2 pt-1">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const isActive = selected === o.id;
          return (
            <button
              key={o.id}
              onClick={() => setSelected(o.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl p-2.5 text-left text-xs font-semibold transition-all active:scale-95",
                isActive
                  ? cn(o.active, "shadow-sm")
                  : "bg-muted/50 hover:bg-muted",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", isActive ? "" : o.color)} />
              <span className="leading-tight">{o.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 mb-1">
        <label className="text-muted-foreground mb-1.5 block text-[10px] font-medium tracking-wider uppercase">
          Note (optional)
        </label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a short note for context"
          rows={2}
          className="min-h-[52px] resize-none text-sm"
        />
      </div>
    </Sheet>
  );
}
