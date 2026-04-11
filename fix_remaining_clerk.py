import os

# 1. Fix sign-in and sign-up (Redirect to custom auth pages)
signin_path = "src/app/(auth)/sign-in/[[...sign-in]]/page.tsx"
if os.path.exists(signin_path):
    with open(signin_path, "w") as f:
        f.write('import { redirect } from "next/navigation";\n\nexport default function Page() {\n  redirect("/login");\n}\n')

signup_path = "src/app/(auth)/sign-up/[[...sign-up]]/page.tsx"
if os.path.exists(signup_path):
    with open(signup_path, "w") as f:
        f.write('import { redirect } from "next/navigation";\n\nexport default function Page() {\n  redirect("/register");\n}\n')

# 2. Fix dashboard settings/members (Remove Clerk OrganizationProfile)
members_path = "src/app/dashboard/settings/members/page.tsx"
if os.path.exists(members_path):
    with open(members_path, "r") as f:
        content = f.read()
    
    # Remove Clerk import
    content = content.replace('import { OrganizationProfile } from "@clerk/nextjs";', '// import { OrganizationProfile } from "@clerk/nextjs";')
    
    # Replace the component with a placeholder or simple text for now
    content = content.replace('<OrganizationProfile', '/* <OrganizationProfile')
    content = content.replace('appearance={{', '  /* appearance={{')
    content = content.replace('}}', '  }} */')
    content = content.replace('/>', '*/ <div className="p-8 text-center text-gray-500 font-medium bg-white rounded-3xl border border-gray-100 italic">Organization settings coming soon to custom auth engine.</div>')
    
    with open(members_path, "w") as f:
        f.write(content)
