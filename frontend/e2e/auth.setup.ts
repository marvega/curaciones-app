import { test as setup, expect } from '@playwright/test';

/**
 * Global auth setup: logs in once and saves the storageState (localStorage)
 * so that subsequent tests can reuse the authenticated session without
 * hitting the login endpoint repeatedly.
 */
setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Usuario').fill('admin');
  await page.getByPlaceholder('Contraseña').fill('A}B5sxY%2=qy');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/', { timeout: 10000 });

  // Persist the authenticated state (localStorage with token) for reuse
  await page.context().storageState({ path: 'e2e/.auth/state.json' });
});
