export type OtpLanguage = "en" | "ur" | "ar";

export function otpLanguage(value: unknown): OtpLanguage {
  return value === "ur" || value === "ar" ? value : "en";
}

/** SMS fallback body. The code leads so it is visible in the notification preview. */
export function smsBody(code: string, lang: OtpLanguage, ttlMinutes: number) {
  switch (lang) {
    case "ur": return `${code} آپ کا Skoolee سائن اِن کوڈ ہے۔ یہ ${ttlMinutes} منٹ میں ختم ہو جائے گا۔ یہ کوڈ کسی کو نہ بتائیں۔`;
    case "ar": return `${code} هو رمز تسجيل الدخول إلى Skoolee. تنتهي صلاحيته خلال ${ttlMinutes} دقائق. لا تشارك هذا الرمز مع أحد.`;
    default: return `${code} is your Skoolee sign-in code. It expires in ${ttlMinutes} minutes. Do not share this code.`;
  }
}
