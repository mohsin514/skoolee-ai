import { createRoot } from 'react-dom/client';
import { ExamScripts } from '../../../src/components/school-ai/exam-scripts';
import type { PaperData } from '../../../src/lib/school-ai/assessment';
// SKAI-1566: mounts the real ExamScripts component; the spec answers its roster/source requests.
const paper = { subjectId: 'qa01-subject', classId: 'qa01-class', questions: [] } as unknown as PaperData;
createRoot(document.getElementById('root')!).render(<ExamScripts id="qa01-exam" paper={paper} locale="en" onImported={async () => {}} />);
