/**
 * Notice Toast 提示组件
 */

let noticeContainer = null;
let noticeQueue = [];
let isShowing = false;

function ensureContainer() {
    if (!noticeContainer) {
        noticeContainer = document.createElement('div');
        noticeContainer.id = 'notice-container';
        document.body.appendChild(noticeContainer);
    }
    return noticeContainer;
}

export function toast(message, options = {}) {
    const {
        duration = 2000,
        type = 'default'
    } = typeof options === 'string' ? { type: options } : options;
    
    noticeQueue.push({ message, duration, type });
    
    if (!isShowing) {
        showNextNotice();
    }
}

function showNextNotice() {
    if (noticeQueue.length === 0) {
        isShowing = false;
        return;
    }
    
    isShowing = true;
    const { message, duration, type } = noticeQueue.shift();
    
    const container = ensureContainer();
    
    const notice = document.createElement('div');
    notice.className = `notice-toast notice-${type}`;
    notice.innerHTML = `
        ${getIconHtml(type)}
        <span class="notice-text">${escapeHtml(message)}</span>
    `;
    
    container.appendChild(notice);
    
    requestAnimationFrame(() => {
        notice.classList.add('notice-visible');
    });
    
    setTimeout(() => {
        notice.classList.remove('notice-visible');
        notice.classList.add('notice-hiding');
        
        setTimeout(() => {
            notice.remove();
            showNextNotice();
        }, 300);
    }, duration);
}

function getIconHtml(type) {
    const icons = {
        success: `<svg class="notice-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>`,
        error: `<svg class="notice-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>`,
        warning: `<svg class="notice-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>`,
        info: `<svg class="notice-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>`
    };
    return icons[type] || '';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function success(message) {
    return toast(message, 'success');
}

export function error(message) {
    return toast(message, 'error');
}

export function warning(message) {
    return toast(message, 'warning');
}

export function info(message) {
    return toast(message, 'info');
}
