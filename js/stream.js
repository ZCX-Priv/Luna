/**
 * SSE 流式处理模块
 */

import { API_BASE } from './utils.js';

/**
 * 创建 SSE 连接并发送消息
 */
export async function streamChat(messages, callbacks) {
    const { onText, onToolResult, onError, onComplete } = callbacks;

    try {
        const response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ messages })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            // 处理缓冲区中的完整消息
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || ''; // 保留最后一个不完整的消息

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;

                const data = line.slice(6);
                if (data === '[DONE]') {
                    if (onComplete) onComplete();
                    return;
                }

                try {
                    const parsed = JSON.parse(data);

                    if (parsed.type === 'text' && onText) {
                        onText(parsed.content);
                    } else if (parsed.type === 'tool_results' && onToolResult) {
                        onToolResult(parsed.results);
                    }
                } catch (e) {
                    // 忽略解析错误
                    console.warn('Failed to parse SSE data:', data);
                }
            }
        }

        // 处理剩余的缓冲区
        if (buffer.startsWith('data: ')) {
            const data = buffer.slice(6);
            if (data === '[DONE]' && onComplete) {
                onComplete();
            }
        }

    } catch (error) {
        console.error('Stream error:', error);
        if (onError) onError(error);
    }
}

/**
 * 流式读取器类
 */
export class StreamReader {
    constructor() {
        this.controller = new AbortController();
        this.reader = null;
    }

    async connect(messages, callbacks) {
        const { onText, onToolResult, onError, onComplete } = callbacks;

        try {
            const response = await fetch(`${API_BASE}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ messages }),
                signal: this.controller.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            this.reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await this.reader.read();

                if (done) {
                    if (onComplete) onComplete();
                    break;
                }

                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;

                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        if (onComplete) onComplete();
                        return;
                    }

                    try {
                        const parsed = JSON.parse(data);

                        if (parsed.type === 'text' && onText) {
                            onText(parsed.content);
                        } else if (parsed.type === 'tool_call' && callbacks.onToolCall) {
                            callbacks.onToolCall(parsed.tool_name);
                        } else if (parsed.type === 'tool_results' && onToolResult) {
                            onToolResult(parsed.results);
                        }
                    } catch (e) {
                        console.warn('Failed to parse SSE data:', data);
                    }
                }
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Stream aborted');
                return;
            }
            console.error('Stream error:', error);
            if (onError) onError(error);
        }
    }

    abort() {
        this.controller.abort();
        if (this.reader) {
            this.reader.cancel();
        }
    }
}
