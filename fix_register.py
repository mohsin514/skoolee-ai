with open('src/app/(auth)/register/page.tsx', 'r') as f:
    text = f.read()

text = text.replace(']#7e7385]/50]', ']#7e7385]/50')
text = text.replace('text-[#7e7385]/50]', 'text-[#7e7385]/50')
text = text.replace('placeholder:text-[#7e7385]/50]', 'placeholder:text-[#7e7385]/50')
text = text.replace('border-transparent', 'border-0')

with open('src/app/(auth)/register/page.tsx', 'w') as f:
    f.write(text)
