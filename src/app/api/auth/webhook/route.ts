import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createTenantSchema } from "@/lib/db/tenant";

// NOTE: In production, verify the Clerk webhook signature using 'svix'.
// For now, we trust the payload for development speed.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, data } = body;

    console.log(`[Clerk Webhook] ${type}: ${data.id}`);

    switch (type) {
      case "organization.created": {
        // 🏫 School Registration Flow - Phase 1: Record Metadata
        const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const schemaName = `school_${data.id.toLowerCase().replace('org_', '')}`;

        await prisma.tenant.create({
          data: {
            id: data.id,
            name: data.name,
            slug: slug,
            schemaName: schemaName,
          },
        });

        // 🏫 School Registration Flow - Phase 2: Provision SQL Schema
        await createTenantSchema(schemaName);
        break;
      }

      case "organizationMembership.created": {
        // 👥 User Management Flow: Link user to Org context
        const clerkUserId = data.public_user_data.user_id;
        const orgId = data.organization.id;
        const role = data.role === 'admin' ? 'ADMIN' : 'TEACHER';

        await prisma.user.upsert({
          where: { clerkId: clerkUserId },
          update: { 
            tenantId: orgId,
            role: role as any,
          },
          create: {
            clerkId: clerkUserId,
            email: data.public_user_data.identifier || 'unknown@clerk.user',
            tenantId: orgId,
            role: role as any,
          }
        });
        break;
      }

      case "user.created": {
        // Initial user sync without tenant context
        const email = data.email_addresses?.[0]?.email_address;
        if (email) {
          await prisma.user.upsert({
            where: { clerkId: data.id },
            update: { email },
            create: {
              clerkId: data.id,
              email,
              firstName: data.first_name,
              lastName: data.last_name,
              tenantId: 'PENDING', // Will be updated when they join/create an org
            }
          });
        }
        break;
      }

      case "user.deleted": {
        await prisma.user.deleteMany({ where: { clerkId: data.id } });
        break;
      }

      default:
        console.log(`[Clerk Webhook] Handled: ${type}`);
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("[auth/webhook] Error:", error);
    return Response.json({ error: "Webhook failed" }, { status: 500 });
  }
}
