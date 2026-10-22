import type { Language } from "@/lib/locale/package";
import type { Flagship, LaunchJourney, LaunchTask } from "@/lib/onboarding/launch-plan";

const words = {
  eyebrow: ["YOUR FIRST CHAPTER", "فصلك الأول", "آپ کا پہلا باب"],
  title: ["Your school. Brought to life.", "مدرستك تنبض بالحياة.", "آپ کا اسکول۔ ایک نئی زندگی۔"],
  hello: ["Hi, I’m your Skoolee guide.", "مرحبًا، أنا دليلك في Skoolee.", "سلام، میں آپ کا Skoolee رہنما ہوں۔"],
  introduction: ["Let’s make this space yours. I’ll show you where to begin, what to prepare, and how to get your first useful result.", "لنجعل هذه المساحة مناسبة لك. سأوضح لك من أين تبدأ وما تحتاج إلى تجهيزه وكيف تصل إلى أول نتيجة مفيدة.", "آئیں اس جگہ کو آپ کے لیے تیار کریں۔ میں بتاؤں گا کہاں سے شروع کریں، کیا تیار رکھیں، اور پہلا مفید نتیجہ کیسے حاصل کریں۔"],
  welcome: ["Welcome", "مرحبًا", "خوش آمدید"],
  prepare: ["Before you begin", "قبل أن تبدأ", "شروع کرنے سے پہلے"],
  choose: ["Choose your first move", "اختر خطوتك الأولى", "اپنا پہلا قدم چنیں"],
  next: ["Show me the way", "أرني الطريق", "مجھے راستہ دکھائیں"],
  continue: ["Let’s get started", "لنبدأ", "آئیں شروع کریں"],
  launch: ["Launch my workflow", "ابدأ سير العمل", "میرا ورک فلو شروع کریں"],
  back: ["Back", "رجوع", "واپس"],
  later: ["Explore on my own", "أستكشف بنفسي", "خود دیکھوں گا"],
  replay: ["Replay guide", "إعادة الدليل", "رہنمائی دوبارہ دیکھیں"],
  openGuide: ["Open my onboarding guide", "فتح دليل إعدادي", "میری آن بورڈنگ رہنمائی کھولیں"],
  loadingGuide: ["Loading your onboarding guide…", "جارٍ تحميل دليل إعدادك…", "آپ کی آن بورڈنگ رہنمائی لوڈ ہو رہی ہے…"],
  replayHint: ["Replay this guide any time from Help. Replaying never resets your saved work.", "أعد هذا الدليل في أي وقت من «المساعدة». إعادته لا تمسح عملك المحفوظ.", "یہ رہنمائی کسی بھی وقت «مدد» سے دوبارہ دیکھیں۔ دوبارہ دیکھنے سے محفوظ کام حذف نہیں ہوگا۔"],
  showMeAround: ["Show me around", "خذني في جولة", "مجھے تعارفی دورہ کرائیں"],
  ready: ["Your next chapter", "خطوتك التالية", "آپ کا اگلا مرحلہ"],
  review: ["You stay in control", "القرار بيدك", "اختیار آپ کے پاس ہے"],
  reviewHint: ["AI prepares editable drafts. Review the details before approving changes, publishing or sending anything.", "يعدّ الذكاء الاصطناعي مسودات قابلة للتعديل. راجع التفاصيل قبل اعتماد التغييرات أو النشر أو الإرسال.", "اے آئی قابلِ ترمیم مسودے بناتا ہے۔ تبدیلی منظور کرنے، شائع کرنے یا بھیجنے سے پہلے تفصیلات دیکھیں۔"],
  save: ["Pick up where you left off", "تابع من حيث توقفت", "جہاں چھوڑا تھا وہیں سے شروع کریں"],
  saveHint: ["Use Save and exit during guided setup. Wait for the saved confirmation before leaving.", "استخدم «حفظ وخروج» أثناء الإعداد الموجّه. انتظر تأكيد الحفظ قبل المغادرة.", "رہنمائی کے دوران محفوظ کریں اور نکلیں استعمال کریں۔ نکلنے سے پہلے محفوظ ہونے کی تصدیق کا انتظار کریں۔"],
  scope: ["Made for your role", "مناسب لدورك", "آپ کے کردار کے مطابق"],
  scopeHint: ["Your guide only offers workflows available to your account. Your school controls access and assignments.", "يعرض دليلك مسارات العمل المتاحة لحسابك. تتحكم مدرستك في الوصول والتكليفات.", "رہنمائی میں صرف آپ کے اکاؤنٹ کے لیے دستیاب کام ہیں۔ رسائی اور ذمہ داریاں اسکول طے کرتا ہے۔"],
  saving: ["Saving your preference…", "جارٍ حفظ تفضيلك…", "آپ کی ترجیح محفوظ ہو رہی ہے…"],
  failed: ["We couldn’t save your welcome preference. Please try again. Your setup has not changed.", "تعذر حفظ تفضيل الترحيب. حاول مرة أخرى. لم تتغير إعداداتك.", "استقبالیہ ترجیح محفوظ نہیں ہو سکی۔ دوبارہ کوشش کریں۔ آپ کی ترتیب تبدیل نہیں ہوئی۔"],
  loadFailed: ["The guide couldn’t load. Try opening it again.", "تعذر تحميل الدليل. حاول فتحه مجددًا.", "رہنمائی لوڈ نہیں ہو سکی۔ دوبارہ کھولیں۔"],
  campusMissing: ["Your campus assignment is still needed. Ask your school administrator to link your account; you can explore your workspace meanwhile.", "يلزم ربط حسابك بفرع. اطلب من مسؤول المدرسة إتمام الربط؛ ويمكنك استكشاف مساحة العمل الآن.", "آپ کے اکاؤنٹ کو کیمپس سے جوڑنا باقی ہے۔ اسکول منتظم سے رابطہ کریں؛ اس دوران اپنی ورک اسپیس دیکھ سکتے ہیں۔"],
  workflowHint: ["Choose a starting point. Existing setup opens at your saved progress.", "اختر نقطة البداية. يُفتح الإعداد الحالي عند آخر تقدم محفوظ.", "آغاز کا انتخاب کریں۔ موجودہ ترتیب آپ کی محفوظ پیش رفت پر کھلے گی۔"],
  recommended: ["Suggested first", "مقترح أولًا", "تجویز کردہ آغاز"],
  chapter: ["Chapter", "الفصل", "باب"],
  guide: ["Skoolee guide", "دليل Skoolee", "Skoolee رہنما"],
  pause: ["Pause motion", "إيقاف الحركة", "حرکت روکیں"],
  play: ["Play motion", "تشغيل الحركة", "حرکت چلائیں"],
  sayHello: ["Say hello", "قل مرحبًا", "سلام کریں"],
  stageHello: ["A big beginning starts with you.", "بداية كبيرة تبدأ بك.", "ایک بڑی شروعات آپ سے۔"],
  stagePlan: ["Let’s connect the pieces.", "لنربط التفاصيل معًا.", "آئیں سب کو جوڑیں۔"],
  stageReady: ["Ready for your first move?", "مستعد لخطوتك الأولى؟", "پہلے قدم کے لیے تیار؟"],
  stageCampusLabel: ["YOUR FOUNDATION", "أساس مدرستك", "آپ کی بنیاد"],
  stageCampus: ["One connected campus", "فرع مترابط", "ایک مربوط کیمپس"],
  stagePeopleLabel: ["YOUR PEOPLE", "فريقك", "آپ کی ٹیم"],
  stagePeople: ["Every role belongs", "مكان لكل دور", "ہر کردار کی اپنی جگہ"],
  stageWorkflowLabel: ["YOUR POSSIBILITIES", "إمكاناتك", "آپ کے امکانات"],
  stageWorkflow: ["Ideas into workflows", "أفكار تصبح مسارات عمل", "خیال سے ورک فلو تک"],
  showcase: ["Showcase", "العرض التعريفي", "پروڈکٹ شوکیس"],
  getStarted: ["Get started", "ابدأ الآن", "شروع کریں"],
  continueOnboarding: ["Continue my onboarding", "متابعة إعدادي", "میری آن بورڈنگ جاری رکھیں"],
  continueWorkspace: ["Continue to my workspace", "متابعة إلى مساحة عملي", "میری ورک اسپیس پر جائیں"],
  signInAgain: ["Sign in to continue", "سجّل الدخول للمتابعة", "جاری رکھنے کے لیے سائن ان کریں"],
  checkingEntry: ["Checking your next step…", "جارٍ التحقق من خطوتك التالية…", "آپ کا اگلا قدم جانچا جا رہا ہے…"],
  entryFailed: ["We couldn’t check your next step. Please try again; your account and saved work have not changed.", "تعذر التحقق من خطوتك التالية. حاول مجددًا؛ لم يتغير حسابك أو عملك المحفوظ.", "آپ کا اگلا قدم جانچ نہیں سکے۔ دوبارہ کوشش کریں؛ اکاؤنٹ اور محفوظ کام تبدیل نہیں ہوئے۔"],
  memberCompleteBody: ["Continue with your existing account. Your role, campus and saved progress determine the next step.", "تابع بحسابك الحالي. يحدد دورك وفرعك وتقدمك المحفوظ الخطوة التالية.", "اپنے موجودہ اکاؤنٹ سے جاری رکھیں۔ کردار، کیمپس اور محفوظ پیش رفت کے مطابق اگلا قدم کھلے گا۔"],
  signInContinueHint: ["Sign in again to continue with your existing account and saved work.", "سجّل الدخول مجددًا لمتابعة حسابك الحالي وعملك المحفوظ.", "اپنے موجودہ اکاؤنٹ اور محفوظ کام کو جاری رکھنے کے لیے دوبارہ سائن ان کریں۔"],
  showcaseMode: ["PRODUCT SHOWCASE", "عرض المنتج", "پروڈکٹ کی جھلک"],
  showcaseHint: ["Three scenes, then your next step. Turn on Exhibition loop for a stand or a display.", "ثلاثة مشاهد، ثم خطوتك التالية. فعّل التكرار للعرض على شاشة المعرض.", "تین مناظر، پھر آپ کا اگلا قدم۔ نمائش کی اسکرین کے لیے مسلسل شوکیس چلائیں۔"],
  showcaseReturn: ["Return to my guide", "العودة إلى إعدادي", "میری ترتیب پر واپس"],
  exhibitionLoop: ["Exhibition loop", "تكرار عرض المعرض", "نمائش میں مسلسل چلائیں"],
  watchAgain: ["Watch again", "شاهد مجددًا", "دوبارہ دیکھیں"],
  chooseWorkflow: ["Choose my workflow", "اختيار سير عملي", "میرا ورک فلو چنیں"],
  finishTour: ["See my next step", "عرض خطوتي التالية", "میرا اگلا قدم دیکھیں"],
  showcaseComplete: ["Now, make it yours.", "الآن، اجعلها مساحتك.", "اب، اسے اپنا بنائیں۔"],
  showcaseCompleteBody: ["Your introduction is complete. Continue to choose your first workflow, or replay the presentation whenever you like.", "اكتمل التعريف. تابع لاختيار أول سير عمل، أو أعد العرض وقتما تريد.", "تعارف مکمل ہوا۔ اپنا پہلا ورک فلو چنیں یا جب چاہیں تعارف دوبارہ دیکھیں۔"],
  publicCompleteBody: ["Create your account to begin. Owners set up their institution and first campus; invited staff, students and families follow their assigned role.", "أنشئ حسابك للبدء. يُعدّ المالكون المؤسسة والفرع الأول؛ ويتبع الموظفون والطلاب والأسر المدعوون أدوارهم المعيّنة.", "شروع کرنے کے لیے اکاؤنٹ بنائیں۔ مالکان ادارہ اور پہلا کیمپس تیار کرتے ہیں؛ مدعو عملہ، طلبہ اور خاندان اپنے مقررہ کردار سے آغاز کرتے ہیں۔"],
  nextStep: ["WHAT OPENS NEXT", "ما سيُفتح بعد ذلك", "اس کے بعد کیا کھلے گا"],
  setupPath: ["Your path to launch with AI", "طريقك إلى الانطلاق بالذكاء الاصطناعي", "اے آئی کے ساتھ آغاز کا راستہ"],
  setupFoundation: ["Confirm your institution and campus", "أكد مؤسستك وفرعك", "ادارے اور کیمپس کی تصدیق کریں"],
  setupInterview: ["Answer the setup questionnaire; your progress is saved", "أجب عن استبيان الإعداد؛ ويُحفظ تقدمك", "سیٹ اپ سوالنامے کے جواب دیں؛ آپ کی پیش رفت محفوظ رہتی ہے"],
  setupDrafts: ["AI drafts the plans; you review them and approve what applies", "يُعدّ الذكاء الاصطناعي مسودات الخطط؛ وتراجعها وتعتمد ما يُطبَّق", "اے آئی منصوبوں کے مسودے بناتا ہے؛ آپ جائزہ لے کر منظور کرتے ہیں کہ کیا لاگو ہو"],
  flagshipsTitle: ["What AI does for you here", "ما يقدّمه لك الذكاء الاصطناعي هنا", "یہاں اے آئی آپ کے لیے کیا کرتا ہے"],
  showcaseNext: ["Next scene", "المشهد التالي", "اگلا منظر"],
  fullscreen: ["Full screen", "ملء الشاشة", "مکمل اسکرین"],
  fullscreenExit: ["Exit full screen", "إنهاء ملء الشاشة", "مکمل اسکرین بند کریں"],
  fullscreenFailed: ["Full screen isn’t available here. The showcase will continue in this window.", "ملء الشاشة غير متاح هنا. سيستمر العرض في هذه النافذة.", "یہاں مکمل اسکرین دستیاب نہیں۔ شوکیس اسی ونڈو میں جاری رہے گا۔"],
  // The public showcase: one scene for the school and its people, then one per flagship (addendum 2026-10-22).
  demoTitleOne: ["Your school. Brought to life.", "مدرستك تنبض بالحياة.", "آپ کا اسکول۔ ایک نئی زندگی۔"],
  demoTitleTwo: ["Set up your school with AI.", "أعدّ مدرستك بالذكاء الاصطناعي.", "اے آئی سے اپنا اسکول ترتیب دیں۔"],
  demoTitleThree: ["Exams, built with AI.", "اختبارات يبنيها الذكاء الاصطناعي.", "اے آئی سے تیار امتحانات۔"],
  demoBodyOne: ["One calm workspace for owners, principals, teachers, students and families. Everyone starts where their role begins.", "مساحة عمل هادئة واحدة للمالكين والمديرين والمعلمين والطلاب والأسر. يبدأ كل شخص من حيث يبدأ دوره.", "مالکان، پرنسپلز، اساتذہ، طلبہ اور خاندانوں کے لیے ایک پُرسکون ورک اسپیس۔ ہر شخص اپنے کردار کے مطابق آغاز کرتا ہے۔"],
  demoBodyTwo: ["Answer one questionnaire and AI drafts your academic year, classes, calendar, timetable, fees and messages. You review every draft and decide what goes live.", "أجب عن استبيان واحد ليُعدّ الذكاء الاصطناعي مسودات العام الدراسي والصفوف والتقويم والجدول والرسوم والرسائل. تراجع كل مسودة وتقرر ما يُعتمد.", "ایک سوالنامے کے جواب دیں، اے آئی تعلیمی سال، جماعتوں، کیلنڈر، نظام الاوقات، فیس اور پیغامات کے مسودے بناتا ہے۔ آپ ہر مسودے کا جائزہ لے کر طے کرتے ہیں کہ کیا لاگو ہو۔"],
  demoBodyThree: ["Exam Studio builds assessments from your material, delivers them securely, helps you mark and plans learning recovery.", "يبني استوديو الاختبارات التقييمات من موادك، ويقدّمها بأمان، ويساعدك في التصحيح، ويخطط لتعويض ما فات من التعلّم.", "ایگزام اسٹوڈیو آپ کے مواد سے جائزے تیار کرتا ہے، انہیں محفوظ طریقے سے لیتا ہے، جانچ میں مدد دیتا ہے اور تعلیمی کمی کی تلافی کا منصوبہ بناتا ہے۔"],
  demoFeatureOne: ["Every role, one workspace", "كل الأدوار في مساحة واحدة", "ہر کردار، ایک ورک اسپیس"],
  demoFeatureTwo: ["AI Workflows", "مسارات الذكاء الاصطناعي", "اے آئی ورک فلوز"],
  demoFeatureThree: ["Exam Studio", "استوديو الاختبارات", "ایگزام اسٹوڈیو"],
  interview: ["Tell me about your campus", "أخبرني عن فرعك", "اپنے کیمپس کے بارے میں بتائیں"],
  interviewHint: ["One answer at a time. Together, we’ll turn your plans into drafts you can review.", "إجابة واحدة في كل مرة. سنحوّل خططك إلى مسودات يمكنك مراجعتها.", "ایک وقت میں ایک جواب۔ ہم آپ کے منصوبوں کو قابلِ جائزہ مسودوں میں بدلیں گے۔"],
  confirmed: ["Confirmed answers", "الإجابات المؤكدة", "تصدیق شدہ جوابات"],
  draftHint: ["Nothing goes live until it is reviewed and approved.", "لا يُطبّق شيء قبل المراجعة والاعتماد.", "جائزے اور منظوری سے پہلے کچھ لاگو نہیں ہوگا۔"],
  keyboard: ["Type, speak or add a source when available.", "اكتب أو تحدث أو أضف مصدرًا عندما تتاح الخدمة.", "سہولت دستیاب ہو تو لکھیں، بولیں یا ماخذ شامل کریں۔"],
} as const;

const journeys: Record<LaunchJourney, readonly [string, string, string]> = {
  institution: ["Your institution, thoughtfully set up.", "مؤسستك، بإعداد مدروس.", "آپ کا ادارہ، سوچ سمجھ کر تیار۔"],
  campus: ["One campus. A connected team.", "فرع واحد. فريق مترابط.", "ایک کیمپس۔ ایک مربوط ٹیم۔"],
  teacher: ["Less setup. More teaching.", "إعداد أقل. تدريس أكثر.", "کم ترتیب۔ زیادہ تدریس۔"],
  student: ["Your next discovery starts here.", "اكتشافك القادم يبدأ هنا.", "آپ کی اگلی دریافت یہاں سے شروع ہوتی ہے۔"],
  family: ["A closer look at their school day.", "نظرة أقرب إلى يومهم الدراسي.", "ان کے اسکول کے دن سے باخبر رہیں۔"],
  finance: ["Clear records. Confident decisions.", "سجلات واضحة. قرارات واثقة.", "واضح ریکارڈ۔ پُراعتماد فیصلے۔"],
  library: ["A good home for every book.", "مكان مناسب لكل كتاب.", "ہر کتاب کے لیے ایک اچھی جگہ۔"],
  frontDesk: ["Every welcome starts with you.", "كل ترحيب يبدأ بك.", "ہر استقبال آپ سے شروع ہوتا ہے۔"],
  platform: ["Your schools, in view.", "مدارسك أمامك.", "آپ کے اسکول، آپ کی نظر میں۔"],
};
const preparations: Record<LaunchJourney, readonly [string, string, string]> = {
  institution: ["Have your school name, country, campus details and academic calendar ready. Start with one campus; add others when you’re ready.", "جهّز اسم المدرسة والدولة وتفاصيل الفروع والتقويم الدراسي. ابدأ بفرع واحد وأضف البقية لاحقًا.", "اسکول کا نام، ملک، کیمپس کی تفصیلات اور تعلیمی کیلنڈر تیار رکھیں۔ ایک کیمپس سے شروع کریں؛ باقی بعد میں شامل کریں۔"],
  campus: ["Confirm your assigned campus. Have your grades, term dates, working days and staff list ready. The AI interview prepares campus-specific drafts for review.", "تأكد من الفرع المعيّن لك. جهّز الصفوف وتواريخ الفصل وأيام العمل وقائمة الموظفين. يُعدّ الحوار مسودات خاصة بفرعك للمراجعة.", "اپنے مقررہ کیمپس کی تصدیق کریں۔ جماعتیں، تعلیمی تاریخیں، کام کے دن اور عملے کی فہرست تیار رکھیں۔ اے آئی گفتگو کیمپس کے مسودے جائزے کے لیے تیار کرتی ہے۔"],
  teacher: ["Confirm your name, contact details and teaching specialties. Your school assigns classes and subjects; contact the office if any are missing.", "أكد اسمك وبيانات التواصل وتخصصاتك. تعيّن المدرسة الصفوف والمواد؛ تواصل مع الإدارة إذا غاب أي منها.", "نام، رابطے کی تفصیلات اور تدریسی مضامین کی تصدیق کریں۔ جماعتیں اور مضامین اسکول مقرر کرتا ہے؛ کمی ہو تو دفتر سے رابطہ کریں۔"],
  student: ["Check your name and class, explore your timetable, then open learning tasks assigned by your teachers. Ask your school if your class is not linked.", "تحقق من اسمك وصفك واستعرض الجدول ثم افتح مهام التعلم التي يكلّفك بها المعلمون. اسأل المدرسة إذا لم يُربط صفك.", "اپنا نام اور جماعت چیک کریں، ٹائم ٹیبل دیکھیں، پھر استاد کے دیے ہوئے تعلیمی کام کھولیں۔ جماعت منسلک نہ ہو تو اسکول سے پوچھیں۔"],
  family: ["Check that the right children are linked to your account. Explore attendance, timetable and school updates. Ask the office to correct missing family links.", "تحقق من ربط الأبناء الصحيحين بحسابك. استعرض الحضور والجدول وتحديثات المدرسة. اطلب من الإدارة تصحيح الروابط الناقصة.", "چیک کریں کہ درست بچے آپ کے اکاؤنٹ سے منسلک ہیں۔ حاضری، ٹائم ٹیبل اور اسکول کی خبریں دیکھیں۔ نامکمل روابط دفتر سے درست کروائیں۔"],
  finance: ["Confirm your campus and fee period. Keep fee structures and opening balances ready. Review records before posting or collecting payments.", "أكد الفرع وفترة الرسوم. جهّز هياكل الرسوم والأرصدة الافتتاحية. راجع السجلات قبل تسجيل المدفوعات أو تحصيلها.", "کیمپس اور فیس کی مدت کی تصدیق کریں۔ فیس کا ڈھانچہ اور ابتدائی بقایا تیار رکھیں۔ ادائیگیاں درج یا وصول کرنے سے پہلے ریکارڈ دیکھیں۔"],
  library: ["Prepare your catalogue, book identifiers and borrowing rules. Check a member’s details before issuing or returning a book.", "جهّز الفهرس ومعرّفات الكتب وقواعد الاستعارة. تحقق من بيانات العضو قبل إعارة كتاب أو إرجاعه.", "فہرست، کتابوں کی شناخت اور ادھار کے اصول تیار رکھیں۔ کتاب دینے یا واپس لینے سے پہلے رکن کی تفصیلات چیک کریں۔"],
  frontDesk: ["Confirm your campus, then explore visitors, admissions enquiries and daily records. Keep contact information accurate and only record necessary details.", "أكد الفرع ثم استعرض الزوار واستفسارات القبول والسجلات اليومية. حافظ على دقة بيانات التواصل وسجّل التفاصيل اللازمة فقط.", "کیمپس کی تصدیق کریں، پھر زائرین، داخلہ سوالات اور روزانہ ریکارڈ دیکھیں۔ رابطے کی معلومات درست رکھیں اور صرف ضروری تفصیلات درج کریں۔"],
  platform: ["Check school accounts, access and service status. Open the relevant school context before making administrative changes.", "تحقق من حسابات المدارس والوصول وحالة الخدمة. افتح سياق المدرسة الصحيح قبل التغييرات الإدارية.", "اسکول اکاؤنٹس، رسائی اور سروس کی حالت چیک کریں۔ انتظامی تبدیلی سے پہلے متعلقہ اسکول کا سیاق کھولیں۔"],
};
const tasks: Record<LaunchTask, readonly [string, string, string]> = {
  institution: ["Set up my institution", "إعداد مؤسستي", "میرا ادارہ ترتیب دیں"],
  campus: ["Review campus details", "مراجعة تفاصيل الفرع", "کیمپس کی تفصیلات دیکھیں"],
  profile: ["Set up my teacher profile", "إعداد ملف المعلم", "استاد کا پروفائل تیار کریں"],
  aiSetup: ["Set up my campus with AI", "إعداد فرعي بالذكاء الاصطناعي", "اے آئی سے اپنا کیمپس ترتیب دیں"],
  aiWorkspace: ["Open AI Workflows", "فتح مسارات الذكاء الاصطناعي", "اے آئی ورک فلوز کھولیں"],
  studio: ["Create an exam in Exam Studio", "إنشاء اختبار في استوديو الاختبارات", "ایگزام اسٹوڈیو میں امتحان بنائیں"],
  academics: ["Review academic setup", "مراجعة الإعداد الأكاديمي", "تعلیمی ترتیب دیکھیں"],
  timetable: ["Explore my timetable", "استعراض جدولي", "میرا ٹائم ٹیبل دیکھیں"],
  learning: ["Open my learning workspace", "فتح مساحة التعلم", "میری تعلیمی ورک اسپیس کھولیں"],
  children: ["Open my family workspace", "فتح مساحة الأسرة", "میری فیملی ورک اسپیس کھولیں"],
  fees: ["Open finance workspace", "فتح مساحة المالية", "مالیاتی ورک اسپیس کھولیں"],
  library: ["Open library workspace", "فتح مساحة المكتبة", "لائبریری ورک اسپیس کھولیں"],
  frontDesk: ["Open front desk", "فتح مكتب الاستقبال", "استقبالیہ کھولیں"],
  workspace: ["Explore my workspace", "استعراض مساحة عملي", "میری ورک اسپیس دیکھیں"],
};
/** The standalone owner's campus task opens School settings › Profile: it is the school's record, not a campus's. */
const ownerSchoolTask = ["Review school details", "مراجعة بيانات المدرسة", "اسکول کی تفصیلات دیکھیں"] as const;
/** The institution authority (group admin, standalone owner) sets up the school, not one campus. */
const schoolSetupTask = ["Set up my school with AI", "إعداد مدرستي بالذكاء الاصطناعي", "اے آئی سے اپنا اسکول ترتیب دیں"] as const;
const ownerSchoolTaskDetail = [
  "Check the school's name, contact details, logo and language before starting plans.",
  "راجع اسم المدرسة وبيانات التواصل والشعار واللغة قبل بدء الخطط.",
  "منصوبے شروع کرنے سے پہلے اسکول کا نام، رابطے کی تفصیلات، لوگو اور زبان دیکھیں۔",
] as const;
const taskDetails: Record<LaunchTask, readonly [string, string, string]> = {
  institution: ["Confirm school details, choose your country and create the first campus. Then continue to the AI campus interview.", "أكد بيانات المدرسة واختر الدولة وأنشئ الفرع الأول، ثم تابع حوار إعداد الفرع بالذكاء الاصطناعي.", "اسکول کی تفصیلات، ملک اور پہلا کیمپس درج کریں، پھر اے آئی کیمپس گفتگو جاری رکھیں۔"],
  campus: ["Check campus records and contact details before starting campus-specific plans.", "راجع سجلات الفرع وبيانات التواصل قبل بدء خططه.", "کیمپس کے منصوبوں سے پہلے ریکارڈ اور رابطوں کی تفصیلات دیکھیں۔"],
  profile: ["Complete your contact details and teaching specialties. Your school assigns classes and subjects.", "أكمل بيانات التواصل والتخصصات؛ تعيّن مدرستك الصفوف والمواد.", "رابطے اور تدریسی مضامین مکمل کریں۔ جماعتیں اور مضامین اسکول مقرر کرتا ہے۔"],
  aiSetup: ["Answer the setup questionnaire and AI drafts your launch plan: academic year, classes, calendar, timetable, fees and messages. Nothing applies until it is reviewed and approved.", "أجب عن استبيان الإعداد ليُعدّ الذكاء الاصطناعي مسودة خطة الانطلاق: العام الدراسي والصفوف والتقويم والجدول والرسوم والرسائل. ولا يُطبَّق شيء قبل مراجعته واعتماده.", "سیٹ اپ سوالنامے کے جواب دیں، اے آئی آغاز کے منصوبے کا مسودہ بناتا ہے: تعلیمی سال، جماعتیں، کیلنڈر، نظام الاوقات، فیس اور پیغامات۔ جائزے اور منظوری سے پہلے کچھ لاگو نہیں ہوتا۔"],
  aiWorkspace: ["Open AI Workflows and pick a workflow, such as timetables, exam sessions or announcements. You review every draft before it applies.", "افتح مسارات الذكاء الاصطناعي واختر مسارًا مثل الجداول أو جلسات الامتحانات أو الإعلانات. وتراجع كل مسودة قبل تطبيقها.", "اے آئی ورک فلوز کھولیں اور کوئی ورک فلو چنیں، جیسے نظام الاوقات، امتحانی سیشن یا اعلانات۔ ہر مسودہ لاگو ہونے سے پہلے آپ اس کا جائزہ لیتے ہیں۔"],
  studio: ["Choose a subject, add your source material and AI builds the paper. Review it before it is delivered securely and marked.", "اختر مادة وأضف موادك المرجعية ليبني الذكاء الاصطناعي الورقة. راجعها قبل تقديمها بأمان وتصحيحها.", "مضمون چنیں، اپنا ماخذی مواد شامل کریں اور اے آئی پرچہ تیار کرتا ہے۔ محفوظ طریقے سے لینے اور جانچنے سے پہلے اس کا جائزہ لیں۔"],
  academics: ["Review grades, subjects and class structure for your campus.", "راجع الصفوف والمواد وبنية الفصول في فرعك.", "اپنے کیمپس کی جماعتیں، مضامین اور کلاسوں کی ترتیب دیکھیں۔"],
  timetable: ["See your assigned lessons and teaching schedule. Missing assignments are managed by your school.", "اطلع على حصصك وجدول التدريس؛ تدير المدرسة التكليفات الناقصة.", "اپنے مقررہ اسباق اور تدریسی اوقات دیکھیں۔ نامکمل ذمہ داریاں اسکول طے کرتا ہے۔"],
  learning: ["Open your timetable, teacher-assigned learning tasks and school updates.", "افتح جدولك ومهام التعلم التي يحددها المعلم وتحديثات المدرسة.", "ٹائم ٹیبل، استاد کے دیے ہوئے کام اور اسکول کی خبریں کھولیں۔"],
  children: ["See attendance, schedules and updates for the children linked to your account.", "اطلع على الحضور والجداول والتحديثات للأبناء المرتبطين بحسابك.", "منسلک بچوں کی حاضری، اوقات اور خبریں دیکھیں۔"],
  fees: ["Review campus fee records, outstanding balances and finance tasks.", "راجع سجلات رسوم الفرع والأرصدة المستحقة والمهام المالية.", "کیمپس کی فیس، بقایا اور مالی کام دیکھیں۔"],
  library: ["Open the catalogue, borrowing records and library member tools.", "افتح الفهرس وسجلات الاستعارة وأدوات أعضاء المكتبة.", "کتابوں کی فہرست، ادھار ریکارڈ اور اراکین کے ٹولز کھولیں۔"],
  frontDesk: ["Open visitor records, admissions enquiries and your daily front-desk tools.", "افتح سجلات الزوار واستفسارات القبول وأدوات الاستقبال اليومية.", "زائرین، داخلہ سوالات اور روزمرہ استقبالیہ کے ٹولز کھولیں۔"],
  workspace: ["Continue to your role’s workspace. You can replay this guide from Help.", "تابع إلى مساحة عمل دورك. يمكنك إعادة هذا الدليل من «المساعدة».", "اپنے کردار کی ورک اسپیس پر جائیں۔ «مدد» سے یہ رہنمائی دوبارہ دیکھ سکتے ہیں۔"],
};
/** The two flagships (addendum 2026-10-22): their names follow the sidebar; one truthful sentence each. */
const flagships: Record<Flagship, { name: readonly [string, string, string]; pitch: readonly [string, string, string] }> = {
  "ai-workflows": {
    name: ["AI Workflows", "مسارات الذكاء الاصطناعي", "اے آئی ورک فلوز"],
    pitch: ["AI drafts your setup and routine work such as timetables and announcements; nothing applies until it is approved.", "يُعدّ الذكاء الاصطناعي مسودات الإعداد والأعمال الدورية مثل الجداول والإعلانات؛ ولا يُطبَّق شيء قبل اعتماده.", "اے آئی ترتیب اور نظام الاوقات و اعلانات جیسے معمول کے کاموں کے مسودے بناتا ہے؛ منظوری سے پہلے کچھ لاگو نہیں ہوتا۔"],
  },
  "exam-studio": {
    name: ["Exam Studio", "استوديو الاختبارات", "ایگزام اسٹوڈیو"],
    pitch: ["AI builds assessments from your material; deliver them securely, mark them and plan learning recovery.", "يبني الذكاء الاصطناعي الاختبارات من موادك؛ قدّمها بأمان وصحّحها وخطّط لتعويض ما فات من التعلّم.", "اے آئی آپ کے مواد سے جائزے تیار کرتا ہے؛ انہیں محفوظ طریقے سے لیں، جانچیں اور تعلیمی کمی کی تلافی کا منصوبہ بنائیں۔"],
  },
};

export function launchCopy(language: Language) {
  const index = language === "ar" ? 1 : language === "ur" ? 2 : 0;
  const scoped = (key: LaunchTask, school: boolean) => school && key === "campus" ? ownerSchoolTask : school && key === "aiSetup" ? schoolSetupTask : tasks[key];
  return {
    ...Object.fromEntries(Object.entries(words).map(([key, values]) => [key, values[index]])) as Record<keyof typeof words, string>,
    journey: (key: LaunchJourney) => journeys[key][index],
    preparation: (key: LaunchJourney) => preparations[key][index],
    /**
     * `school`: the task is the whole school's — the standalone owner's campus task is the school's own profile, and
     * the institution authority (the group admin or the standalone owner) sets up the school, not one campus, with AI.
     */
    task: (key: LaunchTask, school = false) => scoped(key, school)[index],
    taskDetail: (key: LaunchTask, school = false) => (school && key === "campus" ? ownerSchoolTaskDetail : taskDetails[key])[index],
    flagshipName: (key: Flagship) => flagships[key].name[index],
    flagshipPitch: (key: Flagship) => flagships[key].pitch[index],
  };
}
