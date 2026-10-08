# Campus Email and Phone Validation Fix

## Summary
Fixed missing validation for Phone Number and Email fields when adding/editing campuses across the application.

## Changes Made

### 1. Client-Side Validation

#### `/src/app/onboarding/page.tsx`
Added validation in the `addCampus` function:
- **Email validation**: Checks for valid email format using regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- **Phone validation**: Validates phone number length (7-15 digits after removing non-digit characters)
- Error messages displayed via toast notifications

#### `/src/app/super/page.tsx`
Added validation in the `handleAddCampus` function:
- **Email validation**: For both campus email and admin email fields
- **Phone validation**: Ensures phone number has valid length (7-15 digits)
- Error messages displayed via toast notifications

#### `/src/components/settings/InstitutionSettingsPanel.tsx`
Enhanced the `blockedReason` validation in the CampusDialog component:
- **Email validation**: Prevents saving invalid email addresses
- **Phone validation**: Prevents saving phone numbers that are too short or too long
- Validation messages prevent form submission until fixed

### 2. Server-Side Validation

#### `/src/lib/school/details.ts`
Added new helper function `assertPhone`:
```typescript
export function assertPhone(value: string | null, field: string) {
  if (value) {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 7) throw new Error(`${field} is too short to be valid.`);
    if (digits.length > 15) throw new Error(`${field} is too long to be valid.`);
  }
  return value;
}
```

#### `/src/app/actions/addCampus.ts`
Enhanced the `addCampus` server action:
- Added phone number validation using digit count (7-15 digits)
- Email validation was already present
- Throws descriptive errors for invalid inputs

#### `/src/app/actions/settings.ts`
Updated the `updateCampusDetails` function:
- Imported and applied `assertPhone` helper
- Phone validation now enforced when updating campus details
- Consistent validation with campus creation

#### `/src/app/actions/completeOnboarding.ts`
Enhanced the `finishOnboarding` function:
- Imported `assertEmail` and `assertPhone` helpers
- Validates email and phone for each campus during onboarding
- Prevents invalid data from being persisted during initial setup

## Validation Rules

### Email Validation
- **Pattern**: Must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- **Examples of valid emails**: 
  - `campus@school.edu.pk`
  - `admin@example.com`
- **Examples of invalid emails**:
  - `invalid` (no @ or domain)
  - `test@` (no domain)
  - `@example.com` (no local part)

### Phone Validation
- **Length**: 7-15 digits (after removing formatting characters)
- **Format**: Accepts various formats with spaces, dashes, parentheses, and country codes
- **Examples of valid phones**:
  - `+92 300 1234567` (13 digits)
  - `03001234567` (11 digits)
  - `+1-234-567-8900` (11 digits)
- **Examples of invalid phones**:
  - `123` (too short, only 3 digits)
  - `12345678901234567` (too long, 17 digits)

## Testing Recommendations

1. **Email Field Tests**:
   - Enter valid email addresses → should accept
   - Enter invalid formats → should show error
   - Leave field empty (optional) → should accept
   - Enter email without @ symbol → should show error
   - Enter email without domain → should show error

2. **Phone Field Tests**:
   - Enter valid phone numbers with various formats → should accept
   - Enter less than 7 digits → should show "too short" error
   - Enter more than 15 digits → should show "too long" error
   - Leave field empty (optional) → should accept
   - Enter phone with country code and formatting → should accept

3. **Integration Tests**:
   - Test campus creation in onboarding flow
   - Test campus creation in super admin panel
   - Test campus editing in settings panel
   - Verify server-side validation catches invalid data

## Error Messages

- **Invalid email**: "Please enter a valid email address."
- **Phone too short**: "Phone number is too short to be valid."
- **Phone too long**: "Phone number is too long to be valid."
- **Invalid campus email (server)**: "Enter a valid campus email address."
- **Invalid admin email (server)**: "Enter a valid campus admin email address."

## Files Modified

1. `/src/app/onboarding/page.tsx`
2. `/src/app/super/page.tsx`
3. `/src/components/settings/InstitutionSettingsPanel.tsx`
4. `/src/lib/school/details.ts`
5. `/src/app/actions/addCampus.ts`
6. `/src/app/actions/settings.ts`
7. `/src/app/actions/completeOnboarding.ts`

## Impact

- **User Experience**: Users now receive immediate feedback when entering invalid email or phone data
- **Data Quality**: Prevents invalid contact information from being stored in the database
- **Consistency**: Same validation rules applied across all campus creation/editing flows
- **Security**: Server-side validation ensures clients cannot bypass validation

## Notes

- Email and phone fields remain optional (can be left empty)
- Validation only triggers when fields contain data
- Phone validation is permissive about formatting (accepts +, -, spaces, parentheses)
- Only digit count is validated for phone numbers, not specific country formats
- Validation messages are user-friendly and actionable
