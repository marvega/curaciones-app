import { test, expect } from '@playwright/test';

/** Compute the Chilean RUT check digit for a numeric body string. */
function rutCheckDigit(body: string): string {
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return '0';
  if (remainder === 10) return 'K';
  return String(remainder);
}

test.describe('Patient Management', () => {
  // Uses the pre-authenticated storageState from auth.setup.ts
  // (no need to login in beforeEach — already authenticated via localStorage)

  test('should navigate to patients list', async ({ page }) => {
    await page.goto('/pacientes');
    await expect(page).toHaveURL('/pacientes');
    await expect(
      page.getByRole('heading', { name: 'Todos los Pacientes' }),
    ).toBeVisible({ timeout: 5000 });
  });

  test('should create a new patient', async ({ page }) => {
    await page.goto('/paciente/nuevo');
    await expect(page.locator('h2')).toHaveText('Nuevo Paciente', {
      timeout: 5000,
    });

    // Generate a valid, unique RUT body using timestamp-based digits
    const body = `99${Date.now().toString().slice(-6)}`;

    // Type RUT character by character so React's onChange formatter works
    const rutInput = page.locator('input[name="rut"]');
    await rutInput.click();
    await rutInput.pressSequentially(body + rutCheckDigit(body), {
      delay: 20,
    });

    await page.locator('input[name="firstName"]').fill('Playwright');
    await page.locator('input[name="lastName"]').fill('TestUser');
    await page.locator('input[name="birthDate"]').fill('1990-01-01');
    await page.locator('select[name="gender"]').selectOption('Masculino');

    await page.getByRole('button', { name: 'Guardar Paciente' }).click();

    // After creation the app redirects to /paciente/:id
    await expect(page).toHaveURL(/\/paciente\/\d+/, { timeout: 10000 });
  });
});
