<div align="center">

<a>
<img src="luna-avatar.jpg" alt="BiliTube" width="200" height="200" style="border:none;box-shadow:none;">
</a>

<h1 style="font-size: 3em; font-weight: bold; margin: 20px 0;">Luna</h1>

<p style="font-size: 1.2em; color: #666;">Luna 是一个温柔治愈的 AI 伴侣应用，采用前后端分离架构，基于 Pollinations API 提供智能对话服务。她拥有完整的人设背景、记忆系统和工具调用能力，能够像一位真正的朋友一样陪伴、倾听和理解你。</p>

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.7+-green.svg)
![HTML5](https://img.shields.io/badge/html5-orange.svg)
![CSS3](https://img.shields.io/badge/css3-blue.svg)
![JavaScript](https://img.shields.io/badge/javascript-yellow.svg)

[特性](#特性) · [快速开始](#快速开始) · [项目结构](#项目结构) · [技术栈](#技术栈) · [配置说明](#配置说明)

</div>


## 特性

- **温暖治愈的人设** - Luna 是一位 18 岁的江南女孩，性格温柔甜美，善于倾听和共情
- **流式对话响应** - 基于 SSE 的实时流式输出，打字机效果让对话更自然
- **智能工具调用** - 支持图片生成、网络搜索、记忆管理等工具
- **持久化记忆** - 自动记住用户的喜好、重要事件，让对话更贴心
- **多会话管理** - 支持创建多个独立对话，方便管理不同话题
- **多模型支持** - 支持多种文本和图像生成模型，自由切换
- **响应式设计** - 适配桌面和移动设备，随时随地陪伴
- **数学公式渲染** - 支持 MathJax 数学公式显示
- **代码高亮** - 支持多种编程语言的语法高亮

## 技术栈

### 前端
- 原生 JavaScript (ES6+ Modules)
- 原生 CSS3 (CSS Variables)
- IndexedDB - 本地数据持久化
- SSE (Server-Sent Events) - 流式响应
- MathJax - 数学公式渲染
- Highlight.js - 代码语法高亮

### 后端
- Python 3.11+
- FastAPI - Web 框架
- Uvicorn - ASGI 服务器
- HTTPX - 异步 HTTP 客户端
- Pydantic - 数据验证

### 外部服务
- Pollinations API - AI 对话和图片生成

## 项目结构

```
Luna/
├── index.html              # 主页面
├── main.py                 # FastAPI 后端入口
├── soul.md                 # Luna 人设定义文件
├── config.json             # 后端配置文件
├── requirements.txt        # Python 依赖
├── .env                    # 环境变量 (API 密钥)
├── .gitignore              # Git 忽略配置
├── PRD.md                  # 产品需求文档
├── luna-avatar.jpg         # Luna 头像
│
├── css/                    # 样式文件
│   ├── style.css           # 全局样式
│   ├── chat.css            # 聊天界面样式
│   ├── settings.css        # 设置页面样式
│   └── components.css      # 组件样式
│
├── js/                     # JavaScript 模块
│   ├── app.js              # 应用入口
│   ├── chat.js             # 聊天逻辑
│   ├── stream.js           # SSE 流式处理
│   ├── db.js               # IndexedDB 操作
│   ├── settings.js         # 设置页面逻辑
│   ├── modal.js            # 模态框组件
│   ├── parser.js           # 消息解析
│   ├── tokenUtils.js       # Token 计算工具
│   ├── utils.js            # 工具函数
│   └── notice.js           # 通知组件
│
├── app/                    # Python 后端模块
│   ├── config.py           # 配置加载
│   ├── tool_prompt.py      # 工具调用提示词
│   ├── tools/              # 工具模块
│   │   ├── __init__.py
│   │   ├── image.py        # 图片生成
│   │   ├── search.py       # 网络搜索
│   │   └── memory.py       # 记忆管理
│   ├── models/             # 数据模型
│   │   ├── __init__.py
│   │   └── memory.py       # 记忆模型
│   └── utils/              # 工具函数
│       ├── __init__.py
│       └── helpers.py      # 辅助函数
│
└── data/                   # 数据存储
    └── memories.json       # 记忆数据文件
```

## 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd Luna
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 配置环境变量

创建 `.env` 文件：

```env
POLLINATIONS_API_KEY=your_api_key_here
```

> 获取 API Key: [Pollinations AI](https://pollinations.ai/)

### 4. 启动服务

```bash
python main.py
```

服务将在 `http://127.0.0.1:8000` 启动。

### 5. 访问应用

打开浏览器访问 `http://127.0.0.1:8000`

## 配置说明

### config.json

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 8000
  },
  "api": {
    "base_url": "https://gen.pollinations.ai",
    "text_model": "kimi",
    "image_model": "zimage",
    "temperature": 0.7,
    "top_p": 0.9
  },
  "models": {
    "text_models": [...],
    "image_models": [...]
  }
}
```

### 支持的文本模型

- OpenAI GPT-5 Mini / Nano / 5.2
- Mistral Small 3.2
- Gemini 3 Flash / 2.5 Flash Lite / 3 Pro
- Claude Haiku 4.5 / Sonnet 4.5 / Opus 4.6
- DeepSeek V3.2
- Qwen3 Coder
- Moonshot Kimi K2.5
- 智谱 GLM-5
- MiniMax M2.1
- xAI Grok 4
- 等...

### 支持的图像模型

- Z-Image Turbo
- Flux Schnell
- GPT Image 1 Mini / 1.5
- Imagen 4
- FLUX.2 Klein 4B / 9B
- FLUX.1 Kontext
- Gemini 2.5 Flash Image / 3 Pro Image
- Seedream 4.0 / 4.5 Pro

## 工具调用

Luna 支持以下工具调用：

| 工具 | 功能 | 触发场景 |
|------|------|----------|
| `generate_image` | 生成图片 | 需要用图片表达情感时 |
| `web_search` | 网络搜索 | 查询实时信息（天气、新闻等） |
| `save_memory` | 保存记忆 | 用户分享重要信息时 |
| `query_memory` | 查询记忆 | 需要回忆用户信息时 |
| `delete_memory` | 删除记忆 | 用户要求忘记某事时 |

## API 接口

### 聊天接口

```http
POST /api/chat
Content-Type: application/json

{
  "messages": [
    {"role": "user", "content": "你好"}
  ]
}
```

返回：SSE 流式响应

### 获取模型列表

```http
GET /api/models
```

### 获取/更新设置

```http
GET  /api/settings
POST /api/settings
```

### 对话摘要

```http
POST /api/summarize
```

## 人设定制

编辑 `soul.md` 文件可以自定义 Luna 的人设，包括：

- 基本信息（姓名、年龄、性格等）
- 人物画像和外貌描述
- 人生故事和经历
- 兴趣爱好
- 说话风格
- 互动原则
- 记忆系统规则

## 开发计划

### V1.0 (当前)
- [x] 文字对话
- [x] 图片生成
- [x] 联网搜索
- [x] 记忆管理
- [x] 设置页面
- [x] 对话持久化
- [x] 多会话管理

### V2.0 (计划)
- [ ] 语音对话 (TTS + ASR)
- [ ] 人设切换
- [ ] 情绪分析
- [ ] 纪念日提醒

### V3.0+ (远期)
- [ ] 动态头像系统
- [ ] PWA 支持
- [ ] 多平台部署

## 浏览器支持

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 许可证

MIT License

## 致谢

- [Pollinations AI](https://pollinations.ai/) - 提供 AI API 服务
- [MathJax](https://www.mathjax.org/) - 数学公式渲染
- [Highlight.js](https://highlightjs.org/) - 代码语法高亮

---

*"每个人心里都有一束光，有时候只是需要有人帮忙找到它。"* —— Luna
