const isDev = process.env.NODE_ENV !== "production";

export const logger = {
  info(tag: string, ...args: unknown[]) {
    if (isDev) console.log(`[${tag}]`, ...args);
  },
  warn(tag: string, ...args: unknown[]) {
    console.warn(`[${tag}]`, ...args);
  },
  error(tag: string, ...args: unknown[]) {
    console.error(`[${tag}]`, ...args);
  },
  debug(tag: string, ...args: unknown[]) {
    if (isDev) console.log(`[${tag}][debug]`, ...args);
  },
};
