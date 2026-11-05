import { Prisma } from "@prisma/client";

/**
 * SKAI-1782: two confirmations racing for the last seat make PostgreSQL abort one Serializable transaction,
 * sometimes only at COMMIT. That is a concurrency outcome, not a server fault: re-run the whole transaction so
 * the loser re-reads occupancy and gets the domain answer ("The target class is full …", 409).
 */
export function isSerializationConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") return true;
    if (error.code === "P2010" && ["40001", "40P01"].includes(String((error.meta as { code?: unknown } | undefined)?.code))) return true;
  }
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && /could not serialize access|write conflict or a deadlock|\b40001\b|\b40P01\b/i.test(message);
}

export async function retrySerializable<T>(work: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (!isSerializationConflict(error) || attempt >= attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, 20 * attempt + Math.floor(Math.random() * 30)));
    }
  }
}
