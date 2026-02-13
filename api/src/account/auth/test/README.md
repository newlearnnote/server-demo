# Test Code

> Not all functions are covered by tests.
> Only logic that handles important data or complex logic is tested.

## Running Tests

### Run all auth tests

```
npx jest src/auth/test/*
```

### Run password-validate

> Tests password format validation logic.

```
npx jest src/auth/test/password-validate.spec.ts
```

### Run update-password

> Tests the password update logic in AuthService.

```
npx jest src/auth/test/update-password.spec.ts
```

### Run google-login

> Tests Google OAuth user validation and login logic in AuthService.

```
npx jest src/auth/test/validate-google-user.spec.ts
```
