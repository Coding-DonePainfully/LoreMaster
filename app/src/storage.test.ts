import { describe, expect, it } from 'vitest';
import { Campaign, makeAdventureCampaign, makeCampaign, makeCharacter } from './game';
import { beginCombat, giveCharacterStatus } from './combat';
import { loadCampaign, saveCampaign } from './storage';

function memoryStorage(){
 const entries=new Map<string,string>();
 return{getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>entries.set(key,value),removeItem:(key:string)=>entries.delete(key)};
}

describe('campaign location persistence',()=>{
 it('saves and resumes the crypt location',()=>{
  const storage=memoryStorage();const campaign={...makeCampaign([makeCharacter('Lyra','Bard')]),location:'crypt' as const};
  saveCampaign(campaign,storage);expect(loadCampaign(storage)?.location).toBe('crypt');
 });
 it('infers a location for an older saved campaign',()=>{
  const storage=memoryStorage();const campaign={...makeCampaign([makeCharacter('Lyra','Bard')]),sceneStep:2} as Omit<Campaign,'location'>&{location?:Campaign['location']};
  delete campaign.location;storage.setItem('loremaster.campaign.v2',JSON.stringify(campaign));
  expect(loadCampaign(storage)?.location).toBe('chapel');
 });
 it('preserves a selected adventure, mode, and location across save/resume',()=>{
  const storage=memoryStorage();const campaign=makeAdventureCampaign([makeCharacter('Rowan','Ranger')],'gilded-masquerade',false,'dev');const entered={...campaign,location:'gallery'};saveCampaign(entered,storage);
  expect(loadCampaign(storage)).toMatchObject({adventureId:'gilded-masquerade',mode:'dev',location:'gallery',title:'A Murder in the Gilded Masquerade'});
 });
 it('extends a legacy Shattered Bell save with the crypt continuation objective',()=>{
  const storage=memoryStorage();const campaign=makeCampaign([makeCharacter('Lyra','Bard')]);const legacy={...campaign} as Partial<Campaign>&Record<string,unknown>;
  delete legacy.adventureId;delete legacy.mode;delete legacy.evidence;delete legacy.npcStatements;delete legacy.theories;delete legacy.unresolved;delete legacy.discoveredClues;delete legacy.sandboxTargetHp;
  storage.setItem('loremaster.campaign.v2',JSON.stringify(legacy));expect(loadCampaign(storage)?.objectives).toHaveLength(4);
 });
 it('preserves allocated attributes and derived health across save and reload',()=>{
  const storage=memoryStorage();let character=makeCharacter('Lyra','Bard');for(let i=0;i<8;i++)character={...character,attributes:{...character.attributes,cha:character.attributes.cha+1},statPointsSpent:i+1,maxHp:20+(character.attributes.con*2),hp:20+(character.attributes.con*2)};const campaign=makeAdventureCampaign([character],'ashen-expedition');saveCampaign(campaign,storage);expect(loadCampaign(storage)?.characters[0]).toMatchObject({attributes:character.attributes,statPointsSpent:8,maxHp:30,hp:30});
 });
 it('migrates Phase 2 class scores to the new 15-point allocation and CON health formula',()=>{
  const storage=memoryStorage();const campaign=makeCampaign([makeCharacter('Old Hero','Fighter')]);const legacy={...campaign,version:2,characters:campaign.characters.map(c=>({...c,attributes:{str:16,dex:12,con:14,int:10,wis:12,cha:10},statPointsSpent:undefined,statuses:undefined,maxHp:30,hp:15}))};storage.setItem('loremaster.campaign.v2',JSON.stringify(legacy));const loaded=loadCampaign(storage)!;const character=loaded.characters[0];expect(loaded.version).toBe(3);expect(character.statPointsSpent).toBe(15);expect(Object.values(character.attributes).reduce((a,b)=>a+b,0)).toBe(45);expect(character.maxHp).toBe(20+character.attributes.con*2);expect(character.hp).toBe(Math.round(character.maxHp/2));expect(character.statuses).toEqual([]);
 });
 it('preserves the new combat, node-route, and status state through save/load',()=>{
  const storage=memoryStorage();let character=giveCharacterStatus(makeCharacter('Ari','Fighter'),'fire',2);let campaign=makeAdventureCampaign([character],'ashen-expedition');campaign={...campaign,location:'ash-flats',securedRoutes:['bridge'],failedChecks:{'ashen-expedition:ash-flats':2}};campaign=beginCombat(campaign,'ash-hazard',8,'ash-flats',()=>10);saveCampaign(campaign,storage);const loaded=loadCampaign(storage)!;expect(loaded.combat).toEqual(campaign.combat);expect(loaded.securedRoutes).toEqual(['bridge']);expect(loaded.failedChecks).toEqual(campaign.failedChecks);expect(loaded.characters[0].statuses).toEqual([{id:'fire',duration:2}]);
 });
});
