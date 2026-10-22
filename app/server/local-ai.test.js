import { describe, expect, it, vi } from 'vitest';
import { checkModel, getRulesSystemPrompt, interpretWithModel, isLoopbackUrl, validateProposal } from './local-ai.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const context={scene:'At the inn.',sceneStep:0,activeCharacter:{id:'p1',name:'Ari',className:'Ranger'},party:[],objectives:[{text:'Ask Mara',done:false}],log:['old private history']};

describe('LM Studio local API adapter',()=>{
 it('builds the model rules prompt from the shared structured rules file',()=>{const prompt=getRulesSystemPrompt();expect(prompt).toContain('Combat & Initiative Order');expect(prompt).toContain('[PLANNED] Initiative rolls');expect(prompt).toContain('[IMPLEMENTED] Ability checks');});
 it('accepts only local loopback endpoints',()=>{expect(isLoopbackUrl('http://127.0.0.1:1234/v1')).toBe(true);expect(isLoopbackUrl('http://localhost:1234/v1')).toBe(true);expect(isLoopbackUrl('http://192.168.1.4:1234/v1')).toBe(false);expect(isLoopbackUrl('https://example.com/v1')).toBe(false);});
 it('checks loaded models and honors an explicitly configured model',async()=>{const fetcher=vi.fn(async()=>json({data:[{id:'small-local-model'}]}));expect(await checkModel({baseUrl:'http://127.0.0.1:1234/v1',model:'small-local-model'},fetcher)).toMatchObject({available:true,model:'small-local-model'});expect(await checkModel({baseUrl:'http://127.0.0.1:1234/v1',model:'missing'},fetcher)).toMatchObject({available:false,model:null});});
 it('mocks a valid OpenAI-compatible LM Studio response and sends only concise context',async()=>{
  const fetcher=vi.fn(async(url,options)=>String(url).endsWith('/models')?json({data:[{id:'test-model'}]}):json({choices:[{message:{content:'{"action":"ask_npc","target":"Mara"}',reasoning_content:'This is private reasoning, not the answer.'}}]}));
  const proposal=await interpretWithModel('Ask Mara about the bell',context,{baseUrl:'http://127.0.0.1:1234/v1',statusTimeoutMs:50,requestTimeoutMs:100},fetcher);
  expect(proposal).toEqual({action:'ask_npc',target:'Mara'});expect(fetcher).toHaveBeenCalledTimes(2);
  const request=JSON.parse(fetcher.mock.calls[1][1].body);const prompt=request.messages[1].content;expect(prompt).toContain('At the inn.');expect(prompt).not.toContain('old private history');expect(request.max_tokens).toBe(512);expect(request.response_format).toMatchObject({type:'json_schema',json_schema:{name:'loremaster_action',strict:true}});expect(request.response_format.json_schema.schema.required).toEqual(['action']);expect(request.messages[0].content).toMatch(/No Markdown, chain-of-thought, analysis/);
 });
 it('preserves the selected adventure location without leaking undiscovered suspect motives',async()=>{
  const fetcher=vi.fn(async(url)=>String(url).endsWith('/models')?json({data:[{id:'test'}]}):json({choices:[{message:{content:'{"action":"narrative_question","answer":"The cause remains unknown."}'}}]}));
  await interpretWithModel('What happened?',{...context,location:'deep-crypt',adventure:{id:'gilded-masquerade',title:'A Murder in the Gilded Masquerade',premise:'Find the killer.',locations:[{id:'gallery',name:'Gallery',description:'A locked room.'}],npcs:[{id:'orin',name:'Doctor Orin',location:'conservatory',role:'Physician',motive:'Secret motive: poison.'}]}},{baseUrl:'http://127.0.0.1:1234/v1'},fetcher);
  const submitted=JSON.parse(fetcher.mock.calls[1][1].body).messages[1].content;
  expect(submitted).toContain('deep-crypt');expect(submitted).toContain('A Murder in the Gilded Masquerade');expect(submitted).not.toContain('Secret motive');
 });
 it('rejects malformed JSON and schema violations from the model',async()=>{
  const malformed=vi.fn(async(url)=>String(url).endsWith('/models')?json({data:[{id:'test'}]}):json({choices:[{message:{content:'not json'}}]}));
  await expect(interpretWithModel('anything',context,{baseUrl:'http://127.0.0.1:1234/v1'},malformed)).rejects.toThrow(/malformed JSON/);
  expect(validateProposal({action:'attack',code:'bad'})).toBeNull();expect(validateProposal({action:'attack',die:7})).toBeNull();expect(validateProposal({action:'unknown'})).toBeNull();
 });
 it('times out a stalled local-model request',async()=>{
  let calls=0;const slow=vi.fn((url,options)=>{calls++;if(String(url).endsWith('/models'))return Promise.resolve(json({data:[{id:'test'}]}));return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));});
  await expect(interpretWithModel('ask mara',context,{baseUrl:'http://127.0.0.1:1234/v1',statusTimeoutMs:100,requestTimeoutMs:8},slow)).rejects.toThrow(/timed out|aborted/);expect(calls).toBe(2);
 });
 it('uses separate status and completion deadlines so a status poll cannot abort Gemma generation',async()=>{
  const fetcher=vi.fn(async(url,options)=>{
   if(String(url).endsWith('/models'))return json({data:[{id:'test'}]});
   await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,35);options.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('aborted'));},{once:true});});
   return json({choices:[{message:{content:'{"action":"narrative_question","answer":"The bell may answer the chapel ward."}'}}]});
  });
  const config={baseUrl:'http://127.0.0.1:1234/v1',statusTimeoutMs:8,requestTimeoutMs:100};
  const completion=interpretWithModel('What might explain the bell?',context,config,fetcher);
  const status=checkModel(config,fetcher);
  await expect(completion).resolves.toMatchObject({action:'narrative_question'});
  await expect(status).resolves.toMatchObject({available:true});
 });
 it('rejects empty assistant content rather than treating it as an action',async()=>{
  const fetcher=vi.fn(async(url)=>String(url).endsWith('/models')?json({data:[{id:'test'}]}):json({choices:[{message:{content:''},finish_reason:'stop'}]}));
  await expect(interpretWithModel('What might explain the bell?',context,{baseUrl:'http://127.0.0.1:1234/v1'},fetcher)).rejects.toThrow(/empty response/);
 });
 it('rejects output truncated at finish_reason length even when reasoning exists',async()=>{
  const fetcher=vi.fn(async(url)=>String(url).endsWith('/models')?json({data:[{id:'test'}]}):json({choices:[{finish_reason:'length',message:{content:'{"action":"narrative_',reasoning_content:'thinking...'}}]}));
  await expect(interpretWithModel('What might explain the bell?',context,{baseUrl:'http://127.0.0.1:1234/v1'},fetcher)).rejects.toThrow(/truncated/);
 });
 it('never treats separate reasoning_content as the final response',async()=>{
  const fetcher=vi.fn(async(url)=>String(url).endsWith('/models')?json({data:[{id:'test'}]}):json({choices:[{finish_reason:'stop',message:{content:'',reasoning_content:'{"action":"attack"}'}}]}));
  await expect(interpretWithModel('What might explain the bell?',context,{baseUrl:'http://127.0.0.1:1234/v1'},fetcher)).rejects.toThrow(/reasoning without a final response/);
 });
 it('propagates cancellation of the active completion request',async()=>{
  const fetcher=vi.fn((url,options)=>String(url).endsWith('/models')?Promise.resolve(json({data:[{id:'test'}]})):new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})));
  const controller=new AbortController();const pending=interpretWithModel('Ask Mara about the bell',context,{baseUrl:'http://127.0.0.1:1234/v1',requestTimeoutMs:1000},fetcher,controller.signal);
  await new Promise(resolve=>setTimeout(resolve,0));controller.abort();
  await expect(pending).rejects.toThrow(/timed out|aborted/);
 });
 it('validates narrative answers and includes no unbounded campaign history',()=>{
  expect(validateProposal({action:'narrative_question',answer:'It may be the ward.'})).toBeTruthy();
  expect(validateProposal({action:'narrative_question',answer:''})).toBeNull();
  expect(validateProposal({action:'narrative_question',answer:'x'.repeat(701)})).toBeNull();
 });
});
