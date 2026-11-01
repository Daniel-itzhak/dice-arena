import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only auto-unmounts when the test runner exposes a global `afterEach`.
afterEach(() => {
  cleanup();
});
