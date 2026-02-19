/**
 * 聊天逻辑模块
 */

import { 
    generateId, 
    formatTime, 
    escapeHtml, 
    scrollToBottom, 
    isNearBottom,
    isImageUrl 
} from './utils.js';
import { parseMessage, typesetMath } from './parser.js';
import { 
    createConversation, 
    getMessagesByConversation, 
    addMessage, 
    updateConversation,
    getAllConversations,
    deleteConversation
} from './db.js';
import { StreamReader } from './stream.js';
import { loadConversationList } from './app.js';
import { 
    estimateMessagesTokens, 
    CONTEXT_LIMIT, 
    KEEP_RECENT_MESSAGES,
    SUMMARY_RESERVE_TOKENS 
} from './tokenUtils.js';
import { API_BASE } from './utils.js';

const state = {
    currentConversationId: null,
    messages: [],
    isStreaming: false,
    streamReader: null,
    isTemporary: false,
    compressedSummary: null
};

// DOM 元素缓存
let elements = {};

/**
 * 初始化聊天模块
 */
export async function initChat() {
    cacheElements();
    bindEvents();
    await loadOrCreateConversation();
    renderMessages();
}

/**
 * 缓存 DOM 元素
 */
function cacheElements() {
    elements = {
        messagesContainer: document.getElementById('messages-container'),
        messageInput: document.getElementById('message-input'),
        sendButton: document.getElementById('send-button'),
        conversationTitle: document.getElementById('conversation-title')
    };
}

/**
 * 绑定事件
 */
function bindEvents() {
    // 发送按钮
    elements.sendButton?.addEventListener('click', handleSend);

    // 输入框回车
    elements.messageInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // 输入框自适应高度
    elements.messageInput?.addEventListener('input', () => {
        elements.messageInput.style.height = 'auto';
        elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 120) + 'px';
    });
}

/**
 * 加载或创建对话
 */
async function loadOrCreateConversation() {
    const conversations = await getAllConversations();
    
    if (conversations.length > 0) {
        state.currentConversationId = conversations[0].id;
        state.messages = await getMessagesByConversation(state.currentConversationId);
        state.isTemporary = false;
        updateConversationTitleInState(conversations[0].title);
    } else {
        state.currentConversationId = null;
        state.messages = [];
        state.isTemporary = true;
        updateConversationTitleInState('新对话');
    }
}

/**
 * 更新对话标题
 */
function updateConversationTitleInState(title) {
    if (elements.conversationTitle) {
        elements.conversationTitle.textContent = title;
    }
}

/**
 * 处理发送消息
 */
async function handleSend() {
    const content = elements.messageInput?.value.trim();
    if (!content) return;

    if (state.isStreaming) {
        cancelStream();
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming) {
            lastMessage.isStreaming = false;
            lastMessage.isThinking = false;
            if (lastMessage.content) {
                updateMessageContent(lastMessage);
                addMessage(state.currentConversationId, lastMessage);
            } else {
                const msgElement = document.getElementById(`msg-${lastMessage.id}`);
                if (msgElement) msgElement.remove();
                state.messages.pop();
            }
        }
    }

    if (state.isTemporary) {
        const conversation = await createConversation();
        state.currentConversationId = conversation.id;
        state.isTemporary = false;
    }

    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';

    const userMessage = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: Date.now()
    };

    state.messages.push(userMessage);
    await addMessage(state.currentConversationId, userMessage);
    renderMessage(userMessage);
    scrollToBottom(elements.messagesContainer, false);

    if (state.messages.length === 1) {
        const newTitle = content.substring(0, 20) + (content.length > 20 ? '...' : '');
        await updateConversation(state.currentConversationId, { title: newTitle });
        updateConversationTitleInState(newTitle);
        loadConversationList();
    }

    await sendMessageToBackend(content);
}

/**
 * 发送消息到后端
 */
async function sendMessageToBackend(content) {
    state.isStreaming = true;

    const assistantMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
        isThinking: true
    };

    state.messages.push(assistantMessage);
    
    renderMessage(assistantMessage);
    scrollToBottom(elements.messagesContainer, false);

    let historyMessages = state.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(0, -1)
        .map(m => ({
            role: m.role,
            content: m.content
        }));

    historyMessages.push({ role: 'user', content });

    const totalTokens = estimateMessagesTokens(historyMessages);
    
    if (totalTokens > CONTEXT_LIMIT && historyMessages.length > KEEP_RECENT_MESSAGES + 2) {
        const recentMessages = historyMessages.slice(-KEEP_RECENT_MESSAGES);
        
        if (state.compressedSummary) {
            historyMessages = [
                { 
                    role: 'system', 
                    content: `【历史对话摘要】\n${state.compressedSummary}` 
                },
                ...recentMessages
            ];
            console.log(`使用已有摘要压缩对话`);
        } else {
            const messagesToCompress = historyMessages.slice(0, -KEEP_RECENT_MESSAGES);
            
            try {
                const response = await fetch(`${API_BASE}/api/summarize`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messages: messagesToCompress })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    state.compressedSummary = result.summary;
                    
                    if (state.currentConversationId) {
                        await updateConversation(state.currentConversationId, {
                            summary: result.summary,
                            compressedCount: messagesToCompress.length
                        });
                    }
                    
                    historyMessages = [
                        { 
                            role: 'system', 
                            content: `【历史对话摘要】\n${result.summary}` 
                        },
                        ...recentMessages
                    ];
                    
                    console.log(`对话已压缩：${messagesToCompress.length} 条消息 → 摘要（原始消息已保留）`);
                }
            } catch (error) {
                console.error('压缩对话失败:', error);
            }
        }
    }

    state.streamReader = new StreamReader();

    await state.streamReader.connect(historyMessages, {
        onText: (text) => {
            if (assistantMessage.isThinking) {
                assistantMessage.isThinking = false;
            }
            assistantMessage.content += text;
            updateMessageContent(assistantMessage);
            if (isNearBottom(elements.messagesContainer)) {
                scrollToBottom(elements.messagesContainer, false);
            }
        },
        onToolCall: (toolName) => {
            if (assistantMessage.isThinking) {
                assistantMessage.isThinking = false;
            }
            assistantMessage.content += `[调用工具：${toolName}]`;
            assistantMessage.pendingToolName = toolName;
            updateMessageContent(assistantMessage);
            if (isNearBottom(elements.messagesContainer)) {
                scrollToBottom(elements.messagesContainer, false);
            }
        },
        onToolResult: (results) => {
            if (assistantMessage.isThinking) {
                assistantMessage.isThinking = false;
            }
            if (assistantMessage.pendingToolName) {
                let hasError = false;
                let errorMsg = null;
                
                for (const result of results) {
                    try {
                        const parsed = JSON.parse(result.content);
                        if (parsed.success === false) {
                            hasError = true;
                            errorMsg = parsed.error || parsed.message || null;
                        }
                        if (parsed.success && parsed.image_url) {
                            assistantMessage.images = assistantMessage.images || [];
                            assistantMessage.images.push({
                                url: parsed.image_url,
                                aspect_ratio: parsed.aspect_ratio || '1:1',
                                width: parsed.width || 2048,
                                height: parsed.height || 2048
                            });
                            updateMessageContent(assistantMessage);
                        }
                        if (result.name === 'web_search' && parsed.success && parsed.results) {
                            assistantMessage.searchResults = parsed.results;
                            updateMessageContent(assistantMessage);
                        }
                    } catch (e) {
                        console.error('Parse tool result error:', e);
                    }
                }
                
                if (hasError) {
                    const errorPart = errorMsg ? `|${errorMsg}` : '';
                    assistantMessage.content = assistantMessage.content.replace(
                        `[调用工具：${assistantMessage.pendingToolName}]`,
                        `[工具失败：${assistantMessage.pendingToolName}${errorPart}]`
                    );
                } else {
                    assistantMessage.content = assistantMessage.content.replace(
                        `[调用工具：${assistantMessage.pendingToolName}]`,
                        `[工具完成：${assistantMessage.pendingToolName}]`
                    );
                }
                delete assistantMessage.pendingToolName;
            }
            updateMessageContent(assistantMessage);
        },
        onError: (error) => {
            console.error('Stream error:', error);
            assistantMessage.isThinking = false;
            assistantMessage.content = '呜...好像出了点问题呢，能不能稍后再试试呀？我会一直在这里等你的~';
            assistantMessage.isStreaming = false;
            updateMessageContent(assistantMessage);
            state.isStreaming = false;
        },
        onComplete: () => {
            assistantMessage.isThinking = false;
            assistantMessage.isStreaming = false;
            updateMessageContent(assistantMessage);
            
            // 保存到数据库
            addMessage(state.currentConversationId, assistantMessage);
            
            state.isStreaming = false;
        }
    });
}

/**
 * 渲染所有消息
 */
function renderMessages() {
    if (!elements.messagesContainer) return;
    
    elements.messagesContainer.innerHTML = '';
    
    // 如果没有消息，显示欢迎消息
    if (state.messages.length === 0) {
        elements.messagesContainer.innerHTML = `
            <div class="empty-state">
                <svg class="empty-state-icon" viewBox="0 0 32 32" fill="currentColor">
                    <defs>
                        <linearGradient id="emptyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" style="stop-color:#dfc99a"/>
                            <stop offset="100%" style="stop-color:#a68b4d"/>
                        </linearGradient>
                    </defs>
                    <circle cx="16" cy="16" r="14" fill="url(#emptyGrad)"/>
                    <circle cx="11" cy="13" r="2.5" fill="white" opacity="0.9"/>
                    <circle cx="21" cy="13" r="2.5" fill="white" opacity="0.9"/>
                    <path d="M9 20 Q16 27 23 20" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.9"/>
                </svg>
                <h2 class="empty-state-title">你好呀</h2>
                <p class="empty-state-text">
                    我是 Luna，很高兴在这里遇见你。<br>
                    有什么想说的，都可以告诉我，<br>
                    我会认真倾听每一句话。
                </p>
            </div>
        `;
        return;
    }
    
    for (const message of state.messages) {
        renderMessage(message);
    }
    
    scrollToBottom(elements.messagesContainer, false);
}

/**
 * 渲染单条消息
 */
function renderMessage(message) {
    if (!elements.messagesContainer) return;

    // 移除欢迎消息（如果存在）
    const emptyState = elements.messagesContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    const messageEl = document.createElement('div');
    messageEl.className = `message message-${message.role}`;
    messageEl.id = `message-${message.id}`;

    if (message.role === 'user') {
        messageEl.innerHTML = `
            <div class="message-bubble user-bubble">
                <div class="message-text">${parseMessage(message.content)}</div>
            </div>
            <div class="message-time">${formatTime(message.timestamp)}</div>
        `;
    } else {
        let contentHtml = '';
        if (message.isThinking) {
            contentHtml = '<div class="typing-dots"><span></span><span></span><span></span></div>';
        } else {
            contentHtml = `${parseMessage(message.content)}`;
        }
        
        messageEl.innerHTML = `
            <div class="message-avatar">
                <img src="luna-avatar.jpg" alt="Luna">
            </div>
            <div class="message-content">
                <div class="message-bubble assistant-bubble">
                    <div class="message-text">${contentHtml}</div>
                    ${renderImages(message.images)}
                </div>
                <div class="message-time">${formatTime(message.timestamp)}</div>
            </div>
        `;
    }

    elements.messagesContainer.appendChild(messageEl);
    
    if (message.role === 'assistant' && !message.isThinking) {
        typesetMath(messageEl);
    }
}

/**
 * 更新消息内容
 */
function updateMessageContent(message) {
    const messageEl = document.getElementById(`message-${message.id}`);
    if (!messageEl) return;

    const textEl = messageEl.querySelector('.message-text');
    const bubbleEl = messageEl.querySelector('.message-bubble');

    if (textEl) {
        if (message.isThinking) {
            textEl.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
        } else {
            const existingToolCards = textEl.querySelectorAll('.tool-call-card');
            const toolCardStates = new Map();
            
            existingToolCards.forEach(card => {
                const toolName = card.querySelector('.tool-name')?.textContent;
                if (toolName) {
                    let status = 'pending';
                    if (card.classList.contains('tool-complete')) {
                        status = 'success';
                    } else if (card.classList.contains('tool-error')) {
                        status = 'error';
                    }
                    toolCardStates.set(toolName, {
                        status,
                        html: card.outerHTML
                    });
                }
            });
            
            const newHtml = parseMessage(message.content);
            
            if (toolCardStates.size > 0) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = newHtml;
                
                tempDiv.querySelectorAll('.tool-call-card').forEach(newCard => {
                    const toolName = newCard.querySelector('.tool-name')?.textContent;
                    if (toolName && toolCardStates.has(toolName)) {
                        const existingState = toolCardStates.get(toolName);
                        if (existingState.status === 'success') {
                            newCard.classList.add('tool-complete');
                            newCard.classList.remove('tool-streaming');
                            const spinner = newCard.querySelector('.tool-spinner');
                            if (spinner) {
                                spinner.outerHTML = `<svg class="tool-checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>`;
                            }
                            const statusEl = newCard.querySelector('.tool-status');
                            if (statusEl) {
                                statusEl.textContent = '执行完成';
                            }
                        } else if (existingState.status === 'error') {
                            newCard.classList.add('tool-error');
                            newCard.classList.remove('tool-streaming');
                            const spinner = newCard.querySelector('.tool-spinner');
                            if (spinner) {
                                spinner.outerHTML = `<svg class="tool-error-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="15" y1="9" x2="9" y2="15"/>
                                    <line x1="9" y1="9" x2="15" y2="15"/>
                                </svg>`;
                            }
                            const statusEl = newCard.querySelector('.tool-status');
                            if (statusEl) {
                                statusEl.textContent = '执行失败';
                            }
                        }
                        newCard.style.animation = 'none';
                    }
                });
                
                textEl.innerHTML = tempDiv.innerHTML;
            } else {
                textEl.innerHTML = newHtml;
            }
            
            if (!message.isStreaming) {
                typesetMath(textEl);
            }
        }
    }

    // 更新图片
    const existingImages = bubbleEl.querySelector('.message-images');
    if (existingImages) {
        existingImages.remove();
    }
    
    if (message.images && message.images.length > 0) {
        const imagesHtml = renderImages(message.images);
        if (imagesHtml) {
            bubbleEl.insertAdjacentHTML('beforeend', imagesHtml);
        }
    }

    const existingSearchResults = bubbleEl.querySelector('.search-results-container');
    if (existingSearchResults) {
        existingSearchResults.remove();
    }
    
    if (message.searchResults && message.searchResults.length > 0) {
        const searchHtml = renderSearchResults(message.searchResults);
        if (searchHtml) {
            bubbleEl.insertAdjacentHTML('beforeend', searchHtml);
        }
    }
}

/**
 * 计算图片占位符的 padding-top（基于宽高比）
 */
function getImagePlaceholderPadding(aspectRatio) {
    const ratioMap = {
        '1:1': '100%',
        '2:3': '150%',
        '3:2': '66.67%',
        '3:4': '133.33%',
        '4:3': '75%',
        '9:16': '177.78%',
        '16:9': '56.25%'
    };
    return ratioMap[aspectRatio] || '100%';
}

/**
 * 显示图片预览
 */
function showImagePreview(imgUrl) {
    let preview = document.getElementById('image-preview-overlay');
    
    if (!preview) {
        preview = document.createElement('div');
        preview.id = 'image-preview-overlay';
        preview.className = 'image-preview-overlay';
        preview.innerHTML = `
            <div class="image-preview-backdrop"></div>
            <div class="image-preview-container">
                <img class="image-preview-img" src="" alt="Preview">
            </div>
            <button class="image-preview-close" aria-label="关闭">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
        `;
        document.body.appendChild(preview);
        
        preview.querySelector('.image-preview-backdrop').addEventListener('click', hideImagePreview);
        preview.querySelector('.image-preview-close').addEventListener('click', hideImagePreview);
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hideImagePreview();
            }
        });
    }
    
    const img = preview.querySelector('.image-preview-img');
    img.src = imgUrl;
    preview.classList.add('active');
    document.body.style.overflow = 'hidden';
}

/**
 * 隐藏图片预览
 */
function hideImagePreview() {
    const preview = document.getElementById('image-preview-overlay');
    if (preview) {
        preview.classList.remove('active');
        document.body.style.overflow = '';
    }
}

window.showImagePreview = showImagePreview;
window.hideImagePreview = hideImagePreview;

/**
 * 渲染图片
 */
function renderImages(images) {
    if (!images || images.length === 0) return '';
    
    return `
        <div class="message-images">
            ${images.map(img => {
                const imgUrl = typeof img === 'string' ? img : img.url;
                const aspectRatio = typeof img === 'object' ? img.aspect_ratio : '1:1';
                const padding = getImagePlaceholderPadding(aspectRatio);
                return `
                    <div class="message-image" style="--placeholder-padding: ${padding}">
                        <div class="image-placeholder">
                            <div class="image-placeholder-spinner"></div>
                        </div>
                        <img src="${imgUrl}" alt="Generated image" loading="lazy" 
                             onload="this.previousElementSibling.classList.add('hidden')"
                             onclick="showImagePreview('${imgUrl}')">
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

/**
 * 渲染搜索结果
 */
function renderSearchResults(results) {
    if (!results || results.length === 0) return '';
    
    return `
        <div class="search-results-container">
            ${results.map((result, index) => `
                <div class="search-result-card" data-index="${index}">
                    <div class="search-result-header" onclick="toggleSearchResult(${index})">
                        <div class="search-result-title-row">
                            <svg class="search-result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/>
                                <line x1="16" y1="17" x2="8" y2="17"/>
                                <polyline points="10 9 9 9 8 9"/>
                            </svg>
                            <a class="search-result-title" href="${escapeHtml(result.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">
                                ${escapeHtml(result.title)}
                            </a>
                        </div>
                        <div class="search-result-meta">
                            <span class="search-result-source">${escapeHtml(result.source || '')}</span>
                            <svg class="search-result-expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"/>
                            </svg>
                        </div>
                    </div>
                    <div class="search-result-content">
                        <div class="search-result-description">${escapeHtml(result.description || '')}</div>
                        ${result.content ? `<div class="search-result-full-content">${escapeHtml(result.content)}</div>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * 切换搜索结果展开/收起
 */
function toggleSearchResult(index) {
    const card = document.querySelector(`.search-result-card[data-index="${index}"]`);
    if (card) {
        card.classList.toggle('expanded');
    }
}

window.toggleSearchResult = toggleSearchResult;

/**
 * 创建新对话
 */
export async function newConversation() {
    state.currentConversationId = null;
    state.messages = [];
    state.isTemporary = true;
    state.compressedSummary = null;
    updateConversationTitleInState('新对话');
    renderMessages();
    loadConversationList();
}

/**
 * 切换对话
 */
export async function switchConversation(conversationId) {
    state.currentConversationId = conversationId;
    state.messages = await getMessagesByConversation(conversationId);
    state.isTemporary = false;
    
    const conversations = await getAllConversations();
    const conversation = conversations.find(c => c.id === conversationId);
    if (conversation) {
        updateConversationTitleInState(conversation.title);
        state.compressedSummary = conversation.summary || null;
    } else {
        state.compressedSummary = null;
    }
    
    renderMessages();
}

/**
 * 获取当前对话 ID
 */
export function getCurrentConversationId() {
    return state.currentConversationId;
}

/**
 * 是否处于临时对话状态
 */
export function isTemporaryConversation() {
    return state.isTemporary;
}

/**
 * 获取所有对话
 */
export async function getConversations() {
    return await getAllConversations();
}

/**
 * 取消当前流式响应
 */
export function cancelStream() {
    if (state.streamReader) {
        state.streamReader.abort();
        state.streamReader = null;
        state.isStreaming = false;
    }
}

/**
 * 删除对话
 */
export async function deleteConversationFromChat(conversationId) {
    await deleteConversation(conversationId);
    
    if (state.currentConversationId === conversationId) {
        const conversations = await getAllConversations();
        if (conversations.length > 0) {
            await switchConversation(conversations[0].id);
        } else {
            state.currentConversationId = null;
            state.messages = [];
            state.isTemporary = true;
            updateConversationTitleInState('新对话');
            renderMessages();
        }
    }
}

/**
 * 更新对话标题
 */
export async function updateConversationTitle(conversationId, newTitle) {
    await updateConversation(conversationId, { title: newTitle });
    
    if (state.currentConversationId === conversationId) {
        updateConversationTitleInState(newTitle);
    }
}

// 导出状态
export { state };
