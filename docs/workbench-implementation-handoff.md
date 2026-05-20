# Workbench Implementation Handoff

这份文档用于交接当前工作台相关问题。接手者可以按优先级逐项实现，不需要一次完成全部内容。

核心判断：工作台必须成为图片、图表和拼图编辑的真实状态源，而不是聊天旁边的预览附件。用户点哪里、改哪里、模型认为改了什么，都应该能在工作台里被定位、被验证、被导出。

## Product Principles

1. 工作台跟随会话

   每个对话应该有自己的 workspace state。切换会话时，工作台内容、选中对象、图表样式、图片锚点、拼图草稿都要切到对应 session，不应该跨会话残留。

2. 工作台是编辑主场，聊天是指令入口

   聊天区不应该塞满元素标签、参数、内部状态。用户能在工作台看见选中状态、属性面板、修改结果；聊天只展示必要的自然语言回复和最终产物。

3. 所有修改都必须可见、可追踪

   模型说“我改了”时，必须对应到实际 workspace state 或新 asset。不能只生成 action 却没有渲染效果。前端需要状态同步、应用确认和失败提示。

4. 对象选择要有明确边界

   用户可以指定“改哪张图、哪张图表、哪个元素”。当上下文里有多张图片时，模型不能猜。选中对象应该成为发送给模型的结构化上下文。

5. 图像、图表编辑和拼图导出都走同一个资产系统

   图片、图表、拼图画布都应该是 workspace asset。用户可以选 asset、组合 asset、导出 asset。

## P0: Required Architecture Fixes

### 1. Session-scoped workspace state

Problem:

- 工作台没有随着新的对话切换到对应对话的工作台。
- 当前现象是一直保留上一段对话的工作台内容。

Goal:

- 切换新对话时，工作台切到该对话自己的内容。

Implementation notes:

- 检查 `VisualWorkspaceContext` 和 `ChartSelectionContext` 当前 persistence key。
- 把 workspace state 绑定到 `sessionId` 或 `threadId`。
- active session 改变时重新 hydrate：
  - assets
  - anchors
  - selected asset
  - chart element styles
  - figure overrides
  - annotations
  - selection sets
- 不同 session 的 localStorage key 或后端 key 必须不同。
- 切换 session 时清空 transient selection，避免上一会话对象仍处于选中状态。

Acceptance criteria:

- A 会话添加图片，切到 B 会话时工作台为空或显示 B 的资产。
- 再切回 A，会恢复 A 的图片和编辑状态。
- 图表样式、选中元素、注释不会串会话。

### 2. Workbench layout controls

Problem:

- 工作台没有收回、缩放、上下滚动功能。

Goal:

- 工作台必须能收回、缩放、滚动，避免占据固定空间且无法浏览内容。

Implementation notes:

- 给工作台 panel 加：
  - collapse / expand
  - resize width，拖拽边缘
  - vertical scroll
  - optional fullscreen / focus mode
- panel 内部资产区和属性区分开滚动，避免属性面板把画布挤没。
- 保留用户布局偏好，可按 session 或全局保存。

Acceptance criteria:

- 小屏下能收起工作台。
- 工作台内容超过高度时能滚动。
- 用户可拖宽工作台查看大图或拼图。

### 3. Active image / asset edit target

Problem:

- 上下文里出现很多图后，模型不知道应该对哪一张图操作。
- 用户需要能指定图片进行修改。
- 多图片中选元素进行提问是未来方向，暂时可以先不做完整能力。

Goal:

- 用户可以明确选择某张图片或图表，然后说“修改这张”。

Implementation notes:

- 每个 workspace asset 卡片增加选中态和“设为编辑目标”动作。
- `ThreadComposer` 发送消息时注入结构化上下文：
  - activeAssetId
  - asset kind
  - asset title/name
  - source message id
  - asset URL 或可引用路径
- 如果用户没有选中目标，但上下文里有多张图，前端或模型应该请求澄清。
- 聊天里不要显示内部 asset 参数，只作为结构化上下文发送。

Acceptance criteria:

- 多张图片存在时，选中第二张再说“把背景调亮”，模型只处理第二张。
- 未选中且多图时，不应随机处理，应提示用户选择图片。

## P1: Editing Feedback And State Sync

### 4. Action application result

Problem:

- 现在有一种情况：让模型更改某个元素，它认为自己改了，但图上并没有更改。
- 反而让模型出新图时，才会看到修改后的那张。

Goal:

- 模型 action 必须落到实际画面或新 asset。

Implementation notes:

- 给 chart/image edit action 增加 apply result：
  - `applied`
  - `ignored`
  - `failed`
  - `reason`
- 前端应用 action 后检查 state 是否真的变化。
- 如果 action 是图表样式修改，必须更新 workspace asset 的 rendered state。
- 如果 action 是图片修改，应该生成新 image asset 或替换当前 asset 的 editable version。
- 聊天回复里不要只说“已修改”，而是以应用结果为准。

Acceptance criteria:

- 模型返回修改某元素颜色，图上对应元素立即变化。
- action 无法映射到元素时，显示“没有找到目标元素”，不要假装成功。
- 图片编辑后工作台里出现修改后的图片，并与原图关系明确。

### 5. Workspace state synchronizer

Problem:

- 工作台里标题等更改没有实时生效。
- 模型似乎不知道用户手动改过后的样式和状态。

Goal:

- 用户手动改标题、样式、背景后，模型知道当前状态。

Implementation notes:

- 建一个 workspace state summary builder。
- 每次发送消息时注入当前 active asset 的状态摘要：
  - title / caption
  - background / grid
  - selected elements
  - applied element styles
  - figure overrides
  - annotations
  - export settings
- 只发必要摘要，避免把巨大状态塞进聊天正文。
- 手动修改必须实时更新 context state。

Acceptance criteria:

- 用户手动把标题改成 A，再问模型“把标题改短一点”，模型知道当前标题是 A。
- 用户改过柱子颜色后，模型能基于当前颜色继续调整。

### 6. Realtime inspector updates

Problem:

- 工作台里比如标题更改没有实时生效。

Goal:

- 工作台属性面板改动后图表立即刷新。

Implementation notes:

- 检查 `FigureInspector` 的 action 是否正确进入 `figureOverrides`。
- 检查 `InteractiveChart` 是否使用了 `applyFigureInteractionOverrides` 后的 figure。
- 确保 active asset 注册的 config / overrides 没有旧缓存。
- 避免只改 inspector 本地 state，而没有改全局 workspace/chart selection state。

Acceptance criteria:

- 标题输入框每次修改，图表标题实时变化。
- caption、axis label、legend/grid visible 同步变化。
- 导出结果使用最新标题和样式。

## P1: Background And Grid Redesign

### 7. Unified canvas background

Problem:

- 背景元素现在实际改的是图片框以外的外围背景。
- 网格功能现在相当于没有实现。
- 背景和网格应该是一个功能区域。

Goal:

- 背景颜色作用于实际 plot / canvas / image composition background。
- 网格、线、空白属于背景样式的一部分。

Suggested data structure:

```ts
background: {
  color: string;
  opacity: number;
  pattern: "none" | "grid" | "lines";
  patternColor?: string;
  patternOpacity?: number;
  patternSize?: number;
}
```

Implementation notes:

- UI 上把“背景”和“网格”合并成“背景”区域。
- 支持：
  - 纯色
  - 空白
  - 网格
  - 横线/竖线
- 图表渲染、导出 PNG、拼图画布都使用同一背景配置。
- 不要只改外层 card 背景。

Acceptance criteria:

- 改背景色时，图表内部画布背景变色。
- 开网格时，导出图也有网格。
- 关闭网格时，画布干净无网格。

## P2: UI Boundary Cleanup

### 8. Do not expose internal labels and parameters in chat

Problem:

- 没必要每次添加元素或者模型输出图片时，把标签或者参数写在聊天框里。

Goal:

- 标签、参数、元素 id、内部 JSON 不要暴露在聊天消息里。

Implementation notes:

- 结构化上下文只进入发送 payload，不拼进用户可见文本。
- 如果当前代码把 `[Selected Chart Elements]` 拼到 message content，改成 metadata/context channel。
- 如果后端暂时只支持文本，至少在 UI optimistic bubble 里显示原始用户输入，不显示 enriched content。

Acceptance criteria:

- 用户发“把这根变细”，聊天里只显示这句话。
- 模型仍然能收到选中元素 id。

### 9. Remove redundant hover overlays from chat

Problem:

- 选定对象时悬浮窗口提示有点多余，还会遮挡用户看图片。
- 工作台显示状态就够了，没必要在聊天界面也显示。
- 功能场景边界没有做好。

Goal:

- 选中对象状态只在工作台显示，不遮挡聊天内容。

Implementation notes:

- 移除或隐藏聊天区里的 selected chips / hover overlay。
- 工作台中保留：
  - 当前选中 asset
  - 当前选中 element
  - 属性面板
- 如果需要提示，用工作台顶部 compact status，不要覆盖图片。

Acceptance criteria:

- 选中图表元素时，聊天区不出现遮挡性浮窗。
- 工作台能清楚显示当前选中对象。

## P2: Collage Feature

### 10. Collage / layout canvas MVP

Problem:

- 需要拼图功能。
- 推荐路线之一：提供一个界面，让用户通过操作我们提供的元素进行自定义排列。用户选定需要拼接的图片后导出。

Goal:

- 用户选择多张图片，自定义排列，导出一张拼图。

Recommended scope:

- 新建 collage asset。
- 从 workspace assets 中选择图片加入拼图。
- 画布中可拖拽、缩放、裁切或 fit / cover。
- 提供基础布局：
  - 1x2
  - 2x1
  - 2x2
  - freeform
- 支持背景颜色、网格、空白。
- 支持导出 PNG。

Suggested item model:

```ts
{
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  fit: "contain" | "cover";
}
```

Implementation notes:

- 建 `CollageWorkspace` 或 `CollageCanvas`。
- 用 HTML/CSS 或 canvas 都可以；如果要高质量导出，最终走 canvas render。
- 先不做复杂图层，不做 AI 自动布局。
- 拼图画布也应该使用统一背景配置。

Acceptance criteria:

- 用户选 2 张图，加入拼图，自由拖动调整位置。
- 导出 PNG 与画布一致。
- 拼图草稿跟随 session 保存。

## P3: Multi-image Element Questions

### 11. Reserve multi-anchor structure

Status:

- 暂时可以不做完整功能。

Future goal:

- 用户可以选中不同图片中的元素进行提问，例如“对比图 A 这里和图 B 这里有什么不同？”

Implementation notes:

- selected visual anchors 支持多个 `assetId`。
- anchor 里预留：
  - assetId
  - x / y 或 bbox
  - label
  - optional crop preview
- 当前只需确保：
  - 选择单张图作为 active edit target。
  - 多 anchor 不影响普通图片编辑。

## Suggested Implementation Order

1. 会话级工作台隔离。
2. 工作台收起、缩放、滚动。
3. 选中图片作为 active edit target，并把上下文结构化发送。
4. 修复聊天里泄露标签和参数的问题。
5. 建 action apply result，解决“模型说改了但图没变”。
6. 修复标题和样式状态实时同步。
7. 重做背景和网格为统一画布背景。
8. 做拼图 MVP。
9. 预留多图片元素选择结构。

## Definition Of Done

每做一个功能，都要满足三件事：

1. 用户看得见

   操作后工作台立即变化。

2. 模型知道

   发送下一条消息时，模型拿到的是最新 workspace state。

3. 导出一致

   导出的图片或图表和工作台看到的状态一致。

## Current Work Style To Preserve

- 先读现有代码和状态流，再动手。
- 优先沿用已有 context、asset、chart action、figure override 结构。
- 不把内部状态暴露给用户可见聊天内容。
- 所有编辑能力都要同时考虑运行时渲染、工作台预览、模型上下文和导出。
- 对窄改动做精准测试；对状态流、导出、跨会话这种高风险改动要补更完整的回归测试。
- 不用“重新出一张图”掩盖状态没有真正应用的问题。真正的目标是让工作台状态、模型 action 和画面一致。
