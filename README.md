# Gemini Mendeleev

Userscript that replaces the `gemini.google.com` model picker with a periodic table of models.

## Install

- **GitHub Releases**: Install [`gemini-mendeleev.user.js`](https://github.com/moraxyc/gemini-mendeleev/releases/latest/download/gemini-mendeleev.user.js) in Tampermonkey (auto-updates via `@updateURL` / `@downloadURL`).
- **From source**: Run `npm run build` and paste `dist/gemini-mendeleev.user.js` into Tampermonkey.

## Behavior

- Displays the active element name (e.g. `Hydrogen`) and thinking level in the input bar trigger.
- Maps element-named models (e.g. `4 Argon`) onto periodic table cells; other models (e.g. `3.1 Pro`, `3.5 Flash-Lite`) appear under **Other models**.
- Shows `upsell_*` models as disabled; switches models and thinking levels by driving Gemini's native menu in the background.
- Includes a **Gemini menu** fallback button in the footer.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build   # outputs unminified dist/gemini-mendeleev.user.js
npm run dev     # watch mode
```

Test locally against `dev/mock.html`:

```sh
python3 -m http.server 8765
# open http://127.0.0.1:8765/dev/mock.html and inject dist/gemini-mendeleev.user.js
```

Pushing a `v*` tag triggers `.github/workflows/release.yml` to publish `dist/gemini-mendeleev.user.js` to GitHub Releases.
