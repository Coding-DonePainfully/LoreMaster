import { Campaign, item } from './game';
import { Command, parseCommand, proposalToCommand } from './commands';

export type LocalAiStatus={available:boolean;model:string|null;reason:string|null;reachable:boolean};
export type AiContext={scene:string;sceneStep:number;activeCharacter:unknown;party:unknown[];objectives:unknown[];facts:string[]};
type Fetcher=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
const timeout=(ms:number)=>AbortSignal.timeout(ms);

export async function getLocalAiStatus(fetcher:Fetcher=fetch):Promise<LocalAiStatus>{
 try{const response=await fetcher('/api/ai/status',{signal:timeout(2200)});if(!response.ok)throw new Error('AI status request failed.');const data=await response.json();if(typeof data?.available!=='boolean')throw new Error('AI status response was invalid.');return{available:data.available,model:typeof data.model==='string'?data.model:null,reason:typeof data.reason==='string'?data.reason:null,reachable:true};}
 catch{return{available:false,model:null,reason:'Local AI service is unavailable.',reachable:false};}
}

export async function selectCommand(text:string,campaign:Campaign,activeId:string,aiEnabled:boolean,aiAvailable:boolean,fetcher:Fetcher=fetch,requestTimeoutMs=95000):Promise<{command:Command;source:'model'|'fallback';aiFailed:boolean}>{
 const fallback=parseCommand(text,campaign,activeId);if(fallback.reason!=='unsupported'&&fallback.reason!=='narrative-question')return{command:fallback.command,source:'fallback',aiFailed:false};
 if(aiEnabled&&aiAvailable){
  try{
   const response=await fetcher('/api/ai/interpret',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,context:makeContext(campaign,activeId)}),signal:timeout(requestTimeoutMs)});
   if(!response.ok)throw new Error('Local model request failed.');
   const data=await response.json();const parsed=proposalToCommand(data?.proposal,campaign,activeId);
   if(parsed)return{command:parsed.command,source:'model',aiFailed:false};
  }catch{return{command:fallback.command,source:'fallback',aiFailed:true};}
  return{command:fallback.command,source:'fallback',aiFailed:false};
 }
 return{command:fallback.command,source:'fallback',aiFailed:false};
}

function makeContext(c:Campaign,activeId:string):AiContext{
 const shape=(ch:Campaign['characters'][number])=>({id:ch.id,name:ch.name,className:ch.className,hp:ch.hp,maxHp:ch.maxHp,inventory:ch.inventory.map(s=>({id:s.itemId,name:item(s.itemId).name,quantity:s.quantity})),abilities:ch.abilities.map(a=>a.name)});
 return{scene:c.scene,sceneStep:c.sceneStep,activeCharacter:shape(c.characters.find(ch=>ch.id===activeId)??c.characters[0]),party:c.characters.map(shape),objectives:c.objectives,facts:c.facts};
}
