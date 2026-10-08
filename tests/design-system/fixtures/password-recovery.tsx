import React from "react";
import { createRoot } from "react-dom/client";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";

createRoot(document.getElementById("recovery-fixture")!).render(<ForgotPasswordPage />);
