with open('src/app/(auth)/register/page.tsx', 'r') as f:
    text = f.read()

# Change buttons to use ArrowRight (h-5 w-5) to match the "Login" style
text = text.replace('Add Class <ChevronRight className="ml-2 h-4 w-4" />', 'Add Class <ArrowRight className="ml-2 h-5 w-5" />')
text = text.replace('Go to Dashboard <ChevronRight className="ml-2 h-4 w-4" />', 'Go to Dashboard <ArrowRight className="ml-2 h-5 w-5" />')

with open('src/app/(auth)/register/page.tsx', 'w') as f:
    f.write(text)
