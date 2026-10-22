// ===========================================
// Dialog — the compound (shadcn-shaped) API
// ===========================================

"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOverlayMessages } from "@/hooks/use-overlay-messages";
import { ModalSurface, useModalSurface, type ModalSize } from "./modal";
import { Button } from "./button";
import { IconButton } from "./icon-button";

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
 * call sites that compose their own header. It is a thin adapter: every part
 * below renders on `ModalSurface` (the same shell `Modal` uses) and on the
 * shared `Button`, so it cannot drift from the one dialog API (§8.1 R2). New
 * imports of `DialogContent` are counted by the check:ui ratchet.
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
const DialogCloseContext = React.createContext({ close: () => {}, dismissible: true });

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
    <Button type="button" variant="outline" onClick={() => setOpen(true)}>
      {children}
    </Button>
  );
}

/** @deprecated Use `Modal` (or `ModalSurface` for a custom sheet). Kept as an adapter for existing call sites. */
function DialogContent({
  children,
  className,
  size,
  dirty,
  dirtyMessage,
  dismissible,
  initialFocusRef,
  returnFocusRef,
}: {
  children: React.ReactNode;
  className?: string;
  size?: ModalSize;
  /** Holds typed-but-unsaved input — closing then asks before discarding. */
  dirty?: boolean;
  dirtyMessage?: string;
  dismissible?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const { open, setOpen } = React.useContext(DialogContext);

  if (!open) return null;

  return (
    <ModalSurface
      onClose={() => setOpen(false)}
      size={size}
      dirty={dirty}
      dirtyMessage={dirtyMessage}
      dismissible={dismissible}
      initialFocusRef={initialFocusRef}
      returnFocusRef={returnFocusRef}
      className={className}
    >
      <DialogBody>{children}</DialogBody>
    </ModalSurface>
  );
}

function DialogBody({ children }: { children: React.ReactNode }) {
  const copy = useOverlayMessages();
  const { requestClose, dismissible, dragHandleProps } = useModalSurface();

  return (
    <DialogCloseContext.Provider value={{ close: requestClose, dismissible }}>
      {/* No pinned header here — these call sites compose their own with
          DialogHeader. The grab strip is still the phone's drag target, so
          the sheet stays dismissable by gesture. */}
      <div {...dragHandleProps} className="shrink-0 touch-none pt-3 sm:hidden">
        <div className="mx-auto h-1.5 w-11 rounded-full bg-ink-strong/15" aria-hidden />
      </div>

      <IconButton
        label={copy.close}
        tooltip={copy.closeEscape}
        size="sm"
        className="absolute end-4 top-4 z-20 text-ink-subtle"
        onClick={requestClose}
        disabled={!dismissible}
      >
        <X aria-hidden="true" />
      </IconButton>

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
  const { close, dismissible } = React.useContext(DialogCloseContext);

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ onClick?: () => void; disabled?: boolean }>;
    return React.cloneElement(child, {
      onClick: close,
      disabled: child.props.disabled || !dismissible,
    });
  }

  return (
    <Button type="button" variant="outline" onClick={close} disabled={!dismissible}>
      {children}
    </Button>
  );
}

function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mb-5 flex flex-col space-y-1.5 pe-10 text-start", className)}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  const { titleId } = useModalSurface();
  return (
    <h2
      className={cn("text-2xl font-bold leading-tight text-foreground", className)}
      {...props}
      id={titleId}
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
