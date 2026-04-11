export async function POST() {
  return Response.json({ success: true, message: "Billing is temporarily disabled for maintenance." });
}
