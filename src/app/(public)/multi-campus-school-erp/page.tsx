import type { Metadata } from "next";
import { Building2, Shield, Users } from "lucide-react";
import { ProductPage } from "../product-page";

export const metadata: Metadata = {
  title: "Multi-Campus School ERP",
  description: "Manage multi-campus school groups with campus limits, role-based admins, principals, teachers, students, and network analytics.",
  alternates: { canonical: "https://skooleeai.com/" },
  keywords: ["multi-campus school ERP", "school group software", "campus management software", "school ERP Pakistan"],
};

export default function Page() {
  return (
    <ProductPage
      copy={{
        eyebrow: "Multi-campus school ERP",
        title: "Give school groups one control center for every campus.",
        description:
          "Owners can create campuses, invite campus admins and principals, compare performance, track AI usage, and keep each branch scoped to its own records.",
        highlights: ["Campus limits by plan", "School owner and campus admin roles", "Per-campus student and staff counts", "Enterprise-ready unlimited structure"],
        sections: [
          { icon: Building2, title: "Campus control", body: "Create branch records with city, address, board, registration identity, logo, and scoped operational data." },
          { icon: Shield, title: "Role boundaries", body: "Super admins manage the network while campus admins, principals, teachers, parents, and students see the right level of access." },
          { icon: Users, title: "People at scale", body: "Track students, teachers, principal assignments, pending invites, and campus setup without mixing school data across branches." },
        ],
        proof: ["Free and Basic keep one campus.", "Pro supports multi-campus growth.", "Enterprise is structured for unlimited campuses."],
      }}
    />
  );
}
