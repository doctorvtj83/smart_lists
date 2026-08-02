/**
 * The result shape BOTH catalog Server Actions return.
 *
 * Why the actions return a state object instead of throwing: the collision error
 * („Artikel existiert bereits") has to land inline on the name field, and a
 * thrown error on a Server Action produces Next.js's error overlay, not an inline
 * message. Returning state is what React 19's useActionState consumes.
 *
 * One shared shape for both actions keeps the two useActionState hooks in
 * CatalogBrowser identically typed; each action simply leaves the fields it has
 * no answer for at their idle values.
 */
export type CatalogFormState = {
  /** German inline error from the last attempt, or null. */
  error: string | null;
  /** True after an action SUCCEEDED — the panel closes on it. Distinguishing this
   *  from `error === null` matters because the idle state has no error either. */
  ok: boolean;
  /** Id of a freshly created article; the browser opens its panel straight away. */
  createdId: string | null;
  /** Which article the result belongs to, so a stale error can never be painted
   *  onto a different article's panel after the user cancels and opens another. */
  articleId: string | null;
};

/** The initial value both useActionState hooks start from. */
export const CATALOG_FORM_IDLE: CatalogFormState = {
  error: null,
  ok: false,
  createdId: null,
  articleId: null,
};
