/**
 * `ringee-recording-<from>-<to>-<yyyy-mm-dd>-<hhmm>.mp3`, in the browser's own
 * time zone, so a Downloads folder full of recordings stays readable. A part
 * that is not known is left out; the call id stands in when neither number is.
 */
export function recordingFileName({
  from,
  to,
  at,
  callId
}: {
  from?: string | null;
  to?: string | null;
  at?: string | null;
  callId?: string | null;
}): string {
  const numbers = [from, to]
    .map((number) => number?.replace(/\D/g, ''))
    .filter((digits): digits is string => !!digits);
  const parts = ['ringee-recording', ...numbers];

  const date = at ? new Date(at) : null;
  if (date && !Number.isNaN(date.getTime())) parts.push(stamp(date));
  if (numbers.length === 0 && callId) parts.push(callId);

  return `${parts.join('-')}.mp3`;
}

function stamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
