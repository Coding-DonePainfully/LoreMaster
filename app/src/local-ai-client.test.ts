import { describe, expect, it, vi } from 'vitest';
import { demoParty, makeCampaign, makeCharacter } from './game';
import { selectCommand } from './local-ai-client';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

describe('local AI client fallback',()=>{
 const c=makeCampaign(demoParty());
 it('uses the deterministic parser immediately when LM Studio is unavailable',async()=>{
  const fetcher=vi.fn();const result=await selectCommand('Ask Mara what she knows about the bell',c,c.activeId,true,false,fetcher);
  expect(result.command.type).toBe('ask_mara');expect(result.source).toBe('fallback');expect(result.aiFailed).toBe(false);expect(fetcher).not.toHaveBeenCalled();
 });
 it('does not ask a model to guess an ambiguous character or item reference',async()=>{
  const twoWizards=makeCampaign([makeCharacter('One','Wizard'),makeCharacter('Two','Wizard')]);const fetcher=vi.fn();const result=await selectCommand('Have the Wizard attack the guardian',twoWizards,twoWizards.activeId,true,true,fetcher);
  expect(result.command.type).toBe('clarify');expect(result.source).toBe('fallback');expect(fetcher).not.toHaveBeenCalled();
 });
 it('uses a validated model proposal while keeping it a typed command',async()=>{
  const fetcher=vi.fn(async()=>json({proposal:{action:'ask_npc',target:'Mara'}}));const result=await selectCommand('What does that old ringing mean?',c,c.activeId,true,true,fetcher);
  expect(result).toMatchObject({source:'model',aiFailed:false,command:{type:'ask_mara',characterId:c.activeId}});
 });
 it('falls back safely after a request timeout without executing a model action',async()=>{
  const fetcher=vi.fn((_url:RequestInfo|URL,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})));
  const result=await selectCommand('What does that old ringing mean?',c,c.activeId,true,true,fetcher,8);
  expect(result).toMatchObject({source:'fallback',aiFailed:true,command:{type:'narrative_question'}});expect(c.sceneStep).toBe(0);
 });
 it('falls back on malformed or semantically invalid model output',async()=>{
  const fetcher=vi.fn(async()=>json({proposal:{action:'delete_campaign'}}));const result=await selectCommand('What does that old ringing mean?',c,c.activeId,true,true,fetcher);
  expect(result).toMatchObject({source:'fallback',aiFailed:false,command:{type:'narrative_question'}});expect(c.sceneStep).toBe(0);
 });
 it('falls back on a non-success API response without dropping the request',async()=>{
  const fetcher=vi.fn(async()=>json({error:'offline'},503));const result=await selectCommand('What does that old ringing mean?',c,c.activeId,true,true,fetcher);
  expect(result).toMatchObject({source:'fallback',aiFailed:true,command:{type:'narrative_question'}});expect(c.sceneStep).toBe(0);
 });
 it('classifies ordinary story questions and never mutates campaign state',async()=>{
  const {executeCommand}=await import('./command-engine');
  const result=await selectCommand('What might explain the bell ringing?',c,c.activeId,true,false);
  expect(result.command.type).toBe('narrative_question');
  const execution=executeCommand(c,result.command,'What might explain the bell ringing?');
  expect(execution.campaign).toBe(c);expect(execution.reply).toMatch(/may|might|not confirmed/i);
 });
 it('accepts a model narrative answer as read-only prose',async()=>{
  const {executeCommand}=await import('./command-engine');
  const fetcher=vi.fn(async()=>json({proposal:{action:'narrative_question',answer:'The bell may be tied to the chapel ward.'}}));
  const selected=await selectCommand('What might explain the bell ringing?',c,c.activeId,true,true,fetcher);
  expect(selected.source).toBe('model');
  const resolved=executeCommand(c,selected.command);
  expect(resolved.campaign).toBe(c);expect(resolved.reply).toContain('may be tied');
 });
});
