/**
 * 设置页面逻辑模块
 */

import { API_BASE } from './utils.js';
import { saveSetting, getSetting, getAllSettings, clearAllData } from './db.js';
import { showModal } from './modal.js';
import { toast, success, error } from './notice.js';

// 设置状态
const state = {
    isOpen: false,
    settings: {}
};

// DOM 元素缓存
let elements = {};

/**
 * 初始化设置模块
 */
export async function initSettings() {
    cacheElements();
    bindEvents();
    await loadSettings();
}

/**
 * 缓存 DOM 元素
 */
function cacheElements() {
    elements = {
        settingsPanel: document.getElementById('settings-panel'),
        settingsOverlay: document.getElementById('settings-overlay'),
        closeSettings: document.getElementById('close-settings'),
        clearDataBtn: document.getElementById('clear-data-btn'),
        apiKeyInput: document.getElementById('api-key-input'),
        saveApiKeyBtn: document.getElementById('save-api-key-btn'),
        textModelSelect: document.getElementById('text-model-select'),
        imageModelSelect: document.getElementById('image-model-select'),
        temperatureSlider: document.getElementById('temperature-slider'),
        temperatureValue: document.getElementById('temperature-value'),
        topPSlider: document.getElementById('top-p-slider'),
        topPValue: document.getElementById('top-p-value')
    };
}

/**
 * 绑定事件
 */
function bindEvents() {
    // 打开设置 - 在 app.js 中绑定，这里移除重复绑定
    
    // 关闭设置
    if (elements.closeSettings) {
        elements.closeSettings.addEventListener('click', (e) => {
            e.preventDefault();
            closeSettings();
        });
    }
    
    if (elements.settingsOverlay) {
        elements.settingsOverlay.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeSettings();
        });
    }

    // 清空数据
    if (elements.clearDataBtn) {
        elements.clearDataBtn.addEventListener('click', handleClearData);
    }

    // 保存 API Key
    if (elements.saveApiKeyBtn) {
        elements.saveApiKeyBtn.addEventListener('click', handleSaveApiKey);
    }

    // 模型选择变化
    if (elements.textModelSelect) {
        elements.textModelSelect.addEventListener('change', handleModelChange);
    }
    if (elements.imageModelSelect) {
        elements.imageModelSelect.addEventListener('change', handleModelChange);
    }

    // 生成参数滑块
    if (elements.temperatureSlider) {
        elements.temperatureSlider.addEventListener('input', handleTemperatureChange);
        elements.temperatureSlider.addEventListener('change', saveGenerationParams);
    }
    if (elements.topPSlider) {
        elements.topPSlider.addEventListener('input', handleTopPChange);
        elements.topPSlider.addEventListener('change', saveGenerationParams);
    }

    // ESC 关闭 - 在 app.js 中统一处理
}

/**
 * 加载设置
 */
async function loadSettings() {
    state.settings = await getAllSettings();
    
    // 更新 UI
    if (elements.apiKeyInput && state.settings.apiKey) {
        elements.apiKeyInput.value = state.settings.apiKey.substring(0, 8) + '...';
    }
    
    // 加载模型配置
    await loadModels();
}

/**
 * 加载模型列表和当前选择
 */
async function loadModels() {
    try {
        const response = await fetch(`${API_BASE}/api/models`);
        const data = await response.json();
        
        if (data.success) {
            const { models, current } = data;
            
            // 填充文本模型选项
            if (elements.textModelSelect && models.text_models) {
                elements.textModelSelect.innerHTML = models.text_models.map(model => 
                    `<option value="${model.id}" ${model.id === current.text_model ? 'selected' : ''}>
                        ${model.name}
                    </option>`
                ).join('');
            }
            
            // 填充图片模型选项
            if (elements.imageModelSelect && models.image_models) {
                elements.imageModelSelect.innerHTML = models.image_models.map(model => 
                    `<option value="${model.id}" ${model.id === current.image_model ? 'selected' : ''}>
                        ${model.name}
                    </option>`
                ).join('');
            }
            
            // 设置生成参数滑块
            if (elements.temperatureSlider && current.temperature !== undefined) {
                elements.temperatureSlider.value = current.temperature;
                if (elements.temperatureValue) {
                    elements.temperatureValue.textContent = current.temperature;
                }
            }
            
            if (elements.topPSlider && current.top_p !== undefined) {
                elements.topPSlider.value = current.top_p;
                if (elements.topPValue) {
                    elements.topPValue.textContent = current.top_p;
                }
            }
        }
    } catch (error) {
        console.error('Failed to load models:', error);
    }
}

/**
 * 处理模型选择变化
 */
async function handleModelChange() {
    const textModel = elements.textModelSelect?.value;
    const imageModel = elements.imageModelSelect?.value;
    
    try {
        const response = await fetch(`${API_BASE}/api/models`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text_model: textModel,
                image_model: imageModel
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            success('保存好啦~');
        }
    } catch (err) {
        error('呜...保存没有成功呢，要不要再试一次呀？');
    }
}

/**
 * 处理温度滑块变化
 */
function handleTemperatureChange() {
    const value = parseFloat(elements.temperatureSlider?.value || 0.7);
    if (elements.temperatureValue) {
        elements.temperatureValue.textContent = value.toFixed(1);
    }
}

/**
 * 处理 Top P 滑块变化
 */
function handleTopPChange() {
    const value = parseFloat(elements.topPSlider?.value || 0.9);
    if (elements.topPValue) {
        elements.topPValue.textContent = value.toFixed(2);
    }
}

/**
 * 保存生成参数
 */
async function saveGenerationParams() {
    const temperature = parseFloat(elements.temperatureSlider?.value);
    const topP = parseFloat(elements.topPSlider?.value);
    
    try {
        const response = await fetch(`${API_BASE}/api/generation-params`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                temperature: temperature,
                top_p: topP
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            success('参数已经记下来啦~');
        }
    } catch (err) {
        error('呜...参数保存失败了，要不要再试一次呀？');
    }
}

/**
 * 打开设置面板
 */
export function openSettings() {
    state.isOpen = true;
    
    if (elements.settingsPanel) {
        elements.settingsPanel.classList.add('open');
    }
    if (elements.settingsOverlay) {
        elements.settingsOverlay.classList.add('visible');
    }
}

/**
 * 关闭设置面板
 */
export function closeSettings() {
    state.isOpen = false;
    
    if (elements.settingsPanel) {
        elements.settingsPanel.classList.remove('open');
    }
    if (elements.settingsOverlay) {
        elements.settingsOverlay.classList.remove('visible');
    }
}

/**
 * 处理清空数据
 */
async function handleClearData() {
    const confirmed = await showModal({
        title: '清空数据',
        message: '真的要清空所有数据吗？这样会删除我们所有的对话回忆呢...确定的话我就帮你清空啦~',
        confirmText: '嗯，清空吧',
        cancelText: '再想想',
        showCancel: true,
        type: 'danger'
    });
    
    if (!confirmed) return;
    
    try {
        await clearAllData();
        success('数据已经清空啦，页面马上刷新哦~');
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    } catch (err) {
        error('清空数据失败，请重试');
    }
}

/**
 * 保存 API Key
 */
async function handleSaveApiKey() {
    const apiKey = elements.apiKeyInput?.value.trim();
    
    if (!apiKey) {
        toast('要记得输入 API Key 哦~', 'warning');
        return;
    }
    
    try {
        await saveSetting('apiKey', apiKey);
        state.settings.apiKey = apiKey;
        
        elements.apiKeyInput.value = apiKey.substring(0, 8) + '...';
        
        success('API Key 已经保存好啦~');
    } catch (err) {
        error('呜...保存失败了，要不要再试一次呀？');
    }
}

/**
 * 获取设置
 */
export function getSettings() {
    return state.settings;
}

/**
 * 更新设置
 */
export async function updateSettings(key, value) {
    await saveSetting(key, value);
    state.settings[key] = value;
}
