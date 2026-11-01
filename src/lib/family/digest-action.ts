/**
 * SKAI-1455: a digest action is two requests. The PATCH commits the change; the GET re-reads the digest.
 * A failed re-read after a committed PATCH must never be reported as an unsaved change, so the two steps
 * are reported separately and the refresh can only mark the view stale.
 */
type Failure = Error & { status?: number };

export type DigestActionOutcome<T> =
  | { committed: false; message: string; status?: number }
  | { committed: true; result: T; refreshed: true }
  | { committed: true; result: T; refreshed: false; refreshStatus?: number };

export async function runDigestAction<T>({ mutate, refresh }: { mutate: () => Promise<T>; refresh: () => Promise<unknown> }): Promise<DigestActionOutcome<T>> {
  let result: T;
  try {
    result = await mutate();
  } catch (error) {
    // Nothing committed. Re-read so the view matches the server; a failed re-read changes nothing here.
    await refresh().catch(() => undefined);
    const failure = error as Failure;
    return { committed: false, message: failure.message, status: failure.status };
  }
  try {
    await refresh();
    return { committed: true, result, refreshed: true };
  } catch (error) {
    return { committed: true, result, refreshed: false, refreshStatus: (error as Failure).status };
  }
}
