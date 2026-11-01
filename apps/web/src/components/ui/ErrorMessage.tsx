import type { ReactNode } from 'react';

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200 ring-1 ring-rose-500/30">
      {children}
    </p>
  );
}
