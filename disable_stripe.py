import os

files_to_mock = [
    "src/app/api/stripe/checkout/route.ts",
    "src/app/api/stripe/portal/route.ts"
]

for file_path in files_to_mock:
    if not os.path.exists(file_path):
        continue
    with open(file_path, "w") as f:
        if "checkout" in file_path:
            f.write('export async function POST() {\n  return Response.json({ success: true, message: "Billing is temporarily disabled for maintenance." });\n}\n')
        else:
            f.write('export async function POST() {\n  return Response.json({ success: true, message: "Portal is temporarily disabled." });\n}\n')

# Clear webhook for safety
webhook_path = "src/app/api/stripe/webhook/route.ts"
if os.path.exists(webhook_path):
    with open(webhook_path, "w") as f:
        f.write('export async function POST() {\n  return Response.json({ received: true });\n}\n')
