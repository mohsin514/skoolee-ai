import { createRoot } from 'react-dom/client';
import { ChatProvider } from './provider';
import { ChatDock } from '../../../src/components/chat/chat-dock';
import { MessagesWorkspace } from '../../../src/app/messages/messages-workspace';
const dock=location.pathname==='/dock';
createRoot(document.getElementById('fixture-root')!).render(<ChatProvider>{dock?<><main className="p-6"><h1 className="text-xl font-semibold">School workspace</h1></main><ChatDock/></>:<MessagesWorkspace dashboardHref="/dashboard"/>}</ChatProvider>);
