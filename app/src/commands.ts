import { Campaign, CATALOG, Slot } from './game';
import { adventureById } from './adventures';

export type Command =
 | { type:'switch_character'; characterId:string }
 | { type:'end_turn'; characterId:string }
 | { type:'skip_turn'; characterId:string }
 | { type:'show_inventory'|'show_abilities'|'help'; characterId?:string }
 | { type:'ask_mara'; characterId:string }
 | { type:'inspect'; characterId:string }
 | { type:'search'; characterId:string }
 | { type:'travel_chapel'; characterId:string }
 | { type:'travel_crypt'; characterId:string }
 | { type:'travel_location'; characterId:string; locationId:string }
 | { type:'secure_bridge'; characterId:string }
 | { type:'accuse'; characterId:string; suspect:string }
 | { type:'dev_attack'; characterId:string }
 | { type:'dev_test_check'; characterId:string; attribute:keyof Campaign['characters'][number]['attributes'] }
 | { type:'dev_resolve_conflict'; characterId:string }
 | { type:'dev_damage'; characterId:string; amount:12 }
 | { type:'attack_guardian'; characterId:string }
 | { type:'use_ability'; characterId:string; abilityName?:string }
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
 ability?:string;
};

export type ParseResult = { command:Command; reason?:string };
const attrs=['str','dex','con','int','wis','cha'] as const;
const normalized=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[’']/g,'').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\b(moonseal|moonseel)\b/g,'moon seal').replace(/\s+/g,' ').trim();

const locationAliases:Record<string,string[]>={
 'inn':['wayfarer rest','wayfarers rest','tavern','inn'],chapel:['hilltop','hilltop chapel','shrine'],crypt:['chapel crypt','upper crypt'],
 'deep-crypt':['lower reliquary','reliquary','flooded chamber','lower chamber'],
 ballroom:['gala','gilded ballroom','ball'],gallery:['locked gallery','crime scene','victims room'],conservatory:['garden','glasshouse','greenhouse'],
 waystation:['cinderwatch','cinderwatch waystation','station'],'ash-flats':['ash field','flats'],bridge:['rope bridge','exposed bridge'],'lava-tube':['tube','lava tunnel','tunnel'],observatory:['ember observatory','beacon','observatory tower']
};
function locationMention(text:string,c:Campaign){
 const n=normalized(text);const adventure=adventureById(c.adventureId);
 return adventure.locations.flatMap(location=>[location.id,location.id.replace(/-/g,' '),normalized(location.name),...(locationAliases[location.id]??[])].map(alias=>({location,alias:normalized(alias)}))).filter(entry=>entry.alias&&new RegExp(`\\b${entry.alias}\\b`,'i').test(n)).sort((a,b)=>b.alias.length-a.alias.length)[0]?.location;
}
function relativeLocation(text:string,c:Campaign){
 const n=normalized(text);const adventure=adventureById(c.adventureId);const current=adventure.locations.find(location=>location.id===c.location);
 if(!current)return undefined;
 if(c.adventureId==='shattered-bell'){
  if(c.location==='chapel'&&/\b(further|farther|deeper|down|below|descend)\b/.test(n))return adventure.locations.find(location=>location.id==='crypt');
  if(c.location==='crypt'&&/\b(further|farther|deeper|down|below|continue|lower)\b/.test(n))return adventure.locations.find(location=>location.id==='deep-crypt');
  if(c.location==='crypt'&&/\b(back|up|return|climb|ascend)\b/.test(n))return adventure.locations.find(location=>location.id==='chapel');
  if(c.location==='deep-crypt'&&/\b(back|up|return|climb|ascend)\b/.test(n))return adventure.locations.find(location=>location.id==='crypt');
 }
 if(c.adventureId==='ashen-expedition'&&c.location==='ash-flats'){
  if(/\b(east|eastern|bridge route)\b/.test(n))return adventure.locations.find(location=>location.id==='bridge');
  if(/\b(west|western|tunnel route)\b/.test(n))return adventure.locations.find(location=>location.id==='lava-tube');
 }
 if(c.adventureId==='ashen-expedition'&&['bridge','lava-tube'].includes(c.location)&&/\b(back|up|return|backtrack)\b/.test(n))return adventure.locations.find(location=>location.id==='ash-flats');
 if(c.adventureId==='ashen-expedition'&&c.location==='observatory'&&/\b(back|return|backtrack)\b/.test(n))return adventure.locations.find(location=>location.id==='ash-flats');
 if(/\b(back|backtrack|return|go back|head back)\b/.test(n)){
  const previous=adventure.locations.filter(location=>location.next?.includes(current.id));
  if(previous.length===1)return previous[0];
 }
 return undefined;
}

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
 if(/\b(create|generate|write|invent)\b.{0,100}\b(campaign|adventure|story|world)\b/.test(n))return clarify('Campaign generation is not implemented yet. You can continue The Shattered Bell adventure or ask about the current scene.','campaign-generation');
 const explicitActor=n.match(/\b(?:have|let|switch(?: to)?|change(?: to)?|play as|select|take over as)\s+(?:the\s+|a\s+)?([a-z][a-z'-]*)\b/);if(explicitActor&&!c.characters.some(ch=>normalized(ch.name)===explicitActor[1]||normalized(ch.className)===explicitActor[1]))return clarify(`I can’t find ${explicitActor[1]} in this party. Which character should act?`,'unavailable-character');
 const actor=actorFor(n,c,activeId);if(actor.ambiguous)return clarify('Which party member should take this action?','ambiguous-character');const character=actor.character!;
 const actorId=character.id;
 if(/^(?:skip(?: turn)?|pass(?: turn)?|wait|do nothing)$/.test(n))return{command:{type:'skip_turn',characterId:actorId}};
 if(/^(?:end turn|finish turn|pass turn|end my turn)$/.test(n))return{command:{type:'end_turn',characterId:actorId}};
 const switched=/\b(switch|change|play as|select|take over as)\b/.test(n);
 if(switched){if(/\b(?:inventory|character|tab|panel)\b/.test(n))return{command:{type:'switch_character',characterId:actorId}};return{command:{type:'switch_character',characterId:actorId}};}
 const knownAbility=character.abilities.find(a=>normalized(a.name).length>2&&n.includes(normalized(a.name)));
 const asksAbilityInfo=/^(what|explain|describe|tell me about)\b|\b(what does|how does)\b/.test(n);
 if(knownAbility&&asksAbilityInfo)return{command:{type:'show_abilities',characterId:actorId}};
 if(knownAbility&&(/\b(use|do|perform|try|say|cast|activate|invoke|ability|spell)\b/.test(n)||n===normalized(knownAbility.name)))return{command:{type:'use_ability',characterId:actorId,abilityName:knownAbility.name}};
 if(/\b(inventory|what .*carry|what .*have|my items|show .*pack)\b/.test(n))return{command:{type:'show_inventory',characterId:actorId}};
 if(/\b(use|activate|invoke)\b.*\b(ability|skill)\b/.test(n))return{command:{type:'use_ability',characterId:actorId}};
 if(/\b(ability|abilities|skills|what can .*do)\b/.test(n))return{command:{type:'show_abilities',characterId:actorId}};
 if(/\b(help|what should .*do next|next objective|where .*go)\b/.test(n))return{command:{type:'help',characterId:actorId}};
 if(/\b(cast|buff|enchant|boost|increase everyone's attack|custom ability)\b/.test(n))return clarify(`That custom effect is not defined, so I cannot apply its strength, duration, or targets. ${character.name}'s available ability is ${character.abilities[0]?.name??'none'}${character.abilities[0]?`: ${character.abilities[0].description}`:''}. Use that ability, or describe a modest attempt and resolve it with a check.`,'custom-ability');
 if(/^what (?:happens|would happen) if\b/.test(n)){
  const adventure=adventureById(c.adventureId);const destination=adventure.locations.find(location=>location.id!==c.location&&normalized(location.name).split(' ').some(word=>word.length>3&&n.includes(word)));
  const answer=c.adventureId==='shattered-bell'&&c.guardianHp>0?'The stone guardian still blocks the chapel entrance; the party must resolve that encounter before entering the crypt.':destination?`Entering ${destination.name} would take the party there if the route is open. The party is currently at ${adventure.locations.find(location=>location.id===c.location)?.name??c.location}; no travel has occurred.`:`${adventure.locations.find(location=>location.id===c.location)?.description??c.scene} No action has been taken.`;
  return{command:{type:'narrative_question',answer},reason:'narrative-question'};
 }
 const adventure=adventureById(c.adventureId);
 if(adventure.id==='shattered-bell'&&/\b(take|take up|get|pick up|collect|claim)\b/.test(n)&&/\b(moon seal|moon|crescent|silver seal)\b/.test(n)&&!c.characters.some(ch=>ch.inventory.some(stack=>stack.itemId==='moon-seal'&&stack.quantity>0)))return{command:{type:'search',characterId:actorId}};
 if(adventure.id==='ashen-expedition'&&/\b(secure|tie|fix|repair|mend|lash)\b/.test(n)&&/\b(bridge|ropes?)\b/.test(n))return{command:{type:'secure_bridge',characterId:actorId}};
 const requestedLocation=locationMention(n,c)??relativeLocation(n,c);
 if(adventure.id!=='shattered-bell'&&requestedLocation&&requestedLocation.id!==c.location&&/\b(investigate|inspect|examine|search)\b/.test(n)&&adventure.locations.find(location=>location.id===c.location)?.next?.includes(requestedLocation.id))return{command:{type:'travel_location',characterId:actorId,locationId:requestedLocation.id}};
 if(adventure.id==='shattered-bell'&&requestedLocation?.id==='chapel'&&/\b(go|travel|head|walk|move|journey|enter|return|back|backtrack)\b/.test(n))return{command:{type:'travel_chapel',characterId:actorId}};
 if(adventure.id==='shattered-bell'&&requestedLocation?.id==='crypt'&&/\b(go|travel|head|walk|move|journey|enter|descend|return|back|backtrack|up|ascend|climb)\b/.test(n))return c.location==='deep-crypt'?{command:{type:'travel_location',characterId:actorId,locationId:'crypt'}}:{command:{type:'travel_crypt',characterId:actorId}};
 if(requestedLocation&&requestedLocation.id!==c.location&&/\b(go|travel|head|walk|move|journey|enter|descend|return|cross|take|back|backtrack|continue|further|farther|deeper|down|below|up|ascend|climb)\b/.test(n))return{command:{type:'travel_location',characterId:actorId,locationId:requestedLocation.id}};
 if(adventure.id!=='shattered-bell'){
  const requestedNpc=adventure.npcs.find(npc=>new RegExp(`\\b${npc.name.toLowerCase()}\\b`,'i').test(n));
  if(requestedNpc&&/\b(ask|talk|speak|question|tell|know|about)\b/.test(n))return{command:{type:'ask_mara',characterId:actorId}};
  if(/\b(accuse|blame|confront)\b/.test(n)){const suspect=adventure.npcs.find(npc=>new RegExp(`\\b${npc.name.toLowerCase()}\\b`,'i').test(n));return suspect?{command:{type:'accuse',characterId:actorId,suspect:suspect.id}}:clarify('Which suspect do you want to accuse? Name one of the people you have questioned.','ambiguous-target');}
 }
 if(/^what (?:happens|would happen) if\b/.test(n)&&/\b(crypt|stairs|passage|beneath the chapel)\b/.test(n))return{command:{type:'narrative_question',answer:c.guardianHp===0?'The guardian is defeated and the crypt stairs are open. Entering would take the party below the chapel; what lies beyond the stairs has not been discovered yet.':'The stone guardian still blocks the chapel entrance. The party must resolve that encounter before reaching the crypt stairs.'},reason:'narrative-question'};
 if((/\b(mara|innkeeper|quest.?giver)\b/.test(n)&&/\b(ask|talk|speak|question|tell|know|about|note|bell)\b/.test(n))||/\bask\b.*\b(bell|note|clue|quest|seal)\b/.test(n))return{command:{type:'ask_mara',characterId:actorId}};
 if(/\b(enter|descend|go down|step into|head down)\b/.test(n)&&/\b(crypt|stairs|passage|beneath the chapel)\b/.test(n))return{command:{type:'travel_crypt',characterId:actorId}};
 if(/\b(travel|go|head|walk|move|journey|return)\b/.test(n)&&/\b(chapel|hill|guardian)\b/.test(n))return c.adventureId==='shattered-bell'?{command:{type:'travel_chapel',characterId:actorId}}:clarify(`There is no chapel route in ${adventureById(c.adventureId).title}. Choose a visible route from ${adventureById(c.adventureId).locations.find(location=>location.id===c.location)?.name??c.location}.`,'unavailable-location');
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
 const attack=n.match(/\b(attack|fight|strike|swing|hit|shoot|slash|stab)\b/);if(attack){const tail=n.slice((attack.index??0)+attack[0].length).trim().replace(/^(?:at|the|a|an)\s+/,'').replace(/^(?:with|using)\b.*$/,'');if(adventure.id!=='shattered-bell')return clarify(`There is no active enemy encounter in ${adventure.title} at ${adventure.locations.find(location=>location.id===c.location)?.name??c.location}. You can inspect, investigate, talk to someone here, or travel along a connected route.`,'unavailable-target');if(c.guardianHp<=0)return clarify('The stone guardian is already defeated. Descend into the open crypt stairs.','unavailable-target');if(c.location!=='chapel')return clarify('The stone guardian is at the hilltop chapel. Establish the route by asking Mara or finding the Moon Seal clue, then travel there.','unavailable-target');if(tail&&!/\b(guardian|stone creature|it|him|her|foe|enemy)\b/.test(tail))return clarify('There is no matching target in this adventure. The current encounter is the stone guardian.','unavailable-target');return{command:{type:'attack_guardian',characterId:actorId}};}
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
 if(/\b(chapel|hill|guardian)\b/.test(n)&&/\b(go|travel|head|move|reach|enter)\b/.test(n))return{command:{type:'travel_chapel',characterId:actorId}};
 const followUp=/\b(now what|what now|succeeded|success|so it worked|did it work|what did (?:we|i) discover|what did (?:we|i) find|what did that reveal)\b/.test(n);
 if(/^(what|why|how|who|where|when|could|would|is|are|does|do|might)\b/.test(n)||/\bwhat might explain\b/.test(n)||followUp){
  const guardianDown=c.guardianHp===0||c.facts.some(f=>/guardian fell|guardian.*quiet|crypt stairs are open/i.test(f));
  const latestRoll=[...c.log].reverse().find(e=>e.kind==='roll');
  const lastCheck=latestRoll&&/vs DC \d+.*(?:SUCCESS|FAILURE)/i.test(latestRoll.text)&&!/attack/i.test(latestRoll.text)?latestRoll:undefined;
  const checkSucceeded=Boolean(lastCheck&&/SUCCESS/i.test(lastCheck.text));
  const discovery=lastCheck&&checkSucceeded?c.log.slice(c.log.indexOf(lastCheck)+1).find(e=>e.kind==='story')?.text:undefined;
  let answer:string;
  if(c.adventureId!=='shattered-bell'){
   const adventure=adventureById(c.adventureId);const place=adventure.locations.find(location=>location.id===c.location);const next=c.objectives.find(objective=>!objective.done)?.text;
   if(followUp&&lastCheck&&!checkSucceeded)answer=`The latest check failed (${lastCheck.text}). No evidence was added; ${place?.name??'this location'} remains available to investigate.`;
   else if(followUp&&discovery)answer=`The latest successful check revealed: ${discovery} This is recorded as evidence; any cause or culprit not stated there remains unresolved.`;
   else if(/\b(suspect|culprit|murder|who killed|what happened)\b/.test(n))answer=`${adventure.title}: ${c.evidence.length?`The party has ${c.evidence.length} evidence item(s): ${c.evidence.join(' ')}`:'No physical evidence has been confirmed yet.'} NPC accounts are statements, not proof. The solution remains unresolved; ${next??'the party can compare its evidence before deciding.'}`;
   else answer=`${place?.description??c.scene} ${c.evidence.length?`Discovered evidence: ${c.evidence.slice(-3).join(' ')}`:'No clues have been confirmed here yet.'} ${c.npcStatements.length?`NPC statements: ${c.npcStatements.slice(-2).join(' ')}`:''} ${next?`Next objective: ${next}.`:''} Theories remain unconfirmed.`;
   return{command:{type:'narrative_question',answer},reason:'narrative-question'};
  }
  if(c.location==='crypt')answer='You are already inside the crypt. The bell’s source has not been discovered; investigate the chamber or continue deeper.';
  else if(/\b(beneath|under|what lies below|what is below)\b/.test(n))answer=c.guardianHp===0?'The chapel crypt is reached by the open stairs. The party has not discovered what lies farther below or what caused the bell.':'The crypt lies beyond the chapel entrance, but the stone guardian still blocks the way. What lies below has not been discovered.';
  else if(guardianDown)answer='With the guardian defeated, the stairs into the crypt are open. Descend into the crypt or investigate the newly opened passage; the bell’s source is still unresolved.';
  else if(followUp&&lastCheck&&!checkSucceeded)answer=`The latest check failed (${lastCheck.text}). It revealed no new clue; the party can try another investigation or follow the existing objective.`;
  else if(followUp&&discovery)answer=`Your successful check revealed: ${discovery} ${ownsMoonSeal(c)?'The party has the Moon Seal; take it to the guardian at the hilltop chapel.':'Follow the clue it uncovered and investigate the chapel.'}`;
  else if(followUp&&lastCheck&&!discovery)answer=`The latest check succeeded (${lastCheck.text}), but no discovery was recorded with that roll. Use Investigate in the current scene to resolve a discovery through the game rules.`;
  else if(/\b(bell|ringing|ring|chime)\b/.test(n))answer=c.facts.some(f=>/Mara says the moon seal/i.test(f))?'The bell may be reacting to the weakened ward Mara described: the Moon Seal is hidden beneath the chapel. The party has not yet confirmed what is waking below it.':'One possibility is that the chapel’s old ward is failing and something below it is disturbing the bell. Mara’s sealed note may explain the connection; investigating the chapel can confirm more.';
  else answer=`The current scene is ${c.sceneStep>=2?'the hilltop chapel':'the Wayfarer’s Rest'}. ${c.facts.slice(-2).join(' ')}${c.objectives.find(o=>!o.done)?` Next objective: ${c.objectives.find(o=>!o.done)!.text}.`:''}`;
  return{command:{type:'narrative_question',answer},reason:'narrative-question'};
 }
 return clarify('I’m not sure which game action you mean. Try asking Mara, searching the room, traveling to the chapel, checking a skill, attacking the guardian, or using an item.');
}

function ownsMoonSeal(c:Campaign){return c.characters.some(ch=>ch.inventory.some(s=>s.itemId==='moon-seal'&&s.quantity>0));}

export function proposalToCommand(p:unknown,c:Campaign,activeId=c.activeId):ParseResult|null{
 if(!p||typeof p!=='object'||Array.isArray(p))return null;const x=p as Record<string,unknown>;
 const allowed=new Set(['action','character','item','target','location','attribute','slot','die','question','answer','ability']);if(Object.keys(x).some(k=>!allowed.has(k))||typeof x.action!=='string')return null;
 const textFields=['character','item','target','location','attribute','slot','question','ability'];if(textFields.some(k=>x[k]!==undefined&&(typeof x[k]!=='string'||(x[k] as string).length>100))||x.answer!==undefined&&(typeof x.answer!=='string'||x.answer.length>700))return null;
 const base=(x.character as string|undefined)??'';if(base&&!c.characters.some(ch=>ch.id===base||normalized(ch.id)===normalized(base)||normalized(ch.name)===normalized(base)||normalized(ch.className)===normalized(base)))return null;const actor=base?actorFor(base,c,activeId):{character:c.characters.find(ch=>ch.id===activeId)};if('ambiguous'in actor&&actor.ambiguous)return null;const character=actor.character;if(!character)return null;
 const action=x.action;const target=normalized(String(x.target??''));
 if(action==='clarify')return{command:{type:'clarify',question:typeof x.question==='string'?x.question.slice(0,180):'Could you clarify what you would like to do?'}};
 if(action==='narrative_question'&&typeof x.answer==='string'&&x.answer.trim()){
  const answer=x.answer.trim();
  if(c.guardianHp===0&&/guardian.{0,50}(?:blocks|guards the entrance|still alive|still stands)/i.test(answer))return null;
  if(c.location==='crypt'&&/guardian.{0,50}(?:blocks|guards the entrance)/i.test(answer))return null;
  return{command:{type:'narrative_question',answer}};
 }
 if(action==='custom_ability')return{command:{type:'clarify',question:`That proposed ability is not defined in this adventure. The ${character.className} can use ${character.abilities[0]?.name??'no class ability'}${character.abilities[0]?`: ${character.abilities[0].description}`:''}. I will not apply an unbalanced effect without a rule.`}};
 if(action==='show_inventory')return{command:{type:'show_inventory',characterId:character.id}};
 if(action==='show_abilities')return{command:{type:'show_abilities',characterId:character.id}};
 if(action==='help')return{command:{type:'help',characterId:character.id}};
 if(action==='switch_character')return{command:{type:'switch_character',characterId:character.id}};
 if(action==='ask_npc')return{command:{type:'ask_mara',characterId:character.id}};
 if(action==='inspect')return{command:{type:'inspect',characterId:character.id}};
 if(action==='search'||action==='investigate')return{command:{type:'search',characterId:character.id}};
 if(action==='travel'&&/crypt|stairs|passage/.test(normalized(String(x.location??''))))return{command:{type:'travel_crypt',characterId:character.id}};
 if(action==='travel'&&typeof x.location==='string'){
  const adventure=adventureById(c.adventureId);const location=adventure.locations.find(entry=>entry.id===x.location||normalized(entry.name)===normalized(x.location as string));
  if(location&&location.id!=='chapel'&&location.id!=='crypt')return{command:{type:'travel_location',characterId:character.id,locationId:location.id}};
 }
 if(action==='travel'&&c.adventureId==='shattered-bell'&&(!x.location||/chapel|hill/.test(normalized(String(x.location)))))return{command:{type:'travel_chapel',characterId:character.id}};
 if(action==='accuse'&&typeof x.target==='string'){
  const suspect=adventureById(c.adventureId).npcs.find(npc=>normalized(npc.name)===normalized(x.target as string)||normalized(npc.id)===normalized(x.target as string));
  if(suspect)return{command:{type:'accuse',characterId:character.id,suspect:suspect.id}};
 }
 if(action==='check'&&(!x.attribute||attrs.includes(x.attribute as typeof attrs[number])))return{command:{type:'check',characterId:character.id,attribute:(x.attribute as typeof attrs[number])??'wis',label:'Ability check'}};
 if(action==='attack'&&(!target||/guardian/.test(target))&&c.sceneStep>=2)return{command:{type:'attack_guardian',characterId:character.id}};
 if(action==='use_ability'){
  if(typeof x.ability!=='string')return null;
  const ability=character.abilities.find(a=>normalized(a.name)===normalized(x.ability as string));
  if(!ability)return null;
  return{command:{type:'use_ability',characterId:character.id,abilityName:ability.name}};
 }
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
