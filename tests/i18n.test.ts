import test from 'node:test';
import assert from 'node:assert/strict';
import { translate, isLanguage } from '../lib/i18n/translate.ts';
test('language selection accepts supported persisted values only', () => {
  assert.equal(isLanguage('zh-CN'), true); assert.equal(isLanguage('en'), true);
  for (const value of [null, undefined, '', 'fr', '__proto__']) assert.equal(isLanguage(value), false);
});
test('English source text and machine identifiers remain unchanged', () => {
  assert.equal(translate('en', 'Mission control'), 'Mission control');
  for (const text of ['event-analysis', '0xabcd1234', 'task-123', 'My custom agent', '任意用户输入', '__proto__', 'constructor']) assert.equal(translate('zh-CN', text), text);
});
test('Chinese translation covers navigation and status while preserving spacing', () => {
  assert.equal(translate('zh-CN', 'Mission control'), '任务总览');
  assert.equal(translate('zh-CN', 'Needs recovery'), '待恢复');
  assert.equal(translate('zh-CN', ' settled tasks'), ' 个已结算任务');
});
test('historical event interpolation preserves original values and does not mutate receipts', () => {
  const text = '2.40 testUSD paid exactly once. Ledger and receipt committed in one state update.';
  assert.equal(translate('zh-CN', text), '2.40 testUSD 仅支付一次，账本与凭证在同一次状态更新中提交。');
  assert.equal(translate('en', text), text);
  assert.equal(translate('zh-CN', 'Assigned to Atlas. Local fixture adapter event-analysis@1.0.0.'), '已分配给 Atlas，使用本地测试适配器 event-analysis@1.0.0。');
  assert.equal(translate('zh-CN', 'Results for “自定义任务”'), '“自定义任务”的搜索结果');
});
