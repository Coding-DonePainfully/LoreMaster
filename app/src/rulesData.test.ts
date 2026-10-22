import { describe, expect, it } from 'vitest';
import { getRulesSystemPrompt, RULE_CATEGORIES } from './rulesData';

describe('shared rules data',()=>{
 it('generates a rules prompt from the same categories shown in the UI',()=>{
  const prompt=getRulesSystemPrompt();
  for(const category of RULE_CATEGORIES){expect(prompt).toContain(category.title);for(const rule of category.rules)expect(prompt).toContain(rule.text);}
 });
 it('labels unsupported initiative and batch mechanics as planned',()=>{
  expect(RULE_CATEGORIES.flatMap(category=>category.rules).filter(rule=>/initiative rolls|batch resolution/i.test(rule.text)).every(rule=>rule.status==='planned')).toBe(true);
 });
});
