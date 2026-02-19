/**
 * 消息解析模块
 * 支持 Markdown、MathJax 数学公式、代码块高亮
 */

function escapeHtml(text) {
    const htmlEntities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, char => htmlEntities[char]);
}

function extractCodeBlocks(text) {
    const codeBlocks = [];
    let index = 0;
    
    text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
        const placeholder = `\x00CODE${index}\x00`;
        codeBlocks.push({
            placeholder,
            code: code,
            language: lang || 'plaintext',
            isComplete: true
        });
        index++;
        return placeholder;
    });
    
    const unclosedMatch = text.match(/```(\w*)\n?([\s\S]*?)$/);
    if (unclosedMatch) {
        const placeholder = `\x00CODE${index}\x00`;
        codeBlocks.push({
            placeholder,
            code: unclosedMatch[2] || '',
            language: unclosedMatch[1] || 'plaintext',
            isComplete: false
        });
        text = text.replace(/```(\w*)\n?([\s\S]*?)$/, placeholder);
    }
    
    text = text.replace(/`([^`\n]+)`/g, (match, code) => {
        const placeholder = `\x00ICODE${index}\x00`;
        codeBlocks.push({
            placeholder,
            code: code,
            language: 'inline',
            isInline: true
        });
        index++;
        return placeholder;
    });
    
    return { text, codeBlocks };
}

function extractMath(text) {
    const mathBlocks = [];
    let index = 0;
    
    const patterns = [
        { regex: /\$\$([\s\S]+?)\$\$/g, display: true },
        { regex: /\\\[([\s\S]+?)\\\]/g, display: true },
        { regex: /\$(?!\$)([^\$\n]+?)\$/g, display: false },
        { regex: /\\\(([\s\S]+?)\\\)/g, display: false }
    ];
    
    patterns.forEach(({ regex, display }) => {
        text = text.replace(regex, (match, math) => {
            const placeholder = `\x00MATH${index}\x00`;
            mathBlocks.push({
                placeholder,
                math: math.trim(),
                display
            });
            index++;
            return placeholder;
        });
    });
    
    return { text, mathBlocks };
}

function extractToolCalls(text) {
    const toolCalls = [];
    let index = 0;
    
    text = text.replace(/\[调用工具：([^\]]+)\]/g, (match, toolName) => {
        const placeholder = `\x00TOOL${index}\x00`;
        toolCalls.push({
            placeholder,
            toolName: toolName.trim(),
            status: 'pending'
        });
        index++;
        return placeholder;
    });
    
    text = text.replace(/\[工具完成：([^\]]+)\]/g, (match, toolName) => {
        const placeholder = `\x00TOOL${index}\x00`;
        toolCalls.push({
            placeholder,
            toolName: toolName.trim(),
            status: 'success'
        });
        index++;
        return placeholder;
    });
    
    text = text.replace(/\[工具失败：([^\]]+)(?:\|([^]]*))?\]/g, (match, toolName, errorMsg) => {
        const placeholder = `\x00TOOL${index}\x00`;
        toolCalls.push({
            placeholder,
            toolName: toolName.trim(),
            status: 'error',
            errorMsg: errorMsg ? errorMsg.trim() : null
        });
        index++;
        return placeholder;
    });
    
    return { text, toolCalls };
}

function parseMarkdown(text) {
    text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    text = text.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
    text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
    text = text.replace(/_(.+?)_/g, '<em>$1</em>');
    text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
    
    text = text.replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    
    text = text.replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>\n?)+/g, function(match) {
        if (match.includes('<ul>')) return match;
        return '<ol>' + match + '</ol>';
    });
    
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
    
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    text = text.replace(/^>\s*(.+)$/gm, '<blockquote>$1</blockquote>');
    text = text.replace(/(<blockquote>.*<\/blockquote>\n?)+/g, function(match) {
        return '<div class="quote-block">' + match + '</div>';
    });
    
    text = text.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '<hr>');
    
    text = text.replace(/\n\n/g, '</p><p>');
    text = text.replace(/\n/g, '<br>');
    
    if (!text.startsWith('<')) {
        text = '<p>' + text + '</p>';
    }
    
    text = text.replace(/<p><\/p>/g, '');
    text = text.replace(/<p>(<h[1-6]>)/g, '$1');
    text = text.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
    text = text.replace(/<p>(<ul>)/g, '$1');
    text = text.replace(/(<\/ul>)<\/p>/g, '$1');
    text = text.replace(/<p>(<ol>)/g, '$1');
    text = text.replace(/(<\/ol>)<\/p>/g, '$1');
    text = text.replace(/<p>(<blockquote>)/g, '$1');
    text = text.replace(/(<\/blockquote>)<\/p>/g, '$1');
    text = text.replace(/<p>(<hr>)<\/p>/g, '$1');
    text = text.replace(/<p>(<div)/g, '$1');
    text = text.replace(/(<\/div>)<\/p>/g, '$1');
    
    return text;
}

function renderMath(mathBlocks) {
    return mathBlocks.map(block => {
        if (block.display) {
            return {
                placeholder: block.placeholder,
                html: `<div class="math-display">$$${escapeHtml(block.math)}$$</div>`
            };
        }
        return {
            placeholder: block.placeholder,
            html: `<span class="math-inline">$${escapeHtml(block.math)}$</span>`
        };
    });
}

function renderCode(codeBlocks) {
    return codeBlocks.map(block => {
        const escapedCode = escapeHtml(block.code);
        
        if (block.isInline) {
            return {
                placeholder: block.placeholder,
                html: `<code class="inline-code">${escapedCode}</code>`
            };
        }
        
        let highlighted = escapedCode;
        if (typeof hljs !== 'undefined' && block.language !== 'plaintext') {
            try {
                if (hljs.getLanguage(block.language)) {
                    highlighted = hljs.highlight(block.code, { language: block.language }).value;
                }
            } catch (e) {
                highlighted = escapedCode;
            }
        }
        
        const completeClass = block.isComplete ? '' : ' code-streaming';
        
        return {
            placeholder: block.placeholder,
            html: `<div class="code-block${completeClass}"><div class="code-header"><span class="code-lang">${block.language}</span><button class="code-copy-btn" onclick="copyCode(this)">复制</button></div><pre><code class="language-${block.language}">${highlighted}</code></pre></div>`
        };
    });
}

function getToolIcon(toolName) {
    const icons = {
        '图片生成': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
        </svg>`,
        '网络搜索': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>`,
        '保存记忆': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
        </svg>`,
        '查询记忆': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>`,
        '删除记忆': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>`
    };
    return icons[toolName] || `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>`;
}

function getToolIconClass(toolName) {
    const classes = {
        '图片生成': 'tool-image',
        '网络搜索': 'tool-search',
        '保存记忆': 'tool-memory',
        '查询记忆': 'tool-memory',
        '删除记忆': 'tool-memory'
    };
    return classes[toolName] || 'tool-default';
}

function renderToolCalls(toolCalls) {
    return toolCalls.map(block => {
        const iconClass = getToolIconClass(block.toolName);
        const icon = getToolIcon(block.toolName);
        
        if (block.status === 'success') {
            return {
                placeholder: block.placeholder,
                html: `<div class="tool-call-card tool-complete">
                    <div class="tool-icon ${iconClass}">${icon}</div>
                    <div class="tool-content">
                        <span class="tool-name">${escapeHtml(block.toolName)}</span>
                        <span class="tool-status">执行完成</span>
                    </div>
                    <svg class="tool-checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>`
            };
        }
        
        if (block.status === 'error') {
            const errorMsgHtml = block.errorMsg ? `<span class="tool-error-msg">${escapeHtml(block.errorMsg)}</span>` : '';
            return {
                placeholder: block.placeholder,
                html: `<div class="tool-call-card tool-error">
                    <div class="tool-icon tool-error-icon">${icon}</div>
                    <div class="tool-content">
                        <span class="tool-name">${escapeHtml(block.toolName)}</span>
                        <span class="tool-status">执行失败</span>
                        ${errorMsgHtml}
                    </div>
                    <svg class="tool-error-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                </div>`
            };
        }
        
        return {
            placeholder: block.placeholder,
            html: `<div class="tool-call-card">
                <div class="tool-icon ${iconClass}">${icon}</div>
                <div class="tool-content">
                    <span class="tool-name">${escapeHtml(block.toolName)}</span>
                    <span class="tool-status">正在执行...</span>
                </div>
                <div class="tool-spinner"></div>
            </div>`
        };
    });
}

function restorePlaceholders(text, replacements) {
    replacements.forEach(({ placeholder, html }) => {
        text = text.replace(placeholder, html);
    });
    return text;
}

let typesetQueue = [];
let isTypesetting = false;

function processTypesetQueue() {
    if (isTypesetting || typesetQueue.length === 0) return;
    
    isTypesetting = true;
    const elements = typesetQueue.splice(0, typesetQueue.length);
    
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        MathJax.typesetPromise(elements).then(() => {
            isTypesetting = false;
            if (typesetQueue.length > 0) {
                setTimeout(processTypesetQueue, 50);
            }
        }).catch((err) => {
            console.error('MathJax typeset error:', err);
            isTypesetting = false;
        });
    } else {
        isTypesetting = false;
    }
}

export function typesetMath(element) {
    if (!element) return;
    
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        typesetQueue.push(element);
        setTimeout(processTypesetQueue, 50);
    }
}

export function parseMessage(content) {
    if (!content) return '';
    
    let { text, codeBlocks } = extractCodeBlocks(content);
    let { text: textWithMathPlaceholders, mathBlocks } = extractMath(text);
    let { text: textWithToolPlaceholders, toolCalls } = extractToolCalls(textWithMathPlaceholders);
    
    let parsed = parseMarkdown(textWithToolPlaceholders);
    
    const toolRendered = renderToolCalls(toolCalls);
    const mathRendered = renderMath(mathBlocks);
    const codeRendered = renderCode(codeBlocks);
    
    parsed = restorePlaceholders(parsed, toolRendered);
    parsed = restorePlaceholders(parsed, codeRendered);
    parsed = restorePlaceholders(parsed, mathRendered);
    
    return parsed;
}

export function parsePlainText(content) {
    if (!content) return '';
    return escapeHtml(content);
}

window.copyCode = function(button) {
    const codeBlock = button.closest('.code-block');
    const code = codeBlock.querySelector('code').textContent;
    
    navigator.clipboard.writeText(code).then(() => {
        const originalText = button.textContent;
        button.textContent = '已复制';
        button.classList.add('copied');
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        
        const originalText = button.textContent;
        button.textContent = '已复制';
        button.classList.add('copied');
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    });
};
