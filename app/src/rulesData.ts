import source from '../shared/rules-data.json';

export type RuleStatus='implemented'|'planned';
export type Rule={text:string;status:RuleStatus};
export type RuleCategory={id:string;title:string;rules:Rule[]};
export const RULE_CATEGORIES=source.categories as RuleCategory[];
export function getRulesSystemPrompt():string {
 return RULE_CATEGORIES.map(category=>`${category.title}\n${category.rules.map(rule=>`- [${rule.status.toUpperCase()}] ${rule.text}`).join('\n')}`).join('\n\n');
}
