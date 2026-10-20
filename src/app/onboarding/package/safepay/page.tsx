// The SafePay sandbox card page, served inside onboarding: the onboarding guard (proxy.ts) keeps owners who have
// not finished setup on /onboarding/*, so a package bought during setup pays here. Same page as /safepay.
export { default } from "../../../safepay/page";
