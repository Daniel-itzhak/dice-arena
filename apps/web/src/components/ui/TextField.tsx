import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {
  label: string;
  /** Replaces `hint` and marks the input invalid. */
  error?: string | undefined;
  hint?: string | undefined;
  /** Control drawn inside the field, on the trailing edge. */
  trailing?: ReactNode;
}

export function TextField({ label, error, hint, trailing, ...input }: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;
  const invalid = error !== undefined;

  const field = (
    <input
      id={id}
      {...input}
      aria-invalid={invalid}
      aria-describedby={message === undefined ? undefined : messageId}
      className={`w-full rounded-xl border bg-slate-950/70 px-3.5 py-2.5 text-slate-100 outline-none transition placeholder:text-slate-600 focus:ring-2 disabled:opacity-60 ${
        trailing === undefined ? '' : 'pr-11'
      } ${
        invalid
          ? 'border-rose-500/70 focus:ring-rose-500/30'
          : 'border-slate-700 focus:border-slate-500 focus:ring-slate-500/30'
      }`}
    />
  );

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-300">
        {label}
      </label>
      {trailing === undefined ? (
        field
      ) : (
        <div className="relative">
          {field}
          <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>
        </div>
      )}
      {message !== undefined && (
        <p id={messageId} className={`text-xs ${invalid ? 'text-rose-300' : 'text-slate-500'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
