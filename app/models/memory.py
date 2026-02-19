"""
记忆数据模型
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class Memory(BaseModel):
    """记忆模型"""
    key: str
    value: str
    category: Optional[str] = "other"
    created_at: Optional[str] = None
    
    def __init__(self, **data):
        if "created_at" not in data or data["created_at"] is None:
            data["created_at"] = datetime.now().isoformat()
        super().__init__(**data)


class MemoryQuery(BaseModel):
    """记忆查询模型"""
    key: Optional[str] = None
    category: Optional[str] = None


class MemoryDelete(BaseModel):
    """记忆删除模型"""
    key: str
