import { redirect } from "next/navigation";

export default function SuperBillingPage() {
  redirect("/super?view=billing");
}
