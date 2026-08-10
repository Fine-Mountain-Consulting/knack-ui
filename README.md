# @fmc/knack-ui

Fine Mountain design tokens and component primitives for Knack front ends. Implements [knack-ui-blueprint](https://github.com/Fine-Mountain-Consulting/knack-ui-blueprint) §7–8.

```bash
npm install github:Fine-Mountain-Consulting/knack-ui#v1
```

```css
/* src/index.css */
@import "tailwindcss";
@import "@fmc/knack-ui/theme.css";
```

`theme.css` carries an `@source "./"` directive, because Tailwind 4 skips `node_modules` when scanning for classes — without it the package's components ship unstyled.

## Tokens

Three scales, named correctly (the legacy `HIPAA4Knack/tailwind.config.js` has its token names scrambled against its values — don't copy it):

| Scale | Value at 500 | Use |
| --- | --- | --- |
| `brand` | `#c41e3a` crimson | Primary actions, active nav, focus rings |
| `forest` | `#2d9040` logo green | Accents and icons |
| `steel` | `#5c6370` wordmark gray | Text, borders, page chrome |

Client re-skins override `--color-brand-*` **after** the import. Never edit component code for a re-skin.

## Components

**Layout** — `AppShell` (sidebar + mobile drawer, role-filtered nav, router-agnostic via `renderLink`), `PageHeader`, `Card`, `SlideOver`, `Modal`, `Tabs`

**Data** — `DataTable`, `Pagination`, `StatTile`, `StatusBadge` + `statusTones`, `EmptyState`, `ErrorState`, `Skeleton`, `RecordDetail`, `SearchInput`

**Forms** — `KnackForm`, `FormField`, `TextInput`, `TextArea`, `NumberInput`, `Select`, `Switch`, `DatePicker`, `DateTimePicker`, `SearchableSelect`, `FileUpload`

**Feedback** — `ConfirmDialog`, `useToasts` + `ToastRegion`

### `DataTable`

Server-driven: sort and page changes are handed back to the caller so they map onto Knack query params, rather than sorting one page client-side and lying about the order. Below `sm` it renders a card list — a nine-column table on a phone is not a table.

```tsx
<DataTable
  columns={columns}
  rows={data?.records ?? []}
  getRowId={(r) => r.id}
  loading={isLoading}
  error={error}
  sort={sort}
  onSortChange={setSort}
  page={page}
  totalPages={data?.totalPages ?? 1}
  onPageChange={setPage}
  onRowClick={(r) => navigate(`/contacts/${r.id}`)}
/>
```

### `KnackForm`

Values are keyed by Knack field key, so `onSubmit` output goes straight to the API with no mapping step. Read-only field types (equation, sum, count, auto-increment) render as text and are dropped from the payload — Knack rejects writes to them, and sending them back turns a good save into a 400.

```tsx
<KnackForm
  fields={[
    { field: FIELDS.contacts.firstName, label: 'First name', type: 'short_text', required: true },
    { field: FIELDS.contacts.status, label: 'Status', type: 'multiple_choice', options: ['Active', 'Inactive'] },
    { field: FIELDS.contacts.company, label: 'Company', type: 'connection', search: searchCompanies },
  ]}
  initialValues={values}
  onSubmit={handleSave}
  submitting={save.isPending}
/>
```

Client-side validation is for UX only. Knack validates server-side regardless, and that is the authoritative check.

## Accessibility

Overlays use Headless UI, so focus trapping, restore-on-close, Escape and scroll lock are handled rather than hand-rolled. Focus rings are never removed. Sortable headers carry `aria-sort`; loading regions carry `aria-busy`; toasts live in an `aria-live` region. `theme.css` honours `prefers-reduced-motion`.
