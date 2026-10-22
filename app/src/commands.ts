import { Campaign, CATALOG, Slot } from './game';

export type Command =
 | { type:'switch_character'; characterId:string }
 | { type:'show_inventory'|'show_abilities'|'help'; characterId?:string }
 | { type:'ask_mara'; characterId:string }
 | { type:'inspect'; characterId:string }
 | { type:'search'; characterId:string }
 | { type:'travel_chapel'; characterId:string }
 | { type:'attack_guardian'; characterId:string }
 | { type:'use_ability'; characterId:string }
 | { type:'check'; characterId:string; attribute:keyof Campaign['characters'][number]['attributes']; label:string }
 | { type:'roll'; characterId:string; die:number }
 | { type:'use_item'|'equip_item'|'drop_item'; characterId:string; itemId:string }
 | { type:'unequip_item'; characterId:string; slot:Slot }
 | { type:'clarify'; question:string }
 | { type:'narrative_question'; answer:string };

export type ModelProposal = {
 action:string;
 character?:string;
 item?:string;
 target?:string;
 location?:string;
 attribute?:string;
 slot?:string;
 die?:number;
 question?:string;
 answer?:string;
};

export type ParseResult = { command:Command; reason?:string };
const attrs=['str','dex','con','int','wis','cha'] as const;
const normalized=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[’']/g,'').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\b(moonseal|moonseel)\b/g,'moon seal').replace(/\s+/g,' ').trim();

function actorFor(text:string,c:Campaign,activeId:string){
 const n=normalized(text);const byId=c.characters.find(ch=>ch.id===text.trim());if(byId)return{character:byId};const mentions=c.characters.filter(ch=>{const name=normalized(ch.name);const klass=normalized(ch.className);return (name.length>1&&new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(n))||new RegExp(`\\b${klass}\\b`,'i').test(n);});
 const unique=[...new Map(mentions.map(ch=>[ch.id,ch])).values()];
 if(unique.length>1)return{ambiguous:true as const};
 return{character:unique[0]??c.characters.find(ch=>ch.id===activeId)??c.characters[0]};
}

function mentionItem(text:string,c:Campaign,actorId:string){
 const n=normalized(text);const active=c.characters.find(ch=>ch.id===actorId)!;
 const aliases:Record<string,string[]>={
  'moon-seal':['moon seal','moonseel','seal','crescent','silver crescent','item we found','thing we found'],
  'healing-potion':['healing potion','health potion','potion','healing draught'],
  antitoxin:['antitoxin','antidote'],
  'iron-sword':['iron longsword','sword','blade'],
  'oak-bow':['oak longbow','longbow','bow'],
  'ash-staff':['ashwood staff','staff'],
  'leather-armor':['leather armor','leather armour'],
  'chain-shirt':['chain shirt','chainmail'],
  'iron-shield':['ironwood shield','shield'],
  torch:['torch'],rope:['silk rope','rope'],gold:['gold','coins']
 };
 const mentioned=CATALOG.filter(it=>[normalized(it.name),normalized(it.id),...(aliases[it.id]??[])].some(a=>a&&new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(n)));
 const ids=[...new Set(mentioned.map(x=>x.id))];
 if(ids.length>1)return{ambiguous:true as const};
 if(ids.length===1)return{itemId:ids[0]};
 if(/\b(item|thing|object)\s+(?:we\s+)?found\b/.test(n)){
  const quest=CATALOG.filter(it=>it.category==='quest'&&c.characters.some(ch=>ch.inventory.some(s=>s.itemId===it.id&&s.quantity>0)));
  if(quest.length===1)return{itemId:quest[0].id};if(quest.length>1)return{ambiguous:true as const};
 }
 const owned=active.inventory.filter(s=>s.quantity>0).map(s=>s.itemId);
 if(/\b(item|something|it)\b/.test(n)&&owned.length===1)return{itemId:owned[0]};
 return{};
}

function clarify(question='Which character, item, or action do you mean?',reason='unsupported'){return{command:{type:'clarify',question} as Command,reason};}

export function parseCommand(text:string,c:Campaign,activeId=c.activeId):ParseResult{
 const n=normalized(text);if(!n)return clarify('Tell me what you would like your party to do.');
 const explicitActor=n.match(/\b(?:have|let|switch(?: to)?|change(?: to)?|play as|select|take over as)\s+(?:the\s+|a\s+)?([a-z][a-z'-]*)\b/);if(explicitActor&&!c.characters.some(ch=>normalized(ch.name)===explicitActor[1]||normalized(ch.className)===explicitActor[1]))return clarify(`I can’t find ${explicitActor[1]} in this party. Which character should act?`,'unavailable-character');
 const actor=actorFor(n,c,activeId);if(actor.ambiguous)return clarify('Which party member should take this action?','ambiguous-character');const character=actor.character!;
 const actorId=character.id;
 const switched=/\b(switch|change|play as|select|take over as)\b/.test(n);
 if(switched){if(/\b(?:inventory|character|tab|panel)\b/.test(n))return{command:{type:'switch_character',characterId:actorId}};return{command:{type:'switch_character',characterId:actorId}};}
 if(/\b(inventory|what .*carry|what .*have|my items|show .*pack)\b/.test(n))return{command:{type:'show_inventory',characterId:actorId}};
 if(/\b(use|activate|invoke)\b.*\b(ability|skill)\b/.test(n))return{command:{type:'use_ability',characterId:actorId}};
 if(/\b(ability|abilities|skills|what can .*do)\b/.test(n))return{command:{type:'show_abilities',characterId:actorId}};
 if(/\b(help|what should .*do next|next objective|where .*go)\b/.test(n))return{command:{type:'help',characterId:actorId}};
 if((/\b(mara|innkeeper|quest.?giver)\b/.test(n)&&/\b(ask|talk|speak|question|tell|know|about|note|bell)\b/.test(n))||/\bask\b.*\b(bell|note|clue|quest|seal)\b/.test(n))return{command:{type:'ask_mara',characterId:actorId}};
 if(/\b(travel|go|head|walk|move|journey|return)\b/.test(n)&&/\b(chapel|hill|guardian|crypt)\b/.test(n))return{command:{type:'travel_chapel',characterId:actorId}};
 const itemRef=mentionItem(n,c,actorId);
 if(itemRef.ambiguous)return clarify('I found more than one possible item. Name the exact item you mean.','ambiguous-item');
 const itemAction=/\b(use|drink|consume|heal|give|hand|offer|present|place|deliver|calm|soothe|equip|wear|wield|drop|discard|unequip|remove)\b/.test(n);
 if(itemAction){
  if(/\b(unequip|remove)\b/.test(n)){
   const equipped=['weapon','armor','shield'].filter(slot=>new RegExp(`\\b${slot}\\b`).test(n));
   if(equipped.length===1)return{command:{type:'unequip_item',characterId:actorId,slot:equipped[0] as Slot}};
   if(itemRef.itemId){const slot=Object.entries(character.equipped).find(([,id])=>id===itemRef.itemId)?.[0] as Slot|undefined;if(slot)return{command:{type:'unequip_item',characterId:actorId,slot}};}
   return clarify('Which equipped item or slot should I remove?');
  }
  if(itemRef.itemId){const id=itemRef.itemId;if(/\b(equip|wear|wield)\b/.test(n))return{command:{type:'equip_item',characterId:actorId,itemId:id}};if(/\b(drop|discard)\b/.test(n))return{command:{type:'drop_item',characterId:actorId,itemId:id}};return{command:{type:'use_item',characterId:actorId,itemId:id}};}
  if(/\b(use|drink|consume|heal|give|hand|offer|present|place|deliver|calm|soothe)\b/.test(n))return clarify('Which item should I use? You can name the Moon Seal, potion, or another item.','ambiguous-item');
 }
 const attack=n.match(/\b(attack|fight|strike|swing|hit|shoot)\b/);if(attack){const tail=n.slice((attack.index??0)+attack[0].length).trim().replace(/^(?:at|the|a|an)\s+/,'').replace(/^(?:with|using)\b.*$/,'');if(tail&&!/\b(guardian|stone creature|it|him|her|foe|enemy)\b/.test(tail))return clarify('There is no matching target in this adventure. The current encounter is the stone guardian.','unavailable-target');return{command:{type:'attack_guardian',characterId:actorId}};}
 if(/\b(search|investigate|examine|look into|look for|check for clues|inspect closely|probe|scan)\b/.test(n)){
  if(/\b(chapel|guardian|crypt)\b/.test(n)&&c.sceneStep<2)return{command:{type:'travel_chapel',characterId:actorId}};
  return{command:{type:'search',characterId:actorId}};
 }
 if(/\b(inspect|look around|look at|describe|where are we)\b/.test(n))return{command:{type:'inspect',characterId:actorId}};
 const die=n.match(/\bd\s?(4|6|8|10|12|20)\b/);if(die&&/\b(roll|throw|toss)\b/.test(n))return{command:{type:'roll',characterId:actorId,die:Number(die[1])}};
 if(/\b(check|test|try|attempt|roll|investigate)\b/.test(n)){
  const attr=attrs.find(a=>new RegExp(`\\b${a}\\b`).test(n))??(/\b(look|search|investigat|notice|spot)\b/.test(n)?'wis':'str');
  return{command:{type:'check',characterId:actorId,attribute:attr,label:'Ability check'}};
 }
 if(/\bability\b/.test(n))return{command:{type:'use_ability',characterId:actorId}};
 if(/\b(chapel|hill|guardian|crypt)\b/.test(n)&&/\b(go|travel|head|move|reach|enter)\b/.test(n))return{command:{type:'travel_chapel',characterId:actorId}};
 if(/^(what|why|how|who|where|when|could|would|is|are|does|do|might)\b/.test(n)||/\bwhat might explain\b/.test(n)){
  const answer=/\b(bell|ringing|ring|chime)\b/.test(n)
   ? 'The bell has rung from the silent hilltop chapel after a century of quiet. The party has not confirmed why; Mara’s clue or an investigation may reveal more.'
   : `From what the party knows${c.facts.length?`: ${c.facts.slice(-2).join('; ')}`:''}, that could have several explanations. Ask Mara or investigate the current location to learn more.`;
  return{command:{type:'narrative_question',answer},reason:'narrative-question'};
 }
 return clarify('I’m not sure which game action you mean. Try asking Mara, searching the room, traveling to the chapel, checking a skill, attacking the guardian, or using an item.');
}

export function proposalToCommand(p:unknown,c:Campaign,activeId=c.activeId):ParseResult|null{
 if(!p||typeof p!=='object'||Array.isArray(p))return null;const x=p as Record<string,unknown>;
 const allowed=new Set(['action','character','item','target','location','attribute','slot','die','question','answer']);if(Object.keys(x).some(k=>!allowed.has(k))||typeof x.action!=='string')return null;
 const textFields=['character','item','target','location','attribute','slot','question'];if(textFields.some(k=>x[k]!==undefined&&(typeof x[k]!=='string'||(x[k] as string).length>100))||x.answer!==undefined&&(typeof x.answer!=='string'||x.answer.length>700))return null;
 const base=(x.character as string|undefined)??'';if(base&&!c.characters.some(ch=>ch.id===base||normalized(ch.id)===normalized(base)||normalized(ch.name)===normalized(base)||normalized(ch.className)===normalized(base)))return null;const actor=base?actorFor(base,c,activeId):{character:c.characters.find(ch=>ch.id===activeId)};if('ambiguous'in actor&&actor.ambiguous)return null;const character=actor.character;if(!character)return null;
 const action=x.action;const target=normalized(String(x.target??''));
 if(action==='clarify')return{command:{type:'clarify',question:typeof x.question==='string'?x.question.slice(0,180):'Could you clarify what you would like to do?'}};
 if(action==='narrative_question'&&typeof x.answer==='string'&&x.answer.trim())return{command:{type:'narrative_question',answer:x.answer.trim()}};
 if(action==='show_inventory')return{command:{type:'show_inventory',characterId:character.id}};
 if(action==='show_abilities')return{command:{type:'show_abilities',characterId:character.id}};
 if(action==='help')return{command:{type:'help',characterId:character.id}};
 if(action==='switch_character')return{command:{type:'switch_character',characterId:character.id}};
 if(action==='ask_npc'&&(!target||/mara|innkeeper/.test(target)))return{command:{type:'ask_mara',characterId:character.id}};
 if(action==='inspect')return{command:{type:'inspect',characterId:character.id}};
 if(action==='search'||action==='investigate')return{command:{type:'search',characterId:character.id}};
 if(action==='travel'&&(!x.location||/chapel|hill|crypt/.test(normalized(String(x.location)))))return{command:{type:'travel_chapel',characterId:character.id}};
 if(action==='check'&&(!x.attribute||attrs.includes(x.attribute as typeof attrs[number])))return{command:{type:'check',characterId:character.id,attribute:(x.attribute as typeof attrs[number])??'wis',label:'Ability check'}};
 if(action==='attack'&&(!target||/guardian/.test(target))&&c.sceneStep>=2)return{command:{type:'attack_guardian',characterId:character.id}};
 if(action==='use_ability')return{command:{type:'use_ability',characterId:character.id}};
 if(action==='roll'&&[4,6,8,10,12,20].includes(Number(x.die)))return{command:{type:'roll',characterId:character.id,die:Number(x.die)}};
 if(['use_item','handoff_quest_item','equip_item','drop_item'].includes(action)&&typeof x.item==='string'){
  const ref=mentionItem(String(x.item),c,character.id);if(ref.ambiguous||!ref.itemId)return null;
  if(action==='handoff_quest_item'&&ref.itemId!=='moon-seal')return null;
  if(ref.itemId==='moon-seal'&&x.target!==undefined&&!/guardian|stone creature|stone guardian|it/.test(target))return null;
  return{command:{type:action==='equip_item'?'equip_item':action==='drop_item'?'drop_item':'use_item',characterId:character.id,itemId:ref.itemId}};
 }
 if(action==='unequip_item'&&['weapon','armor','shield'].includes(String(x.slot)))return{command:{type:'unequip_item',characterId:character.id,slot:x.slot as Slot}};
 return null;
}
