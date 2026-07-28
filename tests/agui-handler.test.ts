import { describe, expect, it } from "vitest";
import { EventType, type RunAgentInput } from "@ag-ui/core";
import { runChiefEstimator } from "@/lib/agui/agent-handler";

const input: RunAgentInput = {
  threadId: "11111111-1111-4111-8111-111111111111",
  runId: "22222222-2222-4222-8222-222222222222",
  state: {},
  messages: [{ id: "33333333-3333-4333-8333-333333333333", role: "user", content: "Штукатурка 358 м² в Лениногорске, слой 15 мм" }],
  tools: [], context: [], forwardedProps: {}
};

describe("AG-UI chief estimator", () => {
  it("emits lifecycle, state and tool events in one run", async () => {
    const events = [];
    for await (const event of runChiefEstimator(input, new AbortController().signal)) events.push(event);
    expect(events[0]?.type).toBe(EventType.RUN_STARTED);
    expect(events[1]?.type).toBe(EventType.TEXT_MESSAGE_START);
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
    expect(events.some((event) => event.type === EventType.STATE_SNAPSHOT)).toBe(true);
    expect(events.some((event) => event.type === EventType.STATE_DELTA)).toBe(true);
    expect(events.flatMap((event) => event.type === EventType.TOOL_CALL_START ? [event.toolCallName] : [])).toEqual(["technology_card", "estimate_draft", "estimate_review"]);
  });

  it("does not create a fake plastering estimate for an unsupported domain", async () => {
    const roofing = {
      ...input,
      runId: "44444444-4444-4444-8444-444444444444",
      messages: [{ id: "55555555-5555-4555-8555-555555555555", role: "user" as const, content: "Смета на кровлю с демонтажом шифера" }]
    };
    const events = [];
    for await (const event of runChiefEstimator(roofing, new AbortController().signal)) events.push(event);
    expect(events.some((event) => event.type === EventType.TOOL_CALL_START)).toBe(false);
    expect(JSON.stringify(events)).toContain("unsupported-domain");
  });
});
