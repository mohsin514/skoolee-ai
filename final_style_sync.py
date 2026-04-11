with open('src/app/(auth)/register/page.tsx', 'r') as f:
    text = f.read()

# Ensure font-sans is on the root
text = text.replace('className="min-h-screen bg-[#fbf0fe] flex items-center justify-center p-4"', 'className="min-h-screen bg-[#fbf0fe] flex items-center justify-center p-4 font-sans"')

# Sync tracking-tight to tracking-wider for uppercase labels to match login
text = text.replace('text-[12px] font-bold uppercase tracking-tight', 'text-[12px] font-bold uppercase tracking-wider')

# Check if there are any remaining lucide icons that need syncing
# Login: Mail, Lock are lucide icons. Register uses those too.
# Inputs in login: className="w-full h-14 pl-12 pr-4 bg-[#fbf0fe] border-0 rounded-lg focus:ring-2 focus:ring-[#8127cf]/20 focus:bg-[#ffffff] transition-all placeholder:text-[#outline/50] text-[#1f1a23] font-medium shadow-none"

# Search for any inputs that use text-[15px] and change back to default or ensure weight is font-medium
text = text.replace('text-[15px]', '') # Let it inherit font-sans or set font-medium
text = text.replace('font-medium shadow-none', 'font-medium shadow-none') # already there

# Sync any remaining colors
text = text.replace('text-gray-900', 'text-[#1f1a23]')
text = text.replace('text-gray-500', 'text-[#4d4354]')
text = text.replace('text-indigo-500', 'text-[#8127cf]')
text = text.replace('text-teal-500', 'text-[#b10e6b]')

with open('src/app/(auth)/register/page.tsx', 'w') as f:
    f.write(text)
