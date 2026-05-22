"""PRD template library.

Each template defines:
  * A short label and description used by the FE template picker.
  * A `sections` list - the canonical structure the AI is asked to fill.
  * A `tone` string - a one-line nudge fed into the system prompt so the
    same model produces noticeably different output for an enterprise
    delivery vs. a小程序 vs. an AI app.

Sections are stored as `(slug, title, hint)` tuples. The slug is the
machine-readable id used by the per-section regenerate API; the title is
the human-readable markdown heading; the hint is a one-line description
of what the section should contain (also fed to the model).

When you add a new template, also extend:
  * `app/models/prd.py::PRDTemplate`
  * `migrations/versions/0006_prd.py` (the enum)
  * `frontend/src/api/types.ts::PRDTemplate`
  * `frontend/src/pages/PRDListPage.tsx::TEMPLATE_META` (UI labels)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

from app.models.prd import PRDTemplate


# Each section: (slug, title, hint)
Section = Tuple[str, str, str]


@dataclass(frozen=True)
class TemplateSpec:
    template: PRDTemplate
    label: str
    description: str
    tone: str
    sections: List[Section]


# Common section building blocks - reused across templates so we have one
# place to tweak "what does '验收标准' actually mean" rather than 7.
S_OVERVIEW: Section = (
    "overview",
    "1. 产品概述",
    "用 1-2 段说明产品定位、解决什么问题、目标用户。",
)
S_BACKGROUND: Section = (
    "background",
    "2. 背景与目标",
    "为什么做？商业/业务目标，可以分点列出 3-5 条。给出可量化的成功指标（北极星指标 / KPI）。",
)
S_PERSONA: Section = (
    "persona",
    "3. 用户画像与场景",
    "列出核心用户角色（2-4 个）、典型场景与痛点。每个角色用 ## 子标题。",
)
S_FEATURES: Section = (
    "features",
    "4. 功能列表（需求池）",
    "把所有需求拆成原子条目，用表格列出：编号 | 模块 | 功能名 | 描述 | 优先级(P0/P1/P2) | 备注。",
)
S_USER_FLOW: Section = (
    "user_flow",
    "5. 用户主流程",
    "用有序列表描述端到端用户主流程；分支用缩进；可包含 mermaid 流程图代码块。",
)
S_INTERFACE: Section = (
    "interface",
    "6. 页面与原型说明",
    "按页面分块（## 子标题）。每页给出：用途、入口、核心元素、关键交互、跳转关系。",
)
S_RULES: Section = (
    "rules",
    "7. 业务规则",
    "列出所有业务规则、计算逻辑、限制（字段长度、频次、权限）。",
)
S_ACCEPTANCE: Section = (
    "acceptance",
    "8. 验收标准",
    "针对每个核心功能给出 Given-When-Then 格式或可执行的勾选项。覆盖正常路径与关键校验。",
)
S_EDGE: Section = (
    "edge_cases",
    "9. 边界条件",
    "列出输入/状态/数据规模/网络/权限等的边界场景与预期行为。",
)
S_EXCEPTION: Section = (
    "exception_flow",
    "10. 异常流程",
    "列出失败场景：网络断开、超时、并发、鉴权失败、依赖故障 - 每一项给出系统行为与用户提示文案。",
)
S_API: Section = (
    "api",
    "11. 接口说明（草稿）",
    "为关键服务给出 RESTful 接口草稿表：方法 | 路径 | 入参 | 出参 | 错误码。可写 JSON 示例。",
)
S_DATA: Section = (
    "data_model",
    "12. 数据模型",
    "列出主要实体与字段（表格：字段 | 类型 | 必填 | 说明），及实体关系简述。",
)
S_NON_FUNCTIONAL: Section = (
    "non_functional",
    "13. 非功能需求",
    "性能、安全、合规、可用性、可观测性、兼容性指标。给出量化目标。",
)
S_RISKS: Section = (
    "risks",
    "14. 风险与未决问题",
    "列出已知风险、依赖、待业务方确认的开放问题。",
)
S_MILESTONES: Section = (
    "milestones",
    "15. 里程碑与排期建议",
    "给出 3-5 个里程碑（M1/M2/...）的范围与建议工时。",
)


# ============================================================================
# Per-template specs. Section selection reflects "what really matters" for
# each form factor - e.g. 数字人项目 needs 内容/伦理 sections that a 后台系统
# does not, ToB delivery needs 交付物清单 而非 用户画像。
# ============================================================================

_TEMPLATES: Dict[PRDTemplate, TemplateSpec] = {
    PRDTemplate.software_project: TemplateSpec(
        template=PRDTemplate.software_project,
        label="软件项目 PRD",
        description="通用软件项目，适合 Web 系统、SaaS、桌面/服务端工具。",
        tone="按通用软件项目的口吻写，覆盖业务-功能-接口-数据全链条。",
        sections=[
            S_OVERVIEW,
            S_BACKGROUND,
            S_PERSONA,
            S_FEATURES,
            S_USER_FLOW,
            S_INTERFACE,
            S_RULES,
            S_ACCEPTANCE,
            S_EDGE,
            S_EXCEPTION,
            S_API,
            S_DATA,
            S_NON_FUNCTIONAL,
            S_RISKS,
            S_MILESTONES,
        ],
    ),
    PRDTemplate.mini_program: TemplateSpec(
        template=PRDTemplate.mini_program,
        label="小程序 PRD",
        description="微信/支付宝/抖音小程序。强调入口、用户授权、平台能力。",
        tone=(
            "按小程序的特性写：注意入口（扫码/分享/搜索/广告）、登录授权、"
            "subscribeMessage 订阅消息、平台审核合规点、tabBar 与页面层级。"
        ),
        sections=[
            S_OVERVIEW,
            S_BACKGROUND,
            S_PERSONA,
            (
                "entry",
                "4. 入口与分发",
                "列出小程序所有入口（扫码、分享、搜索、广告位、公众号关联），及每个入口的拉新意图与转化路径。",
            ),
            S_FEATURES,
            S_USER_FLOW,
            (
                "pages",
                "7. 页面结构与 tabBar",
                "用树状列表给出页面层级，标注 tabBar 页 vs 内嵌页；每页注明用途、入参、是否需要登录。",
            ),
            (
                "auth",
                "8. 登录与授权",
                "登录方式（手机号 / openid 静默 / 第三方），需要的 scope（用户信息、地理位置、订阅消息），以及未授权时的兜底体验。",
            ),
            S_RULES,
            S_ACCEPTANCE,
            S_EDGE,
            S_EXCEPTION,
            S_API,
            (
                "compliance",
                "13. 合规与审核要点",
                "列出可能触发审核驳回的点（资质、敏感内容、虚拟支付、诱导分享）及规避策略。",
            ),
            S_RISKS,
            S_MILESTONES,
        ],
    ),
    PRDTemplate.app: TemplateSpec(
        template=PRDTemplate.app,
        label="App PRD",
        description="iOS / Android 原生或跨端 App。",
        tone=(
            "按移动端 App 写：覆盖 iOS/Android 双端差异、推送、深链、权限弹窗、"
            "离线/弱网体验、灰度发布。原型说明里要区分关键页与悬浮态。"
        ),
        sections=[
            S_OVERVIEW,
            S_BACKGROUND,
            S_PERSONA,
            S_FEATURES,
            S_USER_FLOW,
            (
                "pages",
                "6. 页面与导航",
                "用树状列表给出 App 页面层级（Tab / 二级 / 三级）、底 Tab 设计、抽屉/Modal 等弹层。",
            ),
            (
                "platform",
                "7. 双端差异与权限",
                "列出 iOS 与 Android 的差异点；使用到的系统权限（相机、定位、通知、相册）及触发时机与降级方案。",
            ),
            (
                "push_link",
                "8. 推送与深链",
                "推送通道（APNs / FCM / 厂商通道）、推送类型（业务/营销/系统），universal link / app link / scheme 设计。",
            ),
            S_RULES,
            S_ACCEPTANCE,
            S_EDGE,
            S_EXCEPTION,
            S_API,
            S_DATA,
            (
                "non_functional",
                "13. 非功能需求（性能/包体/弱网）",
                "冷启动 P95、内存峰值、安装包体积上限、弱网体验、崩溃率上线门槛。",
            ),
            S_RISKS,
            S_MILESTONES,
        ],
    ),
    PRDTemplate.admin_system: TemplateSpec(
        template=PRDTemplate.admin_system,
        label="后台管理系统 PRD",
        description="内部运营/管理后台。强调权限、列表/详情、批量操作。",
        tone=(
            "按后台管理系统写：突出 RBAC 权限矩阵、菜单与路由、CRUD/批量/导入导出、"
            "审计日志与数据权限。少花哨、多严谨。"
        ),
        sections=[
            S_OVERVIEW,
            S_BACKGROUND,
            (
                "roles",
                "3. 角色与权限",
                "用矩阵表格给出角色 × 资源 × 操作（增/删/改/查/审批/导出）。说明数据权限边界（看哪些数据）。",
            ),
            (
                "menu",
                "4. 菜单与路由结构",
                "用树状列表给出后台菜单层级，标注每个菜单需要的最低角色。",
            ),
            S_FEATURES,
            (
                "list_detail",
                "6. 关键列表/详情设计",
                "为每个核心模块描述：列表查询条件、列字段、批量操作、详情页结构、关联实体。",
            ),
            (
                "io",
                "7. 导入导出与批处理",
                "支持的导入模板、字段映射、错误处理；导出格式（CSV/Excel）；后台批处理任务的入口与进度展示。",
            ),
            S_RULES,
            S_ACCEPTANCE,
            S_EDGE,
            S_EXCEPTION,
            S_API,
            S_DATA,
            (
                "audit",
                "13. 审计日志与可观测性",
                "哪些操作进审计日志、保留多久、谁可查看；关键告警/监控指标。",
            ),
            S_RISKS,
            S_MILESTONES,
        ],
    ),
    PRDTemplate.ai_app: TemplateSpec(
        template=PRDTemplate.ai_app,
        label="AI 应用 PRD",
        description="AI 驱动的应用：Copilot、对话机器人、生成工具等。",
        tone=(
            "按 AI 应用写：明确模型选型、Prompt/Agent 编排、上下文与 RAG、"
            "评估指标（命中率/幻觉率/响应时间）、成本与限流、内容安全。"
            "技术栈细节比纯业务系统要更具体。"
        ),
        sections=[
            S_OVERVIEW,
            S_BACKGROUND,
            S_PERSONA,
            (
                "core_capabilities",
                "4. 核心 AI 能力",
                "列出每个 AI 能力：输入、输出、模型/Agent 编排策略、是否走 RAG、是否需要 function-calling/工具。",
            ),
            (
                "prompt_design",
                "5. 提示词与上下文设计",
                "关键 prompt 的骨架、变量、few-shot 示例策略；如何注入用户上下文与历史；如何裁剪超长输入。",
            ),
            S_FEATURES,
            S_USER_FLOW,
            S_INTERFACE,
            (
                "evaluation",
                "9. 模型评测与指标",
                "评测集来源、自动+人工评分维度、上线前红线（命中率/幻觉率/拒答率/平均响应时长）。",
            ),
            (
                "safety",
                "10. 内容安全与合规",
                "敏感词/越狱防护、prompt-injection 防护、PII 处理、模型回复的审核策略与兜底文案。",
            ),
            (
                "cost_quota",
                "11. 成本、限流与降级",
                "调用成本估算（每次/每月）、限流策略（用户/IP/全局）、超额降级与排队提示。",
            ),
            S_API,
            S_NON_FUNCTIONAL,
            S_RISKS,
            S_MILESTONES,
        ],
    ),
    PRDTemplate.digital_human: TemplateSpec(
        template=PRDTemplate.digital_human,
        label="数字人项目 PRD",
        description="数字人/虚拟主播：直播带货、客服形象、品牌形象等。",
        tone=(
            "按数字人项目写：覆盖形象资产、TTS/驱动、场景/话术、内容审核、"
            "直播/短视频管线、商业化（带货/分发）。强调多模态与版权合规。"
        ),
        sections=[
            S_OVERVIEW,
            S_BACKGROUND,
            (
                "scenarios",
                "3. 应用场景",
                "列出 3-5 个落地场景（直播带货 / 品牌客服 / 短视频 / 知识讲解 / 政务窗口），各自的目标受众与差异化点。",
            ),
            (
                "avatar",
                "4. 形象与资产",
                "形象建模方式（2D 真人克隆 / 2D 卡通 / 3D 写实）、服装/配饰/动作库、版权与肖像授权清单。",
            ),
            (
                "voice_drive",
                "5. 声音与驱动",
                "TTS 选型与音色克隆（是否需要本人授权）、口型/表情/手势驱动方案、唇音同步精度要求。",
            ),
            (
                "scripts",
                "6. 脚本与话术",
                "话术库结构（开场/互动/转化/异常兜底）、变量占位符、A/B 版本管理。",
            ),
            (
                "live_pipeline",
                "7. 直播/视频生产管线",
                "推流端、信号源、直播间互动接入（评论/弹幕/连麦）、短视频成品的剪辑与导出流程。",
            ),
            S_FEATURES,
            S_USER_FLOW,
            S_INTERFACE,
            (
                "content_safety",
                "11. 内容安全与平台合规",
                "实时违规识别、敏感词、政治/广告法合规、平台直播规则；触发后的人工接管流程。",
            ),
            S_ACCEPTANCE,
            S_EDGE,
            S_EXCEPTION,
            S_NON_FUNCTIONAL,
            S_RISKS,
            S_MILESTONES,
        ],
    ),
    PRDTemplate.tob_delivery: TemplateSpec(
        template=PRDTemplate.tob_delivery,
        label="ToB 项目交付方案",
        description="给客户的 ToB 项目交付方案文档（含 SOW 要素）。",
        tone=(
            "按 ToB 项目交付方案写：客户视角，强调范围（SOW）、交付物清单、"
            "里程碑款项、双方责任、验收方式、运维与售后。语言更正式。"
        ),
        sections=[
            (
                "client_intro",
                "1. 客户与项目背景",
                "客户简介、业务现状、要解决的问题、本次合作的范围边界。",
            ),
            (
                "scope",
                "2. 项目范围（SOW）",
                "明确的 In-Scope 与 Out-of-Scope 列表，避免后期争议。",
            ),
            (
                "solution",
                "3. 总体解决方案",
                "整体技术/业务方案概述，含一张方案架构图（mermaid）。",
            ),
            S_FEATURES,
            (
                "interface_integration",
                "5. 系统集成与对接",
                "需要对接的客户系统清单、对接方式（API/MQ/文件）、客户方需要提供的资源（账号/接口文档/网络）。",
            ),
            (
                "deliverables",
                "6. 交付物清单",
                "交付物表格：编号 | 名称 | 形式（代码/文档/培训）| 数量 | 责任方 | 交付节点。",
            ),
            (
                "milestones",
                "7. 里程碑与款项",
                "里程碑表：M1/M2/M3...，每个里程碑包含范围、交付物、验收方式、款项比例。",
            ),
            (
                "responsibilities",
                "8. 双方职责",
                "甲方与乙方各自的职责分工表；客户方需要的人力配合与决策时效。",
            ),
            (
                "acceptance_process",
                "9. 验收流程",
                "验收阶段、验收标准（功能/性能/UAT）、验收周期、争议处理。",
            ),
            S_NON_FUNCTIONAL,
            (
                "warranty",
                "11. 上线后运维与售后",
                "保修期、SLA 等级、响应时长、付费工单与升级渠道。",
            ),
            S_RISKS,
            (
                "appendix",
                "13. 附录",
                "术语表、参考文档、引用规范。",
            ),
        ],
    ),
}


def list_templates() -> List[TemplateSpec]:
    """All built-in templates in display order."""
    return [_TEMPLATES[t] for t in PRDTemplate]


def get_template(template: PRDTemplate) -> TemplateSpec:
    return _TEMPLATES[template]


def section_titles(template: PRDTemplate) -> List[Tuple[str, str]]:
    """`(slug, title)` pairs for the chosen template."""
    return [(s[0], s[1]) for s in _TEMPLATES[template].sections]
