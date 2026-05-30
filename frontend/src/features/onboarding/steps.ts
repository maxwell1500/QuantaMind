export type OnboardingStep = "ollama" | "model" | "ready";

/// Which onboarding step to show, derived from live state. Ollama first,
/// then a model, then the ready-to-go scaffold.
export function currentStep(ollamaHealthy: boolean | null, modelCount: number): OnboardingStep {
  if (ollamaHealthy !== true) return "ollama";
  if (modelCount === 0) return "model";
  return "ready";
}
