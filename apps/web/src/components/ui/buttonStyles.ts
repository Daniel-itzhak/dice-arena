const BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export const PRIMARY_BUTTON = `${BASE} bg-amber-400 px-4 py-2.5 text-slate-950 hover:bg-amber-300 focus-visible:outline-amber-300 disabled:hover:bg-amber-400`;

export const SECONDARY_BUTTON = `${BASE} border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500 hover:bg-slate-800 focus-visible:outline-slate-400`;
