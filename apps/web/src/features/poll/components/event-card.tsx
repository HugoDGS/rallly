"use client";
import { cn } from "@rallly/ui";
import { Card, CardContent } from "@rallly/ui/card";
import { MapPinIcon, User2Icon } from "lucide-react";
import { RandomGradientBar } from "@/components/random-gradient-bar";
import { useBranding } from "@/features/branding/client";
import { PollConferencingSummary } from "@/features/conferencing/components/poll-conferencing-summary";
import { useInstancePolicy } from "@/features/instance-policy/client";
import { useParticipants, usePoll, useRole } from "@/features/poll/client";
import {
  EventMetaDescription,
  EventMetaItem,
  EventMetaList,
  EventMetaTitle,
} from "@/features/poll/components/event-meta";
import { ParticipationRate } from "@/features/poll/components/participation-rate";
import TruncatedLinkify from "@/features/poll/components/truncated-linkify";
import { IfScoresVisible } from "@/features/poll/components/visibility";
import VoteIcon from "@/features/poll/components/vote-icon";
import { SpaceIcon } from "@/features/space/components/space-icon";
import { useUser } from "@/features/user/client";
import { Trans } from "@/i18n/client";
import { trpc } from "@/trpc/client";

function IconDescriptionList({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDListElement>) {
  return (
    <dl
      className={cn("flex flex-wrap items-center gap-4 text-xs", className)}
      {...props}
    >
      {children}
    </dl>
  );
}

function IconDescription({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <dt>{icon}</dt>
      <dd>{label}</dd>
    </div>
  );
}

/**
 * Responses so far, against the invites when the viewer is a signed-in host
 * (invites are not exposed to participants or guest hosts).
 */
function PollParticipationRate() {
  const poll = usePoll();
  const { participants } = useParticipants();
  const role = useRole();
  const { user } = useUser();
  const canListInvites = role === "admin" && !!user && !user.isGuest;
  // Same query as the invite dialog, so the count updates when it sends one.
  const invitesQuery = trpc.polls.invites.list.useQuery(
    { pollId: poll.id },
    { enabled: canListInvites },
  );

  return (
    <ParticipationRate
      voterCount={participants.length}
      inviteCount={canListInvites ? invitesQuery.data?.length : null}
    />
  );
}

/**
 * The event's identity: branding chip, title, description, organizer and
 * location. `EventCard` frames it as a standalone card with the response
 * legend; the vote page places it in the sidebar of the merged card.
 */
export function EventDetails() {
  const poll = usePoll();
  const branding = useBranding();
  const { spaceBrandingAllowed } = useInstancePolicy();
  return (
    <>
      {poll.space?.showBranding && poll.space.image ? (
        <div className="mb-2">
          <SpaceIcon name={poll.space.name} src={poll.space.image} size="xl" />
          <p className="mt-2 font-medium text-muted-foreground text-sm">
            {poll.space.name}
          </p>
        </div>
      ) : !spaceBrandingAllowed ? (
        // Instance branding is enforced: the space chip is suppressed, so
        // the slot carries the instance's logo icon and name instead
        <div className="mb-2">
          <SpaceIcon
            name={branding.appName}
            src={branding.logoIcon}
            size="xl"
          />
          <p className="mt-2 font-medium text-muted-foreground text-sm">
            {branding.appName}
          </p>
        </div>
      ) : null}
      <EventMetaTitle>{poll.title}</EventMetaTitle>
      {/* Hidden like the scores until the viewer has voted, as on the vote
          page. The admin page has no visibility provider, so the host always
          sees it. */}
      <IfScoresVisible>
        <div className="mt-2">
          <PollParticipationRate />
        </div>
      </IfScoresVisible>
      <EventMetaDescription className="mt-4" content={poll.description} />
      <EventMetaList className="mt-4">
        {poll.user ? (
          <EventMetaItem>
            <User2Icon />
            <Trans
              i18nKey="organizedBy"
              defaults="Organized by {name}"
              values={{ name: poll.user.name }}
            />
          </EventMetaItem>
        ) : null}
        {poll.location ? (
          <EventMetaItem>
            <MapPinIcon />
            <TruncatedLinkify>{poll.location}</TruncatedLinkify>
          </EventMetaItem>
        ) : null}
        {poll.conferencing ? (
          <EventMetaItem>
            <PollConferencingSummary
              conferencing={poll.conferencing}
              meetingUri={poll.event?.conferencingUri}
            />
          </EventMetaItem>
        ) : null}
      </EventMetaList>
    </>
  );
}

export function EventCard() {
  const poll = usePoll();
  return (
    <Card>
      <RandomGradientBar />
      <CardContent>
        <EventDetails />
        <h2 className="mt-4 mb-1.5 text-muted-foreground text-xs">
          <Trans i18nKey="responseOptions" defaults="Response options" />
        </h2>
        <IconDescriptionList aria-label="Response options">
          <IconDescription
            icon={<VoteIcon type="yes" />}
            label={<Trans i18nKey="yes" defaults="Yes" />}
          />
          {poll.allowTentativeVotes ? (
            <IconDescription
              icon={<VoteIcon type="ifNeedBe" />}
              label={<Trans i18nKey="ifNeedBe" defaults="If need be" />}
            />
          ) : null}
          <IconDescription
            icon={<VoteIcon type="no" />}
            label={<Trans i18nKey="no" defaults="No" />}
          />
        </IconDescriptionList>
      </CardContent>
    </Card>
  );
}
