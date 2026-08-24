import { test as setup, expect } from '@playwright/test';

/**
 * Global auth setup: logs in once and saves the storageState (localStorage)
 * so that subsequent tests can reuse the authenticated session without
 * hitting the login endpoint repeatedly.
 */
// Credentials come from the environment. They used to be literals here, which
// put a real production password in a public repository — see
// docs/runbooks/2026-08-24-credential-exposure.md.
const USERNAME = process.env.E2E_USERNAME;
const PASSWORD = process.env.E2E_PASSWORD;

setup('authenticate', async ({ page }) => {
  if (!USERNAME || !PASSWORD) {
    throw new Error('E2E_USERNAME and E2E_PASSWORD must be set to run the browser e2e suite');
  }
  await page.goto('/login');
  await page.getByPlaceholder('Usuario').fill(USERNAME);
  await page.getByPlaceholder('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/', { timeout: 10000 });

  // Persist the authenticated state (localStorage with token) for reuse
  await page.context().storageState({ path: 'e2e/.auth/state.json' });
});
