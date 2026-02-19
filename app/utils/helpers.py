"""
辅助函数
"""
import json
import asyncio
from pathlib import Path
from typing import Any


async def read_json_file(file_path: Path) -> Any:
    """异步读取 JSON 文件"""
    def _read():
        if not file_path.exists():
            return []
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return await asyncio.get_event_loop().run_in_executor(None, _read)


async def write_json_file(file_path: Path, data: Any) -> None:
    """异步写入 JSON 文件"""
    def _write():
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    await asyncio.get_event_loop().run_in_executor(None, _write)


def format_tool_result(tool_name: str, result: Any) -> str:
    """格式化工具调用结果"""
    return json.dumps(result, ensure_ascii=False) if isinstance(result, dict) else str(result)
