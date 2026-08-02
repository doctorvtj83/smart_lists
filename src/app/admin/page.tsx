import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TextField } from "@/components/ui/TextField";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/auth/normalize";
import {
  excludeFromAllProjects,
  inviteEmail,
  listAccessEntries,
  listProjectAccess,
  revokeEmail,
  setAdmin,
} from "@/lib/admin/admin";
import styles from "./page.module.css";

// Next.js 16: searchParams is a Promise in server components. Typed with the framework's own wide
// value type (a query key can repeat, which yields string[]) so the generated PageProps check
// accepts it; the two params we use are narrowed to a single string right after the await.
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Reads one query parameter as a single string. A repeated key ("?revoke=a&revoke=b") arrives as an
// array — we ignore those instead of guessing which one the admin meant.
function singleParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// Server Component: reads the session and calls the domain layer directly — no HTTP round-trip, no
// client component, no client state (the pattern from projects/[projectId]/page.tsx).
//
// This slice deliberately ships NO REST endpoints: the allowlist is never polled and never merged
// offline, so the reason the rest of the app has an operations/REST layer does not apply (design §2).
// The domain layer stays the seam if an API is ever needed.
export default async function AdminPage({ searchParams }: Props) {
  // The guard runs FIRST, before any read. requireAdmin throws 401 without a session and 403 for a
  // non-admin; both mean "this page does not exist for you", so we redirect instead of rendering an
  // error screen — mirroring the "non-members are redirected, not told 403" rule from Slice 2.
  // .catch(() => redirect(...)) rather than try/catch: redirect() returns `never`, so the awaited
  // type stays a plain string with no non-null assertion.
  const callerId = await requireAdmin(prisma).catch(() => redirect("/projects"));

  const params = await searchParams;
  const revokeParam = singleParam(params.revoke);
  const ownedParam = singleParam(params.owned);

  // The access table itself; also the lookup for the confirmation panel below, so it is read once.
  const entries = await listAccessEntries(prisma);

  // --- Server Actions -------------------------------------------------------------------------
  // Every action re-derives identity AND re-checks admin rights via requireAdmin (defense in depth):
  // a Server Action is an individually addressable POST endpoint, so a crafted request could call it
  // without ever rendering this page. The hidden fields below are convenience, never authorization.
  // Errors propagate as thrown ApiErrors with German messages — the same behavior as Slice 2's
  // invite action ("Nutzer nicht gefunden"), which is the established convention for this app.

  async function inviteAction(formData: FormData) {
    "use server";
    const adminId = await requireAdmin(prisma);
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return; // Ignore empty submissions silently (same convention as the other forms).
    await inviteEmail(prisma, { email, invitedBy: adminId });
    revalidatePath("/admin");
  }

  async function setAdminAction(formData: FormData) {
    "use server";
    const adminId = await requireAdmin(prisma);
    const userId = String(formData.get("userId") ?? "");
    if (!userId) return;
    // The form sends the TARGET state, not a toggle, so a stale page cannot flip the flag to the
    // opposite of what the admin saw and clicked.
    const isAdmin = formData.get("isAdmin") === "true";
    await setAdmin(prisma, { userId, isAdmin, callerId: adminId });
    revalidatePath("/admin");
  }

  // "Nur Zugang entziehen": the reversible intent — the allowlist row goes, memberships stay.
  async function revokeOnlyAction(formData: FormData) {
    "use server";
    const adminId = await requireAdmin(prisma);
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return;
    await revokeEmail(prisma, { email, callerId: adminId });
    // redirect() leaves the ?revoke= confirmation view and re-renders the table.
    redirect("/admin");
  }

  // "Zugang entziehen und aus allen Projekten entfernen": the immediate intent. Not reversible by
  // re-inviting — the memberships are gone and the project owners have to invite the person again.
  async function revokeAndExcludeAction(formData: FormData) {
    "use server";
    const adminId = await requireAdmin(prisma);
    const email = String(formData.get("email") ?? "").trim();
    const userId = String(formData.get("userId") ?? "");
    if (!email || !userId) return;
    // Revoke first: if the exclusion failed halfway, the person would at least be locked out of new
    // logins, which is the weaker but safer partial state of the two.
    await revokeEmail(prisma, { email, callerId: adminId });
    const result = await excludeFromAllProjects(prisma, { userId });
    // Projects the person OWNS keep their membership by design, and that is the one genuinely
    // surprising outcome of this flow — so the page has to say so. We pass only the user id and
    // re-read the surviving memberships on render instead of smuggling project names through the URL.
    redirect(result.ownedProjects.length > 0 ? `/admin?owned=${userId}` : "/admin");
  }

  // --- Two-step revoke: ?revoke=<email> renders a confirmation panel INSTEAD of the table --------
  // A URL parameter rather than a dialog keeps this page free of client components, matching how the
  // rest of the app is built. The admin has to state their INTENT here — the two revocation variants
  // differ in whether project access ends now or is left reversible (design §6).
  if (revokeParam) {
    const normalized = normalizeEmail(revokeParam);
    const entry = entries.find((e) => e.email === normalized);

    // Stale link, or already revoked in another tab: say so rather than render an empty panel.
    if (!entry) {
      return (
        <main style={{ padding: 24 }}>
          <p>
            <Link href="/admin">← Zurück zur Verwaltung</Link>
          </p>
          <p>Diese E-Mail steht nicht (mehr) auf der Zugangsliste.</p>
        </main>
      );
    }

    // A Membership needs a user id, so somebody who has never signed in cannot be in any project —
    // the panel then skips the project section and both intents collapse into one plain revoke.
    const projects = entry.user ? await listProjectAccess(prisma, entry.user.id) : [];

    return (
      <main style={{ padding: 24 }}>
        <p>
          <Link href="/admin">← Zurück zur Verwaltung</Link>
        </p>
        <h1>Zugang entziehen</h1>
        <p>
          <strong>{entry.email}</strong>
        </p>
        {/* Honest wording: state the JWT limitation instead of implying an instant cut-off. */}
        <p>
          Ein neuer Login ist danach nicht mehr möglich. Eine bereits laufende Sitzung bleibt aktiv,
          bis sie abläuft.
        </p>

        {entry.user ? (
          <>
            <h2>Projekte dieser Person</h2>
            {projects.length === 0 ? (
              <p>Diese Person ist in keinem Projekt.</p>
            ) : (
              <ul>
                {projects.map((p) => (
                  <li key={p.projectId}>
                    {p.name} ({p.role === "owner" ? "Owner" : "Mitglied"})
                  </li>
                ))}
              </ul>
            )}

            <h2>Nur Zugang entziehen</h2>
            <p>
              Umkehrbar: Die Projektmitgliedschaften bleiben bestehen. Eine erneute Einladung stellt
              die Person in ihren Projekten wieder her.
            </p>
            <form action={revokeOnlyAction}>
              <input type="hidden" name="email" value={entry.email} />
              <button type="submit">Nur Zugang entziehen</button>
            </form>

            <h2>Zugang entziehen und aus allen Projekten entfernen</h2>
            <p>
              Sofort wirksam: Der Zugriff auf die oben genannten Projekte endet mit der nächsten
              Aktion dieser Person. Projekte, die ihr selbst gehören, bleiben bestehen. Nicht
              umkehrbar – eine erneute Einladung bringt die Person ohne Projekte zurück.
            </p>
            <form action={revokeAndExcludeAction}>
              <input type="hidden" name="email" value={entry.email} />
              <input type="hidden" name="userId" value={entry.user.id} />
              <button type="submit">Zugang entziehen und aus allen Projekten entfernen</button>
            </form>
          </>
        ) : (
          <>
            <p>
              Diese Person hat sich noch nie angemeldet und kann daher in keinem Projekt Mitglied
              sein.
            </p>
            <form action={revokeOnlyAction}>
              <input type="hidden" name="email" value={entry.email} />
              <button type="submit">Zugang entziehen</button>
            </form>
          </>
        )}
      </main>
    );
  }

  // --- Main view: the access table + the invite form --------------------------------------------
  // After an exclusion that skipped owner projects, ?owned=<userId> makes us re-read what survived,
  // so the admin learns which projects still give that person access.
  const stillOwned = ownedParam ? await listProjectAccess(prisma, ownedParam) : [];

  return (
    <>
      <PageHeader title="Verwaltung" trailing={<Badge>ADMIN</Badge>} />
      <main className={styles.content}>
        {/* Shown once, right after an exclusion that skipped owner projects: the one
            genuinely surprising outcome of that flow (Slice 9). */}
        {stillOwned.length > 0 && (
          <Banner tone="info">
            Die Person besitzt weiterhin{" "}
            {stillOwned.map((p) => `„${p.name}“`).join(", ")} und hat dort weiter Zugriff. Löse das,
            indem du das Projekt löschst oder es jemand anderem überträgst.
          </Banner>
        )}

        <SectionLabel>ZUGANG</SectionLabel>
        <Card>
          {entries.map((entry) => {
            // The caller's own row renders without buttons. This is UI courtesy only — the
            // invariants that actually prevent a lockout live in the domain layer (design §6).
            const isSelf = entry.user?.id === callerId;
            // No User row means: invited, but never signed in (JIT provisioning, Slice 1).
            // displayName is nullable even for a real user, hence the second fallback.
            const status = entry.user
              ? (entry.user.displayName ?? "Angemeldet")
              : "Noch nie angemeldet";

            return (
              <div key={entry.email} className={styles.entry}>
                <div className={styles.entryTop}>
                  <span className={styles.email}>
                    {entry.email}
                    {isSelf && <span className={styles.self}> (du)</span>}
                  </span>
                  {/* Admin rights live on User, not on the allowlist email — there is
                      nothing to flag before that person's first login. */}
                  {entry.user && !isSelf && (
                    <form action={setAdminAction}>
                      <input type="hidden" name="userId" value={entry.user.id} />
                      {/* The form sends the TARGET state, not a toggle, so a stale page cannot
                          flip the flag to the opposite of what the admin saw and clicked. */}
                      <input
                        type="hidden"
                        name="isAdmin"
                        value={entry.user.isAdmin ? "false" : "true"}
                      />
                      <button type="submit" className={styles.rowAction}>
                        {entry.user.isAdmin ? "Admin entziehen" : "Admin gewähren"}
                      </button>
                    </form>
                  )}
                  {isSelf && (
                    <span className={styles.adminState}>
                      Admin: {entry.user?.isAdmin ? "Ja" : "Nein"}
                    </span>
                  )}
                </div>
                <div className={styles.entryBottom}>
                  <span className={styles.status}>
                    {entry.user
                      ? `${status} · Admin: ${entry.user.isAdmin ? "Ja" : "Nein"}`
                      : "Noch nie angemeldet · Admin erst nach erstem Login möglich"}
                  </span>
                  {!isSelf && (
                    // A link, not a form: revoking is a two-step flow, and this step only OPENS the
                    // confirmation sheet. encodeURIComponent because an email contains characters
                    // (+, @) that must not be reinterpreted as query syntax.
                    <Link
                      href={`/admin?revoke=${encodeURIComponent(entry.email)}`}
                      className={styles.rowActionDanger}
                    >
                      Zugang entziehen
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </Card>

        <div className={styles.spaced}>
          <SectionLabel>E-MAIL EINLADEN</SectionLabel>
        </div>
        <form action={inviteAction} className={styles.inviteRow}>
          <div className={styles.inviteField}>
            <TextField name="email" type="email" placeholder="E-Mail-Adresse" aria-label="E-Mail-Adresse" />
          </div>
          <Button type="submit">Einladen</Button>
        </form>
        {/* An invitation is a database row, nothing more: the project has no mail capability, so the
            person has to be told out of band (design §2). */}
        <p className={styles.hint}>
          Es wird keine Einladungs-E-Mail versendet — sag der Person selbst Bescheid.
        </p>
      </main>
    </>
  );
}
