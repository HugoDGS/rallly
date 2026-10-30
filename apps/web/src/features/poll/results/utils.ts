type Score = { yes: number; ifNeedBe: number; no: number };

export type RankedOption<T> = T & {
  score: Score;
  /** Participants who can make it: yes and if need be together. */
  available: number;
  /** Participants who did not vote on this option. */
  noResponse: number;
  /** Shared by options that tie, so "1, 1, 3" rather than "1, 2, 3". */
  rank: number;
  isTopChoice: boolean;
};

/**
 * Options best first, with the same ordering as the poll results API: total
 * availability, then yes votes, then the earliest option. An option nobody
 * can attend is never a top choice.
 */
export function rankOptions<T extends { id: string; startTime: Date }>(
  options: T[],
  getScore: (optionId: string) => Score,
  participantCount: number,
): RankedOption<T>[] {
  const scored = options
    .map((option) => {
      const score = getScore(option.id);
      return {
        ...option,
        score,
        available: score.yes + score.ifNeedBe,
        noResponse: Math.max(
          0,
          participantCount - score.yes - score.ifNeedBe - score.no,
        ),
      };
    })
    .sort(
      (a, b) =>
        b.available - a.available ||
        b.score.yes - a.score.yes ||
        a.startTime.getTime() - b.startTime.getTime(),
    );

  const ranked: RankedOption<T>[] = [];
  for (const [index, option] of scored.entries()) {
    const previous = ranked[index - 1];
    const tiesPrevious =
      previous !== undefined &&
      previous.available === option.available &&
      previous.score.yes === option.score.yes;
    const rank = tiesPrevious ? previous.rank : index + 1;
    ranked.push({
      ...option,
      rank,
      isTopChoice: rank === 1 && option.available > 0,
    });
  }
  return ranked;
}
