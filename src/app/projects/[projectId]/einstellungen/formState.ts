/**
 * The result shape the settings Server Action returns.
 *
 * Why the action returns state instead of throwing: a validation message („Bezeichnung darf
 * höchstens 40 Zeichen lang sein") has to land inline next to the field, and a thrown error on a
 * Server Action produces Next.js's error overlay instead. Returning state is what React 19's
 * useActionState consumes — the same convention the Katalog screen established.
 */
export type SettingsFormState = {
  /** German inline error from the last attempt, or null. */
  error: string | null;
  /** True after a save SUCCEEDED — drives the „Gespeichert" confirmation. Distinct from
   *  `error === null`, because the idle state has no error either. */
  ok: boolean;
};

/** The initial value useActionState starts from. */
export const SETTINGS_FORM_IDLE: SettingsFormState = { error: null, ok: false };
