"use client";

import { cn } from "@rallly/ui";
import { Badge } from "@rallly/ui/badge";
import { Button } from "@rallly/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@rallly/ui/card";
import { ChartBarIcon, TrophyIcon } from "lucide-react";
import React from "react";
import { useParticipants } from "@/features/poll/client";
import { useOptions } from "@/features/poll/components/poll-context";
import { usePollScores } from "@/features/poll/components/use-poll-scores";
import { IfScoresVisible } from "@/features/poll/components/visibility";
import type { RankedOption } from "@/features/poll/results/utils";
import { rankOptions } from "@/features/poll/results/utils";
import { Trans, useTranslation } from "@/i18n/client";
import { getOptionDateTimeLabel } from "@/lib/utils/date-time-utils";

/** Enough to see the leaders without scrolling past a long poll. */
const COLLAPSED_COUNT = 5;

const SEGMENTS = [
  { key: "yes", className: "bg-green-500" },
  { key: "ifNeedBe", className: "bg-amber-400" },
  { key: "no", className: "bg-zinc-400 dark:bg-zinc-500" },
  { key: "noResponse", className: "bg-gray-200 dark:bg-gray-700" },
] as const;

type SegmentKey = (typeof SEGMENTS)[number]["key"];

function segmentCount(option: RankedOption<object>, key: SegmentKey) {
  return key === "noResponse" ? option.noResponse : option.score[key];
}

function Legend({ showTentative }: { showTentative: boolean }) {
  const labels: Record<SegmentKey, React.ReactNode> = {
    yes: <Trans i18nKey="yes" defaults="Yes" />,
    ifNeedBe: <Trans i18nKey="ifNeedBe" defaults="If need be" />,
    no: <Trans i18nKey="no" defaults="No" />,
    noResponse: (
      <Trans i18nKey="resultsAnalysisNoResponse" defaults="No response" />
    ),
  };
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
      {SEGMENTS.filter(
        (segment) => showTentative || segment.key !== "ifNeedBe",
      ).map((segment) => (
        <li key={segment.key} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-sm", segment.className)} />
          {labels[segment.key]}
        </li>
      ))}
    </ul>
  );
}

/**
 * A stacked bar per option: yes, if need be, no, then participants who did
 * not answer this option, each as a share of everyone who responded.
 */
function StackedBar({
  option,
  participantCount,
}: {
  option: RankedOption<object>;
  participantCount: number;
}) {
  return (
    <div
      aria-hidden="true"
      className="flex h-2.5 overflow-hidden rounded-sm bg-gray-100 dark:bg-gray-800"
    >
      {SEGMENTS.map((segment) => {
        const count = segmentCount(option, segment.key);
        return count > 0 ? (
          <div
            key={segment.key}
            className={cn("h-full", segment.className)}
            style={{ width: `${(count / participantCount) * 100}%` }}
          />
        ) : null;
      })}
    </div>
  );
}

/**
 * The poll's options ranked best first, so the host can pick a date without
 * reading the whole grid: a summary of the leader, then each option's place,
 * availability and vote breakdown as a stacked bar chart.
 */
export function ResultsAnalysis() {
  const { t } = useTranslation();
  const { poll, getScore } = usePollScores();
  const { participants } = useParticipants();
  const { options: parsedOptions } = useOptions();
  const [expanded, setExpanded] = React.useState(false);

  const participantCount = participants.length;
  const ranked = React.useMemo(
    () => rankOptions(poll.options, getScore, participantCount),
    [poll.options, getScore, participantCount],
  );
  const labels = React.useMemo(
    () =>
      new Map(
        parsedOptions.map((option) => [
          option.optionId,
          getOptionDateTimeLabel(option),
        ]),
      ),
    [parsedOptions],
  );

  if (ranked.length === 0) {
    return null;
  }

  // Tentative votes cast before the option was turned off still show.
  const showTentative =
    poll.allowTentativeVotes || ranked.some((o) => o.score.ifNeedBe > 0);
  const best = ranked[0];
  const visible = expanded ? ranked : ranked.slice(0, COLLAPSED_COUNT);

  return (
    <IfScoresVisible>
      <Card data-testid="results-analysis">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChartBarIcon className="size-4 text-muted-foreground" />
            <Trans i18nKey="resultsAnalysisTitle" defaults="Results analysis" />
          </CardTitle>
          <CardDescription>
            <Trans
              i18nKey="resultsAnalysisDescription"
              defaults="Options ranked by how many participants can make it"
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 border-t">
          {participantCount === 0 ? (
            <p className="text-muted-foreground text-sm">
              <Trans
                i18nKey="resultsAnalysisEmpty"
                defaults="The ranking will show up here once participants vote."
              />
            </p>
          ) : (
            <>
              {best?.isTopChoice ? (
                <div className="flex items-start gap-3 rounded-lg bg-green-500/10 p-3">
                  <TrophyIcon className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                  <p className="text-sm">
                    <Trans
                      i18nKey="resultsAnalysisBest"
                      defaults="<b>{label}</b> works for {available} of {total} participants"
                      values={{
                        label: labels.get(best.id) ?? "",
                        available: best.available,
                        total: participantCount,
                      }}
                      components={{ b: <strong /> }}
                    />
                  </p>
                </div>
              ) : null}
              <Legend showTentative={showTentative} />
              <ol className="space-y-3">
                {visible.map((option) => (
                  <li
                    key={option.id}
                    className="space-y-1.5"
                    aria-label={t("resultsAnalysisOptionLabel", {
                      defaultValue:
                        "#{rank} {label}: {yes} yes, {ifNeedBe} if need be, {no} no, {noResponse} no response",
                      rank: option.rank,
                      label: labels.get(option.id) ?? "",
                      yes: option.score.yes,
                      ifNeedBe: option.score.ifNeedBe,
                      no: option.score.no,
                      noResponse: option.noResponse,
                    })}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-6 shrink-0 text-muted-foreground tabular-nums">
                        #{option.rank}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          option.isTopChoice && "font-medium",
                        )}
                      >
                        {labels.get(option.id)}
                      </span>
                      {option.isTopChoice ? (
                        <Badge variant="green">
                          <Trans
                            i18nKey="resultsAnalysisTopChoice"
                            defaults="Top choice"
                          />
                        </Badge>
                      ) : null}
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {option.available}/{participantCount}
                      </span>
                    </div>
                    <div className="pl-8">
                      <StackedBar
                        option={option}
                        participantCount={participantCount}
                      />
                    </div>
                  </li>
                ))}
              </ol>
              {ranked.length > COLLAPSED_COUNT ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded ? (
                    <Trans
                      i18nKey="resultsAnalysisShowLess"
                      defaults="Show top {count}"
                      values={{ count: COLLAPSED_COUNT }}
                    />
                  ) : (
                    <Trans
                      i18nKey="resultsAnalysisShowAll"
                      defaults="Show all {count} options"
                      values={{ count: ranked.length }}
                    />
                  )}
                </Button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </IfScoresVisible>
  );
}
