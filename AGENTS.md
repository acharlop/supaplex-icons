# Supaplex SVG

The deliverable is `svg/pixel/`: every frame a pixel-exact match of the original at every size up to `pixel.exactUpTo` (256px, or native width for wider screens). Everything else is secondary. Ship `sprites.json` with `pixel.smooth: false`, `exactUpTo: 256` and `cornerCut: 0.25` unless Avi changes them.

Layout and settings: see `README.md` (the "For AI" section).

## Adding a batch of sprites

1. **Map.** Each new entry needs `source.frames` coordinates (one `[x, y]` per frame); `npm run grid -- <id>...` prints a mapped frame as hex palette indices, which tells you whether you hit the right cell. Identical grids (e.g. gravity ports = ports) are one design.
2. **Flag.** Add `"svg": true` after each entry's `source` block with a targeted text edit. Re-serialising `sprites.json` through `JSON.stringify` reflows every `frames` array into a ~600-line diff.
3. **Build.** `npm run build` writes the pixel SVGs. The build is the only writer of `svg/pixel/`.
4. **Verify.** `npm run verify -- <id>...` renders each pixel SVG in headless Chrome at 1x, 2x, 4x… up to `exactUpTo` and diffs every pixel against the original. Done when it exits 0 with `:0` on every size. A non-zero count is a pipeline bug in `scripts/svg.mjs` or the mapping; fix that, never the SVG.
5. **Smooth (optional).** Hand-drawn `svg/smooth/<id>.svg`, single-frame sprites only, and only when asked. Match `svg/smooth/murphy.svg`: 16x16 viewBox, `<title>` equal to the sprite's `name`, flat palette fills, layered shapes, no gradients or opacity. Draw one design per unique grid, derive mirrors and rotations by transforming coordinates, and copy identical sprites with only the title changed.
6. **Status.** Update the README status line.

Completion: `npm run verify` exits 0 for all `svg: true` sprites (fonts include the `fonts/*.woff2` and `fonts/*.ttf` rows), and a second `npm run build` leaves `git status svg/ fonts/ screens/` clean (CI fails otherwise).

## Editable screens

`screens.json` drives `screens/` and the learned fonts (README "For AI" has the format). To change a screen: edit its runs, slots or icons, then `npm run build`. The build throws if a run's text doesn't recompose the screen pixels or misses ink, or an icon differs from the screen. Adjust `cuts` and `deco` until it passes, never the check. Done when `npm run verify -- <screen id>` shows `:0` on every `screens/<id>` row.

## Gotchas

- Edge-touching black becomes transparent; enclosed black stays. Verify renders on a black page so both read as the original black.
- Fonts make every unset bit transparent; screens keep every pixel. Both are set per `kind` in `BACKGROUND` (`scripts/sprites.mjs`).
- macOS font smoothing widens glyphs by a fraction of a pixel; text needs `-webkit-font-smoothing: antialiased` to match.
- Headless Chrome instances run one at a time; parallel ones share a profile and hang until the teardown watchdog kills them.
- Headless Chrome with `--user-data-dir` writes the screenshot and never exits; keep it off the `verify` command line.
- `verify` needs Chrome (`CHROME=/path` to override) and `ffmpeg`. `rsvg-convert -w 256 <svg> -o x.png` is the quick way to eyeball a render.
- Smooth art never gates a batch: Avi only judges the 256px exact match. Merge once verify passes.
- Subagents drawing smooth art in parallel: give each the same style brief and the `npm run grid` output, split by unique design, and keep shared families (e.g. a sprite and its rotations) in one agent.
