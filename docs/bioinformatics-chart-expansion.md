# 生物学与生信绘图类型扩展建议

本文档用于规划 SciDaVinci 在现有 Bar、Line、Pie、Area、Box、Volcano 之外的生物学和生信常用图表扩展。目标不是一次性支持所有图，而是先覆盖最常见的数据解释场景，并明确每类图的功能边界、输入要求和交互流程。

## 总体原则

- 优先支持能够从用户上传表格中稳定推断字段含义、并能生成可交互 `chart-json` 的图类型。
- 模型不应在未确认的情况下为同一张表生成大量探索图；应先判断候选图，再让用户选择。
- 用户明确要求多图输出时，系统应允许为同一张表记录多个图表任务。
- 多个表格文件同时上传时，应按文件分别判断、分别确认、分别记录，最后统一执行作图。
- 聊天窗口中的选项只展示模型已经判断为适合当前表格的图类型，不展示完整图表库。
- 手动选择组件应支持用户绕过模型推荐，自行为每个表格选择一个或多个图类型。

## 优先级

| 优先级 | 图类型 | 建议阶段 | 原因 |
| --- | --- | --- | --- |
| P0 | Scatter、Violin、Heatmap、Correlation Heatmap、PCA Plot、Enrichment Bubble/Dot Plot、Venn、UpSet | 第一批新增 | 覆盖表达矩阵、组间分布、降维、富集、集合交集等最高频生信场景 |
| P1 | Stacked Bar、Histogram、Density、Enrichment Bar Plot、GSEA Enrichment Plot | 第二批新增 | 高频但可由部分现有图或静态图临时替代，适合在 P0 稳定后补齐 |
| P2 | Manhattan Plot、Forest Plot、Network、Sankey/Alluvial | 第三批新增 | 对数据结构、领域语义和交互渲染要求更高，适合单独设计 |

## P0 图类型功能边界

| 图类型 | 主要用途 | 输入数据要求 | 功能边界 |
| --- | --- | --- | --- |
| Scatter 散点图 | 展示两个连续变量关系，如表达量相关、QC 指标关系、两个样本/条件对比 | 至少 2 个数值列；可选分组列、标签列、大小列 | 支持二维散点、颜色分组、点标签、阈值线；不负责自动做相关性检验，除非数据和用户要求明确 |
| Violin 小提琴图 | 展示不同组的连续变量分布，如基因表达在不同细胞类型/处理组中的分布 | 1 个分组列 + 1 个数值列；可选子分组列 | 支持组间分布、叠加箱线/中位数、样本点抖动；不适合只有汇总五数统计的数据 |
| Heatmap 热图 | 展示矩阵型数值强度，如基因表达矩阵、通路活性矩阵 | 行标识列 + 多个数值列，或显式矩阵格式 | 支持表达/丰度矩阵、颜色梯度、行列标签、可选标准化；聚类树、复杂注释条可作为增强能力，不作为首版必须项 |
| Correlation Heatmap 相关性热图 | 展示样本、基因或指标之间的相关性 | 多个数值列或样本矩阵；需要指定相关对象是列还是行 | 支持 Pearson/Spearman 相关矩阵、对角线、相关系数颜色映射；不默认解释因果关系 |
| PCA Plot / 降维散点图 | 展示样本或细胞在主成分/降维空间中的分布 | 已有 PC1/PC2、UMAP1/UMAP2、tSNE1/tSNE2 列，或可由数值矩阵计算 PCA | 首版建议优先支持已有坐标列；后续支持前端/后端计算 PCA。PCA Plot 不等同于任意聚类分析 |
| Enrichment Bubble/Dot Plot 富集气泡图 | 展示 GO/KEGG/GSEA/Reactome 等富集结果的显著性和基因比例 | term/pathway 列 + p 值或 FDR 列 + gene ratio/count 列；可选 ontology/category | 支持 term 排序、点大小映射 count/ratio、颜色映射显著性；不负责从原始基因列表直接跑富集分析，除非接入分析工具 |
| Venn 图 | 展示 2-4 个集合之间的交集关系 | 每个集合的成员列表，或已计算的交集计数 | 首版建议限制 2-4 集合；超过 4 个集合应推荐 UpSet。Venn 不适合精确比较大量集合 |
| UpSet 图 | 展示多个集合的交集规模 | 多列布尔 membership、集合成员长表，或集合列表 | 适合 3 个及以上集合；支持交集柱状图和集合矩阵。首版可限制最大集合数和 Top N 交集 |

## P1 图类型功能边界

| 图类型 | 主要用途 | 输入数据要求 | 功能边界 |
| --- | --- | --- | --- |
| Stacked Bar 堆叠柱状图 | 展示组成比例或组成数量，如细胞类型组成、物种组成 | 1 个类别轴 + 多个组成数值列，或长表中的类别/组成/数值三列 | 支持绝对值和百分比堆叠；不适合比较太多组成类别，类别过多时应提示合并 Top N |
| Histogram 直方图 | 展示单个连续变量的频数分布 | 1 个数值列 | 支持 bin 数量、范围、分组叠加；不适合展示离散类别计数，类别计数应使用 Bar |
| Density 密度图 | 展示连续变量的平滑分布 | 1 个数值列；可选分组列 | 支持单组或多组密度曲线；样本量太小时不推荐，应提示改用 Histogram/Violin |
| Enrichment Bar Plot 富集柱状图 | 展示富集条目的 Top N 显著性或数量 | term/pathway 列 + p 值/FDR/count/ratio 列 | 适合 Top N 富集结果；当需要同时展示 gene ratio 和显著性时优先推荐 Bubble/Dot Plot |
| GSEA Enrichment Plot | 展示某个 gene set 的 running enrichment score | running ES、rank、hit index 等 GSEA 结果字段，或标准 GSEA 输出文件 | 首版建议支持已有 GSEA 结果表，不负责从表达矩阵和 phenotype 直接运行 GSEA |

## P2 图类型功能边界

| 图类型 | 主要用途 | 输入数据要求 | 功能边界 |
| --- | --- | --- | --- |
| Manhattan Plot | GWAS 或全基因组关联结果展示 | chromosome、position、p value；可选 SNP/gene 标签 | 支持按染色体分组、显著性阈值、Top hits 标注；不负责 GWAS 统计计算 |
| Forest Plot | Meta-analysis、OR/HR/RR 及置信区间展示 | label、effect size、lower CI、upper CI；可选 subgroup | 支持点估计和置信区间；不负责合并效应模型计算，除非输入已有统计结果 |
| Network 网络图 | 展示基因、蛋白、通路或调控关系网络 | edge list：source、target、weight/type；可选 node 属性表 | 首版应限制节点/边数量；不适合直接渲染超大网络，需先筛选 Top edges 或社群 |
| Sankey/Alluvial 桑基图 | 展示类别流向、状态转换、细胞命运或样本分层流动 | source、target、value，或多阶段类别列 | 支持多层流向和权重；不适合无权重、无阶段关系的普通分类统计 |

## 模型自主判断与确认流程

当用户上传一个或多个表格并提出“画图”“可视化”“看看能画什么”等宽泛需求时，推荐采用类似 agent plan mode 的确认流程。

### 单表格流程

1. 模型读取并检查表格结构，包括列名、数据类型、行数、缺失值、是否为矩阵格式、是否包含常见生信字段。
2. 模型生成候选图列表，只包含适合当前表格的图类型，并为每个候选图给出简短理由。
3. 聊天窗口弹出选择项，选择项只能来自模型刚刚提到的候选图。
4. 用户可选择一个或多个图。
5. 系统记录用户选择，包括表格文件、图类型、字段映射、必要参数和待确认状态。
6. 如果某个图需要额外字段确认，例如 PCA 使用哪两个坐标列、Heatmap 是否标准化，继续弹出下一轮选项或字段选择。
7. 所有图表任务均确认后，模型开始作图。

### 单表格多图需求

如果用户说“这个表格可以多出几张图”“同时画热图和 PCA”“给我几个推荐图”，系统不应只保留一个图表任务。

- 候选图选择应支持多选。
- 每个被选中的图都生成一条独立任务记录。
- 每条任务可以有自己的字段映射和参数。
- 如果多个图共享字段，例如 PCA Plot 和 Scatter 都使用 `PC1`/`PC2`，可以复用已确认字段，但仍要分别记录图类型。
- 作图前应展示一个简短确认摘要，例如“将基于 table_a.csv 生成 Heatmap、PCA Plot、Correlation Heatmap”。

### 多表格流程

当用户一次上传多个表格时，模型自主判断流程应按表格拆开处理。

1. 模型分别检查每个表格。
2. 对每个表格生成独立候选图列表。
3. 聊天窗口按表格逐个询问用户要生成哪些图。
4. 用户可以为不同表格选择不同图类型，也可以跳过某个表格。
5. 系统记录的任务必须包含 `dataset_id` 或文件名，避免后续作图时把字段映射到错误表格。
6. 所有表格的选择都确认完成后，再统一执行作图。

推荐的任务记录结构：

```json
{
  "plotPlanId": "plan_001",
  "status": "pending_confirmation",
  "datasets": [
    {
      "datasetId": "dataset_expression",
      "fileName": "expression_matrix.csv",
      "candidateCharts": ["Heatmap", "PCA Plot", "Correlation Heatmap"],
      "selectedCharts": [
        {
          "chartType": "Heatmap",
          "fieldMapping": {
            "rowId": "gene",
            "valueFields": ["sample_1", "sample_2", "sample_3"]
          },
          "parameters": {
            "scale": "row_z_score"
          },
          "status": "confirmed"
        }
      ]
    }
  ]
}
```

## 聊天窗口候选项交互

聊天窗口中的候选项应服务于模型自主推荐流程，而不是完整图表库入口。

- 候选项来源：只能来自模型对当前表格判断后输出的候选图。
- 候选项内容：图名称、推荐理由、需要的关键字段、是否需要二次确认。
- 选择模式：默认单选；当用户表达多图需求时切换为多选。
- 多轮确认：当选中的图需要额外参数时，继续弹出字段/参数选项。
- 状态记录：用户每次选择后写入当前 plot plan，而不是立即作图。
- 执行时机：所有必需字段和参数确认后再开始生成图表。

示例候选项：

```text
表格 expression_matrix.csv 适合生成以下图：
- Heatmap：多样本表达矩阵，适合查看基因表达模式
- PCA Plot：可基于样本表达矩阵计算主成分，用于查看样本分离
- Correlation Heatmap：适合检查样本间相关性
```

对应 UI 只显示 `Heatmap`、`PCA Plot`、`Correlation Heatmap` 三个选项，不显示 Scatter、Violin、Venn 等未被推荐的图。

## 用户手动选择作图组件

除模型自主推荐外，聊天窗口可以提供一个“选择作图”组件，让用户自行指定图类型。该组件适合用户已经知道自己要画什么，或希望跳过模型推荐步骤。

### 组件能力

- 展示已上传表格列表。
- 用户先选择一个或多个表格。
- 每个表格下展示可用图类型。
- 图类型卡片包含名称、简短说明和缩略图。
- 用户可以为同一个表格选择多个图。
- 用户可以为不同表格选择不同图。
- 对需要字段映射的图，组件应在选择后引导用户选择字段。
- 完成选择后生成统一 plot plan，交给模型检查并执行。

### 多表格组件行为

当存在多个表格时，组件应避免让用户在全局图类型列表里盲选。

推荐结构：

```text
选择作图

expression_matrix.csv
[ ] Heatmap            [缩略图]
[ ] PCA Plot           [缩略图]
[ ] Correlation Heatmap[缩略图]

deg_results.csv
[ ] Volcano            [缩略图]
[ ] Scatter            [缩略图]
[ ] Enrichment Bubble  [缩略图]

gene_sets.csv
[ ] Venn               [缩略图]
[ ] UpSet              [缩略图]
```

如果某个图类型对某个表格明显不适用，可以置灰并说明原因，例如“缺少数值矩阵列”或“集合数量超过 Venn 首版上限，建议 UpSet”。

### 缩略图要求

- 缩略图应展示图的结构，而不是装饰图。
- 缩略图不需要使用用户真实数据，但应能表达图类型差异。
- Heatmap、Correlation Heatmap 应使用不同缩略图，避免用户混淆：Heatmap 表示矩阵强度，Correlation Heatmap 表示对称相关矩阵。
- PCA Plot 和 Scatter 都是点图，但 PCA Plot 缩略图应显示 PC1/PC2 轴或分组椭圆。
- Venn 和 UpSet 应并列展示，帮助用户理解“少集合用 Venn，多集合用 UpSet”。

## 字段识别建议

模型和组件都应基于字段特征判断候选图。

| 字段特征 | 推荐图 |
| --- | --- |
| 两个数值列 + 可选标签/分组 | Scatter |
| 分组列 + 数值列 | Violin、Box、Bar |
| 行标识 + 多个样本数值列 | Heatmap、PCA Plot、Correlation Heatmap |
| PC1/PC2、UMAP1/UMAP2、tSNE1/tSNE2 | PCA Plot 或降维散点图 |
| term/pathway + p.adjust/FDR + count/geneRatio | Enrichment Bubble/Dot Plot、Enrichment Bar Plot |
| gene + log2FC + pvalue/padj | Volcano、Scatter |
| 多个集合成员列或 membership 布尔列 | Venn、UpSet |
| chromosome + position + pvalue | Manhattan Plot |
| effect + lower/upper CI | Forest Plot |
| source + target + value | Sankey/Alluvial、Network |
| source + target + weight/type | Network |

## 首版落地建议

第一阶段可以先实现 P0 中最容易接入交互式 `chart-json` 的图：Scatter、Violin、Heatmap、Correlation Heatmap、PCA Plot、Enrichment Bubble/Dot Plot、Venn、UpSet。

建议同时改造现有“宽泛作图请求”的行为：

- 从“模型直接选择一个最合适图并作图”改为“模型给出候选图并等待用户选择”。
- 保留明确指令的直通路径：如果用户说“画火山图”或“画 Heatmap”，模型可直接检查字段并进入必要参数确认。
- 增加 plot plan 状态，用于记录多表格、多图、多轮字段确认。
- 聊天候选项和手动组件都写入同一 plot plan，避免两套作图状态。
- 所有图确认后统一调用作图能力，确保多图输出顺序和用户选择一致。
