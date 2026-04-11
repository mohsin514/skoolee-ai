import os

files_to_fix = [
    "src/app/api/ai/credits/route.ts",
    "src/app/api/whatsapp/route.ts",
    "src/app/api/stripe/webhook/route.ts",
    "src/app/api/stripe/portal/route.ts",
    "src/app/api/stripe/checkout/route.ts",
    "src/workers/remark-worker.ts"
]

for file_path in files_to_fix:
    if not os.path.exists(file_path):
        continue
    with open(file_path, "r") as f:
        content = f.read()
    
    # 1. Replace prisma.tenant with prisma.school
    content = content.replace("prisma.tenant", "prisma.school")
    
    # 2. Replace tenant.id with tenant.schoolId in where clauses
    # (Matches: where: { id: tenant.id })
    content = content.replace("where: { id: tenant.id }", "where: { id: tenant.schoolId }")
    content = content.replace("tenantId: tenant.id", "schoolId: tenant.schoolId")
    content = content.replace("metadata?.tenantId", "metadata?.schoolId")
    content = content.replace("metadata: { tenantId", "metadata: { schoolId")
    content = content.replace("const tenantId =", "const schoolId =")
    content = content.replace("if (!tenantId)", "if (!schoolId)")
    content = content.replace("where: { id: tenantId }", "where: { id: schoolId }")
    content = content.replace("[Stripe] Tenant {tenantId}", "[Stripe] School {schoolId}")

    # Specific fix for stripe checkout where it uses tenantRecord
    content = content.replace("tenantRecord?.email", "tenantRecord?.contactEmail")

    with open(file_path, "w") as f:
        f.write(content)
