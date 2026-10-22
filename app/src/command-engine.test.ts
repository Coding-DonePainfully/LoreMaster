import { describe, expect, it } from 'vitest';
import { demoParty, makeCampaign } from './game';
import { Command } from './commands';
import { executeCommand } from './command-engine';

describe('authoritative command execution',()=>{
 it('keeps clarification requests from changing campaign state',()=>{
  const c=makeCampaign(demoParty());const result=executeCommand(c,{type:'clarify',question:'Which item?'},'use it');expect(result.campaign).toBe(c);expect(result.reply).toBe('Which item?');
 });
 it('rejects a missing quest item without changing mechanical state',()=>{
  const c={...makeCampaign(demoParty()),sceneStep:2};const result=executeCommand(c,{type:'use_item',characterId:c.activeId,itemId:'moon-seal'},'use the moon seal');
  expect(result.reply).toMatch(/has not found the moon seal/);expect(result.campaign).toBe(c);expect(result.campaign.sceneStep).toBe(c.sceneStep);expect(result.campaign.guardianHp).toBe(c.guardianHp);expect(result.campaign.characters.map(ch=>ch.inventory)).toEqual(c.characters.map(ch=>ch.inventory));
 });
 it('resolves an attack through application dice and keeps health within bounds',()=>{
  const c={...makeCampaign(demoParty()),sceneStep:2};const action:Command={type:'attack_guardian',characterId:c.activeId};const result=executeCommand(c,action,'attack the guardian');
  expect(result.rollText).toMatch(/d20/);expect(result.campaign.guardianHp).toBeGreaterThanOrEqual(0);expect(result.campaign.guardianHp).toBeLessThanOrEqual(c.guardianHp);expect(result.campaign.characters.every(ch=>ch.hp>=0&&ch.hp<=ch.maxHp)).toBe(true);expect(result.campaign.log.some(entry=>entry.kind==='roll')).toBe(true);
 });
 it('shares item-use rules between direct item actions and assistant commands',()=>{
  const c={...makeCampaign(demoParty()),characters:demoParty()};const first=c.characters[0];const wounded={...first,hp:first.hp-5};const updated={...c,characters:c.characters.map(ch=>ch.id===first.id?wounded:ch)};const result=executeCommand(updated,{type:'use_item',characterId:first.id,itemId:'healing-potion'},'use healing potion');const after=result.campaign.characters.find(ch=>ch.id===first.id)!;
  expect(after.hp).toBe(Math.min(wounded.maxHp,wounded.hp+8));expect(after.inventory.find(s=>s.itemId==='healing-potion')?.quantity??0).toBe((wounded.inventory.find(s=>s.itemId==='healing-potion')?.quantity??0)-1);
 });
});
