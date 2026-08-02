"use client";

import { useState } from "react";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import styles from "./DeleteProjectButton.module.css";

type DeleteProjectButtonProps = {
  projectName: string;
  /** Server Action; it re-checks ownership and redirects to /projects. */
  deleteAction: () => Promise<void>;
};

/**
 * „Projekt löschen…" plus its confirmation sheet (handoff screen 3e + the shared
 * destructive pattern).
 *
 * The trigger is a text button, never a filled one — the design reserves filled
 * destructive surfaces for the confirmation itself.
 *
 * The only state here is whether the sheet is open; the mutation is a Server
 * Action prop, so the page keeps ownership of it and of its requireOwner check.
 */
export function DeleteProjectButton({ projectName, deleteAction }: DeleteProjectButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setConfirmOpen(true)}>
        Projekt löschen…
      </button>

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Projekt löschen: ${projectName}`}
        options={[
          {
            label: "Projekt endgültig löschen",
            description:
              "Alle Listen, der Katalog und die Favoriten dieses Projekts verschwinden mit. Das lässt sich nicht rückgängig machen.",
            tone: "danger",
            // ConfirmSheet does not close itself on select — same Gallery pattern
            // as CatalogEditPanel: fire the mutation, then drop the sheet.
            onSelect: () => {
              void deleteAction();
              setConfirmOpen(false);
            },
          },
        ]}
      />
    </>
  );
}
