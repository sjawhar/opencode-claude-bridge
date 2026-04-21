import { describe, expect, test } from "bun:test";
import path from "node:path";
import { translateCommandFile } from "../src/command-translator";
import { createLogger } from "../src/logger";

const logger = createLogger(undefined);
const fixture = path.join(
  import.meta.dir,
  "fixtures/sjawhar/commands/no-excuses.md",
);

describe("translateCommandFile", () => {
  test("wraps body in command-instruction + user-request envelope", async () => {
    const result = await translateCommandFile(
      fixture,
      { namespace: "sjawhar" },
      logger,
    );
    expect(result?.name).toBe("sjawhar-no-excuses");
    expect(result?.config.description).toBe(
      "Reject excuse-making in the current turn and refocus on the goal.",
    );
    expect(result?.config.template).toBe(
      "<command-instruction>\n" +
        'The user has invoked no-excuses. Reread AGENTS.md "No Excuses" section and course-correct.\n' +
        "</command-instruction>\n\n" +
        "<user-request>\n$ARGUMENTS\n</user-request>",
    );
  });

  test("drops argument-hint and does not leak it into config", async () => {
    const result = await translateCommandFile(fixture, {}, logger);
    expect(result?.config).not.toHaveProperty("argumentHint");
    expect(result?.config).not.toHaveProperty("argument-hint");
  });

  test("returns null for missing file", async () => {
    const result = await translateCommandFile("/nope.md", {}, logger);
    expect(result).toBeNull();
  });
});
