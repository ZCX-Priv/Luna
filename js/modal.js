/**
 * Modal 对话框组件
 */

let modalContainer = null;
let currentResolve = null;

function ensureContainer() {
    if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'modal-container';
        document.body.appendChild(modalContainer);
    }
    return modalContainer;
}

export function showModal(options) {
    return new Promise((resolve) => {
        const container = ensureContainer();
        currentResolve = resolve;
        
        const {
            title = '',
            message = '',
            confirmText = '确定',
            cancelText = '取消',
            showCancel = true,
            type = 'default'
        } = options;
        
        const iconHtml = getIconHtml(type);
        
        container.innerHTML = `
            <div class="modal-overlay" data-action="cancel">
                <div class="modal-content">
                    ${iconHtml ? `<div class="modal-icon modal-icon-${type}">${iconHtml}</div>` : ''}
                    ${title ? `<h3 class="modal-title">${escapeHtml(title)}</h3>` : ''}
                    ${message ? `<p class="modal-message">${escapeHtml(message)}</p>` : ''}
                    <div class="modal-actions">
                        ${showCancel ? `<button class="modal-btn modal-btn-cancel" data-action="cancel">${escapeHtml(cancelText)}</button>` : ''}
                        <button class="modal-btn modal-btn-confirm" data-action="confirm">${escapeHtml(confirmText)}</button>
                    </div>
                </div>
            </div>
        `;
        
        requestAnimationFrame(() => {
            const overlay = container.querySelector('.modal-overlay');
            overlay.classList.add('modal-visible');
        });
        
        container.addEventListener('click', handleModalClick);
        document.addEventListener('keydown', handleModalKeydown);
    });
}

function handleModalClick(e) {
    const action = e.target.dataset.action;
    if (action === 'confirm') {
        closeModal(true);
    } else if (action === 'cancel') {
        closeModal(false);
    }
}

function handleModalKeydown(e) {
    if (e.key === 'Escape') {
        closeModal(false);
    } else if (e.key === 'Enter') {
        closeModal(true);
    }
}

function closeModal(result) {
    if (!modalContainer) return;
    
    const overlay = modalContainer.querySelector('.modal-overlay');
    if (overlay) {
        overlay.classList.remove('modal-visible');
        overlay.classList.add('modal-hiding');
        
        setTimeout(() => {
            modalContainer.innerHTML = '';
            modalContainer.removeEventListener('click', handleModalClick);
            document.removeEventListener('keydown', handleModalKeydown);
            
            if (currentResolve) {
                currentResolve(result);
                currentResolve = null;
            }
        }, 200);
    }
}

function getIconHtml(type) {
    const icons = {
        warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>`,
        danger: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>`,
        success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>`,
        info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
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

export function confirm(message, title = '确认一下') {
    return showModal({
        title,
        message,
        confirmText: '好哒',
        cancelText: '再想想',
        showCancel: true,
        type: 'warning'
    });
}

export function alert(message, title = '小提示') {
    return showModal({
        title,
        message,
        confirmText: '知道啦',
        showCancel: false,
        type: 'info'
    });
}

export function prompt(message, title = '请输入', defaultValue = '', placeholder = '') {
    return new Promise((resolve) => {
        const container = ensureContainer();
        currentResolve = resolve;
        
        container.innerHTML = `
            <div class="modal-overlay" data-action="cancel">
                <div class="modal-content">
                    <h3 class="modal-title">${escapeHtml(title)}</h3>
                    ${message ? `<p class="modal-message">${escapeHtml(message)}</p>` : ''}
                    <input type="text" class="modal-input" value="${escapeHtml(defaultValue)}" placeholder="${escapeHtml(placeholder)}" data-action="input">
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn-cancel" data-action="cancel">算了</button>
                        <button class="modal-btn modal-btn-confirm" data-action="confirm">好哒</button>
                    </div>
                </div>
            </div>
        `;
        
        requestAnimationFrame(() => {
            const overlay = container.querySelector('.modal-overlay');
            overlay.classList.add('modal-visible');
            
            const input = container.querySelector('.modal-input');
            if (input) {
                input.focus();
                input.select();
            }
        });
        
        container.addEventListener('click', handlePromptClick);
        document.addEventListener('keydown', handlePromptKeydown);
    });
}

function handlePromptClick(e) {
    const action = e.target.dataset.action;
    if (action === 'confirm') {
        const input = modalContainer.querySelector('.modal-input');
        const value = input ? input.value.trim() : '';
        closePromptModal(value || null);
    } else if (action === 'cancel') {
        closePromptModal(null);
    }
}

function handlePromptKeydown(e) {
    if (e.key === 'Escape') {
        closePromptModal(null);
    } else if (e.key === 'Enter' && e.target.classList.contains('modal-input')) {
        const input = modalContainer.querySelector('.modal-input');
        const value = input ? input.value.trim() : '';
        closePromptModal(value || null);
    }
}

function closePromptModal(result) {
    if (!modalContainer) return;
    
    const overlay = modalContainer.querySelector('.modal-overlay');
    if (overlay) {
        overlay.classList.remove('modal-visible');
        overlay.classList.add('modal-hiding');
        
        setTimeout(() => {
            modalContainer.innerHTML = '';
            modalContainer.removeEventListener('click', handlePromptClick);
            document.removeEventListener('keydown', handlePromptKeydown);
            
            if (currentResolve) {
                currentResolve(result);
                currentResolve = null;
            }
        }, 200);
    }
}
