import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  // These tests run without pre-loaded auth state (unauthenticated)
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should show login form and redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/login', { timeout: 5000 });
    await expect(page.getByPlaceholder('Usuario')).toBeVisible();
    await expect(page.getByPlaceholder('Contraseña')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Iniciar sesión' }),
    ).toBeVisible();
  });

  test('should show error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Usuario').fill('bad');
    await page.getByPlaceholder('Contraseña').fill('bad');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.locator('.text-rose-600')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Authenticated redirect', () => {
  // Uses the pre-authenticated storageState — already logged in via setup
  test('should redirect away from login when already authenticated', async ({ page }) => {
    await page.goto('/login');
    // LoginPage has <Navigate to={from} replace /> when user is set
    await expect(page).toHaveURL('/', { timeout: 5000 });
  });
});
