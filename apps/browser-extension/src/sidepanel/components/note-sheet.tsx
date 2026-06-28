import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Textarea } from "@ringee/frontend-shared/components/ui/textarea";
import { Button } from "@ringee/frontend-shared/components/ui/button";
import { Sheet } from "./sheet";

/** A bottom-sheet single-field note composer (contact / call notes). */
export function NoteSheet({
  open,
  title,
  placeholder = "Write a note…",
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  placeholder?: string;
  onClose: () => void;
  onSubmit: (content: string) => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const value = content.trim();
    if (!value || saving) return;
    setSaving(true);
    try {
      await onSubmit(value);
      setContent("");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <Button
          onClick={handleSave}
          disabled={!content.trim() || saving}
          className="w-full"
          size="sm"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save note"}
        </Button>
      }
    >
      <Textarea
        autoFocus
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="mt-1 mb-1 min-h-[96px] resize-none text-sm"
      />
    </Sheet>
  );
}
