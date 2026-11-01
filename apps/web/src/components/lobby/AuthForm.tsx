import {
  AuthCredentialsSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  type AuthCredentialsDto,
} from '@dice-arena/shared';
import { Eye, EyeOff } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { authApi } from '../../api/client';
import { describeError } from '../../errors';
import type { SlotId } from '../../store/useArenaStore';
import { PRIMARY_BUTTON } from '../ui/buttonStyles';
import { ErrorMessage } from '../ui/ErrorMessage';
import { SegmentedControl } from '../ui/SegmentedControl';
import { TextField } from '../ui/TextField';

type AuthMode = 'login' | 'register';

const AUTH_MODES = [
  { value: 'login', label: 'Sign in' },
  { value: 'register', label: 'Register' },
] as const;

type FieldErrors = Partial<Record<keyof AuthCredentialsDto, string>>;

interface AuthFormProps {
  slot: SlotId;
  playerLabel: string;
  /** The human signed in on the other slot. Their username is refused here before anything is sent. */
  otherPlayer: { username: string; label: string } | null;
}

export function AuthForm({ slot, playerLabel, otherPlayer }: AuthFormProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isRegister = mode === 'register';

  function changeMode(next: AuthMode): void {
    setMode(next);
    setFieldErrors({});
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const parsed = AuthCredentialsSchema.safeParse({ username, password });
    if (!parsed.success) {
      const { fieldErrors: issues } = z.flattenError(parsed.error);
      setFieldErrors({ username: issues.username?.[0], password: issues.password?.[0] });
      return;
    }
    if (otherPlayer !== null && parsed.data.username === otherPlayer.username) {
      setFieldErrors({ username: `${otherPlayer.username} is already signed in as ${otherPlayer.label}` });
      return;
    }

    setFieldErrors({});
    setPending(true);
    try {
      await authApi[mode](slot, parsed.data);
    } catch (error) {
      setFormError(describeError(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      noValidate
      aria-label={`${playerLabel} ${isRegister ? 'registration' : 'sign in'}`}
      onSubmit={(event) => void handleSubmit(event)}
      className="flex flex-col gap-4"
    >
      <SegmentedControl
        label={`${playerLabel} account`}
        options={AUTH_MODES}
        value={mode}
        onChange={changeMode}
        disabled={pending}
      />
      <TextField
        label="Username"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={USERNAME_MAX_LENGTH}
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        disabled={pending}
        error={fieldErrors.username}
        hint={isRegister ? `${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} letters or numbers` : undefined}
      />
      <TextField
        label="Password"
        name="password"
        type={showPassword ? 'text' : 'password'}
        autoComplete={isRegister ? 'new-password' : 'current-password'}
        maxLength={PASSWORD_MAX_LENGTH}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={pending}
        error={fieldErrors.password}
        hint={isRegister ? `At least ${PASSWORD_MIN_LENGTH} characters` : undefined}
        trailing={
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setShowPassword((current) => !current)}
            disabled={pending}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:opacity-50"
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        }
      />
      {formError !== null && <ErrorMessage>{formError}</ErrorMessage>}
      <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
        {submitLabel(mode, pending, playerLabel)}
      </button>
    </form>
  );
}

function submitLabel(mode: AuthMode, pending: boolean, playerLabel: string): string {
  if (mode === 'login') {
    return pending ? 'Signing in…' : `Sign in as ${playerLabel}`;
  }
  return pending ? 'Creating account…' : `Create ${playerLabel} account`;
}
