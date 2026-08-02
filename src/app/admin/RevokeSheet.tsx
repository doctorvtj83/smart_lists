"use client";

import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/Sheet";
import styles from "./RevokeSheet.module.css";

/** One project membership as the sheet lists it. */
export interface RevokeProject {
  projectId: string;
  name: string;
  role: "owner" | "member";
}

type RevokeSheetProps = {
  email: string;
  /** null = this person has never signed in, so they cannot be in any project. */
  userId: string | null;
  /** Display name if known, otherwise the email — used in the owner hint sentence. */
  displayName: string;
  projects: RevokeProject[];
  /** Server Actions, passed down from the page. They re-check admin rights themselves. */
  revokeOnlyAction: (formData: FormData) => Promise<void>;
  revokeAndExcludeAction: (formData: FormData) => Promise<void>;
};

/**
 * The two-way "Zugang entziehen" confirmation as a bottom sheet.
 *
 * Why a client component at all — the rest of /admin is server-rendered: the
 * Sheet primitive owns Escape handling and the body-scroll lock, both of which
 * need effects. This wrapper is the ONLY client code on the page.
 *
 * Why the data still comes from the server: the sheet is opened by navigating to
 * `?revoke=<email>`, so the page has already read the memberships when this
 * renders. That keeps the "no client-side data fetching" rule of the app intact
 * and means the sheet cannot show a stale membership list.
 *
 * Why closing is a router.push and not local state: the URL IS the open/closed
 * state. Local state would let the sheet close while `?revoke=` still sits in the
 * address bar, so a reload would re-open it.
 *
 * Why the actions are props: Server Actions are serialisable across the
 * client/server boundary, so the page keeps ownership of the mutations (and of
 * their requireAdmin re-checks) while this component only arranges the UI.
 */
export function RevokeSheet({
  email,
  userId,
  displayName,
  projects,
  revokeOnlyAction,
  revokeAndExcludeAction,
}: RevokeSheetProps) {
  const router = useRouter();

  // Projects the person OWNS survive the exclusion by design — that is the one
  // genuinely surprising outcome of this flow, so it is stated BEFORE the choice.
  const ownedProjects = projects.filter((project) => project.role === "owner");

  // Navigating back to the bare path both closes the sheet and drops the query.
  const close = () => router.push("/admin");

  return (
    <Sheet open onClose={close} title={`Zugang entziehen: ${email}`}>
      {userId === null ? (
        <p className={styles.lead}>
          Diese Person hat sich noch nie angemeldet und kann daher in keinem Projekt Mitglied sein.
        </p>
      ) : projects.length === 0 ? (
        <p className={styles.lead}>Diese Person ist in keinem Projekt.</p>
      ) : (
        <>
          <p className={styles.lead}>{displayName} ist Mitglied in diesen Projekten:</p>
          <div className={styles.projects}>
            {projects.map((project) => (
              <div key={project.projectId} className={styles.project}>
                <span className={styles.projectName}>{project.name}</span>
                <span className={project.role === "owner" ? styles.roleOwner : styles.role}>
                  {project.role === "owner" ? "Owner" : "Mitglied"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Option 1 — always available. For a never-signed-in person it is the only
          option and carries the plain label, because there is nothing to exclude. */}
      <form action={revokeOnlyAction}>
        <input type="hidden" name="email" value={email} />
        <button type="submit" className={styles.optionFirst}>
          <span className={styles.optionTitle}>
            {userId === null ? "Zugang entziehen" : "Nur Zugang entziehen"}
          </span>
          <span className={styles.optionText}>
            Keine neuen Logins. Mitgliedschaften bleiben — erneutes Einladen stellt alles wieder
            her.
          </span>
        </button>
      </form>

      {/* Option 2 — only for someone who actually has memberships to remove. */}
      {userId !== null && (
        <form action={revokeAndExcludeAction}>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="userId" value={userId} />
          <button type="submit" className={styles.optionDanger}>
            <span className={styles.optionTitleDanger}>
              Zugang entziehen und aus allen Projekten entfernen
            </span>
            <span className={styles.optionTextDanger}>
              Sofort und endgültig — erneutes Einladen bringt die Mitgliedschaften <b>nicht</b>{" "}
              zurück.
            </span>
          </button>
        </form>
      )}

      {ownedProjects.length > 0 && (
        <p className={styles.ownerHint}>
          Als Owner von {ownedProjects.map((project) => `„${project.name}“`).join(", ")} behält{" "}
          {displayName} dort in jedem Fall Zugriff.
        </p>
      )}

      <button type="button" className={styles.cancel} onClick={close}>
        Abbrechen
      </button>
    </Sheet>
  );
}
