/**
 * IndexedDB 操作模块
 */

const DB_NAME = 'LunaDB';
const DB_VERSION = 1;

let db = null;

/**
 * 初始化数据库
 */
export async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            // 对话历史存储
            if (!database.objectStoreNames.contains('conversations')) {
                const conversationStore = database.createObjectStore('conversations', {
                    keyPath: 'id',
                    autoIncrement: true
                });
                conversationStore.createIndex('timestamp', 'timestamp', { unique: false });
            }

            // 设置存储
            if (!database.objectStoreNames.contains('settings')) {
                database.createObjectStore('settings', { keyPath: 'key' });
            }

            // 消息存储
            if (!database.objectStoreNames.contains('messages')) {
                const messageStore = database.createObjectStore('messages', {
                    keyPath: 'id',
                    autoIncrement: true
                });
                messageStore.createIndex('conversationId', 'conversationId', { unique: false });
                messageStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

/**
 * 获取数据库实例
 */
function getDB() {
    if (!db) {
        throw new Error('Database not initialized');
    }
    return db;
}

// ==================== 对话操作 ====================

/**
 * 创建新对话
 */
export async function createConversation() {
    return new Promise((resolve, reject) => {
        const transaction = getDB().transaction(['conversations'], 'readwrite');
        const store = transaction.objectStore('conversations');
        
        const conversation = {
            title: '新对话',
            timestamp: Date.now(),
            createdAt: new Date().toISOString()
        };

        const request = store.add(conversation);
        request.onsuccess = () => resolve({ ...conversation, id: request.result });
        request.onerror = () => reject(request.error);
    });
}

/**
 * 获取所有对话
 */
export async function getAllConversations() {
    return new Promise((resolve, reject) => {
        const transaction = getDB().transaction(['conversations'], 'readonly');
        const store = transaction.objectStore('conversations');
        const index = store.index('timestamp');
        
        const request = index.openCursor(null, 'prev');
        const conversations = [];

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                conversations.push(cursor.value);
                cursor.continue();
            } else {
                resolve(conversations);
            }
        };

        request.onerror = () => reject(request.error);
    });
}

/**
 * 更新对话
 */
export async function updateConversation(id, updates) {
    return new Promise((resolve, reject) => {
        const transaction = getDB().transaction(['conversations'], 'readwrite');
        const store = transaction.objectStore('conversations');
        
        const getRequest = store.get(id);
        
        getRequest.onsuccess = () => {
            const conversation = { ...getRequest.result, ...updates, timestamp: Date.now() };
            const putRequest = store.put(conversation);
            putRequest.onsuccess = () => resolve(conversation);
            putRequest.onerror = () => reject(putRequest.error);
        };

        getRequest.onerror = () => reject(getRequest.error);
    });
}

/**
 * 删除对话及其消息
 */
export async function deleteConversation(id) {
    return new Promise(async (resolve, reject) => {
        try {
            await deleteMessagesByConversation(id);
            
            const transaction = getDB().transaction(['conversations'], 'readwrite');
            const store = transaction.objectStore('conversations');
            store.delete(id);
            
            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => reject(transaction.error);
        } catch (error) {
            reject(error);
        }
    });
}

// ==================== 消息操作 ====================

/**
 * 添加消息
 */
export async function addMessage(conversationId, message) {
    return new Promise((resolve, reject) => {
        const transaction = getDB().transaction(['messages'], 'readwrite');
        const store = transaction.objectStore('messages');

        const msg = {
            ...message,
            conversationId,
            timestamp: Date.now(),
            createdAt: new Date().toISOString()
        };

        const request = store.add(msg);
        request.onsuccess = () => resolve({ ...msg, id: request.result });
        request.onerror = () => reject(request.error);
    });
}

/**
 * 获取对话的所有消息
 */
export async function getMessagesByConversation(conversationId) {
    return new Promise((resolve, reject) => {
        const transaction = getDB().transaction(['messages'], 'readonly');
        const store = transaction.objectStore('messages');
        const index = store.index('conversationId');

        const request = index.getAll(conversationId);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 删除对话的所有消息
 */
async function deleteMessagesByConversation(conversationId) {
    return new Promise((resolve, reject) => {
        const transaction = getDB().transaction(['messages'], 'readwrite');
        const store = transaction.objectStore('messages');
        const index = store.index('conversationId');

        const request = index.openCursor(conversationId);

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };

        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error);
    });
}

/**
 * 更新消息
 */
export async function updateMessage(id, updates) {
    return new Promise((resolve, reject) => {
        const transaction = getDB().transaction(['messages'], 'readwrite');
        const store = transaction.objectStore('messages');

        const getRequest = store.get(id);

        getRequest.onsuccess = () => {
            const message = { ...getRequest.result, ...updates };
            const putRequest = store.put(message);
            putRequest.onsuccess = () => resolve(message);
            putRequest.onerror = () => reject(putRequest.error);
        };

        getRequest.onerror = () => reject(getRequest.error);
    });
}

// ==================== 设置操作 ====================

/**
 * 保存设置
 */
export async function saveSetting(key, value) {
    return new Promise((resolve, reject) => {
        const transaction = getDB().transaction(['settings'], 'readwrite');
        const store = transaction.objectStore('settings');

        const request = store.put({ key, value });
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 获取设置
 */
export async function getSetting(key) {
    return new Promise((resolve, reject) => {
        const transaction = getDB().transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');

        const request = store.get(key);
        request.onsuccess = () => resolve(request.result?.value ?? null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 获取所有设置
 */
export async function getAllSettings() {
    return new Promise((resolve, reject) => {
        const transaction = getDB().transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');

        const request = store.getAll();
        request.onsuccess = () => {
            const settings = {};
            (request.result || []).forEach(item => {
                settings[item.key] = item.value;
            });
            resolve(settings);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * 清空所有数据
 */
export async function clearAllData() {
    return new Promise((resolve, reject) => {
        const transaction = getDB().transaction(['conversations', 'messages', 'settings'], 'readwrite');

        transaction.objectStore('conversations').clear();
        transaction.objectStore('messages').clear();
        transaction.objectStore('settings').clear();

        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error);
    });
}
