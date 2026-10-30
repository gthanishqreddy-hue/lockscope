import { useId, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  CircleDashed,
  Copy,
  Cpu,
  FlaskConical,
  HardDriveUpload,
  Info,
  Package,
  XCircle,
} from 'lucide-react';
import { SOURCE_DESCRIPTION, SOURCE_LABEL, type DatasetSource } from '../services/datasets';
import type { CheckStatus } from '../schemas/results';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
  labelledBy,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  const id = useId();
  const headingId = labelledBy ?? (title ? id : undefined);
  return (
    <section className={`card ${className ?? ''}`} aria-labelledby={headingId}>
      {(title || actions) && (
        <div className="card-header">
          <div>
            {title && <h2 id={headingId}>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const SOURCE_ICON: Record<DatasetSource, ReactNode> = {
  'bundled-sample': <Package size={13} aria-hidden />,
  'imported-file': <HardDriveUpload size={13} aria-hidden />,
  'live-engine': <Cpu size={13} aria-hidden />,
};

/** Shows where data came from; every chart and table that shows results carries one. */
export function SourceBadge({ source }: { source: DatasetSource }) {
  return (
    <span className={`badge badge-source-${source}`} title={SOURCE_DESCRIPTION[source]}>
      {SOURCE_ICON[source]}
      {SOURCE_LABEL[source]}
    </span>
  );
}

export function TheoryBadge() {
  return (
    <span
      className="badge badge-theory"
      title="Design-level description from the literature, not a measurement"
    >
      <BookOpen size={13} aria-hidden />
      Theory
    </span>
  );
}

export function SimulationBadge({ label = 'Browser simulation' }: { label?: string }) {
  return (
    <span
      className="badge badge-sim"
      title="Runs in your browser as a model of the algorithm's steps. It does not execute the Java engine."
    >
      <FlaskConical size={13} aria-hidden />
      {label}
    </span>
  );
}

type Tone = 'good' | 'warning' | 'critical' | 'neutral';

export function StatusText({ tone, children }: { tone: Tone; children: ReactNode }) {
  const icon =
    tone === 'good' ? (
      <CheckCircle2 size={14} aria-hidden />
    ) : tone === 'warning' ? (
      <AlertTriangle size={14} aria-hidden />
    ) : tone === 'critical' ? (
      <XCircle size={14} aria-hidden />
    ) : (
      <CircleDashed size={14} aria-hidden />
    );
  return (
    <span className={`status status-${tone}`}>
      {icon}
      {children}
    </span>
  );
}

/** Status of a correctness check; a negative control that failed is the expected outcome. */
export function CheckStatusText({
  status,
  negativeControl,
}: {
  status: CheckStatus;
  negativeControl: boolean;
}) {
  if (negativeControl) {
    return status === 'FAILED' ? (
      <StatusText tone="good">Control caught</StatusText>
    ) : (
      <StatusText tone="critical">Control missed</StatusText>
    );
  }
  switch (status) {
    case 'PASSED':
      return <StatusText tone="good">Passed</StatusText>;
    case 'FAILED':
      return <StatusText tone="critical">Failed</StatusText>;
    case 'TIMEOUT':
      return <StatusText tone="warning">Timed out</StatusText>;
    case 'ERROR':
      return <StatusText tone="critical">Error</StatusText>;
    default:
      return <StatusText tone="neutral">Cancelled</StatusText>;
  }
}

export function Callout({
  tone = 'info',
  children,
  title,
}: {
  tone?: 'info' | 'warning' | 'critical' | 'good';
  title?: string;
  children: ReactNode;
}) {
  const icon =
    tone === 'warning' ? (
      <AlertTriangle size={16} aria-hidden />
    ) : tone === 'critical' ? (
      <XCircle size={16} aria-hidden />
    ) : tone === 'good' ? (
      <CheckCircle2 size={16} aria-hidden />
    ) : (
      <Info size={16} aria-hidden />
    );
  return (
    <div className={`callout callout-${tone}`} role={tone === 'critical' ? 'alert' : undefined}>
      {icon}
      <div>
        {title && <strong style={{ color: 'var(--text-primary)' }}>{title}. </strong>}
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon}
      <strong style={{ color: 'var(--text-primary)' }}>{title}</strong>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint && <span className="small muted">{hint}</span>}
    </div>
  );
}

export function CopyBlock({ text, label = 'Copy command' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="copy-row">
      <pre className="code-block mono">{text}</pre>
      <button
        type="button"
        className="btn icon-btn"
        onClick={() => void copy()}
        aria-label={label}
        title={label}
      >
        {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
      </button>
      <span className="visually-hidden" role="status">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  error,
  hint,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  error?: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
      />
      {error ? (
        <span id={`${id}-err`} className="error">
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${id}-hint`} className="hint">
            {hint}
          </span>
        )
      )}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <span id={`${id}-err`} className="error">
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${id}-hint`} className="hint">
            {hint}
          </span>
        )
      )}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function CheckGroup({
  legend,
  options,
  selected,
  onChange,
  error,
}: {
  legend: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <fieldset aria-describedby={error ? `${id}-err` : undefined}>
      <legend>{legend}</legend>
      <div className="checks">
        {options.map((o) => (
          <label key={o.value} className="check">
            <input
              type="checkbox"
              checked={selected.includes(o.value)}
              onChange={(e) =>
                onChange(e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))
              }
            />
            {o.label}
          </label>
        ))}
      </div>
      {error && (
        <span id={`${id}-err`} className="error small" style={{ color: 'var(--critical-text)' }}>
          {error}
        </span>
      )}
    </fieldset>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  label,
  value,
  onChange,
  tabs,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: string }[];
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          tabIndex={value === t.value ? 0 : -1}
          onClick={() => onChange(t.value)}
          onKeyDown={(e) => {
            const i = tabs.findIndex((x) => x.value === value);
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
              if (next) onChange(next.value);
            }
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
