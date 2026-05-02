'use server'

import {
  completeSignupStep2,
  saveSignupStep1,
  signupError,
  type SignupStep1Input,
  type SignupStep2Input,
  type SignupResult,
} from "@/lib/auth/register";

export async function submitSignupStep1(data: SignupStep1Input): Promise<SignupResult> {
  try {
    return await saveSignupStep1(data);
  } catch (error) {
    console.error("[signup-step1]", error);
    return { success: false, error: signupError(error, "Could not start registration") };
  }
}

export async function submitSignupStep2(
  data: SignupStep2Input
): Promise<SignupResult> {
  try {
    return await completeSignupStep2(data);
  } catch (error: any) {
    console.error("[signup-step2]", error);
    if (error?.code === "P2002") {
      return { success: false, error: "This registration already exists. Try logging in or use a different email/Reg ID." };
    }
    return { success: false, error: signupError(error) };
  }
}
