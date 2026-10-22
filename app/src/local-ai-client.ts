import { Campaign, item } from './game';
import { adventureById } from './adventures';
import { Command, parseCommand, proposalToCommand } from './commands';
import { learnValidatedMapping, retrieveLearnedMapping } from './learnedMappings';

export type LocalAiStatus={available:boolean;model:string|null;reason:string|null;reachable:boolean};
export type AiContext={adventure:{id:string;title:string;premise:string;locations:{id:string;name:string;description:string}[];npcs:{id:string;name:string;location:string;role:string}[]};mode:Campaign['mode'];scene:string;location:Campaign['location'];sceneStep:number;guardianHp:number;activeCharacter:unknown;party:unknown[];objectives:unknown[];facts:string[];evidence:string[];npcStatements:string[];theories:string[];unresolved:string[];recentEvents:{kind:string;text:string}[]};
type Fetcher=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
const timeout=(ms:number)=>AbortSignal.timeout(ms);

export async function getLocalAiStatus(fetcher:Fetcher=fetch):Promise<LocalAiStatus>{
 try{const response=await fetcher('/api/ai/status',{signal:timeout(2200)});if(!response.ok)throw new Error('AI status request failed.');const data=await response.json();if(typeof data?.available!=='boolean')throw new Error('AI status response was invalid.');return{available:data.available,model:typeof data.model==='string'?data.model:null,reason:typeof data.reason==='string'?data.reason:null,reachable:true};}
 catch{return{available:false,model:null,reason:'Local AI service is unavailable.',reachable:false};}
}

export async function selectCommand(text:string,campaign:Campaign,activeId:string,aiEnabled:boolean,aiAvailable:boolean,fetcher:Fetcher=fetch,requestTimeoutMs=95000):Promise<{command:Command;source:'model'|'fallback';aiFailed:boolean}>{
 const fallback=parseCommand(text,campaign,activeId);if(fallback.reason!=='unsupported'&&fallback.reason!=='narrative-question')return{command:fallback.command,source:'fallback',aiFailed:false};
 try{const learned=retrieveLearnedMapping(text,campaign);if(learned)return{command:learned,source:'fallback',aiFailed:false};}catch{/* Storage can be unavailable in a private or restricted browser context. */}
 if(aiEnabled&&aiAvailable){
  try{
   const response=await fetcher('/api/ai/interpret',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,context:makeContext(campaign,activeId)}),signal:timeout(requestTimeoutMs)});
   if(!response.ok)throw new Error('Local model request failed.');
   const data=await response.json();const parsed=proposalToCommand(data?.proposal,campaign,activeId);
   if(parsed){try{learnValidatedMapping(text,parsed.command,campaign);}catch{/* Learning is optional; command execution is not. */}return{command:parsed.command,source:'model',aiFailed:false};}
  }catch{return{command:fallback.command,source:'fallback',aiFailed:true};}
  return{command:fallback.command,source:'fallback',aiFailed:false};
 }
 return{command:fallback.command,source:'fallback',aiFailed:false};
}

function makeContext(c:Campaign,activeId:string):AiContext{
 const shape=(ch:Campaign['characters'][number])=>({id:ch.id,name:ch.name,className:ch.className,hp:ch.hp,maxHp:ch.maxHp,inventory:ch.inventory.map(s=>({id:s.itemId,name:item(s.itemId).name,quantity:s.quantity})),abilities:ch.abilities.map(a=>({name:a.name,description:a.description,uses:a.uses,maxUses:a.maxUses}))});
 const adventure=adventureById(c.adventureId);
 const scene=adventure.id==='shattered-bell'?(c.location==='crypt'?'Inside the chapel crypt; its source remains undiscovered.':c.location==='deep-crypt'?'Inside the lower reliquary; the source is not yet identified.':c.location==='chapel'?c.guardianHp===0?'The guardian is defeated and the crypt stairs are open.':'The stone guardian blocks the chapel entrance.':c.scene):(adventure.locations.find(location=>location.id===c.location)?.description??c.scene);
 return{adventure:{id:adventure.id,title:adventure.title,premise:adventure.premise,locations:adventure.locations.map(({id,name,description})=>({id,name,description})),npcs:adventure.npcs.map(({id,name,location,role})=>({id,name,location,role}))},mode:c.mode,scene,location:c.location,sceneStep:c.sceneStep,guardianHp:c.guardianHp,activeCharacter:shape(c.characters.find(ch=>ch.id===activeId)??c.characters[0]),party:c.characters.map(shape),objectives:c.objectives,facts:c.facts,evidence:c.evidence,npcStatements:c.npcStatements,theories:c.theories,unresolved:c.unresolved,recentEvents:c.log.slice(-8).map(({kind,text})=>({kind,text}))};
}
