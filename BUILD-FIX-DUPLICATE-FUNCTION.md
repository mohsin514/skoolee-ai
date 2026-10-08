# Build Fix: Duplicate Function Error

## Issue
Build was failing on Vercel with the following error:

```
Error: Turbopack build failed with 1 errors:
./src/lib/email/smtp.ts:193:10
the name `getEmailDomain` is defined multiple times
```

## Root Cause
The function `getEmailDomain()` was defined twice in `/src/lib/email/smtp.ts`:
- First definition: Line 16
- Duplicate definition: Line 193 (removed)

Both functions had identical implementations:
```typescript
function getEmailDomain() {
  const fromEmail = getFromEmail();
  const domain = fromEmail.split('@')[1];
  return domain || 'skoolee.ai';
}
```

## Solution
Removed the duplicate function definition at line 193, keeping only the first definition at line 16.

## File Changed
- `/src/lib/email/smtp.ts`

## Verification
- Searched for `function getEmailDomain` in the file
- Confirmed only one definition exists
- The function is used in `buildMimeMessage()` and `connect()` functions

## Impact
This fix resolves the build error and allows the deployment to proceed on Vercel.

## Related Files
The `smtp.ts` file is imported by:
- `./src/lib/email.ts`
- `./src/app/api/students/route.ts`
- `./src/app/actions/invite.ts`

All these imports will now work correctly with the single function definition.
