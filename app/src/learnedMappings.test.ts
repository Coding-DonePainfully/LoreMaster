import { describe, expect, it } from 'vitest';
import { makeCampaign, makeCharacter } from './game';
import { clearLearnedMappings, LEARNED_MAPPING_KEY, learnValidatedMapping, readLearnedMappings, retrieveLearnedMapping } from './learnedMappings';

function memoryStorage(){const data=new Map<string,string>();return{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value),removeItem:(key:string)=>data.delete(key)};}
describe('persistent validated language mappings',()=>{
 it('persists a validated structured command and retrieves it after reloading storage',()=>{
  const storage=memoryStorage();const campaign=makeCampaign([makeCharacter('Lyra','Bard')]);const command={type:'use_ability' as const,characterId:campaign.activeId,abilityName:'Inspiring word'};
  learnValidatedMapping('please use my inspiring word',command,campaign,storage);
  expect(readLearnedMappings(storage)).toHaveLength(1);expect(retrieveLearnedMapping('please use my inspiring word',campaign,storage)).toEqual(command);
 });
 it('does not learn narration or read-only model answers',()=>{
  const storage=memoryStorage();const campaign=makeCampaign([makeCharacter('Lyra','Bard')]);
  learnValidatedMapping('why is the bell ringing?',{type:'narrative_question',answer:'Perhaps the ward is weakening.'},campaign,storage);
  expect(readLearnedMappings(storage)).toHaveLength(0);
 });
 it('rejects mappings when adventure, location, character, or item context changed',()=>{
  const storage=memoryStorage();const campaign=makeCampaign([makeCharacter('Lyra','Bard')]);const potion=campaign.characters[0].inventory.find(stack=>stack.itemId==='healing-potion')!;
  const command={type:'use_item' as const,characterId:campaign.activeId,itemId:potion.itemId};learnValidatedMapping('drink my potion',command,campaign,storage);
  expect(retrieveLearnedMapping('drink my potion', {...campaign,location:'chapel'},storage)).toBeNull();
  const withoutPotion={...campaign,characters:campaign.characters.map(character=>({...character,inventory:character.inventory.filter(stack=>stack.itemId!==potion.itemId)}))};
  expect(retrieveLearnedMapping('drink my potion',withoutPotion,storage)).toBeNull();
 });
 it('does not reuse an implicit actor mapping after the active player changes',()=>{
  const storage=memoryStorage();const bard=makeCharacter('Lyra','Bard');const rogue=makeCharacter('Finn','Rogue');const campaign=makeCampaign([bard,rogue]);
  learnValidatedMapping('use my ability',{type:'use_ability',characterId:bard.id,abilityName:'Inspiring word'},campaign,storage);
  expect(retrieveLearnedMapping('use my ability',{...campaign,activeId:rogue.id},storage)).toBeNull();
 });
 it('keeps an explicitly named character bound to that character',()=>{
  const storage=memoryStorage();const bard=makeCharacter('Lyra','Bard');const rogue=makeCharacter('Finn','Rogue');const campaign=makeCampaign([bard,rogue]);const command={type:'use_ability' as const,characterId:bard.id,abilityName:'Inspiring word'};
  learnValidatedMapping('Have Lyra use Inspiring word',command,campaign,storage);
  expect(retrieveLearnedMapping('Have Lyra use Inspiring word',{...campaign,activeId:rogue.id},storage)).toEqual(command);
 });
 it('ignores corrupt and outdated entries and can clear mappings independently',()=>{
  const storage=memoryStorage();storage.setItem(LEARNED_MAPPING_KEY,'{');expect(readLearnedMappings(storage)).toEqual([]);
  const campaign=makeCampaign([makeCharacter('Lyra','Bard')]);learnValidatedMapping('inspect here',{type:'inspect',characterId:campaign.activeId},campaign,storage);clearLearnedMappings(storage);expect(readLearnedMappings(storage)).toEqual([]);
 });
});
