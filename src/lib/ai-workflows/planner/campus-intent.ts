/** Narrow, explicit requests that need no model interpretation. Quoted announcement text is data. */
export function isCampusClassCount(text: string): boolean {
  const value = text.trim();
  return /^(?:how many classes (?:do we have|are there)|(?:show me )?the (?:number|count) of classes)(?: (?:on|in|at) (?:this|our|the) (?:campus|school))?[?.!]*$/i.test(value)
    || /^كم عدد (?:الصفوف|الفصول)(?: لدينا)?(?: في (?:هذا|هذه) (?:الفرع|المدرسة))?[؟?]*$/u.test(value)
    || /^(?:اس کیمپس میں )?(?:ہماری )?کتنی کلاسیں ہیں[؟?]*$/u.test(value);
}

export function quotedAnnouncement(text: string): string | null {
  const match = text.trim().match(/^(.*?)[:：]\s*(?:"([\s\S]*)"|“([\s\S]*)”|«([\s\S]*)»)\s*[.!۔]*$/u);
  if (!match) return null;
  const instruction = match[1].trim();
  // Only one explicit announcement request. Extra actions outside the quotation use normal planning.
  if (!/^(?:(?:queue|prepare|draft|send) (?:this |an? )?announcement(?: for parents)?|جهّز هذا الإعلان لأولياء الأمور|والدین کے لیے یہ اعلان تیار کریں)$/iu.test(instruction)) return null;
  return match[2] ?? match[3] ?? match[4] ?? null;
}
