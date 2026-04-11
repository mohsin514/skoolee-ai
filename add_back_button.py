with open('src/app/(auth)/register/page.tsx', 'r') as f:
    text = f.read()

# Add ArrowLeft to imports
text = text.replace('  ArrowRight,', '  ArrowRight,\n  ArrowLeft,')

# Add Back button to StepCard
old_div = '<div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 overflow-x-auto">'
new_div = '''<div className="flex items-center gap-4 px-6 py-4 border-b border-[#cfc2d6]/5 overflow-x-auto">
        <button 
          onClick={onBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fbf0fe] text-[#8127cf] hover:bg-[#eadfed] transition-colors border border-[#cfc2d6]/10 shadow-sm"
          title="Go Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="h-6 w-[1px] bg-[#cfc2d6]/20 shrink-0" />'''

text = text.replace(old_div, new_div)

with open('src/app/(auth)/register/page.tsx', 'w') as f:
    f.write(text)
