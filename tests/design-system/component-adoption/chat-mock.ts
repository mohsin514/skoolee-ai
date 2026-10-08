const contacts = [{id:'fixture-contact',fullName:'Synthetic Teacher',role:'TEACHER',email:'fixture@example.test',profileImageUrl:null,campusName:'Example campus',context:'Example classroom'}];
const api = {
 viewer: {id:'fixture-viewer',fullName:'Synthetic Coordinator',role:'CAMPUS_ADMIN',email:'coordinator@example.test',canCreateGroup:true},
 searchDirectory: async()=>contacts,
 startDirect: async(id:string)=>{await fetch('/synthetic/direct',{method:'POST',body:JSON.stringify({id})});return 'fixture-conversation';},
 createGroup: async(payload:unknown)=>{await fetch('/synthetic/group',{method:'POST',body:JSON.stringify(payload)});return 'fixture-group';},
 sendMessage: async(payload:unknown)=>{const r=await fetch('/synthetic/send',{method:'POST',body:JSON.stringify(payload)});if(!r.ok)throw Error('Synthetic send refused');},
 notifyTyping: ()=>{},
};
export function useChat(){return api;}
