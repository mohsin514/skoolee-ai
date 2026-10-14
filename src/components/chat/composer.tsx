"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ImageIcon, Loader2, Lock, Paperclip, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChat, type SendAttachment } from "./chat-provider";
import type { ChatMessageView } from "@/lib/chat/types";
import { Textarea as SystemTextarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { InputGroup } from "@/components/ui/input-group";

const MotionButton = motion.create(Button);


const MAX_LENGTH = 4000;

interface ComposerProps {
  conversationId: string;
  canPost: boolean;
  lockedReason: string;
  replyTo: ChatMessageView | null;
  onClearReply: () => void;
  editing: ChatMessageView | null;
  onClearEditing: () => void;
  onSubmitEdit: (body: string) => Promise<void>;
}

interface PendingFile {
  file: File;
  uploaded?: SendAttachment;
  error?: string;
}

export function Composer({
  conversationId,
  canPost,
  lockedReason,
  replyTo,
  onClearReply,
  editing,
  onClearEditing,
  onSubmitEdit,
}: ComposerProps) {
  const { sendMessage, notifyTyping } = useChat();
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Entering edit mode loads the existing text, so the author corrects what
  // they wrote rather than retyping it.
  useEffect(() => {
    if (editing) {
      setValue(editing.body);
      textareaRef.current?.focus();
    }
  }, [editing]);

  // Reset when the reader moves to another thread, so a half-typed message
  // never follows them into someone else's conversation.
  useEffect(() => {
    setValue("");
    setFiles([]);
  }, [conversationId]);

  // Grow with the text up to a ceiling — past that, the thread above matters
  // more than seeing the whole draft.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [value]);

  if (!canPost) {
    return (
      <div className="flex shrink-0 items-center justify-center gap-2 border-t border-[#cfc2d6]/25 bg-gradient-to-b from-[#fbf0fe]/60 to-white/80 px-4 py-4 backdrop-blur-xl">
        <Lock className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
        <p className="text-[11px] font-bold text-ink-muted">{lockedReason}</p>
      </div>
    );
  }

  async function uploadFile(file: File): Promise<PendingFile> {
    try {
      const presign = await fetch("/api/chat/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        }),
      });

      if (!presign.ok) {
        const json = await presign.json().catch(() => ({}));
        return { file, error: json.error ?? "Upload was refused" };
      }

      const { storageKey, uploadUrl } = await presign.json();

      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!put.ok) return { file, error: "Upload failed" };

      return {
        file,
        uploaded: {
          storageKey,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        },
      };
    } catch {
      return { file, error: "Upload failed" };
    }
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;

    const chosen = Array.from(list).slice(0, 5 - files.length);
    setFiles((prev) => [...prev, ...chosen.map((file) => ({ file }))]);

    for (const file of chosen) {
      const result = await uploadFile(file);
      setFiles((prev) => prev.map((p) => (p.file === file ? result : p)));
    }
  }

  async function submit() {
    const body = value.trim();
    const attachments = files
      .map((f) => f.uploaded)
      .filter((a): a is SendAttachment => Boolean(a));

    if (!body && attachments.length === 0) return;
    if (files.some((f) => !f.uploaded && !f.error)) return; // still uploading

    setIsSending(true);
    try {
      if (editing) {
        await onSubmitEdit(body);
      } else {
        await sendMessage({ body, replyToId: replyTo?.id, attachments });
        onClearReply();
      }
      setValue("");
      setFiles([]);
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  }

  const uploading = files.some((f) => !f.uploaded && !f.error);
  const canSend =
    (value.trim().length > 0 || files.some((f) => f.uploaded)) && !uploading && !isSending;
  const remaining = MAX_LENGTH - value.length;

  return (
    <div className="shrink-0 border-t border-border bg-card px-3 py-3 md:px-4">
      <AnimatePresence initial={false}>
        {(replyTo || editing) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-[#fbf0fe] to-white px-3 py-2 ring-1 ring-[#8127cf]/15">
              <span
                className="h-8 w-[3px] shrink-0 rounded-full bg-gradient-to-b from-[#8127cf] to-[#b10e6b]"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-[#8127cf]">
                  {editing
                    ? "Editing your message"
                    : `Replying to ${replyTo?.sender?.fullName ?? "message"}`}
                </p>
                <p className="truncate text-[11px] font-semibold text-ink-muted">
                  {(editing ?? replyTo)?.body}
                </p>
              </div>
              <Button variant="outline" size="icon"
                type="button"
                aria-label={editing ? "Cancel edit" : "Cancel reply"}
                onClick={() => {
                  if (editing) {
                    onClearEditing();
                    setValue("");
                  } else {
                    onClearReply();
                  }
                }}
                className="shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {files.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-2 flex flex-wrap gap-1.5 overflow-hidden"
          >
            {files.map((f, i) => (
              <li
                key={`${f.file.name}-${i}`}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-[10px] font-bold ring-1",
                  f.error
                    ? "bg-rose-50 text-rose-600 ring-rose-200"
                    : f.uploaded
                      ? "bg-[#fbf0fe] text-[#8127cf] ring-[#8127cf]/20"
                      : "bg-[#f4ecf8] text-ink-muted ring-[#cfc2d6]/30"
                )}
              >
                {f.error ? null : f.uploaded ? (
                  <Check className="h-3 w-3 shrink-0" aria-hidden />
                ) : (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
                )}
                {f.file.type.startsWith("image/") && (
                  <ImageIcon className="h-3 w-3 shrink-0" aria-hidden />
                )}
                <span className="max-w-[150px] truncate">{f.file.name}</span>
                {f.error && <span>· {f.error}</span>}
                <Button variant="outline" size="icon"
                  type="button"
                  aria-label={`Remove ${f.file.name}`}
                  onClick={() => setFiles((prev) => prev.filter((_, index) => index !== i))}

                >
                  <X className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <InputGroup className="items-end gap-2 p-1.5">
        {!editing && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
            />
            <Button variant="ghost" size="icon"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={files.length >= 5}
              aria-label="Attach a file"
              title="Attach a file"
              className="shrink-0"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          </>
        )}

        <label className="sr-only" htmlFor="chat-composer">
          Write a message
        </label>
        <SystemTextarea
          id="chat-composer"
          ref={textareaRef}
          rows={1}
          value={value}
          maxLength={MAX_LENGTH}
          onChange={(e) => {
            setValue(e.target.value);
            notifyTyping();
          }}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter starts a new line. The send button is
            // always shown because on touch keyboards Enter is a newline.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape" && editing) {
              onClearEditing();
              setValue("");
            }
          }}
          placeholder={editing ? "Edit your message…" : "Write a message…"}
          className="max-h-[150px] min-h-12 flex-1 resize-none px-2 py-3 text-sm"
        />

        <MotionButton variant="default" size="icon"
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label={editing ? "Save changes" : "Send message"}
          whileTap={canSend ? { scale: 0.9 } : undefined}
          animate={canSend ? { scale: 1 } : { scale: 0.94 }}
          transition={{ type: "spring", stiffness: 500, damping: 28 }}
          className="order-2 shrink-0"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : editing ? (
            <Check className="h-4 w-4" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </MotionButton>
      </InputGroup>

      {remaining < 200 && (
        <p
          className={cn(
            "mt-1 pr-1 text-right text-[10px] font-bold",
            remaining < 40 ? "text-rose-500" : "text-ink-faint"
          )}
        >
          {remaining} characters left
        </p>
      )}
    </div>
  );
}
