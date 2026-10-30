import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { prisma } from "@rallly/database";
import { fromNow } from "./test-utils";

// Continue stays gated on an untouched form, so nobody records a no to
// everything by accident. Answering no to every open option by hand is a
// real answer, and goes to the same dialog as Decline.

const createPoll = (id: string, startTimes: Date[]) =>
  prisma.poll.create({
    data: {
      id,
      title: "Explicit no",
      kind: "time",
      timeZone: "Europe/Paris",
      options: {
        create: startTimes.map((startTime) => ({ startTime, duration: 60 })),
      },
    },
  });

// Each click moves the selector on: yes, if need be, then no.
const answerNo = async (page: Page, index: number) => {
  const selector = page.getByTestId("vote-selector").nth(index);
  for (let click = 0; click < 3; click++) {
    await selector.click();
  }
};

test.describe("explicit no response", () => {
  const pollIds: string[] = [];

  const newPollId = () => {
    const id = crypto.randomUUID();
    pollIds.push(id);
    return id;
  };

  test.afterAll(async () => {
    await prisma.poll.deleteMany({ where: { id: { in: pollIds } } });
  });

  test("Continue stays gated on an untouched form", async ({ page }) => {
    const id = newPollId();
    await createPoll(id, [fromNow({ days: 1 }), fromNow({ days: 2 })]);

    await page.goto(`/invite/${id}`);
    await page.getByRole("button", { name: "Continue" }).click({ force: true });

    await expect(
      page.getByText("Select at least one option, or decline"),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Continue stays gated until every option is answered", async ({
    page,
  }) => {
    const id = newPollId();
    await createPoll(id, [fromNow({ days: 1 }), fromNow({ days: 2 })]);

    await page.goto(`/invite/${id}`);
    await answerNo(page, 0);
    await page.getByRole("button", { name: "Continue" }).click({ force: true });

    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("a no on every open option saves a response", async ({ page }) => {
    const id = newPollId();
    await createPoll(id, [fromNow({ days: -1 }), fromNow({ days: 1 })]);

    await page.goto(`/invite/${id}`);
    await answerNo(page, 0);
    await page.getByRole("button", { name: "Continue" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("You're not available")).toBeVisible();
    await dialog.getByLabel("Name").fill("Anne");
    await dialog.locator('button[type="submit"]').click();
    await expect(page.getByText("Your response has been saved")).toBeVisible();

    const votes = await prisma.vote.findMany({ where: { pollId: id } });
    expect(votes).toHaveLength(2);
    expect(votes.every((vote) => vote.type === "no")).toBe(true);
  });
});
