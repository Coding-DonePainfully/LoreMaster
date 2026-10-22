// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import App from './App';
import { awardMoonSeal, demoParty, makeCampaign, makeCharacter } from './game';
import { loadCampaign, saveCampaign } from './storage';

afterEach(()=>{cleanup();localStorage.clear();});
beforeAll(()=>{HTMLElement.prototype.scrollIntoView=()=>{};});

describe('shared-screen adventure flow',()=>{
 it('loads the guided demo, uses a real potion, rolls a die, and switches turns',async()=>{
  const user=userEvent.setup();render(<App/>);
  await user.click(screen.getByRole('button',{name:/load guided demo/i}));
  expect(await screen.findByRole('heading',{name:'The Wayfarer’s Rest'})).toBeTruthy();
  expect(screen.getByText('22/30 HP')).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Healing potion, quantity 1'}));
  await user.click(screen.getByRole('button',{name:'Use'}));
  expect(await screen.findByText('30/30 HP')).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Roll'}));
  await waitFor(()=>expect(screen.getByText(/d20 → [1-9]|d20 → 1[0-9]|d20 → 20/)).toBeTruthy());
  const action=screen.getByRole('textbox',{name:'Your action'});
  await user.type(action,'Ask Mara about the bell{Enter}');
  expect(await screen.findByText(/Mara lowers her voice/)).toBeTruthy();
  await user.type(action,'Switch to the rogue{Enter}');
  expect(await screen.findByText(/Finn, the Rogue, takes the lead/)).toBeTruthy();
 });

 it('creates a named character with a selected class',async()=>{
  const user=userEvent.setup();render(<App/>);
  await user.click(screen.getByRole('button',{name:/start an adventure/i}));
  await user.type(screen.getByPlaceholderText('e.g. Rowan'),'Rowan');
  await user.selectOptions(screen.getByLabelText('Choose a class'),'Ranger');
  await user.click(screen.getByRole('button',{name:/add ranger/i}));
  await user.click(screen.getByRole('button',{name:/begin the adventure/i}));
  expect(await screen.findByRole('button',{name:/Rowan/})).toBeTruthy();
  expect(screen.getByText('Ranger · Lv. 1')).toBeTruthy();
 });

 it('asks before replacing a saved campaign',async()=>{
  const user=userEvent.setup();render(<App/>);
  await user.click(screen.getByRole('button',{name:/load guided demo/i}));
  await screen.findByRole('heading',{name:'The Wayfarer’s Rest'});
  await user.click(screen.getByRole('button',{name:'New campaign'}));
  expect(screen.getByRole('heading',{name:'Start a new campaign?'})).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Keep playing'}));
  expect(screen.getByRole('heading',{name:'The Wayfarer’s Rest'})).toBeTruthy();
 });

 it('completes The Shattered Bell when the party naturally gives the Moon Seal to the guardian',async()=>{
  const party=[...demoParty().slice(0,3),makeCharacter('Lyra','Bard')];const base=makeCampaign(party,true);const found=awardMoonSeal(base,party[3].id).campaign;saveCampaign({...found,sceneStep:2});
  const user=userEvent.setup();render(<App/>);const action=screen.getByRole('textbox',{name:'Your action'});await user.type(action,'give the moon seal to the guardian{Enter}');
  expect(await screen.findByText(/completed The Shattered Bell/)).toBeTruthy();const saved=loadCampaign()!;expect(saved.sceneStep).toBe(3);expect(saved.guardianHp).toBe(0);expect(saved.objectives.every(o=>o.done)).toBe(true);expect(saved.characters.flatMap(c=>c.inventory).some(s=>s.itemId==='moon-seal')).toBe(false);
 });

 it('uses the Moon Seal from the selected character inventory to complete the same quest',async()=>{
  const party=[...demoParty().slice(0,3),makeCharacter('Lyra','Bard')];const base=makeCampaign(party,true);const found=awardMoonSeal(base,party[3].id).campaign;saveCampaign({...found,sceneStep:2});
  const user=userEvent.setup();render(<App/>);await user.click(screen.getByRole('button',{name:/Lyra/}));await user.click(screen.getByRole('button',{name:'Moon seal, quantity 1'}));await user.click(screen.getByRole('button',{name:'Use'}));
  expect(await screen.findByText(/completed The Shattered Bell/)).toBeTruthy();const saved=loadCampaign()!;expect(saved.sceneStep).toBe(3);expect(saved.guardianHp).toBe(0);expect(saved.characters.flatMap(c=>c.inventory).some(s=>s.itemId==='moon-seal')).toBe(false);
 });

 it('explains missing item handoffs without changing quest state',async()=>{
  const campaign=makeCampaign(demoParty(),true);saveCampaign({...campaign,sceneStep:2});
  const user=userEvent.setup();render(<App/>);const action=screen.getByRole('textbox',{name:'Your action'});await user.type(action,'give the moon seal{Enter}');
  expect(await screen.findByText(/has not found the moon seal yet/)).toBeTruthy();const saved=loadCampaign()!;expect(saved.sceneStep).toBe(2);expect(saved.guardianHp).toBe(12);expect(saved.objectives).toEqual(campaign.objectives);expect(saved.characters.flatMap(c=>c.inventory).some(s=>s.itemId==='moon-seal')).toBe(false);
 });

 it('does not create a second Moon Seal after another character repeats a search',async()=>{
  const party=demoParty();const base=makeCampaign(party,true);const found=awardMoonSeal(base,party[0].id).campaign;saveCampaign(found);
  const user=userEvent.setup();render(<App/>);await user.type(screen.getByRole('textbox',{name:'Your action'}),'switch to the rogue{Enter}');await screen.findByText(/Finn, the Rogue, takes the lead/);await user.type(screen.getByRole('textbox',{name:'Your action'}),'search the chapel{Enter}');
  await waitFor(()=>expect(loadCampaign()!.log.some(entry=>entry.text.includes('search the chapel'))).toBe(true));const saved=loadCampaign()!;expect(saved.characters.flatMap(c=>c.inventory).filter(s=>s.itemId==='moon-seal')).toHaveLength(1);expect(saved.facts.filter(x=>x.includes('found the moon seal'))).toHaveLength(1);
 });

 it('gives Mara a repeat reminder without duplicating the clue event',async()=>{
  const campaign=makeCampaign(demoParty(),true);saveCampaign(campaign);const user=userEvent.setup();render(<App/>);const action=screen.getByRole('textbox',{name:'Your action'});await user.type(action,'Ask Mara about the bell{Enter}');await screen.findByText(/Mara lowers her voice/);await user.type(screen.getByRole('textbox',{name:'Your action'}),'Ask Mara about the bell{Enter}');expect(await screen.findByText(/gentle reminder/)).toBeTruthy();const saved=loadCampaign()!;expect(saved.facts.filter(x=>x.includes('Mara says the moon seal'))).toHaveLength(1);
 });
});
