/**
 * 应用入口模块
 */

import { initDB } from './db.js';
import { initChat, newConversation, switchConversation, getConversations, getCurrentConversationId, deleteConversationFromChat, updateConversationTitle } from './chat.js';
import { initSettings, openSettings } from './settings.js';
import { confirm as modalConfirm, prompt as modalPrompt } from './modal.js';

// 应用状态
const appState = {
    isInitialized: false,
    showSidebar: false
};

/**
 * 初始化应用
 */
async function initApp() {
    try {
        // 初始化数据库
        await initDB();
        
        // 初始化设置
        await initSettings();
        
        // 初始化聊天
        await initChat();
        
        // 绑定全局事件
        bindGlobalEvents();
        
        appState.isInitialized = true;
        console.log('Luna initialized successfully');
        
    } catch (error) {
        console.error('Failed to initialize app:', error);
        showErrorMessage('初始化失败，请刷新页面重试');
    }
}

/**
 * 绑定全局事件
 */
function bindGlobalEvents() {
    // 新建对话按钮
    document.getElementById('new-chat-btn')?.addEventListener('click', async () => {
        await newConversation();
        closeSidebar();
    });
    
    // 设置按钮
    document.getElementById('settings-btn')?.addEventListener('click', openSettings);
    
    // 侧边栏切换
    const menuBtn = document.getElementById('menu-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    if (menuBtn) {
        menuBtn.addEventListener('click', toggleSidebar);
    }
    
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeSidebar();
        });
    }
    
    // ESC 键关闭侧边栏和设置面板
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (appState.showSidebar) {
                closeSidebar();
            }
        }
    });
    
    // 加载对话列表
    loadConversationList();
}

/**
 * 切换侧边栏
 */
function toggleSidebar() {
    appState.showSidebar = !appState.showSidebar;
    updateSidebarState();
}

/**
 * 关闭侧边栏
 */
function closeSidebar() {
    appState.showSidebar = false;
    updateSidebarState();
}

/**
 * 更新侧边栏状态
 */
function updateSidebarState() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar) {
        sidebar.classList.toggle('open', appState.showSidebar);
    }
    if (overlay) {
        overlay.classList.toggle('visible', appState.showSidebar);
    }
}

/**
 * 加载对话列表
 */
async function loadConversationList() {
    const conversations = await getConversations();
    const listContainer = document.getElementById('conversation-list');
    
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    const currentId = getCurrentConversationId();
    
    for (const conversation of conversations) {
        const item = document.createElement('div');
        item.className = `conversation-item ${conversation.id === currentId ? 'active' : ''}`;
        item.dataset.id = conversation.id;
        
        item.innerHTML = `
            <svg class="conversation-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="conversation-title">${escapeHtml(conversation.title)}</span>
            <button class="conversation-edit-btn" aria-label="编辑标题" data-id="${conversation.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
            </button>
            <button class="conversation-delete-btn" aria-label="删除对话" data-id="${conversation.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;
        
        item.addEventListener('click', async (e) => {
            if (e.target.closest('.conversation-delete-btn') || e.target.closest('.conversation-edit-btn')) {
                return;
            }
            await switchConversation(conversation.id);
            loadConversationList();
            closeSidebar();
        });
        
        const editBtn = item.querySelector('.conversation-edit-btn');
        editBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await handleEditConversationTitle(conversation.id, conversation.title);
        });
        
        const deleteBtn = item.querySelector('.conversation-delete-btn');
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await handleDeleteConversation(conversation.id);
        });
        
        listContainer.appendChild(item);
    }
    
    if (conversations.length === 0) {
        listContainer.innerHTML = `
            <div class="no-conversations">
                <p>还没有对话呢，开始新的信筏吧~</p>
            </div>
        `;
    }
}

/**
 * 处理编辑对话标题
 */
async function handleEditConversationTitle(conversationId, currentTitle) {
    const newTitle = await modalPrompt('', '重命名对话', currentTitle, '请输入新的对话标题');
    if (newTitle === null || newTitle.trim() === '') return;
    
    await updateConversationTitle(conversationId, newTitle.trim());
    await loadConversationList();
}

/**
 * 处理删除对话
 */
async function handleDeleteConversation(conversationId) {
    const confirmed = await modalConfirm('真的要删除这个对话吗？里面的内容会不见的呢...', '删除对话');
    if (!confirmed) return;
    
    await deleteConversationFromChat(conversationId);
    await loadConversationList();
}

/**
 * 转义 HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 显示错误消息
 */
function showErrorMessage(message) {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    container.innerHTML = `
        <div class="error-message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>${escapeHtml(message)}</span>
        </div>
    `;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);

// 导出供其他模块使用
export { appState, loadConversationList, closeSidebar };
