import { describe, expect, it } from 'vitest';
import { advanceCombat, applyStatus, beginCombat, cleanseStatus, resolveAttack, resolveCheck, resolveDamage, spendTurnResource, tickStatuses } from './combat';
import { consume, makeCampaign, makeCharacter } from './game';

describe('deterministic combat and status foundations',()=>{
 it('applies flat armor reduction and 1.5x critical damage consistently',()=>{
  expect(resolveDamage(9,3,false)).toBe(6);expect(resolveDamage(9,3,true)).toBe(11);expect(resolveDamage(2,8,false)).toBe(0);
 });
 it('resolves attack, critical defense reduction, and weapon damage in one result',()=>{
  const attributes={str:5,dex:10,con:5,int:5,wis:5,cha:5};const normal=resolveAttack({attackModifier:2,damageModifier:2,weaponDamage:6,targetDefense:12,armorReduction:2,attributes},()=>10,()=>50);
  expect(normal).toMatchObject({hit:true,critical:false,attackTotal:12,defense:12,damage:6});
  const critical=resolveAttack({attackModifier:2,damageModifier:2,weaponDamage:6,targetDefense:12,armorReduction:2,attributes:{...attributes,dex:20}},()=>12,()=>1);
  expect(critical).toMatchObject({hit:true,critical:true,defense:12,damage:11,criticalChance:15});
 });
 it('resolves advantage and natural critical outcomes on checks',()=>{
  let rolls=0;expect(resolveCheck(10,20,true,()=>++rolls===1?1:20)).toEqual({success:true,roll:20,total:20,isCritSuccess:true,isCritFail:false});
  expect(resolveCheck(20,2,false,()=>1)).toEqual({success:false,roll:1,total:6,isCritSuccess:false,isCritFail:true});
 });
 it('starts a stable initiative queue and prevents duplicate turn resources',()=>{
  const party=[makeCharacter('Ari','Fighter'),makeCharacter('Bryn','Rogue')];const c=makeCampaign(party);const started=beginCombat(c,'guardian',12,'chapel',()=>10);const combat=started.combat!;
  expect(combat.active).toBe(true);expect(combat.round).toBe(1);expect(combat.queue.map(turn=>turn.id)).toHaveLength(3);
  const actor=combat.queue[combat.currentIndex].id;const spent=spendTurnResource(combat,actor,'action');expect(spent.queue[spent.currentIndex]).toMatchObject({actionAvailable:false,hasActedThisTurn:true});expect(()=>spendTurnResource(spent,actor,'action')).toThrow(/already been spent/);
  expect(()=>spendTurnResource(combat,'not-current','movement')).toThrow(/not this combatant/);
 });
 it('ticks Fire, scaling Poison, Recovery, and Dazed once at a turn boundary',()=>{
  let character=makeCharacter('Ari','Cleric',{str:5,dex:5,con:5,int:5,wis:10,cha:5});character={...character,hp:18,statuses:applyStatus([], 'fire',3)};character={...character,statuses:applyStatus(character.statuses,'poison',3)};character={...character,statuses:applyStatus(character.statuses,'recovery',3)};character={...character,statuses:applyStatus(character.statuses,'dazed',1)};
  const tick=tickStatuses(character);expect(tick.damage).toBe(8);expect(tick.healing).toBe(2);expect(tick.dazed).toBe(true);expect(tick.character.hp).toBe(12);expect(tick.character.statuses.map(effect=>effect.id)).toEqual(['recovery']);
  expect(cleanseStatus(tick.character.statuses,'poison').some(effect=>effect.id==='poison')).toBe(false);
 });
 it('applies and refreshes a status without stacking duplicate copies and does not tick defeated units',()=>{
  const statuses=applyStatus(applyStatus([], 'fire',2),'fire',3);expect(statuses).toHaveLength(1);expect(statuses[0].duration).toBe(3);
  const defeated={...makeCharacter('Down','Fighter'),hp:0,statuses};const tick=tickStatuses(defeated);expect(tick.character.hp).toBe(0);expect(tick.character.statuses).toEqual(statuses);expect(tick.damage).toBe(0);
 });
 it('triggers combustion once when fire and poison coexist',()=>{
  const hero={...makeCharacter('Ari','Fighter'),statuses:applyStatus(applyStatus([],'fire',2),'poison',2)};
  const tick=tickStatuses(hero);expect(tick.damage).toBe(8);expect(tick.character.hp).toBe(hero.hp-8);expect(tick.character.statuses).toEqual([]);expect(tick.expired).toEqual(expect.arrayContaining(['fire','poison']));
 });
 it('uses WIS healing potency and halves healing while Poison is active',()=>{
  const character={...makeCharacter('Mira','Cleric',{str:5,dex:5,con:5,int:5,wis:14,cha:5}),hp:10,statuses:applyStatus([],'poison',2)};const result=consume(character,'healing-potion');expect(result.healed).toBe(5);expect(result.character.hp).toBe(15);
 });
 it('advances initiative and applies status damage once to the next eligible combatant',()=>{
  const hero={...makeCharacter('Ari','Cleric'),statuses:applyStatus([],'fire',2)};const campaign=makeCampaign([hero]);const started=beginCombat(campaign,'guardian',12,'chapel',sides=>sides===20?1:20);
  const advanced=advanceCombat(started);expect(advanced.campaign.characters[0].hp).toBe(hero.hp-4);expect(advanced.events).toContain('Ari takes 4 status damage.');expect(advanced.campaign.combat?.round).toBe(1);
 });
});
