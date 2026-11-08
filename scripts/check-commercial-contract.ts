import { validateCommercialContract } from "@/config/commercial-contract";

const errors = validateCommercialContract();
if (errors.length) {
  console.error("Commercial contract validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("Commercial contract matches plan entitlements and credit reset policy.");
}
