import { CurriculumPacks } from "@/components/curriculum/CurriculumPacks";
import { localizedTitle } from "@/lib/locale/page-title";

// §7.3 distinct <title>, in the viewer's language (SKAI-2250).
export const generateMetadata = () => localizedTitle("Curriculum packs");

export default function CurriculumPacksPage() { return <CurriculumPacks />; }
