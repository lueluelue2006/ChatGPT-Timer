// ==UserScript==
// @name         ChatGPT回复计时器
// @namespace    http://tampermonkey.net/
// @version      2.1.2
// @description  计时 ChatGPT 每次回复耗时
// @author       schweigen
// @match        https://chatgpt.com/*
// @exclude      https://chatgpt.com/codex*
// @grant        none
// @license      MIT
// @downloadURL  https://update.greasyfork.org/scripts/533404/ChatGPT%E5%9B%9E%E5%A4%8D%E8%AE%A1%E6%97%B6%E5%99%A8.user.js
// @updateURL    https://update.greasyfork.org/scripts/533404/ChatGPT%E5%9B%9E%E5%A4%8D%E8%AE%A1%E6%97%B6%E5%99%A8.meta.js
// ==/UserScript==


(function() {
    'use strict';

    // 全局变量定义
    let startTime = null;      // 记录开始时间的时间戳
    let timerInterval = null;  // 计时器的间隔ID
    let timerDisplay = null;   // 显示时间的DOM元素
    let timerContainer = null; // 计时器容器DOM元素
    let isGenerating = false;  // 标记是否正在生成回答
    let lastRequestTime = 0;   // 上次请求的时间戳（用于防止重复计时）
    let confirmationTimer = null; // 用于确认真实响应的计时器

    // 创建并添加计时器显示到页面
    function createTimerDisplay() {
        if (document.getElementById('chatgpt-mini-timer')) return; // 如果计时器已存在则不重复创建

        // 创建主容器
        timerContainer = document.createElement('div');
        timerContainer.id = 'chatgpt-mini-timer';
        timerContainer.style.position = 'fixed';
        timerContainer.style.right = '20px'; // 定位在右侧
        timerContainer.style.top = '80%';    // 靠下位置
        timerContainer.style.transform = 'translateY(-50%)';
        timerContainer.style.zIndex = '10000';
        timerContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        timerContainer.style.color = 'white';
        timerContainer.style.padding = '8px 12px';
        timerContainer.style.borderRadius = '20px';
        timerContainer.style.fontFamily = 'monospace';
        timerContainer.style.fontSize = '16px';
        timerContainer.style.fontWeight = 'bold';
        timerContainer.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
        timerContainer.style.transition = 'opacity 0.3s';
        timerContainer.style.opacity = '0.8';
        timerContainer.style.userSelect = 'none';
        timerContainer.style.cursor = 'pointer'; // 添加鼠标指针样式

        // 鼠标悬停效果
        timerContainer.addEventListener('mouseenter', () => {
            timerContainer.style.opacity = '1'; // 鼠标悬停时增加不透明度
        });

        timerContainer.addEventListener('mouseleave', () => {
            timerContainer.style.opacity = '0.8'; // 鼠标离开时恢复原透明度
        });

        // 添加点击事件，点击计时器可以手动停止/开始计时
        timerContainer.addEventListener('click', () => {
            if (isGenerating) {
                stopTimer();
            } else {
                startTimer();
            }
        });

        // 创建状态文本元素
        const statusText = document.createElement('div');
        statusText.textContent = '就绪';
        statusText.style.fontSize = '12px';
        statusText.style.marginBottom = '4px';
        statusText.style.textAlign = 'center';
        timerContainer.appendChild(statusText);

        // 创建时间显示元素
        timerDisplay = document.createElement('div');
        timerDisplay.textContent = '0.0s';
        timerDisplay.style.textAlign = 'center';
        timerContainer.appendChild(timerDisplay);

        // 将计时器添加到页面
        document.body.appendChild(timerContainer);

        // 添加提示信息
        timerContainer.title = "点击可手动开始/停止计时\nAlt+S: 手动开始 | Alt+P: 手动停止";
    }

    // 验证是否真的在生成回答 - 简化验证逻辑，提高启动成功率
    function isActuallyGenerating() {
        // 宽松的检测条件，任何看起来像响应处理的情况都会返回true
        return true;
    }

    // 开始计时
    function startTimer(immediate = false) {
        if (isGenerating) return; // 如果已经在计时中则不重复启动
        
        // 简化验证过程，仅短暂延迟以过滤极短的误触发
        if (!immediate) {
            if (confirmationTimer) {
                clearTimeout(confirmationTimer);
            }
            
            confirmationTimer = setTimeout(() => {
                startTimer(true); // 几乎无条件启动
            }, 100); // 缩短延迟到100ms
            
            timerContainer.firstChild.textContent = '准备计时...'; // 更新状态文本
            return;
        }

        isGenerating = true;
        startTime = Date.now(); // 记录开始时间
        timerDisplay.textContent = '0.0s';
        timerContainer.style.color = '#ffcc00'; // 计时中显示黄色
        timerContainer.firstChild.textContent = '计时中...'; // 更新状态文本

        // 设置定时器每100毫秒更新一次显示时间
        timerInterval = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            timerDisplay.textContent = `${elapsed.toFixed(1)}s`;
        }, 100);

        console.log('[ChatGPT计时器] 开始计时');
    }

    // 停止计时
    function stopTimer() {
        if (!isGenerating) return; // 如果没有在计时则不执行

        // 清除确认计时器
        if (confirmationTimer) {
            clearTimeout(confirmationTimer);
            confirmationTimer = null;
        }

        isGenerating = false;

        // 清除计时器
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        // 计算并显示最终时间
        const elapsed = (Date.now() - startTime) / 1000;
        timerDisplay.textContent = `${elapsed.toFixed(1)}s`;
        timerContainer.style.color = 'white'; // 恢复为白色
        timerContainer.firstChild.textContent = '已完成'; // 更新状态文本

        console.log('[ChatGPT计时器] 停止计时，总耗时：', elapsed.toFixed(1), '秒');

        // 5秒后重置状态文本
        setTimeout(() => {
            if (!isGenerating) {
                timerContainer.firstChild.textContent = '就绪';
            }
        }, 5000);
    }

    // 使用Fetch API拦截器监控网络请求
    function setupNetworkMonitoring() {
        // 保存原始的fetch函数
        const originalFetch = window.fetch;

        // 重写fetch函数以监控请求
        window.fetch = async function(...args) {
            const [url, options] = args;

            // 检查是否是ChatGPT的API请求
            const isChatGPTRequest = typeof url === 'string' && (
                url.includes('/api/conversation') ||
                url.includes('/backend-api/conversation') ||
                url.includes('/v1/chat/completions')
            );

            // 检查是否是发送消息的POST请求，简化请求验证标准
            const isMessageSendRequest = isChatGPTRequest &&
                options &&
                options.method === 'POST' &&
                options.body;

            // 如果是发送消息请求，且距离上次请求已经过了至少1秒（防止重复触发但降低门槛）
            if (isMessageSendRequest && (Date.now() - lastRequestTime > 1000)) {
                console.log('[ChatGPT计时器] 检测到消息发送请求');
                lastRequestTime = Date.now();

                // 开始计时
                startTimer();

                // 监控请求完成
                try {
                    const response = await originalFetch.apply(this, args);

                    // 创建一个新的响应对象进行包装
                    const originalResponse = response.clone();

                    // 判断请求是否成功
                    if (response.ok) {
                        // 如果是流式响应，监控流的结束
                        if (response.headers.get('content-type')?.includes('text/event-stream')) {
                            console.log('[ChatGPT计时器] 检测到流式响应');

                            // 创建一个Reader来读取流
                            const reader = response.body.getReader();
                            let streamClosed = false;

                            // 读取流直到结束
                            const processStream = async () => {
                                try {
                                    while (!streamClosed) {
                                        const { done } = await reader.read();
                                        if (done) {
                                            streamClosed = true;
                                            console.log('[ChatGPT计时器] 流结束，停止计时');
                                            stopTimer();
                                            break;
                                        }
                                    }
                                } catch (error) {
                                    console.log('[ChatGPT计时器] 流读取错误，停止计时');
                                    stopTimer();
                                }
                            };

                            // 启动流处理
                            processStream();

                            // 为了不影响原始响应，我们返回克隆的响应
                            return originalResponse;
                        } else {
                            // 普通响应，响应完成时停止计时
                            console.log('[ChatGPT计时器] 检测到普通响应');
                            response.json().then(() => {
                                console.log('[ChatGPT计时器] 响应完成，停止计时');
                                stopTimer();
                            }).catch(() => {
                                // 如果无法解析为JSON，也停止计时
                                console.log('[ChatGPT计时器] 响应解析错误，停止计时');
                                stopTimer();
                            });

                            return originalResponse;
                        }
                    } else {
                        // 请求失败，停止计时
                        console.log('[ChatGPT计时器] 请求失败，停止计时');
                        stopTimer();
                        return originalResponse;
                    }
                } catch (error) {
                    // 捕获请求错误，停止计时
                    console.error('[ChatGPT计时器] 请求异常：', error);
                    stopTimer();
                    throw error; // 重新抛出异常
                }
            }

            // 对于其他请求，直接使用原始fetch
            return originalFetch.apply(this, args);
        };
    }

    // 监控XMLHttpRequest请求（作为Fetch API的备份）
    function setupXHRMonitoring() {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        // 重写open方法
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
            this._chatgptTimerUrl = url;
            this._chatgptTimerMethod = method;
            return originalOpen.apply(this, [method, url, ...args]);
        };

        // 重写send方法
        XMLHttpRequest.prototype.send = function(body) {
            const url = this._chatgptTimerUrl;
            const method = this._chatgptTimerMethod;

            // 检查是否是ChatGPT的API请求
            const isChatGPTRequest = typeof url === 'string' && (
                url.includes('/api/conversation') ||
                url.includes('/backend-api/conversation') ||
                url.includes('/v1/chat/completions')
            );

            // 检查是否是发送消息的POST请求，简化XHR请求验证标准
            const isMessageSendRequest = isChatGPTRequest &&
                method === 'POST' &&
                body;

            // 如果是发送消息请求，且距离上次请求已经过了至少1秒（防止重复触发但降低门槛）
            if (isMessageSendRequest && (Date.now() - lastRequestTime > 1000)) {
                console.log('[ChatGPT计时器] XHR: 检测到消息发送请求');
                lastRequestTime = Date.now();

                // 开始计时
                startTimer();

                // 添加加载完成事件监听器
                this.addEventListener('load', () => {
                    console.log('[ChatGPT计时器] XHR: 请求完成，停止计时');
                    stopTimer();
                });

                // 添加错误事件监听器
                this.addEventListener('error', () => {
                    console.log('[ChatGPT计时器] XHR: 请求错误，停止计时');
                    stopTimer();
                });

                // 添加终止事件监听器
                this.addEventListener('abort', () => {
                    console.log('[ChatGPT计时器] XHR: 请求中止，停止计时');
                    stopTimer();
                });
            }

            return originalSend.apply(this, arguments);
        };
    }

    // 特殊监测"Thinking"文本 - 修改后只在ChatGPT回复区域内检测
    function setupThinkingDetection() {
        // 创建一个MutationObserver来监视DOM变化
        const observer = new MutationObserver((mutations) => {
            // 如果已经在计时中，不需要重复检测
            if (isGenerating) return;

            // 只在ChatGPT回复区域内检测，而不是整个document
            const chatArea = document.querySelector('.chat-content-wrapper') || document.body;
            
            // 检查是否有"Thinking"相关文本
            const thinkingElements = document.evaluate(
                ".//*[contains(text(), 'Thinking') or contains(text(), 'thinking...') or contains(text(), '思考中') or contains(text(), '正在思考')]",
                chatArea,
                null,
                XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
                null
            );

            // 如果找到包含"Thinking"的元素
            if (thinkingElements.snapshotLength > 0) {
                console.log('[ChatGPT计时器] 检测到"Thinking"文本，开始计时');
                startTimer();
            }
        });

        // 开始观察整个文档，但通过查询选择器限制范围
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    // 监测DOM变化以检测回复完成
    function setupDOMCompletionDetection() {
        const observer = new MutationObserver((mutations) => {
            // 如果没有在计时，则不需要检查
            if (!isGenerating) return;

            // 检查是否出现了回复完成后的操作按钮
            const copyButton = document.querySelector('[data-testid="copy-turn-action-button"]');
            const goodResponseButton = document.querySelector('[data-testid="good-response-turn-action-button"]');
            const badResponseButton = document.querySelector('[data-testid="bad-response-turn-action-button"]');
            const voicePlayButton = document.querySelector('[data-testid="voice-play-turn-action-button"]');

            // 如果检测到这些按钮之一，说明回复已经完成
            if (copyButton || goodResponseButton || badResponseButton || voicePlayButton) {
                console.log('[ChatGPT计时器] 检测到回复完成的DOM元素，停止计时');
                stopTimer();
            }
        });

        // 监测整个文档的变化
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-testid']
        });
    }

    // 检测用户是否正在输入，如果是则不触发计时
    function setupUserInputDetection() {
        // 监听输入框的焦点事件
        document.addEventListener('focusin', (event) => {
            // 检查获得焦点的元素是否是输入框
            if (event.target.tagName === 'TEXTAREA' || 
                event.target.tagName === 'INPUT' || 
                event.target.getAttribute('role') === 'textbox' ||
                event.target.getAttribute('contenteditable') === 'true') {
                // 标记为用户正在输入
                window._userIsTyping = true;
            }
        });
        
        // 监听输入框失去焦点事件
        document.addEventListener('focusout', (event) => {
            // 检查失去焦点的元素是否是输入框
            if (event.target.tagName === 'TEXTAREA' || 
                event.target.tagName === 'INPUT' || 
                event.target.getAttribute('role') === 'textbox' ||
                event.target.getAttribute('contenteditable') === 'true') {
                // 取消用户正在输入标记
                window._userIsTyping = false;
            }
        });
    }

    // 添加键盘快捷键支持
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Alt+S 开始计时，Alt+P 停止计时
            if (event.altKey) {
                if (event.key === 's' || event.key === 'S') {
                    startTimer(true); // 强制开始计时
                    event.preventDefault(); // 阻止默认行为
                } else if (event.key === 'p' || event.key === 'P') {
                    stopTimer();
                    event.preventDefault(); // 阻止默认行为
                }
            }
        });
    }

    // 初始化函数
    function initialize() {
        createTimerDisplay();          // 创建计时器显示
        setupNetworkMonitoring();      // 设置网络请求监控（使用Fetch API）
        setupXHRMonitoring();          // 设置XHR请求监控（备用方案）
        setupThinkingDetection();      // 设置"Thinking"文本检测
        setupDOMCompletionDetection(); // 设置DOM完成检测
        setupUserInputDetection();     // 设置用户输入检测
        setupKeyboardShortcuts();      // 设置键盘快捷键

        console.log('[ChatGPT计时器] 初始化完成，等待使用...');
    }

    // 页面加载完成后初始化
    if (document.readyState === 'complete') {
        initialize();
    } else {
        window.addEventListener('load', () => {
            setTimeout(initialize, 1000); // 延迟1秒初始化以确保页面完全加载
        });
    }

    // 备用初始化方法，以防主方法失败
    setTimeout(() => {
        if (!document.getElementById('chatgpt-mini-timer')) {
            initialize();
        }
    }, 3000);
})();
