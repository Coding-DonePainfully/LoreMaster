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
 it('routes campaign-generation requests to a clear unsupported response',()=>{
  const result=parseCommand('I want you to create a new, more powerful and complex story',makeCampaign(party));
  expect(result.reason).toBe('campaign-generation');expect(result.command).toMatchObject({type:'clarify',question:expect.stringMatching(/not implemented/i)});
 });
 it('matches a known ability name directly and distinguishes asking about it',()=>{
  const bard=makeCharacter('Lyra','Bard');const c=makeCampaign([bard]);
  expect(parseCommand('Inspiring word',c).command).toMatchObject({type:'use_ability',characterId:bard.id});
  expect(parseCommand('What does Inspiring word do?',c).command).toMatchObject({type:'show_abilities',characterId:bard.id});
 });
 it('treats a hypothetical crypt question as read-only',()=>{
  const c={...makeCampaign(party),location:'chapel' as const,sceneStep:2,guardianHp:0};
  expect(parseCommand('What happens if I enter the crypt?',c).command).toMatchObject({type:'narrative_question'});
 });
 it('routes entering the open crypt as a location transition',()=>{
  const c={...makeCampaign(party),location:'chapel' as const,sceneStep:2,guardianHp:0};
  expect(parseCommand('Enter the crypt',c).command).toMatchObject({type:'travel_crypt'});
 });
 it('rejects an undefined custom buff and explains the character’s real ability',()=>{
  const c=makeCampaign([makeCharacter('Mira','Wizard')]);
  const result=parseCommand("I cast a buff spell which increases everyone's attack by 20% for the next 5 turns",c);
  expect(result.command).toMatchObject({type:'clarify'});
  if(result.command.type==='clarify')expect(result.command.question).toMatch(/not defined|Arcane bolt|will not/i);
 });
 it('answers guardian follow-ups from current state without contradictory old facts',()=>{
  const c={...makeCampaign(party),sceneStep:2,guardianHp:0,facts:['The stone guardian fell. The crypt stairs are open.']};
  const result=parseCommand('What now since the guardian is dead?',c);
  expect(result.command).toMatchObject({type:'narrative_question',answer:expect.stringMatching(/stairs.*open.*Descend/i)});
 });
 it('answers what-we-discovered follow-ups from the latest successful check',()=>{
  const c=makeCampaign(party);const time=new Date().toISOString();
  c.log.push({id:'check-result',kind:'roll',text:'Ari · d20 18 + 2 WIS = 20 vs DC 12 · SUCCESS',time});
  c.log.push({id:'discovery',kind:'story',text:'The flagstone reveals Mara’s Moon Seal.',time});
  expect(parseCommand('What did we discover?',c).command).toMatchObject({type:'narrative_question',answer:expect.stringContaining('Mara’s Moon Seal')});
 });
 it('uses the recorded discovery for a success follow-up',()=>{
  const c=makeCampaign(party);const time=new Date().toISOString();
  c.log.push({id:'check-result',kind:'roll',text:'Ari · d20 18 + 2 WIS = 20 vs DC 12 · SUCCESS',time});
  c.log.push({id:'discovery',kind:'story',text:'A loose flagstone reveals a silver moon seal beneath the chapel floor.',time});
  const result=parseCommand('So it succeeded, now what?',c);
  expect(result.command).toMatchObject({type:'narrative_question',answer:expect.stringContaining('A loose flagstone reveals a silver moon seal')});
 });
 it('does not reuse an old successful discovery after a later failed check',()=>{
  const c=makeCampaign(party);const time=new Date().toISOString();
  c.log.push({id:'old-success',kind:'roll',text:'Ari · d20 18 + 2 WIS = 20 vs DC 12 · SUCCESS',time});
  c.log.push({id:'old-discovery',kind:'story',text:'The flagstone reveals a Moon Seal.',time});
  c.log.push({id:'latest-failure',kind:'roll',text:'Ari · d20 2 + 2 WIS = 4 vs DC 12 · FAILURE',time});
  const result=parseCommand('So it succeeded, now what?',c);
  expect(result.command).toMatchObject({type:'narrative_question',answer:expect.stringMatching(/latest check failed/i)});
  if(result.command.type==='narrative_question')expect(result.command.answer).not.toContain('Moon Seal');
 });
 it('rejects malformed, unknown, or unavailable model proposals',()=>{
  const c=makeCampaign(party);
  expect(proposalToCommand({action:'delete_campaign'},c)).toBeNull();
  expect(proposalToCommand({action:'attack',target:'goblin'},c)).toBeNull();
  expect(proposalToCommand({action:'use_item',item:'not-in-catalog'},c)).toBeNull();
  expect(proposalToCommand({action:'use_item',item:'moon-seal',code:'bad'},c)).toBeNull();
  expect(proposalToCommand({action:'use_item',item:'moon-seal',character:'missing-person'},c)).toBeNull();
  expect(proposalToCommand({action:'use_ability',ability:'invented spell'},c)).toBeNull();
 });
 it('turns a model custom_ability classification into a clarification, never an effect',()=>{
  const c=makeCampaign([makeCharacter('Mira','Wizard')]);
  expect(proposalToCommand({action:'custom_ability'},c)?.command).toMatchObject({type:'clarify'});
 });
 it('maps an exact model ability proposal only to an ability the selected character owns',()=>{
  const bard=makeCharacter('Lyra','Bard');const c=makeCampaign([bard]);
  expect(proposalToCommand({action:'use_ability',character:'Lyra',ability:'Inspiring word'},c)?.command).toMatchObject({type:'use_ability',characterId:bard.id,abilityName:'Inspiring word'});
  expect(proposalToCommand({action:'use_ability',character:'Lyra',ability:'Arcane bolt'},c)).toBeNull();
 });
 it.each(['Secure the bridge.','Tie the ropes.','Fix the bridge.','Repair the bridge.'])('recognizes the Ashen bridge preparation phrase: %s',phrase=>{
  const campaign=makeCampaign([makeCharacter('Mira','Ranger')]);const ashen={...campaign,adventureId:'ashen-expedition' as const,location:'ash-flats'};expect(parseCommand(phrase,ashen).command).toMatchObject({type:'secure_bridge',characterId:ashen.activeId});
 });
 it('resolves connected Ashen routes and does not suggest Bell content in help',()=>{
  const campaign=makeCampaign([makeCharacter('Mira','Ranger')]);const ashen={...campaign,adventureId:'ashen-expedition' as const,location:'ash-flats'};expect(parseCommand('Move to the lava tube',ashen).command).toMatchObject({type:'travel_location',locationId:'lava-tube'});expect(parseCommand('Cross the bridge',ashen).command).toMatchObject({type:'travel_location',locationId:'bridge'});expect(parseCommand('help',ashen).command.type).toBe('help');
 });
 it('does not route an Ashen attack request to the Shattered Bell guardian',()=>{
  const campaign=makeCampaign([makeCharacter('Mira','Ranger')]);const ashen={...campaign,adventureId:'ashen-expedition' as const,location:'ash-flats'};expect(parseCommand('Attack the guardian',ashen).command).toMatchObject({type:'clarify',question:expect.stringMatching(/no active enemy encounter.*Ashen Expedition/i)});
 });
 it('rejects a stale model answer that says a defeated guardian still blocks the entrance',()=>{
  const c={...makeCampaign(party),location:'chapel' as const,sceneStep:2,guardianHp:0};
  expect(proposalToCommand({action:'narrative_question',answer:'The guardian still blocks the crypt entrance.'},c)).toBeNull();
 });
});
