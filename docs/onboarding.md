# Onboarding

A first-run coach gets a new user from zero to a streaming response in
under ~90 seconds, then never shows again.

## Flow

`OnboardingCoach` (`features/onboarding/components/OnboardingCoach.tsx`)
renders above the main content while `user_settings.first_run_complete`
is false. The step is derived from live state by `currentStep`
(`features/onboarding/steps.ts`):

1. **Ollama** — if Ollama isn't healthy, inline the existing
   `OllamaEmptyState` (Start / Install). Advances when health flips true.
2. **Model** — if no models are installed, offer a one-click **Pull
   llama3.2:1b** (small, fast) that kicks off the normal pull pipeline and
   jumps to Downloads to watch progress, plus "Browse models". Advances
   when a model appears (the installed-models bus updates the count).
3. **Ready** — **Open my workspace** scaffolds `~/Documents/QuantaMind`
   with a `welcome.quantamind.yaml` poem prompt
   (`scaffold_onboarding_workspace`), opens it, selects the welcome
   prompt, and marks onboarding complete. The user lands in the workspace
   ready to hit Run / Cmd+Enter and watch tokens stream.

**Skip setup** is available at every step and just sets the flag.

## First-run gate

`onboardingStore` reads/writes `user_settings.first_run_complete`. It
fails **open** (treats the user as done) if settings can't load, so a
backend hiccup never traps someone behind the coach. Once `finish()`
runs, the flag persists and the coach unmounts for good.

## Scaffold (idempotent)

`commands/onboarding.rs::scaffold_in` creates the folder and writes the
welcome prompt only if it doesn't already exist — re-running never
clobbers a user's edits. The welcome prompt content is a pure
`welcome_prompt()` helper.

## Verification

- `commands/onboarding_tests.rs` — scaffold creates + is idempotent;
  welcome prompt round-trips.
- `features/onboarding/__tests__/` — `currentStep` logic, store
  load/finish (incl. fail-open), and the coach rendering each step +
  pull + finish + skip.
- Live check (pending GUI): fresh app config dir → finish in <90s;
  relaunch → no coach.
