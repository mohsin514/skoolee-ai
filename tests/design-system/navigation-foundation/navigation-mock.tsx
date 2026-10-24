import { useSyncExternalStore, type ComponentProps } from 'react';
const event = 'fixture:navigate';
const subscribe = (callback: () => void) => { window.addEventListener(event, callback); window.addEventListener('popstate', callback); return () => { window.removeEventListener(event, callback); window.removeEventListener('popstate', callback); }; };
export function usePathname() { return useSyncExternalStore(subscribe, () => window.location.pathname, () => '/parent/results'); }
export function useSearchParams() { return new URLSearchParams(window.location.search); }
export function navigate(path: string) { window.history.pushState({}, '', path); window.dispatchEvent(new Event(event)); }
export function useRouter() { return { push: navigate, replace: navigate, refresh: () => window.dispatchEvent(new Event(event)) }; }
export default function Link({ href, onClick, ...props }: Omit<ComponentProps<'a'>, 'href'> & { href: string }) { return <a {...props} href={href} onClick={event => { onClick?.(event); if (!event.defaultPrevented && !event.ctrlKey && !event.metaKey) { event.preventDefault(); navigate(href); } }} />; }
