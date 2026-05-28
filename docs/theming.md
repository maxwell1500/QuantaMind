# Theming (light / dark)

QuantaMind supports light and dark themes with system detection and a
user override. Colors flow through CSS variables so existing Tailwind
utility classes (`bg-gray-50`, `text-blue-700`, …) flip with the theme —
no per-component dark: variants.

## How it works

1. **Tokens** — `frontend/src/styles/tokens.css` defines every color the
   app uses as space-separated RGB channels, in a light block
   (`:root, [data-theme="light"]`) and a dark block (`[data-theme="dark"]`).
2. **Palette remap** — `tailwind.config.js` points the `gray/blue/red/
   amber/green` ramps (and `surface`/`ink`) at `rgb(var(--x) /
   <alpha-value>)`, so utility classes resolve through the tokens and
   opacity utilities (`bg-black/30`) still work.
3. **Apply** — `shared/state/themeStore.ts` sets `data-theme` on `<html>`
   to the *resolved* theme. `useThemeSync` (mounted in App) loads the
   persisted mode and re-applies on OS changes while in "system" mode.
4. **Override** — Settings (gear / Cmd+,) offers System / Light / Dark,
   persisted as `theme` in `user_settings.yaml`.

## Conventions

- **No hardcoded hex outside `tokens.css`.** `grep -rE '#[0-9a-fA-F]{6}'
  frontend/src` returns nothing. Use Tailwind palette classes (they're
  token-backed) or the `surface`/`ink` semantic colors.
- `white` / `black` stay **literal** — they're for always-light button
  labels (`text-white`) and translucent backdrops (`bg-black/30`).
- Flipping surfaces use `bg-surface`; primary body text that must invert
  uses `text-ink`. The gray ramp is **inverted** in dark mode, so
  `bg-gray-50` (light surface) becomes dark and `text-gray-700` becomes
  light automatically.

## Status / tuning note

The mechanism, persistence, system detection, and override are complete
and tested. The **dark-mode color values in `tokens.css` are a first
cut** — they were chosen without a live visual pass (the build
environment has no display). Run the app, toggle to dark, and tune the
`[data-theme="dark"]` values for contrast where needed; no code changes
required, only the token values.

## Verification

- `shared/state/__tests__/themeStore.test.ts` — resolveTheme (system via
  matchMedia + explicit), applyTheme sets `data-theme`, load/setMode
  persist.
- `features/settings/__tests__/SettingsModal.test.tsx` — selector shows
  modes, selecting updates the store.
- Build check: compiled CSS contains `rgb(var(--…))` for every palette
  class; zero hardcoded hex in `src`.
- Live check (pending GUI): OS theme flips the app in system mode;
  override persists across reload.
