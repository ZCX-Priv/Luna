"""
图片生成工具
"""
import httpx
from urllib.parse import quote
from app.config import config, get_api_key

ASPECT_RATIOS = {
    "1:1": (2048, 2048),
    "2:3": (1365, 2048),
    "3:2": (2048, 1365),
    "3:4": (1536, 2048),
    "4:3": (2048, 1536),
    "9:16": (1152, 2048),
    "16:9": (2048, 1152),
}

MAX_RETRIES = 3
REQUEST_TIMEOUT = 120.0


def calculate_dimensions(aspect_ratio: str, base_size: int = 2048) -> tuple[int, int]:
    """
    根据比例计算图片尺寸
    
    Args:
        aspect_ratio: 图片比例 (1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9)
        base_size: 基准尺寸，默认2048
    
    Returns:
        (width, height) 元组
    """
    if aspect_ratio in ASPECT_RATIOS:
        return ASPECT_RATIOS[aspect_ratio]
    return (base_size, base_size)


async def verify_image_url(image_url: str, timeout: float = REQUEST_TIMEOUT) -> tuple[bool, str]:
    """
    验证图片URL是否可访问
    
    Args:
        image_url: 图片URL
        timeout: 超时时间
    
    Returns:
        (是否成功, 错误信息或图片URL)
    """
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.get(image_url, follow_redirects=True)
            
            if response.status_code == 200:
                content_type = response.headers.get("content-type", "")
                if content_type.startswith("image/"):
                    return True, image_url
                else:
                    return False, f"呜...返回的不是图片呢，可能是服务出了点问题~"
            else:
                return False, f"呜...服务器返回了错误 ({response.status_code})，稍后再试试吧~"
                
        except httpx.TimeoutException:
            return False, "呜...图片生成等太久了，稍后再试试吧~"
        except httpx.ConnectError:
            return False, "呜...连不上图片生成服务呢，检查一下网络吧~"
        except httpx.ReadError:
            return False, "呜...读取图片数据时出问题了，稍后再试试吧~"
        except Exception as e:
            return False, f"呜...验证图片时遇到问题了 ({str(e)})"


async def generate_image(prompt: str = "a beautiful scene", style: str = "warm", aspect_ratio: str = "1:1") -> dict:
    """
    生成图片
    
    Args:
        prompt: 图片描述（英文）
        style: 风格
        aspect_ratio: 图片比例 (1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9)
    
    Returns:
        包含图片 URL 的字典
    """
    api_config = config["api"]
    base_url = api_config["base_url"]
    model = api_config["image_model"]
    
    width, height = calculate_dimensions(aspect_ratio)
    
    style_prompts = {
        "warm": "warm and cozy atmosphere, soft lighting, ",
        "romantic": "romantic and dreamy atmosphere, pastel colors, ",
        "cute": "cute and adorable style, kawaii, ",
        "peaceful": "peaceful and serene atmosphere, calming, "
    }
    
    style_prefix = style_prompts.get(style, "")
    full_prompt = f"{style_prefix}{prompt}"
    
    encoded_prompt = quote(full_prompt)
    
    image_url = (
        f"{base_url}/image/{encoded_prompt}"
        f"?model={model}"
        f"&width={width}"
        f"&height={height}"
    )
    
    api_key = get_api_key()
    if api_key:
        image_url += f"&key={api_key}"
    
    for attempt in range(MAX_RETRIES):
        success, result = await verify_image_url(image_url)
        
        if success:
            return {
                "success": True,
                "image_url": result,
                "prompt": prompt,
                "style": style,
                "aspect_ratio": aspect_ratio,
                "width": width,
                "height": height,
                "attempts": attempt + 1
            }
        
        if attempt < MAX_RETRIES - 1:
            import asyncio
            await asyncio.sleep(2)
    
    return {
        "success": False,
        "error": result,
        "image_url": image_url,
        "prompt": prompt,
        "style": style,
        "aspect_ratio": aspect_ratio,
        "width": width,
        "height": height,
        "attempts": MAX_RETRIES
    }
