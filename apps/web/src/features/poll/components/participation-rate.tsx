"use client";

import { Progress } from "@rallly/ui/progress";
import { UsersIcon } from "lucide-react";
import { Trans } from "@/i18n/client";

/**
 * How many people have responded, under the poll title. With invites (only
 * the host can see them) it reads as a share of the invitees with a bar;
 * without, it is just the count. Responses through the generic link are not
 * tied to an invite, so voters can outnumber invitees: the bar then stays
 * full rather than overflowing.
 */
export function ParticipationRate({
  voterCount,
  inviteCount,
}: {
  voterCount: number;
  /** Non revoked invites; null when the viewer cannot see them. */
  inviteCount?: number | null;
}) {
  const hasInvites = inviteCount != null && inviteCount > 0;

  return (
    <div data-testid="participation-rate" className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-muted-foreground text-sm">
        <UsersIcon className="size-4" />
        {hasInvites ? (
          <Trans
            i18nKey="participationRateOfInvites"
            defaults="{voterCount, plural, one {# voter} other {# voters}} out of {inviteCount, plural, one {# invitee} other {# invitees}}"
            values={{ voterCount, inviteCount }}
          />
        ) : (
          <Trans
            i18nKey="participationRateVoters"
            defaults="{count, plural, =0 {No voters yet} one {# voter} other {# voters}}"
            values={{ count: voterCount }}
          />
        )}
      </p>
      {hasInvites ? (
        <Progress
          aria-hidden="true"
          className="max-w-48"
          value={Math.min(100, (voterCount / inviteCount) * 100)}
        />
      ) : null}
    </div>
  );
}
