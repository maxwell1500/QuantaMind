# In-app feedback

A small floating button in the bottom-right of the main window opens a
modal where the user can write feedback, optionally include their email
for a reply, and optionally attach a small diagnostics blob. Submission
posts to a Web3Forms relay which forwards to **info@quantamind.co**.

## What the user sees

- **Floating Feedback button** — fixed bottom-right, 60% opacity until
  hover, never overlaps modals (z-index 30, modals are 40+).
- **Modal copy** (verbatim — change with caution):
  > Send us feedback
  > QuantaMind is early. Honest feedback — what's broken, what's
  > missing, what you wish worked differently — directly shapes what we
  > build next.
  > [textarea]
  > Your email (optional — only if you want a reply)
  > [email]
  > [ ] Include diagnostic info (app version, OS, current model)
  > Feedback goes to info@quantamind.co. We read every message.
- **Send** is disabled until the trimmed message length is 10–5000.
- **Esc** and clicking the backdrop close the modal (unless a submission
  is in flight).
- **Success** → modal closes, toast "Thanks — we read every message."
- **Failure** → inline red error, modal stays open, retry by clicking
  Send again.

## Wire

```
FeedbackButton
  └─ FeedbackModal
       ├─ useSubmitFeedback hook (idle → submitting → success/error)
       │    └─ shared/ipc/feedback.ts → invoke("submit_feedback", …)
       │         └─ Rust commands/feedback.rs → POST Web3Forms
       └─ shared/ui/Toast.tsx (useToast / ToastHost)
```

The current model name (for diagnostics) is read from
`useWorkspaceStore.selectedModel`. That field is the canonical "model
the user is working with" — Workspace.tsx writes to it via
`setSelectedModel` whenever the picker changes.

## Build-time configuration

The Web3Forms access key is **read at compile time** via
`option_env!("WEB3FORMS_ACCESS_KEY")`. Without the env var set during
`cargo build`, the binary still compiles but `submit_feedback` returns:

> internal: feedback is disabled in this build (WEB3FORMS_ACCESS_KEY
> was not set at compile time)

To enable feedback for a release build:

```sh
WEB3FORMS_ACCESS_KEY=<your-key> pnpm tauri build
```

`backend/build.rs` declares `cargo:rerun-if-env-changed=…` so the build
re-runs when you swap keys.

## What the backend POSTs

```json
{
  "access_key": "<your key>",
  "subject":    "QuantaMind Feedback",
  "from_name":  "QuantaMind App",
  "message":    "<user text>",
  "reply_to":   "<user email or no-reply@quantamind.co>",
  "diagnostics": "app: QuantaMind v0.1.0\nos: macos (aarch64)\nmodel: mistral:7b"
}
```

Web3Forms takes that and emails it to the address you registered.

## What's not included (intentional)

- In-app feedback history. The first 50 emails belong in the founder's
  inbox, not a feature.
- Screenshot attachment. ~3 hours of extra work; skip until requested.
- Categorization dropdown. Triage in the inbox by subject keywords.
- Star/thumbs rating. Different product.
