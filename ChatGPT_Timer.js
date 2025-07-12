// ==UserScript==
// @name         ChatGPT回复计时器
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  计时 ChatGPT 每次回复耗时（修复完整版 - 计时到回复完成）
// @author       schweigen
// @match        https://chatgpt.com/*
// @exclude      https://chatgpt.com/codex*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // 全局变量定义
    let startTime = null;
    let timerInterval = null;
    let timerDisplay = null;
    let timerContainer = null;
    let isGenerating = false;
    let lastRequestTime = 0;
    let confirmationTimer = null;

    // 防止重复初始化
    let isInitialized = false;

    // 用于清理的观察者列表
    let observers = [];
    let abortController = null;

    // 新增：流式响应监控
    let streamEndTimer = null;
    let lastStreamActivity = 0;
    let isStreamActive = false;

    // 节流函数
    function throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }

    // 防抖函数
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // 安全清理函数
    function cleanup() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        if (confirmationTimer) {
            clearTimeout(confirmationTimer);
            confirmationTimer = null;
        }

        if (streamEndTimer) {
            clearTimeout(streamEndTimer);
            streamEndTimer = null;
        }

        observers.forEach(observer => {
            if (observer && observer.disconnect) {
                observer.disconnect();
            }
        });
        observers = [];

        if (abortController) {
            abortController.abort();
            abortController = null;
        }

        isGenerating = false;
        isStreamActive = false;
    }

    // 创建并添加计时器显示到页面
    function createTimerDisplay() {
        if (document.getElementById('chatgpt-mini-timer')) return;

        timerContainer = document.createElement('div');
        timerContainer.id = 'chatgpt-mini-timer';

        Object.assign(timerContainer.style, {
            position: 'fixed',
            right: '20px',
            top: '80%',
            transform: 'translateY(-50%)',
            zIndex: '10000',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '20px',
            fontFamily: 'monospace',
            fontSize: '16px',
            fontWeight: 'bold',
            boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)',
            transition: 'opacity 0.3s',
            opacity: '0.8',
            userSelect: 'none',
            cursor: 'pointer'
        });

        timerContainer.addEventListener('mouseenter', () => {
            timerContainer.style.opacity = '1';
        });

        timerContainer.addEventListener('mouseleave', () => {
            timerContainer.style.opacity = '0.8';
        });

        timerContainer.addEventListener('click', () => {
            if (isGenerating) {
                stopTimer();
            } else {
                startTimer(true);
            }
        });

        const statusText = document.createElement('div');
        statusText.textContent = '就绪';
        statusText.style.fontSize = '12px';
        statusText.style.marginBottom = '4px';
        statusText.style.textAlign = 'center';
        timerContainer.appendChild(statusText);

        timerDisplay = document.createElement('div');
        timerDisplay.textContent = '0.0s';
        timerDisplay.style.textAlign = 'center';
        timerContainer.appendChild(timerDisplay);

        document.body.appendChild(timerContainer);
        timerContainer.title = "点击可手动开始/停止计时\nAlt+S: 手动开始 | Alt+P: 手动停止";
    }

    // 开始计时
    function startTimer(immediate = false) {
        if (isGenerating) return;

        if (confirmationTimer) {
            clearTimeout(confirmationTimer);
            confirmationTimer = null;
        }

        if (!immediate) {
            confirmationTimer = setTimeout(() => {
                startTimer(true);
            }, 100);

            if (timerContainer) {
                timerContainer.firstChild.textContent = '准备计时...';
            }
            return;
        }

        isGenerating = true;
        isStreamActive = false;
        startTime = Date.now();
        lastStreamActivity = Date.now();

        if (timerDisplay) {
            timerDisplay.textContent = '0.0s';
        }
        if (timerContainer) {
            timerContainer.style.color = '#ffcc00';
            timerContainer.firstChild.textContent = '计时中...';
        }

        if (timerInterval) {
            clearInterval(timerInterval);
        }

        timerInterval = setInterval(() => {
            if (startTime && timerDisplay) {
                const elapsed = (Date.now() - startTime) / 1000;
                timerDisplay.textContent = `${elapsed.toFixed(1)}s`;
            }
        }, 100);

        console.log('[ChatGPT计时器] 开始计时');
    }

    // 停止计时
    function stopTimer() {
        if (!isGenerating) return;

        if (confirmationTimer) {
            clearTimeout(confirmationTimer);
            confirmationTimer = null;
        }

        if (streamEndTimer) {
            clearTimeout(streamEndTimer);
            streamEndTimer = null;
        }

        isGenerating = false;
        isStreamActive = false;

        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        if (startTime && timerDisplay && timerContainer) {
            const elapsed = (Date.now() - startTime) / 1000;
            timerDisplay.textContent = `${elapsed.toFixed(1)}s`;
            timerContainer.style.color = 'white';
            timerContainer.firstChild.textContent = '已完成';

            console.log('[ChatGPT计时器] 停止计时，总耗时：', elapsed.toFixed(1), '秒');

            setTimeout(() => {
                if (!isGenerating && timerContainer) {
                    timerContainer.firstChild.textContent = '就绪';
                }
            }, 5000);
        }
    }

    // 检查流是否真正结束的函数
    function checkStreamEnd() {
        if (!isGenerating || !isStreamActive) return;

        const now = Date.now();
        const timeSinceLastActivity = now - lastStreamActivity;

        // 如果超过2秒没有流活动，认为流已结束
        if (timeSinceLastActivity > 2000) {
            console.log('[ChatGPT计时器] 流活动停止超过2秒，检查是否真正完成');

            // 额外检查：看是否有"思考中"或加载状态
            const isThinking = document.querySelector('[data-message-author-role="assistant"]') &&
                             document.body.textContent.includes('Thinking');

            // 检查是否有停止生成按钮（表示还在生成中）
            const stopButton = document.querySelector('[data-testid="stop-button"]') ||
                             document.querySelector('button[aria-label*="stop"]') ||
                             document.querySelector('button[aria-label*="Stop"]');

            if (!isThinking && !stopButton) {
                console.log('[ChatGPT计时器] 确认回复完成，停止计时');
                stopTimer();
            } else {
                console.log('[ChatGPT计时器] 检测到仍在生成中，继续等待');
                // 重新设置检查
                streamEndTimer = setTimeout(checkStreamEnd, 1000);
            }
        } else {
            // 重新设置检查
            streamEndTimer = setTimeout(checkStreamEnd, 1000);
        }
    }

    // 修复版：使用Fetch API拦截器监控网络请求
    function setupNetworkMonitoring() {
        const originalFetch = window.fetch;

        window.fetch = async function(...args) {
            const [url, options] = args;

            const isChatGPTRequest = typeof url === 'string' && (
                url.includes('/api/conversation') ||
                url.includes('/backend-api/conversation') ||
                url.includes('/v1/chat/completions')
            );

            const isMessageSendRequest = isChatGPTRequest &&
                options &&
                options.method === 'POST' &&
                options.body;

            if (isMessageSendRequest && (Date.now() - lastRequestTime > 1000)) {
                console.log('[ChatGPT计时器] 检测到消息发送请求');
                lastRequestTime = Date.now();
                startTimer();

                try {
                    const response = await originalFetch.apply(this, args);
                    const originalResponse = response.clone();

                    if (response.ok) {
                        if (response.headers.get('content-type')?.includes('text/event-stream')) {
                            console.log('[ChatGPT计时器] 检测到流式响应');
                            isStreamActive = true;
                            lastStreamActivity = Date.now();

                            const reader = response.body.getReader();
                            const decoder = new TextDecoder();
                            let streamClosed = false;

                            // 开始检查流结束
                            if (streamEndTimer) {
                                clearTimeout(streamEndTimer);
                            }
                            streamEndTimer = setTimeout(checkStreamEnd, 2000);

                            const processStream = async () => {
                                try {
                                    while (!streamClosed) {
                                        const result = await Promise.race([
                                            reader.read(),
                                            new Promise((_, reject) =>
                                                setTimeout(() => reject(new Error('Read timeout')), 30000)
                                            )
                                        ]);

                                        if (result.done) {
                                            streamClosed = true;
                                            console.log('[ChatGPT计时器] 流数据读取完成');
                                            // 不要立即停止计时，等待检查机制确认
                                            break;
                                        } else {
                                            // 更新流活动时间
                                            lastStreamActivity = Date.now();

                                            // 解码数据以检查内容
                                            const chunk = decoder.decode(result.value, { stream: true });

                                            // 检查是否包含结束标志
                                            if (chunk.includes('[DONE]') || chunk.includes('data: [DONE]')) {
                                                console.log('[ChatGPT计时器] 检测到流结束标志');
                                                streamClosed = true;
                                                // 延迟一点再检查，确保UI更新完成
                                                setTimeout(() => {
                                                    if (streamEndTimer) {
                                                        clearTimeout(streamEndTimer);
                                                    }
                                                    streamEndTimer = setTimeout(checkStreamEnd, 500);
                                                }, 300);
                                                break;
                                            }
                                        }
                                    }
                                } catch (error) {
                                    streamClosed = true;
                                    console.log('[ChatGPT计时器] 流读取错误:', error.message);
                                    // 出错时也要检查是否真正完成
                                    setTimeout(() => {
                                        if (streamEndTimer) {
                                            clearTimeout(streamEndTimer);
                                        }
                                        streamEndTimer = setTimeout(checkStreamEnd, 1000);
                                    }, 500);
                                } finally {
                                    try {
                                        reader.releaseLock();
                                    } catch (e) {
                                        // 忽略释放锁的错误
                                    }
                                }
                            };

                            processStream();
                            return originalResponse;
                        } else {
                            console.log('[ChatGPT计时器] 检测到普通响应');
                            // 对于非流式响应，延迟停止以确保内容渲染完成
                            setTimeout(() => {
                                console.log('[ChatGPT计时器] 普通响应完成，停止计时');
                                stopTimer();
                            }, 1000);
                            return originalResponse;
                        }
                    } else {
                        console.log('[ChatGPT计时器] 请求失败，停止计时');
                        stopTimer();
                        return originalResponse;
                    }
                } catch (error) {
                    console.error('[ChatGPT计时器] 请求异常：', error);
                    stopTimer();
                    throw error;
                }
            }

            return originalFetch.apply(this, args);
        };
    }

    // 修复版：监控XMLHttpRequest请求
    function setupXHRMonitoring() {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url, ...args) {
            this._chatgptTimerUrl = url;
            this._chatgptTimerMethod = method;
            return originalOpen.apply(this, [method, url, ...args]);
        };

        XMLHttpRequest.prototype.send = function(body) {
            const url = this._chatgptTimerUrl;
            const method = this._chatgptTimerMethod;

            const isChatGPTRequest = typeof url === 'string' && (
                url.includes('/api/conversation') ||
                url.includes('/backend-api/conversation') ||
                url.includes('/v1/chat/completions')
            );

            const isMessageSendRequest = isChatGPTRequest &&
                method === 'POST' &&
                body;

            if (isMessageSendRequest && (Date.now() - lastRequestTime > 1000)) {
                console.log('[ChatGPT计时器] XHR: 检测到消息发送请求');
                lastRequestTime = Date.now();
                startTimer();

                const handleComplete = () => {
                    // XHR完成后也要延迟检查
                    setTimeout(() => {
                        console.log('[ChatGPT计时器] XHR: 请求完成，检查是否真正完成');
                        if (streamEndTimer) {
                            clearTimeout(streamEndTimer);
                        }
                        streamEndTimer = setTimeout(checkStreamEnd, 1000);
                    }, 500);
                };

                this.addEventListener('load', handleComplete, { once: true });
                this.addEventListener('error', () => stopTimer(), { once: true });
                this.addEventListener('abort', () => stopTimer(), { once: true });
            }

            return originalSend.apply(this, arguments);
        };
    }

    // 修复版：特殊监测"Thinking"文本
    function setupThinkingDetection() {
        const throttledCallback = throttle((mutations) => {
            if (isGenerating) return;

            const chatContainer = document.querySelector('main') ||
                                document.querySelector('[role="main"]') ||
                                document.body;

            const thinkingElements = chatContainer.querySelectorAll('*');
            for (let element of thinkingElements) {
                const text = element.textContent || '';
                if (text.includes('Thinking') ||
                    text.includes('thinking...') ||
                    text.includes('思考中') ||
                    text.includes('正在思考')) {
                    console.log('[ChatGPT计时器] 检测到"Thinking"文本，开始计时');
                    startTimer();
                    break;
                }
            }
        }, 500);

        const observer = new MutationObserver(throttledCallback);

        const targetNode = document.querySelector('main') || document.body;
        observer.observe(targetNode, {
            childList: true,
            subtree: true,
            characterData: true
        });

        observers.push(observer);
    }

    // 更精确的DOM完成检测
    function setupDOMCompletionDetection() {
        const throttledCallback = throttle((mutations) => {
            if (!isGenerating) return;

            // 检查停止按钮是否消失（更准确的完成指标）
            const stopButton = document.querySelector('[data-testid="stop-button"]') ||
                             document.querySelector('button[aria-label*="stop"]') ||
                             document.querySelector('button[aria-label*="Stop"]');

            // 检查是否还在思考
            const isThinking = document.body.textContent.includes('Thinking');

            // 检查操作按钮是否出现
            const actionButtons = document.querySelectorAll([
                '[data-testid="copy-turn-action-button"]',
                '[data-testid="good-response-turn-action-button"]',
                '[data-testid="bad-response-turn-action-button"]',
                '[data-testid="voice-play-turn-action-button"]'
            ].join(','));

            // 只有当没有停止按钮、没有思考状态、且有操作按钮时才认为完成
            if (!stopButton && !isThinking && actionButtons.length > 0) {
                // 额外延迟确保真正完成
                setTimeout(() => {
                    const stillGenerating = document.querySelector('[data-testid="stop-button"]') ||
                                          document.body.textContent.includes('Thinking');
                    if (!stillGenerating) {
                        console.log('[ChatGPT计时器] DOM检测确认回复完成，停止计时');
                        stopTimer();
                    }
                }, 1000);
            }
        }, 300);

        const observer = new MutationObserver(throttledCallback);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-testid', 'aria-label']
        });

        observers.push(observer);
    }

    // 检测用户输入
    function setupUserInputDetection() {
        const handleFocusIn = (event) => {
            if (event.target.tagName === 'TEXTAREA' ||
                event.target.tagName === 'INPUT' ||
                event.target.getAttribute('role') === 'textbox' ||
                event.target.getAttribute('contenteditable') === 'true') {
                window._userIsTyping = true;
            }
        };

        const handleFocusOut = (event) => {
            if (event.target.tagName === 'TEXTAREA' ||
                event.target.tagName === 'INPUT' ||
                event.target.getAttribute('role') === 'textbox' ||
                event.target.getAttribute('contenteditable') === 'true') {
                window._userIsTyping = false;
            }
        };

        document.addEventListener('focusin', handleFocusIn);
        document.addEventListener('focusout', handleFocusOut);
    }

    // 添加键盘快捷键支持
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            if (event.altKey) {
                if (event.key === 's' || event.key === 'S') {
                    startTimer(true);
                    event.preventDefault();
                } else if (event.key === 'p' || event.key === 'P') {
                    stopTimer();
                    event.preventDefault();
                }
            }
        });
    }

    // 初始化函数
    function initialize() {
        if (isInitialized) {
            console.log('[ChatGPT计时器] 已经初始化过了，跳过重复初始化');
            return;
        }

        try {
            createTimerDisplay();
            setupNetworkMonitoring();
            setupXHRMonitoring();
            setupThinkingDetection();
            setupDOMCompletionDetection();
            setupUserInputDetection();
            setupKeyboardShortcuts();

            isInitialized = true;
            console.log('[ChatGPT计时器] 初始化完成，等待使用...');
        } catch (error) {
            console.error('[ChatGPT计时器] 初始化失败:', error);
        }
    }

    // 页面卸载时清理
    window.addEventListener('beforeunload', cleanup);

    // 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cleanup();
        }
    });

    // 页面加载完成后初始化
    if (document.readyState === 'complete') {
        setTimeout(initialize, 1000);
    } else {
        window.addEventListener('load', () => {
            setTimeout(initialize, 1000);
        });
    }

    // 备用初始化
    setTimeout(() => {
        if (!isInitialized) {
            initialize();
        }
    }, 3000);

})();
