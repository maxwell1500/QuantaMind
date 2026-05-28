# Theming (light-only)

QuantaMind is light-only. A dark theme was built in v0.2 but **removed
after the visual pass** — it didn't read well and the value/effort wasn't
there. The CSS-variable token system stays because it keeps colors in one
place and the no-hardcoded-hex rule cheap to hold.

## How it works

1. **Tokens** — `frontend/src/styles/tokens.css` defines every color the
   app uses as space-separated RGB channels under `:root` (light values).
2. **Palette remap** — `tailwind.config.js` points the `gray/blue/red/
   amber/green` ramps (and `surface`/`ink`) at `rgb(var(--x) /
   <alpha-value>)`, so utility classes resolve through the tokens and
   opacity utilities (`bg-black/30`) still work.

## Conventions

- **No hardcoded hex outside `tokens.css`.** `grep -rE '#[0-9a-fA-F]{6}'
  frontend/src` returns nothing. Use Tailwind palette classes (token-
  backed) or the `surface`/`ink` semantic colors.
- `white` / `black` stay **literal** — they're for button labels
  (`text-white`) and translucent backdrops (`bg-black/30`).
- Flipping surfaces use `bg-surface`; primary body text uses `text-ink`.

## Re-adding dark later

If dark returns, add a `[data-theme="dark"]` block to `tokens.css`, a
theme store that sets `data-theme` on `<html>` (reading
`prefers-color-scheme`), and a Settings control. The token plumbing
already supports it; only the dark values + the toggle were removed.

## Verification

- Build: compiled CSS contains `rgb(var(--…))` for every palette class;
  zero hardcoded hex in `src`; no `[data-theme="dark"]` anywhere.
- App renders light on a fresh config dir and never goes dark.
