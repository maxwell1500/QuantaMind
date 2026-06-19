import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { VerdictTable } from "../components/VerdictTable";
import type { ModelVerdict } from "../../../shared/ipc/eval/readiness";

const GIB = 1024 ** 3;

const VERDICTS: ModelVerdict[] = [
  {
    model: "qwen2.5-coder",
    backend: "ollama",
    verdict: { status: "ready", blocking: [], conditions: [], path: "prompt_based" },
    memory: {
      weights_bytes: 5 * GIB,
      kv_cache_bytes: 1 * GIB,
      total_bytes: 6 * GIB,
      cap_bytes: 24 * GIB,
      context_length: 8192,
      fits: true,
      pressure: false,
    },
  },
  {
    model: "phi3.5",
    backend: "ollama",
    verdict: {
      status: "not_ready",
      blocking: ["pass^k 0.40 < 0.80 required", "loops on 2 runs"],
      conditions: [],
      path: "prompt_based",
    },
  },
  {
    model: "mistral-nemo",
    backend: "llama_cpp",
    verdict: {
      status: "conditional",
      blocking: [],
      conditions: ["slow: 8400ms/step > 5000ms target"],
      path: "prompt_based",
    },
  },
];

describe("VerdictTable", () => {
  it("renders a status badge per model with the measured path label", () => {
    render(<VerdictTable verdicts={VERDICTS} />);
    expect(screen.getByTestId("readiness-badge-ready")).toHaveTextContent("READY");
    expect(screen.getByTestId("readiness-badge-not_ready")).toHaveTextContent("NOT READY");
    expect(screen.getByTestId("readiness-badge-conditional")).toHaveTextContent("CONDITIONAL");
    // Path transparency: prompt-based, never silently presented as native.
    expect(screen.getByTestId("readiness-row-qwen2.5-coder")).toHaveTextContent("Prompt-Based");
  });

  it("shows the exact interpolated blocking math, not a bare 'failed'", () => {
    render(<VerdictTable verdicts={VERDICTS} />);
    const row = screen.getByTestId("readiness-row-phi3.5");
    expect(row).toHaveTextContent("✗ pass^k 0.40 < 0.80 required");
    expect(row).toHaveTextContent("✗ loops on 2 runs");
  });

  it("renders BLOCKING badges with a ✗ failure marker (never a literal 'X') and the real run counts in Details", () => {
    render(<VerdictTable verdicts={VERDICTS} />);
    const row = screen.getByTestId("readiness-row-phi3.5");
    // The visible badge is a category tag with a ✗ cross — not an ambiguous capital "X".
    expect(row).toHaveTextContent("BLOCKING: [✗ Reliability] [✗ Loops]");
    expect(row).not.toHaveTextContent("[X Reliability]");
    // The Details line surfaces the exact measured counts the backend reported, never "some runs".
    expect(row).toHaveTextContent("Pass^k (0.40) < 0.80");
    expect(row).toHaveTextContent("Loops on 2 runs");
  });

  it("categorizes every backend blocking reason — never the meaningless 'System' fallback", () => {
    const verdicts: ModelVerdict[] = [
      {
        model: "phi3.5",
        backend: "ollama",
        verdict: {
          status: "not_ready",
          blocking: [
            "false 'done' on 2 runs",
            "native tool-calling required but not supported/measured on this backend",
            "partial offload → severe slowdown",
            "run error: ollama timed out",
          ],
          conditions: [],
          path: "prompt_based",
        },
      },
    ];
    render(<VerdictTable verdicts={verdicts} />);
    const row = screen.getByTestId("readiness-row-phi3.5");
    // Each reason maps to a real category, not the catch-all "System".
    expect(row).toHaveTextContent("BLOCKING: [✗ Reliability] [✗ Native FC] [✗ Hardware] [✗ Run Error]");
    expect(row).not.toHaveTextContent("System");
    // The Details line still surfaces the exact backend reasons (with their counts/messages).
    expect(row).toHaveTextContent("False 'done' on 2 runs");
    expect(row).toHaveTextContent("Run error: ollama timed out");
  });

  it("renders conditions as amber notes and a clean Ready row as 'meets all criteria'", () => {
    render(<VerdictTable verdicts={VERDICTS} />);
    expect(screen.getByTestId("readiness-row-mistral-nemo")).toHaveTextContent("! slow: 8400ms/step > 5000ms target");
    expect(screen.getByTestId("readiness-row-qwen2.5-coder")).toHaveTextContent("Meets all criteria");
  });

  it("renders the memory footprint for a measured model and N/A for a single-model backend", () => {
    render(<VerdictTable verdicts={VERDICTS} />);
    // Ollama with a measured profile → weights + cache vs cap, "fits".
    expect(screen.getByTestId("readiness-row-qwen2.5-coder")).toHaveTextContent(
      "VRAM: 6.0 GB (5.0 model + 1.0 cache @ 8k ctx) < 24.0 GB cap · fits",
    );
    // llama.cpp (no memory profile) → honest N/A, never a guessed fit.
    expect(screen.getByTestId("readiness-row-mistral-nemo")).toHaveTextContent("VRAM fit: N/A (single-model backend)");
    // A measured-but-exact profile shows no estimate caveat.
    expect(screen.queryByTestId("vram-estimated")).not.toBeInTheDocument();
  });

  it("labels the VRAM line as a conservative estimate when KV head count was defaulted", () => {
    const est: ModelVerdict[] = [
      {
        model: "qwen3.5",
        backend: "ollama",
        verdict: { status: "ready", blocking: [], conditions: [], path: "native_fc" },
        memory: { weights_bytes: 5 * GIB, kv_cache_bytes: 2 * GIB, total_bytes: 7 * GIB, cap_bytes: 24 * GIB, context_length: 8192, fits: true, pressure: false, estimated: true },
      },
    ];
    render(<VerdictTable verdicts={est} />);
    const row = screen.getByTestId("readiness-row-qwen3.5");
    expect(row).toHaveTextContent("· est."); // hidden machine-readable string
    expect(within(row).getByTestId("vram-estimated")).toBeInTheDocument();
  });

  it("shows REAL measured metrics (Pass^k / steps / effort) — values or N/A, never fabricated", () => {
    const real: ModelVerdict[] = [
      {
        model: "llama3.2:3b",
        backend: "ollama",
        verdict: { status: "ready", blocking: [], conditions: [], path: "native_fc" },
        pass_k: 1.0,
        avg_steps: 1.0,
        effort: 29,
        quantization: "Q4_K_M", // real backend value
        cliff: { status: "Collapsed", depth: 12000 }, // measured by the Context-Cliff probe
        memory: null, // VRAM not measured (no cap)
      },
      {
        model: "phi3.5",
        backend: "ollama",
        verdict: { status: "not_ready", blocking: ["pass^k 0.40 < 0.80 required"], conditions: [], path: "prompt_based" },
        pass_k: 0.4, // steps/effort undefined → N/A
      },
    ];
    render(<VerdictTable verdicts={real} />);

    const ready = screen.getByTestId("readiness-row-llama3.2:3b");
    expect(within(ready).getByTestId("metric-passk")).toHaveTextContent("100%");
    expect(within(ready).getByTestId("metric-steps")).toHaveTextContent("1.0");
    expect(within(ready).getByTestId("metric-effort")).toHaveTextContent("29 tok");
    expect(within(ready).getByTestId("metric-cliff")).toHaveTextContent("Collapsed at 12,000 tok"); // measured collapse
    expect(ready).toHaveTextContent("Q4_K_M"); // real quant, not a per-family guess
    // VRAM was NOT measured → must NOT claim it fits.
    expect(ready).not.toHaveTextContent("Fits completely in VRAM");

    const weak = screen.getByTestId("readiness-row-phi3.5");
    expect(within(weak).getByTestId("metric-passk")).toHaveTextContent("40%");
    expect(within(weak).getByTestId("metric-steps")).toHaveTextContent("N/A");
    expect(within(weak).getByTestId("metric-effort")).toHaveTextContent("N/A");
    expect(within(weak).getByTestId("metric-cliff")).toHaveTextContent("N/A"); // no probe → N/A, not fabricated
  });

  it("renders a broken baseline as 'fails from start', never a depth", () => {
    const broke: ModelVerdict[] = [
      {
        model: "broke:9b",
        backend: "ollama",
        verdict: { status: "not_ready", blocking: [], conditions: [], path: "native_fc" },
        pass_k: 1.0,
        cliff: { status: "Broken", tested: 388 },
      },
    ];
    render(<VerdictTable verdicts={broke} />);
    const cell = within(screen.getByTestId("readiness-row-broke:9b")).getByTestId("metric-cliff");
    expect(cell).toHaveTextContent("fails from start");
    expect(cell).not.toHaveTextContent("388");
  });

  it("renders a probed-but-no-cliff result as '✓ No cliff (≥tested)', not N/A", () => {
    const held: ModelVerdict[] = [
      {
        model: "qwen3.5:9b",
        backend: "ollama",
        verdict: { status: "ready", blocking: [], conditions: [], path: "native_fc" },
        pass_k: 1.0,
        cliff: { status: "NoCliff", tested: 4000 },
      },
    ];
    render(<VerdictTable verdicts={held} />);
    expect(within(screen.getByTestId("readiness-row-qwen3.5:9b")).getByTestId("metric-cliff")).toHaveTextContent(
      "✓ No cliff (≥4,000 tok)",
    );
  });

  it("never guesses a quant — an unknown name renders a dash, not a family default", () => {
    render(
      <VerdictTable
        verdicts={[{ model: "qwen2.5-coder", backend: "ollama", verdict: { status: "ready", blocking: [], conditions: [], path: "prompt_based" } }]}
      />,
    );
    // The old code fabricated "q5_k_m" for any qwen; an unknown quant is now an honest "—".
    expect(screen.getByTestId("readiness-row-qwen2.5-coder")).not.toHaveTextContent(/q5_k_m/i);
  });
});
