# Changelog

Consumers pin a tag, never `#main` — see the blueprint §2. Cutting a release
is: bump `version` here and in `package.json`, commit, `git tag -a vX.Y.Z`,
push the tag.

## 1.1.0

New components, and two estate-wide defaults.

- **`<Scheduler>`** — resource lanes with drag to reschedule. One column per
  person, drag between columns to reassign or up and down to move, drag the
  lower edge to change duration. Overlapping items pack side by side. Built on
  pointer events rather than HTML5 drag-and-drop, which fires too coarsely to
  snap onto a fifteen-minute grid. `busyIds` marks items with a write in flight
  so a caller can hold them where they were dropped.
- **`<MonthCalendar>`** and `monthBounds` — a month grid for anything with a
  date. Days are compared as `YYYY-MM-DD` text, never as timestamps, which is
  what keeps an item off the wrong day west of Greenwich.
- **`<Spinner>`** — the shared indeterminate wait, with `role="status"`.
  `<DataTable>` now shows one during a refetch: dimming rows alone reads as a
  flicker on a fast connection and as nothing at all on a slow one.
- **`<AttributionFooter>`** and `FMC_URL` — "Developed by Fine Mountain
  Consulting". Rendered by `<AppShell>` by default, so it cannot be forgotten;
  `attribution={false}` removes it for a white-label contract, which makes that
  removal an explicit line in the client's own repo.
- **Rows per page on `<Pagination>`** — `DEFAULT_PAGE_SIZE` is 10, with a
  10/25/50/100 control. Not only a layout choice: rows-per-page is the page size
  sent to Knack, so a large default multiplies the cost of every list view.

## 1.0.0

Initial release: shell, table, form, fields, overlays, primitives, theme.
