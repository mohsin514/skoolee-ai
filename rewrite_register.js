const fs = require('fs');
let content = fs.readFileSync('src/app/(auth)/register/page.tsx', 'utf8');

// Header area
content = content.replace(
  /{[\s\S]*?\/\* Header \*\/[\s\S]*?Join SkooleeAI[\s\S]*?Pakistan<\/p>\n\s*<\/div>/g,
`        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <div className="h-[68px] w-[68px] bg-[#8A4DFF] rounded-[18px] flex items-center justify-center shadow-md">
              <GraduationCap className="h-10 w-10 text-white" />
            </div>
          </div>
          <h1 className="text-[28px] font-extrabold text-[#161719] tracking-tight">
            Skoolee <span className="font-bold">AI</span>
          </h1>
          <p className="text-[#6D627A] text-[13px] font-medium mt-1">AI-powered school management for Pakistan</p>
        </div>`
);

// Footer link
content = content.replace(
/<p className="text-center text-sm text-gray-500 mt-6">\s*Already have an account\?\{" "\}\s*<Link href="\/login" className="text-primary font-medium hover:underline">Log in<\/Link>\s*<\/p>/g,
`<div className="mt-8 text-center pb-8 border-none mx-auto w-full max-w-[448px]">
          <p className="text-[13px] text-[#6D627A] font-medium">
            Already have an account?{" "}
            <Link href="/login" className="text-[#8A4DFF] font-bold hover:underline ml-1">Log in</Link>
          </p>
        </div>`
);

// Step 0 card
content = content.replace('className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 space-y-4"', 'className="bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-gray-50/50 p-8 sm:p-10 space-y-4"');
content = content.replace('className="text-xl font-semibold text-center text-gray-800"', 'className="text-[24px] font-bold text-[#1F1A23] tracking-tight text-center"');

// StepCard wrapper container
content = content.replace('className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"', 'className="bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-gray-50/50 overflow-hidden"');

// Step Header styling
content = content.replace(/<h2 className="text-lg font-semibold">/g, '<h2 className="text-[24px] font-bold text-[#1F1A23] tracking-tight">');
content = content.replace(/<p className="text-sm text-gray-500">/g, '<p className="text-[#6D627A] text-[13px] font-medium">');

// Labels
content = content.replace(/<Label>/g, '<Label className="text-[11px] font-bold text-[#1F1A23] tracking-widest uppercase ml-1">');

// All standard Inputs (without existing className)
content = content.replace(/<Input type/g, '<Input className="h-[56px] bg-[#FDF8FE] border-transparent text-[15px] rounded-full px-5 focus:border-[#7F3DFF] focus:bg-white transition-colors text-[#1F1A23] placeholder:text-[#A198AF] font-medium shadow-none w-full" type');
content = content.replace(/<Input placeholder/g, '<Input className="h-[56px] bg-[#FDF8FE] border-transparent text-[15px] rounded-full px-5 focus:border-[#7F3DFF] focus:bg-white transition-colors text-[#1F1A23] placeholder:text-[#A198AF] font-medium shadow-none w-full" placeholder');

// Slug input 
content = content.replace(/<Input className="rounded-r-none" placeholder/g, '<Input className="h-[56px] bg-[#FDF8FE] border-transparent text-[15px] rounded-l-full rounded-r-none px-5 focus:border-[#7F3DFF] focus:bg-white transition-colors text-[#1F1A23] placeholder:text-[#A198AF] font-medium shadow-none w-full border-r-0" placeholder');
content = content.replace(/<span className="flex h-10 items-center px-3 border border-l-0 rounded-r-lg bg-gray-50 text-xs text-gray-500">\.skooleeai\.com<\/span>/g, '<span className="flex h-[56px] items-center px-5 border-transparent bg-[#FDF8FE] rounded-r-full text-[15px] text-[#A198AF] font-medium shadow-none border-l-0 border">.skooleeai.com</span>');

// Select tags
content = content.replace(/<select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"/g, '<select className="flex h-[56px] w-full bg-[#FDF8FE] border-transparent text-[15px] rounded-full px-5 focus:border-[#7F3DFF] focus:bg-white transition-colors text-[#1F1A23] font-medium focus:outline-none appearance-none shadow-none"');

// Submit Buttons
content = content.replace(/className="w-full"/g, 'className="w-full h-[56px] bg-[#8A4DFF] hover:bg-[#783BE8] text-white rounded-full text-[15px] font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(138,77,255,0.25)]"');
// Fix button classes specifically using type="submit" or if they are primary action
content = content.replace(/<Button type="submit" disabled={busy}>/g, '<Button type="submit" className="w-full h-[56px] bg-[#8A4DFF] hover:bg-[#783BE8] text-white rounded-full text-[15px] font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(138,77,255,0.25)]" disabled={busy}>');
content = content.replace(/<Button onClick={onNext}>/g, '<Button onClick={onNext} className="w-full h-[56px] bg-[#8A4DFF] hover:bg-[#783BE8] text-white rounded-full text-[15px] font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(138,77,255,0.25)]">');

// Outline buttons
content = content.replace(/variant="outline"/g, 'variant="outline" className="h-[56px] border-none bg-[#FDF8FE] hover:bg-purple-50/80 rounded-full font-bold text-[#1F1A23] shadow-none w-full"');

fs.writeFileSync('src/app/(auth)/register/page.tsx', content);
