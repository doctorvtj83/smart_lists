// Normalizes an email for allowlist comparison and storage.
// MVP rule (see MVP design section 4.4): lowercase + trim.
// Collapsing repeated spaces is intentionally not applied to emails; that rule belongs to article names.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
