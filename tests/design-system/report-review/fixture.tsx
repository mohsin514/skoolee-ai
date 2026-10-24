import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { ReportCardPipeline } from '../../../src/components/academic/ReportCardPipeline';
import type { ExamItem } from '../../../src/components/academic/ExamCycleManager';
import { StaticLocaleProvider } from '../../../src/components/locale/LocaleProvider';
import { defaultLocale } from '../../../src/lib/locale/package';
function Fixture() {
 const [id,setId]=useState('exam-a');
 const language=new URL(location.href).searchParams.get('language') as 'en'|'ar'|'ur';
 return <StaticLocaleProvider value={{...defaultLocale,language}}><button onClick={()=>setId(id==='exam-a'?'exam-b':'exam-a')}>Switch exam</button><ReportCardPipeline exam={{id,title:id,class:{name:'Year 8',section:'A'}} as ExamItem} campusId={id==='exam-a'?'campus-a':'campus-b'} /></StaticLocaleProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
