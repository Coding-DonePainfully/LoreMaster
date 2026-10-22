import type { Campaign, QueuedAction, RoundState, StatusEffect } from './game';
import type { Command } from './commands';
import { executeCommand } from './command-engine';
import { defense, randomDie, randomPercent } from './game';
import { applyStatus, tickStatuses } from './combat';

export interface RoundRecap { roundNumber:number; statusTicks:string[]; playerEvents:string[]; enemyEvents:string[]; storyOutcome:string; }
export interface RoundResult { campaign:Campaign; recap:RoundRecap; }

export function initialRoundState(campaign:Campaign):RoundState {
 const queuedActions=Object.fromEntries(campaign.characters.map(character=>[character.id,null]));
 return{currentRound:1,phase:'PLANNING',queuedActions,isReadyToResolve:campaign.characters.every(character=>character.hp<=0||queuedActions[character.id]!==null),checkpoint:checkpointOf(campaign)};
}

function checkpointOf(campaign:Campaign,roundNumber=campaign.roundState?.currentRound??1){return{roundNumber,characters:campaign.characters.map(character=>({...character,statuses:character.statuses.map(status=>({...status})),inventory:character.inventory.map(stack=>({...stack}))})),guardianHp:campaign.guardianHp,location:campaign.location,sceneStep:campaign.sceneStep,objectives:campaign.objectives.map(objective=>({...objective})),facts:[...campaign.facts],combat:campaign.combat?{...campaign.combat,queue:campaign.combat.queue.map(turn=>({...turn})),enemyStatuses:campaign.combat.enemyStatuses.map(status=>({...status}))}:null};}

export function restoreRoundCheckpoint(campaign:Campaign):Campaign {
 const checkpoint=campaign.roundState?.checkpoint;if(!checkpoint)throw new Error('There is no round checkpoint to restore.');
 return{...campaign,characters:checkpoint.characters.map(character=>({...character})),guardianHp:checkpoint.guardianHp,location:checkpoint.location,sceneStep:checkpoint.sceneStep,objectives:checkpoint.objectives.map(objective=>({...objective})),facts:[...checkpoint.facts],combat:checkpoint.combat,actedThisTurn:[],roundState:{currentRound:checkpoint.roundNumber,phase:'PLANNING',queuedActions:Object.fromEntries(checkpoint.characters.map(character=>[character.id,null])),isReadyToResolve:false,checkpoint:checkpointOf({...campaign,...checkpoint},checkpoint.roundNumber)}};
}

function actionType(command:Command):QueuedAction['type'] {
 if(command.type==='skip_turn')return'SKIP';
 if(command.type==='attack_guardian')return'SLASH';
 if(command.type==='use_ability')return'SPECIAL';
 if(command.type==='use_item')return'SPELL';
 if(command.type.startsWith('travel_'))return'MOVE';
 return'INTERACT';
}

export function queueRoundAction(campaign:Campaign,command:Command,rawCommand=''):Campaign {
 const characterId='characterId'in command?(command.characterId??campaign.activeId):campaign.activeId;
 const character=campaign.characters.find(entry=>entry.id===characterId);
 if(!character||character.hp<=0)throw new Error('A defeated character cannot queue an action.');
 const state=campaign.roundState??initialRoundState(campaign);
 if(state.phase!=='PLANNING')throw new Error('The round is resolving. Wait for the recap before queuing another action.');
 if(state.queuedActions[characterId])throw new Error(`${character.name} already queued an action this round.`);
 const queued:QueuedAction={characterId,characterName:character.name,type:actionType(command),rawCommand,command};
 const queuedActions={...state.queuedActions,[characterId]:queued};
 const isReadyToResolve=campaign.characters.every(entry=>entry.hp<=0||queuedActions[entry.id]!==null);
 return{...campaign,roundState:{...state,queuedActions,isReadyToResolve}};
}

function tickEnemyStatuses(statuses:StatusEffect[],hp:number){
 let nextHp=hp;const events:string[]=[];const fire=statuses.some(status=>status.id==='fire'),poison=statuses.some(status=>status.id==='poison');
 if(fire&&poison){nextHp=Math.max(0,nextHp-8);events.push(`🔥 Combustion burns the Guardian for 8 damage.`);}
 else for(const status of statuses){if(status.id==='fire'){nextHp=Math.max(0,nextHp-4);events.push('🔥 Fire burns the Guardian for 4 damage.');}if(status.id==='poison'){const damage=2+(status.tick??0);nextHp=Math.max(0,nextHp-damage);events.push(`☠ Poison harms the Guardian for ${damage} damage.`);}}
 const nextStatuses=statuses.filter(status=>!(fire&&poison&&(status.id==='fire'||status.id==='poison'))).map(status=>({...status,duration:status.duration-1,tick:status.id==='poison'?(status.tick??0)+1:status.tick})).filter(status=>status.duration>0);
 return{hp:nextHp,statuses:nextStatuses,events};
}

export function resolveActiveRound(input:Campaign,die:typeof randomDie=randomDie):RoundResult {
 const state=input.roundState??initialRoundState(input);const roundNumber=state.currentRound;
 if(state.phase!=='PLANNING')throw new Error('The round is already resolving.');
 if(input.characters.every(character=>character.hp<=0))throw new Error('The party is defeated. Restart from the round checkpoint.');
 if(!state.isReadyToResolve)throw new Error('Every living party member must queue an action or Skip before resolving.');
 let campaign:Campaign={...input,roundState:{...state,phase:'RESOLVING'}};
 const statusTicks:string[]=[],playerEvents:string[]=[],enemyEvents:string[]=[],dazedIds=new Set<string>();

 // Phase 1: party and enemy damage/healing ticks happen before queued actions.
 campaign.characters=campaign.characters.map(character=>{
  const tick=tickStatuses(character);if(tick.damage)statusTicks.push(`🔥☠ ${character.name} takes ${tick.damage} status damage.`);if(tick.healing)statusTicks.push(`💚 ${character.name} recovers ${tick.healing} HP.`);
  if(tick.dazed){dazedIds.add(character.id);statusTicks.push(`💫 ${character.name} is dazed and will skip this round.`);}
  return tick.character;
 });
 for(const source of campaign.characters.filter(character=>character.hp>0&&character.statuses.some(status=>status.id==='fire'))){if(randomPercent()<=50){const target=campaign.characters.find(character=>character.id!==source.id&&character.hp>0);if(target){campaign.characters=campaign.characters.map(character=>character.id===target.id?{...character,statuses:applyStatus(character.statuses,'fire',2)}:character);statusTicks.push(`🔥 Fire spreads from ${source.name} to ${target.name}.`);}}}
 const enemyTick=tickEnemyStatuses(campaign.combat?.enemyStatuses??[],campaign.guardianHp);
 campaign.guardianHp=enemyTick.hp;statusTicks.push(...enemyTick.events);if(campaign.combat)campaign.combat={...campaign.combat,enemyHp:enemyTick.hp,enemyStatuses:enemyTick.statuses,active:enemyTick.hp>0};

 // Phase 2: resolve each queued player action in roster order.
 for(const character of input.characters){
  const queued=state.queuedActions[character.id];if(!queued)continue;
  const current=campaign.characters.find(entry=>entry.id===character.id);if(!current||current.hp<=0){playerEvents.push(`${character.name} cannot act.`);continue;}
  if(dazedIds.has(current.id)){playerEvents.push(`💫 ${current.name}'s action is skipped while dazed.`);continue;}
  if(queued.type==='SKIP'){playerEvents.push(`${current.name} holds position.`);continue;}
  if(!queued.command){playerEvents.push(`${current.name}'s queued action could not be resolved.`);continue;}
  campaign={...campaign,activeId:current.id,actedThisTurn:[]};
  const result=executeCommand(campaign,queued.command,queued.rawCommand??queued.type);
  campaign=result.campaign;
  playerEvents.push(result.reply);
 }

 // Phase 3: one deterministic, scripted Guardian turn follows surviving player actions.
 const inGuardianFight=campaign.adventureId==='shattered-bell'&&campaign.location==='chapel'&&campaign.guardianHp>0;
 if(inGuardianFight&&campaign.characters.some(character=>character.hp>0)){
  const target=[...campaign.characters].filter(character=>character.hp>0).sort((a,b)=>a.hp-b.hp||a.id.localeCompare(b.id))[0];
  if(target){const roll=die(20),total=roll+3,ac=defense(target);if(total>=ac){const damage=die(4);campaign.characters=campaign.characters.map(character=>character.id===target.id?{...character,hp:Math.max(0,character.hp-damage)}:character);enemyEvents.push(`💥 The Guardian strikes ${target.name} (${roll} + 3 vs AC ${ac}) for ${damage} damage.`);}else enemyEvents.push(`🛡 The Guardian's blow misses ${target.name} (${roll} + 3 vs AC ${ac}).`);}
 }

 const defeated=campaign.guardianHp<=0;
 if(defeated){campaign={...campaign,guardianHp:0,combat:campaign.combat?{...campaign.combat,active:false,enemyHp:0}:campaign.combat,objectives:campaign.objectives.map((objective,index)=>index<2?{...objective,done:true}:objective),facts:campaign.facts.includes('The stone guardian fell. The crypt stairs are open.')?campaign.facts:[...campaign.facts,'The stone guardian fell. The crypt stairs are open.']};}
 const partyDefeated=campaign.characters.every(character=>character.hp<=0);
 const storyOutcome=defeated?'The Stone Guardian falls. The crypt stairs are open; the party can continue when ready.':partyDefeated?'The whole party has fallen. Restart from the saved checkpoint to try again.':`The Guardian has ${campaign.guardianHp} HP. ${campaign.characters.map(character=>`${character.name}: ${character.hp}/${character.maxHp} HP`).join(' · ')}`;
 const defeatedParty=campaign.characters.every(character=>character.hp<=0);const nextCheckpoint=defeatedParty?(state.checkpoint??checkpointOf(input,roundNumber)):checkpointOf(campaign,roundNumber+1);
 campaign={...campaign,actedThisTurn:[],updatedAt:new Date().toISOString(),roundState:{currentRound:roundNumber+1,phase:'PLANNING',queuedActions:Object.fromEntries(campaign.characters.map(character=>[character.id,null])),isReadyToResolve:campaign.characters.every(character=>character.hp<=0),checkpoint:nextCheckpoint}};
 const recap={roundNumber,statusTicks,playerEvents,enemyEvents,storyOutcome};
 const text=[`ROUND ${roundNumber} RESOLUTION`,...statusTicks,...playerEvents,...enemyEvents,storyOutcome].filter(Boolean).join('\n');
 campaign={...campaign,log:[...campaign.log,{id:crypto.randomUUID(),kind:'story',text,time:new Date().toISOString()}]};
 return{campaign,recap};
}
