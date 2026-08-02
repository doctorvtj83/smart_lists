import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http/errors";
import { getProjectNav } from "@/lib/projects/nav";
import { requireOwner } from "@/lib/projects/guard";
import { addMember, listMembers, removeMember } from "@/lib/projects/membership";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { DrawerTrigger } from "@/components/nav/DrawerTrigger";
import { InviteForm, INVITE_FORM_IDLE, type InviteFormState } from "./InviteForm";
import { RemoveMemberButton } from "./RemoveMemberButton";
import styles from "./page.module.css";

// Next.js 16: dynamic route params are a Promise in server components.
type Props = { params: Promise<{ projectId: string }> };

/**
 * The Mitglieder screen (handoff screen 3i).
 *
 * Read-only for members: the design says the owner-only controls are simply not
 * rendered, never disabled — so a member sees the roster and nothing else.
 */
export default async function MembersPage({ params }: Props) {
  const { projectId } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const nav = await getProjectNav(prisma, projectId, userId);
  if (!nav) redirect("/projects");

  const isOwner = nav.role === "owner";
  const members = await listMembers(prisma, projectId);

  /**
   * Invite by email. Owner-only.
   *
   * RETURNS its error instead of throwing, because useActionState is what puts
   * the message inline on the field that caused it. Only ApiError carries
   * user-facing German copy — anything else is a real bug and is re-thrown on
   * purpose (the toFormState rule from the catalog screen).
   */
  async function inviteAction(
    _prev: InviteFormState,
    formData: FormData,
  ): Promise<InviteFormState> {
    "use server";
    const s = await auth();
    await requireOwner(prisma, projectId, s!.user.id);

    const email = String(formData.get("email") ?? "").trim();
    if (!email) return INVITE_FORM_IDLE; // Silent no-op on an empty submission.

    try {
      await addMember(prisma, { projectId, email });
    } catch (error) {
      if (error instanceof ApiError) return { error: error.message };
      throw error;
    }

    // "layout" scope: the drawer prints the member count too.
    revalidatePath(`/projects/${projectId}/mitglieder`, "layout");
    return INVITE_FORM_IDLE;
  }

  /**
   * Remove a member. Owner-only. removeMember refuses to remove the owner
   * (403) — the button is not rendered for the owner row anyway, but the guard
   * is what actually enforces it.
   */
  async function removeMemberAction(formData: FormData) {
    "use server";
    const s = await auth();
    await requireOwner(prisma, projectId, s!.user.id);

    const memberUserId = String(formData.get("userId") ?? "");
    if (!memberUserId) return;

    await removeMember(prisma, { projectId, userId: memberUserId });
    revalidatePath(`/projects/${projectId}/mitglieder`, "layout");
  }

  return (
    <>
      <PageHeader title="Mitglieder" leading={<DrawerTrigger />} />
      <main className={styles.content}>
        <Card>
          <ul className={styles.rows}>
            {members.map((membership) => {
              // The display name only exists after the first login; the email is
              // always there, so it is the fallback for both the row and the
              // confirmation sheet.
              const label = membership.user.displayName ?? membership.user.email;
              const isSelf = membership.userId === userId;
              return (
                <li key={membership.id} className={styles.row}>
                  <Avatar name={label} size={30} />
                  <span className={styles.text}>
                    <span className={styles.name}>
                      {label}
                      {isSelf ? " (du)" : ""}
                    </span>
                    <span className={styles.email}>{membership.user.email}</span>
                  </span>
                  {membership.role === "owner" && <Badge>OWNER</Badge>}
                  {/* Never for the owner (they cannot be removed) and never in a
                      member's view — not rendered, not disabled. */}
                  {isOwner && membership.role !== "owner" && (
                    <RemoveMemberButton
                      memberLabel={label}
                      userId={membership.userId}
                      removeAction={removeMemberAction}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        {isOwner && <InviteForm action={inviteAction} />}
      </main>
    </>
  );
}
