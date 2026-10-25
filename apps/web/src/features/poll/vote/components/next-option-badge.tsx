"use client";

import { Badge } from "@rallly/ui/badge";
import { HourglassIcon } from "lucide-react";
import { Trans } from "@/i18n/client";
import { useDateTime } from "@/lib/datetime/client";
import { useHydrated } from "@/lib/datetime/use-hydrated";
import { getCalendarDate, toISODate } from "@/lib/datetime/utils";
import { getBrowserTimeZone } from "@/lib/utils/date-time-utils";

const DAY_MS = 24 * 60 * 60 * 1000;

type Option = { startTime: Date; duration: number };

/**
 * How soon the next option starts, so a participant can tell at a glance
 * whether answering is urgent. Same notion of "past" as the vote panel: a
 * time slot is past once it has ended, an all-day date once the viewer's
 * calendar date has moved on. Client only: it depends on the viewer's clock
 * and time zone.
 */
export function NextOptionBadge({ options }: { options: Option[] }) {
  const hydrated = useHydrated();
  const { toRelativeTime } = useDateTime();

  if (!hydrated || options.length === 0) {
    return null;
  }

  const now = Date.now();
  const today = getCalendarDate(new Date(now), getBrowserTimeZone());
  const isTimeSlot = (options[0]?.duration ?? 0) > 0;

  const upcoming = options
    .filter((option) =>
      isTimeSlot
        ? option.startTime.getTime() + option.duration * 60_000 >= now
        : toISODate(option.startTime) >= today,
    )
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())[0];

  let label: React.ReactNode;
  if (!upcoming) {
    label = (
      <Trans i18nKey="nextOptionNone" defaults="All options are in the past" />
    );
  } else if (isTimeSlot && upcoming.startTime.getTime() <= now) {
    label = <Trans i18nKey="nextOptionNow" defaults="An option is under way" />;
  } else if (!isTimeSlot && toISODate(upcoming.startTime) === today) {
    label = <Trans i18nKey="nextOptionToday" defaults="Next option is today" />;
  } else {
    // All-day dates count whole days, so "tomorrow" means the next calendar
    // date rather than 24 hours from now.
    const target = isTimeSlot
      ? upcoming.startTime
      : new Date(
          now +
            Math.round(
              (Date.parse(toISODate(upcoming.startTime)) - Date.parse(today)) /
                DAY_MS,
            ) *
              DAY_MS,
        );
    label = (
      <Trans
        i18nKey="nextOptionIn"
        defaults="Next option {relative}"
        values={{ relative: toRelativeTime(target) }}
      />
    );
  }

  return (
    <Badge
      data-testid="next-option-badge"
      variant={upcoming ? "amber" : "default"}
    >
      <HourglassIcon />
      {label}
    </Badge>
  );
}
