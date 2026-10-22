import type { Campaign } from './game';
import type { Command } from './commands';

export const LEARNED_MAPPING_KEY='loremaster.learned-mappings.v2';
export const LEARNED_MAPPING_SCHEMA=2;
export type LearnedMapping={schemaVersion:2;original:string;features:string[];intent:string;command:Command;adventureId:string;location:string;actorName:string;actorClass:string;actorExplicit:boolean;validated:true;confidence:number;createdAt:string};
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const words=(text:string)=>[...new Set(text.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim().split(' ').filter(word=>word.length>1))];
export function readLearnedMappings(storage:StorageLike=localStorage):LearnedMapping[]{try{const parsed=JSON.parse(storage.getItem(LEARNED_MAPPING_KEY)??'[]');if(!Array.isArray(parsed))return[];return parsed.filter(isMapping).slice(-250);}catch{return[];}}
function isCommand(value:unknown):value is Command {if(!value||typeof value!=='object'||Array.isArray(value))return false;const command=value as Record<string,unknown>;if(typeof command.type!=='string')return false;const characterTypes=['switch_character','ask_mara','inspect','search','travel_chapel','travel_crypt','travel_location','attack_guardian','use_ability','check','roll','use_item','equip_item','drop_item','unequip_item','accuse'];if(characterTypes.includes(command.type)&&typeof command.characterId!=='string')return false;if(['use_item','equip_item','drop_item'].includes(command.type)&&typeof command.itemId!=='string')return false;if(command.type==='travel_location'&&typeof command.locationId!=='string')return false;if(command.type==='accuse'&&typeof command.suspect!=='string')return false;if(command.type==='use_ability'&&typeof command.abilityName!=='string')return false;if(command.type==='check'&&typeof command.attribute!=='string')return false;if(command.type==='roll'&&typeof command.die!=='number')return false;return characterTypes.includes(command.type)||command.type==='show_inventory'||command.type==='show_abilities'||command.type==='help';}
function isMapping(value:unknown):value is LearnedMapping {if(!value||typeof value!=='object')return false;const m=value as Partial<LearnedMapping>;return m.schemaVersion===LEARNED_MAPPING_SCHEMA&&m.validated===true&&typeof m.original==='string'&&Array.isArray(m.features)&&m.features.every(feature=>typeof feature==='string')&&typeof m.intent==='string'&&typeof m.adventureId==='string'&&typeof m.location==='string'&&typeof m.actorName==='string'&&typeof m.actorClass==='string'&&typeof m.actorExplicit==='boolean'&&typeof m.createdAt==='string'&&typeof m.confidence==='number'&&m.confidence>=0.8&&isCommand(m.command);}
export function clearLearnedMappings(storage:StorageLike=localStorage){storage.removeItem(LEARNED_MAPPING_KEY);}
export function learnValidatedMapping(text:string,command:Command,campaign:Campaign,storage:StorageLike=localStorage):void {
 if(!text.trim()||command.type==='narrative_question'||command.type==='clarify')return;
 const actorId='characterId'in command?command.characterId:campaign.activeId;const actor=campaign.characters.find(character=>character.id===actorId);if(!actor)return;
 const mappings=readLearnedMappings(storage);const normalized=text.trim().slice(0,240);const inputWords=words(normalized).join(' ');const actorExplicit=(' '+inputWords+' ').includes(' '+words(actor.name).join(' ')+' ')||(' '+inputWords+' ').includes(' '+actor.className.toLowerCase()+' ');const mapping:LearnedMapping={schemaVersion:LEARNED_MAPPING_SCHEMA,original:normalized,features:words(normalized),intent:command.type,command,adventureId:campaign.adventureId,location:campaign.location,actorName:actor.name,actorClass:actor.className,actorExplicit,validated:true,confidence:0.9,createdAt:new Date().toISOString()};
 const kept=mappings.filter(existing=>!(existing.adventureId===mapping.adventureId&&existing.location===mapping.location&&existing.original.toLowerCase()===mapping.original.toLowerCase()));storage.setItem(LEARNED_MAPPING_KEY,JSON.stringify([...kept,mapping].slice(-250)));
}
function validForCurrentState(mapping:LearnedMapping,campaign:Campaign):boolean {
 if(mapping.adventureId!==campaign.adventureId||mapping.location!==campaign.location)return false;
 const actor=campaign.characters.find(character=>character.id===('characterId'in mapping.command?mapping.command.characterId:campaign.activeId));if(!actor||actor.name!==mapping.actorName||actor.className!==mapping.actorClass||(!mapping.actorExplicit&&campaign.activeId!==actor.id))return false;
 const command=mapping.command;
 if((command.type==='use_item'||command.type==='equip_item'||command.type==='drop_item')&&!actor.inventory.some(stack=>stack.itemId===command.itemId&&stack.quantity>0))return false;
 if(command.type==='use_ability'&&!actor.abilities.some(ability=>ability.name===command.abilityName&&ability.uses>0))return false;
 if(command.type==='travel_location'&&!adventureByState(campaign,command.locationId))return false;
 if(command.type==='accuse'&&!adventureByState(campaign,command.suspect))return false;
 return true;
}
function adventureByState(campaign:Campaign,id:string){return campaign.adventureId==='gilded-masquerade'?['ballroom','gallery','conservatory','celene','orin','vesper'].includes(id):campaign.adventureId==='ashen-expedition'?['waystation','ash-flats','bridge','lava-tube','observatory','nima','tovan'].includes(id):['inn','chapel','crypt','deep-crypt'].includes(id);}
export function retrieveLearnedMapping(text:string,campaign:Campaign,storage:StorageLike=localStorage):Command|null {
 const query=words(text);if(query.length===0)return null;let best:LearnedMapping|undefined,bestScore=0;
 for(const mapping of readLearnedMappings(storage)){if(!validForCurrentState(mapping,campaign))continue;const union=new Set([...query,...mapping.features]);const intersection=query.filter(word=>mapping.features.includes(word)).length;const score=union.size?intersection/union.size:0;if(score>bestScore){bestScore=score;best=mapping;}}
 if(!best||bestScore<0.78)return null;return best.command;
}
