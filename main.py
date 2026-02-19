"""
Luna 后端服务
FastAPI 实现，支持 SSE 流式响应和工具调用
"""
import sys
import os

if sys.platform == 'win32':
    os.system('chcp 65001 >nul 2>&1')
    getattr(sys.stdout, 'reconfigure', lambda **kw: None)(encoding='utf-8')
    getattr(sys.stderr, 'reconfigure', lambda **kw: None)(encoding='utf-8')
    os.environ['PYTHONIOENCODING'] = 'utf-8'

import json
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import asyncio
from pathlib import Path

from app.config import config, soul_prompt, get_api_key, get_config, update_model
from app.tools import (
    generate_image,
    web_search,
    save_memory,
    query_memory,
    delete_memory
)
from app.tool_prompt import TOOL_PROMPT, parse_tool_calls, build_tool_response_prompt

# 项目根目录
BASE_DIR = Path(__file__).parent

app = FastAPI(title="Luna API", version="1.0.0")

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件目录
app.mount("/css", StaticFiles(directory=BASE_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=BASE_DIR / "js"), name="js")
app.mount("/data", StaticFiles(directory=BASE_DIR / "data"), name="data")


# 工具定义
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "generate_image",
            "description": "生成图片并发送给用户。当需要用图片表达情感、美化对话氛围时使用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "图片描述，使用英文"
                    },
                    "style": {
                        "type": "string",
                        "description": "风格：warm, romantic, cute, peaceful",
                        "enum": ["warm", "romantic", "cute", "peaceful"]
                    }
                },
                "required": ["prompt"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "搜索网络获取实时信息。当用户询问天气、新闻、实时数据时使用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "save_memory",
            "description": "保存用户的重要信息到记忆库。当用户分享喜好、生日、重要事件时使用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {
                        "type": "string",
                        "description": "记忆键名，如 'favorite_food', 'birthday'"
                    },
                    "value": {
                        "type": "string",
                        "description": "记忆内容"
                    },
                    "category": {
                        "type": "string",
                        "description": "分类：preference, event, emotion, other",
                        "enum": ["preference", "event", "emotion", "other"]
                    }
                },
                "required": ["key", "value"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "query_memory",
            "description": "查询记忆库中的用户信息。当需要回忆用户喜好、历史事件时使用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {
                        "type": "string",
                        "description": "要查询的记忆键名，留空则返回所有记忆"
                    },
                    "category": {
                        "type": "string",
                        "description": "按分类筛选"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_memory",
            "description": "删除记忆库中的信息。当用户要求忘记某事时使用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {
                        "type": "string",
                        "description": "要删除的记忆键名"
                    }
                },
                "required": ["key"]
            }
        }
    }
]


# 请求模型
class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[Message]


class SettingsRequest(BaseModel):
    settings: Dict[str, Any]


class UpdateModelRequest(BaseModel):
    text_model: Optional[str] = None
    image_model: Optional[str] = None


class UpdateGenerationParamsRequest(BaseModel):
    temperature: Optional[float] = None
    top_p: Optional[float] = None


# 工具执行器
async def execute_tool(tool_name: str, arguments: Any) -> Any:
    """执行工具调用"""
    # 如果 arguments 是字符串，解析为字典
    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments) if arguments else {}
        except json.JSONDecodeError:
            arguments = {}
    
    # 确保 arguments 是字典
    if not isinstance(arguments, dict):
        arguments = {}
    
    try:
        if tool_name == "generate_image":
            return await generate_image(**arguments)
        elif tool_name == "web_search":
            return await web_search(**arguments)
        elif tool_name == "save_memory":
            return await save_memory(**arguments)
        elif tool_name == "query_memory":
            return await query_memory(**arguments)
        elif tool_name == "delete_memory":
            return await delete_memory(**arguments)
        else:
            raise ValueError(f"Unknown tool: {tool_name}")
    except Exception as e:
        return {
            "success": False,
            "error": f"呜...执行任务时遇到问题了，稍后再试试吧~ ({str(e)})",
            "tool": tool_name,
            "arguments": arguments
        }


async def stream_chat(messages: List[dict]):
    """流式聊天生成 - 支持基于提示词的工具调用，实时过滤工具调用标签"""
    api_config = config["api"]
    base_url = api_config["base_url"]
    model = api_config["text_model"]
    temperature = api_config.get("temperature", 0.7)
    top_p = api_config.get("top_p", 0.9)
    api_key = get_api_key()

    full_system_prompt = f"{soul_prompt}\n\n{TOOL_PROMPT}"

    system_message = {"role": "system", "content": full_system_prompt}
    full_messages = [system_message] + messages

    memory_result = await query_memory()
    if memory_result["count"] > 0:
        memory_context = "这是我记得的关于用户的信息：\n"
        for mem in memory_result["memories"]:
            memory_context += f"- {mem['key']}: {mem['value']}\n"
        full_messages.insert(1, {"role": "system", "content": memory_context})

    headers = {
        "Content-Type": "application/json"
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": full_messages,
        "stream": True,
        "temperature": temperature,
        "top_p": top_p
    }

    full_response = ""
    
    buffer = ""
    in_tool_tag = False
    tool_tag_start = -1

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            async with client.stream(
                "POST",
                f"{base_url}/v1/chat/completions",
                headers=headers,
                json=payload
            ) as response:
                response.raise_for_status()
                
                async for line in response.aiter_lines():
                    if not line:
                        continue
                        
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            if buffer and not in_tool_tag:
                                yield f"data: {json.dumps({'type': 'text', 'content': buffer}, ensure_ascii=False)}\n\n"
                            
                            cleaned_text, tool_calls = parse_tool_calls(full_response)
                            
                            if tool_calls:
                                tool_results = []
                                for tc in tool_calls:
                                    tool_name_cn = {
                                        "generate_image": "图片生成",
                                        "web_search": "网络搜索",
                                        "save_memory": "保存记忆",
                                        "query_memory": "查询记忆",
                                        "delete_memory": "删除记忆"
                                    }.get(tc["name"], tc["name"])
                                    
                                    yield f"data: {json.dumps({'type': 'tool_call', 'name': tc['name'], 'tool_name': tool_name_cn}, ensure_ascii=False)}\n\n"
                                    
                                    result = await execute_tool(
                                        tc["name"],
                                        tc["arguments"]
                                    )
                                    tool_results.append({
                                        "tool_call_id": tc["name"],
                                        "role": "tool",
                                        "name": tc["name"],
                                        "content": json.dumps(result, ensure_ascii=False)
                                    })
                                
                                yield f"data: {json.dumps({'type': 'tool_results', 'results': tool_results}, ensure_ascii=False)}\n\n"
                                
                                async for chunk in continue_with_tool_results(full_messages, cleaned_text, tool_results):
                                    yield chunk
                            else:
                                yield "data: [DONE]\n\n"
                            return
                        
                        try:
                            chunk = json.loads(data)
                            choices = chunk.get("choices", [])
                            if not choices:
                                continue
                            delta = choices[0].get("delta", {})
                            
                            if "content" in delta and delta["content"]:
                                content = delta["content"]
                                full_response += content
                                
                                buffer += content
                                
                                while True:
                                    if in_tool_tag:
                                        end_idx = buffer.find("</tool>")
                                        if end_idx != -1:
                                            buffer = buffer[end_idx + 7:]
                                            in_tool_tag = False
                                        else:
                                            break
                                    else:
                                        tool_start = buffer.find("<tool ")
                                        if tool_start != -1:
                                            if tool_start > 0:
                                                safe_content = buffer[:tool_start]
                                                yield f"data: {json.dumps({'type': 'text', 'content': safe_content}, ensure_ascii=False)}\n\n"
                                            buffer = buffer[tool_start:]
                                            in_tool_tag = True
                                        else:
                                            last_tag = buffer.rfind("<")
                                            if last_tag != -1 and last_tag > len(buffer) - 15:
                                                safe_content = buffer[:last_tag]
                                                if safe_content:
                                                    yield f"data: {json.dumps({'type': 'text', 'content': safe_content}, ensure_ascii=False)}\n\n"
                                                buffer = buffer[last_tag:]
                                            else:
                                                if buffer:
                                                    yield f"data: {json.dumps({'type': 'text', 'content': buffer}, ensure_ascii=False)}\n\n"
                                                    buffer = ""
                                            break
                            
                        except json.JSONDecodeError:
                            continue
                            
        except httpx.HTTPStatusError as e:
            error_msg = "呜...处理结果时出问题了，稍后再试试吧~"
            if e.response.status_code == 500:
                error_msg = "呜...处理结果时出问题了，可能是服务繁忙，稍后再试试吧~"
            elif e.response.status_code == 401:
                error_msg = "呜...处理结果时出问题了，可能是API 密钥错误，检查配置吧~"
            elif e.response.status_code == 429:
                error_msg = "呜...请求太频繁啦，稍后再试~"
            yield f"data: {json.dumps({'type': 'text', 'content': error_msg}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            return
        except (httpx.RemoteProtocolError, httpx.ReadError, httpx.ConnectError) as e:
            yield f"data: {json.dumps({'type': 'text', 'content': '网络连接中断，请稍后重试~'}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            return


MAX_TOOL_ROUNDS = 5


async def continue_with_tool_results(full_messages: list, assistant_response: str, tool_results: list, round_count: int = 1):
    """工具调用后继续生成响应 - 支持多轮工具调用"""
    api_config = config["api"]
    base_url = api_config["base_url"]
    model = api_config["text_model"]
    temperature = api_config.get("temperature", 0.7)
    top_p = api_config.get("top_p", 0.9)
    api_key = get_api_key()

    filtered_results = []
    for tr in tool_results:
        result = json.loads(tr["content"])
        tool_name = tr["name"]
        
        if tool_name == "generate_image" and isinstance(result, dict):
            filtered_result = {k: v for k, v in result.items() if k not in ["image_url", "width", "height", "attempts"]}
            filtered_results.append({"name": tool_name, "result": filtered_result})
        else:
            filtered_results.append({"name": tool_name, "result": result})

    tool_result_prompt = build_tool_response_prompt(
        filtered_results,
        assistant_response
    )

    new_messages = full_messages + [
        {"role": "assistant", "content": assistant_response},
        {"role": "user", "content": tool_result_prompt}
    ]

    headers = {
        "Content-Type": "application/json"
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": new_messages,
        "stream": True,
        "temperature": temperature,
        "top_p": top_p
    }

    async with httpx.AsyncClient(timeout=180.0) as client:
        try:
            async with client.stream(
                "POST",
                f"{base_url}/v1/chat/completions",
                headers=headers,
                json=payload
            ) as response:
                response.raise_for_status()
                
                full_response = ""
                buffer = ""
                in_tool_tag = False
                
                async for line in response.aiter_lines():
                    if not line:
                        continue
                        
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            if buffer and not in_tool_tag:
                                yield f"data: {json.dumps({'type': 'text', 'content': buffer}, ensure_ascii=False)}\n\n"
                            
                            cleaned_text, new_tool_calls = parse_tool_calls(full_response)
                            
                            if new_tool_calls and round_count < MAX_TOOL_ROUNDS:
                                new_tool_results = []
                                for tc in new_tool_calls:
                                    tool_name_cn = {
                                        "generate_image": "图片生成",
                                        "web_search": "网络搜索",
                                        "save_memory": "保存记忆",
                                        "query_memory": "查询记忆",
                                        "delete_memory": "删除记忆"
                                    }.get(tc["name"], tc["name"])
                                    
                                    yield f"data: {json.dumps({'type': 'tool_call', 'name': tc['name'], 'tool_name': tool_name_cn}, ensure_ascii=False)}\n\n"
                                    
                                    result = await execute_tool(
                                        tc["name"],
                                        tc["arguments"]
                                    )
                                    new_tool_results.append({
                                        "tool_call_id": tc["name"],
                                        "role": "tool",
                                        "name": tc["name"],
                                        "content": json.dumps(result, ensure_ascii=False)
                                    })
                                
                                yield f"data: {json.dumps({'type': 'tool_results', 'results': new_tool_results}, ensure_ascii=False)}\n\n"
                                
                                async for chunk in continue_with_tool_results(
                                    new_messages, 
                                    assistant_response + "\n" + cleaned_text, 
                                    new_tool_results,
                                    round_count + 1
                                ):
                                    yield chunk
                            else:
                                yield "data: [DONE]\n\n"
                            return
                        
                        try:
                            chunk = json.loads(data)
                            choices = chunk.get("choices", [])
                            if not choices:
                                continue
                            delta = choices[0].get("delta", {})
                            
                            if "content" in delta and delta["content"]:
                                content = delta["content"]
                                full_response += content
                                buffer += content
                                
                                while True:
                                    if in_tool_tag:
                                        end_idx = buffer.find("</tool>")
                                        if end_idx != -1:
                                            buffer = buffer[end_idx + 7:]
                                            in_tool_tag = False
                                        else:
                                            break
                                    else:
                                        tool_start = buffer.find("<tool ")
                                        if tool_start != -1:
                                            if tool_start > 0:
                                                safe_content = buffer[:tool_start]
                                                yield f"data: {json.dumps({'type': 'text', 'content': safe_content}, ensure_ascii=False)}\n\n"
                                            buffer = buffer[tool_start:]
                                            in_tool_tag = True
                                        else:
                                            last_tag = buffer.rfind("<")
                                            if last_tag != -1 and last_tag > len(buffer) - 15:
                                                safe_content = buffer[:last_tag]
                                                if safe_content:
                                                    yield f"data: {json.dumps({'type': 'text', 'content': safe_content}, ensure_ascii=False)}\n\n"
                                                buffer = buffer[last_tag:]
                                            else:
                                                if buffer:
                                                    yield f"data: {json.dumps({'type': 'text', 'content': buffer}, ensure_ascii=False)}\n\n"
                                                    buffer = ""
                                                break
                                
                        except json.JSONDecodeError:
                            continue
                            
        except httpx.HTTPStatusError as e:
            error_msg = "处理结果时服务暂时不可用~"
            yield f"data: {json.dumps({'type': 'text', 'content': error_msg}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            return
        except httpx.ReadTimeout:
            yield f"data: {json.dumps({'type': 'text', 'content': '呜...处理结果时超时了，稍后再试试吧~'}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            return
        except (httpx.RemoteProtocolError, httpx.ReadError, httpx.ConnectError):
            yield f"data: {json.dumps({'type': 'text', 'content': '呜...处理结果时出问题了，检查网络吧~'}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            return


@app.post("/api/chat")
async def chat(request: ChatRequest):
    """聊天接口 - SSE 流式响应"""
    messages = [{"role": m.role, "content": m.content} for m in request.messages]
    
    return StreamingResponse(
        stream_chat(messages),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.get("/api/settings")
async def get_settings():
    """获取设置"""
    return {
        "success": True,
        "settings": {
            "api_key_set": bool(get_api_key())
        }
    }


@app.get("/api/models")
async def get_models():
    """获取可用的模型列表和当前选择的模型"""
    current_config = get_config()
    return {
        "success": True,
        "models": current_config.get("models", {}),
        "current": {
            "text_model": current_config["api"]["text_model"],
            "image_model": current_config["api"]["image_model"],
            "temperature": current_config["api"].get("temperature", 0.7),
            "top_p": current_config["api"].get("top_p", 0.9)
        }
    }


@app.post("/api/models")
async def set_models(request: UpdateModelRequest):
    """更新模型配置"""
    result = update_model(
        text_model=request.text_model,
        image_model=request.image_model
    )
    if result["success"]:
        return result
    raise HTTPException(status_code=500, detail=result.get("error", "更新失败"))


@app.post("/api/generation-params")
async def set_generation_params(request: UpdateGenerationParamsRequest):
    """更新生成参数"""
    result = update_generation_params(
        temperature=request.temperature,
        top_p=request.top_p
    )
    if result["success"]:
        return result
    raise HTTPException(status_code=500, detail=result.get("error", "更新失败"))


@app.get("/api/memories")
async def get_memories():
    """获取所有记忆（调试用）"""
    result = await query_memory()
    return result


class SummarizeRequest(BaseModel):
    messages: List[Message]


SUMMARY_PROMPT = """请将以下对话历史压缩成一个简洁的摘要，保留关键信息：
- 讨论的主要话题
- 用户提到的个人偏好、重要信息
- 已解决的问题或达成的结论
- 任何需要后续跟进的事项

请用中文，控制在200字以内。不要包含无关细节。

对话历史：
{conversation}

摘要："""


@app.post("/api/summarize")
async def summarize_conversation(request: SummarizeRequest):
    """生成对话摘要"""
    api_config = config["api"]
    base_url = api_config["base_url"]
    model = api_config["text_model"]
    api_key = get_api_key()
    
    conversation_text = ""
    for msg in request.messages:
        role = "用户" if msg.role == "user" else "Luna"
        conversation_text += f"{role}: {msg.content}\n\n"
    
    prompt = SUMMARY_PROMPT.format(conversation=conversation_text)
    
    headers = {
        "Content-Type": "application/json"
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "max_tokens": 300
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                f"{base_url}/v1/chat/completions",
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            result = response.json()
            summary = result["choices"][0]["message"]["content"]
            return {"success": True, "summary": summary}
        except Exception as e:
            return {"success": False, "error": str(e)}


@app.get("/")
async def serve_index():
    """提供主页"""
    return FileResponse(BASE_DIR / "index.html")


@app.get("/luna-avatar.jpg")
async def serve_avatar():
    """提供头像图片"""
    return FileResponse(BASE_DIR / "luna-avatar.jpg")


if __name__ == "__main__":
    import uvicorn
    server_config = config["server"]
    uvicorn.run(
        "main:app",
        host=server_config["host"],
        port=server_config["port"],
        reload=True
    )
