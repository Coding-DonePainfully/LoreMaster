import { ATTRIBUTE_BASE, ATTRIBUTE_KEYS, ATTRIBUTE_MAX, ATTRIBUTE_MIN, ATTRIBUTE_POINTS, Attributes, Campaign, CATALOG, ClassKey, maxHitPoints } from './game';
import { ADVENTURES } from './adventures';

const KEY='loremaster.campaign.v2';
const classes:ClassKey[]=['Fighter','Barbarian','Rogue','Ranger','Wizard','Cleric','Paladin','Bard'];
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type LegacyCharacter=Campaign['characters'][number]&{statPointsSpent?:number;statuses?:Campaign['characters'][number]['statuses']};
type LegacyCampaign=Omit<Campaign,'version'|'characters'|'combat'|'failedChecks'|'securedRoutes'>&{version:2|3;characters:LegacyCharacter[];location?:string;adventureId?:Campaign['adventureId'];mode?:Campaign['mode'];evidence?:string[];npcStatements?:string[];theories?:string[];unresolved?:string[];discoveredClues?:string[];sandboxTargetHp?:number;combat?:Campaign['combat'];failedChecks?:Record<string,number>;securedRoutes?:string[]};

function validRoundState(value:unknown,campaign:LegacyCampaign){if(!value||typeof value!=='object')return false;const round=value as NonNullable<Campaign['roundState']>;return Number.isInteger(round.currentRound)&&round.currentRound>0&&['PLANNING','RESOLVING','NARRATING'].includes(round.phase)&&typeof round.isReadyToResolve==='boolean'&&Boolean(round.queuedActions&&typeof round.queuedActions==='object'&&!Array.isArray(round.queuedActions)&&Object.entries(round.queuedActions).every(([id,action])=>campaign.characters.some(character=>character.id===id)&&(action===null||typeof action==='object'&&action.characterId===id&&typeof action.characterName==='string'&&['SLASH','SPECIAL','SPELL','MOVE','USE_ITEM','INTERACT','SKIP'].includes(action.type))))&&(round.checkpoint===undefined||Boolean(round.checkpoint&&Number.isInteger(round.checkpoint.roundNumber)&&round.checkpoint.roundNumber>0&&Array.isArray(round.checkpoint.characters)&&round.checkpoint.characters.every(character=>validCharacter(character,true))&&Array.isArray(round.checkpoint.objectives)&&Array.isArray(round.checkpoint.facts)));}

function validCharacter(c:LegacyCharacter,strict:boolean){
 if(!c||typeof c.id!=='string'||typeof c.name!=='string'||!classes.includes(c.className)||!Array.isArray(c.inventory)||!c.inventory.every(s=>s&&CATALOG.some(i=>i.id===s.itemId)&&Number.isInteger(s.quantity)&&s.quantity>0)||!c.effects||!Number.isInteger(c.effects.nextCheckBonus)||!Number.isInteger(c.effects.nextAttackBonus)||typeof c.hp!=='number'||typeof c.maxHp!=='number'||c.hp<0||c.hp>c.maxHp||!c.attributes||!ATTRIBUTE_KEYS.every(key=>Number.isInteger(c.attributes[key])&&c.attributes[key]>=ATTRIBUTE_MIN&&c.attributes[key]<=ATTRIBUTE_MAX)||!Array.isArray(c.abilities)||!c.abilities.every(a=>a&&Number.isInteger(a.uses)&&Number.isInteger(a.maxUses)))return false;
 if(strict&&!Array.isArray(c.statuses))return false;
 if(strict&&c.statuses!.some(effect=>!['fire','poison','dazed','recovery'].includes(effect.id)||!Number.isInteger(effect.duration)||effect.duration<1))return false;
 if(strict){const spent=ATTRIBUTE_KEYS.reduce((sum,key)=>sum+c.attributes[key]-ATTRIBUTE_BASE,0);if(spent>ATTRIBUTE_POINTS||c.statPointsSpent!==spent||c.maxHp!==maxHitPoints(c.attributes)||!Array.isArray(c.statuses))return false;}
 return true;
}

export function isCampaign(value:unknown):value is Campaign {
 if(!value||typeof value!=='object')return false;
 const x=value as LegacyCampaign;
 const validCombat=x.combat===undefined||x.combat===null||Boolean(x.combat&&typeof x.combat.active==='boolean'&&Number.isInteger(x.combat.round)&&x.combat.round>0&&Array.isArray(x.combat.queue)&&Number.isInteger(x.combat.currentIndex)&&x.combat.currentIndex>=0&&x.combat.currentIndex<x.combat.queue.length&&Number.isInteger(x.combat.enemyHp)&&x.combat.enemyHp>=0&&Array.isArray(x.combat.enemyStatuses));
 return Boolean((x.version===2||x.version===3)&&typeof x.title==='string'&&typeof x.scene==='string'&&(x.location===undefined||ADVENTURES.some(a=>a.locations.some(l=>l.id===x.location)))&&(x.adventureId===undefined||ADVENTURES.some(a=>a.id===x.adventureId))&&(x.mode===undefined||x.mode==='story'||x.mode==='dev')&&Number.isInteger(x.sceneStep)&&Number.isInteger(x.guardianHp)&&Array.isArray(x.characters)&&x.characters.length>0&&x.characters.length<=4&&Array.isArray(x.log)&&Array.isArray(x.objectives)&&Array.isArray(x.facts)&&(x.actedThisTurn===undefined||Array.isArray(x.actedThisTurn)&&x.actedThisTurn.every(id=>typeof id==='string'))&&(x.roundState===undefined||validRoundState(x.roundState,x))&&x.characters.every(c=>validCharacter(c,x.version===3))&&x.characters.some(c=>c.id===x.activeId)&&validCombat&&(x.version===2||x.failedChecks&&typeof x.failedChecks==='object'&&!Array.isArray(x.failedChecks)&&Array.isArray(x.securedRoutes)));
}

function migrateAttributes(old:Attributes):Attributes {
 const source=Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,Math.max(ATTRIBUTE_MIN,Math.min(ATTRIBUTE_MAX,Math.round(old?.[key]??ATTRIBUTE_BASE)))])) as Attributes;
 const points=ATTRIBUTE_KEYS.reduce((sum,key)=>sum+source[key]-ATTRIBUTE_BASE,0);
 if(points<=ATTRIBUTE_POINTS)return source;
 const weights=ATTRIBUTE_KEYS.map(key=>({key,weight:source[key]-ATTRIBUTE_BASE,allocated:0,remainder:0}));
 const total=weights.reduce((sum,x)=>sum+x.weight,0)||1;let assigned=0;
 for(const x of weights){const exact=ATTRIBUTE_POINTS*x.weight/total;x.allocated=Math.floor(exact);x.remainder=exact-x.allocated;assigned+=x.allocated;}
 weights.sort((a,b)=>b.remainder-a.remainder);for(let i=0;i<ATTRIBUTE_POINTS-assigned;i++)weights[i].allocated++;
 return Object.fromEntries(weights.map(x=>[x.key,ATTRIBUTE_BASE+x.allocated])) as Attributes;
}

export function normalizeCampaign(input:Campaign):Campaign {
 const legacy=input as unknown as LegacyCampaign;let keptSeal=false;
 const characters=legacy.characters.map(old=>{
  const attributes=old.statPointsSpent===undefined?migrateAttributes(old.attributes):old.attributes;
  const statPointsSpent=ATTRIBUTE_KEYS.reduce((sum,key)=>sum+attributes[key]-ATTRIBUTE_BASE,0);
  const maxHp=maxHitPoints(attributes);const hp=Math.min(maxHp,Math.max(0,Math.round(old.hp/Math.max(1,old.maxHp)*maxHp)));
  const inventory=old.inventory.flatMap(s=>{if(s.itemId!=='moon-seal')return[s];if(keptSeal)return[];keptSeal=true;return[{...s,quantity:1}];});
  return{...old,attributes:{...attributes},statPointsSpent,maxHp,hp,statuses:old.statuses??[],inventory};
 });
 const found='The party found the moon seal beneath a loose flagstone.';
 const facts0=legacy.guardianHp===0?legacy.facts.filter(f=>!/stone guardian watches the chapel entrance/i.test(f)):legacy.facts;
 const facts=keptSeal&&!facts0.includes(found)?[...facts0,found]:facts0;
 const location=legacy.location??(legacy.sceneStep>=2?'chapel':'inn');const adventureId=legacy.adventureId??'shattered-bell';const mode=legacy.mode??'story';
 const evidence=legacy.evidence??(keptSeal?[found]:[]);const npcStatements=legacy.npcStatements??facts.filter(f=>/^Mara says/i.test(f));
 const discoveredClues=legacy.discoveredClues??(keptSeal?['moon-seal']:[]);const theories=legacy.theories??[];
 const unresolved=legacy.unresolved??(adventureId==='shattered-bell'?['What is waking beneath the chapel?']:[]);
 const objectives=!legacy.adventureId&&adventureId==='shattered-bell'&&legacy.objectives.length===3?[...legacy.objectives,{text:'Trace the bell’s echo into the lower reliquary',done:false}]:legacy.objectives;
 return{...legacy,version:3,id:legacy.id,title:legacy.title,adventureId,mode,characters,location,scene:legacy.scene,sceneStep:legacy.sceneStep,guardianHp:legacy.guardianHp,sandboxTargetHp:legacy.sandboxTargetHp??12,facts,evidence,npcStatements,theories,unresolved,discoveredClues,objectives,log:legacy.log,combat:legacy.combat??null,failedChecks:legacy.failedChecks??{},securedRoutes:legacy.securedRoutes??[],actedThisTurn:legacy.actedThisTurn??[]};
}

export function loadCampaign(storage:StorageLike=localStorage):Campaign|null {try{const raw=storage.getItem(KEY);if(!raw)return null;const parsed:unknown=JSON.parse(raw);return isCampaign(parsed)?normalizeCampaign(parsed):null;}catch{return null;}}
export function saveCampaign(campaign:Campaign,storage:StorageLike=localStorage):void {storage.setItem(KEY,JSON.stringify(campaign));}
export function clearCampaign(storage:StorageLike=localStorage):void {storage.removeItem(KEY);}
