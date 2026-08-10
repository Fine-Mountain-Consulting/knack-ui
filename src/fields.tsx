import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';
import { ArrowUpTrayIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { cx } from './primitives.js';

// ── FormField wrapper ───────────────────────────────────────────────────────

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  help?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Every control is wrapped in one of these. A placeholder is not a label, and
 * an error with no `aria-describedby` link is invisible to a screen reader.
 */
export const FormField = ({
  label,
  htmlFor,
  required,
  error,
  help,
  children,
  className,
}: FormFieldProps) => (
  <div className={cx('min-w-0', className)}>
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-steel-700">
      {label}
      {required && (
        <span className="ml-0.5 text-red-600" aria-label="required">
          *
        </span>
      )}
    </label>
    {children}
    {error ? (
      <p className="mt-1 text-sm text-red-600">{error}</p>
    ) : help ? (
      <p className="mt-1 text-xs text-steel-500">{help}</p>
    ) : null}
  </div>
);

const CONTROL_CLASS =
  'block w-full rounded-lg border border-steel-300 bg-white px-3 py-2 text-sm text-steel-900 ' +
  'placeholder:text-steel-400 shadow-sm transition-colors ' +
  'focus:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ' +
  'disabled:cursor-not-allowed disabled:bg-steel-100 disabled:text-steel-500';

const errorClass = (hasError?: boolean) =>
  hasError ? 'border-red-400 focus:border-red-500 focus-visible:ring-red-500' : '';

// ── Text-ish inputs ─────────────────────────────────────────────────────────

export interface TextInputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'size'> {
  invalid?: boolean;
}

export const TextInput = ({ invalid, className, ...rest }: TextInputProps) => (
  <input
    aria-invalid={invalid || undefined}
    className={cx(CONTROL_CLASS, errorClass(invalid), className)}
    {...rest}
  />
);

export interface TextAreaProps extends ComponentPropsWithoutRef<'textarea'> {
  invalid?: boolean;
}

export const TextArea = ({ invalid, className, rows = 4, ...rest }: TextAreaProps) => (
  <textarea
    rows={rows}
    aria-invalid={invalid || undefined}
    className={cx(CONTROL_CLASS, errorClass(invalid), className)}
    {...rest}
  />
);

export const NumberInput = ({ invalid, className, ...rest }: TextInputProps) => (
  <input
    type="number"
    inputMode="decimal"
    aria-invalid={invalid || undefined}
    className={cx(CONTROL_CLASS, 'tabular-nums', errorClass(invalid), className)}
    {...rest}
  />
);

export interface SelectProps extends ComponentPropsWithoutRef<'select'> {
  options: readonly string[] | ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
  invalid?: boolean;
}

export const Select = ({ options, placeholder, invalid, className, ...rest }: SelectProps) => (
  <select
    aria-invalid={invalid || undefined}
    className={cx(CONTROL_CLASS, errorClass(invalid), className)}
    {...rest}
  >
    {placeholder !== undefined && <option value="">{placeholder}</option>}
    {options.map((option) => {
      const value = typeof option === 'string' ? option : option.value;
      const label = typeof option === 'string' ? option : option.label;
      return (
        <option key={value} value={value}>
          {label}
        </option>
      );
    })}
  </select>
);

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export const Switch = ({ checked, onChange, label, disabled }: SwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cx(
      'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      checked ? 'bg-brand-600' : 'bg-steel-300',
    )}
  >
    <span
      className={cx(
        'my-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150',
        checked ? 'translate-x-5.5' : 'translate-x-0.5',
      )}
    />
  </button>
);

// ── Dates ───────────────────────────────────────────────────────────────────

/**
 * Knack stores dates as MM/DD/YYYY strings but `<input type="date">` speaks
 * ISO, so both directions are converted here rather than at every call site.
 */
export const knackDateToInput = (value: string | undefined | null): string => {
  if (!value) return '';
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1]! : '';
};

export const inputDateToKnack = (value: string): string => {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : '';
};

export interface DatePickerProps {
  value: string;
  onChange: (knackDate: string) => void;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
}

export const DatePicker = ({ value, onChange, invalid, ...rest }: DatePickerProps) => (
  <input
    type="date"
    value={knackDateToInput(value)}
    onChange={(e) => onChange(inputDateToKnack(e.target.value))}
    aria-invalid={invalid || undefined}
    className={cx(CONTROL_CLASS, errorClass(invalid))}
    {...rest}
  />
);

export interface DateTimePickerProps extends Omit<DatePickerProps, 'value' | 'onChange'> {
  value: { date: string; time: string };
  onChange: (value: { date: string; time: string }) => void;
}

export const DateTimePicker = ({ value, onChange, invalid, ...rest }: DateTimePickerProps) => (
  <div className="flex gap-2">
    <input
      type="date"
      value={knackDateToInput(value.date)}
      onChange={(e) => onChange({ ...value, date: inputDateToKnack(e.target.value) })}
      aria-invalid={invalid || undefined}
      className={cx(CONTROL_CLASS, errorClass(invalid))}
      {...rest}
    />
    <input
      type="time"
      value={value.time}
      onChange={(e) => onChange({ ...value, time: e.target.value })}
      className={cx(CONTROL_CLASS, 'w-32', errorClass(invalid))}
    />
  </div>
);

// ── SearchableSelect (connection fields) ────────────────────────────────────

export interface SearchOption {
  id: string;
  label: string;
}

export interface SearchableSelectProps {
  value: SearchOption[];
  onChange: (value: SearchOption[]) => void;
  /** Called on debounced input. Return the matching records. */
  search: (query: string) => Promise<SearchOption[]>;
  multiple?: boolean;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
}

/**
 * The control for Knack connection fields. Searches the connected object
 * rather than loading every record — a connection to a 50k-row table would
 * otherwise be unusable.
 */
export const SearchableSelect = ({
  value,
  onChange,
  search,
  multiple = false,
  placeholder = 'Search…',
  disabled,
  invalid,
  id,
}: SearchableSelectProps) => {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const current = ++requestId.current;
    const handle = setTimeout(() => {
      setLoading(true);
      search(query)
        .then((results) => {
          // Drop responses that arrived out of order — otherwise fast typing
          // leaves the list showing results for an earlier query.
          if (current === requestId.current) setOptions(results);
        })
        .catch(() => {
          if (current === requestId.current) setOptions([]);
        })
        .finally(() => {
          if (current === requestId.current) setLoading(false);
        });
    }, 250);
    return () => clearTimeout(handle);
  }, [query, search]);

  const selectedIds = useMemo(() => new Set(value.map((v) => v.id)), [value]);

  const handleSelect = (option: SearchOption | null) => {
    if (!option) return;
    if (!multiple) {
      onChange([option]);
      setQuery('');
      return;
    }
    if (selectedIds.has(option.id)) return;
    onChange([...value, option]);
    setQuery('');
  };

  return (
    <div>
      {multiple && value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand-700"
            >
              {item.label}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v.id !== item.id))}
                aria-label={`Remove ${item.label}`}
                className="rounded-full p-0.5 hover:bg-brand-100"
              >
                <XMarkIcon className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      <Combobox value={null} onChange={handleSelect} disabled={disabled}>
        <div className="relative">
          <ComboboxInput
            id={id}
            className={cx(CONTROL_CLASS, errorClass(invalid))}
            placeholder={!multiple && value[0] ? value[0].label : placeholder}
            displayValue={() => query}
            onChange={(e) => setQuery(e.target.value)}
            aria-invalid={invalid || undefined}
          />
          <ComboboxOptions className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-steel-900/5">
            {loading && <div className="px-3 py-2 text-sm text-steel-500">Searching…</div>}
            {!loading && options.length === 0 && (
              <div className="px-3 py-2 text-sm text-steel-500">No matches.</div>
            )}
            {options.map((option) => (
              <ComboboxOption
                key={option.id}
                value={option}
                className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm text-steel-900 data-focus:bg-brand-50"
              >
                {option.label}
                {selectedIds.has(option.id) && (
                  <CheckIcon className="h-4 w-4 text-brand-600" aria-hidden="true" />
                )}
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        </div>
      </Combobox>

      {!multiple && value[0] && (
        <div className="mt-1 flex items-center gap-2 text-xs text-steel-600">
          <span className="truncate">Selected: {value[0].label}</span>
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-brand-600 hover:underline"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
};

// ── FileUpload ──────────────────────────────────────────────────────────────

export interface FileUploadProps {
  /** Should upload and resolve the Knack asset id. */
  onUpload: (file: File) => Promise<{ id: string; filename: string }>;
  value?: { id: string; filename: string } | null;
  onChange: (value: { id: string; filename: string } | null) => void;
  accept?: string;
  /** Field service: opens the camera directly on mobile. */
  capture?: boolean;
  disabled?: boolean;
}

export const FileUpload = ({
  onUpload,
  value,
  onChange,
  accept,
  capture,
  disabled,
}: FileUploadProps) => {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await onUpload(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-steel-300 px-3 py-2 text-sm">
        <span className="truncate text-steel-700">{value.filename}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="shrink-0 text-brand-600 hover:underline"
          disabled={disabled}
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        className={cx(
          'flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-steel-300 px-3 py-6 text-sm text-steel-600',
          'hover:border-brand-400 hover:bg-brand-50/40 focus-within:ring-2 focus-within:ring-brand-500',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <ArrowUpTrayIcon className="h-5 w-5" aria-hidden="true" />
        {busy ? 'Uploading…' : 'Choose a file'}
      </label>
      <input
        id={inputId}
        type="file"
        className="sr-only"
        accept={accept}
        capture={capture ? 'environment' : undefined}
        disabled={disabled || busy}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
};
