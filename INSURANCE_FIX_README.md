# 保险系统修复说明

## 问题描述

保险系统存在显示错误：
- 数据库函数正确计算保险赔付 = `FLOOR(amount * 0.5)` (50%投注金额)
- 但是 API 和前端错误地使用 `insurance_cost` (保险费用，通常是5%-20%)
- 导致前端显示的净收益计算错误

## 修复内容

### 1. 数据库迁移
- 添加 `insurance_refund` 字段到 `prediction_entries` 表
- 修改 `resolve_prediction_atomic` 函数，存储实际的保险赔付金额

### 2. API 修复
- 修改 `/api/admin/predictions/[id]/payouts` API
- 返回正确的 `insuranceRefund` 字段 (实际赔付金额)
- 不再使用 `insuranceCost` 作为赔付金额

### 3. 前端修复
- 修改 `AdminPanel.tsx` 的赔付明细显示
- 使用 `insuranceRefund` 计算净收益
- 正确显示保险赔付金额

## 应用迁移

**重要**：需要在 Supabase SQL Editor 中运行以下迁移文件：

```
supabase/migrations/20260622_add_insurance_refund.sql
```

或者，如果你使用的是 Supabase CLI：

```bash
supabase db push
```

## 验证

修复后，保险赔付应该正确显示：

| 场景 | 投注金额 | 保险费用 | 保险赔付 | 净损失 |
|---|---|---|---|---|
| 之前（错误） | 100 | 14 | 14 (错误) | -86 |
| 之后（正确） | 100 | 14 | 50 (正确) | -50 |

## 影响范围

- ✅ 管理员后台 - 赔付明细
- ✅ 用户个人资料 - 历史记录
- ✅ coin_ledger - 保险赔付记录

## 注意事项

- 此修复只影响**新结算**的预测
- 已经结算的预测仍然显示旧的错误数据
- 如需修复历史数据，需要手动更新 `prediction_entries.insurance_refund` 字段
