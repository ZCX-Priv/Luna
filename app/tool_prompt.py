"""
工具调用提示词模板 - 兼容 Pollinations API
通过提示词工程让 AI 以特定格式输出工具调用
"""

TOOL_PROMPT = """
你有以下工具可以使用。当需要使用工具时，请按照指定格式输出，系统会自动执行。

## 可用工具

### 1. generate_image - 生成图片
**用途**：生成图片并发送给用户。当需要用图片表达情感、美化对话氛围时使用。
**参数**：
- prompt: 图片描述（使用英文，必需）
- style: 风格（可选）：warm（温暖）、romantic（浪漫）、cute（可爱）、peaceful（宁静）
- aspect_ratio: 图片比例（可选）：1:1（正方形）、2:3（竖向）、3:2（横向）、3:4（竖向）、4:3（横向）、9:16（手机竖屏）、16:9（宽屏）。根据图片内容选择最合适的比例。

**调用格式**：
<tool name="generate_image">
{"prompt": "图片描述", "style": "warm", "aspect_ratio": "16:9"}
</tool>

### 2. web_search - 网络搜索
**用途**：搜索网络获取实时信息。当用户询问天气、新闻、实时数据时使用。
**参数**：
- query: 搜索关键词（必需）

**调用格式**：
<tool name="web_search">
{"query": "搜索关键词"}
</tool>

### 3. save_memory - 保存记忆
**用途**：保存用户的重要信息到记忆库。当用户分享喜好、生日、重要事件时使用。
**参数**：
- key: 记忆键名，如 'favorite_food', 'birthday'（必需）
- value: 记忆内容（必需）
- category: 分类（可选）：preference（偏好）、event（事件）、emotion（情感）、other（其他）

**调用格式**：
<tool name="save_memory">
{"key": "记忆键名", "value": "记忆内容", "category": "preference"}
</tool>

### 4. query_memory - 查询记忆
**用途**：查询记忆库中的用户信息。当需要回忆用户喜好、历史事件时使用。
**参数**：
- key: 要查询的记忆键名（可选，留空返回所有）
- category: 按分类筛选（可选）

**调用格式**：
<tool name="query_memory">
{"key": "记忆键名"}
</tool>

### 5. delete_memory - 删除记忆
**用途**：删除记忆库中的信息。当用户要求忘记某事时使用。
**参数**：
- key: 要删除的记忆键名（必需）

**调用格式**：
<tool name="delete_memory">
{"key": "记忆键名"}
</tool>

## 使用说明

1. **工具调用格式**：使用 XML 标签格式，name 属性为工具名，标签内容为 JSON 参数
2. **多个工具**：可以连续调用多个工具，每个工具调用占一个标签
3. **工具执行后**：系统会自动执行工具，并将结果返回给你，你可以基于结果继续回复用户
4. **不要告诉用户**：工具调用对用户不可见，你只需要自然地回复

## 示例对话

用户：我想记住我喜欢吃巧克力

你的回复：
好的，我记住了你喜欢吃巧克力！🍫

<tool name="save_memory">
{"key": "favorite_food", "value": "喜欢吃巧克力", "category": "preference"}
</tool>

---

用户：今天北京的天气怎么样？

你的回复：
让我帮你查一下今天的天气。

<tool name="web_search">
{"query": "北京今天天气"}
</tool>

（系统返回搜索结果后）

根据搜索结果，今天北京...

---

用户：帮我搜索一下最新的 AI 新闻，然后记住我最关注 AI 领域

你的回复：
好的，让我先搜索最新的 AI 新闻。

<tool name="web_search">
{"query": "最新 AI 人工智能新闻 2024"}
</tool>

（系统返回搜索结果后，AI 可以继续调用其他工具）

我已经帮你搜索到了最新的 AI 新闻！另外我会记住你对 AI 领域的关注。

<tool name="save_memory">
{"key": "interest_area", "value": "AI 人工智能领域", "category": "preference"}
</tool>
"""

import re
import json


def parse_tool_calls(text: str) -> tuple:
    """
    解析文本中的工具调用
    
    Returns:
        (清理后的文本, 工具调用列表)
    """
    pattern = r'<tool\s+name="(\w+)"\s*>\s*(.*?)\s*</tool>'
    
    tool_calls = []
    cleaned_text = text
    
    matches = list(re.finditer(pattern, text, re.DOTALL))
    
    for match in reversed(matches):
        tool_name = match.group(1)
        try:
            arguments = json.loads(match.group(2).strip())
            tool_calls.append({
                "name": tool_name,
                "arguments": arguments,
                "match": match
            })
            cleaned_text = cleaned_text[:match.start()] + cleaned_text[match.end():]
        except json.JSONDecodeError:
            continue
    
    cleaned_text = re.sub(r'\n{3,}', '\n\n', cleaned_text.strip())
    
    return cleaned_text, list(reversed(tool_calls))


def build_tool_response_prompt(tool_results: list, assistant_response: str = "") -> str:
    """
    构建工具执行结果的提示词
    """
    prompt = "[系统消息：工具执行结果]\n"
    for result in tool_results:
        prompt += f"\n工具：{result['name']}\n"
        prompt += f"结果：{json.dumps(result['result'], ensure_ascii=False)}\n"
    
    if assistant_response and assistant_response.strip():
        prompt += f"\n你刚才对用户说的话：{assistant_response}\n"
        prompt += "\n工具已执行完毕，请继续回复用户。你可以：\n"
        prompt += "1. 如果是图片生成，告诉用户图片已生成\n"
        prompt += "2. 如果是搜索，总结搜索结果\n"
        prompt += "3. 如果是记忆操作，确认已记住\n"
        prompt += "不要重复你刚才说的话，直接继续。"
    else:
        prompt += "\n工具已执行完毕，请基于以上结果回复用户。"
    
    return prompt
