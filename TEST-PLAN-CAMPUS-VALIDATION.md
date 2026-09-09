# Test Plan: Campus Email and Phone Validation

## Overview
This test plan covers validation for the Phone Number and Email fields when adding or editing campus information across all flows in the application.

## Test Environments
1. **Onboarding Page** (`/onboarding`) - Multi-campus setup
2. **Super Admin Page** (`/super`) - Adding campus to existing school
3. **Settings Panel** - Editing existing campus details

---

## Test Cases

### TC-001: Valid Email Address
**Location**: All campus forms  
**Steps**:
1. Navigate to campus form
2. Enter a valid email (e.g., `campus@school.edu.pk`)
3. Fill in other required fields
4. Submit the form

**Expected Result**: ✅ Form submits successfully, no validation errors

---

### TC-002: Invalid Email - Missing @ Symbol
**Location**: All campus forms  
**Steps**:
1. Navigate to campus form
2. Enter email without @ (e.g., `campusschool.edu.pk`)
3. Fill in other required fields
4. Submit the form

**Expected Result**: ❌ Error message: "Please enter a valid email address."

---

### TC-003: Invalid Email - Missing Domain
**Location**: All campus forms  
**Steps**:
1. Navigate to campus form
2. Enter email without domain (e.g., `campus@`)
3. Fill in other required fields
4. Submit the form

**Expected Result**: ❌ Error message: "Please enter a valid email address."

---

### TC-004: Invalid Email - Missing Local Part
**Location**: All campus forms  
**Steps**:
1. Navigate to campus form
2. Enter email without local part (e.g., `@school.edu.pk`)
3. Fill in other required fields
4. Submit the form

**Expected Result**: ❌ Error message: "Please enter a valid email address."

---

### TC-005: Empty Email Field
**Location**: All campus forms  
**Steps**:
1. Navigate to campus form
2. Leave email field empty
3. Fill in other required fields
4. Submit the form

**Expected Result**: ✅ Form submits successfully (email is optional)

---

### TC-006: Valid Phone Number - With Country Code
**Location**: All campus forms  
**Steps**:
1. Navigate to campus form
2. Enter phone with country code (e.g., `+92 300 1234567`)
3. Fill in other required fields
4. Submit the form

**Expected Result**: ✅ Form submits successfully, no validation errors

---

### TC-007: Valid Phone Number - Without Formatting
**Location**: All campus forms  
**Steps**:
1. Navigate to campus form
2. Enter phone without formatting (e.g., `03001234567`)
3. Fill in other required fields
4. Submit the form

**Expected Result**: ✅ Form submits successfully, no validation errors

---

### TC-008: Valid Phone Number - With Formatting
**Location**: All campus forms  
**Steps**:
1. Navigate to campus form
2. Enter phone with dashes/spaces (e.g., `+1-234-567-8900`)
3. Fill in other required fields
4. Submit the form

**Expected Result**: ✅ Form submits successfully, no validation errors

---

### TC-009: Invalid Phone - Too Short
**Location**: All campus forms  
**Steps**:
1. Navigate to campus form
2. Enter phone with less than 7 digits (e.g., `123`)
3. Fill in other required fields
4. Submit the form

**Expected Result**: ❌ Error message: "Phone number is too short to be valid."

---

### TC-010: Invalid Phone - Too Long
**Location**: All campus forms  
**Steps**:
1. Navigate to campus form
2. Enter phone with more than 15 digits (e.g., `12345678901234567`)
3. Fill in other required fields
4. Submit the form

**Expected Result**: ❌ Error message: "Phone number is too long to be valid."

---

### TC-011: Empty Phone Field
**Location**: All campus forms  
**Steps**:
1. Navigate to campus form
2. Leave phone field empty
3. Fill in other required fields
4. Submit the form

**Expected Result**: ✅ Form submits successfully (phone is optional)

---

### TC-012: Phone with Only Formatting Characters
**Location**: All campus forms  
**Steps**:
1. Navigate to campus form
2. Enter only formatting characters (e.g., `+- ()`)
3. Fill in other required fields
4. Submit the form

**Expected Result**: ❌ Error message: "Phone number is too short to be valid."

---

### TC-013: Both Email and Phone Invalid
**Location**: All campus forms  
**Steps**:
1. Navigate to campus form
2. Enter invalid email (e.g., `invalid`)
3. Enter invalid phone (e.g., `123`)
4. Fill in other required fields
5. Submit the form

**Expected Result**: ❌ Error message for the first invalid field encountered (email)

---

### TC-014: Edit Campus with Valid Changes
**Location**: Settings Panel  
**Steps**:
1. Navigate to institution settings
2. Click edit on existing campus
3. Change email to valid address
4. Change phone to valid number
5. Save changes

**Expected Result**: ✅ Changes saved successfully

---

### TC-015: Edit Campus with Invalid Email
**Location**: Settings Panel  
**Steps**:
1. Navigate to institution settings
2. Click edit on existing campus
3. Change email to invalid format (e.g., `notanemail`)
4. Try to save changes

**Expected Result**: ❌ Save button disabled with reason: "Enter a valid email address."

---

### TC-016: Edit Campus with Invalid Phone
**Location**: Settings Panel  
**Steps**:
1. Navigate to institution settings
2. Click edit on existing campus
3. Change phone to too short (e.g., `12345`)
4. Try to save changes

**Expected Result**: ❌ Save button disabled with reason: "Phone number is too short to be valid."

---

### TC-017: Server-Side Validation Bypass Attempt
**Location**: API endpoint  
**Steps**:
1. Use API client (e.g., Postman)
2. Send POST request to campus creation endpoint
3. Include invalid email and phone in payload
4. Submit request

**Expected Result**: ❌ Server returns error with descriptive message

---

### TC-018: Onboarding Multi-Campus with Mixed Validity
**Location**: Onboarding page  
**Steps**:
1. Add first campus with valid email and phone
2. Add second campus with invalid email
3. Try to proceed to next step

**Expected Result**: ❌ Cannot add second campus, validation error shown

---

### TC-019: Super Admin Add Campus with Admin Email
**Location**: Super admin page  
**Steps**:
1. Navigate to super admin page
2. Click "Add Campus"
3. Fill campus details
4. Enter invalid admin email (e.g., `admin@`)
5. Submit

**Expected Result**: ❌ Error message: "Please enter a valid admin email address."

---

### TC-020: Whitespace Trimming
**Location**: All campus forms  
**Steps**:
1. Navigate to campus form
2. Enter email with leading/trailing spaces (e.g., `  campus@school.edu.pk  `)
3. Enter phone with spaces (e.g., `  +92 300 1234567  `)
4. Fill other required fields
5. Submit

**Expected Result**: ✅ Form submits successfully, whitespace is trimmed

---

## Test Matrix

| Test Case | Onboarding | Super Admin | Settings | Priority |
|-----------|------------|-------------|----------|----------|
| TC-001    | ✓          | ✓           | ✓        | High     |
| TC-002    | ✓          | ✓           | ✓        | High     |
| TC-003    | ✓          | ✓           | ✓        | High     |
| TC-004    | ✓          | ✓           | ✓        | High     |
| TC-005    | ✓          | ✓           | ✓        | Medium   |
| TC-006    | ✓          | ✓           | ✓        | High     |
| TC-007    | ✓          | ✓           | ✓        | High     |
| TC-008    | ✓          | ✓           | ✓        | Medium   |
| TC-009    | ✓          | ✓           | ✓        | High     |
| TC-010    | ✓          | ✓           | ✓        | High     |
| TC-011    | ✓          | ✓           | ✓        | Medium   |
| TC-012    | ✓          | ✓           | ✓        | Medium   |
| TC-013    | ✓          | ✓           | ✓        | Medium   |
| TC-014    | -          | -           | ✓        | High     |
| TC-015    | -          | -           | ✓        | High     |
| TC-016    | -          | -           | ✓        | High     |
| TC-017    | ✓          | ✓           | ✓        | High     |
| TC-018    | ✓          | -           | -        | Medium   |
| TC-019    | -          | ✓           | -        | High     |
| TC-020    | ✓          | ✓           | ✓        | Medium   |

---

## Edge Cases to Consider

1. **International Phone Numbers**: Various country codes (+1, +44, +92, etc.)
2. **Email Case Sensitivity**: Mixed case emails should be accepted
3. **Special Characters in Email**: Valid special characters (., _, -, +) should work
4. **Phone with Extensions**: Numbers like `+1-234-567-8900 ext. 123`
5. **Very Long Valid Emails**: Email addresses near typical length limits
6. **Copy-Paste with Hidden Characters**: Non-visible unicode characters

---

## Regression Tests

After implementing the fix, verify that:
1. Existing campus records with no email/phone still display correctly
2. Existing campus records with valid email/phone can still be edited
3. Other campus fields (name, city, address, etc.) still validate correctly
4. Campus deletion still works
5. Campus listing and filtering still work

---

## Automated Test Suggestions

### Unit Tests
```typescript
describe('Campus Validation', () => {
  test('should accept valid email', () => {
    expect(validateEmail('test@example.com')).toBe(true);
  });
  
  test('should reject invalid email', () => {
    expect(validateEmail('invalid')).toBe(false);
  });
  
  test('should accept valid phone', () => {
    expect(validatePhone('+92 300 1234567')).toEqual({ valid: true });
  });
  
  test('should reject short phone', () => {
    expect(validatePhone('123')).toEqual({ 
      valid: false, 
      error: 'too short' 
    });
  });
});
```

### Integration Tests
- Test form submission with Cypress/Playwright
- Test API endpoints with Supertest
- Test database constraints

---

## Performance Considerations

1. Validation should not block UI thread
2. Validation should provide immediate feedback (on blur or on submit)
3. Server-side validation should return within 200ms
4. Multiple campus additions should handle validation efficiently

---

## Accessibility Testing

1. Validation error messages should be announced by screen readers
2. Error messages should have proper ARIA attributes
3. Form fields should have proper labels and associations
4. Keyboard navigation should work through validation errors

---

## Notes

- All validation is case-insensitive for emails
- Phone validation accepts various international formats
- Validation messages are user-friendly and actionable
- Both client-side and server-side validation are implemented
- Email and phone fields remain optional (can be empty)
