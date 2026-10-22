import { readFileSync } from 'node:fs';

const ACTIONS = new Set([
  'ask_npc','inspect','search','investigate','travel','check','attack','use_ability',
  'use_item','equip_item','unequip_item','drop_item','handoff_quest_item',
  'show_inventory','show_abilities','switch_character','help','clarify','roll','narrative_question','custom_ability','accuse'
]);
const FIELDS = new Set(['action','character','item','target','location','attribute','slot','die','question','answer','ability']);
const DEFAULT_URL = 'http://127.0.0.1:1234/v1';
const RULE_DATA = JSON.parse(readFileSync(new URL('../shared/rules-data.json', import.meta.url), 'utf8'));
export function getRulesSystemPrompt() {
  return RULE_DATA.categories.map(category => `${category.title}\n${category.rules.map(rule => `- [${rule.status.toUpperCase()}] ${rule.text}`).join('\n')}`).join('\n\n');
}
const PROPOSAL_SCHEMA = {
  type:'object',
  properties:{
    action:{type:'string',enum:[...ACTIONS]},
    character:{type:'string',maxLength:80}, item:{type:'string',maxLength:80}, ability:{type:'string',maxLength:80},
    target:{type:'string',maxLength:100}, location:{type:'string',maxLength:100},
    attribute:{type:'string',enum:['str','dex','con','int','wis','cha']},
    slot:{type:'string',enum:['weapon','armor','shield']},
    die:{type:'integer',enum:[4,6,8,10,12,20]},
    question:{type:'string',maxLength:100}, answer:{type:'string',maxLength:360}
  },
  required:['action'], additionalProperties:false
};

export function isLoopbackUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return ['http:','https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash && ['127.0.0.1','localhost','::1'].includes(host);
  } catch { return false; }
}

function safeContext(input) {
  const x = input && typeof input === 'object' ? input : {};
  const guardianHp = Number.isFinite(x.guardianHp) ? Math.max(0, x.guardianHp) : null;
  return {
    mode: x.mode === 'dev' ? 'dev' : 'story',
    adventure: x.adventure && typeof x.adventure === 'object' ? {
      id: typeof x.adventure.id === 'string' ? x.adventure.id.slice(0, 60) : '',
      title: typeof x.adventure.title === 'string' ? x.adventure.title.slice(0, 100) : '',
      premise: typeof x.adventure.premise === 'string' ? x.adventure.premise.slice(0, 400) : '',
      locations: Array.isArray(x.adventure.locations) ? x.adventure.locations.slice(0, 8).map(location => ({ id:String(location?.id??'').slice(0,60), name:String(location?.name??'').slice(0,80), description:String(location?.description??'').slice(0,200) })) : [],
      // Motives are scenario authoring data, not necessarily knowledge the party has earned.
      npcs: Array.isArray(x.adventure.npcs) ? x.adventure.npcs.slice(0, 8).map(npc => ({id:String(npc?.id??'').slice(0,60),name:String(npc?.name??'').slice(0,80),location:String(npc?.location??'').slice(0,60),role:String(npc?.role??'').slice(0,120)})) : []
    } : null,
    scene: typeof x.scene === 'string' ? x.scene.slice(0, 600) : '',
    location: typeof x.location === 'string' && /^[a-z0-9-]{1,60}$/i.test(x.location) ? x.location : 'inn',
    sceneStep: Number.isInteger(x.sceneStep) ? x.sceneStep : 0,
    guardianHp,
    activeCharacter: safeCharacter(x.activeCharacter),
    party: Array.isArray(x.party) ? x.party.slice(0, 4).map(safeCharacter) : [],
    objectives: Array.isArray(x.objectives) ? x.objectives.slice(0, 5).map(o => ({
      text: typeof o?.text === 'string' ? o.text.slice(0, 160) : '',
      done: Boolean(o?.done)
    })) : [],
    facts: Array.isArray(x.facts) ? x.facts.filter(f=>guardianHp!==0||!/stone guardian watches the chapel entrance/i.test(String(f))).slice(-12).map(f => String(f).slice(0, 180)) : [],
    evidence: Array.isArray(x.evidence) ? x.evidence.slice(-20).map(f=>String(f).slice(0,240)) : [],
    npcStatements: Array.isArray(x.npcStatements) ? x.npcStatements.slice(-12).map(f=>String(f).slice(0,240)) : [],
    theories: Array.isArray(x.theories) ? x.theories.slice(-12).map(f=>String(f).slice(0,200)) : [],
    unresolved: Array.isArray(x.unresolved) ? x.unresolved.slice(-12).map(f=>String(f).slice(0,180)) : [],
    recentEvents: Array.isArray(x.recentEvents) ? x.recentEvents.slice(-8).map(e => ({
      kind: ['story','action','roll','system'].includes(e?.kind) ? e.kind : 'story',
      text: typeof e?.text === 'string' ? e.text.slice(0, 240) : ''
    })) : [],
    availableActions: ['ask_npc','inspect','search','travel','check','attack','use_ability','use_item','equip_item','unequip_item','drop_item','handoff_quest_item','show_inventory','show_abilities','switch_character','help','roll','narrative_question','custom_ability','accuse','clarify']
  };
}

function safeCharacter(c) {
  if (!c || typeof c !== 'object') return null;
  return {
    id: String(c.id ?? '').slice(0, 80), name: String(c.name ?? '').slice(0, 40),
    className: String(c.className ?? '').slice(0, 20), hp: Number(c.hp) || 0, maxHp: Number(c.maxHp) || 0,
    inventory: Array.isArray(c.inventory) ? c.inventory.slice(0, 20).map(s => ({ id:String(s.id??'').slice(0,60), name:String(s.name??'').slice(0,60), quantity:Number(s.quantity)||0 })) : [],
    abilities: Array.isArray(c.abilities) ? c.abilities.slice(0, 8).map(a => typeof a==='string'?{name:a.slice(0,60)}:{
      name:String(a?.name??'').slice(0,60), description:String(a?.description??'').slice(0,140),
      uses:Number.isInteger(a?.uses)?a.uses:0, maxUses:Number.isInteger(a?.maxUses)?a.maxUses:0
    }) : []
  };
}

export function validateProposal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.some(key => !FIELDS.has(key)) || typeof value.action !== 'string' || !ACTIONS.has(value.action)) return null;
  for (const field of ['character','item','target','location','attribute','slot','question','ability']) {
    if (value[field] !== undefined && (typeof value[field] !== 'string' || value[field].length > 100)) return null;
  }
  if (value.answer !== undefined && (typeof value.answer !== 'string' || value.answer.length > 360)) return null;
  if (value.action === 'narrative_question' && (typeof value.answer !== 'string' || !value.answer.trim())) return null;
  if (value.action !== 'narrative_question' && value.answer !== undefined) return null;
  if (value.die !== undefined && ![4,6,8,10,12,20].includes(value.die)) return null;
  if (value.attribute !== undefined && !['str','dex','con','int','wis','cha'].includes(value.attribute.toLowerCase())) return null;
  if (value.slot !== undefined && !['weapon','armor','shield'].includes(value.slot.toLowerCase())) return null;
  return value;
}

function timedFetch(fetcher, url, options, timeoutMs, parentSignal) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once:true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return Promise.race([
    fetcher(url, { ...options, signal: controller.signal }),
    new Promise((_, reject) => {
      const onAbort=()=>reject(new Error(controller.signal.reason?.message || 'Local model request timed out.'));
      if(controller.signal.aborted)onAbort();
      else controller.signal.addEventListener('abort', onAbort, { once:true });
    })
  ]).finally(() => { clearTimeout(timer); parentSignal?.removeEventListener('abort', abortFromParent); });
}

export async function checkModel(config = {}, fetcher = fetch) {
  const baseUrl = config.baseUrl || DEFAULT_URL;
  if (!isLoopbackUrl(baseUrl)) return { available:false, model:null, reason:'LM Studio must use a loopback address.' };
  try {
    const response = await timedFetch(fetcher, `${baseUrl.replace(/\/$/,'')}/models`, { headers:{ Accept:'application/json' } }, config.statusTimeoutMs ?? 2200);
    if (!response.ok) return { available:false, model:null, reason:'LM Studio did not return a model list.' };
    const body = await response.json();
    const models = Array.isArray(body?.data) ? body.data : [];
    const requested = config.model?.trim();
    const model = requested ? models.find(m => m?.id === requested)?.id : models[0]?.id;
    return model ? { available:true, model, reason:null } : { available:false, model:null, reason:requested?'Configured model is not loaded in LM Studio.':'No model is loaded in LM Studio.' };
  } catch { return { available:false, model:null, reason:'LM Studio is offline or did not respond in time.' }; }
}

export async function interpretWithModel(text, context, config = {}, fetcher = fetch, signal) {
  if (typeof text !== 'string' || !text.trim() || text.length > 500) throw new Error('Action text is invalid.');
  const baseUrl = config.baseUrl || DEFAULT_URL;
  if (!isLoopbackUrl(baseUrl)) throw new Error('LM Studio must use a loopback address.');
  const state = await checkModel(config, fetcher);
  if (!state.available) throw new Error(state.reason);
  const modePrompt = context?.mode === 'dev' ? 'Dev/Test mode: classify commands, and if a rules question is asked, answer concisely from the supplied rules. Explain only engine-known calculations; never simulate them.' : 'Story mode: give concise, immersive context-aware answers, keeping statements, evidence, theories, and unresolved questions distinct.';
  const system = `Return exactly one compact JSON object using only required fields. No Markdown, chain-of-thought, analysis, or text outside JSON. Classify this request using currentState. ${modePrompt} Lore/hypothetical/follow-up questions: action narrative_question and concise answer (max 60 words), grounded in adventure, current scene, recentEvents, evidence, NPC statements, theories, unresolved questions, and objectives. NPC statements may be unreliable. Never promote theories to facts. If guardianHp is 0, never say the guardian blocks or guards the entrance. Do not claim an undiscovered solution. Match use_ability to an exact activeCharacter.abilities entry and include its name as ability; use custom_ability if unsupported. Never invent mechanics, resolve rolls, or claim state changed. If unclear, clarify.\n\n${getRulesSystemPrompt()}`;
  const user = JSON.stringify({ request:text, currentState:safeContext(context) });
  const response = await timedFetch(fetcher, `${baseUrl.replace(/\/$/,'')}/chat/completions`, {
    method:'POST', headers:{ 'Content-Type':'application/json', Accept:'application/json' },
    body:JSON.stringify({
      model:state.model, temperature:0, max_tokens:512,
      response_format:{type:'json_schema',json_schema:{name:'loremaster_action',strict:true,schema:PROPOSAL_SCHEMA}},
      messages:[{role:'system',content:system},{role:'user',content:user}]
    })
  }, config.requestTimeoutMs ?? 90000, signal);
  if (!response.ok) throw new Error(`LM Studio returned HTTP ${response.status}.`);
  const body = await response.json();
  const choice=body?.choices?.[0];
  if(choice?.finish_reason==='length')throw new Error('LM Studio response was truncated at the token limit.');
  const message=choice?.message;
  // Gemma variants may emit private reasoning separately. It is never command or user-facing content.
  const content = message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error(message?.reasoning_content?'LM Studio returned reasoning without a final response.':'LM Studio returned an empty response.');
  let parsed;
  try { parsed = JSON.parse(content); } catch { throw new Error('LM Studio returned malformed JSON.'); }
  const proposal = validateProposal(parsed);
  if (!proposal) throw new Error('LM Studio returned an invalid action proposal.');
  return proposal;
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 12000) {
  return new Promise((resolve,reject) => {
    let data='';
    req.on('data',chunk=>{data+=chunk;if(data.length>limit){reject(new Error('Request body is too large.'));req.destroy();}});
    req.on('end',()=>{try{resolve(JSON.parse(data));}catch{reject(new Error('Request body must be valid JSON.'));}});
    req.on('error',reject);
  });
}

export function createLocalAiMiddleware(config = {}, fetcher = fetch) {
  return function localAiMiddleware(req,res,next) {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/api/ai/status' && req.method === 'GET') {
      checkModel(config,fetcher).then(status=>send(res,200,status)).catch(()=>send(res,200,{available:false,model:null,reason:'Local AI is unavailable.'}));
      return;
    }
    if (url.pathname === '/api/ai/interpret' && req.method === 'POST') {
      readBody(req).then(async body=>{
      const controller=new AbortController();
      const abortOnDisconnect=()=>{if(!res.writableEnded)controller.abort(new Error('Browser disconnected.'));};
      req.on('aborted',abortOnDisconnect);
      res.on('close',abortOnDisconnect);
      try {
        const proposal=await interpretWithModel(body?.text,body?.context,config,fetcher,controller.signal);
        send(res,200,{proposal});
      } finally {
        req.off('aborted',abortOnDisconnect);res.off('close',abortOnDisconnect);
      }
      }).catch(error=>{if(!res.writableEnded&&!res.destroyed)send(res,503,{error:error instanceof Error?error.message:'Local model is unavailable.'});});
      return;
    }
    if (url.pathname.startsWith('/api/ai/')) { send(res,404,{error:'Unknown local AI endpoint.'});return; }
    next();
  };
}
