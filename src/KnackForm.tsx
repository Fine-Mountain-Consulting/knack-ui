import {
  useId,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { Button, cx } from './primitives.js';
import {
  DatePicker,
  DateTimePicker,
  FileUpload,
  FormField,
  NumberInput,
  SearchableSelect,
  Select,
  Switch,
  TextArea,
  TextInput,
  type SearchOption,
} from './fields.js';

/** The Knack field types the form knows how to render. */
export type KnackFormFieldType =
  | 'short_text'
  | 'paragraph_text'
  | 'rich_text'
  | 'number'
  | 'currency'
  | 'multiple_choice'
  | 'boolean'
  | 'date'
  | 'date_time'
  | 'connection'
  | 'file'
  | 'image'
  | 'email'
  | 'phone'
  | 'link'
  /** Equation, sum, count, auto-increment. Rendered read-only, never submitted. */
  | 'readonly';

export interface KnackFormFieldConfig {
  /** The Knack field key, from FIELDS in the generated schema. */
  field: string;
  label: string;
  type: KnackFormFieldType;
  required?: boolean;
  help?: string;
  placeholder?: string;
  /** Multiple-choice options. Use the generated union's members. */
  options?: readonly string[];
  /** Connection fields: search the connected object. */
  search?: (query: string) => Promise<SearchOption[]>;
  /** Connection fields: allow many. */
  multiple?: boolean;
  /** File fields: opens the camera on mobile. */
  capture?: boolean;
  /** Full-width in the 2-column grid. Defaults to true for text areas. */
  fullWidth?: boolean;
  disabled?: boolean;
}

export type KnackFormValues = Record<string, unknown>;

export interface KnackFormProps {
  fields: KnackFormFieldConfig[];
  initialValues?: KnackFormValues;
  onSubmit: (values: KnackFormValues) => void | Promise<void>;
  onCancel?: () => void;
  onUpload?: (file: File) => Promise<{ id: string; filename: string }>;
  submitLabel?: string;
  cancelLabel?: string;
  /** Server-side errors keyed by field key, e.g. from a Knack 400. */
  errors?: Record<string, string>;
  submitting?: boolean;
  /** Rendered between the fields and the actions. */
  children?: ReactNode;
}

const isEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Schema-driven form over Knack fields.
 *
 * Values are keyed by Knack field key so `onSubmit` output goes straight to
 * the API with no mapping step. Validation here is for UX only — Knack
 * validates server-side regardless, and that is the authoritative check.
 */
export const KnackForm = ({
  fields,
  initialValues = {},
  onSubmit,
  onCancel,
  onUpload,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  errors: serverErrors = {},
  submitting = false,
  children,
}: KnackFormProps) => {
  const formId = useId();
  const [values, setValues] = useState<KnackFormValues>(initialValues);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);

  const editable = useMemo(() => fields.filter((f) => f.type !== 'readonly'), [fields]);

  const clientErrors = useMemo(() => {
    const found: Record<string, string> = {};
    for (const field of editable) {
      const value = values[field.field];
      if (field.required && isEmpty(value)) {
        found[field.field] = `${field.label} is required.`;
        continue;
      }
      if (isEmpty(value)) continue;
      if (field.type === 'email' && typeof value === 'string' && !EMAIL_RE.test(value)) {
        found[field.field] = 'Enter a valid email address.';
      }
      if ((field.type === 'number' || field.type === 'currency') && Number.isNaN(Number(value))) {
        found[field.field] = 'Enter a number.';
      }
    }
    return found;
  }, [editable, values]);

  const errorFor = (key: string): string | undefined =>
    serverErrors[key] ?? ((attempted || touched[key]) ? clientErrors[key] : undefined);

  const setValue = (key: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(clientErrors).length > 0) return;

    // Read-only fields (equations, counts) are dropped: Knack rejects writes
    // to them, and sending them back turns a good save into a 400.
    const payload: KnackFormValues = {};
    for (const field of editable) {
      if (field.field in values) payload[field.field] = values[field.field];
    }
    await onSubmit(payload);
  };

  const errorCount = attempted ? Object.keys(clientErrors).length : 0;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {errorCount > 0 && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {errorCount === 1
            ? 'One field needs attention.'
            : `${errorCount} fields need attention.`}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const id = `${formId}-${field.field}`;
          const error = errorFor(field.field);
          const value = values[field.field];
          const wide =
            field.fullWidth ??
            (field.type === 'paragraph_text' ||
              field.type === 'rich_text' ||
              field.type === 'file' ||
              field.type === 'image');

          return (
            <FormField
              key={field.field}
              label={field.label}
              htmlFor={id}
              required={field.required}
              error={error}
              help={field.help}
              className={wide ? 'sm:col-span-2' : undefined}
            >
              {renderControl({ field, id, value, error, setValue, setTouched, onUpload })}
            </FormField>
          );
        })}
      </div>

      {children}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button onClick={onCancel} disabled={submitting}>
            {cancelLabel}
          </Button>
        )}
        <Button type="submit" variant="primary" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
};

interface RenderArgs {
  field: KnackFormFieldConfig;
  id: string;
  value: unknown;
  error?: string;
  setValue: (key: string, value: unknown) => void;
  setTouched: Dispatch<SetStateAction<Record<string, boolean>>>;
  onUpload?: (file: File) => Promise<{ id: string; filename: string }>;
}

const renderControl = ({ field, id, value, error, setValue, setTouched, onUpload }: RenderArgs) => {
  const blur = () => setTouched((prev) => ({ ...prev, [field.field]: true }));
  const common = {
    id,
    disabled: field.disabled,
    invalid: Boolean(error),
    required: field.required,
  };

  switch (field.type) {
    case 'readonly':
      return (
        <div className={cx('rounded-lg bg-steel-100 px-3 py-2 text-sm text-steel-600 tabular-nums')}>
          {value === undefined || value === null || value === '' ? '—' : String(value)}
        </div>
      );

    case 'paragraph_text':
    case 'rich_text':
      return (
        <TextArea
          {...common}
          value={(value as string) ?? ''}
          placeholder={field.placeholder}
          onChange={(e) => setValue(field.field, e.target.value)}
          onBlur={blur}
        />
      );

    case 'number':
    case 'currency':
      return (
        <NumberInput
          {...common}
          value={(value as number | string) ?? ''}
          placeholder={field.placeholder}
          step={field.type === 'currency' ? '0.01' : undefined}
          onChange={(e) => setValue(field.field, e.target.value === '' ? '' : Number(e.target.value))}
          onBlur={blur}
        />
      );

    case 'multiple_choice':
      return (
        <Select
          {...common}
          options={field.options ?? []}
          placeholder={field.placeholder ?? 'Select…'}
          value={(value as string) ?? ''}
          onChange={(e) => setValue(field.field, e.target.value)}
          onBlur={blur}
        />
      );

    case 'boolean':
      return (
        <Switch
          checked={Boolean(value)}
          onChange={(checked) => setValue(field.field, checked)}
          label={field.label}
          disabled={field.disabled}
        />
      );

    case 'date':
      return (
        <DatePicker
          {...common}
          value={(value as string) ?? ''}
          onChange={(next) => setValue(field.field, next)}
        />
      );

    case 'date_time':
      return (
        <DateTimePicker
          {...common}
          value={(value as { date: string; time: string }) ?? { date: '', time: '' }}
          onChange={(next) => setValue(field.field, next)}
        />
      );

    case 'connection':
      return (
        <SearchableSelect
          id={id}
          value={(value as SearchOption[]) ?? []}
          onChange={(next) => {
            setValue(field.field, next);
            blur();
          }}
          search={field.search ?? (async () => [])}
          multiple={field.multiple}
          placeholder={field.placeholder}
          disabled={field.disabled}
          invalid={Boolean(error)}
        />
      );

    case 'file':
    case 'image':
      return (
        <FileUpload
          value={(value as { id: string; filename: string } | null) ?? null}
          onChange={(next) => setValue(field.field, next)}
          onUpload={onUpload ?? (async () => { throw new Error('No upload handler configured.'); })}
          accept={field.type === 'image' ? 'image/*' : undefined}
          capture={field.capture}
          disabled={field.disabled}
        />
      );

    case 'email':
    case 'phone':
    case 'link':
    case 'short_text':
    default:
      return (
        <TextInput
          {...common}
          type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'link' ? 'url' : 'text'}
          value={(value as string) ?? ''}
          placeholder={field.placeholder}
          onChange={(e) => setValue(field.field, e.target.value)}
          onBlur={blur}
        />
      );
  }
};
