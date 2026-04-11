import re

with open('src/app/(auth)/register/page.tsx', 'r') as f:
    text = f.read()

# Fix Step 0 option cards styles
text = text.replace('font-semibold text-[#1f1a23]', 'text-lg font-bold text-[#1f1a23]')
text = text.replace('text-xs text-[#4d4354] mt-1 font-medium', 'text-sm text-[#4d4354] mt-1 font-medium opacity-80')

# Fix Choose cards hover to be more premium
text = text.replace('p-6 border-2 border-[#cfc2d6]/30 rounded-[24px] hover:border-[#8127cf] hover:bg-[#fbf0fe] shadow-sm hover:shadow-md transition-all transition-all', 'p-8 border-2 border-[#cfc2d6]/10 rounded-[32px] hover:border-[#8127cf] hover:bg-[#fbf0fe] shadow-none hover:shadow-xl hover:shadow-[#8127cf]/5 transition-all duration-300 transform hover:scale-[1.02]')
text = text.replace('p-6 border-2 border-[#cfc2d6]/30 rounded-[24px] hover:border-[#b10e6b] hover:bg-[#fbf0fe] shadow-sm hover:shadow-md transition-all transition-all', 'p-8 border-2 border-[#cfc2d6]/10 rounded-[32px] hover:border-[#b10e6b] hover:bg-[#fbf0fe] shadow-none hover:shadow-xl hover:shadow-[#b10e6b]/5 transition-all duration-300 transform hover:scale-[1.02]')

# Update main card subtitle sizing consistency
text = text.replace('text-center text-[#4d4354] text-[13px] font-medium', 'text-center text-[#4d4354] text-sm font-medium')

# Step indicator consistency in fonts
text = text.replace('className={`text-xs font-medium', 'className={`text-[12px] font-bold uppercase tracking-tight')

# Standard button polish for consistency in form view
text = text.replace('Continue <ChevronRight className="ml-2 h-4 w-4" />', 'Continue <ArrowRight className="ml-2 h-5 w-5" />')

# Ensure lucide icons are updated for consistency
if 'ArrowRight' not in text:
    text = text.replace('ChevronRight', 'ArrowRight')

# Replace ChevronRight imports with ArrowRight
text = text.replace('ChevronRight,', 'ArrowRight,')


with open('src/app/(auth)/register/page.tsx', 'w') as f:
    f.write(text)
