/**
 * Token 计算工具
 * 使用简单的估算方法：中文约 1.5 字符/token，英文约 4 字符/token
 */

const CHARS_PER_TOKEN_ZH = 1.5;
const CHARS_PER_TOKEN_EN = 4;

export function estimateTokens(text) {
    if (!text) return 0;
    
    let chineseCount = 0;
    let otherCount = 0;
    
    for (const char of text) {
        if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
            chineseCount++;
        } else {
            otherCount++;
        }
    }
    
    const chineseTokens = Math.ceil(chineseCount / CHARS_PER_TOKEN_ZH);
    const otherTokens = Math.ceil(otherCount / CHARS_PER_TOKEN_EN);
    
    return chineseTokens + otherTokens;
}

export function estimateMessagesTokens(messages) {
    let total = 0;
    
    for (const msg of messages) {
        total += estimateTokens(msg.content);
        total += 4;
    }
    
    return total;
}

export const CONTEXT_LIMIT = 10000;
export const KEEP_RECENT_MESSAGES = 6;
export const SUMMARY_RESERVE_TOKENS = 500;
