# Testing Guidelines

## Framework

- We use Playwright with TypeScript for all e2e tests.
- Tests live in the `tests/` directory.
- Page objects are in `tests/pages/`.

## Conventions

- Use `test.describe` blocks to group related tests.
- Use role-based locators (`getByRole`, `getByLabel`, `getByTestId`) over CSS selectors.
- Every test must have a meaningful name describing the user action and expected result.
- Use `test.beforeEach` for common navigation and setup.

## Running tests

- Run all tests: `npx playwright test`
- Run specific file: `npx playwright test tests/checkout.spec.ts`
- Run in headed mode: `npx playwright test --headed`

## Dependencies

- Run `npm ci` to install all dependencies.
- Run `npx playwright install --with-deps` to install browser binaries.
