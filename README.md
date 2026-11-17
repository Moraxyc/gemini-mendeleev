# Gemini Mendeleev

Userscript that replaces the `gemini.google.com` model picker with a periodic table of models.

<img width="1051" height="652" alt="Showcase" src="https://github.com/user-attachments/assets/bb269da4-2431-490a-b63b-e54e9dacf24f" />

## Install

- **Direct install**: Install [`gemini-mendeleev.user.js`](https://raw.githubusercontent.com/moraxyc/gemini-mendeleev/dist/gemini-mendeleev.user.js) in Tampermonkey (auto-updates via `@updateURL` / `@downloadURL`).
- **GitHub Releases**: Download `gemini-mendeleev.user.js` from [GitHub Releases](https://github.com/moraxyc/gemini-mendeleev/releases/latest) and drag it into Tampermonkey's dashboard.
- **From source**: Run `npm run build` and paste `dist/gemini-mendeleev.user.js` into Tampermonkey.

## Behavior

- Displays the active element name (e.g. `Hydrogen`) and thinking level in the input bar trigger.
- Maps element-named models (e.g. `4 Argon`) onto periodic table cells, with the version shown as atomic mass.
- Places models without an element name (e.g. `3.1 Pro`, `3.5 Flash-Lite`) in period 8 as unnamed elements, numbered from 119 with IUPAC placeholder names (`Uue`, `Ubn`, …).
- Shows `upsell_*` models as disabled; switches models and thinking levels by driving Gemini's native menu in the background.
- Choosing a model closes the table; choosing a thinking level keeps it open. Clicks made while the table is still reading Gemini's menu are queued, not dropped.
- Keyboard: the table opens with focus on the current model; arrow keys move across the table, typing a symbol (`ar`) or atomic number (`18`) jumps to that element, Enter switches, Esc closes.
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
# append ?delay=300 to simulate Gemini's menu latency
```

Pushing a `v*` tag triggers `.github/workflows/release.yml` to push `gemini-mendeleev.user.js` to the `dist` branch and publish it to GitHub Releases.
