import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GuardianAccessManager } from '../../../src/components/GuardianAccessManager';
import { ProvisionSchoolModal } from '../../../src/components/owner/provisioning-modals';
import { ChatSettingsDialog } from '../../../src/components/chat/chat-settings-dialog';
import { NewConversationDialog } from '../../../src/components/chat/new-conversation-dialog';
import { Composer } from '../../../src/components/chat/composer';
import { StickySaveBar } from '../../../src/components/teacher/sticky-save-bar';
import { Button } from '../../../src/components/ui/button';
import { StatCard } from '../../../src/components/role-dashboard/StatCard';
import { BookOpen } from 'lucide-react';
import { RoleShell } from "../../../src/components/role-dashboard/RoleShell";
import { Input } from "../../../src/components/ui/input";
import { WorkspaceSubnav, SidebarNavigationContext } from '../../../src/components/nav/WorkspaceSubnav';

const student = { id:'fixture-student',fullName:'Synthetic Learner',rollNo:'TEST-1',class:{id:'class-1',name:'Example',section:'A'},campus:{id:'campus-1',name:'Example campus'} };
function ShellFixture() {
 const [draft, setDraft] = useState("");
 return <RoleShell navItems={[{ label: "Reports", icon: BookOpen, module: "reports", active: true, onClick: () => {} }]}><label>Workspace draft<Input value={draft} onChange={e => setDraft(e.target.value)} /></label><WorkspaceSubnav label="Duplicate sections" items={[{ id: "reports", label: "Reports" }]} /></RoleShell>;
}
function Fixture(){
 const [panel,setPanel]=useState(''); const [saved,setSaved]=useState(0); const [view,setView]=useState('overview');
 return <main className="min-w-0 p-4"><h1>Component adoption fixture</h1><div className="flex flex-wrap gap-2">
 {['guardian','provision','settings','conversation','composer','savebar','navigation','sidebar-navigation','role-shell','statcard'].map(name=><Button key={name} onClick={()=>setPanel(name)}>Open {name}</Button>)}
 </div>
 {panel==='role-shell'&&<ShellFixture />}
 {panel==='guardian'&&<GuardianAccessManager students={[student]} locale={(document.documentElement.lang==='ur'?'ur':'en')} />}
 {panel==='provision'&&<ProvisionSchoolModal onClose={()=>setPanel('')} onCreated={()=>setSaved(n=>n+1)} />}
 <ChatSettingsDialog open={panel==='settings'} onClose={()=>setPanel('')} />
 <NewConversationDialog open={panel==='conversation'} onClose={()=>setPanel('')} />
 {panel==='composer'&&<Composer conversationId="fixture-conversation" canPost lockedReason="" replyTo={null} onClearReply={()=>{}} editing={null} onClearEditing={()=>{}} onSubmitEdit={async()=>{}} />}
 {panel==='savebar'&&<><StickySaveBar dirtyCount={2} saving={false} onSave={()=>setSaved(n=>n+1)} onReset={()=>setSaved(0)} /><output aria-label="Saved count">{saved}</output></>}
 {panel==='statcard'&&<><StatCard icon={BookOpen} label="Example records" value={12} onClick={()=>setSaved(n=>n+1)} /><output aria-label="Card activations">{saved}</output></>}
 {(panel==='navigation'||panel==='sidebar-navigation')&&<SidebarNavigationContext.Provider value={panel==='sidebar-navigation'}><WorkspaceSubnav label="Example workspace" items={[{id:'overview',label:'Overview'},{id:'reports',label:'Reports'}]} active={view} onSelect={setView}/><output aria-label="Selected view">{view}</output></SidebarNavigationContext.Provider>}
 </main>
}
createRoot(document.getElementById('fixture-root')!).render(<Fixture/>);
