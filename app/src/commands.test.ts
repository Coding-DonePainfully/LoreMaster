import { describe, expect, it } from 'vitest';
import { awardMoonSeal, demoParty, makeCampaign, makeCharacter } from './game';
import { parseCommand, proposalToCommand } from './commands';

describe('deterministic command interpreter',()=>{
 const party=[...demoParty().slice(0,3),makeCharacter('Lyra','Bard')];
 it.each([
  ['Use the Moon Seal on the guardian.','moon-seal'],
  ['Give the guardian the seal.','moon-seal'],
  ['Offer the crescent to the stone creature.','moon-seal'],
  ['Have the Bard use the Moon Seal.','moon-seal'],
  ['Can we calm it down with the item we found?','moon-seal']
 ])('maps %s to the validated Moon Seal item operation', (text,itemId)=>{
  const c=makeCampaign(party);const owned=awardMoonSeal(c,party[3].id).campaign;const result=parseCommand(text,{...owned,sceneStep:2});
  expect(result.command).toMatchObject({type:'use_item',itemId});
  if(text.includes('Bard'))expect(result.command).toMatchObject({characterId:party[3].id});
 });
 it('supports NPC questions and an explicitly selected Ranger investigation',()=>{
  const ranger=makeCharacter('Ash','Ranger');const c=makeCampaign([ranger,makeCharacter('Pip','Rogue')]);
  expect(parseCommand('Ask Mara what she knows about the bell.',c).command.type).toBe('ask_mara');
  expect(parseCommand('Have the Ranger investigate the chapel.',{...c,sceneStep:2}).command).toMatchObject({type:'search',characterId:ranger.id});
 });
 it('asks for clarification for ambiguous and unavailable characters or items',()=>{
  const c=makeCampaign([makeCharacter('One','Wizard'),makeCharacter('Two','Wizard')]);
  expect(parseCommand('Have the Wizard attack the guardian.',c).command.type).toBe('clarify');
  expect(parseCommand('Have the Bard use the Moon Seal.',c).command.type).toBe('clarify');
  expect(parseCommand('Use an item.',c).command.type).toBe('clarify');
 });
 it('rejects unavailable creatures and routes general clue questions to Mara',()=>{
  const c=makeCampaign(party);expect(parseCommand('Attack the hydra',c).command.type).toBe('clarify');expect(parseCommand('Ask about the clue',c).command.type).toBe('ask_mara');
 });
 it('returns helpful clarification for unsupported actions without proposing an operation',()=>{
  expect(parseCommand('Build a spaceship',makeCampaign(party)).command).toMatchObject({type:'clarify'});
 });
 it('rejects malformed, unknown, or unavailable model proposals',()=>{
  const c=makeCampaign(party);
  expect(proposalToCommand({action:'delete_campaign'},c)).toBeNull();
  expect(proposalToCommand({action:'attack',target:'goblin'},c)).toBeNull();
  expect(proposalToCommand({action:'use_item',item:'not-in-catalog'},c)).toBeNull();
  expect(proposalToCommand({action:'use_item',item:'moon-seal',code:'bad'},c)).toBeNull();
  expect(proposalToCommand({action:'use_item',item:'moon-seal',character:'missing-person'},c)).toBeNull();
 });
});
