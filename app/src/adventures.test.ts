import { describe, expect, it, vi } from 'vitest';
import * as game from './game';
import { ADVENTURES } from './adventures';
import { executeCommand } from './command-engine';

describe('curated adventure state and progression',()=>{
 it('defines all three adventures with locations, NPCs, objectives, clues, encounters, and branches',()=>{
  expect(ADVENTURES.map(adventure=>adventure.id)).toEqual(['shattered-bell','gilded-masquerade','ashen-expedition']);
  for(const adventure of ADVENTURES){expect(adventure.premise).toBeTruthy();expect(adventure.locations.length).toBeGreaterThan(1);expect(adventure.objectives.length).toBeGreaterThan(1);expect(adventure.clues.length).toBeGreaterThan(0);expect(adventure.encounters.length).toBeGreaterThan(0);expect(adventure.branches.length).toBeGreaterThan(0);}
 });
 it('keeps NPC accounts separate from physical evidence in the masquerade',()=>{
  const adventure=ADVENTURES.find(entry=>entry.id==='gilded-masquerade')!;const lyra=game.makeCharacter('Lyra','Bard');const campaign=game.makeAdventureCampaign([lyra],'gilded-masquerade');
  const asked=executeCommand(campaign,{type:'ask_mara',characterId:lyra.id},'Ask Lady Celene about the final song');
  expect(asked.campaign.npcStatements).toHaveLength(1);expect(asked.campaign.evidence).toHaveLength(0);expect(asked.campaign.facts).toHaveLength(0);expect(asked.reply).toMatch(/possible motive|account, not confirmed evidence/i);expect(adventure.npcs).toHaveLength(3);
 });
 it('advances the masquerade inspection objective only after discovering the gallery evidence',()=>{
  const roll=vi.spyOn(game,'randomDie').mockReturnValue(20);try{const character=game.makeCharacter('Lyra','Bard');let campaign=game.makeAdventureCampaign([character],'gilded-masquerade');campaign={...campaign,location:'gallery'};const inspected=executeCommand(campaign,{type:'search',characterId:character.id},'Investigate the gallery');expect(inspected.campaign.discoveredClues).toContain('broken-glass');expect(inspected.campaign.objectives[0].done).toBe(true);expect(inspected.campaign.objectives[2].done).toBe(false);const repeat=executeCommand(inspected.campaign,{type:'search',characterId:character.id},'Search again');expect(repeat.campaign).toBe(inspected.campaign);}finally{roll.mockRestore();}
 });
 it('allows a supported but incomplete accusation without declaring guilt',()=>{
  const character=game.makeCharacter('Lyra','Bard');let campaign=game.makeAdventureCampaign([character],'gilded-masquerade');campaign={...campaign,discoveredClues:['muddy-thread'],evidence:['A dark velvet thread and damp soil mark the garden path.']};
  const result=executeCommand(campaign,{type:'accuse',characterId:character.id,suspect:'vesper'},'Accuse Vesper');
  expect(result.campaign.theories).toContain('The party accuses Vesper.');expect(result.campaign.facts).toEqual(campaign.facts);expect(result.reply).toMatch(/plausible theory|case is incomplete/i);
 });
 it('continues the Shattered Bell through the crypt and lower reliquary once',()=>{
  const roll=vi.spyOn(game,'randomDie').mockReturnValue(20);try{const bard=game.makeCharacter('Lyra','Bard');let campaign=game.makeAdventureCampaign([bard],'shattered-bell');campaign={...campaign,location:'chapel',sceneStep:3,guardianHp:0,objectives:campaign.objectives.map((objective,index)=>({...objective,done:index<2}))};campaign=executeCommand(campaign,{type:'travel_crypt',characterId:bard.id},'Enter the crypt').campaign;campaign=executeCommand(campaign,{type:'search',characterId:bard.id},'Investigate the crypt').campaign;expect(campaign.discoveredClues).toContain('empty-cradle');campaign=executeCommand(campaign,{type:'travel_location',characterId:bard.id,locationId:'deep-crypt'},'Descend to the lower reliquary').campaign;const revealed=executeCommand(campaign,{type:'search',characterId:bard.id},'Investigate the lower reliquary');expect(revealed.campaign.discoveredClues).toContain('lower-echo');expect(revealed.campaign.unresolved).not.toContain('What is waking beneath the chapel?');expect(revealed.campaign.objectives.every(objective=>objective.done)).toBe(true);const repeated=executeCommand(revealed.campaign,{type:'search',characterId:bard.id},'Search again');expect(repeated.campaign.discoveredClues.filter(id=>id==='lower-echo')).toHaveLength(1);expect(repeated.campaign.evidence.filter(clue=>/flooded lower reliquary/.test(clue))).toHaveLength(1);}finally{roll.mockRestore();}
 });
 it('solves the authored masquerade branch only after required evidence and an interview',()=>{
  const character=game.makeCharacter('Lyra','Bard');const campaign=game.makeAdventureCampaign([character],'gilded-masquerade');const fact='The party proved Doctor Orin poisoned Lord Vey: the cordial evidence matched his hidden notes, and his account placed him in the gallery.';
  const complete={...campaign,discoveredClues:['broken-glass','medicine-ledger'],evidence:['Bitter almond cordial.','Orin feared exposure.'],npcStatements:['Doctor Orin: Lord Vey had a weak heart.']};
  const solved=executeCommand(complete,{type:'accuse',characterId:character.id,suspect:'orin'},'Accuse Doctor Orin');
  expect(solved.campaign.facts).toContain(fact);expect(solved.campaign.unresolved).not.toContain('Who killed Lord Vey?');expect(solved.campaign.objectives.every(objective=>objective.done)).toBe(true);
  const beforeSolution=executeCommand(campaign,{type:'accuse',characterId:character.id,suspect:'orin'},'Accuse Doctor Orin');expect(beforeSolution.campaign.facts).not.toContain(fact);expect(beforeSolution.campaign.theories).toHaveLength(1);
 });
 it('checks an expedition route and applies its real failed-check resource cost',()=>{
  const roll=vi.spyOn(game,'randomDie').mockReturnValue(1);try{const wizard=game.makeCharacter('Mira','Wizard');let campaign=game.makeAdventureCampaign([wizard],'ashen-expedition');campaign=executeCommand(campaign,{type:'travel_location',characterId:wizard.id,locationId:'ash-flats'}).campaign;const result=executeCommand(campaign,{type:'travel_location',characterId:wizard.id,locationId:'lava-tube'});const updated=result.campaign.characters[0];expect(result.rollText).toMatch(/ROUTE CHECK.*FAILURE/);expect(updated.inventory.find(stack=>stack.itemId==='torch')?.quantity??0).toBe(0);expect(result.campaign.location).toBe('lava-tube');}finally{roll.mockRestore();}
 });
 it('keeps Dev Sandbox damage separate from campaign enemies and normal-mode state',()=>{
  const character=game.makeCharacter('Ari','Fighter');const story=game.makeAdventureCampaign([character],'shattered-bell',false,'story');const rejected=executeCommand(story,{type:'dev_damage',characterId:character.id,amount:12},'Apply 12 Damage');expect(rejected.campaign).toBe(story);
  const dev=game.makeAdventureCampaign([character],'shattered-bell',false,'dev');const damaged=executeCommand(dev,{type:'dev_damage',characterId:character.id,amount:12},'Apply 12 Damage');expect(damaged.campaign.sandboxTargetHp).toBe(0);expect(damaged.campaign.guardianHp).toBe(dev.guardianHp);expect(damaged.campaign.characters[0].hp).toBe(character.hp);
 });
});
