import os

files_to_fix = [
    "src/app/api/students/route.ts",
    "src/app/api/whatsapp/route.ts",
    "src/workers/pdf-worker.ts",
    "src/workers/notification-worker.ts",
    "src/workers/remark-worker.ts"
]

for file_path in files_to_fix:
    if not os.path.exists(file_path):
        continue
    with open(file_path, "r") as f:
        content = f.read()
    
    # Identify context variable (tenant.schemaName vs schemaName)
    if "tenant.schemaName" in content:
        schema_var = "tenant.schemaName"
    else:
        schema_var = "schemaName"

    # Replace tenantExec( with tenantExec(schema_var, 
    content = content.replace("tenantExec(", f"tenantExec({schema_var}, ")
    
    with open(file_path, "w") as f:
        f.write(content)
