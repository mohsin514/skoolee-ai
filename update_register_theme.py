import re

with open('src/app/(auth)/register/page.tsx', 'r') as f:
    content = f.read()

# 1. Background colors
content = content.replace('bg-[#FCF8FD]', 'bg-[#fbf0fe]')

# 2. Main primary colors
content = content.replace('#8A4DFF', '#8127cf')
content = content.replace('#783BE8', '#9c48ea')

# 3. Input background & focus
content = content.replace('#FDF8FE', '#fbf0fe')
content = content.replace('#7F3DFF', '#8127cf')

# 4. Text colors
content = content.replace('#1F1A23', '#1f1a23')
content = content.replace('#6D627A', '#4d4354')
content = content.replace('#A198AF', '#7e7385]/50') # this creates `text-[...]/50` which works in tailwind if syntax is `text-[#7e7385]/50` 

# 5. Border
content = content.replace('border-gray-50/50', 'border-[#cfc2d6]/10')

# 6. Change Logo Header markup
header_pattern = r'\{\/\* Header \*\/\}.*?<p className="text-\[#4d4354\].*?Pakistan<\/p>\n\s*<\/div>'
new_header = """{/* Logo & Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-[#8127cf] to-[#9c48ea] rounded-2xl flex items-center justify-center shadow-lg transform rotate-3 hover:rotate-0 transition-transform duration-500">
              <GraduationCap className="h-10 w-10 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#b10e6b] rounded-full border-4 border-[#fff7fe] flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
            </div>
          </div>
          <h1 className="text-[28px] font-extrabold tracking-tighter text-[#1f1a23] mb-2">Skoolee AI</h1>
          <div className="h-1 w-12 bg-[#8127cf] rounded-full"></div>
          <p className="text-[#4d4354] text-[13px] font-medium mt-2">AI-powered school management for Pakistan</p>
        </div>"""
content = re.sub(header_pattern, new_header, content, flags=re.DOTALL)

with open('src/app/(auth)/register/page.tsx', 'w') as f:
    f.write(content)
