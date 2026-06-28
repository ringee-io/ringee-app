import { useEffect, useMemo, useState } from "react";
import PhoneInput, {
  isPossiblePhoneNumber,
  type Value,
  type Flags,
} from "react-phone-number-input";
import * as flagComponents from "country-flag-icons/react/3x2";
import "react-phone-number-input/style.css";
import { Loader2 } from "lucide-react";
import { Input } from "@ringee/frontend-shared/components/ui/input";
import { Textarea } from "@ringee/frontend-shared/components/ui/textarea";
import { Button } from "@ringee/frontend-shared/components/ui/button";
import { DEFAULT_REGION } from "../../lib/region";
import type { ContactInput } from "../../lib/ringee-api";
import { ScreenHeader, Spinner } from "../components/ui";
import { useApp, useNav } from "../navigation";

const flags = flagComponents as unknown as Flags;

/** Create or edit a contact. Phone is required and stored as E.164. */
export function ContactFormScreen({
  id,
  initialPhone,
}: {
  id?: string;
  initialPhone?: string;
}) {
  const { api, notify } = useApp();
  const nav = useNav();
  const editing = !!id;

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<Value | undefined>(
    (initialPhone as Value) || undefined,
  );
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!editing) return;
    let alive = true;
    api
      .getContact(id!)
      .then((c) => {
        if (!alive) return;
        setFirstName(c.firstName ?? "");
        setLastName(c.lastName ?? "");
        setCompany(c.company ?? "");
        setJobTitle(c.jobTitle ?? "");
        setEmail(c.email ?? "");
        setPhone((c.phoneNumber as Value) || undefined);
      })
      .catch(() => alive && notify("error", "Couldn't load this contact."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [api, id, editing, notify]);

  const phoneValid = useMemo(
    () => !!phone && isPossiblePhoneNumber(phone),
    [phone],
  );

  const handleSave = async () => {
    if (!phoneValid || !phone) {
      notify("error", "Enter a valid phone number.");
      return;
    }
    setSaving(true);
    const name = `${firstName.trim()} ${lastName.trim()}`.trim();
    const payload: ContactInput = {
      phoneNumber: phone,
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      name: name || undefined,
      organization: company.trim() || undefined,
      jobTitle: jobTitle.trim() || undefined,
      email: email.trim() || undefined,
      note: !editing && note.trim() ? note.trim() : undefined,
    };
    try {
      if (editing) {
        await api.updateContact(id!, payload);
        notify("success", "Contact updated");
        nav.replace({ name: "contact", id: id! });
      } else {
        const created = await api.createContact(payload);
        notify("success", "Contact created");
        nav.replace({ name: "contact", id: created.id });
      }
    } catch {
      notify("error", "Could not save the contact.");
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title={editing ? "Edit contact" : "New contact"}
        onBack={nav.back}
      />

      {loading ? (
        <Spinner />
      ) : (
        <div className="flex-1 space-y-3.5 overflow-y-auto p-4">
          <FormRow label="Phone" required>
            <PhoneInput
              international
              defaultCountry={DEFAULT_REGION}
              flags={flags}
              placeholder="Enter number"
              value={phone}
              onChange={setPhone}
              className="ringee-phone"
            />
          </FormRow>

          <div className="grid grid-cols-2 gap-2.5">
            <FormRow label="First name">
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="h-9 text-sm"
              />
            </FormRow>
            <FormRow label="Last name">
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="h-9 text-sm"
              />
            </FormRow>
          </div>

          <FormRow label="Company">
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="h-9 text-sm"
            />
          </FormRow>

          <FormRow label="Job title">
            <Input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="h-9 text-sm"
            />
          </FormRow>

          <FormRow label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 text-sm"
            />
          </FormRow>

          {!editing && (
            <FormRow label="Note">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Optional first note"
                className="min-h-[48px] resize-none text-sm"
              />
            </FormRow>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={nav.back}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !phoneValid}
              className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editing ? (
                "Save changes"
              ) : (
                "Create contact"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FormRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-muted-foreground block text-[10px] font-medium tracking-wider uppercase">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}
