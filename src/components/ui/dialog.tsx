// ===========================================
// Dialog — the compound (shadcn-shaped) API
// ===========================================

"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModalSurface, useModalSurface, type ModalSize } from "./modal";

/**
 * The trigger/content compound API, for the handful of screens written against
 * it — the class list, the bulk student import and the fee management panel.
 *
 * The shell underneath is now the shared `ModalSurface`, so these six dialogs
 * pick up the same portal, layering, focus trap, scroll lock and mobile sheet
 * as everything else. Previously this file had its own copy that portaled and
 * handled Escape but never moved focus, and stacked itself at a fixed `z-[120]`
 * — under the account dropdowns, which sit at `z-[999]`.
 *
 * `Modal` is the better starting point for anything new; this stays for the
 * call sites that compose their own header.
 */

interface DialogContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextType>({
  open: false,
  setOpen: () => {},
});

/** Lets DialogContent hand its close action down to a nested DialogClose. */
const DialogCloseContext = React.createContext<() => void>(() => {});

function Dialog({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
}

function DialogTrigger({
  children,
  asChild,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const { setOpen } = React.useContext(DialogContext);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => setOpen(true),
    });
  }

  return (
    <button type="button" onClick={() => setOpen(true)}>
      {children}
    </button>
  );
}

function DialogContent({
  children,
  className,
  size,
  dirty,
  dirtyMessage,
}: {
  children: React.ReactNode;
  className?: string;
  size?: ModalSize;
  /** Holds typed-but-unsaved input — closing then asks before discarding. */
  dirty?: boolean;
  dirtyMessage?: string;
}) {
  const { open, setOpen } = React.useContext(DialogContext);

  if (!open) return null;

  return (
    <ModalSurface
      onClose={() => setOpen(false)}
      size={size}
      dirty={dirty}
      dirtyMessage={dirtyMessage}
      className={className}
    >
      <DialogBody>{children}</DialogBody>
    </ModalSurface>
  );
}

function DialogBody({ children }: { children: React.ReactNode }) {
  const { requestClose, dragHandleProps } = useModalSurface();

  return (
    <DialogCloseContext.Provider value={requestClose}>
      {/* No pinned header here — these call sites compose their own with
          DialogHeader. The grab strip is still the phone's drag target, so
          the sheet stays dismissable by gesture. */}
      <div {...dragHandleProps} className="shrink-0 touch-none pt-3 sm:hidden">
        <div className="mx-auto h-1.5 w-11 rounded-full bg-[#1f1a23]/15" aria-hidden />
      </div>

      <button
        type="button"
        className="absolute right-4 top-4 z-20 rounded-xl p-2 text-ink-subtle transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/20"
        onClick={requestClose}
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </button>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6">
        {children}
      </div>
    </DialogCloseContext.Provider>
  );
}

/** Closes the surrounding DialogContent, playing its exit animation. */
function DialogClose({
  children,
  asChild,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const close = React.useContext(DialogCloseContext);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: close,
    });
  }

  return (
    <button type="button" onClick={close}>
      {children}
    </button>
  );
}

function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mb-5 flex flex-col space-y-1.5 pr-10 text-left", className)}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-2xl font-black leading-tight text-[#1f1a23]", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm font-medium text-ink-muted", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-end sm:gap-2",
        className
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
};
