"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TextField } from "@/components/ui/TextField";
import styles from "./InviteForm.module.css";

/** What the invite action reports back to the field. */
export interface InviteFormState {
  /** A German message, or null when the last attempt succeeded. */
  error: string | null;
}

/** The state before anything has been submitted. */
export const INVITE_FORM_IDLE: InviteFormState = { error: null };

type InviteFormProps = {
  /** Server Action with the useActionState signature. */
  action: (prev: InviteFormState, formData: FormData) => Promise<InviteFormState>;
};

/**
 * The owner-only „MITGLIED EINLADEN" block (handoff screen 3i).
 *
 * Why useActionState instead of letting the action throw: inviting somebody who
 * has never signed in is a NORMAL outcome here (the domain answers "Nutzer nicht
 * gefunden – die Person muss sich zuerst einmal anmelden."), and a crash overlay
 * is the wrong way to deliver a sentence the user is meant to act on. This is the
 * inline-error pattern the design specifies and Slice 10's catalog screen
 * established.
 */
export function InviteForm({ action }: InviteFormProps) {
  const [state, formAction] = useActionState(action, INVITE_FORM_IDLE);

  return (
    <div className={styles.block}>
      <SectionLabel>MITGLIED EINLADEN</SectionLabel>
      <form action={formAction} className={styles.row}>
        <div className={styles.field}>
          <TextField
            type="email"
            name="email"
            aria-label="E-Mail-Adresse"
            placeholder="E-Mail-Adresse"
            error={state.error}
          />
        </div>
        <Button type="submit">Einladen</Button>
      </form>
      {/* States the closed-access rule up front, so a failed invite is not the
          first time the owner hears about the allowlist. */}
      <p className={styles.hint}>Nur freigeschaltete E-Mail-Adressen können eingeladen werden.</p>
    </div>
  );
}
