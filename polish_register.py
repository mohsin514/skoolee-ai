with open('src/app/(auth)/register/page.tsx', 'r') as f:
    text = f.read()

# Fix Step 0 option cards
text = text.replace('border-indigo-100 rounded-xl hover:border-indigo-400 hover:bg-indigo-50', 'border-[#cfc2d6]/30 rounded-[24px] hover:border-[#8127cf] hover:bg-[#fbf0fe] shadow-sm hover:shadow-md transition-all')
text = text.replace('border-teal-100 rounded-xl hover:border-teal-400 hover:bg-teal-50', 'border-[#cfc2d6]/30 rounded-[24px] hover:border-[#b10e6b] hover:bg-[#fbf0fe] shadow-sm hover:shadow-md transition-all')

# Fix text colors inside Step 0
text = text.replace('text-indigo-500', 'text-[#8127cf]')
text = text.replace('text-teal-500', 'text-[#b10e6b]')
text = text.replace('text-gray-800', 'text-[#1f1a23]')
text = text.replace('text-xs text-gray-500 mt-1', 'text-xs text-[#4d4354] mt-1 font-medium')

# Fix internal headers to have consistent font sizes
text = text.replace('text-[24px] font-bold text-[#1f1a23] tracking-tight text-center', 'text-2xl font-bold text-[#1f1a23] tracking-tight text-center')

# Fix input borders
text = text.replace('border-0 bg-[#fbf0fe] rounded-xl px-5 focus:border-[#8127cf]', 'w-full h-14 px-5 bg-[#fbf0fe] border-0 rounded-lg focus:ring-2 focus:ring-[#8127cf]/20 focus:bg-[#ffffff] transition-all')

with open('src/app/(auth)/register/page.tsx', 'w') as f:
    f.write(text)
