# Design

Almanac should feel like a well-made instrument: calm, precise and quick to read, on a phone
first but just as good on a laptop. These notes keep it consistent as tools are added.

## Principles

- Figures are data. Every number is set in the monospace (`.num`), so columns line up and
  values read differently from copy. Copy uses the sans-serif in `--font-copy`.
- One identity colour per tool (`--take-home` for take-home pay), used for its icon, focus rings,
  selected chips and its main chart series. Status colours (info, warning, error) are reserved
  for notices and callouts, and always come with an icon and a title.
- Quiet surfaces. Panels are white (or near-black) cards with a hairline border on a grey page.
  Labels are small and grey; values are large and black.
- Progressive detail. Show the inputs most people need; put the rest in a "more options" sheet,
  with a one-line summary of what's set there, so the results stay in view.
- Nothing is lost. Edits save on their own, and a notice appears if they can't be.
- Motion is short (under 300ms), eases out, and is disabled for reduced-motion users.

## Structure

- Index (`/`): the tools, then links to other apps on the same machine (from `ALMANAC_LINKS`).
  It never shows figures from inside a tool.
- Each tool has its own page with the shared header: back link, title, tool actions, and the
  notifications button. The notifications button always sits beside the title; on a phone the
  actions take a row of their own beneath it. A button whose label can be long, like a preset's
  name, shortens it to fit rather than widening the page. Nothing on any page should ever make
  it scroll sideways.
- The notification drawer collects notices from every tool. Warnings and info can be dismissed;
  errors, and warnings about edits that could be lost, stay until fixed.
- On a laptop, a tool's inputs sit in a sticky column on the left with results on the right. On a
  phone they stack, with a slim summary pinned to the top once the main figure scrolls away.

## Adding a tool

1. Add its state schemas to `src/shared/tools.ts`, so the server can store it and its presets:
   the shape it's written in, and one that also reads any older shapes it was stored in.
2. Add its identity colour to `src/client/styles/tokens.css`, light and dark.
3. Build its page under `src/client/tools/<id>/`, using `useToolState` for saved state and the
   components in `src/client/ui/`.
4. Register it in `src/client/tools/registry.tsx`, with any notices it raises, including
   `unsavedNotices` if it uses `useToolState`.

## Charts

Charts follow the dataviz guidance: thin marks, recessive gridlines, one axis, categorical colours
in their fixed order (`--series-1` onwards), values in text colours rather than series colours,
and a readout that's reachable by dragging rather than precise hovering. A series that stands for
something with a fixed set of values keeps one colour for each: each student loan plan has its
own, from `--series-1` (Plan 2, the most common, so a lone loan matches the tool's colour) to
`--series-5` (Postgraduate), whichever loans are shown with it.

## Reviewing changes visually

With a development or e2e server running, `node scripts/screenshots.ts <base URL> <dir>` saves
the main screens on a phone and a laptop in light and dark mode, using made-up figures.
