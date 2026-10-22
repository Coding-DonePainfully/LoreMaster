import { Campaign, Character, CombatState, CombatantTurn, criticalChance as getCriticalChance, modifier, randomDie, randomPercent, StatusEffect } from './game';

export type StatusId='fire'|'poison'|'dazed'|'recovery';
export type AttackResult={hit:boolean;critical:boolean;roll:number;criticalRoll:number;attackTotal:number;targetDefense:number;defense:number;damage:number;criticalChance:number};
export type CheckResult={success:boolean;roll:number;total:number;isCritSuccess:boolean;isCritFail:boolean};

export function resolveCheck(actorStatValue:number,dc:number,advantage=false,die:typeof randomDie=randomDie):CheckResult {
 const first=die(20),second=advantage?die(20):first,roll=advantage?Math.max(first,second):first,total=roll+modifier(actorStatValue);
 return{success:roll===20||roll!==1&&total>=dc,roll,total,isCritSuccess:roll===20,isCritFail:roll===1};
}

export function resolveDamage(raw:number,armorReduction=0,critical=false){
 const base=Math.max(0,Math.floor(Number.isFinite(raw)?raw:0));
 if(critical)return Math.max(1,Math.round(base*1.5-Math.max(0,armorReduction)*0.7));
 return Math.max(0,base-Math.max(0,Math.floor(armorReduction)));
}

export function resolveAttack(input:{attackModifier:number;damageModifier:number;weaponDamage:number;damageBonus?:number;targetDefense:number;armorReduction?:number;attributes:Character['attributes']},die:typeof randomDie=randomDie,percent:typeof randomPercent=randomPercent):AttackResult{
 const roll=die(20);const criticalRoll=percent();const criticalChance=getCriticalChance(input.attributes);const critical=criticalRoll<=criticalChance;
 const defense=input.targetDefense;const attackTotal=roll+input.attackModifier;const hit=attackTotal>=defense;
 const damage=hit?resolveDamage(Math.max(0,input.weaponDamage+input.damageModifier+(input.damageBonus??0)),input.armorReduction??0,critical):0;
 return{hit,critical,roll,criticalRoll,attackTotal,targetDefense:input.targetDefense,defense,damage,criticalChance};
}

export function applyStatus(statuses:StatusEffect[],id:StatusId,duration:number):StatusEffect[]{
 if(!Number.isInteger(duration)||duration<1)throw new Error('Status duration must be a positive whole number.');
 const existing=statuses.find(effect=>effect.id===id);if(existing)return statuses.map(effect=>effect.id===id?{...effect,duration:Math.max(effect.duration,duration)}:effect);
 return[...statuses,{id,duration,...(id==='poison'?{tick:0}:{})}];
}
export function cleanseStatus(statuses:StatusEffect[],id:StatusId){return statuses.filter(effect=>effect.id!==id);}

export function tickStatuses(character:Character):{character:Character;damage:number;healing:number;dazed:boolean;expired:string[]} {
 if(character.hp<=0)return{character,damage:0,healing:0,dazed:false,expired:[]};
 let hp=character.hp,damage=0,healing=0,dazed=false;const expired:string[]=[];let statuses:StatusEffect[]=[];
 const combustion=character.statuses.some(effect=>effect.id==='fire')&&character.statuses.some(effect=>effect.id==='poison');
 if(combustion){damage+=8;hp=Math.max(0,hp-8);expired.push('fire','poison');}
 for(const effect of character.statuses){let duration=effect.duration;let tick=effect.tick??0;
  if(combustion&&(effect.id==='fire'||effect.id==='poison'))continue;
  if(effect.id==='fire'){damage+=4;hp=Math.max(0,hp-4);}
  else if(effect.id==='poison'){const poisonDamage=2+tick;damage+=poisonDamage;hp=Math.max(0,hp-poisonDamage);tick++;}
  else if(effect.id==='recovery'&&hp>0){const base=Math.max(0,4+modifier(character.attributes.wis));const received=character.statuses.some(status=>status.id==='poison')?Math.floor(base/2):base;const restored=Math.min(character.maxHp-hp,received);hp+=restored;healing+=restored;}
  else if(effect.id==='dazed')dazed=true;
  duration--;
  if(duration>0)statuses.push({...effect,duration,tick});else expired.push(effect.id);
 }
 return{character:{...character,hp,statuses},damage,healing,dazed,expired};
}

function makeTurn(id:string,initiative:number):CombatantTurn{return{id,initiative,actionAvailable:true,movementAvailable:true,reactionAvailable:true,hasActedThisTurn:false,hasMovedThisTurn:false};}
export function beginCombat(campaign:Campaign,enemyId:string,enemyHp:number,nodeId=campaign.location,die:typeof randomDie=randomDie):Campaign {
 if(!enemyId||!Number.isInteger(enemyHp)||enemyHp<1)throw new Error('Combat requires a named enemy with positive HP.');
 const queue=[...campaign.characters.filter(character=>character.hp>0).map(character=>makeTurn(character.id,die(20)+modifier(character.attributes.dex))),makeTurn(enemyId,die(20))].sort((a,b)=>b.initiative-a.initiative);
 return{...campaign,combat:{active:true,round:1,queue,currentIndex:0,nodeId,enemyHp,enemyId,enemyStatuses:[]}};
}

export function spendTurnResource(combat:CombatState,combatantId:string,resource:'action'|'movement'|'reaction'):CombatState {
 if(!combat.active)throw new Error('There is no active combat.');const current=combat.queue[combat.currentIndex];if(!current||current.id!==combatantId)throw new Error('It is not this combatant’s turn.');
 const field=resource==='action'?'actionAvailable':resource==='movement'?'movementAvailable':'reactionAvailable';if(!current[field])throw new Error('That turn resource has already been spent.');
 return{...combat,queue:combat.queue.map((turn,index)=>index===combat.currentIndex?{...turn,[field]:false,...(resource==='action'?{hasActedThisTurn:true}:{}),...(resource==='movement'?{hasMovedThisTurn:true}:{})}:turn)};
}

export function advanceCombat(campaign:Campaign):{campaign:Campaign;events:string[]} {
 const original=campaign.combat;if(!original?.active)return{campaign,events:['No combat is active.']};let combat=original;let characters=[...campaign.characters];let enemyHp=combat.enemyHp;let enemyStatuses=combat.enemyStatuses??[];const events:string[]=[];if(enemyHp<=0||characters.every(character=>character.hp<=0)){combat={...combat,active:false};return{campaign:{...campaign,combat},events:[enemyHp<=0?'The enemy is defeated; combat ends.':'No party combatants remain; combat ends.']};}
 for(let tries=0;tries<combat.queue.length*2;tries++){
  let nextIndex=combat.currentIndex+1;let round=combat.round;let queue=combat.queue;
  if(nextIndex>=queue.length){nextIndex=0;round++;queue=queue.map(turn=>({...turn,actionAvailable:true,movementAvailable:true,reactionAvailable:true,hasActedThisTurn:false,hasMovedThisTurn:false}));}
  combat={...combat,queue,currentIndex:nextIndex,round,enemyHp,enemyStatuses};
  const turn=combat.queue[nextIndex];if(!turn)break;
  if(turn.id===combat.enemyId){if(enemyHp<=0)continue;const fire=enemyStatuses.some(status=>status.id==='fire'),poison=enemyStatuses.some(status=>status.id==='poison');if(fire&&poison){enemyHp=Math.max(0,enemyHp-8);enemyStatuses=enemyStatuses.filter(status=>status.id!=='fire'&&status.id!=='poison');events.push(combat.enemyId+' suffers an 8 damage combustion burst; Fire and Poison end.');}else for(const status of enemyStatuses){if(status.id==='fire'){enemyHp=Math.max(0,enemyHp-4);events.push(combat.enemyId+' takes 4 fire damage.');}else if(status.id==='poison'){const amount=2+(status.tick??0);enemyHp=Math.max(0,enemyHp-amount);events.push(combat.enemyId+' takes '+amount+' poison damage.');}}if(fire&&enemyStatuses.some(status=>status.id==='fire')&&randomPercent()<=50){const targetIndex=characters.findIndex(character=>character.hp>0);if(targetIndex>=0){characters[targetIndex]={...characters[targetIndex],statuses:applyStatus(characters[targetIndex].statuses,'fire',2)};events.push('Fire spreads from '+combat.enemyId+' to '+characters[targetIndex].name+'.');}}enemyStatuses=enemyStatuses.map(status=>({...status,duration:status.duration-1,tick:status.id==='poison'?(status.tick??0)+1:status.tick})).filter(status=>status.duration>0);combat={...combat,enemyHp,enemyStatuses};if(enemyHp<=0){combat={...combat,active:false};events.push(combat.enemyId+' is defeated; combat ends.');return{campaign:{...campaign,characters,combat},events};}return{campaign:{...campaign,characters,combat},events};}
  const charIndex=characters.findIndex(character=>character.id===turn.id);if(charIndex<0||characters[charIndex].hp<=0)continue;
  const hadFire=characters[charIndex].statuses.some(status=>status.id==='fire');const ticked=tickStatuses(characters[charIndex]);characters[charIndex]=ticked.character;if(ticked.damage)events.push(characters[charIndex].name+' takes '+ticked.damage+' status damage.');if(ticked.healing)events.push(characters[charIndex].name+' recovers '+ticked.healing+' HP.');if(hadFire&&characters[charIndex].hp>0&&characters[charIndex].statuses.some(status=>status.id==='fire')&&randomPercent()<=50){const targetIndex=characters.findIndex((character,index)=>index!==charIndex&&character.hp>0);if(targetIndex>=0){characters[targetIndex]={...characters[targetIndex],statuses:applyStatus(characters[targetIndex].statuses,'fire',2)};events.push('Fire spreads from '+characters[charIndex].name+' to '+characters[targetIndex].name+'.');}}
  if(characters[charIndex].hp<=0){events.push(characters[charIndex].name+' is defeated and loses their turn.');continue;}
  if(ticked.dazed)combat={...combat,queue:combat.queue.map((entry,index)=>index===nextIndex?{...entry,actionAvailable:false}:entry)};
  return{campaign:{...campaign,characters,combat},events};
 }
 combat={...combat,active:false};events.push('No eligible combatants remain.');return{campaign:{...campaign,characters,combat},events};
}

export function nextTurn(campaign:Campaign){return advanceCombat(campaign);}

export function giveCharacterStatus(character:Character,id:StatusId,duration:number):Character{return{...character,statuses:applyStatus(character.statuses,id,duration)};}
