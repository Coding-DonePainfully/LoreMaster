import { describe, expect, it } from 'vitest';
import { Campaign, makeCampaign, makeCharacter } from './game';
import { initialRoundState, queueRoundAction, resolveActiveRound, restoreRoundCheckpoint } from './round-resolver';

describe('queued round resolution',()=>{
 it('requires each living character to queue an action or skip and resets the queue after resolution',()=>{
  const party=[makeCharacter('Star','Fighter'),makeCharacter('Sarah','Cleric')];let campaign:Campaign={...makeCampaign(party),location:'chapel',sceneStep:2,roundState:initialRoundState(makeCampaign(party))};
  campaign=queueRoundAction(campaign,{type:'skip_turn',characterId:party[0].id},'pass');
  expect(campaign.roundState?.isReadyToResolve).toBe(false);
  campaign=queueRoundAction(campaign,{type:'skip_turn',characterId:party[1].id},'skip turn');
  expect(campaign.roundState?.isReadyToResolve).toBe(true);
  const result=resolveActiveRound(campaign,()=>1);
  expect(result.recap.roundNumber).toBe(1);expect(result.recap.playerEvents).toHaveLength(2);expect(result.recap.enemyEvents).toHaveLength(1);
  expect(result.campaign.roundState?.currentRound).toBe(2);expect(Object.values(result.campaign.roundState!.queuedActions)).toEqual([null,null]);
 });

 it('ticks statuses before actions, skips dazed characters, and suppresses the enemy turn if status damage defeats it',()=>{
  const party=[makeCharacter('Star','Fighter'),makeCharacter('Sarah','Cleric')];const base=makeCampaign(party);let campaign:Campaign={...base,location:'chapel',sceneStep:2,guardianHp:2,combat:{active:true,round:1,queue:[],currentIndex:0,nodeId:'chapel',enemyHp:2,enemyId:'guardian',enemyStatuses:[{id:'fire',duration:2},{id:'poison',duration:2}]},roundState:initialRoundState(base)};
  campaign={...campaign,characters:campaign.characters.map((character,index)=>index===0?{...character,statuses:[{id:'dazed',duration:1},{id:'fire',duration:2},{id:'poison',duration:2}]}:character)};
  campaign=queueRoundAction(campaign,{type:'skip_turn',characterId:party[0].id},'skip');campaign=queueRoundAction(campaign,{type:'skip_turn',characterId:party[1].id},'skip');
  const result=resolveActiveRound(campaign,()=>20);
  expect(result.recap.statusTicks.join(' ').toLowerCase()).toContain('combustion');expect(result.recap.statusTicks.join(' ')).toContain('dazed');
  expect(result.recap.playerEvents.join(' ')).toContain('skipped while dazed');expect(result.campaign.guardianHp).toBe(0);expect(result.recap.enemyEvents).toHaveLength(0);
 });

 it('restores the party and encounter state from the previous round after a defeat',()=>{
  const hero={...makeCharacter('Star','Fighter'),hp:1};const base={...makeCampaign([hero]),location:'chapel',sceneStep:2};let campaign:Campaign={...base,roundState:initialRoundState(base)};campaign=queueRoundAction(campaign,{type:'skip_turn',characterId:hero.id},'skip');
  const defeated=resolveActiveRound(campaign,(sides)=>sides===4?4:20).campaign;expect(defeated.characters[0].hp).toBe(0);
  const restored=restoreRoundCheckpoint(defeated);expect(restored.characters[0].hp).toBe(1);expect(restored.guardianHp).toBe(12);expect(restored.roundState?.queuedActions[hero.id]).toBeNull();
 });
});
