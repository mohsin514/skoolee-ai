import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The interactive transaction a prisma.$transaction callback is running in.
 * Lives in its own module so the audit trail can write into the same transaction
 * without importing the client (which imports the audit trail).
 */
export type ReferenceClient = Record<string, { findFirst: (args: unknown) => Promise<unknown> }>;
declare global { var __skooleeReferenceTransaction: AsyncLocalStorage<ReferenceClient> | undefined; }
export const referenceTransaction = globalThis.__skooleeReferenceTransaction ??= new AsyncLocalStorage<ReferenceClient>();
