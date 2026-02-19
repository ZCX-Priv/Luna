"""
记忆管理工具
"""
from pathlib import Path
from app.config import config, BASE_DIR
from app.utils import read_json_file, write_json_file
from app.models import Memory
from typing import Optional, List


# 记忆存储路径（使用绝对路径）
MEMORY_PATH = BASE_DIR / config["memory"]["storage_path"]


async def save_memory(key: str, value: str, category: str = "other") -> dict:
    """
    保存记忆
    
    Args:
        key: 记忆键名
        value: 记忆内容
        category: 分类 (preference, event, emotion, other)
    
    Returns:
        操作结果
    """
    memories = await read_json_file(MEMORY_PATH)
    
    # 检查是否已存在相同 key
    for i, mem in enumerate(memories):
        if mem.get("key") == key:
            # 更新已有记忆
            memories[i] = Memory(key=key, value=value, category=category).model_dump()
            await write_json_file(MEMORY_PATH, memories)
            return {
                "success": True,
                "action": "updated",
                "key": key,
                "value": value
            }
    
    # 添加新记忆
    memory = Memory(key=key, value=value, category=category)
    memories.append(memory.model_dump())
    await write_json_file(MEMORY_PATH, memories)
    
    return {
        "success": True,
        "action": "created",
        "key": key,
        "value": value
    }


async def query_memory(key: Optional[str] = None, category: Optional[str] = None) -> dict:
    """
    查询记忆
    
    Args:
        key: 记忆键名（可选，留空返回所有）
        category: 分类筛选（可选）
    
    Returns:
        查询结果
    """
    memories = await read_json_file(MEMORY_PATH)
    
    # 按条件筛选
    results = memories
    
    if key:
        results = [m for m in results if m.get("key") == key]
    
    if category:
        results = [m for m in results if m.get("category") == category]
    
    return {
        "success": True,
        "count": len(results),
        "memories": results
    }


async def delete_memory(key: str) -> dict:
    """
    删除记忆
    
    Args:
        key: 要删除的记忆键名
    
    Returns:
        操作结果
    """
    memories = await read_json_file(MEMORY_PATH)
    
    # 查找并删除
    original_len = len(memories)
    memories = [m for m in memories if m.get("key") != key]
    
    if len(memories) == original_len:
        return {
            "success": False,
            "error": f"未找到键名为 '{key}' 的记忆"
        }
    
    await write_json_file(MEMORY_PATH, memories)
    
    return {
        "success": True,
        "action": "deleted",
        "key": key
    }
