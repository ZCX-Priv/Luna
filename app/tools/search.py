"""
联网搜索工具 - 支持多搜索引擎 (Bing, Baidu, Exa, Juejin, Zhihu)
"""
import httpx
import asyncio
import re
import json
from bs4 import BeautifulSoup, Tag
from urllib.parse import quote_plus, urlparse, urljoin
from typing import Optional, List, Dict, Any, Literal
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@dataclass
class SearchResult:
    title: str
    url: str
    description: str
    source: str
    engine: str
    content: str = ""


class BaseSearchEngine(ABC):
    @abstractmethod
    async def search(self, query: str, limit: int = 5) -> List[SearchResult]:
        pass


class BingSearchEngine(BaseSearchEngine):
    HEADERS = {
        "authority": "www.bing.com",
        "ect": "3g",
        "pragma": "no-cache",
        "sec-ch-ua-arch": '"x86"',
        "sec-ch-ua-bitness": '"64"',
        "sec-ch-ua-full-version": '"112.0.5615.50"',
        "sec-ch-ua-full-version-list": '"Chromium";v="112.0.5615.50", "Google Chrome";v="112.0.5615.50", "Not:A-Brand";v="99.0.0.0"',
        "sec-ch-ua-model": '""',
        "sec-ch-ua-platform-version": '"15.0.0"',
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Connection": "keep-alive"
    }

    def __init__(self, use_cn: bool = True):
        self.use_cn = use_cn
        self.base_url = "https://cn.bing.com/search" if use_cn else "https://www.bing.com/search"

    async def search(self, query: str, limit: int = 5) -> List[SearchResult]:
        all_results = []
        pn = 0

        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            while len(all_results) < limit:
                params = {"q": query, "first": 1 + pn * 10}
                
                try:
                    response = await client.get(self.base_url, params=params, headers=self.HEADERS)
                    response.raise_for_status()
                except Exception as e:
                    print(f"Bing search error: {e}")
                    break

                soup = BeautifulSoup(response.text, 'html.parser')
                results = []

                b_content = soup.find(id='b_content')
                if not b_content or not isinstance(b_content, Tag):
                    break

                b_results = b_content.find(id='b_results')
                if not b_results or not isinstance(b_results, Tag):
                    break

                for li in b_results.find_all('li', recursive=False):
                    title_elem = li.find('h2')
                    link_elem = li.find('a')
                    snippet_elem = li.find('p')

                    if title_elem and link_elem:
                        href = link_elem.get('href', '')
                        if href and href.startswith('http'):
                            source_elem = li.find(class_='b_tpcn')
                            results.append(SearchResult(
                                title=title_elem.get_text(strip=True),
                                url=href,
                                description=snippet_elem.get_text(strip=True) if snippet_elem else "",
                                source=source_elem.get_text(strip=True) if source_elem else "",
                                engine="bing"
                            ))

                all_results.extend(results)

                if len(results) == 0:
                    break

                pn += 1

        return all_results[:limit]


class BaiduSearchEngine(BaseSearchEngine):
    HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Connection': 'keep-alive'
    }

    async def search(self, query: str, limit: int = 5) -> List[SearchResult]:
        all_results = []
        pn = 0

        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            while len(all_results) < limit:
                params = {
                    "wd": query,
                    "pn": pn,
                    "ie": "utf-8",
                    "mod": "1",
                    "isbd": "1",
                    "oq": query,
                    "tn": "88093251_62_hao_pg",
                    "usm": "1",
                    "fenlei": "256",
                    "rsv_idx": "1",
                    "_ss": "1",
                    "f4s": "1",
                    "csor": "5",
                }

                try:
                    response = await client.get(
                        "https://www.baidu.com/s",
                        params=params,
                        headers=self.HEADERS
                    )
                    response.raise_for_status()
                except Exception as e:
                    print(f"Baidu search error: {e}")
                    break

                soup = BeautifulSoup(response.text, 'html.parser')
                results = []

                content_left = soup.find(id='content_left')
                if content_left and isinstance(content_left, Tag):
                    for element in content_left.find_all(recursive=False):
                        title_elem = element.find('h3')
                        link_elem = element.find('a')
                        
                        if title_elem and link_elem:
                            href = link_elem.get('href', '')
                            if href and href.startswith('http'):
                                snippet_elem = element.find(class_='c-font-normal')
                                if not snippet_elem:
                                    snippet_elem = element.find(class_='cos-row')
                                
                                source_elem = element.find(class_='cosc-source')
                                
                                description = ""
                                if snippet_elem:
                                    aria_label = snippet_elem.get('aria-label')
                                    description = aria_label if aria_label else snippet_elem.get_text(strip=True)

                                results.append(SearchResult(
                                    title=title_elem.get_text(strip=True),
                                    url=href,
                                    description=description,
                                    source=source_elem.get_text(strip=True) if source_elem else "",
                                    engine="baidu"
                                ))

                all_results.extend(results)

                if len(results) == 0:
                    break

                pn += 10

        return all_results[:limit]


class ExaSearchEngine(BaseSearchEngine):
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
        "Connection": "keep-alive",
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate, br",
        "sec-ch-ua": '"Chromium";v="112", "Google Chrome";v="112", "Not:A-Brand";v="99"',
        "content-type": "text/plain;charset=UTF-8",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "origin": "https://exa.ai",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
    }

    async def search(self, query: str, limit: int = 5) -> List[SearchResult]:
        data = {
            "numResults": limit,
            "query": query,
            "type": "auto",
            "useAutoprompt": True,
            "domainFilterType": "include",
            "text": True,
            "density": "compact",
            "resolvedSearchType": "neural",
            "moderation": True,
            "fastMode": False,
            "rerankerType": "default"
        }

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            try:
                response = await client.post(
                    "https://exa.ai/search/api/search-fast",
                    json=data,
                    headers=self.HEADERS
                )
                response.raise_for_status()
                
                api_results = response.json().get("results", [])
                
                if not api_results:
                    return []

                results = []
                for item in api_results:
                    url = item.get("url", "")
                    hostname = ""
                    try:
                        hostname = urlparse(url).hostname or ""
                    except:
                        pass

                    results.append(SearchResult(
                        title=item.get("title", "No title"),
                        url=url,
                        description=f"Author: {item.get('author', 'N/A')}. Published: {item.get('publishedDate', 'N/A')}",
                        source=hostname,
                        engine="exa"
                    ))

                return results[:limit]

            except Exception as e:
                print(f"Exa search error: {e}")
                return []


class JuejinSearchEngine(BaseSearchEngine):
    HEADERS = {
        'pragma': 'no-cache',
        'priority': 'u=1, i',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
        'content-type': 'application/json',
        'Accept': '*/*',
        'Host': 'api.juejin.cn',
        'Connection': 'keep-alive'
    }

    async def search(self, query: str, limit: int = 5) -> List[SearchResult]:
        all_results = []
        cursor = '0'

        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            while len(all_results) < limit:
                params = {
                    'aid': '2608',
                    'uuid': '7259393293459605051',
                    'spider': '0',
                    'query': query,
                    'id_type': '0',
                    'cursor': cursor,
                    'limit': min(20, limit - len(all_results)),
                    'search_type': '0',
                    'sort_type': '0',
                    'version': '1'
                }

                try:
                    response = await client.get(
                        'https://api.juejin.cn/search_api/v1/search',
                        params=params,
                        headers=self.HEADERS
                    )
                    response.raise_for_status()
                    
                    data = response.json()
                    
                    if data.get('err_no') != 0:
                        print(f"Juejin API error: {data.get('err_msg')}")
                        break

                    items = data.get('data', [])
                    if not items:
                        break

                    for item in items:
                        result_model = item.get('result_model', {})
                        article_info = result_model.get('article_info', {})
                        author_user_info = result_model.get('author_user_info', {})
                        category = result_model.get('category', {})
                        tags = result_model.get('tags', [])

                        title_highlight = item.get('title_highlight', '')
                        content_highlight = item.get('content_highlight', '')

                        clean_title = re.sub(r'</?em>', '', title_highlight)
                        clean_content = re.sub(r'</?em>', '', content_highlight)

                        tag_names = ', '.join([tag.get('tag_name', '') for tag in tags])
                        description = f"{clean_content} | 分类: {category.get('category_name', '')} | 标签: {tag_names} | 👍 {article_info.get('digg_count', 0)} | 👀 {article_info.get('view_count', 0)}"

                        all_results.append(SearchResult(
                            title=clean_title,
                            url=f"https://juejin.cn/post/{result_model.get('article_id', '')}",
                            description=description,
                            source=author_user_info.get('user_name', ''),
                            engine="juejin"
                        ))

                    if not data.get('has_more') or not data.get('cursor'):
                        break

                    cursor = data.get('cursor')

                except Exception as e:
                    print(f"Juejin search error: {e}")
                    break

        return all_results[:limit]


class ZhihuSearchEngine(BaseSearchEngine):
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
        "Connection": "keep-alive",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "cache-control": "max-age=0",
        "ect": "4g",
        "sec-ch-ua": '"Chromium";v="112", "Google Chrome";v="112", "Not:A-Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-full-version": '"112.0.5615.50"',
        "sec-ch-ua-arch": '"x86"',
        "sec-ch-ua-platform": '"Windows"',
        "sec-ch-ua-platform-version": '"15.0.0"',
        "sec-ch-ua-model": '""',
        "sec-ch-ua-bitness": '"64"',
        "sec-ch-ua-full-version-list": '"Chromium";v="112.0.5615.50", "Google Chrome";v="112.0.5615.50", "Not:A-Brand";v="99.0.0.0"',
        "upgrade-insecure-requests": "1",
        "sec-fetch-site": "none",
        "sec-fetch-mode": "navigate",
        "sec-fetch-user": "?1",
        "sec-fetch-dest": "document",
        "accept-language": "zh-CN,zh;q=0.9"
    }

    async def search(self, query: str, limit: int = 5) -> List[SearchResult]:
        site_query = f"site:zhuanlan.zhihu.com {query}"
        all_results = []
        pn = 0

        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            while len(all_results) < limit:
                params = {
                    "q": site_query,
                    "qs": "n",
                    "form": "QBRE",
                    "sp": "-1",
                    "lq": "0",
                    "pq": site_query,
                    "sc": "5-36",
                    "sk": "",
                    "first": 2 + pn * 10,
                }

                try:
                    response = await client.get(
                        "https://cn.bing.com/search",
                        params=params,
                        headers=self.HEADERS
                    )
                    response.raise_for_status()
                except Exception as e:
                    print(f"Zhihu search error: {e}")
                    break

                soup = BeautifulSoup(response.text, 'html.parser')
                results = []

                b_content = soup.find(id='b_content')
                if not b_content or not isinstance(b_content, Tag):
                    break

                b_results = b_content.find(id='b_results')
                if not b_results or not isinstance(b_results, Tag):
                    break

                for li in b_results.find_all('li', recursive=False):
                    title_elem = li.find('h2')
                    link_elem = li.find('a')
                    snippet_elem = li.find('p')

                    if title_elem and link_elem:
                        href = link_elem.get('href', '')
                        if href and 'zhuanlan.zhihu.com' in href:
                            results.append(SearchResult(
                                title=title_elem.get_text(strip=True),
                                url=href,
                                description=snippet_elem.get_text(strip=True) if snippet_elem else "",
                                source="zhuanlan.zhihu.com",
                                engine="zhihu"
                            ))

                all_results.extend(results)

                if len(results) == 0:
                    break

                pn += 1

        return all_results[:limit]


class ContentFetcher:
    @staticmethod
    async def fetch_url(url: str, timeout: float = 15.0, headers: dict = None) -> Optional[str]:
        if headers is None:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            }
        
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                return response.text
        except Exception as e:
            print(f"Fetch error for {url}: {e}")
            return None

    @staticmethod
    def extract_text_from_html(html: str, max_length: int = 1200) -> str:
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            for tag in soup(['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'noscript']):
                tag.decompose()
            
            main_content = soup.find('main') or soup.find('article') or soup.find('div', class_=re.compile(r'content|article|post|entry', re.I)) or soup.body
            
            if main_content and isinstance(main_content, Tag):
                text = main_content.get_text(separator=' ', strip=True)
            else:
                text = soup.get_text(separator=' ', strip=True)
            
            text = re.sub(r'\s+', ' ', text)
            
            if len(text) > max_length:
                text = text[:max_length] + "..."
            
            return text
        except Exception as e:
            return f"内容解析失败: {str(e)}"

    @staticmethod
    async def fetch_juejin_article(url: str) -> str:
        headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Connection': 'keep-alive',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'pragma': 'no-cache',
            'cache-control': 'no-cache',
            'upgrade-insecure-requests': '1',
            'sec-fetch-site': 'none',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-user': '?1',
            'sec-fetch-dest': 'document',
            'accept-language': 'zh-CN,zh;q=0.9',
            'priority': 'u=0, i'
        }

        html = await ContentFetcher.fetch_url(url, timeout=30.0, headers=headers)
        if not html:
            return ""

        soup = BeautifulSoup(html, 'html.parser')

        selectors = [
            '.markdown-body',
            '.article-content',
            '.content',
            '[data-v-md-editor-preview]',
            '.bytemd-preview',
            '.article-area .content',
            '.main-area .article-area',
            '.article-wrapper .content'
        ]

        for selector in selectors:
            element = soup.select_one(selector)
            if element:
                for tag in element.find_all(['script', 'style']):
                    tag.decompose()
                text = element.get_text(strip=True)
                if len(text) > 100:
                    return text[:1500] + "..." if len(text) > 1500 else text

        for tag in soup.find_all(['script', 'style', 'nav', 'header', 'footer']):
            tag.decompose()
        text = soup.body.get_text(strip=True) if soup.body else ""
        return text[:1500] + "..." if len(text) > 1500 else text

    @staticmethod
    async def fetch_zhihu_article(url: str) -> str:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'cache-control': 'max-age=0',
            'sec-ch-ua': '"Chromium";v="112", "Google Chrome";v="112", "Not:A-Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'upgrade-insecure-requests': '1',
            'sec-fetch-site': 'same-origin',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-dest': 'document',
            'referer': url,
            'accept-language': 'zh-CN,zh;q=0.9',
        }

        html = await ContentFetcher.fetch_url(url, timeout=15.0, headers=headers)
        if not html:
            return ""

        soup = BeautifulSoup(html, 'html.parser')

        content_element = soup.find(id='content')
        if content_element:
            for tag in content_element.find_all(['script', 'style']):
                tag.decompose()
            text = content_element.get_text(strip=True)
            return text[:1500] + "..." if len(text) > 1500 else text

        return ContentFetcher.extract_text_from_html(html, max_length=1500)

    @staticmethod
    async def fetch_content(url: str) -> str:
        parsed = urlparse(url)
        hostname = parsed.hostname or ""

        if 'juejin.cn' in hostname:
            return await ContentFetcher.fetch_juejin_article(url)
        elif 'zhihu.com' in hostname:
            return await ContentFetcher.fetch_zhihu_article(url)
        else:
            html = await ContentFetcher.fetch_url(url, timeout=10.0)
            if not html:
                return ""
            return ContentFetcher.extract_text_from_html(html, max_length=1500)


SearchEngineType = Literal["bing", "baidu", "exa", "juejin", "zhihu", "all"]


class WebSearcher:
    ENGINES = {
        "bing": BingSearchEngine,
        "baidu": BaiduSearchEngine,
        "exa": ExaSearchEngine,
        "juejin": JuejinSearchEngine,
        "zhihu": ZhihuSearchEngine,
    }

    def __init__(self, default_engine: SearchEngineType = "bing"):
        self.default_engine = default_engine
        self._engines: Dict[str, BaseSearchEngine] = {}

    def get_engine(self, engine_name: str) -> BaseSearchEngine:
        if engine_name not in self._engines:
            engine_class = self.ENGINES.get(engine_name)
            if engine_class:
                self._engines[engine_name] = engine_class()
        return self._engines.get(engine_name)

    async def search(
        self,
        query: str,
        engine: SearchEngineType = None,
        limit: int = 5,
        fetch_content: bool = True
    ) -> Dict[str, Any]:
        engine = engine or self.default_engine

        try:
            if engine == "all":
                results = await self._search_all(query, limit)
            else:
                search_engine = self.get_engine(engine)
                if not search_engine:
                    return {
                        "success": False,
                        "error": f"呜...我不认识这个搜索引擎呢，换个试试吧~",
                        "query": query
                    }
                results = await search_engine.search(query, limit)

            if not results:
                return {
                    "success": False,
                    "error": f"未找到关于 '{query}' 的相关结果",
                    "query": query
                }

            if fetch_content:
                results = await self._fetch_all_content(results)

            return {
                "success": True,
                "query": query,
                "engine": engine,
                "results": [
                    {
                        "title": r.title,
                        "url": r.url,
                        "description": r.description,
                        "source": r.source,
                        "engine": r.engine,
                        "content": r.content
                    }
                    for r in results
                ]
            }

        except httpx.TimeoutException:
            return {
                "success": False,
                "error": "呜...搜索等太久了，网络是不是不太好呀？稍后再试试吧~",
                "query": query
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"呜...搜索时遇到问题了，稍后再试试吧~ ({str(e)})",
                "query": query
            }

    async def _search_all(self, query: str, limit_per_engine: int = 2) -> List[SearchResult]:
        tasks = []
        for engine_name in self.ENGINES:
            engine = self.get_engine(engine_name)
            if engine:
                tasks.append(engine.search(query, limit_per_engine))

        results_list = await asyncio.gather(*tasks, return_exceptions=True)

        all_results = []
        for results in results_list:
            if isinstance(results, list):
                all_results.extend(results)

        return all_results

    async def _fetch_all_content(self, results: List[SearchResult]) -> List[SearchResult]:
        async def fetch_and_update(result: SearchResult) -> SearchResult:
            result.content = await ContentFetcher.fetch_content(result.url)
            return result

        tasks = [fetch_and_update(r) for r in results]
        return list(await asyncio.gather(*tasks))


_searcher_instance: Optional[WebSearcher] = None


def get_searcher(default_engine: SearchEngineType = "bing") -> WebSearcher:
    global _searcher_instance
    if _searcher_instance is None:
        _searcher_instance = WebSearcher(default_engine)
    return _searcher_instance


async def web_search(
    query: str,
    engine: SearchEngineType = "bing",
    limit: int = 5
) -> dict:
    """
    执行网络搜索并爬取内容
    
    Args:
        query: 搜索关键词
        engine: 搜索引擎 (bing, baidu, exa, juejin, zhihu, all)
        limit: 结果数量限制
    
    Returns:
        搜索结果
    """
    searcher = get_searcher()
    return await searcher.search(query, engine=engine, limit=limit, fetch_content=True)


async def bing_search(query: str, limit: int = 5) -> list:
    """执行 Bing 搜索"""
    engine = BingSearchEngine()
    results = await engine.search(query, limit)
    return [
        {
            "title": r.title,
            "url": r.url,
            "description": r.description,
            "source": r.source,
            "engine": r.engine
        }
        for r in results
    ]


async def baidu_search(query: str, limit: int = 5) -> list:
    """执行百度搜索"""
    engine = BaiduSearchEngine()
    results = await engine.search(query, limit)
    return [
        {
            "title": r.title,
            "url": r.url,
            "description": r.description,
            "source": r.source,
            "engine": r.engine
        }
        for r in results
    ]


async def exa_search(query: str, limit: int = 5) -> list:
    """执行 Exa 搜索"""
    engine = ExaSearchEngine()
    results = await engine.search(query, limit)
    return [
        {
            "title": r.title,
            "url": r.url,
            "description": r.description,
            "source": r.source,
            "engine": r.engine
        }
        for r in results
    ]


async def juejin_search(query: str, limit: int = 5) -> list:
    """执行掘金搜索"""
    engine = JuejinSearchEngine()
    results = await engine.search(query, limit)
    return [
        {
            "title": r.title,
            "url": r.url,
            "description": r.description,
            "source": r.source,
            "engine": r.engine
        }
        for r in results
    ]


async def zhihu_search(query: str, limit: int = 5) -> list:
    """执行知乎搜索"""
    engine = ZhihuSearchEngine()
    results = await engine.search(query, limit)
    return [
        {
            "title": r.title,
            "url": r.url,
            "description": r.description,
            "source": r.source,
            "engine": r.engine
        }
        for r in results
    ]


async def scrape_content(url: str) -> str:
    """爬取网页内容"""
    return await ContentFetcher.fetch_content(url)


if __name__ == "__main__":
    async def test():
        print("=== 测试 Bing 搜索 ===")
        result = await web_search("Python 教程", engine="bing", limit=3)
        print(json.dumps(result, ensure_ascii=False, indent=2))

        print("\n=== 测试掘金搜索 ===")
        result = await web_search("Vue3", engine="juejin", limit=3)
        print(json.dumps(result, ensure_ascii=False, indent=2))

        print("\n=== 测试知乎搜索 ===")
        result = await web_search("人工智能", engine="zhihu", limit=3)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    asyncio.run(test())
