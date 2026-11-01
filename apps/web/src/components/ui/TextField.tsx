import { useId, type InputHTMLAttributes } from 'react';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {
  label: string;
  /** Replaces `hint` and marks the input invalid. */
  error?: string | undefined;
  hint?: string | undefined;
}

export function TextField({ label, error, hint, ...input }: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;
  const invalid = error !== undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-300">
        {label}
      </label>
      <input
        id={id}
        {...input}
        aria-invalid={invalid}
        aria-describedby={message === undefined ? undefined : messageId}
        className={`rounded-xl border bg-slate-950/70 px-3.5 py-2.5 text-slate-100 outline-none transition placeholder:text-slate-600 focus:ring-2 disabled:opacity-60 ${
          invalid
            ? 'border-rose-500/70 focus:ring-rose-500/30'
            : 'border-slate-700 focus:border-slate-500 focus:ring-slate-500/30'
        }`}
      />
      {message !== undefined && (
        <p id={messageId} className={`text-xs ${invalid ? 'text-rose-300' : 'text-slate-500'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
