// ===========================================
// POST /api/auth/webhook – Clerk Webhook
// ===========================================
// Syncs Clerk user events with our database.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

// In production, verify the Clerk webhook signature.
// For now, we trust the event payload.

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses: Array<{ email_address: string }>;
    first_name: string | null;
    last_name: string | null;
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: ClerkWebhookEvent = await req.json();

    switch (body.type) {
      case "user.created": {
        // User created in Clerk — they'll be linked to a tenant during onboarding
        console.log(`[Clerk Webhook] User created: ${body.data.id}`);
        break;
      }

      case "user.updated": {
        const email = body.data.email_addresses?.[0]?.email_address;
        if (email) {
          await prisma.user.updateMany({
            where: { clerkId: body.data.id },
            data: {
              email,
              firstName: body.data.first_name,
              lastName: body.data.last_name,
            },
          });
        }
        break;
      }

      case "user.deleted": {
        await prisma.user.deleteMany({
          where: { clerkId: body.data.id },
        });
        break;
      }

      default:
        console.log(`[Clerk Webhook] Unhandled event: ${body.type}`);
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("[auth/webhook] Error:", error);
    return Response.json({ error: "Webhook failed" }, { status: 500 });
  }
}
