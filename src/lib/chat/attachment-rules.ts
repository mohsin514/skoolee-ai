// One list for presign and send, so the check at upload and the check at send can never disagree.
// Deliberately narrow: a school messaging system is not a file host, and every type outside this list
// is one a browser might be talked into executing or rendering as something it is not.
export const CHAT_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
