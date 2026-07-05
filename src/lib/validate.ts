// Shape checks for values that arrive from untrusted sources (URL segments, request bodies).
//
// Why this exists: our primary keys are native Postgres `uuid` columns (@db.Uuid in schema.prisma).
// When a query parameter is not a syntactically valid UUID, the Postgres driver rejects it and
// Prisma throws PrismaClientKnownRequestError P2023 ("Error creating UUID") — which our error
// mapper would report as an unexpected 500. Checking the shape first lets callers treat a
// malformed id the same as a non-existent one (404), which is both correct semantics and keeps
// the server log free of fake "unexpected error" noise.

// Canonical UUID: 8-4-4-4-12 hex digits. Case-insensitive because UUIDs compare case-insensitively.
// We deliberately do not restrict the version/variant nibbles: the DB accepts any well-formed UUID,
// and client-generated ids (offline-prep convention) may use different UUID versions.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Returns true if the string is a canonical UUID that can be passed safely to a uuid DB column.
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
