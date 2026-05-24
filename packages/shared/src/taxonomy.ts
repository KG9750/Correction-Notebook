export const stageOptions = ["upper_primary", "junior_high", "senior_high"] as const;

export const gradeOptions = [
  "五年级",
  "六年级",
  "初一",
  "初二",
  "初三",
  "高一",
  "高二",
  "高三"
] as const;

export const knowledgeDomainsByStage = {
  upper_primary: [
    "数与运算",
    "分数小数百分数",
    "比和比例",
    "应用题数量关系",
    "几何图形与面积体积",
    "统计与可能性",
    "单位换算"
  ],
  junior_high: [
    "有理数与实数",
    "代数式与整式分式",
    "方程与不等式",
    "函数及图像",
    "几何基础",
    "三角形四边形圆",
    "相似与全等",
    "统计与概率"
  ],
  senior_high: [
    "集合与逻辑",
    "函数",
    "三角函数",
    "平面向量",
    "数列",
    "立体几何",
    "解析几何",
    "概率统计",
    "导数及应用",
    "复数"
  ]
} as const;

export const primaryErrorTypes = [
  "知识性错误",
  "方法性错误",
  "过程性错误",
  "审题性错误",
  "表达性错误",
  "习惯性错误"
] as const;

export const secondaryErrorTypesByPrimary = {
  知识性错误: ["概念混淆", "公式记错", "定理适用条件不清", "运算法则错误"],
  方法性错误: ["不会列方程", "不会找等量关系", "函数图像理解错误", "几何辅助线错误", "分类讨论遗漏"],
  过程性错误: ["计算错误", "符号错误", "移项变号错误", "约分通分错误", "单位换算错误", "抄错数"],
  审题性错误: ["漏条件", "看错求什么", "关键词误解", "图表信息提取错误"],
  表达性错误: ["未写单位", "答案不完整", "证明缺关键理由", "解集格式错误"],
  习惯性错误: ["没有验算", "步骤跳跃", "草稿不清", "时间不够"]
} as const;

export const defaultKnowledgePoints = ["一元一次方程", "等量关系"] as const;
