import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// React Testing Library: unmount após cada teste pra prevenir cross-test bleed.
afterEach(() => {
    cleanup();
});
