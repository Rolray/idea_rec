// GeekMind - 想法记录应用 (Supabase 云端版)
// 全局错误处理
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Error: ', msg, '\nURL: ', url, '\nLine: ', lineNo, '\nColumn: ', columnNo, '\nError object: ', error);
    return false;
};

console.log('GeekMind 应用加载中...');

// Supabase 配置
const SUPABASE_URL = 'https://jxvgpejoiqczmckhglhn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4dmdwZWpvaXFjem1ja2hnbGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjQ2MjMsImV4cCI6MjA4NjgwMDYyM30.SLYf69IQK4Po3y_xxJLXSquLu0o_MTSqJzu7ryNLQbs';

// 等待 Supabase 库加载完成后初始化
let client;
function initSupabase() {
    if (typeof window.supabase !== 'undefined') {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase 初始化成功');
    } else {
        console.error('Supabase 库未加载');
        setTimeout(initSupabase, 100);
    }
}

// 全局状态
let currentUser = null;
let currentView = 'timeline';
let editingThoughtId = null;
let recognition = null;
let isRecording = false;

// DOM 元素
const authView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');
const loading = document.getElementById('loading');
const thoughtInput = document.getElementById('thought-input');
const submitBtn = document.getElementById('submit-btn');
const voiceBtn = document.getElementById('voice-btn');
const voiceIndicator = document.getElementById('voice-indicator');
const timelineView = document.getElementById('timeline-view');
const boardView = document.getElementById('board-view');
const timeline = document.getElementById('timeline');
const kanbanBoard = document.getElementById('kanban-board');
const editModal = document.getElementById('edit-modal');
const editContent = document.getElementById('edit-content');
const editStatus = document.getElementById('edit-status');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initSupabase(); // 先初始化 Supabase
    // 延迟一下确保初始化完成
    setTimeout(() => {
        initAuth();
        initEventListeners();
        initVoiceInput();
    }, 100);
});

// 初始化认证状态
async function initAuth() {
    const { data: { session } } = await client.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        showApp();
        loadThoughts();
    } else {
        showAuth();
    }
    
    // 监听认证状态变化
    client.auth.onAuthStateChange((event, session) => {
        if (session) {
            currentUser = session.user;
            showApp();
            loadThoughts();
        } else {
            currentUser = null;
            showAuth();
        }
    });
}

// 初始化事件监听
function initEventListeners() {
    console.log('初始化事件监听器...');
    
    // 表单切换 - 使用 onclick 属性确保兼容性
    const showRegisterBtn = document.getElementById('show-register');
    const showLoginBtn = document.getElementById('show-login');
    
    if (showRegisterBtn) {
        showRegisterBtn.onclick = function(e) {
            e.preventDefault();
            console.log('点击注册按钮');
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
            authError.classList.add('hidden');
        };
    }
    
    if (showLoginBtn) {
        showLoginBtn.onclick = function(e) {
            e.preventDefault();
            console.log('点击登录按钮');
            registerForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
            authError.classList.add('hidden');
        };
    }
    
    // 登录
    loginForm.addEventListener('submit', handleLogin);
    
    // 注册
    registerForm.addEventListener('submit', handleRegister);
    
    // 退出登录
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    // 视图切换
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    
    // 输入框自动调整高度
    thoughtInput.addEventListener('input', autoResizeTextarea);
    
    // 提交想法
    submitBtn.addEventListener('click', handleSubmit);
    thoughtInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    });
    
    // 语音输入
    voiceBtn.addEventListener('click', toggleVoiceInput);
    
    // 编辑弹窗
    document.getElementById('close-modal').addEventListener('click', closeEditModal);
    document.getElementById('cancel-edit').addEventListener('click', closeEditModal);
    document.getElementById('save-edit').addEventListener('click', saveEdit);
    editModal.querySelector('.modal-overlay').addEventListener('click', closeEditModal);
}

// 初始化语音输入
function initVoiceInput() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'zh-CN';
        
        recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }
            
            document.getElementById('voice-text').textContent = interimTranscript;
            
            if (finalTranscript) {
                thoughtInput.value += finalTranscript;
                autoResizeTextarea();
            }
        };
        
        recognition.onerror = (event) => {
            console.error('语音识别错误:', event.error);
            stopRecording();
        };
        
        recognition.onend = () => {
            if (isRecording) {
                stopRecording();
            }
        };
    } else {
        voiceBtn.style.display = 'none';
    }
}

// 切换语音输入
function toggleVoiceInput() {
    if (!recognition) {
        showError('您的浏览器不支持语音输入');
        return;
    }
    
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

// 开始录音
function startRecording() {
    try {
        recognition.start();
        isRecording = true;
        voiceBtn.classList.add('recording');
        voiceIndicator.classList.remove('hidden');
        document.getElementById('voice-text').textContent = '';
    } catch (e) {
        console.error('开始录音失败:', e);
    }
}

// 停止录音
function stopRecording() {
    if (recognition) {
        recognition.stop();
    }
    isRecording = false;
    voiceBtn.classList.remove('recording');
    voiceIndicator.classList.add('hidden');
}

// 处理登录
async function handleLogin(e) {
    e.preventDefault();
    showLoading();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    const { error } = await client.auth.signInWithPassword({
        email,
        password
    });
    
    hideLoading();
    
    if (error) {
        showError(error.message);
    } else {
        authError.classList.add('hidden');
    }
}

// 处理注册
async function handleRegister(e) {
    e.preventDefault();
    showLoading();
    
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm').value;
    
    if (password !== confirmPassword) {
        hideLoading();
        showError('两次输入的密码不一致');
        return;
    }
    
    const { error } = await client.auth.signUp({
        email,
        password
    });
    
    hideLoading();
    
    if (error) {
        showError(error.message);
    } else {
        alert('注册成功！请登录使用。');
        document.getElementById('show-login').click();
    }
}

// 处理退出登录
async function handleLogout() {
    await client.auth.signOut();
}

// 显示错误信息
function showError(message) {
    authError.textContent = message;
    authError.classList.remove('hidden');
}

// 显示加载
function showLoading() {
    loading.classList.remove('hidden');
}

// 隐藏加载
function hideLoading() {
    loading.classList.add('hidden');
}

// 显示认证界面
function showAuth() {
    authView.classList.add('active');
    appView.classList.remove('active');
}

// 显示应用界面
function showApp() {
    authView.classList.remove('active');
    appView.classList.add('active');
}

// 切换视图
function switchView(view) {
    currentView = view;
    
    // 更新按钮状态
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    // 更新视图显示
    timelineView.classList.toggle('active', view === 'timeline');
    boardView.classList.toggle('active', view === 'board');
}

// 自动调整文本框高度
function autoResizeTextarea() {
    thoughtInput.style.height = 'auto';
    thoughtInput.style.height = Math.min(thoughtInput.scrollHeight, 150) + 'px';
}

// 提交想法
async function handleSubmit() {
    const content = thoughtInput.value.trim();
    
    if (!content) {
        return;
    }
    
    if (!currentUser) {
        showError('请先登录');
        return;
    }
    
    submitBtn.disabled = true;
    
    const { error } = await client
        .from('thoughts')
        .insert({
            user_id: currentUser.id,
            content: content,
            status: 'idea'
        });
    
    submitBtn.disabled = false;
    
    if (error) {
        console.error('保存想法失败:', error);
        showError('保存失败: ' + error.message);
    } else {
        thoughtInput.value = '';
        autoResizeTextarea();
        loadThoughts();
    }
}

// 加载想法
async function loadThoughts() {
    if (!currentUser) return;
    
    const { data, error } = await client
        .from('thoughts')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('加载想法失败:', error);
        return;
    }
    
    renderTimeline(data);
    renderKanban(data);
}

// 渲染时间轴
function renderTimeline(thoughts) {
    if (!thoughts || thoughts.length === 0) {
        timeline.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                    <path d="M2 17l10 5 10-5"></path>
                    <path d="M2 12l10 5 10-5"></path>
                </svg>
                <p>还没有记录任何想法</p>
                <p>在上方输入框记录你的第一个想法吧！</p>
            </div>
        `;
        return;
    }
    
    timeline.innerHTML = thoughts.map(thought => `
        <div class="timeline-item status-${thought.status}" data-id="${thought.id}">
            <div class="timeline-dot"></div>
            <div class="thought-card">
                <div class="thought-header">
                    <div class="thought-meta">
                        <span class="thought-status status-${thought.status}">
                            <span class="status-dot"></span>
                            ${getStatusText(thought.status)}
                        </span>
                        <span class="thought-time">${formatTime(thought.created_at)}</span>
                    </div>
                    <div class="thought-actions">
                        <button class="edit-btn" title="编辑" data-id="${thought.id}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="delete-btn" title="删除" data-id="${thought.id}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="thought-content">${escapeHtml(thought.content)}</div>
            </div>
        </div>
    `).join('');
    
    // 添加事件监听
    timeline.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    
    timeline.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteThought(btn.dataset.id));
    });
}

// 渲染看板
function renderKanban(thoughts) {
    const columns = {
        idea: [],
        todo: [],
        done: []
    };
    
    thoughts.forEach(thought => {
        if (columns[thought.status]) {
            columns[thought.status].push(thought);
        } else {
            columns.idea.push(thought);
        }
    });
    
    // 更新计数
    document.getElementById('count-idea').textContent = columns.idea.length;
    document.getElementById('count-todo').textContent = columns.todo.length;
    document.getElementById('count-done').textContent = columns.done.length;
    
    // 渲染列
    Object.keys(columns).forEach(status => {
        const column = document.getElementById(`column-${status}`);
        
        if (columns[status].length === 0) {
            column.innerHTML = `
                <div class="empty-state" style="padding: 20px 10px;">
                    <p>暂无内容</p>
                </div>
            `;
            return;
        }
        
        column.innerHTML = columns[status].map(thought => `
            <div class="kanban-card" data-id="${thought.id}">
                <span class="thought-time">${formatTime(thought.created_at)}</span>
                <div class="thought-content">${escapeHtml(thought.content)}</div>
            </div>
        `).join('');
        
        // 添加点击事件
        column.querySelectorAll('.kanban-card').forEach(card => {
            card.addEventListener('click', () => openEditModal(card.dataset.id));
        });
    });
}

// 打开编辑弹窗
async function openEditModal(id) {
    const { data, error } = await client
        .from('thoughts')
        .select('*')
        .eq('id', id)
        .single();
    
    if (error || !data) {
        console.error('获取想法失败:', error);
        return;
    }
    
    editingThoughtId = id;
    editContent.value = data.content;
    editStatus.value = data.status;
    editModal.classList.remove('hidden');
}

// 关闭编辑弹窗
function closeEditModal() {
    editModal.classList.add('hidden');
    editingThoughtId = null;
    editContent.value = '';
}

// 保存编辑
async function saveEdit() {
    if (!editingThoughtId) return;
    
    const content = editContent.value.trim();
    const status = editStatus.value;
    
    if (!content) {
        return;
    }
    
    const { error } = await client
        .from('thoughts')
        .update({ content, status })
        .eq('id', editingThoughtId);
    
    if (error) {
        console.error('更新失败:', error);
        showError('更新失败: ' + error.message);
    } else {
        closeEditModal();
        loadThoughts();
    }
}

// 删除想法
async function deleteThought(id) {
    if (!confirm('确定要删除这条记录吗？')) return;
    
    const { error } = await client
        .from('thoughts')
        .delete()
        .eq('id', id);
    
    if (error) {
        console.error('删除失败:', error);
    } else {
        loadThoughts();
    }
}

// 格式化时间
function formatTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    
    return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 获取状态文本
function getStatusText(status) {
    const statusMap = {
        'idea': '想法',
        'todo': '待办',
        'done': '完成'
    };
    return statusMap[status] || '想法';
}

// 转义 HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
