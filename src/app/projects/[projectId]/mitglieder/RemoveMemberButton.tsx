"use client";

import { useState } from "react";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import styles from "./RemoveMemberButton.module.css";

type RemoveMemberButtonProps = {
  /** Display name or email — whatever the row shows, so the sheet matches it. */
  memberLabel: string;
  userId: string;
  /** Server Action; reads `userId` from the FormData. */
  removeAction: (formData: FormData) => void | Promise<void>;
};

/**
 * „Entfernen" on a member row, plus its confirmation sheet.
 *
 * Removing a member revokes their access to every list in the project, so it
 * takes the shared destructive pattern rather than a bare button: the sheet
 * spells the consequence out and the dangerous option carries the destructive
 * surface.
 *
 * The row itself never renders this for the owner (the owner cannot be removed)
 * or for a member's view — the page decides that, so this component stays a dumb
 * trigger.
 */
export function RemoveMemberButton({
  memberLabel,
  userId,
  removeAction,
}: RemoveMemberButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const confirmRemoval = () => {
    // FormData built by hand: the confirmation lives in a sheet, outside any
    // <form> (the CatalogEditPanel precedent).
    const formData = new FormData();
    formData.set("userId", userId);
    void removeAction(formData);
    // ConfirmSheet does not close itself on select — fire, then close.
    setConfirmOpen(false);
  };

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setConfirmOpen(true)}>
        Entfernen
      </button>

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Mitglied entfernen: ${memberLabel}`}
        options={[
          {
            label: "Aus dem Projekt entfernen",
            description:
              "Die Person verliert sofort den Zugriff auf alle Listen dieses Projekts. Du kannst sie jederzeit wieder einladen.",
            tone: "danger",
            onSelect: confirmRemoval,
          },
        ]}
      />
    </>
  );
}
