"""
配置加载模块
"""
import json
import os
from pathlib import Path
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 项目根目录
BASE_DIR = Path(__file__).parent.parent

# 配置文件路径
CONFIG_PATH = BASE_DIR / "config.json"
SOUL_PATH = BASE_DIR / "soul.md"

# 全局配置实例
_config = None


def load_config() -> dict:
    """加载配置文件"""
    global _config
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        _config = json.load(f)
    return _config


def save_config(new_config: dict) -> bool:
    """保存配置文件"""
    global _config
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(new_config, f, indent=2, ensure_ascii=False)
        _config = new_config
        return True
    except Exception as e:
        print(f"保存配置失败: {e}")
        return False


def get_config() -> dict:
    """获取当前配置"""
    global _config
    if _config is None:
        _config = load_config()
    return _config


def update_model(text_model: str | None = None, image_model: str | None = None) -> dict:
    """更新模型配置"""
    config = get_config()
    if text_model:
        config["api"]["text_model"] = text_model
    if image_model:
        config["api"]["image_model"] = image_model
    if save_config(config):
        return {"success": True, "text_model": config["api"]["text_model"], "image_model": config["api"]["image_model"]}
    return {"success": False, "error": "保存配置失败"}


def update_generation_params(temperature: float | None = None, top_p: float | None = None) -> dict:
    """更新生成参数"""
    config = get_config()
    if temperature is not None:
        config["api"]["temperature"] = max(0.0, min(2.0, temperature))
    if top_p is not None:
        config["api"]["top_p"] = max(0.0, min(1.0, top_p))
    if save_config(config):
        return {
            "success": True,
            "temperature": config["api"]["temperature"],
            "top_p": config["api"]["top_p"]
        }
    return {"success": False, "error": "保存配置失败"}


def load_soul() -> str:
    """加载 Luna 人设"""
    with open(SOUL_PATH, "r", encoding="utf-8") as f:
        return f.read()


def get_api_key() -> str:
    """获取 API 密钥"""
    return os.getenv("POLLINATIONS_API_KEY", "")


# 配置实例
config = load_config()
soul_prompt = load_soul()
