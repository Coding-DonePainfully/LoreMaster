import { Campaign, CATALOG, ClassKey } from './game';

const KEY='loremaster.campaign.v2';
const classes:ClassKey[]=['Fighter','Barbarian','Rogue','Ranger','Wizard','Cleric','Paladin','Bard'];
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;

export function isCampaign(value:unknown):value is Campaign {
 if(!value||typeof value!=='object')return false;
 const x=value as Partial<Campaign>;
 return x.version===2&&typeof x.title==='string'&&typeof x.scene==='string'&&Number.isInteger(x.sceneStep)&&Number.isInteger(x.guardianHp)&&Array.isArray(x.characters)&&x.characters.length>0&&x.characters.length<=4&&Array.isArray(x.log)&&Array.isArray(x.objectives)&&Array.isArray(x.facts)&&x.characters.every(c=>c&&typeof c.id==='string'&&typeof c.name==='string'&&classes.includes(c.className)&&Array.isArray(c.inventory)&&c.inventory.every(s=>s&&CATALOG.some(i=>i.id===s.itemId)&&Number.isInteger(s.quantity)&&s.quantity>0)&&c.effects&&Number.isInteger(c.effects.nextCheckBonus)&&Number.isInteger(c.effects.nextAttackBonus)&&typeof c.hp==='number'&&typeof c.maxHp==='number'&&c.hp>=0&&c.hp<=c.maxHp&&Array.isArray(c.abilities)&&c.abilities.every(a=>a&&Number.isInteger(a.uses)&&Number.isInteger(a.maxUses)))&&x.characters.some(c=>c.id===x.activeId);
}
export function normalizeCampaign(campaign:Campaign):Campaign {let keptSeal=false;const characters=campaign.characters.map(c=>{const inventory=c.inventory.flatMap(s=>{if(s.itemId!=='moon-seal')return[s];if(keptSeal)return[];keptSeal=true;return[{...s,quantity:1}];});return inventory.length===c.inventory.length&&inventory.every((s,i)=>s===c.inventory[i])?c:{...c,inventory};});const found='The party found the moon seal beneath a loose flagstone.';const facts=keptSeal&&!campaign.facts.includes(found)?[...campaign.facts,found]:campaign.facts;return characters.every((c,i)=>c===campaign.characters[i])&&facts===campaign.facts?campaign:{...campaign,characters,facts};}
export function loadCampaign(storage:StorageLike=localStorage):Campaign|null {try{const raw=storage.getItem(KEY);if(!raw)return null;const parsed:unknown=JSON.parse(raw);return isCampaign(parsed)?normalizeCampaign(parsed):null;}catch{return null;}}
export function saveCampaign(campaign:Campaign,storage:StorageLike=localStorage):void {storage.setItem(KEY,JSON.stringify(campaign));}
export function clearCampaign(storage:StorageLike=localStorage):void {storage.removeItem(KEY);}
