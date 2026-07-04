# buddy-skill Examples

这些示例演示了 `buddy-skill` 的典型用法。运行前请先完成配置（`node ../index.js init`）。

## list-today-tasks.js

列出未来 7 天内到期的任务，按到期时间排序。

```bash
node examples/list-today-tasks.js
```

输出示例：
```
📅 接下来 7 天内有 3 个任务到期：

  🔴 [42] 完成 Q3 报告  —  2 天后 (2026-07-05)
  🟡 [38] 复盘 OKR  —  5 天后 (2026-07-08)
  🟢 [50] 阅读《人月神话》第 8 章  —  7 天后 (2026-07-10)
```

## organize-tasks.js

执行 plan-then-confirm 流程：先列计划，用户确认后再执行。

```bash
node examples/organize-tasks.js archive-completed
node examples/organize-tasks.js set-priority-by-due
node examples/organize-tasks.js clean-duplicates
```

**注意**：这是一个完整的"先列计划 → 用户确认 → 执行"流程演示，
是 buddy-skill 的安全机制核心。

## add-memo.js

把一段文字快速保存为备忘。

```bash
node examples/add-memo.js "AI 不会替代人，但用 AI 的人会替代不用 AI 的人"
```

## 在 AI 助手中使用

这些示例也可以直接被 Claude / GPT 加载。AI 会理解每个文件的意图，
并通过 `lib/client.js` 与 Buddy API 通信。AI 不会直接访问 API Key。
