import type { ConversationFilter } from "./chat-provider";

type Ui = (text: string, args?: Array<string | number>) => string;

export type EmptyListCopy = { title: string; body: string; showNewMessage: boolean };

/**
 * SKAI-1939: an active search that finds nothing is "no matches", never the first-run "No conversations yet"
 * state, which would suggest the inbox itself is empty. Only the unsearched "all" list offers New message.
 */
export function emptyListCopy(filter: ConversationFilter, search: string, ui: Ui): EmptyListCopy {
  if (search.trim()) {
    return { title: ui("No matching conversations"), body: ui("Try a different name or word."), showNewMessage: false };
  }
  if (filter === "unread") return { title: ui("Nothing unread"), body: ui("You are all caught up."), showNewMessage: false };
  if (filter === "archived") {
    return { title: ui("No archived chats"), body: ui("Archived conversations land here."), showNewMessage: false };
  }
  return {
    title: ui("No conversations yet"),
    body: ui("Start one with a colleague, a teacher, or the office."),
    showNewMessage: true,
  };
}
