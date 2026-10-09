/** Two letters for a person's avatar, or the last two digits of their number. */
export function getInitials(name: string | null, phoneNumber: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }
  return phoneNumber.replace(/\D/g, '').slice(-2) || '··';
}
