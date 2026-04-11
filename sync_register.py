import re

with open('src/app/(auth)/register/page.tsx', 'r') as f:
    content = f.read()

# 1. Root and Container
content = content.replace('bg-[#FCF8FD]', 'bg-[#fbf0fe]')
content = content.replace('bg-[#fbf0fe]', 'bg-[#fff7fe]') # Ensure root is light, section is low
content = content.replace('max-w-2xl', 'max-w-3xl') # Keep it slightly wider for the 5 tabs

# 2. Header / Logo sync
header_pattern = r'\{\/\* Logo & Brand Header \*\/\}.*?<p className="text-\[#4d4354\].*?Pakistan<\/p>\n\s*<\/div>'
new_header = """{/* Logo & Brand Header */}
        <div className="flex flex-col items-center mb-10">
          <div className="relative mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-[#8127cf] to-[#9c48ea] rounded-2xl flex items-center justify-center shadow-lg transform rotate-3 hover:rotate-0 transition-transform duration-500">
              <GraduationCap className="h-10 w-10 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#b10e6b] rounded-full border-4 border-[#fff7fe] flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
            </div>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tighter text-[#1f1a23] mb-2">Skoolee AI</h1>
          <div className="h-1 w-12 bg-[#8127cf] rounded-full"></div>
          <p className="text-[#4d4354] text-sm mt-4 font-medium">AI-powered school management for Pakistan</p>
        </div>"""
content = re.sub(header_pattern, new_header, content, flags=re.DOTALL)

# 3. StepCard and Indicators
content = content.replace('className="bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-[#cfc2d6]/10 overflow-hidden"', 'className="bg-white rounded-[40px] shadow-[0_32px_64px_rgba(31,26,35,0.04)] border border-[#cfc2d6]/10 overflow-hidden"')
content = content.replace('bg-[#FDF8FE]', 'bg-[#fbf0fe]') # track
content = content.replace('bg-[#8A4DFF]', 'bg-[#8127cf]') # progress
content = content.replace('bg-green-500', 'bg-[#34A853]')
content = content.replace('text-green-600', 'text-[#34A853]')
content = content.replace('bg-primary', 'bg-[#8127cf]') # isActive bg
content = content.replace('text-primary', 'text-[#8127cf]') # isActive text
content = content.replace('bg-gray-100 text-gray-400', 'bg-[#fbf0fe] text-[#4d4354]') # default
content = content.replace('text-gray-400', 'text-[#7e7385]')

# 4. Global replacements for Colors and rounding
content = content.replace('rounded-full px-5', 'rounded-lg px-5') # Inputs should be rounded-lg like login
content = content.replace('rounded-full font-bold', 'rounded-xl font-bold') # Buttons rounded-xl
content = content.replace('rounded-full', 'rounded-xl') # Generic buttons

# Colors
content = content.replace('#1F1A23', '#1f1a23')
content = content.replace('#8A4DFF', '#8127cf')
content = content.replace('#783BE8', '#9c48ea')
content = content.replace('#6D627A', '#4d4354')
content = content.replace('#4d4354/50', '#7e7385/50') # fix placeholders if any
content = content.replace('placeholder:text-[#7e7385]/50', 'placeholder:text-[#7e7385]')

# 5. Form Element Classes
# Input styling - find current patterns and replace with login pattern
input_old = 'className="h-[56px] bg-[#fbf0fe] border-0 text-[15px] rounded-xl px-5 focus:border-[#8127cf] focus:bg-white transition-colors text-[#1f1a23] placeholder:text-[#7e7385]/50 font-medium shadow-none w-full"'
input_new = 'className="w-full h-14 px-5 bg-[#fbf0fe] border-0 rounded-lg focus:ring-2 focus:ring-[#8127cf]/20 focus:bg-[#ffffff] transition-all placeholder:text-[#7e7385] text-[#1f1a23] font-medium shadow-none"'
content = content.replace(input_old, input_new)

# Label styling
label_old = 'className="text-[11px] font-bold text-[#1f1a23] tracking-widest uppercase ml-1"'
label_new = 'className="text-xs font-bold text-[#4d4354] ml-1 uppercase tracking-wider"'
content = content.replace(label_old, label_new)

# Button styling - Main
btn_old = 'className="w-full h-[56px] bg-[#8127cf] hover:bg-[#9c48ea] text-white rounded-xl text-[15px] font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(138,77,255,0.25)]"'
btn_new = 'className="w-full h-14 bg-[#8127cf] text-white font-bold rounded-xl shadow-lg shadow-[#8127cf]/25 hover:bg-[#9c48ea] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2"'
content = content.replace(btn_old, btn_new)

# Button styling - Outline
outbtn_old = 'className="h-[56px] border-none bg-[#fbf0fe] hover:bg-purple-50/80 rounded-xl font-bold text-[#1f1a23] shadow-none w-full"'
outbtn_new = 'className="h-14 border-0 bg-[#fbf0fe] hover:bg-[#eadfed] rounded-xl font-bold text-[#1f1a23] shadow-none w-full transition-colors"'
content = content.replace(outbtn_old, outbtn_new)

# Form Header (the h2 and p inside steps)
content = content.replace('className="text-[24px] font-bold text-[#1f1a23] tracking-tight"', 'className="text-2xl font-bold text-[#1f1a23] tracking-tight"')
content = content.replace('className="text-[#4d4354] text-[13px] font-medium"', 'className="text-[#4d4354] text-sm mt-1"')

# 6. Choose registration type card
content = content.replace('className="bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-[#cfc2d6]/10 p-8 sm:p-10 space-y-4"', 'className="bg-white rounded-[40px] shadow-[0_32px_64px_rgba(31,26,35,0.04)] border border-[#cfc2d6]/10 p-8 sm:p-10 space-y-4"')

with open('src/app/(auth)/register/page.tsx', 'w') as f:
    f.write(content)
