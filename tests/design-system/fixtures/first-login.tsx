import React from "react";
import { createRoot } from "react-dom/client";
import FirstLoginPage from "@/app/(auth)/first-login/page";

createRoot(document.getElementById("first-login-fixture")!).render(<FirstLoginPage />);
