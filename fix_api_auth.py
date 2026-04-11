import os

api_files = [
    "src/app/api/classes/route.ts",
    "src/app/api/students/route.ts",
    "src/app/api/subjects/route.ts",
    "src/app/api/ai/credits/route.ts",
    "src/app/api/whatsapp/route.ts",
    "src/app/api/stripe/portal/route.ts",
    "src/app/api/stripe/checkout/route.ts"
]

for file_path in api_files:
    if not os.path.exists(file_path):
        continue
    with open(file_path, "r") as f:
        content = f.read()
    
    # Replace import
    content = content.replace('import { auth } from "@clerk/nextjs/server";', 'import { getAuthUser } from "@/lib/auth";')
    
    # Replace auth() call
    content = content.replace('const { userId } = await auth();', 'const user = await getAuthUser();\n    const userId = user?.userId;')
    
    with open(file_path, "w") as f:
        f.write(content)
