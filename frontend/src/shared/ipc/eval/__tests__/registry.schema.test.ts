import { describe, it, expect } from "vitest";
import { ToolTaskSchema } from "../registry";

/// A verbatim serialization of the FIRST task of the bundled `easy-coding` v2
/// scenario (from `get_builtin_collection`). This is the exact shape the backend
/// hands the frontend; the schema must accept it or the whole Built-in picker goes
/// blank (init throws → presets stay empty → the page is stuck on "Custom JSON").
const EASY_CODING_TASK = {
  id: "es_co_run_failing_test",
  category: "agent_loop",
  prompt: "Run the test suite for module 'cart'. If it fails, read the failing test file and report which test failed. Do not edit any source.",
  tools: [
    { name: "run_tests", description: "Agent tool 'run_tests'.", parameters: { type: "object", properties: { module: { type: "string" } } } },
    { name: "read_file", description: "Agent tool 'read_file'.", parameters: { type: "object", properties: { path: { type: "string" } } } },
    { name: "reply", description: "Agent tool 'reply'.", parameters: { type: "object", properties: { text: { type: "string" } } } },
    { name: "write_file", description: "Agent tool 'write_file'.", parameters: { type: "object", properties: { content: { type: "string" }, path: { type: "string" } } } },
  ],
  expected: { type: "no_call" },
  agentic: {
    mocks: [],
    end_state: {
      require_all: [
        { tool: "run_tests", args: { module: "cart" } },
        { tool: "read_file", args: { path: "*test*" } },
        { tool: "reply", args: { text: "*test_total_with_tax*" } },
      ],
    },
    axes: { min_required_steps: 3, decoy_tools: 1, hidden_prereqs: 0, conflicting_constraints: 1, adversarial_context: false },
    k: 5,
    max_steps: 7,
    max_recovery: 2,
    must_not_call: ["write_file"],
    world_state: { cart_tests: { failing: "test_total_with_tax", result: "fail" } },
  },
};

describe("ToolTaskSchema — bundled v2 (agent_loop) scenarios", () => {
  it("accepts a real `require_all` end-state (the shape every v2 built-in uses)", () => {
    expect(() => ToolTaskSchema.parse(EASY_CODING_TASK)).not.toThrow();
  });

  it("PRESERVES the v2 oracle/trap fields so the task round-trips back to run_batch_eval", () => {
    // The frontend hands the parsed task straight back to the backend; if zod strips
    // world_state / must_not_call, the run loses its ground-truth + traps and fails.
    const parsed = ToolTaskSchema.parse(EASY_CODING_TASK);
    expect(parsed.agentic?.world_state).toEqual({ cart_tests: { failing: "test_total_with_tax", result: "fail" } });
    expect(parsed.agentic?.must_not_call).toEqual(["write_file"]);
  });

  it("PRESERVES `environment` so a filesystem task round-trips and the fs env activates", () => {
    // Regression: `environment` was missing from the schema → z.object() stripped it on the
    // round-trip → the backend re-received it as Entity → the fs env never activated
    // (read_file acked empty, no visual replay). It must survive verbatim.
    const fsTask = {
      ...EASY_CODING_TASK,
      id: "es_fs_read_config",
      agentic: { ...EASY_CODING_TASK.agentic, environment: "filesystem", world_state: { "config.yaml": "timeout: 30\n" } },
    };
    const parsed = ToolTaskSchema.parse(fsTask);
    expect(parsed.agentic?.environment).toBe("filesystem");
  });

  it("PRESERVES a `require_end_state` end_state so a web-UI task's state-diff grader round-trips", () => {
    // Same bug class as `environment`: if EndStateRuleSchema lacks the require_end_state variant,
    // z.union strips it on the round-trip → the backend re-receives a different end_state and the
    // grader breaks. The target must survive verbatim.
    const target = { fields: { coupon: "SAVE10" }, submitted: true };
    const webUiTask = {
      ...EASY_CODING_TASK,
      id: "es_wu_apply_coupon",
      agentic: { ...EASY_CODING_TASK.agentic, environment: "web_ui", end_state: { require_end_state: target } },
    };
    const parsed = ToolTaskSchema.parse(webUiTask);
    expect(parsed.agentic?.end_state).toEqual({ require_end_state: target });
  });
});
