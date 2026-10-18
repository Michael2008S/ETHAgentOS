import chinese from './zh-CN.json' with { type: 'json' };
export type Language = 'zh-CN' | 'en';
export const LANGUAGE_KEY = 'agentos.language';
export const isLanguage = (value: unknown): value is Language => value === 'zh-CN' || value === 'en';
const dictionary: Record<string, string> = chinese;

// Interpolate historical English events at display time; never mutate stored data.
const patterns: [RegExp, (...parts: string[]) => string][] = [
  [/^Results for “(.*)”$/, query => `“${query}”的搜索结果`],
  [/^Download artifact for (.*)$/, title => `下载“${title}”的成果`],
  [/^(.*) reserved in escrow$/, n => `${n} 已预留至托管`],
  [/^(\d+) versioned skills available$/, n => `${n} 个版本化技能可用`],
  [/^(.*) testUSD settled$/, n => `${n} testUSD 已结算`],
  [/^(\d+) unauthorized executions blocked$/, n => `已拦截 ${n} 次越权执行`],
  [/^(\d+) services · 2 skill adapters$/, n => `${n} 个服务 · 2 个技能适配器`],
  [/^Assigned to (.+)\. Custom input adapter (.+)\.$/, (name, skill) => `已分配给 ${name}，使用自定义数据适配器 ${skill}。`],
  [/^Assigned to (.+)\. Local fixture adapter (.+)\.$/, (name, skill) => `已分配给 ${name}，使用本地测试适配器 ${skill}。`],
  [/^(.+) is allowed\. Budget and service quote are within policy\.$/, skill => `${skill} 已获授权，预算与服务报价符合策略。`],
  [/^(.+) testUSD locked against concurrent spending\.$/, amount => `已锁定 ${amount} testUSD，防止并发重复支出。`],
  [/^(.+) testUSD paid exactly once\. Ledger and receipt committed in one state update\.$/, amount => `${amount} testUSD 仅支付一次，账本与凭证在同一次状态更新中提交。`],
  [/^(.+) is outside the skill capability grant\. No payment was made\.$/, op => `${op} 超出该技能的授权范围，未发生付款。`],
  [/^Skill (.+) is outside the allowlist\.$/, skill => `技能 ${skill} 不在白名单中。`],
  [/^(.+) must be a positive amount in cents \(maximum (.+)\)\.$/, (label, max) => `${dictionary[label] || label}须为正整数分，最大值为 ${max}。`],
];
export function translate(language: Language, text: string): string {
  if (language === 'en' || !text.trim()) return text;
  const key = text.trim();
  let value = Object.hasOwn(dictionary, key) ? dictionary[key] : undefined;
  if (!value) for (const [pattern, render] of patterns) {
    const match = key.match(pattern);
    if (match) { value = render(...match.slice(1)); break; }
  }
  if (!value) return text;
  return text.slice(0, text.indexOf(key)) + value + text.slice(text.indexOf(key) + key.length);
}
