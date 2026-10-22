import { describe, expect, it, vi } from 'vitest';
import * as game from './game';
import { demoParty, makeCampaign, makeCharacter } from './game';
import { Command, parseCommand } from './commands';
import { executeCommand } from './command-engine';

describe('authoritative command execution',()=>{
 it('keeps clarification requests from changing campaign state',()=>{
  const c=makeCampaign(demoParty());const result=executeCommand(c,{type:'clarify',question:'Which item?'},'use it');expect(result.campaign).toBe(c);expect(result.reply).toBe('Which item?');
 });
 it('rejects a missing quest item without changing mechanical state',()=>{
  const c={...makeCampaign(demoParty()),location:'chapel',sceneStep:2};const result=executeCommand(c,{type:'use_item',characterId:c.activeId,itemId:'moon-seal'},'use the moon seal');
  expect(result.reply).toMatch(/has not found the moon seal/);expect(result.campaign).toBe(c);expect(result.campaign.sceneStep).toBe(c.sceneStep);expect(result.campaign.guardianHp).toBe(c.guardianHp);expect(result.campaign.characters.map(ch=>ch.inventory)).toEqual(c.characters.map(ch=>ch.inventory));
 });
 it('resolves an attack through application dice and keeps health within bounds',()=>{
  const c={...makeCampaign(demoParty()),sceneStep:2};const action:Command={type:'attack_guardian',characterId:c.activeId};const result=executeCommand(c,action,'attack the guardian');
  expect(result.rollText).toMatch(/d20/);expect(result.campaign.guardianHp).toBeGreaterThanOrEqual(0);expect(result.campaign.guardianHp).toBeLessThanOrEqual(c.guardianHp);expect(result.campaign.characters.every(ch=>ch.hp>=0&&ch.hp<=ch.maxHp)).toBe(true);expect(result.campaign.log.some(entry=>entry.kind==='roll')).toBe(true);
 });
 it('consumes one action per party member per round and reports blocked repeats',()=>{
  const hero=makeCharacter('Mira','Wizard');const base=makeCampaign([hero]);const c={...base,location:'chapel',sceneStep:2};
  const first=executeCommand(c,{type:'attack_guardian',characterId:hero.id},'attack guardian');expect(first.campaign.actedThisTurn).toEqual([hero.id]);
  const repeat=executeCommand(first.campaign,{type:'attack_guardian',characterId:hero.id},'attack guardian');expect(repeat.campaign).toBe(first.campaign);expect(repeat.reply).toMatch(/already taken an action/);
  const next=executeCommand(first.campaign,{type:'end_turn',characterId:hero.id},'end turn');expect(next.campaign.actedThisTurn).toEqual([]);
 });
 it('takes the party into the crypt for the full Chapel Crypt route name',()=>{
  const hero=makeCharacter('Mira','Ranger');const base=makeCampaign([hero]);const campaign={...base,location:'chapel',sceneStep:2,guardianHp:0};const parsed=parseCommand('Travel to The Chapel Crypt',campaign);
  expect(parsed.command.type).toBe('travel_crypt');const result=executeCommand(campaign,parsed.command,'Travel to The Chapel Crypt');expect(result.campaign.location).toBe('crypt');
 });
 it('uses STR damage, flat armor reduction, and the critical defense and damage rules',()=>{
  const die=vi.spyOn(game,'randomDie').mockReturnValue(20);const percentile=vi.spyOn(game,'randomPercent').mockReturnValue(1);try{const fighter=game.makeCharacter('Ari','Fighter',{str:20,dex:5,con:5,int:5,wis:5,cha:5});let c=game.makeAdventureCampaign([fighter],'shattered-bell');c={...c,location:'chapel',sceneStep:2};const result=executeCommand(c,{type:'attack_guardian',characterId:fighter.id},'Slash');expect(result.campaign.guardianHp).toBe(0);expect(result.rollText).toMatch(/d100 1 vs 10% - CRITICAL HIT/);expect(result.rollText).toMatch(/damage base 6 \+ 5 STR - 1 armor reduction x1.5 critical = 16/);}finally{die.mockRestore();percentile.mockRestore();}
 });
 it('turns a successful Investigation into the actual clue and reward',()=>{
  const roll=vi.spyOn(game,'randomDie').mockReturnValue(20);
  try {
   const c=makeCampaign(demoParty());
   const result=executeCommand(c,{type:'search',characterId:c.activeId},'Investigate the floor');
   expect(result.reply).toMatch(/loose flagstone|moon seal/i);
   expect(result.campaign.characters.some(ch=>ch.inventory.some(s=>s.itemId==='moon-seal'&&s.quantity===1))).toBe(true);
   expect(result.campaign.log.some(entry=>entry.kind==='story'&&/moon seal/i.test(entry.text))).toBe(true);
  } finally {roll.mockRestore();}
 });
 it('enters the crypt only after the guardian is down and is idempotent when repeated',()=>{
  const base={...makeCampaign(demoParty()),location:'chapel' as const,sceneStep:2,guardianHp:0};
  const entered=executeCommand(base,{type:'travel_crypt',characterId:base.activeId},'Enter the crypt');
  expect(entered.campaign.location).toBe('crypt');expect(entered.reply).toMatch(/descend.*crypt/i);
  const repeated=executeCommand(entered.campaign,{type:'travel_crypt',characterId:base.activeId},'Enter the crypt');
  expect(repeated.campaign).toBe(entered.campaign);expect(repeated.campaign.log.length).toBe(entered.campaign.log.length);
 });
 it('leaves location unchanged when crypt access is still blocked',()=>{
  const c={...makeCampaign(demoParty()),location:'chapel' as const,sceneStep:2,guardianHp:8};
  const result=executeCommand(c,{type:'travel_crypt',characterId:c.activeId},'Enter the crypt');
  expect(result.campaign).toBe(c);expect(result.reply).toMatch(/still blocked/i);
 });
 it('does not let explicit travel commands bypass the clue gate or teleport into the crypt',()=>{
  const c=makeCampaign(demoParty());
  const direct=executeCommand(c,{type:'travel_location',characterId:c.activeId,locationId:'chapel'},'Go to the chapel');
  expect(direct.campaign).toBe(c);expect(direct.reply).toMatch(/first ask Mara|investigate/i);
  const crypt=executeCommand({...c,sceneStep:2,guardianHp:0},{type:'travel_crypt',characterId:c.activeId},'Enter the crypt');
  expect(crypt.campaign.location).toBe('inn');expect(crypt.reply).toMatch(/reached from the hilltop chapel/i);
 });
 it('keeps deterministic fallback travel subject to engine route gates',()=>{
  const c=makeCampaign(demoParty());
  const parsed=parseCommand('Go to the chapel',c);
  expect(parsed.command).toMatchObject({type:'travel_chapel'});
  const executed=executeCommand(c,parsed.command,'Go to the chapel');
  expect(executed.campaign).toBe(c);expect(executed.reply).toMatch(/First ask Mara|search for the Moon Seal/i);
 });
 it('does not allow chapel travel before Mara or the seal clue establishes the route',()=>{
  const c=makeCampaign(demoParty());const blocked=executeCommand(c,{type:'travel_chapel',characterId:c.activeId},'Go to the chapel');expect(blocked.campaign).toBe(c);expect(blocked.reply).toMatch(/First ask Mara|search for the Moon Seal/i);
  const clue=game.recordMaraClue(c).campaign;const allowed=executeCommand(clue,{type:'travel_chapel',characterId:c.activeId},'Go to the chapel');expect(allowed.campaign.location).toBe('chapel');expect(allowed.campaign.objectives[1].done).toBe(true);
 });
 it('does not resurrect a defeated guardian when inspecting the chapel',()=>{
  const c={...makeCampaign(demoParty()),location:'chapel' as const,sceneStep:2,guardianHp:0};
  const result=executeCommand(c,{type:'inspect',characterId:c.activeId},'look around');
  expect(result.reply).toMatch(/guardian lies shattered|guardian.*shattered/i);expect(result.reply).toMatch(/stairs are open/i);expect(result.reply).not.toMatch(/guardian bars|blocks the entrance/i);expect(result.campaign.location).toBe('chapel');expect(result.campaign.guardianHp).toBe(0);
 });
 it('uses the defined Bard ability and consumes exactly one use',()=>{
  const bard=game.makeCharacter('Lyra','Bard');const c=game.makeCampaign([bard]);
  const result=executeCommand(c,{type:'use_ability',characterId:bard.id},'Inspiring word');
  const updated=result.campaign.characters[0];
  expect(updated.abilities[0].uses).toBe(0);expect(updated.effects.nextCheckBonus).toBe(2);expect(result.reply).toMatch(/Inspiring word/);
  const second=executeCommand(result.campaign,{type:'use_ability',characterId:bard.id},'Inspiring word');
  expect(second.campaign.characters[0].abilities[0].uses).toBe(0);expect(second.campaign.characters[0].effects.nextCheckBonus).toBe(2);
 });
 it('shares item-use rules between direct item actions and assistant commands',()=>{
  const c={...makeCampaign(demoParty()),characters:demoParty()};const first=c.characters[0];const wounded={...first,hp:first.hp-5};const updated={...c,characters:c.characters.map(ch=>ch.id===first.id?wounded:ch)};const result=executeCommand(updated,{type:'use_item',characterId:first.id,itemId:'healing-potion'},'use healing potion');const after=result.campaign.characters.find(ch=>ch.id===first.id)!;
  expect(after.hp).toBe(Math.min(wounded.maxHp,wounded.hp+8));expect(after.inventory.find(s=>s.itemId==='healing-potion')?.quantity??0).toBe((wounded.inventory.find(s=>s.itemId==='healing-potion')?.quantity??0)-1);
 });
 it('gives only location-specific contextual help for the selected adventure',()=>{
  const c=game.makeAdventureCampaign([game.makeCharacter('Mira','Wizard')],'ashen-expedition');const result=executeCommand(c,{type:'help',characterId:c.activeId},'help');
  expect(result.reply).toContain('Cinderwatch Waystation');expect(result.reply).toContain('Nima');expect(result.reply).toContain('Ash Flats');expect(result.reply).not.toMatch(/Mara|chapel|guardian/i);
 });
 it('does not roll repeatedly after all local clues are already discovered',()=>{
  const roll=vi.spyOn(game,'randomDie').mockReturnValue(20);try{const c=game.makeAdventureCampaign([game.makeCharacter('Mira','Wizard')],'ashen-expedition');const searched={...c,location:'observatory',discoveredClues:['cold-lens']};const result=executeCommand(searched,{type:'search',characterId:searched.activeId},'Search the area');expect(result.campaign).toBe(searched);expect(result.reply).toMatch(/no undiscovered/i);expect(roll).not.toHaveBeenCalled();}finally{roll.mockRestore();}
 });
 it('shares failed search attempts across the party and gives a visible retry bonus after two failures',()=>{
  const roll=vi.spyOn(game,'randomDie').mockReturnValueOnce(1).mockReturnValueOnce(1).mockReturnValueOnce(10);try{const hero=game.makeCharacter('Sage','Cleric',{str:5,dex:5,con:5,int:5,wis:10,cha:5});let c=game.makeCampaign([hero]);const ally=game.makeCharacter('Scout','Ranger');c={...c,characters:[...c.characters,ally]};c=executeCommand(c,{type:'search',characterId:hero.id},'search').campaign;c=executeCommand(c,{type:'search',characterId:ally.id},'search').campaign;const result=executeCommand(c,{type:'search',characterId:hero.id},'search');expect(result.rollText).toMatch(/\+ 2 retry bonus/);expect(result.campaign.discoveredClues).toContain('moon-seal');expect(result.campaign.failedChecks['shattered-bell:inn']).toBeUndefined();}finally{roll.mockRestore();}
 });
 it('secures the Ashen bridge once, consumes one rope, and removes its crossing check',()=>{
  const roll=vi.spyOn(game,'randomDie').mockReturnValue(1);try{const original=game.makeCharacter('Scout','Rogue');let c=game.makeAdventureCampaign([original],'ashen-expedition');c={...c,location:'ash-flats'};const secured=executeCommand(c,{type:'secure_bridge',characterId:original.id},'Tie the ropes');expect(secured.campaign.securedRoutes).toContain('bridge');expect(secured.campaign.characters[0].inventory.some(stack=>stack.itemId==='rope')).toBe(false);const repeated=executeCommand(secured.campaign,{type:'secure_bridge',characterId:original.id},'Repair bridge');expect(repeated.campaign).toBe(secured.campaign);const before=roll.mock.calls.length;const crossed=executeCommand(secured.campaign,{type:'travel_location',characterId:original.id,locationId:'bridge'},'Cross the bridge');expect(crossed.campaign.location).toBe('bridge');expect(roll.mock.calls.length).toBe(before);}finally{roll.mockRestore();}
 });
});
