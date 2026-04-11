import re

with open('src/app/(auth)/register/page.tsx', 'r') as f:
    text = f.read()

# Synchronize input background precisely with Login
text = text.replace('bg-[#fff7fe]', 'bg-[#fbf0fe]')

# Synchronize Placeholder logic
text = text.replace('text-[#7e7385]/50', 'text-[#7e7385]')

# Fix the internal subtexts to have the same spacing and font as login
text = text.replace('className="text-sm text-[#4d4354] mt-1"', 'className="text-[#4d4354] text-sm mt-1 font-medium"')

# Fix Choose cards subtext spacing/opacity for that "premium" look
text = text.replace('text-sm text-[#4d4354] mt-1 font-medium opacity-80', 'text-[#4d4354] text-[15px] mt-2 font-medium opacity-70 leading-relaxed')

# Ensure the buttons use ArrowRight instead of ChevronRight correctly
text = text.replace('ArrowRight className="ml-2 h-4', 'ArrowRight className="ml-2 h-5')

with open('src/app/(auth)/register/page.tsx', 'w') as f:
    f.write(text)
