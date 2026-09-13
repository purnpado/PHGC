import './style.css';
import './app.css';

import { CheckSetupComplete, GetSchoolConfig, VerifyAdminPassword, SyncWithServer, GetAppVersion, OpenExcelFile, ProcessExcel, GetClassStatus, GetClassGrades } from '../wailsjs/go/main/App';
import middleSchools from './assets/middleschools.json';
import logoUniversal from './assets/images/logo-universal.png';

const app = document.querySelector('#app');

// 구버전 localStorage 캐시 잔재 원천 삭제 (새 폴더 설치 시 오염 방지)
try {
    localStorage.removeItem('publicOfficialCutoffData');
} catch (_) {}

// 현재 로그인한 사용자 세션 (role, classNum, username 등 저장)
window.currentUser = null;

// ===== HTML / Attribute XSS 및 특수문자 이스케이프 유틸리티 =====
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;

function escapeAttr(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
window.escapeAttr = escapeAttr;

// ===== 프로그램 창 제목(Window Title) 동적 변경 헬퍼 =====
function updateAppWindowTitle(role = '', detail = '') {
    let roleLabel = '';
    if (role === 'master') {
        roleLabel = detail ? `[학년부장 · ${detail}]` : '[학년부장]';
    } else if (role === 'homeroom') {
        roleLabel = detail ? `[3학년 ${detail}반 담임]` : '[담임교사]';
    } else if (role === 'viewer') {
        roleLabel = '[전체 열람 모드]';
    }

    const title = roleLabel
        ? `진학 상담 프로그램 ${roleLabel} - 그래서? 넌 어디갈래?`
        : '진학 상담 프로그램 - 그래서? 넌 어디갈래?';

    if (window.go?.main?.App?.SetWindowTitle) {
        window.go.main.App.SetWindowTitle(title).catch(() => { });
    }
}
window.updateAppWindowTitle = updateAppWindowTitle;

// ===== 🔒 개인정보 보호 자동 화면 잠금(Auto Screen Lock) 시스템 =====
const ScreenLockManager = {
    timer: null,
    defaultTimeoutMinutes: 5, // 기본 5분 동안 입력이 없을 때 자동 잠금 (교무실 표준 권고)
    isLocked: false,

    getTimeoutMs() {
        const saved = localStorage.getItem('phgc_screen_lock_minutes');
        const mins = saved !== null ? parseInt(saved, 10) : this.defaultTimeoutMinutes;
        return (isNaN(mins) || mins <= 0) ? 0 : mins * 60 * 1000;
    },

    setTimeoutMinutes(mins) {
        localStorage.setItem('phgc_screen_lock_minutes', String(mins));
        this.resetTimer();
    },

    init() {
        const onActivity = () => {
            if (!this.isLocked && window.currentUser) {
                this.resetTimer();
            }
        };

        ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
            window.addEventListener(evt, onActivity, { passive: true });
        });

        // 단축키: Ctrl + L (또는 Cmd + L) 즉시 잠금
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
                if (window.currentUser && !this.isLocked) {
                    e.preventDefault();
                    this.lockScreen('단축키');
                }
            }
        });
    },

    clearTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    },

    resetTimer() {
        this.clearTimer();
        if (!window.currentUser || this.isLocked) return;

        const ms = this.getTimeoutMs();
        if (ms > 0) {
            this.timer = setTimeout(() => {
                this.lockScreen('시간초과');
            }, ms);
        }
    },

    lockScreen(reason = '') {
        if (this.isLocked || !window.currentUser) return;
        this.isLocked = true;
        this.clearTimer();

        const user = window.currentUser;
        let userTitle = '교직원';
        if (user.Role === 'master') {
            userTitle = '학년부장 (관리자)';
        } else if (user.Role === 'homeroom') {
            userTitle = `3학년 ${user.ClassNum}반 담임교사`;
        } else if (user.Role === 'viewer') {
            userTitle = '전체 열람 교사';
        }

        const username = user.Username || (user.Role === 'master' ? 'admin' : `30${user.ClassNum}`);

        document.getElementById('screenLockOverlay')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'screenLockOverlay';
        overlay.className = 'fixed inset-0 z-[9999999] bg-slate-950/85 backdrop-blur-2xl flex items-center justify-center p-4 select-none animate-in fade-in duration-300';
        overlay.innerHTML = `
            <div class="relative w-full max-w-md bg-slate-900/90 border border-slate-700/80 rounded-3xl p-8 shadow-2xl text-center space-y-6 backdrop-blur-xl">
                <!-- 잠금 자물쇠 뱃지 -->
                <div class="relative mx-auto w-20 h-20 flex items-center justify-center rounded-3xl bg-linear-to-tr from-amber-600/30 to-rose-600/20 border border-amber-500/40 shadow-lg shadow-amber-500/10">
                    <span class="text-4xl animate-bounce">🔒</span>
                    <span class="absolute -top-1 -right-1 flex h-3 w-3">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                    </span>
                </div>

                <div>
                    <h2 class="text-xl font-black text-white flex items-center justify-center gap-2">
                        개인정보 보호 화면 잠금
                    </h2>
                    <p class="text-xs text-amber-300/90 mt-1.5 font-medium">
                        학생 성적 및 진학 상담 자료 보호를 위해 화면이 안전하게 잠겼습니다.
                    </p>
                    <div class="mt-3 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/90 border border-slate-700 text-xs text-slate-300 shadow-inner">
                        <span>👤</span>
                        <span class="font-bold text-white">${escapeHtml(userTitle)}</span>
                        <span class="text-slate-400">(${escapeHtml(username)})</span>
                    </div>
                </div>

                <form id="screenUnlockForm" class="space-y-4">
                    <div class="text-left">
                        <label class="block text-xs font-bold text-slate-300 mb-1.5 ml-1">비밀번호 입력</label>
                        <div class="relative">
                            <input type="password" id="unlockPasswordInput" 
                                   class="input-field w-full py-3 text-sm text-center tracking-widest font-mono" 
                                   placeholder="비밀번호를 입력하세요" autocomplete="current-password" autofocus required />
                        </div>
                        <p id="unlockErrorMsg" class="text-xs text-rose-400 mt-1.5 hidden text-center font-bold"></p>
                    </div>

                    <button type="submit" id="unlockSubmitBtn" class="w-full py-3 px-4 bg-linear-to-r from-indigo-600 to-primary hover:from-indigo-500 hover:to-primary/90 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 text-sm">
                        <span>🔓</span> 잠금 해제 (이전 작업 복귀)
                    </button>
                </form>

                <div class="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <button type="button" id="lockLogoutBtn" class="hover:text-rose-400 transition-colors cursor-pointer flex items-center gap-1 font-bold">
                        <span>🚪</span> 로그아웃
                    </button>
                    <span class="text-[11px] text-slate-500">단축키: Ctrl + L (즉시 잠금)</span>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        const input = document.getElementById('unlockPasswordInput');
        setTimeout(() => input?.focus(), 150);

        const form = document.getElementById('screenUnlockForm');
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pw = input?.value || '';
            const errEl = document.getElementById('unlockErrorMsg');
            const submitBtn = document.getElementById('unlockSubmitBtn');

            if (!pw) {
                if (errEl) {
                    errEl.textContent = '비밀번호를 입력해 주세요.';
                    errEl.classList.remove('hidden');
                }
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner"></span> 확인 중...';
            if (errEl) errEl.classList.add('hidden');

            try {
                let isValid = false;
                if (window.go?.main?.App?.VerifyUserLogin) {
                    try {
                        const verifiedUser = await window.go.main.App.VerifyUserLogin(username, pw);
                        if (verifiedUser) isValid = true;
                    } catch (vErr) {
                        if (user.Role === 'master' && window.go?.main?.App?.VerifyAdminPassword) {
                            try {
                                const ok = await window.go.main.App.VerifyAdminPassword(pw);
                                if (ok) isValid = true;
                            } catch (_) {}
                        }
                    }
                }

                if (isValid) {
                    overlay.classList.add('fade-out');
                    setTimeout(() => overlay.remove(), 200);
                    this.isLocked = false;
                    this.resetTimer();
                } else {
                    if (errEl) {
                        errEl.textContent = '비밀번호가 일치하지 않습니다. 다시 입력해 주세요.';
                        errEl.classList.remove('hidden');
                    }
                    input.classList.add('animate-shake');
                    setTimeout(() => input.classList.remove('animate-shake'), 500);
                    input.value = '';
                    input.focus();
                }
            } catch (err) {
                if (errEl) {
                    errEl.textContent = '확인 중 오류가 발생했습니다: ' + String(err);
                    errEl.classList.remove('hidden');
                }
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span>🔓</span> 잠금 해제 (이전 작업 복귀)';
            }
        });

        document.getElementById('lockLogoutBtn')?.addEventListener('click', () => {
            overlay.remove();
            this.isLocked = false;
            this.clearTimer();
            window.currentUser = null;
            if (typeof renderMainScreen === 'function') {
                renderMainScreen();
            } else {
                location.reload();
            }
        });
    }
};
window.ScreenLockManager = ScreenLockManager;
ScreenLockManager.init();


// ===== SweetAlert2 스타일 커스텀 모달 알림창 =====
function showModalAlert(optionsOrMessage, defaultTitle = '알림', defaultType = 'info', confirmText = '확인') {
    return new Promise((resolve) => {
        let title = defaultTitle;
        let message = '';
        let type = defaultType;
        let cText = confirmText;

        if (typeof optionsOrMessage === 'object' && optionsOrMessage !== null) {
            title = optionsOrMessage.title || defaultTitle;
            message = optionsOrMessage.message || '';
            type = optionsOrMessage.type || defaultType;
            cText = optionsOrMessage.confirmText || confirmText;
        } else {
            message = String(optionsOrMessage || '');
            if (message.includes('실패') || message.includes('오류') || message.includes('에러') || message.includes('Error')) {
                type = 'error';
                title = '오류';
            } else if (message.includes('완료') || message.includes('성공') || message.includes('저장했습니다') || message.includes('복원했습니다')) {
                type = 'success';
                title = '완료';
            }
        }

        document.getElementById('phgcCustomAlertModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'phgcCustomAlertModal';
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[999999] flex items-center justify-center p-4 animate-in fade-in duration-200';

        const iconConfig = {
            success: {
                bg: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
                icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>`,
                btnBg: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30',
            },
            warning: {
                bg: 'bg-amber-500/20 border-amber-500/50 text-amber-400',
                icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`,
                btnBg: 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30',
            },
            error: {
                bg: 'bg-rose-500/20 border-rose-500/50 text-rose-400',
                icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>`,
                btnBg: 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30',
            },
            info: {
                bg: 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400',
                icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
                btnBg: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30',
            },
        }[type] || {
            bg: 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400',
            icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
            btnBg: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30',
        };

        const formattedMsg = typeof message === 'string' && !message.includes('<')
            ? `<p class="text-slate-200 text-sm whitespace-pre-wrap">${escapeHtml(message)}</p>`
            : message;

        modal.innerHTML = `
            <div class="glass-card max-w-md w-full p-6 text-center shadow-2xl border border-slate-700/80 rounded-2xl animate-in zoom-in-95 duration-200">
                <div class="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center border-2 ${iconConfig.bg} shadow-lg">
                    ${iconConfig.icon}
                </div>
                <h3 class="text-xl font-bold text-white mb-2">${escapeHtml(title)}</h3>
                <div class="text-sm text-slate-300 mb-6 leading-relaxed text-left max-h-[60vh] overflow-y-auto">
                    ${formattedMsg}
                </div>
                <button id="modalAlertConfirmBtn" class="w-full py-2.5 px-5 rounded-xl text-white font-bold text-sm ${iconConfig.btnBg} shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer">
                    ${cText}
                </button>
            </div>
        `;

        document.body.appendChild(modal);

        const confirmBtn = modal.querySelector('#modalAlertConfirmBtn');
        const handleClose = () => {
            window.removeEventListener('keydown', onKeyDown);
            modal.remove();
            resolve(true);
        };

        confirmBtn.onclick = handleClose;
        modal.onclick = (e) => {
            if (e.target === modal) handleClose();
        };

        const onKeyDown = (e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
                handleClose();
            }
        };
        window.addEventListener('keydown', onKeyDown);
    });
}
window.showModalAlert = showModalAlert;
// 브라우저 기본 alert를 전역 모달로 자연스럽게 오버라이드
window.alert = (msg) => showModalAlert(msg);

// ===== SweetAlert2 스타일 커스텀 모달 확인창 (브라우저 confirm 대체) =====
function showModalConfirm(optionsOrMessage, defaultTitle = '확인', defaultType = 'warning', confirmText = '확인', cancelText = '취소') {
    return new Promise((resolve) => {
        let title = defaultTitle;
        let message = '';
        let type = defaultType;
        let cText = confirmText;
        let canText = cancelText;

        if (typeof optionsOrMessage === 'object' && optionsOrMessage !== null) {
            title = optionsOrMessage.title || defaultTitle;
            message = optionsOrMessage.message || '';
            type = optionsOrMessage.type || defaultType;
            cText = optionsOrMessage.confirmText || confirmText;
            canText = optionsOrMessage.cancelText || cancelText;
        } else {
            message = String(optionsOrMessage || '');
        }

        document.getElementById('phgcCustomConfirmModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'phgcCustomConfirmModal';
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[999999] flex items-center justify-center p-4 animate-in fade-in duration-200';

        const iconConfig = {
            success: {
                bg: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
                icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>`,
                btnBg: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30',
            },
            warning: {
                bg: 'bg-amber-500/20 border-amber-500/50 text-amber-400',
                icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`,
                btnBg: 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30',
            },
            error: {
                bg: 'bg-rose-500/20 border-rose-500/50 text-rose-400',
                icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>`,
                btnBg: 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30',
            },
            info: {
                bg: 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400',
                icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
                btnBg: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30',
            },
        }[type] || {
            bg: 'bg-amber-500/20 border-amber-500/50 text-amber-400',
            icon: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`,
            btnBg: 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30',
        };

        const formattedMsg = typeof message === 'string' && !message.includes('<')
            ? `<p class="text-slate-200 text-sm whitespace-pre-wrap">${escapeHtml(message)}</p>`
            : message;

        modal.innerHTML = `
            <div class="glass-card max-w-md w-full p-6 text-center shadow-2xl border border-slate-700/80 rounded-2xl animate-in zoom-in-95 duration-200">
                <div class="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center border-2 ${iconConfig.bg} shadow-lg">
                    ${iconConfig.icon}
                </div>
                <h3 class="text-xl font-bold text-white mb-2">${escapeHtml(title)}</h3>
                <div class="text-sm text-slate-300 mb-6 leading-relaxed text-left max-h-[60vh] overflow-y-auto">
                    ${formattedMsg}
                </div>
                <div class="flex items-center justify-center gap-3">
                    <button id="modalConfirmCancelBtn" class="flex-1 py-2.5 px-4 rounded-xl text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-600 font-bold text-sm transition-all cursor-pointer">
                        ${canText}
                    </button>
                    <button id="modalConfirmOkBtn" class="flex-1 py-2.5 px-4 rounded-xl text-white font-bold text-sm ${iconConfig.btnBg} shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer">
                        ${cText}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const okBtn = modal.querySelector('#modalConfirmOkBtn');
        const cancelBtn = modal.querySelector('#modalConfirmCancelBtn');

        const closeWith = (val) => {
            window.removeEventListener('keydown', onKeyDown);
            modal.remove();
            resolve(val);
        };

        okBtn.onclick = () => closeWith(true);
        cancelBtn.onclick = () => closeWith(false);
        modal.onclick = (e) => {
            if (e.target === modal) closeWith(false);
        };

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                closeWith(false);
            } else if (e.key === 'Enter') {
                closeWith(true);
            }
        };
        window.addEventListener('keydown', onKeyDown);
    });
}
window.showModalConfirm = showModalConfirm;

// ===== SweetAlert2 스타일 커스텀 모달 입력창 (브라우저 prompt 대체) =====
function showModalPrompt(optionsOrMessage, defaultVal = '', titleText = '입력') {
    let title = titleText;
    let message = '';
    let defaultValue = defaultVal;
    let placeholder = '';
    let isPassword = false;

    if (typeof optionsOrMessage === 'object' && optionsOrMessage !== null) {
        title = optionsOrMessage.title || titleText;
        message = optionsOrMessage.message || '';
        defaultValue = optionsOrMessage.defaultValue !== undefined ? optionsOrMessage.defaultValue : defaultVal;
        placeholder = optionsOrMessage.placeholder || '';
        isPassword = !!optionsOrMessage.isPassword;
    } else {
        message = String(optionsOrMessage || '');
        if (message.includes('암호') || message.includes('비밀번호')) {
            isPassword = true;
        }
    }

    return new Promise((resolve) => {
        document.getElementById('phgcCustomPromptModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'phgcCustomPromptModal';
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[999999] flex items-center justify-center p-4 animate-in fade-in duration-200';

        modal.innerHTML = `
            <div class="glass-card max-w-md w-full p-6 text-center shadow-2xl border border-slate-700/80 rounded-2xl animate-in zoom-in-95 duration-200">
                <div class="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center border-2 bg-indigo-500/20 border-indigo-500/50 text-indigo-400 shadow-lg">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                </div>
                <h3 class="text-xl font-bold text-white mb-2">${escapeHtml(title)}</h3>
                <div class="text-sm text-slate-300 mb-4 leading-relaxed text-left max-h-[40vh] overflow-y-auto">
                    ${message ? `<p class="text-center text-slate-200">${escapeHtml(message).replace(/\\n/g, '<br>')}</p>` : ''}
                </div>
                <div class="mb-6">
                    <input id="modalPromptInput" type="${isPassword ? 'password' : 'text'}"
                           class="w-full px-4 py-3 bg-slate-900/90 border border-indigo-500/50 rounded-xl text-white ph-muted text-center font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner"
                           placeholder="${escapeAttr(placeholder || '내용을 입력하세요')}" value="${escapeAttr(String(defaultValue || ''))}" />
                </div>
                <div class="flex items-center justify-center gap-3">
                    <button id="modalPromptCancelBtn" class="flex-1 py-2.5 px-4 rounded-xl text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-600 font-bold text-sm transition-all cursor-pointer">
                        취소
                    </button>
                    <button id="modalPromptOkBtn" class="flex-1 py-2.5 px-4 rounded-xl text-white font-bold text-sm bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer">
                        확인
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        const input = modal.querySelector('#modalPromptInput');
        const okBtn = modal.querySelector('#modalPromptOkBtn');
        const cancelBtn = modal.querySelector('#modalPromptCancelBtn');

        input.focus();
        input.select();

        const closeWith = (val) => {
            window.removeEventListener('keydown', onKeyDown);
            modal.remove();
            resolve(val);
        };

        okBtn.onclick = () => closeWith(input.value);
        cancelBtn.onclick = () => closeWith(null);
        modal.onclick = (e) => {
            if (e.target === modal) closeWith(null);
        };

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                closeWith(null);
            } else if (e.key === 'Enter') {
                closeWith(input.value);
            }
        };
        window.addEventListener('keydown', onKeyDown);
    });
}
window.showModalPrompt = showModalPrompt;

// ===== 전역 ESC 키 모달 닫기 제어 시스템 =====
window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    // 1. 확인/알림/프롬프트 모달
    const promptModal = document.getElementById('appPromptModal');
    if (promptModal) {
        document.getElementById('modalPromptCancelBtn')?.click();
        return;
    }
    const confirmModal = document.getElementById('appConfirmModal');
    if (confirmModal) {
        document.getElementById('modalConfirmCancelBtn')?.click();
        return;
    }
    const alertModal = document.getElementById('appAlertModal');
    if (alertModal) {
        document.getElementById('modalAlertConfirmBtn')?.click();
        return;
    }

    // 2. 사용 설명서 모달
    const guideModal = document.getElementById('programGuideModal');
    if (guideModal) {
        document.getElementById('closeGuideModalBtn')?.click();
        guideModal.remove();
        return;
    }

    // 3. 학생 종합 성적표 모달
    const transcriptModal = document.getElementById('studentTranscriptModal');
    if (transcriptModal) {
        document.getElementById('closeTranscriptBtn')?.click();
        transcriptModal.remove();
        return;
    }

    // 4. 합격 예측 상세 분석 모달
    const predModal = document.getElementById('predictionDetailModal');
    if (predModal) {
        document.getElementById('closePredictionDetailBtn')?.click();
        predModal.remove();
        return;
    }

    // 5. 학생 희망학교 입력/수정 모달
    const appModal = document.getElementById('studentApplicationModal');
    if (appModal) {
        document.getElementById('closeApplicationModal')?.click();
        appModal.remove();
        return;
    }

    // 6. 진학 상담 모달 (닫힐 때 대시보드 자동 갱신)
    const studentModal = document.getElementById('studentDetailModal');
    if (studentModal) {
        const closeBtn = document.getElementById('closeModalBtn');
        if (closeBtn) {
            closeBtn.click();
        } else {
            studentModal.remove();
            if (typeof window.refreshCurrentClass === 'function') {
                window.refreshCurrentClass();
            }
        }
        return;
    }

    // 7. 신호등 매트릭스 모달
    const matrixModal = document.getElementById('matrixModal');
    if (matrixModal) {
        document.getElementById('closeMatrixBtn')?.click();
        matrixModal.remove();
        return;
    }

    // 8. 고입원서대장 모달
    const regModal = document.getElementById('applicationRegisterModal');
    if (regModal) {
        document.getElementById('closeRegisterBtn')?.click();
        regModal.remove();
        return;
    }

    // 9. 우리 반 통계 모달
    const classSummaryModal = document.getElementById('classApplicationSummaryModal');
    if (classSummaryModal) {
        document.getElementById('closeClassApplicationSummaryBtn')?.click();
        classSummaryModal.remove();
        return;
    }

    // 10. 학교 지원현황 모달
    const schoolSummaryModal = document.getElementById('schoolApplicationSummaryModal');
    if (schoolSummaryModal) {
        document.getElementById('closeSchoolApplicationSummaryBtn')?.click();
        schoolSummaryModal.remove();
        return;
    }

    // 11. 기타 열려있는 최상단 오버레이 모달 제거
    const activeModals = Array.from(document.querySelectorAll('.fixed.inset-0'));
    if (activeModals.length > 0) {
        const topModal = activeModals[activeModals.length - 1];
        if (topModal && topModal.parentNode) {
            topModal.remove();
        }
    }
});



// ===== 화면 렌더링 함수들 =====

// 새 프로그램 폴더의 첫 화면. 새 학교 설정과 학년부장 배포 자료 적용을
// 명확히 분리해, data 폴더가 없는 담임 PC에서도 배포 자료를 가져올 수 있다.
function renderFirstRunScreen() {
    app.innerHTML = `
        <div class="glass-card p-8 w-full max-w-xl fade-in" style="margin: 2rem;">
            <div class="text-center mb-8">
                <img src="${logoUniversal}" alt="로고" class="w-20 h-20 mx-auto mb-3 rounded-2xl shadow-xl border border-indigo-500/30 object-cover" style="animation: float 3s ease-in-out infinite;" />
                <h1 class="text-2xl font-black text-white tracking-tight mb-2">그래서? 넌 어디 갈래?</h1>
                <div class="flex items-center justify-center gap-1.5 flex-wrap">
                    <span class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[11px] font-bold">🔒 100% 오프라인</span>
                    <span class="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-[11px] font-bold">울산 고입 진학상담</span>
                </div>
                <p class="text-text-muted text-xs mt-2">처음 실행 방법을 선택하세요</p>
            </div>
            <div class="grid gap-4">
                <button id="startSchoolSetupBtn" type="button" class="rounded-xl border border-indigo-500/50 bg-indigo-500/10 p-5 text-left hover:bg-indigo-500/20 transition-colors">
                    <div class="font-bold text-white text-base">🏫 새 학교 기초 설정</div>
                    <p class="text-xs text-slate-300 mt-2">학년부장이 학교명·학급 수·암호를 처음 설정하고 나이스 자료를 준비합니다.</p>
                </button>
                <button id="firstRunDistributionImportBtn" type="button" class="rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-5 text-left hover:bg-emerald-500/20 transition-colors">
                    <div class="font-bold text-white text-base">📦 학년부장 배포자료 가져오기</div>
                    <p class="text-xs text-slate-300 mt-2">담임·진로부장이 받은 <strong>.phgcpkg</strong> 파일을 적용합니다. 적용 후 본인 초기 비밀번호로 로그인합니다.</p>
                </button>
                <button id="firstRunPasswordResetBtn" type="button" class="rounded-xl border border-sky-500/50 bg-sky-500/10 p-5 text-left hover:bg-sky-500/20 transition-colors">
                    <div class="font-bold text-white text-base">🔑 비밀번호 재설정 파일 가져오기</div>
                    <p class="text-xs text-slate-300 mt-2">학년부장에게 받은 <strong>.phgcreset</strong> 파일을 적용합니다. 기존 학급 작업 데이터는 그대로 보존됩니다.</p>
                </button>
                <button id="firstRunArchiveImportBtn" type="button" class="rounded-xl border border-amber-500/50 bg-amber-500/10 p-5 text-left hover:bg-amber-500/20 transition-colors">
                    <div class="font-bold text-white text-base">🗄️ 암호화 최종 보관본 복원</div>
                    <p class="text-xs text-slate-300 mt-2">학년부장이 보관한 <strong>.phgcarchive</strong>를 새 프로그램 폴더에 복원합니다.</p>
                </button>
            </div>
            <p class="text-[11px] text-slate-400 mt-6 text-center">기존 data 폴더가 있는 경우에는 이 화면이 아닌 로그인 화면으로 자동 이동합니다.</p>
        </div>
    `;

    document.getElementById('startSchoolSetupBtn').addEventListener('click', () => renderSetupScreen());
    document.getElementById('firstRunDistributionImportBtn').addEventListener('click', async () => {
        const button = document.getElementById('firstRunDistributionImportBtn');
        try {
            button.disabled = true;
            button.textContent = '배포자료 적용 중...';
            const username = await window.go.main.App.OpenDistributionPackage();
            if (!username) return;
            await showModalAlert(`'${username}' 계정의 배포자료를 적용했습니다.\n(기존 학급의 상담 일지와 희망학교 데이터도 안전하게 보존되었습니다)\n\n공용 데이터 암호와 초기 비밀번호로 로그인하세요.`, '배포자료 적용 완료', 'success');
            window.location.reload();
        } catch (err) {
            await showModalAlert('배포자료 가져오기 실패: ' + err, '오류', 'error');
        } finally {
            button.disabled = false;
            button.innerHTML = '<div class="font-bold text-white text-base">📦 학년부장 배포자료 가져오기</div><p class="text-xs text-slate-300 mt-2">담임·진로부장이 받은 <strong>.phgcpkg</strong> 파일을 적용합니다. 적용 후 본인 초기 비밀번호로 로그인합니다.</p>';
        }
    });
    document.getElementById('firstRunPasswordResetBtn')?.addEventListener('click', async () => {
        const button = document.getElementById('firstRunPasswordResetBtn');
        try {
            button.disabled = true;
            button.textContent = '재설정 파일 적용 중...';
            const username = await window.go.main.App.OpenPasswordResetPackage();
            if (!username) return;
            await showModalAlert(`'${username}' 계정의 비밀번호 재설정 파일을 적용했습니다.\n기존 학급 상담 데이터는 안전하게 보존되며, 새 비밀번호로 로그인하세요.`, '비밀번호 재설정 완료', 'success');
            window.location.reload();
        } catch (err) {
            await showModalAlert('비밀번호 재설정 파일 적용 실패: ' + err, '오류', 'error');
        } finally {
            button.disabled = false;
            button.innerHTML = '<div class="font-bold text-white text-base">🔑 비밀번호 재설정 파일 가져오기</div><p class="text-xs text-slate-300 mt-2">학년부장에게 받은 <strong>.phgcreset</strong> 파일을 적용합니다. 기존 학급 작업 데이터는 그대로 보존됩니다.</p>';
        }
    });
    document.getElementById('firstRunArchiveImportBtn').addEventListener('click', async () => {
        const password = await showModalPrompt({
            title: '최종 보관본 복원',
            message: '최종 보관본 암호를 입력하세요.',
            placeholder: '보관본 암호',
            isPassword: true
        });
        if (!password) return;
        const button = document.getElementById('firstRunArchiveImportBtn');
        try {
            button.disabled = true;
            button.textContent = '최종 보관본 복원 중...';
            const path = await window.go.main.App.OpenFinalArchive();
            if (!path) return;
            const school = await window.go.main.App.ImportFinalArchive(path, password);
            await showModalAlert(`${school} 최종 보관본을 복원했습니다.\n학년부장 개인 비밀번호로 로그인하세요.`, '복원 완료', 'success');
            window.location.reload();
        } catch (err) {
            await showModalAlert('최종 보관본 복원 실패: ' + err, '오류', 'error');
        } finally {
            button.disabled = false;
            button.innerHTML = '<div class="font-bold text-white text-base">🗄️ 암호화 최종 보관본 복원</div><p class="text-xs text-slate-300 mt-2">학년부장이 보관한 <strong>.phgcarchive</strong>를 새 프로그램 폴더에 복원합니다.</p>';
        }
    });
}

// 초기 설정 화면 (관리자 전용)
function renderSetupScreen(existingConfig = null) {
    const schoolName = existingConfig?.schoolName || '';
    const classCount = existingConfig?.classCount || '';
    const isSmallSchool = existingConfig?.isSmallSchool || false;
    const admissionYear = existingConfig?.admissionYear || (new Date().getFullYear() + 1);
    const isEdit = existingConfig !== null;

    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-xl fade-in" style="margin: 2rem;">
            <!-- 헤더 -->
            <div class="text-center mb-8">
                <div class="text-5xl mb-4" style="animation: float 3s ease-in-out infinite;">🏫</div>
                <h1 class="text-2xl font-bold text-white mb-2">그래서? 넌 어디갈래? 🏫 초기 설정</h1>
                <p class="text-text-muted text-sm">관리자(학년부장)가 최초 1회 설정합니다</p>
            </div>

            <!-- 설정 폼 -->
            <form id="setupForm" class="space-y-5">
                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">중학교명</label>
                    <input type="text" id="schoolName" class="input-field" list="schoolList"
                        placeholder="예: 푸른파도소리중학교 (검색 가능)" value="${schoolName}" autocomplete="off" required />
                    <datalist id="schoolList">
                        ${middleSchools.map(school => `<option value="${school}"></option>`).join('')}
                    </datalist>
                    <div id="schoolNameError" class="error-msg">학교명을 입력해 주세요.</div>
                </div>

                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">3학년 학급수</label>
                    <input type="number" id="classCount" class="input-field"
                        placeholder="예: 8" value="${classCount}" min="1" max="30" autocomplete="off" required />
                    <div id="classCountError" class="error-msg">학급수는 1~30 사이로 입력해 주세요.</div>
                </div>

                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">고교 입학년도</label>
                    <input type="text" inputmode="numeric" id="admissionYear" class="input-field" value="${admissionYear}" maxlength="4" required />
                    <p class="text-xs text-text-muted mt-1">현재 중3 학생이 다음 해 3월에 고등학교에 입학하는 연도입니다. 예: 2026년 중3 → 2027학년도</p>
                    <div id="admissionYearError" class="error-msg">입학년도는 2000~2100년 사이로 입력해 주세요.</div>
                </div>

                <div class="flex items-center gap-2 mt-2">
                    <input type="checkbox" id="isSmallSchool" class="w-4 h-4 rounded border-slate-700 bg-slate-800 text-primary focus:ring-primary focus:ring-offset-slate-900 cursor-pointer" ${isSmallSchool ? 'checked' : ''}>
                    <label for="isSmallSchool" class="text-sm font-medium text-text-muted cursor-pointer hover:text-white transition-colors">소인수 학교 (3학년 전체 10명 미만)</label>
                </div>

                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">마스터(학년부장) 비밀번호</label>
                    <input type="password" id="adminPassword" class="input-field"
                        placeholder="마스터 계정 (admin) 진입 시 사용됩니다" autocomplete="off" required />
                    <div id="passwordError" class="error-msg">비밀번호를 입력해 주세요.</div>
                </div>



                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">비밀번호 확인</label>
                    <input type="password" id="adminPasswordConfirm" class="input-field"
                        placeholder="비밀번호를 한 번 더 입력하세요" autocomplete="off" required />
                    <div id="passwordConfirmError" class="error-msg">비밀번호가 일치하지 않습니다.</div>
                </div>

                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">공용 데이터 암호</label>
                    <input type="password" id="sharedDataPassword" class="input-field" placeholder="data 폴더 수령 교사가 최초 1회 입력" autocomplete="off" required />
                    <p class="text-xs text-text-muted mt-1">개인 로그인 비밀번호와 별도이며, 전달되는 data 폴더의 AES 잠금을 엽니다.</p>
                    <div id="sharedDataPasswordError" class="error-msg">공용 데이터 암호를 입력해 주세요.</div>
                </div>

                <div class="pt-3">
                    <button type="submit" id="saveBtn" class="btn-primary">설정 완료</button>
                </div>
                <div id="generalError" class="error-msg text-center"></div>
            </form>

            ${isEdit ? `
            <div class="text-center mt-5">
                <button id="backToModeBtn" type="button" class="btn-secondary text-xs px-4 py-2 font-bold inline-flex items-center gap-1.5" style="width: auto;">
                    <span>↩️</span> 모드 선택으로 돌아가기
                </button>
            </div>` : ''}
        </div>
    `;

    document.getElementById('schoolName').focus();
    document.getElementById('setupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleSetupSubmit(isEdit);
    });

    if (isEdit) {
        document.getElementById('backToModeBtn')?.addEventListener('click', () => {
            renderModeSelectScreen(existingConfig.schoolName);
        });
    }
}

// 설정 폼 제출 처리
async function handleSetupSubmit(isEdit = false) {
    const schoolName = document.getElementById('schoolName').value.trim();
    const classCount = parseInt(document.getElementById('classCount').value, 10);
    const password = document.getElementById('adminPassword').value;
    const passwordConfirm = document.getElementById('adminPasswordConfirm').value;
    const sharedDataPassword = document.getElementById('sharedDataPassword').value;
    const isSmallSchool = document.getElementById('isSmallSchool').checked;
    const admissionYear = parseInt(document.getElementById('admissionYear').value, 10);
    const saveBtn = document.getElementById('saveBtn');

    // 에러 초기화
    ['schoolNameError', 'classCountError', 'admissionYearError', 'passwordError', 'passwordConfirmError', 'sharedDataPasswordError', 'generalError']
        .forEach(id => document.getElementById(id).classList.remove('show'));

    // 유효성 검사
    let hasError = false;
    if (!schoolName) { document.getElementById('schoolNameError').classList.add('show'); hasError = true; }
    if (!classCount || classCount < 1 || classCount > 30) { document.getElementById('classCountError').classList.add('show'); hasError = true; }
    if (!admissionYear || admissionYear < 2000 || admissionYear > 2100) { document.getElementById('admissionYearError').classList.add('show'); hasError = true; }
    if (!password) { document.getElementById('passwordError').classList.add('show'); hasError = true; }
    if (password !== passwordConfirm) { document.getElementById('passwordConfirmError').classList.add('show'); hasError = true; }
    if (!sharedDataPassword) { document.getElementById('sharedDataPasswordError').classList.add('show'); hasError = true; }
    if (hasError) return;

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span>저장 중...';

    try {
        await window.go.main.App.SetupApp({
            schoolName: schoolName,
            classCount: classCount,
            adminPassword: password,
            sharedDataPassword: sharedDataPassword,
            isSmallSchool: isSmallSchool,
            admissionYear: admissionYear
        });

        // 설정 후 무조건 로그인 화면으로 이동
        renderLoginScreen(schoolName);
    } catch (err) {
        const generalError = document.getElementById('generalError');
        generalError.textContent = err;
        generalError.classList.add('show');
        saveBtn.disabled = false;
        saveBtn.textContent = '설정 완료';
    }
}

// ===== 서버 동기화 화면 =====
function renderSyncScreen(schoolName) {
    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-md fade-in" style="margin: 2rem;">
            <div class="text-center mb-8">
                <div class="text-4xl mb-4 sync-icon">🔄</div>
                <h1 class="text-xl font-bold text-white mb-2">서버 동기화</h1>
                <p class="text-text-muted text-sm">Gitea 서버에서 데이터를 받아오는 중입니다...</p>
            </div>

            <!-- 동기화 단계 표시 -->
            <div class="space-y-4" id="syncSteps">
                <div class="sync-step" id="step-connect">
                    <div class="sync-step-icon"><span class="spinner"></span></div>
                    <div class="sync-step-text">
                        <div class="sync-step-title">서버 연결 중</div>
                        <div class="sync-step-desc text-text-muted text-xs">로컬 저장소 (오프라인 모드)</div>
                    </div>
                </div>
                <div class="sync-step" id="step-schools">
                    <div class="sync-step-icon pending">⏳</div>
                    <div class="sync-step-text">
                        <div class="sync-step-title">고등학교 정보 다운로드</div>
                        <div class="sync-step-desc text-text-muted text-xs">대기 중</div>
                    </div>
                </div>
                <div class="sync-step" id="step-version">
                    <div class="sync-step-icon pending">⏳</div>
                    <div class="sync-step-text">
                        <div class="sync-step-title">앱 업데이트 확인</div>
                        <div class="sync-step-desc text-text-muted text-xs">대기 중</div>
                    </div>
                </div>
            </div>

            <!-- 결과 영역 (동기화 완료 후 표시) -->
            <div id="syncResult" class="hidden mt-6"></div>
        </div>
    `;

    // 동기화 실행
    performSync(schoolName);
}

// 동기화 실행 로직
async function performSync(schoolName) {
    const stepConnect = document.getElementById('step-connect');
    const stepSchools = document.getElementById('step-schools');
    const stepVersion = document.getElementById('step-version');
    const syncResult = document.getElementById('syncResult');

    try {
        // 약간의 딜레이로 UX 개선
        await delay(800);

        // 연결 성공 표시
        updateSyncStep(stepConnect, 'success', '서버 연결 완료', '✅');

        // 고교 데이터 다운로드 시작
        updateSyncStep(stepSchools, 'loading', '다운로드 중...', null);
        await delay(300);

        // 실제 동기화 실행
        const result = await SyncWithServer();

        if (result.success) {
            // 고교 데이터 성공
            updateSyncStep(stepSchools, 'success', `${result.schoolCount}개 고교 정보 저장 완료`, '✅');
            await delay(500);

            // 버전 확인
            updateSyncStep(stepVersion, 'loading', '확인 중...', null);
            await delay(500);

            if (result.hasUpdate) {
                updateSyncStep(stepVersion, 'update', `새 버전 ${result.latestVersion} 사용 가능`, '⬆️');
            } else {
                updateSyncStep(stepVersion, 'success', `v${result.currentVersion} — 최신 버전`, '✅');
            }

            // 결과 표시
            await delay(600);
            showSyncComplete(syncResult, schoolName, result);

        } else {
            // 동기화 실패
            updateSyncStep(stepSchools, 'error', result.message, '❌');
            updateSyncStep(stepVersion, 'skipped', '건너뜀', '⏭️');

            await delay(500);
            showSyncFailed(syncResult, schoolName, result.message);
        }

    } catch (err) {
        // 서버 연결 자체 실패
        updateSyncStep(stepConnect, 'error', '서버에 연결할 수 없습니다', '❌');
        updateSyncStep(stepSchools, 'skipped', '건너뜀', '⏭️');
        updateSyncStep(stepVersion, 'skipped', '건너뜀', '⏭️');

        await delay(500);
        showSyncFailed(syncResult, schoolName, '서버 연결 실패 — 오프라인 모드로 진행합니다');
    }
}

// 동기화 단계 상태 업데이트
function updateSyncStep(element, status, message, icon) {
    const iconEl = element.querySelector('.sync-step-icon');
    const descEl = element.querySelector('.sync-step-desc');

    if (status === 'loading') {
        iconEl.innerHTML = '<span class="spinner"></span>';
        iconEl.classList.remove('pending');
    } else {
        iconEl.textContent = icon;
        iconEl.classList.remove('pending');
    }

    descEl.textContent = message;

    if (status === 'error') {
        descEl.classList.add('text-danger');
        descEl.classList.remove('text-text-muted');
    } else if (status === 'success') {
        descEl.classList.add('text-success');
        descEl.classList.remove('text-text-muted');
    } else if (status === 'update') {
        descEl.classList.add('text-warning');
        descEl.classList.remove('text-text-muted');
    }
}

// 동기화 완료 UI
function showSyncComplete(container, schoolName, result) {
    let updateNotice = '';
    if (result.hasUpdate) {
        updateNotice = `
            <div class="p-4 rounded-xl bg-amber-950/25 border border-amber-500/30 mb-4 text-sm space-y-3 text-left">
                <div class="font-bold text-amber-300 flex items-center justify-between text-base">
                    <span>🚀 새로운 최신 버전 출시 (v${result.latestVersion})</span>
                    <span class="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">v${result.latestVersion}</span>
                </div>
                <div class="text-slate-300 text-xs leading-relaxed">
                    새로 업데이트되었습니다. 공식 다운로드 페이지로 이동하여 최신 버전을 받으시겠습니까?
                </div>
                ${result.releaseNotes ? `
                <div class="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 max-h-28 overflow-y-auto whitespace-pre-wrap font-sans">
                    ${result.releaseNotes}
                </div>` : ''}
                <div class="flex items-center gap-2 pt-1 flex-wrap">
                    <button id="goToDownloadInSyncBtn" class="btn-primary text-xs px-4 py-2 font-bold flex items-center gap-1.5 shadow-md" style="background: linear-gradient(135deg, #6366f1, #4f46e5); width: auto;">
                        <span>🌐</span> 다운로드 페이지로 이동
                    </button>
                    <button id="goToFeedbackInSyncBtn" class="btn-secondary text-xs px-3 py-2 font-bold text-emerald-300 border-emerald-500/40 hover:bg-emerald-950/40" style="width: auto;">
                        <span>💬</span> 질문·피드백 게시판
                    </button>
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="fade-in">
            ${updateNotice}
            <button id="continueBtn" class="btn-primary">
                시작하기 →
            </button>
        </div>
    `;
    container.classList.remove('hidden');

    document.getElementById('goToDownloadInSyncBtn')?.addEventListener('click', () => {
        openExternalUrlSafe(GITHUB_RELEASE_URL);
        setTimeout(() => {
            quitAppSafe();
        }, 400);
    });

    document.getElementById('goToFeedbackInSyncBtn')?.addEventListener('click', () => {
        openExternalUrlSafe(FEEDBACK_BOARD_URL);
    });

    document.getElementById('continueBtn').addEventListener('click', () => {
        renderModeSelectScreen(schoolName);
    });
}

// 동기화 실패 UI
function showSyncFailed(container, schoolName, errorMsg) {
    container.innerHTML = `
        <div class="fade-in">
            <div class="p-3 rounded-lg bg-danger/10 border border-danger/30 mb-4 text-sm">
                <div class="text-text-muted text-xs">${errorMsg}</div>
            </div>
            <div class="flex gap-3">
                <button id="retryBtn" class="btn-primary flex-1" style="background: linear-gradient(135deg, #64748b, #475569); box-shadow: none;">
                    다시 시도
                </button>
                <button id="skipBtn" class="btn-primary flex-1">
                    오프라인으로 계속 →
                </button>
            </div>
        </div>
    `;
    container.classList.remove('hidden');

    document.getElementById('cutoffBtn')?.addEventListener('click', () => {
        renderCutoffScreen(schoolName);
    });
    document.getElementById('userManagementBtn')?.addEventListener('click', () => {
        renderUserManagementScreen(schoolName);
    });
    document.getElementById('retryBtn').addEventListener('click', () => {
        renderSyncScreen(schoolName);
    });
    document.getElementById('skipBtn').addEventListener('click', () => {
        if (window.currentUser) {
            if (window.currentUser.Role === 'master' || window.currentUser.Role === 'viewer') {
                renderAdminScreen(schoolName);
            } else {
                renderTeacherScreen(schoolName, window.currentUser.ClassNum);
            }
        } else {
            renderLoginScreen(schoolName);
        }
    });
}

// ===== 모드 선택 화면 =====
function renderModeSelectScreen(schoolName) {
    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-lg fade-in" style="margin: 2rem;">
            <div class="text-center mb-8">
                <h1 class="text-2xl font-bold text-white mb-2">📚 ${schoolName}</h1>
                <p class="text-text-muted text-sm">사용할 모드를 선택하세요</p>
            </div>

            <div class="grid grid-cols-2 gap-4 mb-6">
                <div class="mode-card" id="adminMode">
                    <span class="icon">👔</span>
                    <div class="title">관리자 모드</div>
                    <div class="desc">학년부장용<br/>엑셀 Import · 커트라인 관리</div>
                    <div class="mt-2 text-xs text-text-muted">🔒 비밀번호 필요</div>
                </div>
                <div class="mode-card" id="teacherMode">
                    <span class="icon">📋</span>
                    <div class="title">담임 모드</div>
                    <div class="desc">담임교사용<br/>내신 조회 · 합격 예측</div>
                    <div class="mt-2 text-xs text-success">🔓 바로 접근</div>
                </div>
            </div>

            <div class="flex justify-center gap-4">
                <button id="syncBtn" class="text-text-muted text-xs hover:text-primary transition-colors cursor-pointer bg-transparent border-none">
                    🔄 서버 동기화
                </button>
                <button id="editConfigBtn" class="text-text-muted text-xs hover:text-primary transition-colors cursor-pointer bg-transparent border-none">
                    ⚙️ 학교 설정 변경
                </button>
            </div>

            <div class="text-center mt-3" id="versionDisplay"></div>
        </div>
    `;

    // 버전 표시
    GetAppVersion().then(ver => {
        document.getElementById('versionDisplay').innerHTML =
            `<span class="text-text-muted text-[10px]">v${ver}</span>`;
    });

    // 이벤트 바인딩
    document.getElementById('adminMode').addEventListener('click', () => {
        renderAdminLoginScreen(schoolName);
    });
    document.getElementById('teacherMode').addEventListener('click', () => {
        renderTeacherScreen(schoolName);
    });
    document.getElementById('syncBtn').addEventListener('click', () => {
        renderSyncScreen(schoolName);
    });
    document.getElementById('editConfigBtn').addEventListener('click', () => {
        renderAdminLoginScreen(schoolName, 'editConfig');
    });
}

// ===== 관리자 비밀번호 입력 화면 =====
function renderAdminLoginScreen(schoolName, nextAction = 'adminDashboard') {
    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-sm fade-in" style="margin: 2rem;">
            <div class="text-center mb-8">
                <div class="text-4xl mb-4">🔐</div>
                <h1 class="text-xl font-bold text-white mb-2">관리자 인증</h1>
                <p class="text-text-muted text-sm">관리자 비밀번호를 입력하세요</p>
            </div>

            <form id="loginForm" class="space-y-5">
                <div>
                    <input type="password" id="loginPassword" class="input-field"
                        placeholder="비밀번호" autocomplete="off" required />
                    <div id="loginError" class="error-msg">비밀번호가 올바르지 않습니다.</div>
                </div>
                <button type="submit" id="loginBtn" class="btn-primary">확인</button>
            </form>

            <div class="text-center mt-4">
                <button id="backBtn" class="text-text-muted text-xs hover:text-primary transition-colors cursor-pointer bg-transparent border-none">
                    ← 모드 선택으로 돌아가기
                </button>
            </div>
        </div>
    `;

    document.getElementById('loginPassword').focus();

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const passwordInput = document.getElementById('loginPassword');
        const loginBtn = document.getElementById('loginBtn');
        const loginError = document.getElementById('loginError');

        loginError.classList.remove('show');
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span class="spinner"></span>확인 중...';

        try {
            const result = await VerifyAdminPassword(passwordInput.value);
            if (result) {
                if (nextAction === 'editConfig') {
                    const config = await GetSchoolConfig();
                    renderSetupScreen(config);
                } else {
                    renderAdminScreen(schoolName);
                }
            } else {
                loginError.classList.add('show');
                loginBtn.disabled = false;
                loginBtn.textContent = '확인';
                passwordInput.value = '';
                passwordInput.focus();
            }
        } catch (err) {
            loginError.textContent = err;
            loginError.classList.add('show');
            loginBtn.disabled = false;
            loginBtn.textContent = '확인';
        }
    });

    document.getElementById('backBtn').addEventListener('click', () => {
        renderModeSelectScreen(schoolName);
    });
}

// ===== 관리자 모드 화면 =====
async function renderAdminScreen(schoolName) {
    // 1. 학교 설정(학급수) 가져오기
    let classCount = 8; // 기본값
    try {
        const config = await GetSchoolConfig();
        classCount = config.classCount;
    } catch (e) {
        console.error("설정 불러오기 실패:", e);
    }

    // 2. 현재 저장된 학급별 데이터 상태 가져오기
    let status = {};
    let updateStatus = {};
    try {
        status = await GetClassStatus(classCount);
        if (window.go?.main?.App?.GetDataUpdateStatus) {
            updateStatus = await window.go.main.App.GetDataUpdateStatus();
        }
    } catch (e) {
        console.error("상태 불러오기 실패:", e);
    }

    // 학급 카드 HTML 생성
    let classCardsHTML = '';
    for (let i = 1; i <= classCount; i++) {
        const studentCount = status[i] || 0;
        const isDone = studentCount > 0;

        classCardsHTML += `
            <div class="p-4 rounded-xl border ${isDone ? 'border-success/30 bg-success/5' : 'border-slate-700/50 bg-slate-800/30'} flex justify-between items-center transition-all">
                <div class="font-bold text-lg">${i}반</div>
                <div class="text-sm flex items-center gap-2">
                    ${isDone
                ? `<span class="text-success font-medium">${studentCount}명 저장됨</span> <span class="text-xl">🟢</span>`
                : `<span class="text-text-muted">데이터 없음</span> <span class="text-xl opacity-50 grayscale">🔴</span>`
            }
                </div>
            </div>
        `;
    }

    // 데이터 연동 상태 바
    const totalStd = updateStatus.totalStudents || 0;
    const attCount = updateStatus.attendanceCount || 0;
    const volCount = updateStatus.volunteerCount || 0;

    let localVer = '0.5.5';
    try {
        localVer = await window.go.main.App.GetAppVersion();
    } catch (e) {
        console.warn(e);
    }

    app.className = 'wide-layout';
    updateAppWindowTitle('master');

    app.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-[1700px] mx-auto min-h-[85vh]">
            <!-- 헤더 영역 -->
            <div class="flex items-center justify-between mb-5 pb-4 border-b border-slate-700/50 flex-wrap gap-4">
                <div class="flex items-center gap-3 shrink-0">
                    <img src="${logoUniversal}" alt="로고" class="w-10 h-10 rounded-xl shadow-md border border-indigo-400/40 object-cover shrink-0" />
                    <div>
                        <h1 class="text-2xl font-black text-white flex items-center gap-2.5 whitespace-nowrap">
                            관리자 대시보드
                            <span class="text-xs bg-slate-800 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-500/30 font-mono font-bold">v${localVer}</span>
                        </h1>
                        <p class="text-text-muted text-xs mt-0.5 whitespace-nowrap">${schoolName} (총 ${classCount}학급)</p>
                    </div>
                </div>
                <div class="flex items-center gap-2.5 flex-wrap">
                    ${window.currentUser && window.currentUser.Role === 'master' ? `
                    <button id="goToTeacherBtn" class="btn-primary px-4 py-2 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 shadow-md hover:brightness-110 transition-all" style="width: auto;">
                        👩‍🏫 진학 상담 모드
                    </button>
                    ` : ''}
                    <button id="lockScreenAdminBtn" class="btn-secondary text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5 rounded-xl text-amber-300 hover:text-amber-200 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer transition-all" style="width: auto;" title="자리를 비우실 때 화면을 즉시 잠그고 학생 성적을 보호합니다 (단축키: Ctrl+L)">
                        <span>🔒</span> 화면 잠금
                    </button>
                    <button id="openAdminGuideBtn" class="btn-secondary text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5 rounded-xl" style="width: auto;" title="프로그램 사용 설명서 열기">
                        <span>📖</span> 사용 설명서
                    </button>
                    <button id="backBtn" class="btn-secondary text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5 rounded-xl text-slate-300 hover:text-white" style="width: auto;">
                        <span>🚪</span> 로그아웃
                    </button>
                </div>
            </div>

            <!-- 학년부장 전용 관리 도구 바 -->
            ${window.currentUser && window.currentUser.Role === 'master' ? `
            <div class="mb-5 p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/60 shadow-lg flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-2 text-xs font-bold text-indigo-200 whitespace-nowrap">
                    <span class="text-base">🛠️</span>
                    <span>학년부장 관리 도구:</span>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                    <!-- 신호등 매트릭스, 지원현황 및 원서대장 -->
                    <button id="openAdminMatrixBtn" class="btn-secondary text-xs px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 hover:border-indigo-400/50 text-indigo-300 hover:text-white" style="width: auto;" title="전교생 관내 고교별 신호등 매트릭스 종합 조회">
                        📊 신호등 매트릭스
                    </button>
                    <button id="openAdminSchoolStatsBtn" class="btn-secondary text-xs px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 hover:border-indigo-400/50" style="width: auto;" title="우리학교 고교별 지원현황 및 학교 통계">
                        🏫 우리학교 지원현황
                    </button>
                    <button id="openAdminRegisterBtn" class="btn-secondary text-xs px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 hover:border-indigo-400/50" style="width: auto;" title="학교 내부 원서대장 출력">
                        🖨️ 원서대장
                    </button>
                    <span class="text-slate-600 hidden sm:inline">|</span>
                    <!-- 취합 및 보관 -->
                    <button id="importPatchBtn" class="btn-secondary text-xs px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 hover:border-emerald-400/50 text-emerald-300" style="width: auto;" title="담임교사가 제출한 취합자료(.phgcpatch) 병합">
                        📥 취합자료병합
                    </button>
                    <button id="finalArchiveBtn" class="btn-secondary text-xs px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 hover:border-amber-400/50 text-amber-300" style="width: auto;" title="입시 종료 후 암호화 보관본 생성">
                        🗄️ 최종 보관본
                    </button>
                    <span class="text-slate-600 hidden sm:inline">|</span>
                    <!-- 연도 전환 및 초기화 -->
                    <button id="resetYearBtn" class="text-amber-400/90 border border-amber-500/30 hover:bg-amber-500/10 transition-colors cursor-pointer text-xs px-2.5 py-1.5 rounded-lg font-bold inline-flex items-center gap-1" style="width: auto;" title="커트라인은 유지하고 학생 데이터만 삭제">
                        📅 입시년도 전환
                    </button>
                    <button id="resetDataBtn" class="text-rose-400/90 border border-rose-500/30 hover:bg-rose-500/10 transition-colors cursor-pointer text-xs px-2.5 py-1.5 rounded-lg font-bold inline-flex items-center gap-1" style="width: auto;">
                        전체 초기화
                    </button>
                </div>
            </div>
            ` : ''}

            <!-- 데이터 연동 현황 바 -->
            <div class="mb-4 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div class="font-bold text-slate-300">📊 데이터 연동 현황:</div>
                <div class="flex items-center gap-4 flex-wrap">
                    <span class="inline-flex items-center gap-1.5 ${totalStd > 0 ? 'text-success' : 'text-slate-400'}">
                        ${totalStd > 0 ? '✅' : '⚪'} 교과성적: <strong>${totalStd}명</strong>
                    </span>
                    <span class="inline-flex items-center gap-1.5 ${attCount > 0 ? 'text-success' : 'text-slate-400'}">
                        ${attCount > 0 ? '✅' : '⚪'} 출결: <strong>${attCount}명</strong>
                    </span>
                    <span class="inline-flex items-center gap-1.5 ${volCount > 0 ? 'text-success' : 'text-slate-400'}">
                        ${volCount > 0 ? '✅' : '⚪'} 봉사: <strong>${volCount}명</strong>
                    </span>
                </div>
            </div>

            <!-- 필수 사전 검증 권장 안내 배너 -->
            <div class="mb-6 p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex items-start gap-3.5 shadow-sm break-keep-all select-none">
                <span class="text-2xl mt-0.5">💡</span>
                <div class="text-xs sm:text-sm leading-relaxed text-amber-200">
                    <strong class="text-amber-100 font-bold mb-1 text-sm sm:text-base flex items-center gap-1.5">
                        <span>[필수 사전 검증 권장]</span> 본격적인 진학 상담 전, 고교 공식 산출 프로그램과 계산값을 꼭 대조해 보세요!
                    </strong>
                    고등학교별 전형 요강 및 가산점 세부 산출식은 매년 미세한 차이가 있을 수 있습니다. 나이스 엑셀 연동 후, 표본 학생 1~2명의 성적을 <strong>지원 희망 고등학교의 공식 산출 프로그램(또는 산출표)</strong>에 직접 입력하여 <strong>본 프로그램의 계산값과 100% 일치하는지 반드시 사전 대조·검증</strong>하신 후 상담에 활용하시기 바랍니다.
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <!-- 왼쪽 패널 (액션) -->
                <div class="space-y-4">
                    ${window.currentUser && window.currentUser.Role === 'master' ? `
                    <div class="p-5 rounded-xl bg-slate-800/50 border border-slate-700/50">
                        <h3 class="font-bold mb-1.5 flex items-center gap-2">
                            <span>📥</span> 나이스 엑셀 데이터 연동
                        </h3>
                        <p class="text-xs text-text-muted mb-4 leading-relaxed">
                            순서대로 1 ➡️ 2 ➡️ 3단계 파일을 업로드하세요. 프로그램이 자동으로 학급을 인식하여 분류 저장합니다.
                        </p>
                        <div class="space-y-2.5">
                            <!-- 1단계: 교과 성적 -->
                            <button id="uploadExcelBtn" class="btn-primary w-full py-3 px-4 flex items-center justify-between text-xs font-bold shadow-md hover:brightness-110 transition-all rounded-xl border border-indigo-400/40 cursor-pointer">
                                <div class="flex items-center gap-2.5">
                                    <span class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">1</span>
                                    <span class="text-sm">📚 교과 성적 엑셀 불러오기</span>
                                </div>
                                <span class="text-[11px] font-semibold ${totalStd > 0 ? 'text-emerald-300' : 'text-indigo-200'}">${totalStd > 0 ? '✅ 연동됨' : '필수'}</span>
                            </button>

                            <!-- 2단계: 출결 현황 -->
                            <button id="uploadAttendanceBtn" class="w-full py-3 px-4 flex items-center justify-between text-xs font-bold shadow-md hover:brightness-110 transition-all rounded-xl border border-sky-500/40 cursor-pointer text-white"
                                    style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);">
                                <div class="flex items-center gap-2.5">
                                    <span class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">2</span>
                                    <span class="text-sm">📅 출결 현황 엑셀 불러오기</span>
                                </div>
                                <span class="text-[11px] font-semibold ${attCount > 0 ? 'text-emerald-300' : 'text-sky-200'}">${attCount > 0 ? '✅ 연동됨' : '비교과'}</span>
                            </button>

                            <!-- 3단계: 봉사활동 실적 -->
                            <button id="uploadVolunteerBtn" class="w-full py-3 px-4 flex items-center justify-between text-xs font-bold shadow-md hover:brightness-110 transition-all rounded-xl border border-emerald-500/40 cursor-pointer text-white"
                                    style="background: linear-gradient(135deg, #059669 0%, #047857 100%);">
                                <div class="flex items-center gap-2.5">
                                    <span class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">3</span>
                                    <span class="text-sm">🕒 봉사활동 엑셀 불러오기</span>
                                </div>
                                <span class="text-[11px] font-semibold ${volCount > 0 ? 'text-emerald-300' : 'text-emerald-200'}">${volCount > 0 ? '✅ 연동됨' : '비교과'}</span>
                            </button>
                        </div>
                        <div id="uploadStatus" class="mt-3 text-xs text-center hidden"></div>
                    </div>
                    <div class="mode-card" id="cutoffBtn">
                        <span class="icon">🎯</span>
                        <div class="title">고교별 커트라인 관리</div>
                        <div class="desc">커트라인 입력 및 서버 데이터 전송</div>
                    </div>

                    <div class="mode-card" id="userManagementBtn">
                        <span class="icon">👥</span>
                        <div class="title">사용자 및 권한 관리</div>
                        <div class="desc">담임 및 진로부장 계정 비밀번호 설정</div>
                    </div>
                    ` : `
                    <div class="p-5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center text-text-muted py-10">
                        <span class="text-2xl block mb-2">👁️</span>
                        조회 전용 계정입니다.
                    </div>
                    `}
                </div>

                <!-- 오른쪽 패널 (데이터 현황) -->
                <div class="md:col-span-2">
                    <h3 class="font-bold mb-4 flex items-center justify-between">
                        <span>학급별 데이터 현황</span>
                        <button id="refreshBtn" class="btn-secondary text-xs px-3 py-1 font-bold inline-flex items-center gap-1" style="width: auto;"><span>🔄</span> 새로고침</button>
                    </h3>
                    <div class="grid grid-cols-2 gap-3" id="classGrid">
                        ${classCardsHTML}
                    </div>
                </div>
            </div>
        </div>
    `;

    // 이벤트 바인딩
    ScreenLockManager.resetTimer();

    document.getElementById('lockScreenAdminBtn')?.addEventListener('click', () => {
        ScreenLockManager.lockScreen('수동 잠금');
    });

    document.getElementById('backBtn').addEventListener('click', async () => {
        ScreenLockManager.clearTimer();
        await window.go.main.App.Logout?.().catch(() => { });
        window.currentUser = null; // 로그아웃
        updateAppWindowTitle();
        renderLoginScreen(schoolName);
    });

    document.getElementById('openAdminGuideBtn')?.addEventListener('click', () => {
        renderGuideModal('master');
    });

    document.getElementById('goToTeacherBtn')?.addEventListener('click', () => {
        renderTeacherScreen(schoolName, null);
    });

    document.getElementById('resetYearBtn')?.addEventListener('click', async () => {
        const nextYear = await showModalPrompt({
            title: '새 입시학년도 전환',
            message: '전환할 새 입시학년도를 입력하세요 (예: 2028):',
            defaultValue: String(new Date().getFullYear() + 1),
            placeholder: '2028'
        });
        if (!nextYear) return;

        const confirmed = await showModalConfirm({
            title: '입시학년도 전환 확인',
            message: `입시년도를 [${nextYear}학년도]로 전환하시겠습니까?\n\n※ 고교별 커트라인 데이터는 안전하게 보존되며, 학생들의 성적/출결/봉사 데이터만 깔끔하게 초기화됩니다.`,
            confirmText: '전환하기',
            type: 'warning'
        });
        if (confirmed) {
            try {
                await window.go.main.App.ResetAcademicYear(parseInt(nextYear));
                await showModalAlert(`${nextYear}학년도로 성공적으로 전환되었습니다!`, '전환 완료', 'success');
                renderAdminScreen(schoolName);
            } catch (err) {
                await showModalAlert("입시년도 전환 실패: " + err, '오류', 'error');
            }
        }
    });

    document.getElementById('resetDataBtn')?.addEventListener('click', async () => {
        const confirmed = await showModalConfirm({
            title: '전체 데이터 초기화',
            message: "정말 모든 데이터를 완전 초기화하시겠습니까?\n학교 설정과 업로드된 모든 성적 파일이 삭제되며 되돌릴 수 없습니다.",
            confirmText: '완전 초기화',
            type: 'error'
        });
        if (confirmed) {
            try {
                await window.go.main.App.ResetAllData();
                await showModalAlert("모든 데이터가 초기화되었습니다. 프로그램이 재시작됩니다.", '초기화 완료', 'success');
                window.location.reload();
            } catch (err) {
                await showModalAlert("데이터 초기화 실패: " + err, '오류', 'error');
            }
        }
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
        renderAdminScreen(schoolName);
    });

    document.getElementById('openAdminMatrixBtn')?.addEventListener('click', () => openMatrixModal(null));
    document.getElementById('openAdminSchoolStatsBtn')?.addEventListener('click', openApplicationSummaryModal);
    document.getElementById('openAdminRegisterBtn')?.addEventListener('click', openApplicationRegisterModal);

    document.getElementById('finalArchiveBtn')?.addEventListener('click', async () => {
        const password = await showModalPrompt({
            title: '최종 보관본 생성',
            message: '최종 보관본을 보호할 새 암호를 입력하세요.\n이 암호는 복원할 때 반드시 필요하며 공용 데이터 암호와 별도로 안전하게 보관하세요.',
            isPassword: true
        });
        if (!password) return;
        const confirmPassword = await showModalPrompt({
            title: '암호 재확인',
            message: '보관본 암호를 한 번 더 입력하세요.',
            isPassword: true
        });
        if (password !== confirmPassword) {
            return await showModalAlert('보관본 암호가 일치하지 않습니다.', '입력 불일치', 'warning');
        }
        try {
            const path = await window.go.main.App.SaveFinalArchive(password);
            if (path) {
                await showModalAlert(`암호화된 최종 보관본을 만들었습니다.\n${path}\n\n새 프로그램 폴더의 로그인 화면에서 복원할 수 있습니다.`, '보관본 생성 완료', 'success');
            }
        } catch (err) {
            await showModalAlert('최종 보관본 생성 실패: ' + err, '오류', 'error');
        }
    });

    document.getElementById('uploadExcelBtn').addEventListener('click', async () => {
        const btn = document.getElementById('uploadExcelBtn');
        const statusDiv = document.getElementById('uploadStatus');

        try {
            // 파일 선택 다이얼로그 호출
            const filePath = await OpenExcelFile();
            if (!filePath) return; // 취소한 경우

            // UI 업데이트
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> <span>처리 중...</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-warning';
            statusDiv.textContent = '데이터를 분석하고 저장하는 중입니다...';
            statusDiv.classList.remove('hidden');

            // 엑셀 파싱 및 분할 저장 호출
            const result = await ProcessExcel(filePath);

            // 결과 메시지 구성
            let processedClasses = Object.keys(result).length;
            let totalStudents = Object.values(result).reduce((a, b) => a + b, 0);

            statusDiv.className = 'mt-3 text-xs text-center text-success';
            statusDiv.textContent = `성공! ${processedClasses}개 학급, 총 ${totalStudents}명의 데이터를 저장했습니다.`;

            // 화면 갱신을 위해 약간 대기 후 리렌더링
            setTimeout(() => {
                renderAdminScreen(schoolName);
            }, 1500);

        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = '<span>엑셀 파일 불러오기</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-danger font-bold break-all';
            statusDiv.textContent = `오류 발생: ${err}`;
            statusDiv.classList.remove('hidden');
        }
    });

    document.getElementById('uploadAttendanceBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('uploadAttendanceBtn');
        const statusDiv = document.getElementById('uploadStatus');

        if (totalStd === 0) {
            alert('⚠️ 1단계 [교과 성적 엑셀]을 먼저 불러와 학생 명단을 생성해 주세요.');
            return;
        }

        try {
            const filePath = await window.go.main.App.OpenExcelFile();
            if (!filePath) return;

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> <span>처리 중...</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-warning';
            statusDiv.textContent = '출결 데이터를 분석하는 중입니다...';
            statusDiv.classList.remove('hidden');

            const result = await window.go.main.App.ProcessAttendanceExcel(filePath);

            let processedClasses = Object.keys(result).length;
            let totalStudents = Object.values(result).reduce((a, b) => a + b, 0);

            btn.disabled = false;
            btn.innerHTML = '<span>출결 불러오기</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-success font-bold';
            statusDiv.textContent = `성공: ${processedClasses}개 학급, 총 ${totalStudents}명 출결 연동 완료!`;

            // 상단 데이터 연동 현황판 갱신
            setTimeout(() => {
                renderAdminScreen(schoolName);
            }, 1200);
        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = '<span>출결 불러오기</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-danger font-bold break-all';
            statusDiv.textContent = `출결 오류: ${err}`;
            statusDiv.classList.remove('hidden');
        }
    });

    document.getElementById('uploadVolunteerBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('uploadVolunteerBtn');
        const statusDiv = document.getElementById('uploadStatus');

        if (totalStd === 0) {
            alert('⚠️ 1단계 [교과 성적 엑셀]을 먼저 불러와 학생 명단을 생성해 주세요.');
            return;
        }

        try {
            const filePath = await window.go.main.App.OpenExcelFile();
            if (!filePath) return;

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> <span>처리 중...</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-warning';
            statusDiv.textContent = '봉사 데이터를 분석하는 중입니다...';
            statusDiv.classList.remove('hidden');

            const result = await window.go.main.App.ProcessVolunteerExcel(filePath);

            let processedClasses = Object.keys(result).length;
            let totalStudents = Object.values(result).reduce((a, b) => a + b, 0);

            btn.disabled = false;
            btn.innerHTML = '<span>봉사 불러오기</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-success font-bold';
            statusDiv.textContent = `성공: ${processedClasses}개 학급, 총 ${totalStudents}명 봉사 연동 완료!`;

            // 상단 데이터 연동 현황판 갱신
            setTimeout(() => {
                renderAdminScreen(schoolName);
            }, 1200);
        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = '<span>봉사 불러오기</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-danger font-bold break-all';
            statusDiv.textContent = `봉사 오류: ${err}`;
            statusDiv.classList.remove('hidden');
        }
    });

    document.getElementById('cutoffBtn')?.addEventListener('click', () => {
        renderCutoffScreen(schoolName);
    });

    document.getElementById('userManagementBtn')?.addEventListener('click', () => {
        renderUserManagementScreen(schoolName);
    });

    document.getElementById('syncBtn')?.addEventListener('click', () => {
        renderSyncScreen(schoolName);
    });

    document.getElementById('importPatchBtn')?.addEventListener('click', () => {
        openPatchImportModal(schoolName);
    });

}

// 담임교사 취합자료 병합 방식 선택 모달 (다중 파일 일괄 병합 vs 단일 파일 상세 검토)
function openPatchImportModal(schoolName) {
    document.getElementById('patchImportModeModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'patchImportModeModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200';

    modal.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-xl space-y-5">
            <div class="flex justify-between items-start border-b border-slate-700/60 pb-3">
                <div>
                    <h2 class="text-xl font-black text-white flex items-center gap-2">
                        <span>📥</span> 담임교사 취합자료 병합
                    </h2>
                    <p class="text-xs text-text-muted mt-1">
                        각 학급 담임선생님이 제출한 취합 파일(<strong>.phgcpatch</strong>)을 학년부장 시스템에 반영합니다.
                    </p>
                </div>
                <button id="closePatchImportModeModal" class="text-2xl text-slate-400 hover:text-white transition-colors">×</button>
            </div>

            <div class="space-y-3.5">
                <!-- 옵션 1: 여러 반 일괄 병합 (다중 선택) -->
                <div id="btnBatchPatchMerge" class="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/50 hover:bg-indigo-900/50 hover:border-indigo-400 cursor-pointer transition-all flex items-start gap-3.5 group shadow-md">
                    <div class="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                        ⚡
                    </div>
                    <div class="space-y-1">
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-bold text-white group-hover:text-indigo-200">여러 반 일괄 병합 (다중 선택 권장)</span>
                            <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">추천</span>
                        </div>
                        <p class="text-xs text-slate-300/90 leading-relaxed">
                            파일 탐색기에서 <strong>Ctrl 또는 Shift 키를 누른 채</strong> 여러 반 파일(예: 1반~8반 취합본)을 한꺼번에 동시 선택하여 <strong>1초 만에 전교 일괄 병합</strong>합니다.
                        </p>
                    </div>
                </div>

                <!-- 옵션 2: 1개 반 상세 검토 병합 -->
                <div id="btnSinglePatchMerge" class="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 hover:bg-slate-700/60 hover:border-slate-500 cursor-pointer transition-all flex items-start gap-3.5 group shadow-sm">
                    <div class="w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600/50 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                        🔍
                    </div>
                    <div class="space-y-1">
                        <span class="text-sm font-bold text-white group-hover:text-indigo-200">1개 반 상세 검토 병합 (체크박스 선택)</span>
                        <p class="text-xs text-slate-400 leading-relaxed">
                            특정 학급 1개 파일을 열어 학생별로 반영할 항목(출결, 봉사, 수기 가산점, 지원현황)을 직접 눈으로 검토하고 선택적으로 병합합니다.
                        </p>
                    </div>
                </div>
            </div>

            <div class="flex justify-end pt-3 border-t border-slate-700/60">
                <button id="closePatchImportModeModal2" class="btn-secondary text-xs px-4 py-2 font-bold" style="width: auto;">
                    닫기
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    document.getElementById('closePatchImportModeModal')?.addEventListener('click', closeModal);
    document.getElementById('closePatchImportModeModal2')?.addEventListener('click', closeModal);

    // 1. 여러 반 일괄 병합 핸들러
    document.getElementById('btnBatchPatchMerge')?.addEventListener('click', async () => {
        const password = await showModalPrompt({
            title: '공용 데이터 암호 확인',
            message: '취합자료를 복호화할 공용 데이터 잠금 비밀번호를 입력하세요.',
            isPassword: true
        });
        if (!password) return;
        closeModal();

        try {
            const res = await window.go.main.App.OpenTeacherPatch(password);
            if (res && res.files > 0) {
                await showModalAlert({
                    title: '취합자료 일괄 병합 완료',
                    message: `선택하신 <strong>${res.files}개 학급 취합 파일</strong>에서 학생 <strong>${res.students}명</strong>의 최신 데이터가 성공적으로 일괄 병합되었습니다!`,
                    type: 'success'
                });
                renderAdminScreen(schoolName);
            }
        } catch (err) {
            await showModalAlert({
                title: '일괄 병합 실패',
                message: String(err),
                type: 'error'
            });
        }
    });

    // 2. 1개 반 상세 검토 병합 핸들러
    document.getElementById('btnSinglePatchMerge')?.addEventListener('click', async () => {
        const password = await showModalPrompt({
            title: '공용 데이터 암호 확인',
            message: '취합자료를 복호화할 공용 데이터 잠금 비밀번호를 입력하세요.',
            isPassword: true
        });
        if (!password) return;
        closeModal();

        try {
            const preview = await window.go.main.App.OpenTeacherPatchPreview(password);
            if (preview && preview.path) {
                openPatchMergeSelection(preview, password, schoolName);
            }
        } catch (err) {
            await showModalAlert({
                title: '취합자료 가져오기 실패',
                message: String(err),
                type: 'error'
            });
        }
    });
}

function openPatchMergeSelection(preview, password, schoolName) {
    document.getElementById('patchMergeSelectionModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'patchMergeSelectionModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-y-auto';
    const items = (Array.isArray(preview.items) ? preview.items : []).slice().sort((a, b) => {
        const numA = parseInt(a.studentNum, 10) || 0;
        const numB = parseInt(b.studentNum, 10) || 0;
        return numA - numB;
    });
    const conflict = preview.hasRevisionConflict
        ? `<div class="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3.5 text-sm text-amber-200 mb-4 flex items-start gap-2.5">
            <span class="text-base font-bold text-amber-400 mt-0.5">⚠</span>
            <div>
                <p class="font-bold text-amber-300">주의: 기초 배포본 버전 차이가 있습니다.</p>
                <p class="text-xs text-amber-200/90 mt-0.5">담임교사가 작업한 시점의 버전과 현재 학년부장 자료 버전에 차이가 있습니다. 덮어쓸 항목만 학생별로 신중히 체크한 후 병합하세요.</p>
            </div>
           </div>`
        : `<div class="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-sm text-emerald-200 mb-4 flex items-start gap-2.5">
            <span class="text-base font-bold text-emerald-400 mt-0.5">✓</span>
            <div>
                <p class="font-bold text-emerald-300">담임 취합자료 확인 완료</p>
                <p class="text-xs text-emerald-200/90 mt-0.5">담임교사가 입력·제출한 학생별 변경 자료(출결·봉사·지원현황)가 현재 자료와 정상 호환됩니다. 반영할 항목을 선택한 뒤 하단 병합 버튼을 누르세요.</p>
            </div>
           </div>`;
    const rows = items.length ? items.map((item, index) => {
        const checks = [
            ['attendance', '출결', item.attendance], ['volunteer', '봉사', item.volunteer],
            ['extra', '수기 가산점', item.extra], ['applications', '지원현황', item.applications],
        ].filter(([, , available]) => available).map(([field, label]) => `<label class="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs"><input type="checkbox" class="patch-choice" data-index="${index}" data-field="${field}" checked> ${label}</label>`).join('');
        return `<tr class="border-b border-slate-700/60"><td class="p-3 text-center font-mono">${item.studentNum}</td><td class="p-3 font-bold">${item.studentName}</td><td class="p-3"><div class="flex flex-wrap gap-2">${checks || '<span class="text-text-muted">변경 항목 없음</span>'}</div></td></tr>`;
    }).join('') : '<tr><td colspan="3" class="p-8 text-center text-text-muted">확인할 변경 항목이 없습니다.</td></tr>';
    modal.innerHTML = `<div class="glass-card p-7 w-full max-w-4xl"><div class="flex justify-between items-start gap-4 mb-4"><div><h2 class="text-2xl font-bold text-white">📥 취합자료 선택 병합(학년부장)</h2><p class="text-sm text-text-muted mt-1">담임 계정 ${preview.sourceUsername} · ${preview.classNum}반 · 변경 학생 ${preview.changeCount}명</p></div><button id="closePatchMergeSelection" class="text-3xl text-text-muted">×</button></div>${conflict}<p class="text-xs text-text-muted mb-3">학생별로 가져올 항목만 선택합니다. 원본 수치와 학생 개인정보는 이 화면에 표시하지 않습니다.</p><div class="overflow-auto max-h-[55vh] border border-slate-700 rounded-xl"><table class="w-full text-sm"><thead class="sticky top-0 bg-slate-800"><tr><th class="p-3 w-16 text-center">번호</th><th class="p-3 w-28 text-left">학생</th><th class="p-3 text-left">가져올 항목</th></tr></thead><tbody>${rows}</tbody></table></div><div class="flex justify-end items-center gap-3 mt-6 pt-4 border-t border-slate-700/60"><button id="closePatchMergeSelection2" type="button" class="btn-secondary w-auto! px-5 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap cursor-pointer hover:bg-slate-700 transition-all">취소</button><button id="applyPatchMergeSelection" type="button" class="btn-primary w-auto! px-6 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 hover:scale-[1.02] transition-all"><span>📥</span> 선택 항목 병합</button></div></div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    document.getElementById('closePatchMergeSelection').onclick = close;
    document.getElementById('closePatchMergeSelection2').onclick = close;
    document.getElementById('applyPatchMergeSelection').onclick = async () => {
        const selections = items.map((item, index) => ({
            studentNum: item.studentNum,
            attendance: modal.querySelector(`.patch-choice[data-index="${index}"][data-field="attendance"]`)?.checked || false,
            volunteer: modal.querySelector(`.patch-choice[data-index="${index}"][data-field="volunteer"]`)?.checked || false,
            extra: modal.querySelector(`.patch-choice[data-index="${index}"][data-field="extra"]`)?.checked || false,
            applications: modal.querySelector(`.patch-choice[data-index="${index}"][data-field="applications"]`)?.checked || false,
        }));
        if (!selections.some(item => item.attendance || item.volunteer || item.extra || item.applications)) {
            return showModalAlert({
                type: 'warning',
                title: '선택 항목 없음',
                message: '병합할 학생별 항목(출결, 봉사, 가산점, 지원현황)을 하나 이상 선택해주세요.'
            });
        }
        const button = document.getElementById('applyPatchMergeSelection');
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span> 병합 중...';
        try {
            const count = await window.go.main.App.ImportTeacherPatchSelected(password, preview.path, selections);
            close();
            renderAdminScreen(schoolName);
            await showModalAlert({
                type: 'success',
                title: '취합자료 병합 완료',
                message: `
                    <div class="space-y-3">
                        <p class="text-center text-slate-200">
                            총 <strong class="text-emerald-400 font-bold">${count}명</strong>의 선택 항목을 성공적으로 병합했습니다.
                        </p>
                        <div class="rounded-xl border border-indigo-500/30 bg-indigo-950/40 p-3.5 text-xs text-indigo-200 leading-relaxed">
                            <span class="font-bold text-indigo-300 block mb-1">📢 담임교사 재배포 안내</span>
                            • 병합된 최신 내용이 학년부장 시스템에 반영되었습니다.<br>
                            • 다른 담임교사에게 최신 취합본을 전달하시려면, <strong>[사용자 및 권한 관리]</strong> 메뉴에서 각 반의 <strong>'배포 자료 만들기'</strong>(.phgcpkg)를 실행하여 전달하시면 됩니다.
                        </div>
                    </div>
                `,
                confirmText: '확인'
            });
        } catch (err) {
            button.disabled = false;
            button.innerHTML = '<span>📥</span> 선택 항목 병합';
            await showModalAlert({
                type: 'error',
                title: '취합자료 병합 실패',
                message: err.message || String(err),
                confirmText: '확인'
            });
        }
    };
}

// ===== 일반고 지원가이드 판정 기준선 전역 헬퍼 (기본 80%) =====
function getGeneralGuideCutoff() {
    const val = localStorage.getItem('phgc_general_guide_cutoff');
    if (val !== null && !isNaN(parseFloat(val))) {
        return parseFloat(val);
    }
    return 80.0;
}

function setGeneralGuideCutoff(val) {
    localStorage.setItem('phgc_general_guide_cutoff', val);
    window.generalGuideCutoff = val;
}

function getGeneralGuideBadge(percentile) {
    const cutoff = getGeneralGuideCutoff();
    const border = Math.min(100, cutoff + 10.0);
    if (percentile <= cutoff) {
        return `<span class="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-600 text-white border border-emerald-400 shadow-xs whitespace-nowrap">🟢 안정 (${percentile.toFixed(2)}%)</span>`;
    } else if (percentile <= border) {
        return `<span class="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-slate-950 border border-amber-300 shadow-xs whitespace-nowrap">🟡 경계 (${percentile.toFixed(2)}%)</span>`;
    } else {
        return `<span class="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-600 text-white border border-rose-400 shadow-xs whitespace-nowrap">🔴 주의 (${percentile.toFixed(2)}%)</span>`;
    }
}
window.getGeneralGuideCutoff = getGeneralGuideCutoff;
window.setGeneralGuideCutoff = setGeneralGuideCutoff;
window.getGeneralGuideBadge = getGeneralGuideBadge;

// 화면 전체가 아닌 선택한 문서만 A4로 인쇄한다.
// 매트릭스는 열 수가 많아 A4 가로, 개인 문서는 A4 세로를 기본값으로 사용한다.
function printOnly(kind, orientation = 'portrait') {
    const allowedKinds = new Set(['report', 'transcript', 'matrix', 'register', 'summary', 'guide', 'prediction']);
    const safeKind = allowedKinds.has(kind) ? kind : 'report';
    const safeOrientation = orientation === 'landscape' ? 'landscape' : 'portrait';
    const previous = document.getElementById('runtimePrintPageStyle');
    previous?.remove();

    const pageStyle = document.createElement('style');
    pageStyle.id = 'runtimePrintPageStyle';
    const printMargin = safeKind === 'transcript' ? '6mm 8mm' : '10mm';
    pageStyle.textContent = `@page { size: A4 ${safeOrientation}; margin: ${printMargin}; }`;
    document.head.appendChild(pageStyle);
    document.body.classList.add('printing');
    document.body.dataset.printKind = safeKind;

    const cleanup = () => {
        document.body.classList.remove('printing');
        delete document.body.dataset.printKind;
        pageStyle.remove();
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    // 인쇄 CSS가 적용된 뒤 브라우저 미리보기를 열도록 두 프레임을 기다린다.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

// ===== 담임 교사 모드 화면 =====
async function renderTeacherScreen(schoolName, targetClassNum = null) {
    let classCount = 8;
    try {
        const config = await GetSchoolConfig();
        classCount = config.classCount;
    } catch (e) {
        console.error(e);
    }

    if (window.currentUser && window.currentUser.Role === 'homeroom') {
        // 담임인 경우 자기 반만 선택 가능
        const myClass = window.currentUser.ClassNum;
        targetClassNum = myClass; // 강제로 타겟 클래스 변경
    }
    let activeClassNum = null;

    let localVer = '0.5.6';
    try {
        localVer = await window.go.main.App.GetAppVersion();
    } catch (e) {
        console.warn(e);
    }

    app.className = 'wide-layout';

    // 학급 선택 바둑판 카드 그리드 렌더링 함수
    const getClassGridHTML = () => {
        let cards = '';
        const isHomeroom = window.currentUser && window.currentUser.Role === 'homeroom';
        const myClass = isHomeroom ? window.currentUser.ClassNum : null;

        for (let i = 1; i <= classCount; i++) {
            const isAccessible = !isHomeroom || (i === myClass);
            if (isAccessible) {
                cards += `
                    <div class="class-card-btn bg-slate-800/70 hover:bg-indigo-950/40 border-2 border-slate-700/60 hover:border-primary/80 rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 group flex flex-col items-center justify-center gap-3 shadow-md"
                         data-class="${i}">
                        <div class="w-14 h-14 rounded-2xl bg-slate-700/60 text-indigo-300 group-hover:bg-primary group-hover:text-white flex items-center justify-center text-2xl font-black transition-all">
                            ${i}
                        </div>
                        <div>
                            <div class="text-lg font-bold text-white group-hover:text-primary transition-colors">3학년 ${i}반</div>
                            <div class="text-xs text-slate-400 mt-1">${isHomeroom ? '⭐ 내 담당 학급' : '진학 상담 및 성적 명단'}</div>
                        </div>
                        <span class="inline-flex items-center gap-1 text-xs text-primary font-bold mt-1 group-hover:translate-x-1 transition-transform">
                            학생 명단 열기 →
                        </span>
                    </div>
                `;
            } else {
                cards += `
                    <div class="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 text-center opacity-40 cursor-not-allowed flex flex-col items-center justify-center gap-3 select-none"
                         title="담당 학급(${myClass}반)만 열람하실 수 있습니다.">
                        <div class="w-14 h-14 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center text-xl font-bold">
                            🔒
                        </div>
                        <div>
                            <div class="text-lg font-bold text-slate-400">3학년 ${i}반</div>
                            <div class="text-xs text-slate-500 mt-1">타 학급 열람 제한</div>
                        </div>
                        <span class="text-xs text-slate-600 font-medium mt-1">접근 불가</span>
                    </div>
                `;
            }
        }

        const isHomeroomMsg = isHomeroom
            ? `선생님의 담당 학급인 <strong class="text-indigo-300">3학년 ${myClass}반</strong>을 클릭하여 진학 상담을 시작하세요.`
            : `조회하고자 하는 학급 카드를 클릭하세요. (총 ${classCount}학급)`;

        return `
            <div class="max-w-5xl mx-auto py-8 space-y-6 fade-in">
                <div class="text-center space-y-2">
                    <h2 class="text-2xl font-black text-white flex items-center justify-center gap-2">
                        <span>🏫</span> 상담할 학급을 선택해 주세요
                    </h2>
                    <p class="text-sm text-text-muted">${isHomeroomMsg}</p>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-5">
                    ${cards}
                </div>
            </div>
        `;
    };

    app.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-[1700px] mx-auto min-h-[85vh]">
            <div class="flex flex-wrap items-center justify-between mb-6 pb-4 border-b border-slate-700/50 gap-4">
                <div class="flex items-center gap-3 shrink-0">
                    <img src="${logoUniversal}" alt="로고" class="w-10 h-10 rounded-xl shadow-md border border-indigo-400/40 object-cover shrink-0" />
                    <div>
                        <h1 class="text-2xl font-black text-white flex items-center gap-2.5 whitespace-nowrap">
                            진학 상담 대시보드
                            <span class="text-xs bg-slate-800 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-500/30 font-mono font-bold">v${localVer}</span>
                        </h1>
                        <p class="text-text-muted text-xs mt-0.5 whitespace-nowrap">${schoolName}</p>
                    </div>
                </div>
                <div class="flex items-center gap-3 flex-wrap">
                    <!-- 일반고 지원가이드 판정 기준 커스텀 -->
                    <div class="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700/80 shadow-inner">
                        <span class="text-xs text-slate-300 font-bold" title="기본값 80%. 각 학교 상황에 맞춰 일반고 합격 안정선 기준을 조정할 수 있습니다.">🎯 일반고 안정기준:</span>
                        <input type="number" id="generalGuideCutoffInput" min="50" max="99" step="1" 
                               class="w-14 text-center py-0.5 px-1 rounded bg-slate-900 border border-slate-600 text-indigo-300 text-xs font-bold outline-none" 
                               value="${getGeneralGuideCutoff()}" />
                        <span class="text-xs text-slate-400 font-bold">%</span>
                        <button id="saveGuideCutoffBtn" class="text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded font-bold transition-colors cursor-pointer" title="클릭 시 전체 학생 판정이 즉시 갱신됩니다">적용</button>
                    </div>

                    <button id="classGridHomeBtn" class="btn-secondary whitespace-nowrap text-xs px-3 py-2 flex items-center gap-1.5" style="display: none;">
                        <span>🗂️</span> 학급 목록
                    </button>
                    <button id="exportCurrentClassPatchBtn" class="btn-secondary whitespace-nowrap text-xs px-3 py-2 flex items-center gap-1.5" title="현재 학급의 진학 상담 및 희망원서 취합자료(패치 파일)를 내보냅니다">
                        <span>📤</span> 취합자료 내보내기
                    </button>
                    <button id="lockScreenTeacherBtn" class="btn-secondary whitespace-nowrap text-xs px-3 py-2 flex items-center gap-1.5 text-amber-300 hover:text-amber-200 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer transition-all font-bold" title="자리를 비우실 때 화면을 즉시 잠그고 학생 개인정보를 보호합니다 (단축키: Ctrl+L)">
                        <span>🔒</span> 화면 잠금
                    </button>
                    <button id="openTeacherGuideBtn" class="btn-secondary whitespace-nowrap text-xs px-3 py-2 flex items-center gap-1.5" title="프로그램 사용 설명서 열기">
                        <span>📖</span> 사용 설명서
                    </button>
                    <button id="backBtn" class="btn-secondary whitespace-nowrap text-xs px-4 py-2.5">
                        ${window.currentUser && window.currentUser.Role === 'homeroom' ? '← 로그아웃' : '← 돌아가기'}
                    </button>
                </div>
            </div>

            <!-- 필수 사전 검증 권장 안내 배너 -->
            <div class="mb-6 p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex items-start gap-3.5 shadow-sm break-keep-all select-none">
                <span class="text-2xl mt-0.5">💡</span>
                <div class="text-xs sm:text-sm leading-relaxed text-amber-200">
                    <strong class="text-amber-100 font-bold mb-1 text-sm sm:text-base flex items-center gap-1.5">
                        <span>[필수 사전 검증 권장]</span> 학생·학부모 상담 전, 지원 희망 고교 공식 산출식과 계산값을 대조해 보세요!
                    </strong>
                    고교별 전형 요강(교과/출결/봉사 반영 비율 및 가산점)은 학교별로 상이할 수 있습니다. 1:1 진학 상담 전, 표본 학생의 성적을 <strong>지원 희망 고등학교의 공식 산출 프로그램</strong>에 입력하여 <strong>본 프로그램의 산출값과 일치하는지 반드시 사전 확인</strong> 후 상담에 임해 주시기 바랍니다.
                </div>
            </div>

            <div id="teacherContent">
                ${getClassGridHTML()}
            </div>
        </div>
    `;

    // 일반고 기준 적용 버튼 이벤트
    document.getElementById('saveGuideCutoffBtn')?.addEventListener('click', () => {
        const inputVal = parseFloat(document.getElementById('generalGuideCutoffInput').value);
        if (isNaN(inputVal) || inputVal < 10 || inputVal > 100) {
            alert('유효한 백분율(10~100 사이)을 입력해 주세요.');
            return;
        }
        setGeneralGuideCutoff(inputVal);
        alert(`후기 일반고 합격 안정선 기준이 [${inputVal}%]로 설정되었습니다.\n(경계선: ${Math.min(100, inputVal + 10)}%까지)`);
        const currentClass = activeClassNum;
        if (currentClass) {
            loadClass(currentClass);
        }
    });

    // 창 제목 역할 반영
    if (window.currentUser?.Role === 'homeroom') {
        updateAppWindowTitle('homeroom', window.currentUser.ClassNum);
    } else if (window.currentUser?.Role === 'viewer') {
        updateAppWindowTitle('viewer');
    } else if (window.currentUser?.Role === 'master') {
        if (targetClassNum) {
            updateAppWindowTitle('master', `3학년 ${targetClassNum}반`);
        } else {
            updateAppWindowTitle('master');
        }
    }

    // 학급 카드 클릭 시 학급 로드 함수
    const loadClass = async (classNum) => {
        if (!classNum) {
            activeClassNum = null;
            document.getElementById('classGridHomeBtn').style.display = 'none';
            document.getElementById('teacherContent').innerHTML = getClassGridHTML();
            bindGridEvents();
            if (window.currentUser?.Role === 'master') {
                updateAppWindowTitle('master');
            }
            return;
        }

        activeClassNum = classNum;
        if (window.currentUser?.Role === 'master') {
            updateAppWindowTitle('master', `3학년 ${classNum}반`);
        } else if (window.currentUser?.Role === 'homeroom') {
            updateAppWindowTitle('homeroom', classNum);
        }

        document.getElementById('classGridHomeBtn').style.display = 'inline-flex';
        document.getElementById('teacherContent').innerHTML = '<div class="text-center py-20"><span class="spinner"></span> 데이터를 불러오는 중...</div>';

        try {
            const students = await window.go.main.App.GetClassGrades(classNum);
            renderStudentList(students, classNum);
        } catch (err) {
            document.getElementById('teacherContent').innerHTML = `<div class="text-danger py-20 text-center font-bold">오류 발생: ${err}</div>`;
        }
    };
    window.refreshCurrentClass = () => { if (activeClassNum) loadClass(activeClassNum); };

    // 학급 카드 클릭 이벤트 바인딩
    const bindGridEvents = () => {
        document.querySelectorAll('.class-card-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cNum = parseInt(btn.dataset.class);
                loadClass(cNum);
            });
        });
    };

    bindGridEvents();
    ScreenLockManager.resetTimer();

    document.getElementById('lockScreenTeacherBtn')?.addEventListener('click', () => {
        ScreenLockManager.lockScreen('수동 잠금');
    });

    document.getElementById('classGridHomeBtn')?.addEventListener('click', () => {
        loadClass(null);
    });

    document.getElementById('openTeacherGuideBtn')?.addEventListener('click', () => {
        renderGuideModal(window.currentUser?.Role || 'homeroom');
    });

    document.getElementById('backBtn').addEventListener('click', async () => {
        app.className = '';
        if (window.currentUser && (window.currentUser.Role === 'homeroom' || window.currentUser.Role === 'viewer')) {
            ScreenLockManager.clearTimer();
            await window.go.main.App.Logout?.().catch(() => { });
            window.currentUser = null;
            updateAppWindowTitle();
            renderLoginScreen(schoolName);
        } else {
            updateAppWindowTitle('master');
            renderAdminScreen(schoolName);
        }
    });

    // 담임교사인 경우 본인 반 자동 선택
    if (targetClassNum) {
        loadClass(targetClassNum);
    }
}

function normalizeSchoolName(name) {
    return String(name || '')
        .replace(/고등학교$/u, '')
        .replace(/고$/u, '')
        .replace(/\s+/gu, '')
        .trim();
}

function isSameTrack(left, right) {
    const a = String(left || '').replace('전형', '').trim();
    const b = String(right || '').replace('전형', '').trim();
    return a.includes(b) || b.includes(a);
}

// ===== 마이스터고 및 특성화고 합격 가능 예측 뱃지 렌더러 =====
// 마이스터고 및 특성화고 고교·학과별 정밀 합격 분석 목록 추출 헬퍼
function getPredictionAnalysisList(results, cutoffs, schoolGroup) {
    const isMeister = schoolGroup === 'meister';
    const schoolKeywords = isMeister
        ? ['울산마이스터', '울산에너지', '현대공업']
        : ['울산상업', '울산여자상업', '울산생활과학', '울산공업', '울산산업', '울산미용예술', '울산기술공업', '울산애니원'];

    const matchesGroup = (sName) => {
        const norm = normalizeSchoolName(sName);
        return schoolKeywords.some(kw => norm.includes(kw) || kw.includes(norm));
    };

    // 해당 학교군에 등록된 커트라인이 존재하는지 확인
    const relevantCutoffs = (cutoffs || []).filter(c =>
        matchesGroup(c.schoolName) && Number(c.minValue) > 0
    );

    const list = [];
    const seen = new Set();

    (results || []).filter(r => matchesGroup(r.schoolName)).forEach(r => {
        const candidates = relevantCutoffs
            .filter(c => {
                const normC = normalizeSchoolName(c.schoolName);
                const normR = normalizeSchoolName(r.schoolName);
                const schoolMatch = normC === normR || normC.includes(normR) || normR.includes(normC);
                return schoolMatch && isSameTrack(c.track, r.trackName);
            })
            .sort((a, b) => Number(b.year || 0) - Number(a.year || 0));

        candidates.forEach(c => {
            const deptLabel = (!c.department || c.department === '공통') ? '' : c.department;
            const key = `${normalizeSchoolName(r.schoolName)}_${deptLabel}_${r.trackName}_${c.year}`;

            if (!seen.has(key)) {
                seen.add(key);
                const studentScore = Number(r.totalScore) || 0;
                const minScore = Number(c.minValue) || 0;
                const avgScore = Number(c.avgValue) || 0;
                const maxScore = Number(c.maxValue) || 0;
                const diff = studentScore - minScore;
                const isPass = studentScore >= minScore;

                let status = '도전';
                let statusColor = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
                if (diff >= 5) {
                    status = '안정';
                    statusColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
                } else if (diff >= 0) {
                    status = '적정';
                    statusColor = 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
                } else if (diff >= -5) {
                    status = '소신';
                    statusColor = 'bg-orange-500/20 text-orange-300 border-orange-500/40';
                }

                list.push({
                    schoolName: r.schoolName,
                    dept: deptLabel || '학교 전체(공통)',
                    track: r.trackName,
                    year: c.year || 2026,
                    studentScore,
                    minScore,
                    avgScore,
                    maxScore,
                    diff,
                    status,
                    statusColor,
                    isPass
                });
            }
        });
    });

    return list;
}



// ===== 희망학교 세로 1열 스택(Vertical Stack) 렌더러 (개별 즉시 삭제 X 버튼 탑재) =====
function renderApplicationSummary(applications, classNum, studentNum, studentName) {
    const completed = (applications || []).filter(a => a.status && a.status !== '미입력');
    if (!completed.length) {
        return '<span class="inline-flex items-center px-3 py-1 rounded-full bg-slate-800/90 text-slate-400 text-xs border border-slate-700 font-semibold shadow-xs">미입력</span>';
    }

    const getStatusTheme = (status) => {
        switch (status) {
            case '합격':
            case '최종 진학':
            case '최종진학':
                return {
                    border: 'border-emerald-400/80 bg-emerald-950/60 text-emerald-100',
                    badge: 'bg-emerald-600 text-white font-black border border-emerald-300 shadow-md'
                };
            case '불합격':
                return {
                    border: 'border-rose-400/80 bg-rose-950/60 text-rose-100',
                    badge: 'bg-rose-600 text-white font-black border border-rose-300 shadow-md'
                };
            case '지원 완료':
            case '지원완료':
                return {
                    border: 'border-sky-400/80 bg-sky-950/60 text-sky-100',
                    badge: 'bg-sky-600 text-white font-bold border border-sky-300 shadow-md'
                };
            case '미진학':
                return {
                    border: 'border-slate-600 bg-slate-900/80 text-slate-300',
                    badge: 'bg-slate-700 text-slate-300 border border-slate-500 font-medium'
                };
            case '지원 예정':
            case '지원예정':
            default:
                return {
                    border: 'border-amber-400/80 bg-amber-950/50 text-amber-100',
                    badge: 'bg-amber-600 text-white font-bold border border-amber-300 shadow-md'
                };
        }
    };

    const items = completed.map(a => {
        const theme = getStatusTheme(a.status);
        let school = a.schoolName || (a.category === 'general' ? '후기 일반고' : '기타');
        if (a.category === 'general' && a.assignedSchool) {
            school = `일반고 [${a.assignedSchool}]`;
        } else if (a.assignedDepartment) {
            school = `${school} (${a.assignedDepartment})`;
        }
        return `
            <div class="inline-flex items-center justify-between w-full max-w-56 px-3 py-1.5 rounded-xl text-[11px] border ${theme.border} shadow-sm group/app-badge transition-all">
                <span class="truncate max-w-28 font-bold" title="${escapeAttr(school)}">${escapeHtml(school)}</span>
                <div class="inline-flex items-center gap-1 shrink-0">
                    <span class="text-[10px] px-2 py-0.5 rounded-full ${theme.badge} whitespace-nowrap">${escapeHtml(a.status)}</span>
                    <button type="button" class="btn-delete-app-item inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-white hover:bg-rose-600 transition-all cursor-pointer font-black text-[11px] ml-0.5 active:scale-90"
                            data-class="${classNum || ''}" data-num="${studentNum || ''}" data-name="${escapeAttr(studentName || '')}"
                            data-cat="${escapeAttr(a.category || '')}" data-school="${escapeAttr(a.schoolName || '')}" data-track="${escapeAttr(a.track || '')}"
                            title="${escapeAttr(school)} 진로희망 삭제">
                        ✕
                    </button>
                </div>
            </div>
        `;
    });

    return `<div class="flex flex-col gap-1.5 items-center w-full">${items.join('')}</div>`;
}

async function renderStudentList(students, classNum) {
    if (!students || students.length === 0) {
        document.getElementById('teacherContent').innerHTML = `
            <div class="text-center py-20 text-warning">
                <div class="text-4xl mb-4">📭</div>
                ${classNum}반 학생 데이터가 없습니다. 관리자 모드에서 나이스 엑셀 파일을 업로드해 주세요.
            </div>
        `;
        return;
    }

    const [fullStudents, dbCutoffs, officialResp, counselSummary] = await Promise.all([
        window.go.main.App.GetClassFullGrades(classNum).catch(() => []),
        window.go.main.App.GetCutoffs().catch(() => []),
        window.go.main.App.GetOfficialAdmissionData().catch(() => null),
        window.go.main.App.GetClassCounselingSummary ? window.go.main.App.GetClassCounselingSummary(classNum).catch(() => ({})) : Promise.resolve({}),
    ]);

    // 공식 공개 자료를 커트라인 형태로 정규화 및 결합
    const officialCutoffs = (officialResp?.items || []).map(item => ({
        schoolName: item.schoolName || '',
        department: item.department || '',
        track: item.track || '일반전형',
        minValue: Number(item.minAcceptedScore || item.minValue || 0),
        avgValue: Number(item.avgAcceptedScore || item.avgValue || 0),
        year: item.admissionYear || item.year || 0,
        isOfficial: true,
    })).filter(c => {
        if (!c.minValue || c.minValue <= 0) return false;
        if (c.schoolName.includes('청량고')) return false;
        return true;
    });

    const cutoffs = [...(dbCutoffs || []), ...officialCutoffs];
    const fullByStudent = new Map((fullStudents || []).map(s => [`${s.studentNum}|${s.name}`, s]));
    const applicationRows = await Promise.all(students.map(async (s) => {
        const records = await window.go.main.App.GetStudentApplications(classNum, s.StudentNum, s.Name).catch(() => []);
        return [`${s.StudentNum}|${s.Name}`, records];
    }));
    const applicationsByStudent = new Map(applicationRows);

    // 검색 및 정렬 상태 변수
    let currentSearchQuery = '';
    let currentSortMode = 'num_asc';

    // 학생별 가공 데이터 캐싱
    const processedStudents = students.map(s => {
        const full = fullByStudent.get(`${s.StudentNum}|${s.Name}`);
        const meisterList = getPredictionAnalysisList(full?.schoolResults, cutoffs, 'meister');
        const specialList = getPredictionAnalysisList(full?.schoolResults, cutoffs, 'special');
        const meisterPassCount = new Set(meisterList.filter(x => x.isPass).map(x => normalizeSchoolName(x.schoolName))).size;
        const specialPassCount = new Set(specialList.filter(x => x.isPass).map(x => normalizeSchoolName(x.schoolName))).size;
        const applications = applicationsByStudent.get(`${s.StudentNum}|${s.Name}`) || [];

        // 전교 학생수: s.TotalStudents 우선, 백분율/석차 기반 유추, 학급 학생수
        let totalStudents = s.TotalStudents || full?.totalStudents || full?.TotalStudents || 0;
        if ((!totalStudents || totalStudents <= 0) && s.Percentile > 0 && s.Rank > 0) {
            totalStudents = Math.round(Number(s.Rank) / (Number(s.Percentile) / 100));
        }

        return {
            raw: s,
            studentNum: s.StudentNum,
            numInt: parseInt(s.StudentNum, 10) || 0,
            name: s.Name,
            percentile: s.Percentile != null ? Number(s.Percentile) : 999,
            rank: s.Rank || '',
            totalStudents: totalStudents || students.length,
            meisterPassCount,
            specialPassCount,
            applications,
            generalBadge: getGeneralGuideBadge(s.Percentile)
        };
    });

    // 테이블 렌더링 함수
    const updateDashboardTable = () => {
        let filtered = [...processedStudents];

        // 1. 신호등 매트릭스급 학생 번호/성명 검색 필터링 (프라이버시 모드)
        if (currentSearchQuery.trim()) {
            const qRaw = currentSearchQuery.trim();
            const qLower = qRaw.toLowerCase().replace(/\s+/g, '');
            const isDigitOnly = /^[0-9]+$/.test(qLower);

            filtered = filtered.filter(s => {
                const sName = (s.name || '').replace(/\s+/g, '').toLowerCase();
                const sNum = s.numInt;

                // 이름 검색 (부분 일치)
                if (sName.includes(qLower)) return true;

                // 순수 숫자 검색 (1~2자리 번호 매칭)
                if (isDigitOnly) {
                    const qVal = parseInt(qLower, 10);
                    if (qLower.length <= 2) {
                        return sNum === qVal;
                    }
                    // 3~4자리 학번 매칭 (예: 101, 3101)
                    const shortId = parseInt(`${classNum}${String(sNum).padStart(2, '0')}`, 10);
                    if (shortId === qVal) return true;
                    const fullId = parseInt(`3${classNum}${String(sNum).padStart(2, '0')}`, 10);
                    if (fullId === qVal) return true;
                }

                // 하이픈 학번 (예: 1-1, 1반 1번)
                if (qLower.includes('-')) {
                    const parts = qLower.split('-');
                    if (parts.length === 2 && parseInt(parts[0], 10) === classNum) {
                        return sNum === parseInt(parts[1], 10);
                    }
                }
                const koreanPattern = `${classNum}반${sNum}번`;
                if (koreanPattern === qLower) return true;

                return false;
            });
        }

        // 2. 정렬 로직
        filtered.sort((a, b) => {
            switch (currentSortMode) {
                case 'num_asc':
                    return a.numInt - b.numInt;
                case 'name_asc':
                    return (a.name || '').localeCompare(b.name || '', 'ko');
                case 'general_asc':
                    return a.percentile - b.percentile;
                case 'general_desc':
                    return b.percentile - a.percentile;
                case 'meister_desc':
                    return b.meisterPassCount - a.meisterPassCount;
                case 'special_desc':
                    return b.specialPassCount - a.specialPassCount;
                default:
                    return a.numInt - b.numInt;
            }
        });

        // 3. tbody HTML 생성
        let tbody = '';
        if (!filtered.length) {
            tbody = `
                <tr>
                    <td colspan="6" class="p-12 text-center text-slate-400">
                        <div class="text-3xl mb-2">🔍</div>
                        <div class="font-bold text-white mb-1">'${escapeHtml(currentSearchQuery)}' 검색 조건과 일치하는 학생이 없습니다.</div>
                        <div class="text-xs text-slate-500">학생 번호(예: 1, 15)나 이름을 다시 확인해 주세요.</div>
                    </td>
                </tr>
            `;
        } else {
            filtered.forEach(s => {
                const isPassed = (st) => ['합격', '최종 진학', '최종진학'].includes((st || '').trim());
                const isFinalizedStudent = s.applications.some(a => {
                    if (!isPassed(a.status)) return false;
                    if (['meister', 'special'].includes(a.category)) {
                        return !!(a.assignedDepartment && a.assignedDepartment.trim());
                    }
                    if (a.category === 'general') {
                        return !!(a.assignedSchool && a.assignedSchool.trim());
                    }
                    return true;
                });

                const applicationSummary = renderApplicationSummary(s.applications, classNum, s.studentNum, s.name);

                let appCellHTML = '';
                if (!s.applications.length || s.applications.every(a => !a.status || a.status === '미입력')) {
                    appCellHTML = `
                        <button class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-dashed border-indigo-500/50 bg-indigo-500/10 hover:bg-indigo-500/25 hover:border-indigo-400 text-indigo-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-xs btn-student-application active:scale-95"
                                data-class="${classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}" title="클릭하여 희망학교 입력">
                            <svg class="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                            <span>희망학교 입력</span>
                        </button>
                    `;
                } else {
                    appCellHTML = `
                        <div class="flex items-center justify-center gap-2 flex-wrap">
                            <div class="flex-1 min-w-36">
                                ${applicationSummary}
                            </div>
                            ${isFinalizedStudent ? `
                                <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[11px] font-bold shadow-xs whitespace-nowrap" title="합격 및 최종 배정 완료 (희망학교 비활성화 잠금 상태)">
                                    <svg class="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                                    <span>확정</span>
                                </span>
                            ` : `
                                <button class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 hover:border-indigo-400 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-xs btn-student-application active:scale-95"
                                        data-class="${classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}" title="희망학교 추가 및 수정">
                                    <svg class="w-3.5 h-3.5 text-indigo-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                    <span>추가/수정</span>
                                </button>
                            `}
                        </div>
                    `;
                }

                tbody += `
                    <tr class="hover:bg-slate-800/70 transition-colors border-b border-slate-700/50">
                        <td class="p-3.5 text-center font-mono font-bold text-slate-400">
                            <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-300 shadow-inner">
                                ${s.studentNum || '-'}
                            </span>
                        </td>
                        <td class="p-3.5 font-bold text-white text-center text-lg cursor-pointer hover:text-indigo-300 hover:underline text-student-name transition-colors"
                            data-class="${classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}" title="클릭하여 진학 상담 시작">
                            <div class="flex flex-col items-center justify-center">
                                <span>${escapeHtml(s.name)}</span>
                                ${counselSummary && counselSummary[s.studentNum] ? `
                                    <span class="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-600 text-white font-bold mt-1 shadow-sm border border-indigo-400" title="최근 상담일: ${counselSummary[s.studentNum]} (본인 작성)">
                                        <span>💬</span> ${counselSummary[s.studentNum]}
                                    </span>
                                ` : `
                                    <span class="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-semibold mt-1">
                                        미상담
                                    </span>
                                `}
                            </div>
                        </td>
                        <td class="p-3.5 text-center">${s.generalBadge}</td>
                        <td class="p-3.5 text-center min-w-60">
                            <div class="flex items-center justify-center gap-2 flex-wrap">
                                <button class="btn-prediction-detail inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 ${s.meisterPassCount > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500/30' : 'bg-slate-800/80 text-slate-400 border border-slate-700/60 hover:bg-slate-800'}"
                                        data-class="${classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}" data-category="meister"
                                        data-percentile="${s.percentile !== 999 ? s.percentile.toFixed(2) : ''}" data-rank="${s.rank || ''}" data-total="${s.totalStudents}"
                                        title="${escapeAttr(s.name)} 학생의 마이스터고 합격 예측 상세 분석 보기 (클릭)">
                                    <span class="text-sm">🏛️</span>
                                    <span>마이스터고</span>
                                    <span class="px-1.5 py-0.2 rounded-full text-[11px] font-black ${s.meisterPassCount > 0 ? 'bg-amber-500 text-slate-950' : 'bg-slate-700 text-slate-400'}">${s.meisterPassCount}</span>
                                </button>
                                <button class="btn-prediction-detail inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 ${s.specialPassCount > 0 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 hover:bg-cyan-500/30' : 'bg-slate-800/80 text-slate-400 border border-slate-700/60 hover:bg-slate-800'}"
                                        data-class="${classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}" data-category="special"
                                        data-percentile="${s.percentile !== 999 ? s.percentile.toFixed(2) : ''}" data-rank="${s.rank || ''}" data-total="${s.totalStudents}"
                                        title="${escapeAttr(s.name)} 학생의 특성화고 합격 예측 상세 분석 보기 (클릭)">
                                    <span class="text-sm">🏭</span>
                                    <span>특성화고</span>
                                    <span class="px-1.5 py-0.2 rounded-full text-[11px] font-black ${s.specialPassCount > 0 ? 'bg-cyan-500 text-slate-950' : 'bg-slate-700 text-slate-400'}">${s.specialPassCount}</span>
                                </button>
                            </div>
                        </td>
                        <td class="p-3.5 text-center min-w-56">${appCellHTML}</td>
                        <td class="p-3.5 text-center w-36">
                            <button class="btn-primary w-full text-xs px-3.5 py-2 font-bold inline-flex items-center justify-center gap-1.5 rounded-xl btn-student-counsel transition-all hover:scale-105 shadow-md shadow-indigo-500/20 cursor-pointer active:scale-95"
                                    data-class="${classNum}" data-num="${s.studentNum}" data-name="${escapeAttr(s.name)}">
                                <svg class="w-3.5 h-3.5 text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                                <span class="whitespace-nowrap">진학 상담</span>
                            </button>
                        </td>
                    </tr>
                `;
            });
        }

        const tbodyEl = document.getElementById('dashboardStudentTableBody');
        if (tbodyEl) {
            tbodyEl.innerHTML = tbody;
            bindTableEventListeners();
        }

        // 프라이버시 모드 배너 갱신
        const privacyBannerEl = document.getElementById('dashboardPrivacyBanner');
        if (privacyBannerEl) {
            if (currentSearchQuery.trim()) {
                privacyBannerEl.innerHTML = `
                    <div class="flex items-center justify-between gap-3 w-full animate-in fade-in">
                        <div class="flex items-center gap-2">
                            <span class="text-base">🔒</span>
                            <span class="font-bold text-emerald-300">[1:1 프라이버시 상담 모드 가동 중]:</span>
                            <span class="text-slate-200">'<strong class="text-white">${escapeHtml(currentSearchQuery.trim())}</strong>' 검색됨 (<strong>${filtered.length}명</strong> 노출) — 상담 중 다른 학생의 점수와 개인정보가 완전히 차단되어 안전합니다.</span>
                        </div>
                        <button id="resetPrivacyFilterBtn" class="text-xs px-2.5 py-1 rounded-lg bg-indigo-600/50 hover:bg-indigo-600 text-white font-bold transition-all cursor-pointer shrink-0">
                            전체 학생 보기
                        </button>
                    </div>
                `;
                privacyBannerEl.classList.remove('hidden');
                document.getElementById('resetPrivacyFilterBtn')?.addEventListener('click', () => {
                    currentSearchQuery = '';
                    const searchInput = document.getElementById('dashboardStudentSearchInput');
                    if (searchInput) searchInput.value = '';
                    updateDashboardTable();
                });
            } else {
                privacyBannerEl.classList.add('hidden');
                privacyBannerEl.innerHTML = '';
            }
        }
    };

    // 테이블 내부 이벤트 바인딩
    const bindTableEventListeners = () => {
        // 진학 상담 버튼
        document.querySelectorAll('.btn-student-counsel').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget;
                openStudentModal(parseInt(target.dataset.class), target.dataset.num, target.dataset.name);
            });
        });

        // 희망학교 입력/수정 버튼
        document.querySelectorAll('.btn-student-application').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget;
                openStudentApplicationModal(parseInt(target.dataset.class), target.dataset.num, target.dataset.name);
            });
        });

        // 학생 이름 클릭 (성적표 모달)
        document.querySelectorAll('.text-student-name').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget;
                openStudentTranscriptModal(parseInt(target.dataset.class), target.dataset.num, target.dataset.name);
            });
        });

        // 마이스터/특성화고 합격 예측 상세 버튼
        document.querySelectorAll('.btn-prediction-detail').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget;
                const cNum = parseInt(target.dataset.class, 10);
                const sNum = target.dataset.num;
                const sName = target.dataset.name;
                const cat = target.dataset.category;
                const extraData = {
                    percentile: target.dataset.percentile,
                    rank: target.dataset.rank,
                    total: target.dataset.total
                };
                openPredictionDetailModal(cNum, sNum, sName, cat, extraData);
            });
        });

        // 희망학교 개별 [✕] 삭제 버튼 핸들러 (원클릭 삭제)
        document.querySelectorAll('.btn-delete-app-item').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const cNum = parseInt(btn.dataset.class, 10) || classNum;
                const sNum = btn.dataset.num;
                const sName = btn.dataset.name;
                const cat = btn.dataset.cat;
                const school = btn.dataset.school;
                const track = btn.dataset.track;

                const confirmed = await showModalConfirm({
                    title: '진로희망 학교 삭제',
                    message: `<strong>${escapeHtml(sName)}</strong> (${sNum}번) 학생의<br><strong class="text-indigo-300">[${escapeHtml(school || '희망학교')}]</strong> 지원 이력을 삭제하시겠습니까?`,
                    confirmText: '삭제하기',
                    type: 'warning'
                });
                if (!confirmed) return;

                try {
                    await window.go.main.App.DeleteStudentApplication(cNum, sNum, sName, cat, school, track);
                    await showModalAlert(`'${sName}' 학생의 [${school}] 지원 기록이 삭제되었습니다.`, '삭제 완료', 'success');
                    if (window.refreshCurrentClass) {
                        window.refreshCurrentClass();
                    }
                } catch (err) {
                    await showModalAlert('삭제 실패: ' + err, '오류', 'error');
                }
            });
        });
    };

    // 전체 대시보드 UI 프레임 구성
    document.getElementById('teacherContent').innerHTML = `
        <!-- 상단 컨트롤 툴바: 정렬, 학생번호/이름 검색, 매트릭스, 반 통계 -->
        <div class="flex items-center justify-between mb-3 flex-wrap gap-3 bg-slate-800/50 p-3.5 rounded-2xl border border-slate-700/60 shadow-lg backdrop-blur-sm">
            <div class="flex items-center gap-3 flex-wrap flex-1 min-w-70">
                <div class="text-sm text-text-muted">
                    <span class="text-white font-bold text-base">학생 목록</span> (총 <span class="font-bold text-indigo-400">${students.length}</span>명)
                </div>

                <!-- 학생 검색창 (신호등 매트릭스급 실시간 검색) -->
                <div class="relative flex-1 max-w-xs min-w-50">
                    <span class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </span>
                    <input id="dashboardStudentSearchInput" type="text"
                           class="w-full pl-9 pr-7 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 text-xs text-white ph-subtle focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-semibold"
                           placeholder="번호(1, 15) 또는 이름 검색..." />
                    <button id="clearDashboardSearchBtn" class="absolute inset-y-0 right-0 items-center pr-2.5 text-slate-400 hover:text-white cursor-pointer text-xs font-bold hidden" title="검색 지우기">✕</button>
                </div>

                <!-- 정렬 드롭다운 -->
                <select id="dashboardStudentSortSelect" class="rounded-xl bg-slate-900/90 border border-slate-700 text-xs text-white px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold cursor-pointer">
                    <option value="num_asc">🔢 번호순 (오름차순)</option>
                    <option value="name_asc">🔤 성명순 (가나다)</option>
                    <option value="general_asc">🟢 일반계고 안정순 (석차백분율↑)</option>
                    <option value="general_desc">🔴 일반계고 위험순 (석차백분율↓)</option>
                    <option value="meister_desc">🏛️ 마이스터고 유망순</option>
                    <option value="special_desc">🏭 특성화고 유망순</option>
                </select>
            </div>

            <!-- 우측 액션 버튼들 -->
            <div class="flex gap-2 flex-wrap items-center">
                <button id="refreshDashboardBtn" class="btn-secondary text-xs px-3 py-2 font-bold flex items-center gap-1.5 hover:border-sky-400/80 hover:text-sky-300 transition-all cursor-pointer" title="대시보드 학생 목록 및 상담 상태 새로고침">
                    <span class="text-xs">🔄</span>
                    <span>새로고침</span>
                </button>
                <button id="openMatrixBtn" class="btn-secondary text-xs px-3 py-2 font-bold flex items-center gap-1.5 hover:border-indigo-400/80 transition-all" title="우리 반 전체 고교별 신호등 매트릭스 보기">
                    <svg class="w-3.5 h-3.5 text-indigo-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                    <span>신호등 매트릭스</span>
                </button>
                <button id="openClassApplicationSummaryBtn" class="btn-secondary text-xs px-3 py-2 font-bold flex items-center gap-1.5 hover:border-emerald-400/80 transition-all" title="우리 반 지원희망 통계">
                    <svg class="w-3.5 h-3.5 text-emerald-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 00-2-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                    <span>우리 반 통계</span>
                </button>
            </div>
        </div>

        <!-- 1:1 프라이버시 모드 안내 배너 (검색 시 자동 활성화) -->
        <div id="dashboardPrivacyBanner" class="hidden mb-3 px-4 py-2.5 rounded-xl bg-indigo-950/80 border border-indigo-500/60 shadow-md text-xs text-indigo-200"></div>

        <!-- 학생 목록 메인 테이블 -->
        <div class="overflow-x-auto rounded-2xl border border-slate-700/60 bg-slate-800/30 shadow-xl">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-slate-800/90 text-text-muted text-sm border-b border-slate-700/70 select-none">
                        <th class="p-3.5 font-semibold text-center w-16">번호</th>
                        <th class="p-3.5 font-semibold text-center w-32">성명</th>
                        <th class="p-3.5 font-semibold text-center w-48">일반계고 합격 예측</th>
                        <th class="p-3.5 font-semibold text-center min-w-64">마이스터고 및 특성화고 합격 예측</th>
                        <th class="p-3.5 font-semibold text-center min-w-56">희망학교</th>
                        <th class="p-3.5 font-semibold text-center w-36">진학 상담</th>
                    </tr>
                </thead>
                <tbody id="dashboardStudentTableBody">
                </tbody>
            </table>
        </div>
        <div class="mt-3.5 text-xs text-text-muted flex items-center justify-between flex-wrap gap-2">
            <span class="text-slate-400">💡 <strong>프라이버시 보호 안내:</strong> 상담 시 상단 검색창에 학생 번호나 이름을 입력하면 해당 학생만 화면에 단독 노출되어 다른 학생들의 점수가 완벽히 가려집니다.</span>
            <span>* 일반고 지표는 3학년 1학기 성적 기준 간이 참고치이며, 정식 일반고 내신은 교육청 프로그램을 따릅니다.</span>
        </div>
    `;

    // 초기 테이블 렌더링
    updateDashboardTable();

    // 상단 검색창 이벤트 리스너
    const searchInput = document.getElementById('dashboardStudentSearchInput');
    const clearSearchBtn = document.getElementById('clearDashboardSearchBtn');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearchQuery = e.target.value;
            if (clearSearchBtn) {
                const hasQuery = Boolean(currentSearchQuery.trim());
                clearSearchBtn.classList.toggle('hidden', !hasQuery);
                clearSearchBtn.classList.toggle('flex', hasQuery);
            }
            updateDashboardTable();
        });
    }
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            currentSearchQuery = '';
            if (searchInput) searchInput.value = '';
            clearSearchBtn.classList.add('hidden');
            clearSearchBtn.classList.remove('flex');
            updateDashboardTable();
        });
    }

    // 정렬 드롭다운 이벤트 리스너
    const sortSelect = document.getElementById('dashboardStudentSortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSortMode = e.target.value;
            updateDashboardTable();
        });
    }

    // 대시보드 새로고침 버튼
    document.getElementById('refreshDashboardBtn')?.addEventListener('click', () => {
        if (typeof window.refreshCurrentClass === 'function') {
            window.refreshCurrentClass();
        }
    });

    // 신호등 매트릭스 버튼
    document.getElementById('openMatrixBtn')?.addEventListener('click', () => {
        openMatrixModal(classNum);
    });

    // 우리 반 통계 버튼
    document.getElementById('openClassApplicationSummaryBtn')?.addEventListener('click', () => {
        openClassApplicationSummaryModal(classNum);
    });

    // 취합자료 내보내기 버튼 (상단 툴바가 있는 경우)
    document.getElementById('exportCurrentClassPatchBtn')?.addEventListener('click', async () => {
        const password = await showModalPrompt({
            title: '취합자료 내보내기',
            message: '학년부장이 안내한 공용 데이터 암호를 입력하세요.',
            isPassword: true
        });
        if (!password) return;
        try {
            const path = await window.go.main.App.SaveCurrentClassPatch(password);
            await showModalAlert(`취합자료 파일을 저장했습니다.\n${path}\n\n이 파일을 학년부장에게 전달하세요.`, '취합자료 저장 완료', 'success');
        } catch (err) {
            await showModalAlert('취합자료 제출 실패: ' + err, '오류', 'error');
        }
    });
}

// ===== 마이스터고 및 특성화고 합격 예측 상세 분석 팝업 모달 =====
async function openPredictionDetailModal(classNum, studentNum, studentName, category, extraData = {}) {
    document.getElementById('predictionDetailModal')?.remove();

    const isMeister = category === 'meister';
    const titleCategory = isMeister ? '마이스터고' : '특성화고';
    const categoryIcon = isMeister ? '🏛️' : '🏭';

    // 1. 학생 전체 성적 및 커트라인 로드
    let fullStudent = null;
    let cutoffs = [];
    try {
        const [fullStudents, dbCutoffs, officialResp] = await Promise.all([
            window.go.main.App.GetClassFullGrades(classNum).catch(() => []),
            window.go.main.App.GetCutoffs().catch(() => []),
            window.go.main.App.GetOfficialAdmissionData().catch(() => null),
        ]);
        fullStudent = (fullStudents || []).find(s => 
            String(s.studentNum) === String(studentNum) || s.name === studentName
        );

        const officialCutoffs = (officialResp?.items || []).map(item => ({
            schoolName: item.schoolName || '',
            department: item.department || '',
            track: item.track || '일반전형',
            minValue: Number(item.minAcceptedScore || item.minValue || 0),
            avgValue: Number(item.avgAcceptedScore || item.avgValue || 0),
            maxValue: Number(item.maxFailedScore || item.maxValue || 0),
            year: item.admissionYear || item.year || 0,
            isOfficial: true,
        })).filter(c => {
            if (!c.minValue || c.minValue <= 0) return false;
            if (c.schoolName.includes('청량고')) return false;
            return true;
        });

        cutoffs = [...(dbCutoffs || []), ...officialCutoffs];
    } catch (err) {
        console.error('분석 데이터 로드 실패:', err);
    }

    const analysisList = getPredictionAnalysisList(fullStudent?.schoolResults, cutoffs, category);
    const passCount = analysisList.filter(x => x.isPass).length;
    const passSchoolCount = new Set(analysisList.filter(x => x.isPass).map(x => normalizeSchoolName(x.schoolName))).size;

    // 석차 및 백분율 확정
    const displayPercentile = fullStudent?.generalHSPercentile != null && fullStudent.generalHSPercentile > 0
        ? Number(fullStudent.generalHSPercentile).toFixed(2) + '%'
        : (extraData.percentile ? extraData.percentile + '%' : '-');
    const displayRank = extraData.rank || fullStudent?.rank || '-';
    let displayTotal = extraData.total || fullStudent?.totalStudents || fullStudent?.TotalStudents || 0;

    // 만약 전달받은 displayTotal이 displayRank보다 작거나 비정상적인 경우 (예: 전교 49등인데 반 학생수 10명이 전달된 경우)
    const rankNum = parseInt(displayRank, 10);
    const totalNum = parseInt(displayTotal, 10);
    if ((!totalNum || (rankNum && totalNum < rankNum)) && (extraData.percentile || fullStudent?.generalHSPercentile)) {
        const pct = parseFloat(extraData.percentile || fullStudent?.generalHSPercentile);
        if (pct > 0 && rankNum > 0) {
            displayTotal = Math.round(rankNum / (pct / 100));
        }
    }
    if (!displayTotal || displayTotal === 0) displayTotal = '-';

    // 모달 DOM 생성
    const modal = document.createElement('div');
    modal.id = 'predictionDetailModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto animate-fade-in print:p-0 print:bg-white';

    // body에 먼저 등록하여 쿼리셀렉터가 항상 성공하도록 보장
    document.body.appendChild(modal);

    let activeFilter = 'all'; // 'all' or 'pass'

    const renderModalContent = () => {
        const displayList = [...(activeFilter === 'pass' ? analysisList.filter(x => x.isPass) : analysisList)];

        // 기준연도(내림차순) -> 고교명(가나다) -> 전형구분(일반 우선) -> 학과명(공통 우선) 순서로 정렬
        displayList.sort((a, b) => {
            if (Number(b.year) !== Number(a.year)) return Number(b.year) - Number(a.year);
            const schComp = String(a.schoolName || '').localeCompare(String(b.schoolName || ''), 'ko');
            if (schComp !== 0) return schComp;
            const aTrk = String(a.track || '');
            const bTrk = String(b.track || '');
            if (aTrk !== bTrk) {
                if (aTrk.includes('일반')) return -1;
                if (bTrk.includes('일반')) return 1;
                return aTrk.localeCompare(bTrk, 'ko');
            }
            const aIsCommon = a.dept.includes('공통') || a.dept.includes('전체') ? 0 : 1;
            const bIsCommon = b.dept.includes('공통') || b.dept.includes('전체') ? 0 : 1;
            if (aIsCommon !== bIsCommon) return aIsCommon - bIsCommon;
            return String(a.dept || '').localeCompare(String(b.dept || ''), 'ko');
        });

        // 같은 기준연도, 같은 고교명, 같은 전형구분 행 병합(rowspan) 계산
        const yearSpans = [];
        const schoolSpans = [];
        const trackSpans = [];

        for (let i = 0; i < displayList.length; i++) {
            // 1. 기준연도 rowspan
            if (i === 0 || displayList[i].year !== displayList[i - 1].year) {
                let count = 1;
                while (i + count < displayList.length && displayList[i + count].year === displayList[i].year) {
                    count++;
                }
                yearSpans[i] = count;
            } else {
                yearSpans[i] = 0;
            }

            // 2. 고교명 rowspan (같은 연도 내에서)
            if (i === 0 || displayList[i].year !== displayList[i - 1].year || displayList[i].schoolName !== displayList[i - 1].schoolName) {
                let count = 1;
                while (i + count < displayList.length && 
                       displayList[i + count].year === displayList[i].year && 
                       displayList[i + count].schoolName === displayList[i].schoolName) {
                    count++;
                }
                schoolSpans[i] = count;
            } else {
                schoolSpans[i] = 0;
            }

            // 3. 전형구분 rowspan (같은 연도 & 같은 고교 내에서)
            if (i === 0 || displayList[i].year !== displayList[i - 1].year || 
                displayList[i].schoolName !== displayList[i - 1].schoolName || 
                displayList[i].track !== displayList[i - 1].track) {
                let count = 1;
                while (i + count < displayList.length && 
                       displayList[i + count].year === displayList[i].year && 
                       displayList[i + count].schoolName === displayList[i].schoolName && 
                       displayList[i + count].track === displayList[i].track) {
                    count++;
                }
                trackSpans[i] = count;
            } else {
                trackSpans[i] = 0;
            }
        }

        // 고교별 환산점수 뱃지 목록 (undefined만점 완벽 해결 & 카드 확장)
        const schoolScoresHTML = (fullStudent?.schoolResults || [])
            .filter(r => isMeister
                ? ['울산마이스터', '울산에너지', '현대공업'].some(kw => normalizeSchoolName(r.schoolName).includes(kw))
                : ['울산상업', '울산여자상업', '울산생활과학', '울산공업', '울산산업', '울산미용예술', '울산기술공업', '울산애니원'].some(kw => normalizeSchoolName(r.schoolName).includes(kw))
            )
            .map(r => {
                const sNameNorm = normalizeSchoolName(r.schoolName);
                let defaultMax = 100;
                if (sNameNorm.includes('마이스터')) defaultMax = 300;
                else if (sNameNorm.includes('에너지')) defaultMax = 230;
                else if (sNameNorm.includes('현대공업')) defaultMax = 200;
                const maxVal = r.totalMax || r.TotalMax || defaultMax;

                return `
                    <div class="bg-slate-900/90 p-2.5 rounded-xl border border-slate-700/70 flex items-center justify-between gap-3 shadow-inner hover:border-slate-600 transition-colors prediction-score-item">
                        <div class="flex flex-col min-w-0">
                            <span class="text-xs font-bold text-white truncate">${r.schoolName}</span>
                            <span class="text-[11px] text-indigo-300 font-semibold truncate">${r.trackName}전형</span>
                        </div>
                        <div class="text-right shrink-0">
                            <div class="text-sm font-black text-amber-300">${Number(r.totalScore).toFixed(2)}점</div>
                            <div class="text-[10px] text-slate-400 font-medium">${maxVal}점 만점</div>
                        </div>
                    </div>
                `;
            }).join('');

        let tableRowsHTML = '';
        if (displayList.length === 0) {
            tableRowsHTML = `
                <tr>
                    <td colspan="8" class="p-12 text-center text-text-muted">
                        <p class="text-3xl mb-2">📭</p>
                        <p class="font-bold text-slate-300 text-sm">해당 조건에 일치하는 분석 데이터가 없습니다.</p>
                        <p class="text-xs text-slate-400 mt-1">고교 커트라인 통합 관리 화면에서 해당 고교의 합격선을 등록해 보세요.</p>
                    </td>
                </tr>
            `;
        } else {
            tableRowsHTML = displayList.map((item, idx) => {
                const diffStr = item.diff >= 0 ? `+${item.diff.toFixed(2)}` : item.diff.toFixed(2);
                const diffColor = item.diff >= 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-bold';
                const statusBadge = item.isPass
                    ? `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1 shadow-xs">🟢 ${item.status}</span>`
                    : `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1 shadow-xs">🔴 ${item.status}</span>`;

                return `
                    <tr class="border-b border-slate-700/40 hover:bg-slate-800/50 transition-colors text-center text-xs">
                        ${yearSpans[idx] > 0 ? `
                            <td rowspan="${yearSpans[idx]}" class="p-3 text-center font-bold text-amber-300/90 font-mono bg-slate-900/40 border-r border-slate-700/60 align-middle whitespace-nowrap">
                                ${item.year}학년도
                            </td>
                        ` : ''}
                        ${schoolSpans[idx] > 0 ? `
                            <td rowspan="${schoolSpans[idx]}" class="p-3 font-bold text-white text-left pl-3.5 bg-slate-900/20 border-r border-slate-700/60 align-middle whitespace-nowrap">
                                ${item.schoolName}
                            </td>
                        ` : ''}
                        ${trackSpans[idx] > 0 ? `
                            <td rowspan="${trackSpans[idx]}" class="p-3 text-center text-slate-300 font-semibold bg-slate-900/10 border-r border-slate-700/60 align-middle whitespace-nowrap">
                                ${item.track}${item.track.endsWith('전형') ? '' : '전형'}
                            </td>
                        ` : ''}
                        <td class="p-3 text-left pl-3 text-indigo-200 font-medium whitespace-nowrap border-r border-slate-800/40">
                            ${item.dept}
                        </td>
                        <td class="p-3 text-right font-black text-indigo-300 whitespace-nowrap border-r border-slate-800/40">
                            ${item.studentScore.toFixed(2)}점
                        </td>
                        <td class="p-3 text-right font-semibold text-slate-300 whitespace-nowrap border-r border-slate-800/40">
                            <div class="flex flex-col items-end gap-0.5">
                                <span class="font-bold text-emerald-300">최저 ${item.minScore.toFixed(2)}점</span>
                                ${item.avgScore > 0 ? `<span class="text-[10px] text-amber-300/80">평균 ${item.avgScore.toFixed(2)}점</span>` : ''}
                            </div>
                        </td>
                        <td class="p-3 text-right ${diffColor} whitespace-nowrap border-r border-slate-800/40">
                            ${diffStr}점
                        </td>
                        <td class="p-3 whitespace-nowrap">
                            ${statusBadge}
                        </td>
                    </tr>
                `;
            }).join('');
        }

        modal.innerHTML = `
            <div class="glass-card w-full max-w-5xl p-6 md:p-8 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl space-y-5 animate-scale-up max-h-[94vh] flex flex-col print:border-none print:shadow-none print:bg-white print:text-black">
                <!-- 헤더 -->
                <div class="flex items-center justify-between border-b border-slate-700/60 pb-4 shrink-0 flex-wrap gap-3">
                    <div class="flex items-center gap-3">
                        <span class="text-3xl">${categoryIcon}</span>
                        <div>
                            <h2 class="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                                <span>[${escapeHtml(studentName)}]</span> 학생 ${titleCategory} 합격 예측 정밀 분석
                            </h2>
                            <p class="text-xs text-text-muted mt-0.5">
                                학생 본인의 실제 고교별 전형 산출 점수와 등록된 과거 및 공식 합격선 커트라인을 1:1로 정밀 대조한 결과입니다.
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="printPredictionModalBtn" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs print:hidden" title="학부모 상담용 분석표 인쇄">
                            <span>🖨️</span> 인쇄
                        </button>
                        <button id="closePredictionModalBtn" class="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 text-xl transition-all cursor-pointer print:hidden">
                            ✕
                        </button>
                    </div>
                </div>

                <!-- 상단: 학생 기본 성적 & 본인 고교별 환산점수 카드 (페이지 분할 시 중복 방지) -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0 prediction-summary-header">
                    <!-- 기본 내신 지표 -->
                    <div class="p-4 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-2.5">
                        <div class="flex items-center justify-between text-xs text-text-muted border-b border-slate-700/40 pb-1.5">
                            <span class="font-bold text-slate-300">👤 학생 기본 내신 성적 요약</span>
                            <span class="text-indigo-400 font-bold">${classNum}반 ${studentNum}번 ${studentName}</span>
                        </div>
                        <div class="grid grid-cols-3 gap-2 text-center pt-1">
                            <div class="bg-slate-900/70 p-2.5 rounded-lg border border-slate-700/50">
                                <div class="text-[11px] text-slate-400 font-medium">석차 백분율</div>
                                <div class="text-base font-black text-emerald-400 mt-0.5">${displayPercentile}</div>
                            </div>
                            <div class="bg-slate-900/70 p-2.5 rounded-lg border border-slate-700/50">
                                <div class="text-[11px] text-slate-400 font-medium">내신 석차</div>
                                <div class="text-base font-black text-sky-400 mt-0.5">${displayRank}<span class="text-[10px] text-slate-400 font-normal"> / ${displayTotal}명</span></div>
                            </div>
                            <div class="bg-slate-900/70 p-2.5 rounded-lg border border-slate-700/50">
                                <div class="text-[11px] text-slate-400 font-medium">합격권 학교 수</div>
                                <div class="text-base font-black text-amber-400 mt-0.5">${passSchoolCount}개교 <span class="text-[10px] text-slate-400 font-normal">(${passCount}개)</span></div>
                            </div>
                        </div>
                    </div>

                    <!-- 고교별 학생 본인 산출점수 (인쇄 시 스크롤 제거 및 펼침) -->
                    <div class="p-4 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-2.5">
                        <div class="flex items-center justify-between text-xs text-text-muted border-b border-slate-700/40 pb-1.5">
                            <span class="font-bold text-slate-300">🎯 학생 본인 고교별 공식 환산 점수</span>
                            <span class="text-[11px] text-emerald-400 font-bold">100% 자동 산출</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5 max-h-36 overflow-y-auto custom-scrollbar prediction-scores-scroll">
                            ${schoolScoresHTML || '<div class="text-xs text-slate-400 p-2 text-center col-span-2">산출된 고교 점수가 없습니다.</div>'}
                        </div>
                    </div>
                </div>

                <!-- 툴바: 필터 토글 -->
                <div class="flex items-center justify-between gap-3 shrink-0 flex-wrap print:hidden">
                    <div class="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-700/60 text-xs">
                        <button id="filterAllPredictionsBtn" class="px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${activeFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                            전체 고교·전형 보기 (${analysisList.length})
                        </button>
                        <button id="filterPassPredictionsBtn" class="px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${activeFilter === 'pass' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                            ✅ 지원 가능(합격권)만 보기 (${passCount})
                        </button>
                    </div>
                    <div class="text-xs text-text-muted flex items-center gap-3">
                        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-400"></span> 안정(+5점 이상)</span>
                        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-yellow-400"></span> 적정(0~+5점)</span>
                        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-orange-400"></span> 소신(-5~0점)</span>
                        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-rose-400"></span> 도전(-5점 미만)</span>
                    </div>
                </div>

                <!-- 테이블 영역 (기준연도, 고교명, 전형구분 묶음 헤더) -->
                <div class="overflow-y-auto flex-1 rounded-xl border border-slate-700/60 bg-slate-900/60 custom-scrollbar prediction-table-container">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead class="bg-slate-800/90 text-text-muted font-bold text-center border-b border-slate-700/60 sticky top-0 z-10 whitespace-nowrap">
                            <tr>
                                <th class="p-3 text-center w-24 border-r border-slate-700/60">기준 연도</th>
                                <th class="p-3 text-left pl-3.5 w-36 border-r border-slate-700/60">고교명</th>
                                <th class="p-3 text-center w-28 border-r border-slate-700/60">전형 구분</th>
                                <th class="p-3 text-left pl-3 w-40 border-r border-slate-700/60">학과명</th>
                                <th class="p-3 text-right w-32 text-indigo-300 border-r border-slate-700/60">본인 환산점수</th>
                                <th class="p-3 text-right w-36 text-slate-200 border-r border-slate-700/60">고교 합격선(최저/평균)</th>
                                <th class="p-3 text-right w-28 border-r border-slate-700/60">점수 차이</th>
                                <th class="p-3 text-center w-28">합격 예측</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRowsHTML}
                        </tbody>
                    </table>
                </div>

                <!-- 하단 푸터 액션 바 (디자인 대폭 개선) -->
                <div class="flex items-center justify-between border-t border-slate-700/60 pt-4 shrink-0 flex-wrap gap-3 print:hidden">
                    <div class="text-xs text-slate-400">
                        * 합격 예측은 각 고교 공식 산출 공식 및 과거 입결을 바탕으로 산정된 참고 지표입니다.
                    </div>
                    <div class="flex items-center gap-2.5">
                        <button id="goToCounselFromPredictionBtn" class="bg-linear-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-black px-6 py-2.5 text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-500/30 cursor-pointer active:scale-95 transition-all">
                            <span class="text-sm">💬</span> 1:1 진학 상담 시작
                        </button>
                        <button id="closePredictionModalFooterBtn" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-bold px-5 py-2.5 text-xs rounded-xl cursor-pointer active:scale-95 transition-all">
                            닫기
                        </button>
                    </div>
                </div>
            </div>
        `;

        // 모달 내부 이벤트 직접 바인딩 (안전하고 확실함)
        modal.querySelector('#closePredictionModalBtn')?.addEventListener('click', () => modal.remove());
        modal.querySelector('#closePredictionModalFooterBtn')?.addEventListener('click', () => modal.remove());
        modal.querySelector('#printPredictionModalBtn')?.addEventListener('click', () => {
            printOnly('prediction', 'portrait');
        });
        modal.querySelector('#filterAllPredictionsBtn')?.addEventListener('click', () => {
            activeFilter = 'all';
            renderModalContent();
        });
        modal.querySelector('#filterPassPredictionsBtn')?.addEventListener('click', () => {
            activeFilter = 'pass';
            renderModalContent();
        });
        modal.querySelector('#goToCounselFromPredictionBtn')?.addEventListener('click', () => {
            modal.remove();
            openStudentModal(classNum, studentNum, studentName);
        });
    };

    renderModalContent();

    // ESC 키로 닫기
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            window.removeEventListener('keydown', handleEsc);
        }
    };
    window.addEventListener('keydown', handleEsc);
}


async function openApplicationRegisterModal() {
    document.getElementById('applicationRegisterModal')?.remove();

    let schoolName = '중학교';
    let admissionYear = new Date().getFullYear() + 1;
    try {
        const config = await GetSchoolConfig();
        if (config) {
            if (config.schoolName) schoolName = config.schoolName;
            if (config.admissionYear) admissionYear = config.admissionYear;
        }
    } catch (e) {
        console.warn('학교 설정 로드 실패:', e);
    }

    let records = [];
    try {
        records = await window.go.main.App.GetSchoolApplicationRecords() || [];
    } catch (e) {
        console.error('원서대장 데이터 로드 실패:', e);
    }

    const isHomeroom = window.currentUser && window.currentUser.Role === 'homeroom';
    const homeroomClass = isHomeroom ? window.currentUser.ClassNum : null;

    const defaultApprovalCandidates = [
        { id: 'homeroom', label: '담임', defaultChecked: true },
        { id: 'gradeHead', label: '학년부장', defaultChecked: true },
        { id: 'academicHead', label: '교무부장', defaultChecked: false },
        { id: 'careerHead', label: '진로부장', defaultChecked: false },
        { id: 'vicePrincipal', label: '교감', defaultChecked: true },
        { id: 'principal', label: '교장', defaultChecked: true },
    ];

    let savedApprovals = null;
    try {
        const saved = localStorage.getItem('phgc_register_approvals');
        if (saved) savedApprovals = JSON.parse(saved);
    } catch (e) { }

    let activeApprovals = Array.isArray(savedApprovals) ? savedApprovals : ['담임', '학년부장', '교감', '교장'];
    
    let printLayoutMode = isHomeroom ? 'single_class' : 'all_paged';
    let selectedClassFilter = isHomeroom ? String(homeroomClass) : 'all';
    let pageScaleMode = 'auto'; // 'auto', 'standard', 'compact', 'ultra'

    const classSet = new Set();
    records.forEach(r => { if (r.classNum) classSet.add(r.classNum); });
    const classList = Array.from(classSet).sort((a, b) => a - b);

    const getSchoolTotalMaxString = (schName, cat) => {
        if (!schName) return '';
        const name = schName.trim();
        if (name.includes('마이스터') || name.includes('울산마이스터')) return '300';
        if (name.includes('에너지') || name.includes('울산에너지')) return '230';
        if (name.includes('현대공업') || name.includes('현대공고')) return '200';
        if (name.includes('일반고') || cat === 'general') return '%';
        if (cat === 'special' || name.includes('공업고') || name.includes('미용예술') || name.includes('생활과학') || name.includes('산업고') || name.includes('상업고') || name.includes('애니원고')) {
            return '100';
        }
        return '';
    };

    const modal = document.createElement('div');
    modal.id = 'applicationRegisterModal';
    modal.className = 'fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex flex-col p-2 sm:p-4 md:p-6 overflow-hidden animate-in fade-in duration-200';
    document.body.appendChild(modal);

    const renderModalContent = () => {
        const approvalHeadersHTML = activeApprovals.length > 0
            ? activeApprovals.map(role => `<th class="border border-black bg-slate-100 font-bold w-16 text-center tracking-tight" style="padding: 4px 2px;">${role}</th>`).join('')
            : '<th class="border border-black bg-slate-100 font-normal p-1 text-slate-400 text-[11px]">-</th>';

        const targetClasses = (printLayoutMode === 'single_class' && selectedClassFilter !== 'all')
            ? [parseInt(selectedClassFilter, 10)]
            : (classList.length > 0 ? classList : [1]);

        const documentPagesHTML = targetClasses.map((currentClass, pageIdx) => {
            const classRecords = records.filter(r => r.classNum === currentClass).sort((a, b) => {
                const numA = parseInt(a.studentNum, 10) || 0;
                const numB = parseInt(b.studentNum, 10) || 0;
                return numA - numB;
            });

            const studentCount = classRecords.length;

            let cellPaddingStyle = 'padding: 5px 6px;';
            let cellFontSizeStyle = 'font-size: 11.5px;';
            let approvalCellHeight = 'height: 34px;';
            let tableHeaderPadding = 'padding: 5px 3px;';
            let tableHeaderFont = 'font-size: 11.5px;';

            const effectiveScale = (pageScaleMode === 'auto')
                ? (studentCount >= 26 ? 'ultra' : (studentCount >= 21 ? 'compact' : 'standard'))
                : pageScaleMode;

            if (effectiveScale === 'ultra') {
                cellPaddingStyle = 'padding: 2.5px 4px;';
                cellFontSizeStyle = 'font-size: 10px; line-height: 1.25;';
                approvalCellHeight = 'height: 25px;';
                tableHeaderPadding = 'padding: 3.5px 2px;';
                tableHeaderFont = 'font-size: 10.5px;';
            } else if (effectiveScale === 'compact') {
                cellPaddingStyle = 'padding: 4px 5px;';
                cellFontSizeStyle = 'font-size: 11px; line-height: 1.3;';
                approvalCellHeight = 'height: 30px;';
                tableHeaderPadding = 'padding: 4px 3px;';
                tableHeaderFont = 'font-size: 11px;';
            } else if (effectiveScale === 'standard') {
                cellPaddingStyle = 'padding: 6px 8px;';
                cellFontSizeStyle = 'font-size: 12px; line-height: 1.4;';
                approvalCellHeight = 'height: 38px;';
                tableHeaderPadding = 'padding: 6px 4px;';
                tableHeaderFont = 'font-size: 12px;';
            }

            // 학급 내 학생 번호순으로 학생별 지원 기록들을 그룹화
            const studentGroupMap = new Map();
            classRecords.forEach(r => {
                const sKey = r.studentNum || 0;
                if (!studentGroupMap.has(sKey)) {
                    studentGroupMap.set(sKey, []);
                }
                studentGroupMap.get(sKey).push(r);
            });

            // 학생 번호순 정렬된 고유 학생 목록
            const uniqueStudentNums = Array.from(studentGroupMap.keys()).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

            const rowsHTML = uniqueStudentNums.length > 0 ? uniqueStudentNums.map((sNum, idx) => {
                const apps = studentGroupMap.get(sNum) || [];
                // 1순위: 최종 합격/최종 진학 기록, 2순위: 가장 마지막 지원 기록 (후기 일반고 등)
                const acceptedApp = apps.find(a => a.status === '합격' || a.status === '최종 진학' || a.status === '최종진학');
                const mainApp = acceptedApp || (apps.length > 0 ? apps[apps.length - 1] : {});
                // 이전 지원 이력 (메인 기록을 제외한 나머지 기록들, 주로 전기 불합격 등)
                const priorApps = apps.filter(a => a !== mainApp);

                const paddedClass = String(mainApp.classNum || currentClass || 1);
                const paddedNum = String(mainApp.studentNum || sNum).padStart(2, '0');
                const studentId = `3${paddedClass.padStart(2, '0')}${paddedNum}`;

                let schoolDisplay = escapeHtml(mainApp.schoolName || '-');
                if (mainApp.category === 'general') {
                    schoolDisplay = '후기 일반고';
                } else if (mainApp.category === 'none') {
                    schoolDisplay = '미진학 (진학포기)';
                }

                let deptDisplayHTML = '';
                if (mainApp.category === 'general') {
                    deptDisplayHTML = `
                        <div class="flex items-center justify-center gap-1 w-full">
                            <input type="text" 
                                   class="register-assigned-school-input font-bold text-indigo-900 border-b border-dashed border-indigo-400 bg-transparent text-left w-full outline-none print:border-none print:text-black print:p-0"
                                   style="border-bottom-style: dashed; ${cellFontSizeStyle} padding: 1px 2px;"
                                   value="${escapeAttr(mainApp.assignedSchool || '')}" 
                                   placeholder="배정고 입력(수기)" 
                                   data-class="${escapeAttr(mainApp.classNum || currentClass)}" 
                                   data-num="${escapeAttr(mainApp.studentNum || sNum)}" 
                                   data-name="${escapeAttr(mainApp.studentName)}" />
                        </div>
                    `;
                } else {
                    if (mainApp.assignedDepartment) {
                        deptDisplayHTML = `<span class="font-semibold">${escapeHtml(mainApp.assignedDepartment)}</span> <span class="text-[10px] text-slate-500 font-normal">(배정)</span>`;
                    } else if (mainApp.preferences && mainApp.preferences.length > 0) {
                        deptDisplayHTML = `<span class="font-medium">${escapeHtml(mainApp.preferences[0])}</span>`;
                    } else {
                        deptDisplayHTML = '-';
                    }
                }

                // 합격 여부 (O/X 대신 '합격', '불합격', '진행'으로 명확히 표기)
                let passDisplay = '-';
                if (mainApp.status === '합격' || mainApp.status === '최종 진학' || mainApp.status === '최종진학') {
                    passDisplay = '<span class="font-black text-emerald-800 text-xs">합격</span>';
                } else if (mainApp.status === '불합격') {
                    passDisplay = '<span class="font-black text-rose-800 text-xs">불합격</span>';
                } else if (mainApp.status === '지원완료' || mainApp.status === '지원희망') {
                    passDisplay = '<span class="text-[11px] text-slate-600 font-medium">진행</span>';
                }

                let scoreDisplay = '-';
                if (mainApp.score && mainApp.score > 0) {
                    const formattedScore = mainApp.score.toFixed(2);
                    const maxVal = getSchoolTotalMaxString(mainApp.schoolName, mainApp.category);
                    if (maxVal === '%') {
                        scoreDisplay = `${formattedScore}%`;
                    } else if (maxVal) {
                        scoreDisplay = `${formattedScore}/${maxVal}`;
                    } else {
                        scoreDisplay = formattedScore;
                    }
                }

                // 비고란: 전형 표시 + 추가모집 뱃지 + 이전 전기 지원이력(전기 불합격 학교·학과·점수)
                let noteParts = [];
                if (mainApp.track && mainApp.track !== '해당 없음' && mainApp.track !== '해당없음') {
                    const trackText = mainApp.track.includes('전형') ? mainApp.track : `${mainApp.track}전형`;
                    noteParts.push(escapeHtml(trackText));
                }
                const isExtraRecruit = (mainApp.schoolName || '').includes('추가') || (mainApp.track || '').includes('추가') || (mainApp.status || '').includes('추가');
                if (isExtraRecruit) {
                    noteParts.push('<span class="font-bold text-indigo-700">[추가모집]</span>');
                }

                // 이전 전기 지원이력 표시 (마이스터고, 특성화고 불합격 이력 등)
                if (priorApps.length > 0) {
                    const priorSummary = priorApps.map(p => {
                        const dept = p.assignedDepartment || (p.preferences && p.preferences[0]) || '';
                        const scoreStr = p.score ? ` (${p.score.toFixed(1)}점)` : '';
                        const statusStr = p.status || '불합격';
                        return `${p.schoolName}${dept ? ' ' + dept : ''}[${statusStr}${scoreStr}]`;
                    }).join(', ');
                    noteParts.push(`<div class="text-[9.5px] text-slate-600 leading-tight mt-0.5"><span class="text-rose-700 font-semibold">전기이력:</span> ${escapeHtml(priorSummary)}</div>`);
                }

                const noteDisplay = noteParts.join(' ') || '';

                const approvalCellsHTML = activeApprovals.length > 0
                    ? activeApprovals.map(() => `<td class="border border-black p-0 w-16 text-center" style="${approvalCellHeight}"></td>`).join('')
                    : `<td class="border border-black p-0 text-center text-slate-300" style="${approvalCellHeight}">-</td>`;

                return `
                    <tr class="text-center text-black font-sans hover:bg-slate-50 print:hover:bg-transparent" style="${cellFontSizeStyle}">
                        <td class="border border-black font-mono" style="${cellPaddingStyle}">${idx + 1}</td>
                        <td class="border border-black font-mono font-medium" style="${cellPaddingStyle}">${escapeHtml(studentId)}</td>
                        <td class="border border-black font-bold whitespace-nowrap" style="${cellPaddingStyle}">${escapeHtml(mainApp.studentName)}</td>
                        <td class="border border-black font-mono font-medium whitespace-nowrap" style="${cellPaddingStyle}">${scoreDisplay}</td>
                        <td class="border border-black font-semibold text-left pl-2.5" style="${cellPaddingStyle}">${schoolDisplay}</td>
                        <td class="border border-black text-left pl-2.5" style="${cellPaddingStyle} min-width: 190px;">${deptDisplayHTML}</td>
                        <td class="border border-black" style="${cellPaddingStyle}">${passDisplay}</td>
                        ${approvalCellsHTML}
                        <td class="border border-black text-left pl-2 text-[10.5px] text-slate-700" style="${cellPaddingStyle}">${noteDisplay}</td>
                    </tr>
                `;
            }).join('') : `
                <tr>
                    <td colspan="${8 + Math.max(1, activeApprovals.length)}" class="border border-black p-10 text-center text-slate-400 font-medium">
                        ${currentClass}반에 등록된 지원 학생 자료가 없습니다.
                    </td>
                </tr>
            `;

            const pageBreakClass = (pageIdx > 0 && printLayoutMode === 'all_paged') ? 'print:break-before-page' : '';

            return `
                <div class="print-document bg-white text-black p-6 sm:p-8 md:p-10 shadow-2xl rounded-sm w-full flex flex-col justify-between select-text ${pageBreakClass}" 
                     style="font-family: 'Batang', 'Nanum Myeongjo', 'Malgun Gothic', serif; max-width: 1300px; min-height: 820px; margin-bottom: 2rem; ${pageIdx > 0 && printLayoutMode === 'all_paged' ? 'page-break-before: always;' : ''}">
                    <div>
                        <div class="text-center my-3 sm:my-4">
                            <h1 class="text-3xl sm:text-4xl font-black tracking-[0.6em] inline-block pb-1" style="letter-spacing: 0.6em;">
                                고 입 원 서 대 장
                            </h1>
                        </div>

                        <div class="flex items-end justify-between font-bold text-sm sm:text-base mb-2 px-1">
                            <div class="tracking-wider flex items-center gap-3">
                                <span>${admissionYear}학년도</span>
                                <span class="text-indigo-900 font-black bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-200 print:border-black print:bg-transparent">
                                    제 3학년 ${currentClass}반
                                </span>
                            </div>
                            <div class="tracking-widest text-base sm:text-lg">
                                ${schoolName}
                            </div>
                        </div>

                        <div class="w-full overflow-x-auto">
                            <table class="w-full border-collapse border-2 border-black text-center" style="border: 2px solid black;">
                                <thead>
                                    <tr class="bg-slate-100 font-bold" style="background-color: #f1f5f9; ${tableHeaderFont}">
                                        <th rowspan="2" class="border border-black w-10" style="${tableHeaderPadding}">연번</th>
                                        <th rowspan="2" class="border border-black w-16" style="${tableHeaderPadding}">학번</th>
                                        <th rowspan="2" class="border border-black w-20" style="${tableHeaderPadding}">이름</th>
                                        <th rowspan="2" class="border border-black w-28" style="${tableHeaderPadding}">내신총점<br><span class="text-[10px] font-normal">(취득점/만점)</span></th>
                                        <th rowspan="2" class="border border-black w-48" style="${tableHeaderPadding}">지원고등학교</th>
                                        <th rowspan="2" class="border border-black text-center" style="${tableHeaderPadding} min-width: 190px;">
                                            지원학과(전기, 1지망)<br>
                                             OR 최종배정학교(후기고)
                                        </th>
                                        <th rowspan="2" class="border border-black p-2 w-16">
                                            합격여부
                                        </th>
                                        <th colspan="${Math.max(1, activeApprovals.length)}" class="border border-black p-1 text-center font-bold">
                                            결재
                                        </th>
                                        <th rowspan="2" class="border border-black p-2 w-28">비고</th>
                                    </tr>
                                    <tr class="bg-slate-50 font-semibold text-xs" style="background-color: #f8fafc;">
                                        ${approvalHeadersHTML}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rowsHTML}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 하단 출력 정보 및 안내 -->
                    <div class="mt-8 pt-3 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500 font-sans">
                        <span>출력일시: ${new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        <span>[내부 결재 및 원서 접수 확인용]</span>
                        <span>${schoolName} 3학년 진학상담시스템</span>
                    </div>
                </div>
            `;
        }).join('');

        modal.innerHTML = `
            <!-- 상단 제어 대시보드 바 (인쇄 시 완벽 숨김) -->
            <div class="no-print bg-slate-900 border border-slate-700/90 rounded-2xl p-3.5 mb-3 shadow-2xl shrink-0 flex flex-col gap-2.5">
                <!-- 1열: 타이틀 + 모드 탭 + 페이지 배율 + 인쇄/닫기 버튼 -->
                <div class="flex items-center justify-between flex-wrap gap-3 pb-2.5 border-b border-slate-800">
                    <!-- 좌측: 제목 및 공식 서식 뱃지 -->
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">📋</span>
                        <div class="flex items-center gap-2 flex-wrap">
                            <h2 class="text-base font-black text-white tracking-tight">고입원서대장</h2>
                            <span class="text-xs font-bold text-white bg-indigo-600 px-2.5 py-0.5 rounded-md shadow-sm">원서대장 서식</span>
                        </div>
                    </div>

                    <!-- 중앙: 출력 모드 토글 (학년부장: 전교 vs 학급별, 담임: 우리 반 고정) -->
                    ${!isHomeroom ? `
                    <div class="flex items-center bg-slate-800 p-0.5 rounded-xl border border-slate-700 text-xs">
                        <button id="modeAllPagedBtn" class="px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${printLayoutMode === 'all_paged' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                            📜 전교 일괄 (반별 자동분할 인쇄)
                        </button>
                        <button id="modeSingleClassBtn" class="px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${printLayoutMode === 'single_class' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                            📑 학급별 개별 출력
                        </button>
                    </div>
                    ` : `
                    <div class="px-3 py-1 rounded-xl bg-indigo-950 border border-indigo-500/50 text-xs font-bold text-indigo-200 flex items-center gap-1.5">
                        <span>👩‍🏫</span> 3학년 ${homeroomClass}반 담임 전용 대장 모드
                    </div>
                    `}

                    <!-- 우측: 크기 맞춤 + 엑셀 저장 + 인쇄/PDF 저장 + 닫기 버튼 -->
                    <div class="flex items-center gap-2">
                        <!-- 페이지 크기 맞춤 셀렉트 -->
                        <div class="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-700 text-xs">
                            <span>📐</span>
                            <select id="registerPageScaleSelect" class="bg-transparent text-indigo-200 font-bold text-xs outline-none cursor-pointer">
                                <option value="auto" ${pageScaleMode === 'auto' ? 'selected' : ''} class="bg-slate-900 text-white">자동 한페이지 맞춤</option>
                                <option value="standard" ${pageScaleMode === 'standard' ? 'selected' : ''} class="bg-slate-900 text-white">표준 (12px)</option>
                                <option value="compact" ${pageScaleMode === 'compact' ? 'selected' : ''} class="bg-slate-900 text-white">컴팩트 (11px)</option>
                                <option value="ultra" ${pageScaleMode === 'ultra' ? 'selected' : ''} class="bg-slate-900 text-white">초컴팩트 (10px)</option>
                            </select>
                        </div>

                        <button id="exportRegisterExcelBtn" class="bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-3.5 py-2 font-black flex items-center gap-1.5 rounded-xl shadow-lg shadow-emerald-700/30 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer" title="엑셀 파일(.xls)로 내려받아 학교별 양식에 맞게 틀을 자유롭게 편집·수정할 수 있습니다">
                            <span>📊</span> 엑셀 다운로드
                        </button>
                        <button id="printRegisterBtn" class="bg-linear-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs px-4 py-2 font-black flex items-center gap-1.5 rounded-xl shadow-lg shadow-indigo-600/30 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer">
                            <span>🖨️</span> 인쇄 / PDF 저장
                        </button>
                        <button id="closeRegisterBtn" class="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs px-3.5 py-2 font-bold rounded-xl border border-slate-700 transition-colors cursor-pointer">
                            ✕ 닫기
                        </button>
                    </div>
                </div>

                <!-- 2열: 결재라인 직책 뱃지 선택 (선명한 ON/OFF 토글) & 학급 선택 -->
                <div class="flex items-center justify-between flex-wrap gap-3 text-xs">
                    <!-- 좌측: 결재라인 직책 뱃지 그룹 (투명도 없이 100% 선명하게 구분) -->
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-bold text-slate-300 flex items-center gap-1 shrink-0">
                            <span>✍️</span> 결재라인 직책:
                        </span>
                        <div class="flex items-center gap-1.5 flex-wrap">
                            ${defaultApprovalCandidates.map(c => {
                                const isChecked = activeApprovals.includes(c.label);
                                return `
                                    <button type="button" 
                                            class="approval-role-badge-btn inline-flex items-center gap-1 text-xs px-3 py-1 rounded-lg font-bold transition-all cursor-pointer select-none ${
                                                isChecked
                                                    ? 'bg-emerald-600 text-white border-2 border-emerald-400 shadow-md ring-2 ring-emerald-500/20'
                                                    : 'bg-slate-800 text-slate-400 border border-slate-600 hover:bg-slate-700 hover:text-slate-200'
                                            }"
                                            data-role="${c.label}">
                                        <span>${isChecked ? '✓' : '+'}</span>
                                        <span>${c.label}</span>
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <!-- 우측: 학급 선택 필터 (개별 출력 모드 시 활성화) -->
                    ${(!isHomeroom && printLayoutMode === 'single_class') ? `
                    <div class="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700">
                        <label class="font-bold text-indigo-300">출력 학급:</label>
                        <select id="registerClassFilterSelect" class="bg-slate-900 text-white font-bold text-xs px-2.5 py-1 rounded-lg border border-slate-600 outline-none cursor-pointer">
                            ${classList.map(c => {
                                const cnt = studentGroupMap.has(c) ? studentGroupMap.get(c).length : records.filter(r => r.classNum === c).length;
                                return `<option value="${c}" ${String(selectedClassFilter) === String(c) ? 'selected' : ''}>${c}반 (${cnt}명)</option>`;
                            }).join('')}
                        </select>
                    </div>
                    ` : ''}
                </div>
            </div>

            <!-- 대장 본문 영역 (A4 가로 화이트 페이퍼 뷰어) -->
            <div class="flex-1 overflow-auto custom-scrollbar flex flex-col items-center p-2 sm:p-4 bg-slate-950/60 rounded-2xl border border-slate-800">
                ${documentPagesHTML}
            </div>
        `;

        // 이벤트 바인딩 (modal 내부에서 직접 쿼리하여 첫 진입 시점부터 100% 즉시 바인딩 보장)
        modal.querySelector('#closeRegisterBtn')?.addEventListener('click', () => modal.remove());
        modal.querySelector('#printRegisterBtn')?.addEventListener('click', () => printOnly('register', 'landscape'));

        // 원서대장 엑셀 다운로드 (.xls 스프레드시트 포맷)
        modal.querySelector('#exportRegisterExcelBtn')?.addEventListener('click', () => {
            const classTag = (printLayoutMode === 'single_class' && selectedClassFilter !== 'all') ? `${selectedClassFilter}반` : '전체';
            const totalCols = 7 + Math.max(1, activeApprovals.length) + 1;

            let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
                <!--[if gte mso 9]>
                <xml>
                <x:ExcelWorkbook>
                <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                <x:Name>고입원서대장</x:Name>
                <x:WorksheetOptions>
                <x:DisplayGridlines/>
                </x:WorksheetOptions>
                </x:ExcelWorksheet>
                </x:ExcelWorksheets>
                </x:ExcelWorkbook>
                </xml>
                <![endif]-->
                <style>
                    table { border-collapse: collapse; font-family: 'Malgun Gothic', '맑은 고딕', dotum, sans-serif; font-size: 10pt; }
                    th, td { border: 1px solid #333333; text-align: center; vertical-align: middle; }
                    .th-header { background-color: #f1f5f9; font-weight: bold; }
                    .title { font-size: 18pt; font-weight: bold; text-align: center; border: none; }
                    .meta { font-size: 11pt; font-weight: bold; border: none; }
                </style>
            </head>
            <body>
            `;

            targetClasses.forEach((currentClass, pIdx) => {
                if (pIdx > 0) {
                    html += `<br style="mso-data-placement:same-cell;" /><br /><hr /><br />`;
                }

                const classRecords = records.filter(r => r.classNum === currentClass).sort((a, b) => {
                    const numA = parseInt(a.studentNum, 10) || 0;
                    const numB = parseInt(b.studentNum, 10) || 0;
                    return numA - numB;
                });

                const studentGroupMap = new Map();
                classRecords.forEach(r => {
                    const sKey = r.studentNum || 0;
                    if (!studentGroupMap.has(sKey)) studentGroupMap.set(sKey, []);
                    studentGroupMap.get(sKey).push(r);
                });
                const uniqueStudentNums = Array.from(studentGroupMap.keys()).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

                html += `
                <table>
                    <tr><td colspan="${totalCols}" class="title" style="height:45px;">고 입 원 서 대 장</td></tr>
                    <tr>
                        <td colspan="4" class="meta" style="text-align:left;height:30px;">
                            ${admissionYear}학년도 제 3학년 ${currentClass}반
                        </td>
                        <td colspan="${totalCols - 4}" class="meta" style="text-align:right;">
                            학교명: ${escapeHtml(schoolName)}
                        </td>
                    </tr>
                    <tr>
                        <td colspan="${totalCols - activeApprovals.length}" style="border:none;"></td>
                        ${activeApprovals.map(role => `<td class="th-header" style="width:70px;height:24px;">${escapeHtml(role)}</td>`).join('')}
                    </tr>
                    <tr>
                        <td colspan="${totalCols - activeApprovals.length}" style="border:none;"></td>
                        ${activeApprovals.map(() => `<td style="height:50px;"></td>`).join('')}
                    </tr>
                    <tr><td colspan="${totalCols}" style="border:none;height:10px;"></td></tr>
                    <tr class="th-header" style="height:32px;">
                        <th style="width:45px;">연번</th>
                        <th style="width:80px;">학번</th>
                        <th style="width:85px;">성명</th>
                        <th style="width:90px;">산출점수</th>
                        <th style="width:130px;">지원학교</th>
                        <th style="width:160px;">지원(배정)학과</th>
                        <th style="width:70px;">합격여부</th>
                        ${activeApprovals.map(role => `<th style="width:65px;">${escapeHtml(role)}</th>`).join('')}
                        <th style="width:200px;">비고</th>
                    </tr>
                `;

                if (uniqueStudentNums.length === 0) {
                    html += `<tr><td colspan="${totalCols}" style="height:40px;color:#888;">등록된 학생 데이터가 없습니다.</td></tr>`;
                } else {
                    uniqueStudentNums.forEach((sNum, idx) => {
                        const apps = studentGroupMap.get(sNum) || [];
                        const acceptedApp = apps.find(a => a.status === '합격' || a.status === '최종 진학' || a.status === '최종진학');
                        const mainApp = acceptedApp || (apps.length > 0 ? apps[apps.length - 1] : {});
                        const priorApps = apps.filter(a => a !== mainApp);

                        const paddedClass = String(mainApp.classNum || currentClass || 1);
                        const paddedNum = String(mainApp.studentNum || sNum).padStart(2, '0');
                        const studentId = `3${paddedClass.padStart(2, '0')}${paddedNum}`;

                        let schoolDisplay = mainApp.schoolName || '-';
                        if (mainApp.category === 'general') schoolDisplay = '후기 일반고';
                        else if (mainApp.category === 'none') schoolDisplay = '미진학 (진학포기)';

                        let deptDisplay = '-';
                        if (mainApp.category === 'general') {
                            deptDisplay = mainApp.assignedSchool ? `배정: ${mainApp.assignedSchool}` : '배정고 미입력';
                        } else if (mainApp.assignedDepartment) {
                            deptDisplay = `${mainApp.assignedDepartment} (배정)`;
                        } else if (mainApp.preferences && mainApp.preferences.length > 0) {
                            deptDisplay = mainApp.preferences[0];
                        }

                        let passDisplay = mainApp.status || '-';
                        let scoreDisplay = '-';
                        if (mainApp.score && mainApp.score > 0) {
                            const formattedScore = mainApp.score.toFixed(2);
                            const maxVal = getSchoolTotalMaxString(mainApp.schoolName, mainApp.category);
                            scoreDisplay = maxVal === '%' ? `${formattedScore}%` : (maxVal ? `${formattedScore}/${maxVal}` : formattedScore);
                        }

                        let noteParts = [];
                        if (mainApp.track && mainApp.track !== '해당 없음' && mainApp.track !== '해당없음') {
                            noteParts.push(mainApp.track.includes('전형') ? mainApp.track : `${mainApp.track}전형`);
                        }
                        const isExtra = (mainApp.schoolName || '').includes('추가') || (mainApp.track || '').includes('추가') || (mainApp.status || '').includes('추가');
                        if (isExtra) noteParts.push('[추가모집]');
                        if (priorApps.length > 0) {
                            const priorSummary = priorApps.map(p => {
                                const dept = p.assignedDepartment || (p.preferences && p.preferences[0]) || '';
                                const scoreStr = p.score ? ` (${p.score.toFixed(1)}점)` : '';
                                return `${p.schoolName}${dept ? ' ' + dept : ''}[${p.status || '불합격'}${scoreStr}]`;
                            }).join(', ');
                            noteParts.push(`(전기이력: ${priorSummary})`);
                        }
                        const noteDisplay = noteParts.join(' ');

                        html += `
                        <tr style="height:28px;">
                            <td style="mso-number-format:'\\@';">${idx + 1}</td>
                            <td style="mso-number-format:'\\@';">${studentId}</td>
                            <td style="font-weight:bold;">${escapeHtml(mainApp.studentName || '')}</td>
                            <td style="mso-number-format:'\\@';">${scoreDisplay}</td>
                            <td style="text-align:left;padding-left:6px;">${escapeHtml(schoolDisplay)}</td>
                            <td style="text-align:left;padding-left:6px;">${escapeHtml(deptDisplay)}</td>
                            <td>${escapeHtml(passDisplay)}</td>
                            ${activeApprovals.map(() => `<td></td>`).join('')}
                            <td style="text-align:left;padding-left:6px;font-size:9pt;color:#555;">${escapeHtml(noteDisplay)}</td>
                        </tr>
                        `;
                    });
                }
                html += `</table><br />`;
            });

            html += `</body></html>`;

            const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${admissionYear}학년도_${schoolName}_고입원서대장_${classTag}.xls`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        });

        // 페이지 크기 맞춤 변경 이벤트
        modal.querySelector('#registerPageScaleSelect')?.addEventListener('change', (e) => {
            pageScaleMode = e.target.value;
            renderModalContent();
        });

        // 모드 토글 이벤트 (전교 일괄 vs 학급별 개별)
        modal.querySelector('#modeAllPagedBtn')?.addEventListener('click', () => {
            printLayoutMode = 'all_paged';
            selectedClassFilter = 'all';
            renderModalContent();
        });
        modal.querySelector('#modeSingleClassBtn')?.addEventListener('click', () => {
            printLayoutMode = 'single_class';
            if (selectedClassFilter === 'all') selectedClassFilter = String(classList[0] || 1);
            renderModalContent();
        });

        // 학급 필터 변경 이벤트
        modal.querySelector('#registerClassFilterSelect')?.addEventListener('change', (e) => {
            selectedClassFilter = e.target.value;
            renderModalContent();
        });

        // 결재라인 뱃지 토글 이벤트 (체크 여부가 확실한 선명한 버튼)
        modal.querySelectorAll('.approval-role-badge-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const role = e.currentTarget.dataset.role;
                if (activeApprovals.includes(role)) {
                    activeApprovals = activeApprovals.filter(r => r !== role);
                } else {
                    const order = defaultApprovalCandidates.map(c => c.label);
                    const newSet = new Set([...activeApprovals, role]);
                    activeApprovals = order.filter(r => newSet.has(r));
                }
                try {
                    localStorage.setItem('phgc_register_approvals', JSON.stringify(activeApprovals));
                } catch (err) { }
                renderModalContent();
            });
        });

        // 일반고 배정학교 인라인 수정 & DB 즉시 저장 이벤트
        modal.querySelectorAll('.register-assigned-school-input').forEach(input => {
            const saveAssigned = async () => {
                const cNum = parseInt(input.dataset.class, 10);
                const sNum = input.dataset.num;
                const sName = input.dataset.name;
                const val = input.value.trim();

                try {
                    if (window.go?.main?.App?.UpdateAssignedSchool) {
                        await window.go.main.App.UpdateAssignedSchool(cNum, sNum, sName, val);
                    }
                    // 메모리 레코드에도 즉시 반영
                    const target = records.find(r => r.classNum === cNum && r.studentNum === sNum);
                    if (target) target.assignedSchool = val;
                } catch (err) {
                    console.error('배정학교 저장 실패:', err);
                }
            };

            input.addEventListener('blur', saveAssigned);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    input.blur();
                }
            });
        });
    };

    renderModalContent();
}

// 지원 학생 상세 명단 팝업 모달 (지망 뱃지 또는 총 인원수 클릭 시)
function openApplicantDetailModal(title, students) {
    document.getElementById('applicantDetailModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'applicantDetailModal';
    modal.className = 'fixed inset-0 bg-black/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150';
    
    // 학급, 번호 순 정렬
    const sorted = [...students].sort((a, b) => (a.classNum - b.classNum) || (parseInt(a.studentNum || 0) - parseInt(b.studentNum || 0)));
    
    const rowsHTML = sorted.map((s, idx) => {
        let statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300">지원예정</span>';
        if (s.status === '지원완료') statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-indigo-900/60 text-indigo-200 border border-indigo-500/40">지원완료</span>';
        else if (s.status === '합격') statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-emerald-900/60 text-emerald-300 font-bold border border-emerald-500/40">합격</span>';
        else if (s.status === '불합격') statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-rose-900/60 text-rose-300 border border-rose-500/40">불합격</span>';
        else if (s.status === '최종 진학' || s.status === '최종진학') statusBadge = '<span class="px-2 py-0.5 rounded text-xs bg-sky-900/60 text-sky-200 font-black border border-sky-400/40">최종진학</span>';

        return `
            <tr class="border-b border-slate-700/60 hover:bg-slate-800/40 text-xs">
                <td class="p-2.5 text-center text-slate-400">${idx + 1}</td>
                <td class="p-2.5 text-center font-bold text-white">${escapeHtml(s.classNum)}반 ${escapeHtml(s.studentNum)}번</td>
                <td class="p-2.5 text-left font-black text-indigo-200 pl-4">${escapeHtml(s.studentName)}</td>
                <td class="p-2.5 text-center font-semibold text-sky-300">${s.prefRank ? `${s.prefRank}지망` : (s.assignedDepartment ? `배정 (${escapeHtml(s.assignedDepartment)})` : '-')}</td>
                <td class="p-2.5 text-right font-mono font-bold text-amber-300 pr-4">${s.score ? s.score.toFixed(2) : '-'}</td>
                <td class="p-2.5 text-center">${statusBadge}</td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="6" class="p-6 text-center text-slate-400">해당 조건의 지원 학생이 없습니다.</td></tr>';

    modal.innerHTML = `
        <div class="glass-card max-w-2xl w-full p-6 border border-indigo-500/40 rounded-3xl shadow-2xl flex flex-col gap-4 text-left animate-in zoom-in-95 duration-150 select-none break-keep-all">
            <div class="flex items-center justify-between border-b border-slate-700/60 pb-3">
                <div class="flex items-center gap-2">
                    <span class="text-xl">👥</span>
                    <h3 class="font-bold text-white text-base">${title}</h3>
                </div>
                <button id="closeApplicantDetailBtn" class="text-slate-400 hover:text-white p-1 rounded-lg text-lg cursor-pointer transition-colors">✕</button>
            </div>
            <div class="overflow-auto max-h-[60vh] border border-slate-700/70 rounded-xl bg-slate-900/50">
                <table class="w-full text-left border-collapse">
                    <thead class="bg-slate-800 sticky top-0 text-slate-400 font-bold text-xs border-b border-slate-700">
                        <tr>
                            <th class="p-2.5 w-12 text-center">번호</th>
                            <th class="p-2.5 w-24 text-center">학급·번호</th>
                            <th class="p-2.5 w-28 text-left pl-4">학생 성명</th>
                            <th class="p-2.5 w-24 text-center">지망구분</th>
                            <th class="p-2.5 w-24 text-right pr-4">내신 점수</th>
                            <th class="p-2.5 w-24 text-center">진행 상태</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHTML}</tbody>
                </table>
            </div>
            <div class="flex justify-between items-center pt-2 border-t border-slate-700/60 text-xs">
                <span class="text-slate-400">조회된 지원자: <b class="text-indigo-300 font-bold">${sorted.length}명</b></span>
                <button id="closeApplicantDetailBottomBtn" class="btn-secondary py-1.5 px-4 text-xs font-bold rounded-xl cursor-pointer">닫기</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    document.getElementById('closeApplicantDetailBtn').onclick = close;
    document.getElementById('closeApplicantDetailBottomBtn').onclick = close;
}

// 스마트 지원현황 그룹 생성 헬퍼 함수
function buildSmartApplicationGroups(records) {
    if (!Array.isArray(records) || records.length === 0) return [];

    const categoryLabel = category => ({
        meister: '마이스터고', special: '특성화고', self_foreign: '자사고·외고', general: '후기 일반고', other: '기타', none: '미진학'
    }[category] || category);

    const groupsMap = new Map();

    records.forEach(r => {
        if (!r) return;
        const year = r.admissionYear;
        const cat = r.category || 'general';
        const school = r.schoolName || (cat === 'general' ? '후기 일반고' : '-');
        const track = r.track || (cat === 'general' ? '후기 일반계고' : '일반');

        // 학생의 학과 및 지망 추출
        let items = [];
        if (cat === 'general') {
            const dept = r.assignedSchool ? `[배정고] ${r.assignedSchool}` : '일반계고 공통';
            items.push({ dept, rank: 0 });
        } else {
            // 전기고 (마이스터/특성화): preferences 순회
            if (r.preferences && r.preferences.length > 0) {
                r.preferences.forEach((d, idx) => {
                    if (d && d.trim()) {
                        items.push({ dept: d.trim(), rank: idx + 1 });
                    }
                });
            }
            if (items.length === 0) {
                const dept = r.assignedDepartment || '학교 전체';
                items.push({ dept, rank: 1 });
            }
        }

        items.forEach(({ dept, rank }) => {
            const key = `${year}__${cat}__${school}__${track}__${dept}`;
            if (!groupsMap.has(key)) {
                groupsMap.set(key, {
                    key,
                    admissionYear: year,
                    category: cat,
                    categoryLabel: categoryLabel(cat),
                    schoolName: school,
                    track,
                    department: dept,
                    ranks: {}, // rank -> [student info]
                    allStudents: [],
                    plannedCount: 0,
                    submittedCount: 0,
                    acceptedCount: 0,
                    rejectedCount: 0,
                    finalCount: 0,
                    acceptedScores: [],
                    maxRejectedScore: 0
                });
            }
            const g = groupsMap.get(key);
            const studentInfo = {
                classNum: r.classNum,
                studentNum: r.studentNum,
                studentName: r.studentName,
                prefRank: rank,
                score: r.score,
                status: r.status,
                assignedDepartment: r.assignedDepartment
            };
            if (!g.ranks[rank]) g.ranks[rank] = [];
            g.ranks[rank].push(studentInfo);
            g.allStudents.push(studentInfo);

            if (r.status === '지원희망' || r.status === '지원예정') g.plannedCount++;
            else if (r.status === '지원완료') g.submittedCount++;
            else if (r.status === '합격') {
                g.acceptedCount++;
                if (r.score > 0) g.acceptedScores.push(r.score);
            } else if (r.status === '불합격') {
                g.rejectedCount++;
                if (r.score > g.maxRejectedScore) g.maxRejectedScore = r.score;
            } else if (r.status === '최종 진학' || r.status === '최종진학') {
                g.finalCount++;
                g.acceptedCount++;
                if (r.score > 0) g.acceptedScores.push(r.score);
            }
        });
    });

    // 정렬: 입학년도 역순 -> 학교구분(마이스터, 특성화, 자사고, 일반고) -> 학교명 -> 전형(특별 먼저, 일반) -> 학과명
    const catOrder = { meister: 1, special: 2, self_foreign: 3, general: 4, other: 5, none: 6 };
    const trackOrder = track => (track.includes('특별') || track.includes('취업') ? 1 : 2);

    const list = Array.from(groupsMap.values()).sort((a, b) => {
        if (b.admissionYear !== a.admissionYear) return b.admissionYear - a.admissionYear;
        const ca = catOrder[a.category] || 9, cb = catOrder[b.category] || 9;
        if (ca !== cb) return ca - cb;
        if (a.schoolName !== b.schoolName) return a.schoolName.localeCompare(b.schoolName);
        const ta = trackOrder(a.track), tb = trackOrder(b.track);
        if (ta !== tb) return ta - tb;
        return a.department.localeCompare(b.department);
    });

    return list;
}

// 1. 우리 반 지원희망 모달 (스마트 지망 가로 뱃지 + 학생 명단 팝업 지원)
async function openClassApplicationSummaryModal(classNum) {
    document.getElementById('classApplicationSummaryModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'classApplicationSummaryModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = '<div class="glass-card p-7"><span class="spinner"></span> 우리 반 지원희망을 집계하는 중...</div>';
    document.body.appendChild(modal);

    try {
        const allRecords = await window.go.main.App.GetSchoolApplicationRecords() || [];
        const classRecords = allRecords.filter(r => r.classNum === classNum);
        const smartGroups = buildSmartApplicationGroups(classRecords);

        let rowsHTML = '<tr><td colspan="12" class="p-10 text-center text-text-muted">우리 반에 기록된 지원희망이 없습니다.</td></tr>';
        if (smartGroups.length > 0) {
            let currentSchool = null, currentYear = null;
            const groupedWithRowSpan = [];

            smartGroups.forEach(g => {
                const isSameGroup = currentSchool === g.schoolName && currentYear === g.admissionYear;
                let rowSpanSchool = 0;
                if (!isSameGroup) {
                    currentSchool = g.schoolName;
                    currentYear = g.admissionYear;
                    rowSpanSchool = smartGroups.filter(x => x.schoolName === currentSchool && x.admissionYear === currentYear).length;
                }
                groupedWithRowSpan.push({ ...g, isFirstGroup: !isSameGroup, rowSpanSchool });
            });

            rowsHTML = groupedWithRowSpan.map(g => {
                const schoolCells = g.isFirstGroup ? `
                    <td class="p-3 border-r border-slate-700/50 text-center font-bold text-slate-300" rowspan="${g.rowSpanSchool}">${g.admissionYear}학년도</td>
                    <td class="p-3 border-r border-slate-700/50 text-center font-semibold text-slate-300" rowspan="${g.rowSpanSchool}">${g.categoryLabel}</td>
                    <td class="p-3 border-r border-slate-700/50 font-bold text-white" rowspan="${g.rowSpanSchool}">${g.schoolName}</td>
                ` : '';

                const rankBadges = Object.keys(g.ranks).sort((a, b) => a - b).map(rank => `
                    <button type="button" class="btn-show-class-rank px-2 py-0.5 rounded-md bg-indigo-950/90 hover:bg-indigo-800 text-indigo-200 border border-indigo-500/40 text-[11px] font-semibold transition-colors cursor-pointer"
                            data-group-key="${g.key}" data-rank="${rank}" title="클릭하여 ${rank}지망 학생 명단 보기">
                        ${rank > 0 ? `${rank}지망: ` : ''}<b>${g.ranks[rank].length}명</b>
                    </button>
                `).join('');

                const totalBadge = `
                    <button type="button" class="btn-show-class-all px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-white font-black text-[11px] border border-slate-600 transition-colors cursor-pointer"
                            data-group-key="${g.key}" title="클릭하여 전체 지원 학생 명단 보기">
                        (총 ${g.allStudents.length}명)
                    </button>
                `;

                return `
                    <tr class="border-b border-slate-700/60 hover:bg-slate-800/40 transition-colors text-xs">
                        ${schoolCells}
                        <td class="p-3 font-semibold ${g.track.includes('특별') || g.track.includes('취업') ? 'text-amber-300' : 'text-sky-200'}">${g.track}</td>
                        <td class="p-3 font-bold text-white">${g.department}</td>
                        <td class="p-3">
                            <div class="flex flex-wrap items-center gap-1.5">${rankBadges} ${totalBadge}</div>
                        </td>
                        <td class="p-3 text-center text-cyan-200 font-medium">${g.plannedCount}</td>
                        <td class="p-3 text-center text-indigo-200 font-medium">${g.submittedCount}</td>
                        <td class="p-3 text-center text-emerald-300 font-medium">${g.acceptedCount}</td>
                        <td class="p-3 text-center text-rose-300 font-medium">${g.rejectedCount}</td>
                        <td class="p-3 text-center font-bold text-white">${g.finalCount}</td>
                    </tr>
                `;
            }).join('');
        }

        modal.innerHTML = `
            <div class="glass-card print-document p-7 w-full max-w-6xl select-none break-keep-all">
                <div class="flex justify-between items-start gap-4 mb-5">
                    <div>
                        <h2 class="text-2xl font-bold text-white flex items-center gap-2">📋 ${classNum}반 지원희망 스마트 현황</h2>
                        <p class="text-sm text-text-muted mt-1">지망별 뱃지를 클릭하면 해당 지망으로 지원한 학생 명단을 즉시 확인할 수 있습니다.</p>
                    </div>
                    <div class="no-print flex items-center gap-2">
                        <button id="printClassSummary" class="btn-secondary px-3 py-2 text-sm cursor-pointer">🖨️ 인쇄 / PDF</button>
                        <button id="closeClassApplicationSummary" class="text-3xl text-text-muted hover:text-white cursor-pointer transition-colors">×</button>
                    </div>
                </div>
                <div class="overflow-auto max-h-[70vh] border border-slate-700 rounded-xl bg-slate-900/40">
                    <table class="w-full text-sm">
                        <thead class="sticky top-0 bg-slate-800 border-b border-slate-700">
                            <tr class="text-xs text-slate-400 font-bold">
                                <th class="p-3 border-r border-slate-700/50 w-24">입학년도</th>
                                <th class="p-3 border-r border-slate-700/50 w-24">구분</th>
                                <th class="p-3 border-r border-slate-700/50 w-40 text-left pl-3">학교</th>
                                <th class="p-3 w-28 text-left pl-3">전형</th>
                                <th class="p-3 w-36 text-left pl-3">학과</th>
                                <th class="p-3 text-left pl-3">지망별 지원 분포 (클릭 시 학생 명단)</th>
                                <th class="p-3 w-16 text-center text-cyan-300">예정</th>
                                <th class="p-3 w-16 text-center text-indigo-300">지원</th>
                                <th class="p-3 w-16 text-center text-emerald-300">합격</th>
                                <th class="p-3 w-16 text-center text-rose-300">불합</th>
                                <th class="p-3 w-16 text-center text-white">최종</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHTML}</tbody>
                    </table>
                </div>
                <p class="mt-4 text-xs text-text-muted">* 지망별 뱃지(예: 1지망: 2명)를 누르면 명단이 바로 표시됩니다.</p>
            </div>
        `;
        document.getElementById('closeClassApplicationSummary').onclick = () => modal.remove();
        document.getElementById('printClassSummary').onclick = () => printOnly('summary', 'landscape');

        // 지망 뱃지 클릭 리스너 연결
        modal.querySelectorAll('.btn-show-class-rank').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupKey = btn.dataset.groupKey;
                const rank = parseInt(btn.dataset.rank, 10);
                const group = smartGroups.find(g => g.key === groupKey);
                if (group && group.ranks[rank]) {
                    openApplicantDetailModal(`[${group.schoolName}] ${group.department} (${group.track}) - ${rank}지망 지원자`, group.ranks[rank]);
                }
            });
        });

        // 전체 총원 뱃지 클릭 리스너 연결
        modal.querySelectorAll('.btn-show-class-all').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupKey = btn.dataset.groupKey;
                const group = smartGroups.find(g => g.key === groupKey);
                if (group) {
                    openApplicantDetailModal(`[${group.schoolName}] ${group.department} (${group.track}) - 전체 지원자`, group.allStudents);
                }
            });
        });

    } catch (err) {
        modal.innerHTML = `<div class="glass-card p-7 max-w-lg"><h2 class="text-xl font-bold mb-3">우리 반 지원희망을 불러올 수 없습니다</h2><p class="text-text-muted">${err}</p><button id="closeClassApplicationSummary" class="btn-secondary w-auto px-4 py-2 mt-5">닫기</button></div>`;
        document.getElementById('closeClassApplicationSummary').onclick = () => modal.remove();
    }
}

// 2. 우리 학교 전체 지원현황 모달 (학교-전형-학과 1줄 통합, 스마트 지망 가로 뱃지 + 학생 명단 팝업)
async function openApplicationSummaryModal() {
    document.getElementById('applicationSummaryModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'applicationSummaryModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto';
    modal.innerHTML = '<div class="glass-card p-7 my-auto"><span class="spinner"></span> 우리 학교 지원현황을 집계하는 중...</div>';
    document.body.appendChild(modal);

    const closeModal = () => {
        document.removeEventListener('keydown', handleKeydown);
        modal.remove();
    };
    const handleKeydown = (e) => {
        if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKeydown);
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    try {
        const config = await window.go.main.App.GetSchoolConfig().catch(() => null);
        const recordsResp = await window.go.main.App.GetSchoolApplicationRecords().catch(() => []);
        const allRecords = Array.isArray(recordsResp) ? recordsResp : [];

        const admissionYear = config?.admissionYear || new Date().getFullYear() + 1;
        const [closure, review] = await Promise.all([
            window.go.main.App.GetAdmissionClosure(admissionYear).catch(() => null),
            window.go.main.App.GetAdmissionClosureReview(admissionYear).catch(() => null),
        ]);

        const smartGroups = buildSmartApplicationGroups(allRecords);

        let rowsHTML = `
            <tr>
                <td colspan="12" class="p-12 text-center text-text-muted">
                    <span class="text-3xl block mb-2">📝</span>
                    <span class="font-bold text-slate-200 text-sm block">아직 등록된 지원희망 또는 원서접수 학생 데이터가 없습니다.</span>
                    <p class="text-xs text-slate-400 mt-1.5">담임 선생님 화면의 [지원희망 요약] 또는 학생별 1:1 진학 상담 화면에서 고교 지원 희망을 등록하시면 실시간으로 통계가 집계됩니다.</p>
                </td>
            </tr>
        `;
        if (smartGroups.length > 0) {
            let currentSchool = null, currentYear = null;
            const groupedWithRowSpan = [];

            smartGroups.forEach(g => {
                const isSameGroup = currentSchool === g.schoolName && currentYear === g.admissionYear;
                let rowSpanSchool = 0;
                if (!isSameGroup) {
                    currentSchool = g.schoolName;
                    currentYear = g.admissionYear;
                    rowSpanSchool = smartGroups.filter(x => x.schoolName === currentSchool && x.admissionYear === currentYear).length;
                }
                groupedWithRowSpan.push({ ...g, isFirstGroup: !isSameGroup, rowSpanSchool });
            });

            rowsHTML = groupedWithRowSpan.map(g => {
                const schoolCells = g.isFirstGroup ? `
                    <td class="p-3 border-r border-slate-700/50 text-center font-bold text-slate-300" rowspan="${g.rowSpanSchool}">${g.admissionYear}학년도</td>
                    <td class="p-3 border-r border-slate-700/50 text-center font-semibold text-slate-300" rowspan="${g.rowSpanSchool}">${g.categoryLabel}</td>
                    <td class="p-3 border-r border-slate-700/50 font-bold text-white" rowspan="${g.rowSpanSchool}">${g.schoolName}</td>
                ` : '';

                const rankBadges = Object.keys(g.ranks).sort((a, b) => a - b).map(rank => `
                    <button type="button" class="btn-show-school-rank px-2 py-0.5 rounded-md bg-indigo-950/90 hover:bg-indigo-800 text-indigo-200 border border-indigo-500/40 text-[11px] font-semibold transition-colors cursor-pointer"
                            data-group-key="${g.key}" data-rank="${rank}" title="클릭하여 ${rank}지망 학생 명단 보기">
                        ${rank > 0 ? `${rank}지망: ` : ''}<b>${g.ranks[rank].length}명</b>
                    </button>
                `).join('');

                const totalBadge = `
                    <button type="button" class="btn-show-school-all px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-white font-black text-[11px] border border-slate-600 transition-colors cursor-pointer"
                            data-group-key="${g.key}" title="클릭하여 전체 지원 학생 명단 보기">
                        (총 ${g.allStudents.length}명)
                    </button>
                `;

                const scoreDisplay = g.acceptedScores.length > 0 ? `
                    <span class="text-sky-300 font-bold">${Math.max(...g.acceptedScores).toFixed(2)}</span> / 
                    <span class="text-emerald-300 font-bold">${Math.min(...g.acceptedScores).toFixed(2)}</span> / 
                    <span class="text-amber-300 font-semibold">${(g.acceptedScores.reduce((a, b) => a + b, 0) / g.acceptedScores.length).toFixed(2)}</span>
                ` : '-';

                return `
                    <tr class="border-b border-slate-700/60 hover:bg-slate-800/40 transition-colors text-xs">
                        ${schoolCells}
                        <td class="p-3 font-semibold ${g.track.includes('특별') || g.track.includes('취업') ? 'text-amber-300' : 'text-sky-200'}">${g.track}</td>
                        <td class="p-3 font-bold text-white">${g.department}</td>
                        <td class="p-3">
                            <div class="flex flex-wrap items-center gap-1.5">${rankBadges} ${totalBadge}</div>
                        </td>
                        <td class="p-3 text-center text-cyan-200 font-medium">${g.plannedCount}</td>
                        <td class="p-3 text-center text-indigo-200 font-medium">${g.submittedCount}</td>
                        <td class="p-3 text-center text-emerald-300 font-medium">${g.acceptedCount}</td>
                        <td class="p-3 text-center text-rose-300 font-medium">${g.rejectedCount}</td>
                        <td class="p-3 text-center font-bold text-white">${g.finalCount}</td>
                        <td class="p-3 text-right font-mono text-xs pr-3">${scoreDisplay}</td>
                    </tr>
                `;
            }).join('');
        }

        const canApplyCutoffs = window.currentUser?.Role === 'master';
        const closeInfo = closure
            ? `<div class="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4"><p class="font-bold text-emerald-200">🔒 ${admissionYear}학년도 입시 결과 확정됨</p><p class="text-xs text-slate-300 mt-1">확정자: ${closure.closedBy || '학년부장'} · 결과 커트라인 ${closure.cutoffsApplied || 0}건 반영됨${closure.note ? ` · 메모: ${closure.note}` : ''}</p></div>`
            : `<div class="rounded-xl border ${review.pendingCount ? 'border-amber-400/40 bg-amber-500/10' : 'border-sky-400/40 bg-sky-500/10'} p-4"><p class="font-bold ${review.pendingCount ? 'text-amber-200' : 'text-sky-200'}">${admissionYear}학년도 결과 확정 전</p><p class="text-xs text-slate-300 mt-1">기록 ${review.totalRecorded}건 · 진행 중 ${review.pendingCount}건 · 합격 ${review.acceptedCount}건 · 불합격 ${review.rejectedCount}건 · 포기 ${review.withdrawnCount}건 · 최종 진학 ${review.finalCount}건</p><p class="text-xs text-slate-400 mt-1">진행 중 기록을 모두 결과 상태로 바꾼 뒤 확정하면 수정이 잠기고, 합격 결과가 우리 학교 커트라인에 자동 반영됩니다.</p></div>`;
        const closeControls = canApplyCutoffs
            ? (closure
                ? '<button id="reopenAdmissionYear" class="btn-secondary w-auto px-4 py-2 text-sm font-medium cursor-pointer">🔓 결과 확정 해제</button>'
                : `<input id="admissionClosureNote" class="input-field w-44 py-2 text-xs" placeholder="확정 메모 (선택)"><button id="closeAdmissionYear" class="btn-primary w-auto px-4 py-2 text-sm font-medium cursor-pointer">🔒 입시 결과 확정</button>`)
            : '';

        modal.innerHTML = `
            <div class="glass-card p-6 sm:p-7 w-full max-w-7xl max-h-[92vh] flex flex-col my-auto shadow-2xl select-none break-keep-all">
                <div class="shrink-0 flex justify-between items-start gap-4 mb-4 pb-3 border-b border-slate-700/60">
                    <div>
                        <h2 class="text-2xl font-bold text-white flex items-center gap-2">📋 우리 학교 지원현황 스마트 통계</h2>
                        <p class="text-sm text-text-muted mt-1">학교-전형-학과별 1줄로 통합되어 지원 경향이 한눈에 파악되며, 지망 뱃지 클릭 시 학생 명단이 팝업됩니다.</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="closeApplicationSummary" class="text-2xl text-slate-400 hover:text-white px-3 py-1 rounded-lg hover:bg-slate-700/50 transition-colors cursor-pointer" title="닫기 (ESC)">✕</button>
                    </div>
                </div>
                <div class="shrink-0 mb-3">${closeInfo}</div>
                <div class="overflow-auto flex-1 min-h-40 border border-slate-700 rounded-xl mb-4 bg-slate-900/40">
                    <table class="w-full text-sm">
                        <thead class="sticky top-0 bg-slate-800 z-10 border-b border-slate-700">
                            <tr class="text-xs text-slate-400 font-bold">
                                <th class="p-3 border-r border-slate-700/50 w-24 text-center">입학년도</th>
                                <th class="p-3 border-r border-slate-700/50 w-24 text-center">구분</th>
                                <th class="p-3 border-r border-slate-700/50 w-44 text-left pl-3">학교</th>
                                <th class="p-3 w-28 text-left pl-3">전형</th>
                                <th class="p-3 w-36 text-left pl-3">학과</th>
                                <th class="p-3 text-left pl-3">지망별 지원 분포 (클릭 시 학생 명단)</th>
                                <th class="p-3 w-16 text-center text-cyan-300">예정</th>
                                <th class="p-3 w-16 text-center text-indigo-300">지원</th>
                                <th class="p-3 w-16 text-center text-emerald-300">합격</th>
                                <th class="p-3 w-16 text-center text-rose-300">불합</th>
                                <th class="p-3 w-16 text-center text-white">최종</th>
                                <th class="p-3 w-36 text-right pr-4 text-amber-300">합격 최고/최저/평균</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHTML}</tbody>
                    </table>
                </div>
                <div class="shrink-0 pt-3 border-t border-slate-700/60 flex flex-wrap justify-between items-center gap-3">
                    <p class="text-xs text-text-muted">* 지망 뱃지(예: 1지망: 3명)를 누르면 해당 지원자들의 점수와 상태가 팝업으로 나타납니다.</p>
                    <div class="flex flex-wrap items-center gap-2">
                        <button id="closeApplicationSummaryBottom" class="btn-secondary w-auto px-4 py-2 text-sm font-bold flex items-center gap-1.5 hover:bg-slate-700 cursor-pointer">← 닫기 (목록으로)</button>
                        <span class="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm">🔒 100% 오프라인 안전 모드 (외부 유출 원천 차단)</span>
                        ${canApplyCutoffs ? '<button id="applyApplicationCutoffs" class="btn-secondary w-auto px-4 py-2 text-sm cursor-pointer">📈 합격 결과를 우리 학교 커트라인에 반영</button>' : ''}
                        ${closeControls}
                    </div>
                </div>
            </div>`;

        document.getElementById('closeApplicationSummary').onclick = closeModal;
        document.getElementById('closeApplicationSummaryBottom').onclick = closeModal;

        // 지망 뱃지 클릭 리스너 연결
        modal.querySelectorAll('.btn-show-school-rank').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupKey = btn.dataset.groupKey;
                const rank = parseInt(btn.dataset.rank, 10);
                const group = smartGroups.find(g => g.key === groupKey);
                if (group && group.ranks[rank]) {
                    openApplicantDetailModal(`[${group.schoolName}] ${group.department} (${group.track}) - ${rank}지망 지원자`, group.ranks[rank]);
                }
            });
        });

        // 전체 총원 뱃지 클릭 리스너 연결
        modal.querySelectorAll('.btn-show-school-all').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupKey = btn.dataset.groupKey;
                const group = smartGroups.find(g => g.key === groupKey);
                if (group) {
                    openApplicantDetailModal(`[${group.schoolName}] ${group.department} (${group.track}) - 전체 지원자`, group.allStudents);
                }
            });
        });

        document.getElementById('applyApplicationCutoffs')?.addEventListener('click', async () => {
            const confirmed = await showModalConfirm({
                title: '커트라인 반영 확인',
                message: '합격·최종진학 결과의 최고·최저·평균 점수를 우리 학교 커트라인으로 반영할까요?\n기존 같은 연도·학교·전형·학과의 커트라인은 결과값으로 갱신됩니다.',
                confirmText: '반영하기',
                type: 'info'
            });
            if (!confirmed) return;
            try {
                const count = await window.go.main.App.ApplyApplicationCutoffs();
                await showModalAlert(count ? `${count}건의 우리 학교 커트라인을 반영했습니다.` : '반영할 합격 결과가 없습니다.', '반영 완료', 'success');
            } catch (err) { await showModalAlert('커트라인 반영 실패: ' + err, '오류', 'error'); }
        });
        document.getElementById('closeAdmissionYear')?.addEventListener('click', async () => {
            if (review.pendingCount) return await showModalAlert(`진행 중인 기록이 ${review.pendingCount}건 있습니다. 모두 합격·불합격·포기·최종 진학으로 결과를 입력한 뒤 확정해주세요.`, '진행 중 기록 존재', 'warning');
            const confirmed = await showModalConfirm({
                title: '입시 결과 확정',
                message: `${admissionYear}학년도 입시 결과를 확정할까요?\n\n확정하면 해당 연도 지원현황을 수정할 수 없고, 합격 결과의 최고·최저·평균이 우리 학교 커트라인에 자동 반영됩니다.`,
                confirmText: '확정하기',
                type: 'warning'
            });
            if (!confirmed) return;
            try {
                const note = document.getElementById('admissionClosureNote')?.value?.trim() || '';
                const result = await window.go.main.App.CloseAdmissionYear(admissionYear, note);
                await showModalAlert(`${admissionYear}학년도 입시 결과를 확정했습니다.\n커트라인 ${result.cutoffsApplied || 0}건이 반영되었습니다.`, '확정 완료', 'success');
                closeModal();
                openApplicationSummaryModal();
            } catch (err) { await showModalAlert('입시 결과 확정 실패: ' + err, '오류', 'error'); }
        });
        document.getElementById('reopenAdmissionYear')?.addEventListener('click', async () => {
            const confirmed = await showModalConfirm({
                title: '입시 결과 확정 해제',
                message: `${admissionYear}학년도 입시 결과 확정을 해제할까요?\n\n지원현황을 다시 수정할 수 있습니다. 이미 반영된 커트라인은 자동으로 지워지지 않으므로 필요하면 커트라인 관리에서 검토해주세요.`,
                confirmText: '확정 해제',
                type: 'warning'
            });
            if (!confirmed) return;
            try {
                await window.go.main.App.ReopenAdmissionYear(admissionYear);
                await showModalAlert('입시 결과 확정을 해제했습니다.', '해제 완료', 'success');
                closeModal();
                openApplicationSummaryModal();
            } catch (err) { await showModalAlert('입시 결과 확정 해제 실패: ' + err, '오류', 'error'); }
        });
    } catch (err) {
        modal.innerHTML = `
            <div class="glass-card p-7 max-w-lg my-auto text-center">
                <span class="text-3xl block mb-2">📋</span>
                <h2 class="text-xl font-bold mb-2 text-white">우리 학교 지원현황 안내</h2>
                <p class="text-sm text-slate-300 mb-2">아직 등록된 학생 지원현황 데이터가 없거나 집계 중 예외가 발생했습니다.</p>
                <p class="text-xs text-text-muted bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50 mb-4 break-all">${escapeHtml(String(err))}</p>
                <button id="closeApplicationSummary" class="btn-secondary w-auto px-5 py-2 font-bold cursor-pointer">확인</button>
            </div>
        `;
        document.getElementById('closeApplicationSummary').onclick = closeModal;
    }
}

// ===== 학생별 지원·합격 결과 (학교 내부 암호화 DB 전용) =====
async function openStudentApplicationModal(classNum, studentNum, name, preset = null) {
    document.getElementById('studentApplicationModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'studentApplicationModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `<div class="glass-card p-7 w-full max-w-3xl"><span class="spinner"></span> 지원 현황을 불러오는 중...</div>`;
    document.body.appendChild(modal);

    const closeModal = () => {
        document.removeEventListener('keydown', handleKeydown);
        modal.remove();
    };
    const handleKeydown = (e) => {
        if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKeydown);
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    const canEdit = !window.currentUser || window.currentUser.Role !== 'viewer';
    const statusOptions = ['지원희망', '지원완료', '합격', '불합격'];
    const categoryOptions = [['meister', '마이스터고'], ['special', '특성화고'], ['self_foreign', '자사고·외고'], ['general', '후기 일반고'], ['other', '기타 (전기 기타고/타시도 등)'], ['none', '미진학 (진학포기)']];
    // 지원현황 창은 목록 조회 실패 때문에 열리지 않으면 안 된다. Wails 바인딩
    // 누락·손상 또는 로컬 목록 파일 문제도 1.5초 안에 빈 목록으로 처리한다.
    const withFallback = (operation, fallback, timeoutMs = 1500) => Promise.race([
        Promise.resolve().then(operation).then(result => result ?? fallback).catch(() => fallback),
        new Promise(resolve => setTimeout(() => resolve(fallback), timeoutMs)),
    ]);
    // 고교 목록 실패는 화면을 막지 않되, 학생 산출값은 백그라운드에서 끝까지
    // 가져온 뒤 선택된 학교·전형의 점수 스냅샷을 채운다.
    const highSchoolData = await withFallback(
        () => window.go?.main?.App?.GetHighSchoolsData?.(),
        { schools: [] },
    );
    let studentDetail = null;
    let refreshAutoScore = null;
    const catalog = highSchoolData?.schools || [];
    const normalizedSchoolName = value => String(value || '').replace(/등학교$/, '').replace(/\s/g, '');
    const trackLabel = track => ({
        '일반': '일반전형',
        '특별': '특별전형',
        '취업희망자': '취업자 특별전형',
        '후기 일반계고': '후기 일반계고',
    }[track] || track);
    const calculatedTracks = (schoolName, category) => {
        const raw = [...new Set((studentDetail?.schoolResults || [])
            .filter(result => normalizedSchoolName(result.schoolName) === normalizedSchoolName(schoolName))
            .map(result => result.trackName)
            .filter(Boolean))];
        if (category === 'meister') {
            return raw.sort((a, b) => (b.includes('특별') ? 1 : 0) - (a.includes('특별') ? 1 : 0));
        }
        if (category === 'special') {
            return raw.sort((a, b) => (b.includes('취업') ? 1 : 0) - (a.includes('취업') ? 1 : 0));
        }
        return raw;
    };
    const fallbackTracks = category => {
        if (category === 'meister') return ['특별', '일반'];
        if (category === 'special') return ['취업희망자', '일반'];
        if (category === 'self_foreign') return ['자사고·외고 전형'];
        if (category === 'general') return ['후기 일반계고'];
        if (category === 'none') return ['진학포기', '취업·가사', '해외유학', '검정고시', '기타'];
        return ['해당 없음'];
    };
    const trackOptions = (category, schoolName, selected = '') => {
        if (category === 'other') return '<option value="해당 없음" selected>해당 없음</option>';
        const tracks = (['meister', 'special'].includes(category) && schoolName)
            ? (calculatedTracks(schoolName, category).length ? calculatedTracks(schoolName, category) : fallbackTracks(category))
            : fallbackTracks(category);
        return tracks.map(track => `<option value="${track}" ${track === selected ? 'selected' : ''}>${trackLabel(track)}</option>`).join('');
    };
    const calculatedScore = (category, schoolName, track) => {
        if (category === 'general') {
            const value = Number(studentDetail?.generalHSTotalScore);
            return Number.isFinite(value) && value > 0 ? { score: value, basis: '후기 일반계고 내신 자동 산출' } : null;
        }
        if (!['meister', 'special'].includes(category) || !schoolName || !track) return null;
        const result = (studentDetail?.schoolResults || []).find(item =>
            normalizedSchoolName(item.schoolName) === normalizedSchoolName(schoolName) && item.trackName === track,
        );
        if (!result || !Number.isFinite(Number(result.totalScore))) return null;
        return { score: Number(result.totalScore), basis: `${result.schoolName} ${trackLabel(result.trackName)} 자동 산출 (${result.totalMax}점 만점)` };
    };
    const typeMatches = (schoolType, cat) => {
        if (!schoolType) return false;
        const t = String(schoolType).toLowerCase().trim();
        if (cat === 'meister') return t === 'meister' || t.includes('마이스터');
        if (cat === 'special') return t === 'special' || t.includes('특성화');
        if (cat === 'general') return t === 'general' || t.includes('일반');
        return false;
    };
    const schoolOptions = (category, selected = '') => {
        if (category === 'self_foreign') {
            const schools = ['현대청운고등학교', '울산외국어고등학교'];
            return `<option value="">학교 선택</option>${schools.map(name => `<option value="${escapeAttr(name)}" ${name === selected ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}`;
        }
        if (category === 'other') {
            const schools = ['울산예술고등학교', '울산스포츠과학고등학교', '울산고운고등학교', '울산애니원고등학교', '울산과학고등학교', '타시도 고등학교', '기타'];
            return `<option value="">선택 안 함</option>${schools.map(name => `<option value="${escapeAttr(name)}" ${name === selected ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}`;
        }
        if (category === 'none') {
            return `<option value="미진학" selected>미진학</option>`;
        }
        const filtered = catalog.filter(s => typeMatches(s.type, category));
        if (!filtered.length) {
            if (category === 'meister') {
                const meisterDefaults = ['울산마이스터고등학교', '울산에너지고등학교', '현대공업고등학교'];
                return `<option value="">학교 선택</option>${meisterDefaults.map(name => `<option value="${escapeAttr(name)}" ${name === selected ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}`;
            }
            if (category === 'special') {
                const specialDefaults = ['울산공업고등학교', '울산기술공업고등학교', '울산미용예술고등학교', '울산산업고등학교', '울산생활과학고등학교', '울산상업고등학교', '울산여자기술공업고등학교'];
                return `<option value="">학교 선택</option>${specialDefaults.map(name => `<option value="${escapeAttr(name)}" ${name === selected ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}`;
            }
            return '<option value="">해당 없음</option>';
        }
        return `<option value="">학교 선택</option>${filtered.map(s => `<option value="${escapeAttr(s.name)}" ${s.name === selected ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}`;
    };
    const departmentOptions = (schoolName, selected = '', placeholder = '', allPreferences = [], currentIndex = -1) => {
        const school = catalog.find(s => s.name === schoolName || normalizedSchoolName(s.name) === normalizedSchoolName(schoolName));
        return `<option value="">${placeholder}</option>${(school?.departments || []).map(d => {
            const isSelectedHere = d === selected;
            const otherIndex = allPreferences.findIndex((p, i) => i !== currentIndex && p === d && p !== '');
            if (otherIndex !== -1) {
                return `<option value="${escapeAttr(d)}" disabled class="text-slate-500 bg-slate-800">${escapeHtml(d)} (${otherIndex + 1}지망에 이미 선택됨)</option>`;
            }
            return `<option value="${escapeAttr(d)}" ${isSelectedHere ? 'selected' : ''}>${escapeHtml(d)}</option>`;
        }).join('')}`;
    };
    const departmentControls = (schoolName, preferences = [], assignedDepartment = '') => {
        const school = catalog.find(s => s.name === schoolName || normalizedSchoolName(s.name) === normalizedSchoolName(schoolName));
        const departments = school?.departments || [];
        if (!schoolName) return '<p class="text-xs text-text-muted">지원 학교를 선택하면 해당 학교의 학과 수에 맞춰 지망 입력란이 표시됩니다.</p>';
        if (!departments.length) return '<p class="text-xs text-amber-300">이 학교의 학과 목록을 불러오지 못했습니다. 학년부장에게 최신 배포자료를 받아 다시 적용하세요.</p>';
        const count = Math.min(5, departments.length);
        const paddedPrefs = Array.from({ length: count }, (_, i) => preferences[i] || '');
        return `
            <div class="mb-2 flex items-center justify-between">
                <p class="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>🎯</span> 학과 지망
                    <span class="text-xs font-normal text-slate-400">(다른 지망에 선택된 학과는 비활성화되어 중복 선택이 방지됩니다)</span>
                </p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                ${paddedPrefs.map((selected, i) => `
                    <div class="space-y-1">
                        <label class="text-xs font-semibold text-slate-300 flex items-center gap-1">
                            <span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-400/30">${i + 1}</span>
                            <span>${i + 1}지망 학과</span>
                        </label>
                        <select class="input-field app-pref text-sm py-2" data-rank="${i + 1}">
                            ${departmentOptions(schoolName, selected, `${i + 1}지망 학과 선택`, paddedPrefs, i)}
                        </select>
                    </div>
                `).join('')}
            </div>
            <label class="text-sm font-bold block mt-4 text-white">
                <span class="flex items-center gap-1.5 mb-1.5">
                    <span>🏆</span> 최종 합격(배정) 학과
                    <span class="text-xs font-normal text-emerald-400">(합격 발표 후 실제 배정된 학과를 지정하세요)</span>
                </span>
                <select id="appAssigned" class="input-field w-full text-sm py-2">
                    ${departmentOptions(schoolName, assignedDepartment, '최종 배정 학과 선택')}
                </select>
            </label>
        `;
    };

    let activePreset = preset; // 1회성 적용용

    const render = async (selectedIndex = 0) => {
        const records = await withFallback(
            () => window.go?.main?.App?.GetStudentApplications?.(classNum, studentNum, name),
            [],
        );

        let workingRecords = [...records];
        let activeIdx = selectedIndex;

        // [관심학교 -> 희망원서 자동 등록 연동 프리셋 처리]
        if (activePreset) {
            const rawSch = activePreset.schoolName || '';
            const matchSchool = catalog.find(s => normalizedSchoolName(s.name) === normalizedSchoolName(rawSch));
            const exactSchoolName = matchSchool ? matchSchool.name : rawSch;
            let cat = activePreset.category || 'meister';
            if (matchSchool) {
                const t = String(matchSchool.type || '').toLowerCase();
                if (t.includes('meister') || t.includes('마이스터')) cat = 'meister';
                else if (t.includes('special') || t.includes('특성화')) cat = 'special';
                else if (t.includes('self_foreign')) cat = 'self_foreign';
                else if (t.includes('general') || t.includes('일반')) cat = 'general';
            }

            const rawTrk = activePreset.track || '';
            const cleanTrack = rawTrk.includes('특별') ? '특별' : (rawTrk.includes('취업') ? '취업희망자' : '일반');

            const presetRecord = {
                admissionYear: new Date().getFullYear() + 1,
                category: cat,
                schoolName: exactSchoolName,
                track: cleanTrack,
                status: '지원희망', // 요구사항: 지원상태는 '지원희망'으로 자동화!
                score: activePreset.score || 0,
                scoreBasis: activePreset.scoreBasis || (activePreset.score ? `${exactSchoolName} 산출 점수 연동` : ''),
                preferences: [],
                assignedDepartment: '',
                assignedSchool: '',
                isPresetItem: true
            };

            // 이미 동일 학교/전형 지원 이력이 있는 경우 해당 탭 선택, 없으면 새 지원 추가
            const existingIdx = workingRecords.findIndex(r =>
                normalizedSchoolName(r.schoolName) === normalizedSchoolName(exactSchoolName) &&
                (r.track === cleanTrack || (!r.track && cleanTrack === '일반'))
            );
            if (existingIdx !== -1) {
                activeIdx = existingIdx;
            } else {
                workingRecords.push(presetRecord);
                activeIdx = workingRecords.length - 1;
            }
            activePreset = null; // 1회 적용 후 해제
        }

        const record = workingRecords[activeIdx] || { admissionYear: new Date().getFullYear() + 1, category: 'meister', status: '지원희망', preferences: [] };
        const isGeneral = record.category === 'general';
        const isNone = record.category === 'none';
        const isOther = record.category === 'other';
        const needsSchool = ['meister', 'special', 'self_foreign'].includes(record.category);
        const needsDepartment = ['meister', 'special'].includes(record.category);
        const autoScore = calculatedScore(record.category, record.schoolName, record.track);
        const displayedScore = isNone ? 0 : (record.id ? record.score : (autoScore?.score ?? record.score));
        const displayedBasis = record.scoreBasis || autoScore?.basis || '';
        const isAutoBasis = displayedBasis === (autoScore?.basis || '') || !record.scoreBasis;
        const formatTrack = (track) => track ? `(${track.includes('특별') ? '특별' : (track.includes('일반') ? '일반' : track)})` : '';

        // [요구사항 1] 합격 처리 및 최종학과/배정고 입력 완료 시 비활성화 판별
        const isPassedStatus = ['합격', '최종 진학', '최종진학'].includes((record.status || '').trim());
        const isRecordFinalized = isPassedStatus && (
            (['meister', 'special'].includes(record.category) && !!record.assignedDepartment) ||
            (record.category === 'general' && !!record.assignedSchool) ||
            (!['meister', 'special', 'general'].includes(record.category))
        );
        let isLocked = isRecordFinalized;

        const listTabs = workingRecords.map((r, i) => {
            const isRecNone = r.category === 'none';
            const nameLabel = isRecNone ? '미진학' : (r.schoolName || (r.category === 'general' ? (r.assignedSchool ? `일반고[${r.assignedSchool}]` : '후기 일반고') : '기타'));
            const trackPart = ['meister', 'special'].includes(r.category) ? formatTrack(r.track) : '';
            const statusPart = isRecNone ? '미진학' : ((r.status === '지원예정' || r.status === '지원 예정' || !r.status) ? '지원희망' : r.status);
            const isRecPassed = ['합격', '최종 진학', '최종진학'].includes((r.status || '').trim());
            const isRecFin = isRecPassed && ((['meister', 'special'].includes(r.category) && !!r.assignedDepartment) || (r.category === 'general' && !!r.assignedSchool) || (!['meister', 'special', 'general'].includes(r.category)));
            const lockIcon = isRecFin ? '🔒 ' : '';
            const presetBadge = r.isPresetItem ? '✨ ' : '';
            return `<button class="app-record-tab px-3 py-2 rounded-lg text-xs font-bold transition-all ${i === activeIdx ? 'bg-primary text-white shadow-md' : 'bg-slate-800 text-text-muted hover:text-white'}" data-index="${i}">${presetBadge}${lockIcon}${nameLabel}${trackPart} · ${statusPart}</button>`;
        }).join('');

        const addNewTabBtn = canEdit ? `
            <button id="btnAddNewApplication" class="px-3 py-2 rounded-lg text-xs font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-900/60 transition-colors flex items-center gap-1">
                <span>➕</span> 새 지원 추가
            </button>
        ` : '';

        const list = workingRecords.length || canEdit ? `<div class="flex flex-wrap gap-2 mb-5">${listTabs}${addNewTabBtn}</div>` : '<span class="text-sm text-text-muted">기록된 지원 이력이 없습니다.</span>';

        const statusSelectHTML = isNone
            ? '<option value="미진학" selected>미진학</option>'
            : statusOptions.map(v => `<option ${record.status?.replace(/\s/g, '') === v.replace(/\s/g, '') ? 'selected' : ''}>${v}</option>`).join('');

        const lockedBannerHTML = isRecordFinalized ? `
            <div id="applicationLockBanner" class="md:col-span-2 p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-500/60 text-emerald-200 text-xs flex items-center justify-between shadow-lg">
                <div class="flex items-center gap-2">
                    <span class="text-lg">🔒</span>
                    <div>
                        <strong class="font-bold text-emerald-300">[희망학교 비활성화 잠금]</strong>
                        <span>합격 및 최종 학과(배정고) 입력이 완료되어 희망학교 수정이 비활성화되었습니다.</span>
                    </div>
                </div>
                ${canEdit ? `<button type="button" id="unlockApplicationBtn" class="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/50 transition-all flex items-center gap-1 shadow-sm">🔓 잠금 해제하여 수정</button>` : ''}
            </div>
        ` : '';

        modal.innerHTML = `
          <div class="glass-card p-7 w-full max-w-3xl max-h-[90vh] overflow-y-auto"><div class="flex justify-between items-start gap-4 mb-5"><div><h2 class="text-2xl font-bold text-white">📝 ${escapeHtml(name)} 지원·합격 현황</h2><p class="text-sm text-text-muted mt-1">이 자료는 학급 암호화 DB와 취합자료 파일에만 저장됩니다. 중앙 서버로 전송되지 않습니다.</p></div><button id="closeApplicationModal" class="text-3xl text-text-muted">×</button></div>
          ${list}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-slate-700 p-5 bg-slate-900/40">
            ${lockedBannerHTML}
            <label class="text-sm font-bold">입학년도<input id="appYear" type="text" inputmode="numeric" value="${record.admissionYear || ''}" class="input-field mt-1 w-full" ${canEdit && !isLocked ? '' : 'disabled'}></label>
            <label class="text-sm font-bold">전형 구분<select id="appCategory" class="input-field mt-1 w-full" ${canEdit && !isLocked ? '' : 'disabled'}>${categoryOptions.map(([v, t]) => `<option value="${v}" ${record.category === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
            <label class="text-sm font-bold">지원 학교<select id="appSchool" class="input-field mt-1 w-full" ${(!needsSchool && record.category !== 'other') || isNone || !canEdit || isLocked ? 'disabled' : ''}>${schoolOptions(record.category, record.schoolName)}</select></label>
            <label class="text-sm font-bold">전형 / 지원 유형<select id="appTrack" class="input-field mt-1 w-full" ${canEdit && !isOther && !isLocked ? '' : 'disabled'}>${trackOptions(record.category, record.schoolName, record.track)}</select></label>
            <label class="text-sm font-bold">지원 상태<select id="appStatus" class="input-field mt-1 w-full" ${canEdit && !isNone && !isLocked ? '' : 'disabled'}>${statusSelectHTML}</select></label>
            <label class="text-sm font-bold">점수 스냅샷 <span class="text-[11px] text-cyan-300">자동</span><input id="appScore" type="text" inputmode="decimal" value="${displayedScore || ''}" placeholder="학교·전형 선택 시 자동 산출" class="input-field mt-1 w-full" ${autoScore || isLocked ? 'readonly' : (canEdit && !isNone ? '' : 'disabled')}></label>
            <label class="text-sm font-bold md:col-span-2">점수 기준 / 메모<input id="appBasis" value="${displayedBasis}" data-auto="${isAutoBasis}" placeholder="${isNone ? '예: 진학포기 사유, 기타 진로 등' : (isOther ? '예: 실기 점수, 학과, 메모 등' : '예: 3-1 누적 예상, 1차 서류점수 등')}" class="input-field mt-1 w-full" ${canEdit && !isLocked ? '' : 'disabled'}></label>
            <div id="appPreferenceArea" class="md:col-span-2 ${needsDepartment ? '' : 'hidden'}">${departmentControls(record.schoolName, record.preferences || [], record.assignedDepartment || '')}</div>
            <div id="appGeneralAssignedArea" class="md:col-span-2 ${isGeneral ? '' : 'hidden'}">
                <label class="text-sm font-bold block">배정 고등학교 (수기 입력)
                    <span class="text-text-muted font-normal text-xs ml-1">- 후기 일반고 합격 후 배정받은 학교명을 입력하세요 (원서대장에 출력됩니다)</span>
                    <input id="appAssignedSchool" type="text" value="${record.assignedSchool || ''}" placeholder="예: 학성고등학교, 울산여자고등학교, 신정고등학교 등" class="input-field mt-1 w-full text-sm" ${canEdit && !isLocked ? '' : 'disabled'}>
                </label>
            </div>
            <p id="generalApplicationGuide" class="md:col-span-2 text-xs text-cyan-300 ${isGeneral ? '' : 'hidden'}">후기 일반고는 합격 발표 후 최종 배정받은 고등학교명을 수기로 입력할 수 있으며, 원서대장에 자동 출력됩니다.</p>
            <p id="noneApplicationGuide" class="md:col-span-2 text-xs text-amber-300 ${isNone ? '' : 'hidden'}">미진학(진학포기) 학생은 학교와 점수를 입력하지 않으며, 지원 상태가 자동으로 ‘미진학’으로 처리됩니다.</p>
          </div>
          <div class="flex justify-center gap-3 mt-5 w-full">
            ${canEdit && record.id && !isLocked ? '<button id="deleteApplication" class="flex-1 btn-secondary border-rose-500/30 text-rose-400 hover:bg-rose-500/10 px-5 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all">🗑️ 기록 삭제</button>' : ''}
            ${canEdit ? `<button id="saveApplication" class="flex-1 btn-primary px-5 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}" ${isLocked ? 'disabled' : ''}>💾 희망학교 저장</button>` : '<span class="text-sm text-text-muted w-full text-center">진로부장 계정은 조회 전용입니다.</span>'}
          </div></div>`;
        document.getElementById('closeApplicationModal').onclick = closeModal;
        modal.querySelectorAll('.app-record-tab').forEach(btn => btn.onclick = () => render(parseInt(btn.dataset.index)));
        modal.querySelector('#btnAddNewApplication')?.addEventListener('click', () => {
            activePreset = {
                admissionYear: new Date().getFullYear() + 1,
                category: 'meister',
                schoolName: '',
                track: '일반',
                status: '지원희망',
                score: 0,
                scoreBasis: ''
            };
            render(workingRecords.length);
        });

        // 잠금 해제 이벤트 리스너
        document.getElementById('unlockApplicationBtn')?.addEventListener('click', () => {
            isLocked = false;
            const banner = document.getElementById('applicationLockBanner');
            if (banner) {
                banner.className = 'md:col-span-2 p-3 rounded-xl bg-amber-950/60 border border-amber-500/50 text-amber-200 text-xs flex items-center justify-between shadow-sm';
                banner.innerHTML = `<div class="flex items-center gap-2"><span>⚠️</span><div><strong class="font-bold text-amber-300">[잠금 해제됨]</strong> <span>희망학교 수정이 가능합니다. 저장 시 다시 잠깁니다.</span></div></div>`;
            }
            document.getElementById('appYear').disabled = false;
            document.getElementById('appCategory').disabled = false;
            const curCat = document.getElementById('appCategory').value;
            const reqSchool = ['meister', 'special', 'self_foreign'].includes(curCat);
            document.getElementById('appSchool').disabled = (!reqSchool && curCat !== 'other') || curCat === 'none';
            document.getElementById('appTrack').disabled = curCat === 'other';
            document.getElementById('appStatus').disabled = curCat === 'none';
            if (!autoScore && curCat !== 'none') {
                document.getElementById('appScore').readOnly = false;
            }
            document.getElementById('appBasis').disabled = false;
            const assignedInput = document.getElementById('appAssignedSchool');
            if (assignedInput) assignedInput.disabled = false;
            modal.querySelectorAll('#appPreferenceArea select').forEach(el => { el.disabled = false; });
            const saveBtn = document.getElementById('saveApplication');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            const delBtn = document.getElementById('deleteApplication');
            if (delBtn) delBtn.disabled = false;
        });

        const refreshDepartmentControls = () => {
            const schoolName = document.getElementById('appSchool').value;
            const preferences = [...modal.querySelectorAll('.app-pref')].map(el => el.value);
            const assigned = document.getElementById('appAssigned')?.value || '';
            const area = document.getElementById('appPreferenceArea');
            area.innerHTML = departmentControls(schoolName, preferences, assigned);
            if (!canEdit || isLocked) area.querySelectorAll('select').forEach(el => { el.disabled = true; });
            area.querySelectorAll('.app-pref').forEach(select => {
                select.addEventListener('change', () => refreshDepartmentControls());
            });
        };

        // 초기 렌더링된 학과 지망 셀렉트 박스에 실시간 중복 비활성화 이벤트 연결
        modal.querySelectorAll('.app-pref').forEach(select => {
            select.addEventListener('change', () => refreshDepartmentControls());
        });
        let scoreRequestID = 0;
        const refreshTrackAndScore = async () => {
            const category = document.getElementById('appCategory').value;
            const schoolName = document.getElementById('appSchool').value;
            const track = document.getElementById('appTrack');
            const previousTrack = track.value;
            track.innerHTML = trackOptions(category, schoolName, previousTrack);
            if (category === 'other') {
                track.disabled = true;
            }
            const auto = calculatedScore(category, schoolName, track.value);
            const scoreInput = document.getElementById('appScore');
            const basisInput = document.getElementById('appBasis');
            const supportsAutoScore = ['meister', 'special', 'general'].includes(category);
            if (auto) {
                scoreInput.value = auto.score.toFixed(2);
                scoreInput.readOnly = true;
                if (!basisInput.value || basisInput.dataset.auto === 'true') {
                    basisInput.value = auto.basis;
                    basisInput.dataset.auto = 'true';
                }
                return;
            }
            if (!supportsAutoScore || (category !== 'general' && (!schoolName || !track.value))) {
                scoreInput.readOnly = !canEdit;
                if (supportsAutoScore) scoreInput.value = '';
                if (!supportsAutoScore && basisInput.dataset.auto === 'true') {
                    basisInput.value = '';
                    basisInput.dataset.auto = 'false';
                }
                return;
            }
            const requestID = ++scoreRequestID;
            scoreInput.value = '';
            scoreInput.placeholder = '점수 자동 산출 중…';
            scoreInput.readOnly = true;
            try {
                const snapshot = await window.go?.main?.App?.GetStudentApplicationScoreSnapshot?.(
                    classNum, studentNum, name, category, schoolName, track.value,
                );
                if (requestID !== scoreRequestID || !document.body.contains(modal)) return;
                const score = Number(snapshot?.score);
                if (!Number.isFinite(score)) throw new Error('산출 점수를 찾지 못했습니다');
                scoreInput.value = score.toFixed(2);
                scoreInput.placeholder = '학교·전형 선택 시 자동 산출';
                if (!basisInput.value || basisInput.dataset.auto === 'true') {
                    basisInput.value = snapshot.basis || '지원 시점 자동 산출';
                    basisInput.dataset.auto = 'true';
                }
            } catch (_) {
                if (requestID !== scoreRequestID || !document.body.contains(modal)) return;
                scoreInput.placeholder = '자동 산출값 없음';
            }
        };
        refreshAutoScore = refreshTrackAndScore;
        document.getElementById('appCategory').onchange = () => {
            const category = document.getElementById('appCategory').value;
            const general = category === 'general';
            const none = category === 'none';
            const other = category === 'other';
            const schoolRequired = ['meister', 'special', 'self_foreign'].includes(category);
            const departmentRequired = ['meister', 'special'].includes(category);
            const schoolSelect = document.getElementById('appSchool');
            schoolSelect.disabled = (!schoolRequired && !other) || none || !canEdit || isLocked;
            schoolSelect.innerHTML = schoolOptions(category);

            const statusSelect = document.getElementById('appStatus');
            if (none) {
                statusSelect.innerHTML = '<option value="미진학" selected>미진학</option>';
                statusSelect.disabled = true;
            } else {
                statusSelect.innerHTML = statusOptions.map(v => `<option>${v}</option>`).join('');
                statusSelect.disabled = !canEdit || isLocked;
            }

            const trackSelect = document.getElementById('appTrack');
            trackSelect.disabled = other || !canEdit || isLocked;

            document.getElementById('appPreferenceArea').classList.toggle('hidden', !departmentRequired);
            document.getElementById('appGeneralAssignedArea')?.classList.toggle('hidden', !general);
            document.getElementById('generalApplicationGuide').classList.toggle('hidden', !general);
            document.getElementById('noneApplicationGuide')?.classList.toggle('hidden', !none);
            const scoreInput = document.getElementById('appScore');
            const basisInput = document.getElementById('appBasis');
            if (none) {
                scoreInput.value = '0';
                scoreInput.disabled = true;
                if (basisInput.dataset.auto === 'true') {
                    basisInput.value = '';
                    basisInput.dataset.auto = 'false';
                }
                basisInput.placeholder = '예: 진학포기 사유, 기타 진로 등';
            } else if (other) {
                scoreInput.value = '';
                scoreInput.disabled = !canEdit || isLocked;
                if (basisInput.dataset.auto === 'true') {
                    basisInput.value = '';
                    basisInput.dataset.auto = 'false';
                }
                basisInput.placeholder = '예: 실기 점수, 학과, 메모 등';
            } else {
                scoreInput.disabled = !canEdit || isLocked;
                basisInput.placeholder = '예: 3-1 누적 예상, 1차 서류점수 등';
            }
            refreshDepartmentControls();
            refreshTrackAndScore();
        };
        document.getElementById('appSchool').onchange = () => {
            refreshDepartmentControls();
            refreshTrackAndScore();
        };
        document.getElementById('appTrack').onchange = refreshTrackAndScore;
        refreshTrackAndScore();
        document.getElementById('saveApplication')?.addEventListener('click', async () => {
            const category = document.getElementById('appCategory').value;
            const preferences = [...modal.querySelectorAll('.app-pref')].map(el => el.value.trim()).filter(Boolean);
            if (new Set(preferences).size !== preferences.length) return alert('학과 지망은 중복해서 입력할 수 없습니다.');
            const hasDepartment = category === 'meister' || category === 'special';
            const schoolVal = category === 'general' ? '' : (category === 'none' ? '미진학' : document.getElementById('appSchool').value.trim());
            const trackVal = category === 'other' ? '해당 없음' : document.getElementById('appTrack').value.trim();
            const statusVal = category === 'none' ? '미진학' : document.getElementById('appStatus').value;
            const scoreVal = category === 'none' ? 0 : (parseFloat(document.getElementById('appScore').value) || 0);
            const assignedSchoolVal = category === 'general' ? (document.getElementById('appAssignedSchool')?.value.trim() || '') : '';
            const payload = {
                classNum,
                studentNum,
                studentName: name,
                admissionYear: parseInt(document.getElementById('appYear').value),
                category,
                schoolName: schoolVal,
                track: trackVal,
                status: statusVal,
                score: scoreVal,
                scoreBasis: document.getElementById('appBasis').value.trim(),
                preferences: hasDepartment ? preferences : [],
                assignedDepartment: hasDepartment ? document.getElementById('appAssigned').value.trim() : '',
                assignedSchool: assignedSchoolVal
            };
            const sameYear = records.filter(r => r.admissionYear === payload.admissionYear && r.schoolName !== payload.schoolName);
            const active = r => ['지원예정', '지원완료', '지원 예정', '지원 완료', '합격', '최종 진학'].includes(r.status);
            const activeIn = categoryName => sameYear.some(r => r.category === categoryName && active(r));
            if ((category === 'meister' || category === 'special' || category === 'self_foreign') && !payload.schoolName) return alert('마이스터고·특성화고·자사고·외고는 목록에서 지원 학교를 선택해주세요.');
            if ((category === 'meister' || category === 'special') && ['합격', '최종 진학'].includes(payload.status) && !payload.assignedDepartment) return alert('합격 또는 최종 진학 결과는 실제 배정 학과를 선택해주세요.');

            if (active(payload)) {
                if (category === 'meister' && activeIn('meister')) return alert('마이스터고는 단 1개의 학교에만 지원 가능합니다. (동일 학교 내 특별/일반 전형 복수 지원은 허용)');
                if (category === 'special') {
                    if (payload.track.includes('취업') && sameYear.some(r => r.category === 'special' && r.track.includes('취업') && active(r))) {
                        return alert('특성화고 취업희망자 전형은 단 1개의 학교에만 지원 가능합니다.');
                    }
                    if (payload.track.includes('일반')) {
                        if (sameYear.some(r => r.category === 'special' && r.track.includes('일반') && active(r))) {
                            return alert('특성화고 일반전형은 단 1개의 학교에만 지원 가능합니다.');
                        }
                        if (sameYear.some(r => r.category === 'special' && r.track.includes('취업') && active(r))) {
                            return alert('특성화고 취업희망자 전형 결과가 불합격으로 확정된 이후에 일반전형 지원이 가능합니다.');
                        }
                    }
                }
                if ((category === 'meister' || category === 'special') && activeIn('self_foreign')) return alert('자사고·외고 지원이 진행 중이거나 합격한 학생은 마이스터고·특성화고 전형을 함께 진행할 수 없습니다.');
                if (category === 'self_foreign' && (activeIn('meister') || activeIn('special'))) return alert('마이스터고·특성화고 지원이 진행 중이거나 합격한 학생은 자사고·외고 전형을 함께 진행할 수 없습니다.');
                if (category === 'special' && activeIn('meister')) return alert('마이스터고 결과가 확정되기 전에는 특성화고 지원을 기록할 수 없습니다. 불합격 또는 포기 처리 후 진행해주세요.');
                if (category === 'general' && (activeIn('meister') || activeIn('special') || activeIn('self_foreign'))) return alert('선행 전형의 결과가 불합격 또는 포기로 확정된 뒤 후기 일반고 지원을 기록할 수 있습니다.');
            }
            try {
                await window.go.main.App.SaveStudentApplication(payload);
                await render(0);
                if (typeof window.refreshCurrentClass === 'function') window.refreshCurrentClass();
            } catch (err) { alert('희망학교 저장 실패: ' + err); }
        });
        document.getElementById('deleteApplication')?.addEventListener('click', async () => {
            const displayName = record.category === 'none' ? '미진학' : (record.schoolName || (record.category === 'general' ? '후기 일반고' : '기타'));
            const confirmed = await showModalConfirm({
                title: '지원 기록 삭제',
                message: `'${displayName}' 지원 기록을 완전히 삭제하시겠습니까?`,
                confirmText: '삭제하기',
                type: 'warning'
            });
            if (!confirmed) return;
            try {
                await window.go.main.App.DeleteStudentApplication(classNum, studentNum, name, record.category, record.schoolName, record.track);
                await render(0);
                if (typeof window.refreshCurrentClass === 'function') window.refreshCurrentClass();
            } catch (err) {
                await showModalAlert('희망학교 삭제 실패: ' + err, '오류', 'error');
            }
        });
    };
    try {
        await render();
    } catch (err) {
        modal.innerHTML = `<div class="glass-card p-7 max-w-lg"><h2 class="text-xl font-bold mb-3">지원 현황을 열 수 없습니다</h2><p class="text-text-muted wrap-break-word">${err?.message || err}</p><button id="closeApplicationModal" class="btn-secondary w-auto px-4 py-2 mt-5">닫기</button></div>`;
        document.getElementById('closeApplicationModal').onclick = closeModal;
    }
}

// ===== 학생 전학년 전과목 교과/비교과 종합 성적표 모달 =====
window.openStudentTranscriptModal = openStudentTranscriptModal;

async function openStudentTranscriptModal(classNum, studentNum, name) {
    document.getElementById('studentTranscriptModal')?.remove();

    const modalEl = document.createElement('div');
    modalEl.id = 'studentTranscriptModal';
    modalEl.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modalEl.innerHTML = `
        <div class="glass-card p-8 w-full max-w-4xl text-center">
            <span class="spinner"></span> <span class="text-white ml-2">${escapeHtml(name)} 학생의 전학년 종합 성적표를 조회하는 중...</span>
        </div>
    `;
    document.body.appendChild(modalEl);

    try {
        const data = await window.go.main.App.GetStudentTranscript(classNum, studentNum, name);

        // 1. 교과 성적 맵 생성 (과목별 행, 학기별 열 - 나이스 표준 매트릭스)
        // 1. 교과 성적 맵 생성 (과목별 행, 학기별 열 - 나이스 표준 매트릭스)
        // 나이스 생활기록부 공식 편제 순서: 기본교과 -> 선택교과 -> 체육/예술(예체능 교과는 맨 마지막)
        const subjectOrder = [
            '국어', '도덕', '사회', '역사', '수학', '과학',
            '기술·가정', '기술가정', '정보', '영어',
            '한문', '제2외국어', '중국어', '일본어',
            '체육', '음악', '미술'
        ];
        const getSubjectPriority = (name) => {
            const clean = name.replace(/\s+/g, '');
            // 예체능 교과(체육, 음악, 미술)는 무조건 가장 마지막 순위(800번대)로 배치
            if (clean.includes('체육')) return 801;
            if (clean.includes('음악')) return 802;
            if (clean.includes('미술')) return 803;

            const idx = subjectOrder.findIndex(s => clean.includes(s) || s.includes(clean));
            return idx !== -1 ? idx : 500; // 정의되지 않은 기타 선택과목은 일반교과 뒤, 예체능 앞에 배치
        };

        const subjectMap = new Map(); // normSubject -> { displayName, scores: {} }
        let has1_1Data = false;
        let has1_1Graded = false; // A~E 일반 성취도가 있는지 여부

        if (data.subjectRecords && data.subjectRecords.length > 0) {
            let lastGrade = '1';
            let lastSem = '1';

            data.subjectRecords.forEach(rec => {
                let grade = '';
                let sem = '';
                let subject = '';
                let achieve = '';
                let rawScore = '';

                for (const [k, v] of Object.entries(rec)) {
                    const cleanK = k.replace(/\s+/g, '').replace(/["'\r\n]/g, '');
                    const cleanV = String(v || '').trim().replace(/["'\r\n]/g, '');

                    if (cleanK.includes('학년도')) continue;
                    if (cleanK === '학년' || (cleanK.includes('학년') && !cleanK.includes('학기'))) {
                        grade = cleanV;
                    } else if (cleanK === '학기' || cleanK.includes('학기')) {
                        sem = cleanV;
                    } else if (cleanK.includes('성취도')) {
                        achieve = cleanV;
                    } else if (cleanK.includes('원점수') || cleanK.includes('과목평균') || cleanK.includes('평균')) {
                        rawScore = cleanV;
                    } else if (cleanK === '과목' || cleanK === '교과목' || cleanK.includes('과목명') || (cleanK.includes('과목') && !cleanK.includes('평균'))) {
                        subject = cleanV;
                    }
                }

                if (grade) lastGrade = grade;
                else grade = lastGrade;

                if (sem) lastSem = sem;
                else sem = lastSem;

                if (!subject || !achieve || subject === '/' || !isNaN(Number(subject)) || subject.length < 2) return;

                const gNum = grade.replace(/[^0-9]/g, '') || '1';
                const sNum = sem.replace(/[^0-9]/g, '') || '1';
                const semKey = `${gNum}-${sNum}`;

                const firstChar = achieve[0].toUpperCase();
                const isPass = firstChar === 'P' || achieve === '이수';
                if (!['A', 'B', 'C', 'D', 'E', 'P'].includes(firstChar) && !isPass) return;

                if (semKey === '1-1') {
                    has1_1Data = true;
                    if (!isPass && ['A', 'B', 'C', 'D', 'E'].includes(firstChar)) {
                        has1_1Graded = true;
                    }
                }

                // 과목명 정규화 (기술·가정 등 통일)
                const normSubject = subject.replace(/\s+/g, '');
                if (!subjectMap.has(normSubject)) {
                    subjectMap.set(normSubject, {
                        displayName: subject,
                        scores: {}
                    });
                }
                subjectMap.get(normSubject).scores[semKey] = {
                    achieve,
                    rawScore,
                    isPass
                };
            });
        }

        // 1학년 1학기 자유학기제 판정 (A~E 일반 성취도가 없거나 데이터가 없는 경우 자유학기제로 자동 판정)
        const is1_1FreeSemester = !has1_1Graded;

        // 표준 과목 순서대로 정렬
        const sortedSubjects = [...subjectMap.values()].sort((a, b) => {
            const pA = getSubjectPriority(a.displayName);
            const pB = getSubjectPriority(b.displayName);
            if (pA !== pB) return pA - pB;
            return a.displayName.localeCompare(b.displayName, 'ko');
        });

        // 성취도 배지 생성 헬퍼
        const getAchieveBadge = (achieve) => {
            if (!achieve) return '-';
            const firstChar = achieve[0].toUpperCase();
            let color = 'text-slate-300';
            if (firstChar === 'A') color = 'text-emerald-400 font-bold';
            else if (firstChar === 'B') color = 'text-sky-400 font-bold';
            else if (firstChar === 'C') color = 'text-amber-400 font-bold';
            else if (firstChar === 'D') color = 'text-orange-400 font-bold';
            else if (firstChar === 'E') color = 'text-rose-400 font-bold';
            else if (firstChar === 'P') color = 'text-indigo-300 font-semibold';
            return `<span class="${color}">${escapeHtml(achieve)}</span>`;
        };

        // 테이블 행(TR) 생성
        let matrixRows = '';
        if (sortedSubjects.length === 0) {
            matrixRows = `<tr><td colspan="6" class="p-8 text-center text-text-muted">업로드된 교과 성적 데이터가 없거나 성취평가 대상 과목이 없습니다.</td></tr>`;
        } else {
            sortedSubjects.forEach((subObj, rowIdx) => {
                let tds = '';

                // 1. 1학년 1학기 셀 (자유학기제인 경우 전체 과목 높이만큼 1개 셀로 통합 병합)
                if (is1_1FreeSemester) {
                    if (rowIdx === 0) {
                        tds += `
                            <td rowspan="${sortedSubjects.length}" class="p-2 border-l border-slate-700/60 bg-indigo-950/20 text-indigo-300 font-bold text-center text-xs align-middle leading-relaxed free-semester-cell">
                                <span class="px-2 py-0.5 rounded-full bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 text-[11px] font-black inline-block mb-1">자유학기제</span>
                                <div class="text-[10px] text-slate-400 font-normal">성적 미산출<br>(지필평가 미실시)</div>
                            </td>
                        `;
                    }
                    // rowIdx > 0일 때는 rowspan 병합에 의해 td 생략
                } else {
                    const sc = subObj.scores['1-1'];
                    tds += `
                        <td class="p-2 border-l border-slate-700/60 text-center">
                            ${sc ? `<div>${getAchieveBadge(sc.achieve)}</div>${sc.rawScore ? `<div class="text-[10px] text-slate-400 font-mono mt-0.5">${escapeHtml(sc.rawScore)}</div>` : ''}` : '<span class="text-slate-600">-</span>'}
                        </td>
                    `;
                }

                // 2. 나머지 학기 (1-2, 2-1, 2-2, 3-1)
                const otherSemKeys = ['1-2', '2-1', '2-2', '3-1'];
                otherSemKeys.forEach(semKey => {
                    const sc = subObj.scores[semKey];
                    tds += `
                        <td class="p-2 border-l border-slate-700/60 text-center">
                            ${sc ? `<div>${getAchieveBadge(sc.achieve)}</div>${sc.rawScore ? `<div class="text-[10px] text-slate-400 font-mono mt-0.5">${escapeHtml(sc.rawScore)}</div>` : ''}` : '<span class="text-slate-600">-</span>'}
                        </td>
                    `;
                });

                matrixRows += `
                    <tr class="hover:bg-slate-800/40 border-b border-slate-700/40">
                        <td class="p-2.5 font-bold text-white text-left pl-3">${escapeHtml(subObj.displayName)}</td>
                        ${tds}
                    </tr>
                `;
            });
        }

        // 2. 출결 및 봉사 파싱
        let attObj = {};
        if (data.attendanceRaw) {
            try { attObj = JSON.parse(data.attendanceRaw); } catch (e) { }
        }
        let volObj = {};
        if (data.volunteerRaw) {
            try { volObj = JSON.parse(data.volunteerRaw); } catch (e) { }
        }

        // 출결 일수 종합 집계
        let totalAbsence = attObj['absence'] || attObj['absent'] || (Number(attObj['1_absence'] || 0) + Number(attObj['2_absence'] || 0) + Number(attObj['3_absence'] || 0));
        let totalLate = attObj['late'] || (Number(attObj['1_late'] || 0) + Number(attObj['2_late'] || 0) + Number(attObj['3_late'] || 0));
        let totalEarly = attObj['early'] || (Number(attObj['1_early'] || 0) + Number(attObj['2_early'] || 0) + Number(attObj['3_early'] || 0));
        let totalResult = attObj['result'] || (Number(attObj['1_result'] || 0) + Number(attObj['2_result'] || 0) + Number(attObj['3_result'] || 0));

        modalEl.innerHTML = `
            <div class="glass-card print-document p-6 md:p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto space-y-6">
                <!-- 헤더 -->
                <div class="flex items-center justify-between border-b border-slate-700/50 pb-4">
                    <div>
                        <h2 class="text-2xl font-black text-white flex items-center gap-2">
                            <span>📄</span> ${escapeHtml(classNum)}반 ${escapeHtml(studentNum)}번 <span class="text-primary font-bold">${escapeHtml(name)}</span> 종합 성적표
                        </h2>
                        <p class="text-xs text-text-muted mt-1">나이스 생활기록부 교과 성적(전학년) 및 출결·봉사활동 상세 내역</p>
                    </div>
                    <div class="flex items-center gap-2 no-print">
                        <button id="printTranscriptBtn" class="btn-secondary text-xs px-3 py-1.5 font-bold flex items-center gap-1">
                            <span>🖨️</span> 성적표 인쇄
                        </button>
                        <button id="closeTranscriptBtn" class="text-slate-400 hover:text-white p-2 text-xl font-bold bg-transparent border-none cursor-pointer">✕</button>
                    </div>
                </div>

                <!-- 1. 종합 내신 지표 카드 -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-center">
                        <div class="text-xs text-text-muted mb-1">전과목 평균 성취도</div>
                        <div class="text-xl font-bold text-primary">${data.allAverage.toFixed(2)} <span class="text-xs text-slate-400 font-normal">/ 5.0</span></div>
                    </div>
                    <div class="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-center">
                        <div class="text-xs text-text-muted mb-1">전교 석차</div>
                        <div class="text-xl font-bold text-white">${data.rank}등 <span class="text-xs text-slate-400 font-normal">/ ${data.totalStudents}명</span></div>
                    </div>
                    <div class="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-center">
                        <div class="text-xs text-text-muted mb-1">석차 백분율</div>
                        <div class="text-xl font-bold text-indigo-300">${data.percentile.toFixed(2)}%</div>
                    </div>
                    <div class="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-center">
                        <div class="text-xs text-text-muted mb-1">후기 일반고 판정</div>
                        <div class="text-sm font-bold ${data.percentile <= 80 ? 'text-success' : (data.percentile <= 90 ? 'text-warning' : 'text-danger')}">
                            ${data.percentile <= 80 ? '🟢 합격 안정' : (data.percentile <= 90 ? '🟡 경계선' : '🔴 지원 주의')}
                        </div>
                    </div>
                </div>

                <!-- 2. 전학년 전과목 교과 성적표 (나이스 표준 매트릭스) -->
                <div class="space-y-2">
                    <div class="flex items-center justify-between flex-wrap gap-2">
                        <h3 class="text-sm font-bold text-white flex items-center gap-1.5">
                            <span>📚</span> 전학년 학기별 교과 성적 매트릭스
                        </h3>
                        <span class="text-[11px] text-slate-400 font-mono">성취도(원점수/과목평균)</span>
                    </div>
                    <div class="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-900/40 custom-scrollbar">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead class="sticky top-0 bg-slate-800 border-b border-slate-700/70 text-text-muted text-center z-10 text-xs">
                                <tr>
                                    <th rowspan="2" class="p-2.5 text-left pl-3.5 w-28 border-r border-slate-700/60 bg-slate-800">교과목</th>
                                    <th colspan="2" class="p-2 border-r border-slate-700/60 bg-slate-800/95 text-slate-200 font-bold">1학년</th>
                                    <th colspan="2" class="p-2 border-r border-slate-700/60 bg-slate-800/95 text-slate-200 font-bold">2학년</th>
                                    <th class="p-2 bg-slate-800/95 text-slate-200 font-bold">3학년</th>
                                </tr>
                                <tr class="text-[11px] border-t border-slate-700/50 text-slate-400">
                                    <th class="p-1.5 w-28 border-r border-slate-700/60 ${is1_1FreeSemester ? 'bg-indigo-950/40 text-indigo-300 font-bold' : ''}">
                                        1학기
                                    </th>
                                    <th class="p-1.5 w-28 border-r border-slate-700/60">2학기</th>
                                    <th class="p-1.5 w-28 border-r border-slate-700/60">1학기</th>
                                    <th class="p-1.5 w-28 border-r border-slate-700/60">2학기</th>
                                    <th class="p-1.5 w-28">1학기</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${matrixRows}
                            </tbody>
                        </table>
                    </div>
                    ${is1_1FreeSemester ? `
                        <div class="p-2 rounded-lg bg-indigo-950/20 border border-indigo-500/20 text-[11px] flex items-center gap-1.5 text-indigo-300">
                            <span class="text-sm">ℹ️</span>
                            <span>1학년 1학기는 교육과정상 <strong>자유학기제</strong>로 운영되어 지필 성적이 산출되지 않으며, 고입 내신성적 산출에서 제외됩니다.</span>
                        </div>
                    ` : ''}
                </div>

                <!-- 3. 비교과 (출결 및 봉사) 요약 -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div class="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2">
                        <h4 class="font-bold text-indigo-300 flex items-center gap-1">
                            <span>📅</span> 출결 상황 요약
                        </h4>
                        <div class="grid grid-cols-4 gap-2 text-center pt-2">
                            <div class="p-2 rounded bg-slate-900/60 border border-slate-700/40">
                                <div class="text-[10px] text-text-muted">미인정 결석</div>
                                <div class="text-sm font-bold text-danger mt-1">${totalAbsence}일</div>
                            </div>
                            <div class="p-2 rounded bg-slate-900/60 border border-slate-700/40">
                                <div class="text-[10px] text-text-muted">미인정 지각</div>
                                <div class="text-sm font-bold text-warning mt-1">${totalLate}회</div>
                            </div>
                            <div class="p-2 rounded bg-slate-900/60 border border-slate-700/40">
                                <div class="text-[10px] text-text-muted">미인정 조퇴</div>
                                <div class="text-sm font-bold text-warning mt-1">${totalEarly}회</div>
                            </div>
                            <div class="p-2 rounded bg-slate-900/60 border border-slate-700/40">
                                <div class="text-[10px] text-text-muted">미인정 결과</div>
                                <div class="text-sm font-bold text-warning mt-1">${totalResult}회</div>
                            </div>
                        </div>
                    </div>

                    <div class="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2">
                        <h4 class="font-bold text-emerald-300 flex items-center gap-1">
                            <span>🕒</span> 봉사활동 실적 요약
                        </h4>
                        <div class="flex items-center justify-between p-3 rounded bg-slate-900/60 border border-slate-700/40 mt-2">
                            <div>
                                <div class="text-xs text-text-muted">나이스 인정 총 봉사시간</div>
                                <div class="text-[10px] text-slate-400 mt-0.5">학교 교육계획 및 개인봉사 합산</div>
                            </div>
                            <div class="text-xl font-black text-emerald-300">
                                ${volObj['total_time'] || 0} <span class="text-xs font-normal text-slate-400">시간</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('closeTranscriptBtn').addEventListener('click', () => modalEl.remove());
        document.getElementById('printTranscriptBtn').addEventListener('click', () => printOnly('transcript'));
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) modalEl.remove();
        });

        // 자유학기 P 과목 접기/펼치기 토글
        const togglePBtn = document.getElementById('togglePassSubjectsBtn');
        const pContainer = document.getElementById('passSubjectsContainer');
        if (togglePBtn && pContainer) {
            togglePBtn.addEventListener('click', () => {
                const isHidden = pContainer.classList.contains('hidden');
                if (isHidden) {
                    pContainer.classList.remove('hidden');
                    togglePBtn.textContent = `자유학기(P) 접기 ▲`;
                } else {
                    pContainer.classList.add('hidden');
                    togglePBtn.textContent = `자유학기(P) 과목 보기 (${passSubjectCount}) ▼`;
                }
            });
        }

    } catch (err) {
        modalEl.innerHTML = `
            <div class="glass-card p-8 w-full max-w-md text-center">
                <div class="text-danger text-4xl mb-3">⚠️</div>
                <div class="text-white font-bold mb-4">성적표를 불러오지 못했습니다</div>
                <div class="text-text-muted text-sm mb-6">${escapeHtml(String(err))}</div>
                <button type="button" class="btn-secondary w-full" id="closeTranscriptErrBtn">닫기</button>
            </div>
        `;
        modalEl.querySelector('#closeTranscriptErrBtn')?.addEventListener('click', () => modalEl.remove());
    }
}

// ===== 학생 개인 진학상담 종합 모달 =====
window.openStudentModal = openStudentModal;
window.openMatrixModal = openMatrixModal;

async function openStudentModal(classNum, studentNum, name) {
    // 기존 모달 제거
    document.getElementById('studentDetailModal')?.remove();

    // 로딩 모달 표시
    const modalEl = document.createElement('div');
    modalEl.id = 'studentDetailModal';
    modalEl.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modalEl.innerHTML = `
        <div class="glass-card p-8 w-full max-w-4xl text-center">
            <span class="spinner"></span> <span class="text-white ml-2">${escapeHtml(name)} 학생의 고교별 산출 데이터를 분석하는 중...</span>
        </div>
    `;
    document.body.appendChild(modalEl);

    try {
        const [fullData, cutoffs, official, directApps] = await Promise.all([
            window.go.main.App.GetStudentFullDetail(classNum, studentNum, name),
            window.go.main.App.GetCutoffs().catch(() => []),
            window.go.main.App.GetOfficialAdmissionData().catch(() => ({ items: [] })),
            window.go.main.App.GetStudentApplications ? window.go.main.App.GetStudentApplications(classNum, String(studentNum), name).catch(() => []) : Promise.resolve([]),
        ]);

        if (fullData) {
            if ((!fullData.applications || fullData.applications.length === 0) && Array.isArray(directApps) && directApps.length > 0) {
                fullData.applications = directApps;
            }
        }

        renderStudentModalContent(modalEl, classNum, studentNum, name, fullData, cutoffs, official?.items || []);
    } catch (err) {
        modalEl.innerHTML = `
            <div class="glass-card p-8 w-full max-w-md text-center">
                <div class="text-danger text-4xl mb-3">⚠️</div>
                <div class="text-white font-bold mb-4">데이터를 불러오지 못했습니다</div>
                <div class="text-text-muted text-sm mb-6">${escapeHtml(String(err))}</div>
                <button type="button" class="btn-secondary w-full" id="closeStudentDetailErrBtn">닫기</button>
            </div>
        `;
        modalEl.querySelector('#closeStudentDetailErrBtn')?.addEventListener('click', () => modalEl.remove());
    }
}

// 모달 내용 렌더링
function renderStudentModalContent(modalEl, classNum, studentNum, name, data, cutoffs, officialItems = []) {
    const todayDate = new Date().toISOString().split('T')[0];

    // 학교명 및 학과명 정규화 헬퍼 (다양한 표기법 완벽 포용)
    const normalizeSchoolName = (sch) => String(sch || '')
        .replace(/(고등학교|공업고|마이스터고|에너지고|상업고|과학고|예술고|애니원고|고)$/, '')
        .replace(/공고$/, '공')
        .replace(/\s+/g, '');
    const isSameSchool = (s1, s2) => {
        const n1 = normalizeSchoolName(s1);
        const n2 = normalizeSchoolName(s2);
        if (!n1 || !n2) return false;
        return n1 === n2 || n1.includes(n2) || n2.includes(n1);
    };
    const normalizeDept = (dept) => String(dept || '').replace(/\s+/g, '');

    // 학생별 관심학교(장바구니) 목록 로드 (모든 키 포맷 호환)
    const wishlistKey = `phgc_wishlist_${classNum}_${studentNum}`;
    const possibleKeys = [
        wishlistKey,
        `phgc_wishlist_${classNum}_${parseInt(studentNum, 10)}`,
        `phgc_wishlist_${classNum}_${String(studentNum).padStart(2, '0')}`
    ];
    let wishlist = [];
    for (const key of possibleKeys) {
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    wishlist = parsed;
                    break;
                }
            }
        } catch (_) {}
    }

    // 학교별 합격 가능성 카드 목록 생성
    let cardsHTML = '';

    data.schoolResults.forEach((r, rIdx) => {
        const isMeisterSchool = ['울산마이스터', '울산에너지', '현대공업'].some(kw => r.schoolName.includes(kw));
        const schoolCat = isMeisterSchool ? 'meister' : 'special';
        const isAlreadyWish = wishlist.some(w => isSameSchool(w.schoolName, r.schoolName));
        const officialForSchool = (officialItems || []).filter(item =>
            String(item.schoolName || '').includes(r.schoolName.substring(0, 4)) &&
            (!item.track || String(item.track).includes(r.trackName) || r.trackName.includes(String(item.track)))
        ).sort((a, b) => Number(b.admissionYear || 0) - Number(a.admissionYear || 0));
        const officialPrimary = officialForSchool.find(item => Number(item.minAcceptedScore || item.minValue || 0) > 0);
        // 해당 학교 및 전형의 학과별 커트라인 목록 찾기 (최신 연도 기준 학과별 1건씩 정돈)
        const rawDepts = (cutoffs || []).filter(c =>
            c.schoolName.includes(r.schoolName.substring(0, 4)) &&
            (c.track.includes(r.trackName) || r.trackName.includes(c.track)) &&
            c.department && c.department !== '공통' && c.minValue > 0
        ).sort((a, b) => b.year - a.year || a.department.localeCompare(b.department, 'ko'));

        // 학과별로 가장 최신 연도의 데이터만 1건씩 보존하여 드롭다운 중복 제거
        const deptMap = new Map();
        rawDepts.forEach(c => {
            const dNorm = normalizeDept(c.department);
            if (!deptMap.has(dNorm)) {
                deptMap.set(dNorm, c);
            }
        });
        const deptsForSchool = [...deptMap.values()].sort((a, b) => a.department.localeCompare(b.department, 'ko'));

        let defaultCutoff = null;
        let defaultAvg = null;
        const sameSchoolTrack = (c) =>
            c.schoolName.includes(r.schoolName.substring(0, 4)) &&
            (c.track.includes(r.trackName) || r.trackName.includes(c.track)) &&
            c.minValue > 0;

        // 연도별로 한 건만 표시한다. 학과 자료가 없던 해에는 "학교 전체" 값을
        // 우선 사용하므로, 원서대장에 학과가 없는 학교도 추세에 포함된다.
        const historyByYear = new Map();
        (cutoffs || []).filter(sameSchoolTrack).sort((a, b) => {
            const aWhole = !a.department || a.department === '공통' ? 0 : 1;
            const bWhole = !b.department || b.department === '공통' ? 0 : 1;
            return b.year - a.year || aWhole - bWhole;
        }).forEach(c => {
            if (!historyByYear.has(c.year)) historyByYear.set(c.year, c);
        });
        const cutoffHistory = [...historyByYear.values()].sort((a, b) => b.year - a.year).slice(0, 5);
        const averageMin = (count) => {
            const values = cutoffHistory.slice(0, count).map(c => c.minValue);
            return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
        };
        const recent3Average = averageMin(3);
        const recent5Average = averageMin(5);

        // 합격 기준선 우선순위:
        // 1순위: 교사가 수기 입력한 우리 학교 학과별 커트라인
        // 2순위: 교사가 수기 입력한 우리 학교 전체(공통) 커트라인
        // 3순위: 고교 공식 발표 입결 데이터 (학교 데이터가 없을 때 보완)
        if (deptsForSchool.length > 0) {
            defaultCutoff = deptsForSchool[0].minValue;
            defaultAvg = deptsForSchool[0].avgValue;
        } else {
            const found = (cutoffs || []).find(c => c.schoolName.includes(r.schoolName.substring(0, 4)) && c.track.includes(r.trackName) && c.minValue > 0);
            if (found) {
                defaultCutoff = found.minValue;
                defaultAvg = found.avgValue;
            } else if (officialPrimary) {
                defaultCutoff = Number(officialPrimary.minAcceptedScore || officialPrimary.minValue);
                defaultAvg = Number(officialPrimary.avgAcceptedScore || officialPrimary.avgValue || 0);
            }
        }

        // 합격 가능성 판단 헬퍼
        const getCutoffBadgeAndGauge = (cutoffVal) => {
            let badge = '';
            let color = 'bg-primary';
            let pct = (r.totalScore / r.totalMax) * 100;
            if (cutoffVal && cutoffVal > 0) {
                if (r.totalScore >= cutoffVal + 5) {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-success/20 text-success border border-success/30">🟢 안정권</span>';
                    color = 'bg-success';
                } else if (r.totalScore >= cutoffVal) {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-warning/20 text-warning border border-warning/30">🟡 적정/경계</span>';
                    color = 'bg-warning';
                } else {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-danger/20 text-danger border border-danger/30">🔴 소신/주의</span>';
                    color = 'bg-danger';
                }
            } else {
                badge = `<span class="text-xs text-text-muted">만점의 ${pct.toFixed(1)}%</span>`;
            }
            return { badge, color, pct };
        };

        const { badge: initialBadge, color: initialColor, pct: initialPct } = getCutoffBadgeAndGauge(defaultCutoff);

        // 가중치 과목 상세 텍스트
        let weightDetailText = '';
        if (r.weightedDetails && Object.keys(r.weightedDetails).length > 0) {
            const parts = [];
            for (let [sub, pts] of Object.entries(r.weightedDetails)) {
                parts.push(`${sub} ${pts.toFixed(1)}점`);
            }
            weightDetailText = `<span class="text-slate-400 text-xs">(${parts.join(', ')})</span>`;
        }

        const hasRegisteredWish = (wishlist && wishlist.length > 0) || (data.applications || []).some(a => a.schoolName && a.schoolName.trim());
        const isMatchedSchool = isAlreadyWish || (data.applications || []).some(a => a.schoolName && isSameSchool(a.schoolName, r.schoolName));
        // 장바구니/희망학교가 등록된 학생: 등록된 학교만 인쇄, 아예 등록 안 한 학생: 전체 학교 인쇄
        let schoolPrintClass = '';
        if (hasRegisteredWish) {
            schoolPrintClass = isMatchedSchool ? 'counsel-print-target-school' : 'counsel-print-unregistered-school';
        } else {
            schoolPrintClass = 'counsel-print-target-school';
        }

        cardsHTML += `
            <div class="p-4 rounded-xl bg-slate-800/70 border border-slate-700/70 space-y-2.5 school-counsel-card ${schoolPrintClass}" id="card_${rIdx}"
                 data-school="${escapeAttr(r.schoolName)}"
                 data-track="${escapeAttr(r.trackName)}"
                 data-score="${r.totalScore}"
                 data-max="${r.totalMax}"
                 data-last-cutoff="${defaultCutoff || 0}"
                 data-last-avg="${defaultAvg || 0}"
                 data-avg3-cutoff="${recent3Average ? recent3Average.toFixed(2) : 0}"
                 data-avg5-cutoff="${recent5Average ? recent5Average.toFixed(2) : 0}"
                 data-history-count="${cutoffHistory.length}">
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-white text-base">${r.schoolName}</span>
                        <span class="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-semibold">${r.trackName}전형</span>
                    </div>
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <button type="button" class="btn-toggle-wishlist px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${isAlreadyWish ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm' : 'bg-slate-800 text-slate-300 border-slate-600 hover:text-white hover:border-slate-500'}"
                                data-school="${escapeAttr(r.schoolName)}" data-track="${escapeAttr(r.trackName)}" data-score="${r.totalScore}" data-max="${r.totalMax}" data-cat="${schoolCat}" data-card="${rIdx}">
                            <span>${isAlreadyWish ? '⭐' : '☆'}</span> <span class="wishlist-btn-text">${isAlreadyWish ? '관심 등록됨' : '관심 담기'}</span>
                        </button>
                        <button type="button" class="btn-direct-apply px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                                data-school="${escapeAttr(r.schoolName)}" data-track="${escapeAttr(r.trackName)}" data-score="${r.totalScore}" data-cat="${schoolCat}" title="해당 학교로 희망원서 자동 입력">
                            <span>📝</span> 희망입력
                        </button>
                        <div id="badge_${rIdx}">${initialBadge}</div>
                    </div>
                </div>

                <!-- 학과별 커트라인 선택 드롭다운 (최신 연도 기준 학과별 깔끔 표기) -->
                ${deptsForSchool.length > 0 ? `
                <div class="flex items-center justify-between bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-700/50 text-xs">
                    <span class="text-indigo-200 font-bold flex items-center gap-1">🎯 목표 학과:</span>
                    <select class="dept-selector bg-slate-800 text-white font-bold border border-slate-600 rounded px-2 py-1 outline-none cursor-pointer"
                            data-card="${rIdx}" data-score="${r.totalScore}" data-max="${r.totalMax}">
                        ${deptsForSchool.map((d, dIdx) => `
                            <option value="${d.minValue}" data-avg="${d.avgValue || 0}" ${dIdx === 0 ? 'selected' : ''}>
                                ${d.department} (${d.year}년 · 최저: ${d.minValue}점${d.avgValue > 0 ? `, 평균: ${d.avgValue}점` : ''})
                            </option>
                        `).join('')}
                    </select>
                </div>
                ` : ''}

                ${officialForSchool.length > 0 ? `
                <div class="text-[11px] text-cyan-100 bg-cyan-950/30 px-3 py-2 rounded-lg border border-cyan-500/30 space-y-1">
                    <div class="font-bold text-cyan-300">📘 공식·교육청 공개자료 <span class="font-normal text-slate-400">(읽기 전용)</span></div>
                    ${officialForSchool.slice(0, 3).map(item => `<div>${item.admissionYear || '-'}학년도 · ${item.department || '학교 전체'} · ${item.track || r.trackName}${Number(item.maxAcceptedScore || 0) > 0 ? ` · 최고합격 ${Number(item.maxAcceptedScore)}점` : ''}${Number(item.minAcceptedScore || item.minValue || 0) > 0 ? ` · 최저합격 ${Number(item.minAcceptedScore || item.minValue)}점` : ''}${Number(item.avgAcceptedScore || item.avgValue || 0) > 0 ? ` · 평균합격 ${Number(item.avgAcceptedScore || item.avgValue)}점` : ''}<span class="text-slate-400"> · 출처: ${item.source || '-'} · 확인: ${item.verifiedAt || '-'}</span></div>`).join('')}
                </div>` : ''}

                ${cutoffHistory.length > 0 ? `
                <div class="text-[11px] text-slate-300 bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-700/40 space-y-1">
					<div class="font-bold text-violet-200">🏫 우리 학교 누적 결과 <span class="font-normal text-slate-400">(수기 입력·합격자 결과)</span></div>
					<div><span class="font-bold text-indigo-200">연도별 합격선:</span>
					${cutoffHistory.map((c, index) => `<span class="ml-2 ${index === 0 ? 'text-emerald-300 font-bold' : ''}">${c.year} ${c.department || '학교 전체'} ${c.minValue}점</span>`).join('')}</div>
					<div class="text-slate-400">직전 ${cutoffHistory[0].year}학년도 ${cutoffHistory[0].minValue}점 · 최근 ${Math.min(3, cutoffHistory.length)}년 평균 ${recent3Average.toFixed(2)}점${cutoffHistory.length >= 4 ? ` · 최근 ${Math.min(5, cutoffHistory.length)}년 평균 ${recent5Average.toFixed(2)}점` : ''}</div>
				</div>` : ''}

                <div class="flex items-baseline justify-between">
                    <div class="text-xs text-text-muted">
                        교과 ${r.allSubjectScore.toFixed(1)}${r.weightedScore > 0 ? ` + 가중치 ${r.weightedScore.toFixed(1)}` : ''} 
                        | 출결 ${r.attendanceScore.toFixed(1)} | 봉사 ${r.volunteerScore.toFixed(1)}
                        ${r.leadershipMax > 0 ? ` | 리더십 ${r.leadershipScore.toFixed(1)}` : ''}
                        ${weightDetailText}
                    </div>
                    <div class="text-lg font-black text-white">
                        ${r.totalScore.toFixed(2)} <span class="text-xs text-slate-400 font-normal">/ ${r.totalMax}점</span>
                    </div>
                </div>

                <!-- 게이지 바 -->
                <div class="gauge-bg w-full bg-slate-700/50 rounded-full h-2.5 overflow-hidden">
                    <div id="gauge_${rIdx}" class="gauge-fill ${initialColor} h-2.5 rounded-full transition-all duration-500" style="width: ${Math.min(100, Math.max(5, initialPct))}%;"></div>
                </div>

                <div id="diff_${rIdx}" class="flex justify-between text-[11px] text-slate-400 pt-0.5">
                    ${defaultCutoff ? `
                    <span>합격 기준선(최저): <strong class="text-slate-200">${defaultCutoff}점</strong> ${defaultAvg > 0 ? `<span class="text-amber-300 font-medium">(평균 ${defaultAvg}점)</span>` : ''}</span>
                    <span>점수차: <strong class="${r.totalScore >= defaultCutoff ? 'text-success' : 'text-danger'}">${(r.totalScore - defaultCutoff) >= 0 ? '+' : ''}${(r.totalScore - defaultCutoff).toFixed(2)}점</strong></span>
                    ` : '<span class="text-slate-500">※ 등록된 커트라인 점수가 없습니다.</span>'}
                </div>
            </div>
        `;
    });

    const extra = data.extraData || {};

    // 학생 관심학교(장바구니) HTML 생성 헬퍼
    const renderWishlistHTML = (list) => {
        if (!list || list.length === 0) {
            return `
                <div class="p-3.5 rounded-xl bg-slate-900/60 border border-dashed border-indigo-500/30 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <span class="text-base">📌</span>
                    <span>아직 등록된 관심학교가 없습니다. 아래 학교 목록에서 <strong class="text-amber-300">[⭐ 관심 담기]</strong>를 누르면 여기에 추가되며, <strong class="text-indigo-300">[📝 희망학교 입력]</strong>으로 지원서에 1초 만에 자동 등록됩니다.</span>
                </div>
            `;
        }

        const itemsHTML = list.map(item => `
            <div class="p-3 rounded-xl bg-slate-800/90 border border-indigo-500/40 shadow-sm flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap hover:border-indigo-400/60 transition-all">
                <div class="space-y-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-bold text-white text-sm flex items-center gap-1.5">
                            <span class="text-amber-300">⭐</span> ${escapeHtml(item.schoolName)}
                        </span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/40 font-semibold">
                            ${escapeHtml(item.trackName)}전형
                        </span>
                        <span class="text-xs">${item.badgeHTML || ''}</span>
                    </div>
                    <div class="text-xs text-slate-300 flex items-center gap-2">
                        <span>내신 환산점: <strong class="text-emerald-300 font-mono">${Number(item.totalScore).toFixed(2)}</strong> <span class="text-slate-500">/ ${item.totalMax}점</span></span>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0 ml-auto sm:ml-0">
                    <button type="button" class="btn-primary text-xs px-3 py-1.5 font-bold flex items-center gap-1 shadow-sm btn-wishlist-apply cursor-pointer"
                            data-school="${escapeAttr(item.schoolName)}" data-track="${escapeAttr(item.trackName)}" data-cat="${escapeAttr(item.category || 'meister')}" data-score="${item.totalScore}" data-max="${item.totalMax}" title="해당 학교 정보로 희망원서 자동 등록창 열기">
                        <span>📝</span> 희망학교 입력
                    </button>
                    <button type="button" class="p-1.5 text-xs text-slate-400 hover:text-danger rounded hover:bg-slate-700/50 transition-colors btn-wishlist-remove cursor-pointer"
                            data-school="${escapeAttr(item.schoolName)}" data-track="${escapeAttr(item.trackName)}" title="관심학교에서 제거">
                        ✕
                    </button>
                </div>
            </div>
        `).join('');

        return `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                ${itemsHTML}
            </div>
        `;
    };

    modalEl.innerHTML = `
        <div class="glass-card print-document p-6 md:p-8 w-full max-w-6xl max-h-[92vh] overflow-y-auto space-y-6 print-modal relative" id="printReportArea">
            <!-- 모달 헤더 (스크롤 시에도 우측 상단에 고정되어 창 닫기 버튼이 항상 보임) -->
            <div class="sticky -top-6 md:-top-8 -mx-6 md:-mx-8 px-6 md:px-8 py-3.5 bg-slate-900/95 backdrop-blur-md z-40 border-b border-slate-700/80 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap shadow-lg">
                <div class="min-w-0">
                    <h2 class="text-2xl font-black text-white flex items-center gap-2 truncate">
                        👨‍🎓 ${escapeHtml(name)} <span class="text-base text-slate-400 font-normal">(${escapeHtml(classNum)}반 ${escapeHtml(studentNum)}번)</span>
                    </h2>
                    <p class="text-xs text-text-muted mt-0.5">울산 특목·마이스터·특성화고 진학 상담 분석표 (3-1 누적)</p>
                </div>
                <div class="flex items-center gap-2.5 no-print shrink-0 flex-nowrap">
                    <label class="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-xl border border-slate-700 select-none transition-all h-9 whitespace-nowrap" title="체크 시 상담 일지 메모 내용도 함께 인쇄됩니다">
                        <input type="checkbox" id="printIncludeCounselCheck" class="rounded accent-indigo-500 cursor-pointer w-4 h-4" />
                        <span class="font-medium">상담 메모 포함</span>
                    </label>
                    <button id="printReportBtn" class="px-4 h-9 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all cursor-pointer whitespace-nowrap active:scale-95">
                        <span>🖨️</span> <span>인쇄 / PDF</span>
                    </button>
                    <button id="closeModalBtn" class="px-3.5 h-9 rounded-xl font-bold text-xs bg-rose-950/80 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/50 shadow-md shadow-rose-950/40 transition-all cursor-pointer flex items-center justify-center whitespace-nowrap active:scale-95" title="상담 모달 닫기 (단축키: ESC)">
                        <span class="text-base font-black">✕</span> <span class="ml-1 font-bold">창 닫기</span>
                    </button>
                </div>
            </div>

            <!-- 1. 기본 성적 요약 카드 -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">전과목 평균 성취도</div>
                    <div class="text-xl font-bold text-primary">${data.allAverage.toFixed(2)} <span class="text-xs text-slate-400 font-normal">/ 5.0</span></div>
                </div>
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">미인정 출결 (1학기)</div>
                    <div class="text-xl font-bold ${data.absenceDays > 0 ? 'text-danger' : 'text-success'}">
                        ${data.absenceDays}일 <span class="text-[11px] text-slate-400 font-normal">(결석${data.rawAbsenceDays || 0}일, 기타${(data.rawLateCount || 0) + (data.rawEarlyCount || 0) + (data.rawResultCount || 0)}회)</span>
                    </div>
                </div>
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">인정 봉사시간</div>
                    <div class="text-xl font-bold text-white">${data.totalVolunteerHours}시간 <span class="text-[11px] text-slate-400 font-normal">(기본${data.volunteerHours}+추가${data.addVolunteerHours})</span></div>
                </div>
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">후기 일반고 내신 / 석차백분율</div>
                    <div class="text-xl font-bold ${data.generalHSPercentile <= (window.generalGuideCutoff || 80) ? 'text-success' : (data.generalHSPercentile <= (window.generalGuideCutoff || 80) + 10 ? 'text-warning' : 'text-danger')}">${data.generalHSTotalScore.toFixed(2)}점 <span class="text-[10px] font-normal text-amber-300">${data.generalHSProjected ? '예상' : '확정'}</span></div>
                    <div class="text-[11px] text-slate-400">교과 ${data.generalHSAcademicScore.toFixed(2)} / 비교과 ${data.generalHSNonAcademicScore.toFixed(2)} · ${data.generalHSPercentile.toFixed(2)}%</div>
                </div>
            </div>

            <!-- 2. 수기 입력 가산점 및 리더십 영역 (출결·봉사는 나이스 자동 산출) -->
            ${(() => {
            const isViewer = window.currentUser && window.currentUser.Role === 'viewer';

            return `
                <div class="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 space-y-3 non-academic-input-section no-print">
                    <div class="flex items-center justify-between flex-wrap gap-2">
                        <div class="flex items-center gap-2">
                            <span class="text-base">✏️</span>
                            <div>
                                <h3 class="font-bold text-sm text-indigo-200 flex items-center gap-2">
                                    전형별 가산점 및 리더십 수기 입력
                                    ${isViewer ? '<span class="text-[11px] text-warning font-normal">※ 진로부장은 조회 전용 모드입니다.</span>' : ''}
                                </h3>
                                <p class="text-[11px] text-slate-400 mt-0.5">출결 및 봉사점수는 <strong>나이스 공식 데이터에서 100% 자동 산출</strong>되므로 별도 입력이 필요 없습니다.</p>
                            </div>
                        </div>
                        ${!isViewer ? `
                        <button id="saveExtraBtn" class="px-4 h-9 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all cursor-pointer whitespace-nowrap active:scale-95 no-print">
                            <span>💾</span> <span>저장 후 재계산</span>
                        </button>
                        ` : ''}
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                        <!-- ① 마이스터고 리더십 가산점 -->
                        <section class="bg-slate-900/70 p-3.5 rounded-xl border border-indigo-500/30 space-y-2">
                            <div class="flex items-center justify-between">
                                <b class="text-indigo-200 text-sm flex items-center gap-1.5">
                                    <span>🏛️</span> 마이스터고 리더십 활동 가산점
                                </b>
                                <span class="text-[11px] text-amber-300 font-semibold">최대 10점</span>
                            </div>
                            <div class="flex items-center gap-3 pt-1">
                                <label class="text-slate-300 font-medium whitespace-nowrap">인정 리더십(학기):</label>
                                <div class="relative w-32">
                                    <input type="number" id="inputLeadershipTerms" min="0" max="4" step="1"
                                           class="input-field w-full text-center py-1.5 text-sm font-bold text-amber-300"
                                           value="${data.leadershipTerms || 0}" ${isViewer ? 'disabled' : ''}/>
                                    <span class="absolute right-2.5 top-2 text-[11px] text-slate-400 pointer-events-none">학기</span>
                                </div>
                                <span class="text-xs text-slate-400">= 가산점 <strong class="text-amber-300 font-mono">${Math.min(10, ((data.leadershipTerms || 0) * 2.5)).toFixed(1)}</strong>점</span>
                            </div>
                            <p class="text-[10px] text-slate-400 mt-1">※ 반장·부반장·전교 학생회장·부회장 활동만 인정 (한 학기당 2.5점, 최대 4학기 10점)</p>
                        </section>

                        <!-- ② 후기 일반고 비교과 가산점 -->
                        <section class="bg-slate-900/70 p-3.5 rounded-xl border border-emerald-500/30 space-y-2">
                            <div class="flex items-center justify-between">
                                <b class="text-emerald-200 text-sm flex items-center gap-1.5">
                                    <span>🏫</span> 후기 일반고 창체·행발 가산점
                                </b>
                                <span class="text-[11px] text-emerald-300 font-semibold">각 학년당 +1점</span>
                            </div>
                            <div class="grid grid-cols-2 gap-2 pt-1">
                                <div class="rounded-lg bg-slate-800/80 border border-slate-700 p-2.5 space-y-1.5">
                                    <span class="text-[11px] font-bold text-slate-300 block">창체 활동 가산점</span>
                                    <div class="flex items-center gap-2 flex-wrap">
                                        ${[1, 2, 3].map(g => `
                                            <label class="inline-flex items-center gap-1 text-xs text-slate-200 cursor-pointer">
                                                <input type="checkbox" id="checkChangche${g}" class="accent-indigo-500 rounded cursor-pointer" ${extra['changche_' + g] ? 'checked' : ''} ${isViewer ? 'disabled' : ''}/>
                                                <span>${g}학년</span>
                                            </label>
                                        `).join('')}
                                    </div>
                                </div>
                                <div class="rounded-lg bg-slate-800/80 border border-slate-700 p-2.5 space-y-1.5">
                                    <span class="text-[11px] font-bold text-slate-300 block">행발(행동발달) 가산점</span>
                                    <div class="flex items-center gap-2 flex-wrap">
                                        ${[1, 2, 3].map(g => `
                                            <label class="inline-flex items-center gap-1 text-xs text-slate-200 cursor-pointer">
                                                <input type="checkbox" id="checkHaengbal${g}" class="accent-indigo-500 rounded cursor-pointer" ${extra['haengbal_' + g] ? 'checked' : ''} ${isViewer ? 'disabled' : ''}/>
                                                <span>${g}학년</span>
                                            </label>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                            <p class="text-[10px] text-slate-400 mt-1">※ 일반고 비교과(총 50점) 산출 시 각 해당 학년의 가산점으로 직결됩니다.</p>
                        </section>
                    </div>
                </div>
                `;
        })()}

            <!-- ⭐ 학생 희망·관심학교 장바구니 영역 (화면 상담용, 인쇄 시 자동 제외) -->
            <div id="studentWishlistSection" class="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/50 space-y-3 shadow-lg no-print">
                <div class="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-indigo-500/20">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">🛒</span>
                        <div>
                            <h3 class="font-black text-sm text-indigo-200 flex items-center gap-1.5">
                                학생 관심·희망학교 장바구니
                                <span id="wishlistCountBadge" class="text-[11px] px-2 py-0.5 rounded-full bg-indigo-600 text-white font-bold ml-1">${wishlist.length}</span>
                            </h3>
                            <p class="text-[11px] text-slate-400 mt-0.5">상담 중 목표하는 고교를 장바구니에 담고, [희망학교 입력]을 누르면 원서 서식에 자동 입력됩니다.</p>
                        </div>
                    </div>
                </div>
                <div id="wishlistContainer">
                    ${renderWishlistHTML(wishlist)}
                </div>
            </div>

            <!-- 3. 학교별 합격 가능성 리스트 -->
            <div class="space-y-3">
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <h3 class="font-bold text-sm text-white">🏫 목표 고교별 산출 점수 및 합격 가능성</h3>
                        <p class="text-[11px] text-text-muted mt-0.5">* 면접 점수를 제외한 1차 서류 전형 기준</p>
                    </div>
                    <!-- 탭 메뉴: 직전년도 / 최근 3개년 평균 / 최근 5개년 평균 (인쇄 시 제외) -->
                    <div class="flex items-center gap-2 flex-wrap no-print">
                        <span class="text-xs font-bold text-slate-300">판정 기준:</span>
                        <div class="inline-flex rounded-lg bg-slate-800 p-0.5 border border-slate-700 shadow-inner" id="cutoffBaselineTabs">
                            <button type="button" class="cutoff-tab-btn active px-3 py-1.5 text-xs font-bold rounded-md bg-primary text-white transition-all cursor-pointer" data-mode="last">
                                🎯 직전 1개년
                            </button>
                            <button type="button" class="cutoff-tab-btn px-3 py-1.5 text-xs font-bold rounded-md text-slate-400 hover:text-white transition-all cursor-pointer" data-mode="avg3">
                                📊 최근 3년 평균
                            </button>
                            <button type="button" class="cutoff-tab-btn px-3 py-1.5 text-xs font-bold rounded-md text-slate-400 hover:text-white transition-all cursor-pointer" data-mode="avg5">
                                📈 최근 5년 평균
                            </button>
                        </div>
                    </div>
                </div>

                <div class="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60 flex items-center justify-between text-xs no-print">
                    <span id="cutoffBaselineDesc" class="text-indigo-200 font-medium">🎯 <strong>직전 1개년(작년)</strong> 커트라인 및 공식 발표자료를 기준으로 합격 가능성을 판정합니다.</span>
                    <span class="text-[11px] text-slate-400">탭을 클릭하면 실시간으로 신호등·게이지가 재계산됩니다</span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3" id="schoolCardsContainer">
                    ${cardsHTML}
                </div>
            </div>

            <!-- 4. 스마트 1:1 진학 상담 일지 영역 -->
            <div class="p-5 rounded-2xl bg-indigo-950/25 border border-indigo-500/40 space-y-4 shadow-xl counsel-section-container">
                <div class="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-indigo-500/20">
                    <div>
                        <h3 class="font-black text-sm text-indigo-200 flex items-center gap-2">
                            <span>📝</span> ${escapeHtml(name)} 학생 1:1 진학 상담 일지
                        </h3>
                        <p class="text-[11px] text-slate-400 mt-0.5">
                            🔒 <strong>개인 상담 비밀보장:</strong> 작성자 본인만 열람 가능하며, 관내 취합 및 인쇄 시 기본적으로 상담 메모는 100% 자동 제외됩니다.
                        </p>
                    </div>
                    <span class="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-900/60 text-indigo-300 border border-indigo-400/30 font-bold no-print">
                        로컬 독립 보안 모드
                    </span>
                </div>

                <!-- 비공개 상담 내용 (인쇄 시 체크 안하면 완전 숨김) -->
                <div class="counsel-private-content space-y-4">
                    <!-- 상담 작성 폼 -->
                    <div class="bg-slate-900/70 p-4 rounded-xl border border-slate-700/70 space-y-3 no-print">
                        <input type="hidden" id="counselRecordId" value="0" />
                        <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                            <div class="sm:col-span-4">
                                <label class="block text-xs font-bold text-slate-300 mb-1">상담 날짜</label>
                                <input type="date" id="counselDateInput" class="input-field w-full text-xs font-mono font-bold text-indigo-200 py-1.5" value="${todayDate}" required />
                            </div>
                            <div class="sm:col-span-8">
                                <label class="block text-xs font-bold text-slate-300 mb-1">상담 목표/관련 고교 (선택)</label>
                                <input type="text" id="counselTargetSchoolInput" class="input-field w-full text-xs py-1.5" placeholder="예: 울산에너지고 신재생에너지과, 일반고 등" />
                            </div>
                        </div>

                        <!-- 스마트 빠른 태그 바 -->
                        <div>
                            <div class="text-[11px] text-slate-400 font-semibold mb-1 flex items-center gap-1">
                                <span>⚡</span> 스마트 빠른 태그 (클릭 시 내용에 자동 추가):
                            </div>
                            <div class="flex flex-wrap gap-1.5" id="counselQuickTags">
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-500/40 font-medium transition-all cursor-pointer" data-tag="[마이스터고 희망] ">마이스터고 희망</button>
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-500/40 font-medium transition-all cursor-pointer" data-tag="[특성화고 취업희망자전형] ">특성화 취업희망</button>
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 font-medium transition-all cursor-pointer" data-tag="[후기 일반고 안정권] ">일반고 안정권</button>
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-500/40 font-medium transition-all cursor-pointer" data-tag="[내신 추이 및 비교과 상담] ">성적·비교과 추이</button>
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-500/40 font-medium transition-all cursor-pointer" data-tag="[학부모 전화 상담 완료] ">학부모 상담</button>
                                <button type="button" class="quick-tag-btn text-[11px] py-1 px-2.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-500/40 font-medium transition-all cursor-pointer" data-tag="[원서 변경 고민 중] ">원서 변경 고민</button>
                            </div>
                        </div>

                        <!-- 상담 내용 입력창 -->
                        <div>
                            <textarea id="counselContentInput" rows="3" class="input-field w-full text-xs leading-relaxed py-2 px-3 resize-y" placeholder="학생의 진로 희망, 강점 및 약점, 학부모 상담 내용, 추천 고교 등을 자유롭게 기록하세요. (Ctrl+Enter를 누르면 바로 저장됩니다)"></textarea>
                        </div>

                        <!-- 액션 버튼 -->
                        <div class="flex items-center justify-between pt-1">
                            <span class="text-[11px] text-slate-500 font-mono">단축키: Ctrl + Enter</span>
                            <div class="flex items-center gap-2">
                                <button type="button" id="cancelCounselEditBtn" class="btn-secondary text-xs px-3 py-1.5 font-semibold hidden">수정 취소</button>
                                <button type="button" id="saveCounselBtn" class="btn-primary text-xs px-4 py-1.5 font-bold inline-flex items-center gap-1.5 shadow-md shadow-indigo-600/30 cursor-pointer">
                                    <span>💾</span> <span id="saveCounselBtnText">상담 일지 저장</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 누적 상담 타임라인 목록 -->
                    <div class="space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                                <span>📋</span> 누적 상담 이력 (<span id="counselRecordCount" class="text-indigo-400 font-bold">0</span>건)
                            </span>
                            <span class="text-[11px] text-slate-400">최신순 정렬</span>
                        </div>
                        <div id="counselRecordsList" class="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                            <div class="text-center py-6 text-slate-500 text-xs">
                                <span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> 상담 일지를 불러오는 중...
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 인쇄 전용 프라이버시 안심 요약 배너 (상담 메모 포함 시 사용) -->
                <div class="counsel-print-summary hidden border-t border-slate-300 pt-3 mt-4 text-xs text-slate-700">
                    <div class="flex items-center justify-between">
                        <span><strong>📅 진학 상담 일자:</strong> ${todayDate}</span>
                        <span class="text-slate-500 text-[11px]">※ 학생 개인정보 및 상담 상세 메모는 비공개 처리되었습니다.</span>
                    </div>
                </div>
            </div>

            <!-- 인쇄 전용 공식 상담 확인 푸터 (학부모·학생 배부용 표준 서식) -->
            <div class="counsel-official-footer hidden pt-3 border-t border-slate-400 text-xs text-slate-800">
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <span><strong>📅 진학 상담 일자:</strong> ${todayDate}</span>
                    <span><strong>상담 교사 확인:</strong> 3학년 ${escapeHtml(classNum)}반 담임 (인)</span>
                    <span><strong>학생·학부모 확인:</strong> ________________ (인)</span>
                </div>
            </div>

            <!-- 화면용 모달 하단 닫기 바 (스크롤 끝에서도 즉시 닫기 지원) -->
            <div class="pt-4 border-t border-slate-700/60 flex items-center justify-between flex-wrap gap-3 no-print">
                <div class="text-xs text-slate-400 flex items-center gap-1.5">
                    <span>💡</span> <span>키보드 <strong>ESC</strong> 키를 누르시거나 바깥 어두운 배경을 클릭하셔도 창이 닫힙니다.</span>
                </div>
                <button type="button" id="bottomCloseModalBtn" class="px-5 py-2.5 rounded-xl font-bold text-xs bg-rose-950/70 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/40 transition-all cursor-pointer flex items-center gap-1.5 shadow-md active:scale-95">
                    <span class="text-sm font-black">✕</span> <span>상담 모달 닫기 (ESC)</span>
                </button>
            </div>
        </div>
    `;

    // 상담 모달 안전 닫기 및 대시보드 자동 동기화
    const closeStudentCounselModal = () => {
        window.removeEventListener('keydown', handleEscKey);
        modalEl.remove();
        if (typeof window.refreshCurrentClass === 'function') {
            window.refreshCurrentClass();
        }
    };

    const handleEscKey = (e) => {
        if (e.key === 'Escape') {
            closeStudentCounselModal();
        }
    };
    window.addEventListener('keydown', handleEscKey);

    // 닫기 이벤트 (상단 헤더 + 하단 바)
    document.getElementById('closeModalBtn')?.addEventListener('click', closeStudentCounselModal);
    document.getElementById('bottomCloseModalBtn')?.addEventListener('click', closeStudentCounselModal);

    // 배경 클릭 시 닫기
    modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) closeStudentCounselModal();
    });

    let currentBaselineMode = 'last';

    // 기준선 탭 전환 함수 (직전 1개년 / 최근 3년 평균 / 최근 5년 평균)
    const applyBaselineMode = (mode) => {
        currentBaselineMode = mode;
        modalEl.querySelectorAll('.cutoff-tab-btn').forEach(btn => {
            const isActive = btn.dataset.mode === mode;
            btn.classList.toggle('active', isActive);
            btn.classList.toggle('bg-primary', isActive);
            btn.classList.toggle('text-white', isActive);
            btn.classList.toggle('text-slate-400', !isActive);
        });

        const descEl = document.getElementById('cutoffBaselineDesc');
        if (descEl) {
            if (mode === 'last') {
                descEl.innerHTML = '🎯 <strong>직전 1개년(작년)</strong> 커트라인 및 공식 발표자료를 기준으로 합격 가능성을 판정합니다.';
            } else if (mode === 'avg3') {
                descEl.innerHTML = '📊 <strong>최근 3개년 누적 평균선</strong>을 기준으로 합격 가능성을 판정합니다 (단년도 변동 완화).';
            } else if (mode === 'avg5') {
                descEl.innerHTML = '📈 <strong>최근 5개년 장기 평균선</strong>을 기준으로 합격 가능성을 판정합니다 (중장기 추세).';
            }
        }

        modalEl.querySelectorAll('.school-counsel-card').forEach(card => {
            const rIdx = card.id.replace('card_', '');
            const score = parseFloat(card.dataset.score);
            const totalMax = parseFloat(card.dataset.max);
            let cutoffVal = 0;
            let avgVal = 0;
            let labelText = '';

            if (mode === 'last') {
                const deptSel = card.querySelector('.dept-selector');
                if (deptSel) {
                    cutoffVal = parseFloat(deptSel.value) || 0;
                    avgVal = parseFloat(deptSel.selectedOptions[0]?.dataset.avg || 0);
                    labelText = '직전년도 최저';
                } else {
                    cutoffVal = parseFloat(card.dataset.lastCutoff) || 0;
                    avgVal = parseFloat(card.dataset.lastAvg) || 0;
                    labelText = '직전년도 최저';
                }
            } else if (mode === 'avg3') {
                cutoffVal = parseFloat(card.dataset.avg3Cutoff) || 0;
                labelText = '최근 3년 평균';
            } else if (mode === 'avg5') {
                cutoffVal = parseFloat(card.dataset.avg5Cutoff) || 0;
                labelText = '최근 5년 평균';
            }

            let badge = '';
            let color = 'bg-primary';
            let pct = (score / totalMax) * 100;

            if (cutoffVal && cutoffVal > 0) {
                if (score >= cutoffVal + 5) {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-success/20 text-success border border-success/30">🟢 안정권</span>';
                    color = 'bg-success';
                } else if (score >= cutoffVal) {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-warning/20 text-warning border border-warning/30">🟡 적정/경계</span>';
                    color = 'bg-warning';
                } else {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-danger/20 text-danger border border-danger/30">🔴 소신/주의</span>';
                    color = 'bg-danger';
                }
            } else {
                badge = `<span class="text-xs text-text-muted">만점의 ${pct.toFixed(1)}% (기준 부족)</span>`;
            }

            const badgeEl = document.getElementById(`badge_${rIdx}`);
            if (badgeEl) badgeEl.innerHTML = badge;

            const gaugeEl = document.getElementById(`gauge_${rIdx}`);
            if (gaugeEl) {
                gaugeEl.className = `gauge-fill ${color} h-2.5 rounded-full transition-all duration-500`;
                gaugeEl.style.width = `${Math.min(100, Math.max(5, pct))}%`;
            }

            const diffEl = document.getElementById(`diff_${rIdx}`);
            if (diffEl) {
                if (cutoffVal && cutoffVal > 0) {
                    const diff = score - cutoffVal;
                    diffEl.innerHTML = `
                        <span>합격 기준선(${labelText}): <strong class="text-slate-200">${cutoffVal.toFixed(1)}점</strong> ${avgVal > 0 ? `<span class="text-amber-300 font-medium">(평균 ${avgVal.toFixed(1)}점)</span>` : ''}</span>
                        <span>점수차: <strong class="${diff >= 0 ? 'text-success' : 'text-danger'}">${diff >= 0 ? '+' : ''}${diff.toFixed(2)}점</strong></span>
                    `;
                } else {
                    diffEl.innerHTML = `<span class="text-slate-500">※ 해당 기준(${labelText})의 누적 합격선 데이터가 부족합니다.</span>`;
                }
            }
        });
    };

    modalEl.querySelectorAll('.cutoff-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            applyBaselineMode(btn.dataset.mode);
        });
    });

    // 학과별 커트라인 선택 변경 이벤트 바인딩
    modalEl.querySelectorAll('.dept-selector').forEach(sel => {
        sel.addEventListener('change', () => {
            if (currentBaselineMode !== 'last') {
                applyBaselineMode('last');
            } else {
                applyBaselineMode('last');
            }
        });
    });

    // 수기 가산점 및 출결 저장 (담임 및 관리자만 가능)
    const saveBtn = document.getElementById('saveExtraBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            saveBtn.disabled = true;
            saveBtn.textContent = '저장 중...';

            const leadershipTerms = Math.min(4, Math.max(0, parseInt(document.getElementById('inputLeadershipTerms')?.value) || 0));
            const newExtra = {
                leadership_terms: leadershipTerms,
                changche_1: Boolean(document.getElementById('checkChangche1')?.checked),
                changche_2: Boolean(document.getElementById('checkChangche2')?.checked),
                changche_3: Boolean(document.getElementById('checkChangche3')?.checked),
                haengbal_1: Boolean(document.getElementById('checkHaengbal1')?.checked),
                haengbal_2: Boolean(document.getElementById('checkHaengbal2')?.checked),
                haengbal_3: Boolean(document.getElementById('checkHaengbal3')?.checked),
            };

            try {
                await window.go.main.App.SaveStudentExtra(classNum, studentNum, name, JSON.stringify(newExtra));
                const updatedData = await window.go.main.App.GetStudentFullDetail(classNum, studentNum, name);
                renderStudentModalContent(modalEl, classNum, studentNum, name, updatedData, cutoffs);
            } catch (err) {
                alert('저장 실패: ' + err);
                saveBtn.disabled = false;
                saveBtn.textContent = '💾 저장 후 재계산';
            }
        });
    }

    // 인쇄/PDF 저장
    document.getElementById('printReportBtn')?.addEventListener('click', () => {
        const printArea = document.getElementById('printReportArea');
        const includeCounsel = document.getElementById('printIncludeCounselCheck')?.checked ?? false;

        if (printArea) {
            if (includeCounsel) {
                printArea.classList.add('include-private-counsel');
            } else {
                printArea.classList.remove('include-private-counsel');
            }
        }

        // [인쇄 직전 실시간 관심/희망학교 필터링 동기화]
        // 1. 등록된 관심학교(로컬스토리지 다중키) 및 희망원서(DB 데이터 + 화면 입력값) 실시간 수집
        const registeredSchoolNames = new Set();
        for (const key of possibleKeys) {
            try {
                const raw = localStorage.getItem(key);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        parsed.forEach(w => {
                            if (w.schoolName && w.schoolName.trim()) registeredSchoolNames.add(w.schoolName.trim());
                        });
                    }
                }
            } catch (_) {}
        }

        (data.applications || []).forEach(a => {
            if (a && a.schoolName && a.schoolName.trim()) registeredSchoolNames.add(a.schoolName.trim());
        });

        modalEl.querySelectorAll('.app-school-select, .app-school-input, select[name*="school"], input[name*="school"]').forEach(el => {
            if (el.value && el.value.trim()) registeredSchoolNames.add(el.value.trim());
        });

        // 2. 등록된 관심/희망학교가 1개 이상이면 등록된 학교 카드만 남기고 나머지는 물리적으로 display: none 강제
        const allCards = modalEl.querySelectorAll('.school-counsel-card');
        if (registeredSchoolNames.size > 0) {
            allCards.forEach(card => {
                const cardSchool = card.dataset.school || card.querySelector('.font-bold.text-white')?.textContent || '';
                const isMatched = Array.from(registeredSchoolNames).some(target => isSameSchool(target, cardSchool));
                if (isMatched) {
                    card.classList.remove('counsel-print-unregistered-school');
                    card.classList.add('counsel-print-target-school');
                    card.style.removeProperty('display');
                } else {
                    card.classList.remove('counsel-print-target-school');
                    card.classList.add('counsel-print-unregistered-school');
                    card.style.setProperty('display', 'none', 'important'); // 브라우저 인쇄 엔진에서 100% 완전 제외
                }
            });

            // 인쇄 대화상자가 닫힌 후 화면에서는 원래대로 복원
            window.addEventListener('afterprint', () => {
                allCards.forEach(card => {
                    card.style.removeProperty('display');
                });
            }, { once: true });
        } else {
            // 등록된 관심학교가 전혀 없는 학생의 경우에만 전체 학교 카드 출력
            allCards.forEach(card => {
                card.classList.remove('counsel-print-unregistered-school');
                card.classList.add('counsel-print-target-school');
                card.style.removeProperty('display');
            });
        }

        printOnly('report');
    });

    // ===== 스마트 1:1 진학 상담 일지 컨트롤러 =====
    const counselDateInput = document.getElementById('counselDateInput');
    const counselTargetSchoolInput = document.getElementById('counselTargetSchoolInput');
    const counselContentInput = document.getElementById('counselContentInput');
    const counselRecordId = document.getElementById('counselRecordId');
    const saveCounselBtn = document.getElementById('saveCounselBtn');
    const saveCounselBtnText = document.getElementById('saveCounselBtnText');
    const cancelCounselEditBtn = document.getElementById('cancelCounselEditBtn');
    const counselRecordsList = document.getElementById('counselRecordsList');
    const counselRecordCount = document.getElementById('counselRecordCount');

    let currentRecords = [];

    // 1. 상담 일지 목록 불러오기 (작성자 본인 기록만 로드)
    const loadCounselRecords = async () => {
        if (!counselRecordsList) return;
        try {
            if (!window.go?.main?.App?.GetStudentCounselingRecords) {
                counselRecordsList.innerHTML = `<div class="text-center py-4 text-slate-500 text-xs">상담 일지 기능 준비 중...</div>`;
                return;
            }
            currentRecords = await window.go.main.App.GetStudentCounselingRecords(classNum, studentNum, name) || [];
            counselRecordCount.textContent = currentRecords.length;

            if (currentRecords.length === 0) {
                counselRecordsList.innerHTML = `
                    <div class="p-6 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-slate-400 space-y-1">
                        <div class="text-xl">💬</div>
                        <div class="text-xs font-semibold text-slate-300">작성된 상담 일지가 없습니다</div>
                        <div class="text-[11px] text-slate-500">학생과의 진로 희망 및 상담 내용을 위 입력창에 첫 기록으로 남겨보세요.</div>
                    </div>
                `;
                return;
            }

            counselRecordsList.innerHTML = currentRecords.map(r => `
                <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-700/70 hover:border-indigo-500/40 transition-all space-y-2 group shadow-sm">
                    <div class="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800/80">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/40 font-mono font-bold">
                                📅 ${escapeHtml(r.counselDate)}
                            </span>
                            ${r.targetSchool ? `
                                <span class="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-indigo-200 border border-slate-700 font-medium">
                                    🏫 ${escapeHtml(r.targetSchool)}
                                </span>
                            ` : ''}
                            <span class="text-[10px] text-slate-400">
                                작성: <strong class="text-slate-300">${escapeHtml(r.authorName || '본인')}</strong>
                            </span>
                        </div>
                        <div class="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                            <button type="button" class="btn-edit-counsel text-[11px] py-0.5 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer" data-id="${escapeAttr(r.id)}">
                                수정
                            </button>
                            <button type="button" class="btn-delete-counsel text-[11px] py-0.5 px-2 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-200 border border-rose-500/30 transition-colors cursor-pointer" data-id="${escapeAttr(r.id)}">
                                삭제
                            </button>
                        </div>
                    </div>
                    <div class="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed px-0.5 font-sans">
                        ${escapeHtml(r.content)}
                    </div>
                </div>
            `).join('');

            // 수정 버튼 바인딩
            counselRecordsList.querySelectorAll('.btn-edit-counsel').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = parseInt(e.currentTarget.dataset.id);
                    const record = currentRecords.find(item => item.id === id);
                    if (record) {
                        counselRecordId.value = record.id;
                        counselDateInput.value = record.counselDate;
                        counselTargetSchoolInput.value = record.targetSchool || '';
                        counselContentInput.value = record.content;
                        saveCounselBtnText.textContent = '수정 내용 저장';
                        cancelCounselEditBtn.classList.remove('hidden');
                        counselContentInput.focus();
                    }
                });
            });

            // 삭제 버튼 바인딩
            counselRecordsList.querySelectorAll('.btn-delete-counsel').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = parseInt(e.currentTarget.dataset.id);
                    const confirmed = await showModalConfirm({
                        title: '상담 일지 삭제',
                        message: '이 상담 일지를 삭제하시겠습니까?<br><span class="text-xs text-rose-400">※ 삭제 후에는 복구할 수 없습니다.</span>',
                        confirmText: '삭제',
                        type: 'warning'
                    });
                    if (!confirmed) return;
                    try {
                        await window.go.main.App.DeleteStudentCounselingRecord(classNum, id);
                        await loadCounselRecords();
                        if (typeof window.refreshCurrentClass === 'function') {
                            window.refreshCurrentClass();
                        }
                    } catch (err) {
                        await showModalAlert('삭제 실패: ' + err, '오류', 'error');
                    }
                });
            });

        } catch (err) {
            counselRecordsList.innerHTML = `<div class="p-3 text-danger text-xs text-center">상담 일지 로드 실패: ${err}</div>`;
        }
    };

    // 2. 스마트 빠른 태그 클릭 시 내용에 자동 추가
    document.getElementById('counselQuickTags')?.querySelectorAll('.quick-tag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.dataset.tag;
            if (!counselContentInput) return;
            const curVal = counselContentInput.value;
            if (!curVal.includes(tag.trim())) {
                counselContentInput.value = curVal ? (curVal + ' ' + tag) : tag;
            }
            counselContentInput.focus();
        });
    });

    // 3. 수정 취소 버튼
    cancelCounselEditBtn?.addEventListener('click', () => {
        counselRecordId.value = '0';
        counselTargetSchoolInput.value = '';
        counselContentInput.value = '';
        counselDateInput.value = todayDate;
        saveCounselBtnText.textContent = '상담 일지 저장';
        cancelCounselEditBtn.classList.add('hidden');
    });

    // 4. 저장 함수
    const handleSaveCounsel = async () => {
        const dateVal = counselDateInput.value;
        const contentVal = counselContentInput.value.trim();
        const targetSchoolVal = counselTargetSchoolInput.value.trim();
        const idVal = parseInt(counselRecordId.value) || 0;

        if (!dateVal) {
            await showModalAlert('상담 날짜를 입력해 주세요.', '입력 필요', 'warning');
            counselDateInput.focus();
            return;
        }
        if (!contentVal) {
            await showModalAlert('상담 상세 내용을 입력해 주세요.', '입력 필요', 'warning');
            counselContentInput.focus();
            return;
        }

        saveCounselBtn.disabled = true;
        saveCounselBtn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px;"></span> 저장 중...';

        try {
            const record = {
                id: idVal,
                classNum: classNum,
                studentNum: studentNum,
                studentName: name,
                counselDate: dateVal,
                targetSchool: targetSchoolVal,
                content: contentVal,
            };
            await window.go.main.App.SaveStudentCounselingRecord(record);

            // 입력 폼 리셋
            counselRecordId.value = '0';
            counselTargetSchoolInput.value = '';
            counselContentInput.value = '';
            counselDateInput.value = todayDate;
            saveCounselBtnText.textContent = '상담 일지 저장';
            cancelCounselEditBtn.classList.add('hidden');

            await loadCounselRecords();
            if (typeof window.refreshCurrentClass === 'function') {
                window.refreshCurrentClass();
            }
        } catch (err) {
            await showModalAlert('상담 일지 저장 실패: ' + err, '오류', 'error');
        } finally {
            saveCounselBtn.disabled = false;
            saveCounselBtn.innerHTML = `<span>💾</span> <span id="saveCounselBtnText">${counselRecordId.value !== '0' ? '수정 내용 저장' : '상담 일지 저장'}</span>`;
        }
    };

    saveCounselBtn?.addEventListener('click', handleSaveCounsel);

    // 단축키: Ctrl + Enter로 즉시 저장
    counselContentInput?.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSaveCounsel();
        }
    });

    // 초기 목록 자동 로드
    loadCounselRecords();

    // ===== ⭐ 관심학교 장바구니 및 희망학교 입력 원클릭 자동화 컨트롤러 =====
    const wishlistContainer = document.getElementById('wishlistContainer');
    const wishlistCountBadge = document.getElementById('wishlistCountBadge');

    const getStoredWishlist = () => {
        for (const key of possibleKeys) {
            try {
                const raw = localStorage.getItem(key);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
                }
            } catch (_) {}
        }
        return [];
    };

    const saveStoredWishlist = (list) => {
        const jsonStr = JSON.stringify(list);
        for (const key of possibleKeys) {
            try {
                localStorage.setItem(key, jsonStr);
            } catch (e) {
                console.warn('관심학교 저장 실패:', key, e);
            }
        }
    };

    const bindWishlistInnerEvents = () => {
        if (!wishlistContainer) return;

        // 1. 장바구니 내 [📝 희망학교 입력] 버튼 클릭 -> 희망학교 입력창 열고 지원학교/지원희망 자동 세팅
        wishlistContainer.querySelectorAll('.btn-wishlist-apply').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const schoolName = btn.dataset.school || '';
                const track = btn.dataset.track || '';
                const category = btn.dataset.cat || 'meister';
                const score = parseFloat(btn.dataset.score) || 0;

                openStudentApplicationModal(classNum, studentNum, name, {
                    schoolName,
                    track,
                    category,
                    score,
                    status: '지원희망'
                });
            });
        });

        // 2. 장바구니 내 [✕] 삭제 버튼 클릭
        wishlistContainer.querySelectorAll('.btn-wishlist-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const schoolName = btn.dataset.school || '';
                const track = btn.dataset.track || '';

                let list = getStoredWishlist();
                list = list.filter(item => !(item.schoolName === schoolName && item.trackName === track));
                saveStoredWishlist(list);
                updateWishlistUI();
            });
        });
    };

    const updateWishlistUI = () => {
        const currentList = getStoredWishlist();
        if (wishlistContainer) {
            wishlistContainer.innerHTML = renderWishlistHTML(currentList);
            bindWishlistInnerEvents();
        }
        if (wishlistCountBadge) {
            wishlistCountBadge.textContent = currentList.length;
        }

        // 목표 고교별 카드 목록의 [⭐ 관심 담기 / 관심 등록됨] 버튼 상태 동기화
        modalEl.querySelectorAll('.btn-toggle-wishlist').forEach(btn => {
            const sch = btn.dataset.school || '';
            const trk = btn.dataset.track || '';
            const isWish = currentList.some(w => isSameSchool(w.schoolName, sch) && w.trackName === trk);
            const textSpan = btn.querySelector('.wishlist-btn-text');
            const iconSpan = btn.querySelector('span');

            if (isWish) {
                btn.className = 'btn-toggle-wishlist px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 cursor-pointer bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm';
                if (iconSpan) iconSpan.textContent = '⭐';
                if (textSpan) textSpan.textContent = '관심 등록됨';
            } else {
                btn.className = 'btn-toggle-wishlist px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 cursor-pointer bg-slate-800 text-slate-300 border-slate-600 hover:text-white hover:border-slate-500';
                if (iconSpan) iconSpan.textContent = '☆';
                if (textSpan) textSpan.textContent = '관심 담기';
            }
        });

        // 인쇄 대상 클래스(counsel-print-target-school / counsel-print-unregistered-school) 실시간 동기화
        const hasRegistered = currentList.length > 0 || (data.applications || []).some(a => a.schoolName && a.schoolName.trim());
        modalEl.querySelectorAll('.school-counsel-card').forEach(card => {
            const sch = card.dataset.school || card.querySelector('.font-bold.text-white')?.textContent || '';
            const isMatch = currentList.some(w => isSameSchool(w.schoolName, sch)) || (data.applications || []).some(a => isSameSchool(a.schoolName, sch));
            if (hasRegistered) {
                if (isMatch) {
                    card.classList.remove('counsel-print-unregistered-school');
                    card.classList.add('counsel-print-target-school');
                } else {
                    card.classList.remove('counsel-print-target-school');
                    card.classList.add('counsel-print-unregistered-school');
                }
            } else {
                card.classList.remove('counsel-print-unregistered-school');
                card.classList.add('counsel-print-target-school');
            }
        });
    };

    // 학교 카드 목록의 [⭐ 관심 담기 / 관심 해제] 버튼 이벤트 바인딩
    modalEl.querySelectorAll('.btn-toggle-wishlist').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const schoolName = btn.dataset.school || '';
            const trackName = btn.dataset.track || '';
            const totalScore = parseFloat(btn.dataset.score) || 0;
            const totalMax = parseFloat(btn.dataset.max) || 0;
            const category = btn.dataset.cat || 'meister';
            const cardIdx = btn.dataset.card;

            // 현재 카드의 합격 가능성 신호등 뱃지 HTML 추출
            const badgeEl = document.getElementById(`badge_${cardIdx}`);
            const badgeHTML = badgeEl ? badgeEl.innerHTML : '';

            let list = getStoredWishlist();
            const existingIdx = list.findIndex(w => isSameSchool(w.schoolName, schoolName) && w.trackName === trackName);

            if (existingIdx !== -1) {
                list.splice(existingIdx, 1);
            } else {
                list.push({
                    schoolName,
                    trackName,
                    totalScore,
                    totalMax,
                    category,
                    badgeHTML,
                    addedAt: new Date().toISOString()
                });
            }
            saveStoredWishlist(list);
            updateWishlistUI();
        });
    });

    // 학교 카드 목록의 [📝 희망입력] 직행 버튼 이벤트 바인딩
    modalEl.querySelectorAll('.btn-direct-apply').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const schoolName = btn.dataset.school || '';
            const track = btn.dataset.track || '';
            const category = btn.dataset.cat || 'meister';
            const score = parseFloat(btn.dataset.score) || 0;

            // 희망원서 자동 등록 모달 즉시 실행
            openStudentApplicationModal(classNum, studentNum, name, {
                schoolName,
                track,
                category,
                score,
                status: '지원희망'
            });
        });
    });

    // 장바구니 초기 내부 이벤트 바인딩
    bindWishlistInnerEvents();
}

// ===== 전체 고교 신호등 매트릭스 모달 (단일 학급 및 전교생 종합 매트릭스 지원, 정렬/검색/학급필터 탑재) =====
async function openMatrixModal(classNum = null) {
    document.getElementById('matrixModal')?.remove();

    const initialClass = classNum ? String(classNum) : 'all';

    const modalEl = document.createElement('div');
    modalEl.id = 'matrixModal';
    modalEl.className = 'fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200';
    modalEl.innerHTML = `
        <div class="glass-card p-8 w-full max-w-[1850px] text-center">
            <span class="spinner"></span> 
            <span class="text-white ml-2">${classNum ? `${classNum}반 학생들의 신호등 매트릭스를 구성하는 중...` : '3학년 전교생의 5개년 신호등 매트릭스를 구성하는 중...'}</span>
        </div>
    `;
    document.body.appendChild(modalEl);

    try {
        let fullGrades = [];
        let classCount = 8;
        try {
            const config = await window.go.main.App.GetSchoolConfig();
            if (config?.classCount) classCount = config.classCount;
        } catch (e) {
            console.warn(e);
        }

        // 전체 학급 데이터를 일괄 로드하여 반별/전체 필터 전환을 자유롭게 지원
        const promises = [];
        for (let c = 1; c <= classCount; c++) {
            promises.push(
                window.go.main.App.GetClassFullGrades(c).catch(() => []).then(list => {
                    (list || []).forEach(s => { s.classNum = c; });
                    return list || [];
                })
            );
        }
        const allResults = await Promise.all(promises);
        fullGrades = allResults.flat();

        const cutoffs = await window.go.main.App.GetCutoffs().catch(() => []);

        // 학교 목록 정의
        const schoolKeywords = [
            { key: '마이스터', label: '울산마이스터', isMeister: true },
            { key: '에너지', label: '에너지고', isMeister: true },
            { key: '현대', label: '현대공고', isMeister: true },
            { key: '상업고', label: '울산상고', isMeister: false },
            { key: '여자상업고', label: '울산여상', isMeister: false },
            { key: '생활과학', label: '울산생과고', isMeister: false },
            { key: '공업고', label: '울산공고', isMeister: false },
            { key: '산업고', label: '울산산업고', isMeister: false },
            { key: '미용예술', label: '미용예술고', isMeister: false },
            { key: '기술공업', label: '기술공고', isMeister: false }
        ];

        // 전형별(general/special) 및 학교별 연도별 커트라인 히스토리 맵 구축
        const cutoffHistoryMap = new Map();
        schoolKeywords.forEach(s => {
            ['general', 'special'].forEach(trackType => {
                const historyByYear = new Map();
                (cutoffs || []).filter(c => {
                    if (!c.schoolName.includes(s.key) || Number(c.minValue) <= 0) return false;
                    const isSpec = c.track.includes('특별') || c.track.includes('취업');
                    return trackType === 'special' ? isSpec : !isSpec;
                }).sort((a, b) => b.year - a.year)
                  .forEach(c => {
                      if (!historyByYear.has(c.year)) {
                          historyByYear.set(c.year, Number(c.minValue));
                      }
                  });

                const sortedValues = [...historyByYear.entries()].sort((a, b) => b[0] - a[0]).map(x => x[1]);
                cutoffHistoryMap.set(`${s.key}_${trackType}`, sortedValues);
            });
        });

        // 특정 학교/전형/연도모드 기준선 계산 함수
        const getSchoolCutoffVal = (schoolKey, trackType, yearMode) => {
            const history = cutoffHistoryMap.get(`${schoolKey}_${trackType}`) || [];
            if (!history.length) return 0;
            if (yearMode === 'last') {
                return history[0] || 0;
            } else if (yearMode === 'avg3') {
                const slice3 = history.slice(0, 3);
                return slice3.length ? slice3.reduce((a, b) => a + b, 0) / slice3.length : 0;
            } else if (yearMode === 'avg5') {
                const slice5 = history.slice(0, 5);
                return slice5.length ? slice5.reduce((a, b) => a + b, 0) / slice5.length : 0;
            }
            return history[0] || 0;
        };

        // 학생의 특정 고교 환산점수 반환 헬퍼
        const getStudentSchoolScore = (student, schoolKey, trackMode) => {
            if (!student || !student.schoolResults) return 0;
            let r = null;
            if (trackMode === 'special') {
                r = student.schoolResults.find(x => x.schoolName.includes(schoolKey) && (x.trackName.includes('특별') || x.trackName.includes('취업')));
            }
            if (!r) {
                r = student.schoolResults.find(x => x.schoolName.includes(schoolKey) && x.trackName.includes('일반'));
            }
            return r ? Number(r.totalScore || 0) : 0;
        };

        // 상태 변수
        let currentYearMode = 'last';
        let currentTrackMode = 'general';
        let currentClassFilter = initialClass;
        let currentSearchQuery = '';
        let currentSortMode = 'num_asc';

        // 테이블 본문(tbody) 생성 함수 (소수 둘째자리 표기, 줄바꿈 방지, 정밀 학생 검색 적용)
        const generateTableRows = (yearMode, trackMode) => {
            let filtered = [...fullGrades];

            // 1. 학급 필터링
            if (currentClassFilter !== 'all') {
                filtered = filtered.filter(s => String(s.classNum) === String(currentClassFilter));
            }

            // 2. 검색어 정밀 필터링 (학번이나 이름 입력 시 해당 학생만 명확히 필터링)
            if (currentSearchQuery) {
                const qRaw = currentSearchQuery.trim();
                const qLower = qRaw.toLowerCase().replace(/\s+/g, '');
                const isDigitOnly = /^[0-9]+$/.test(qLower);

                filtered = filtered.filter(s => {
                    const sName = (s.name || '').replace(/\s+/g, '').toLowerCase();
                    const sNum = parseInt(s.studentNum, 10) || 0;
                    const cNum = s.classNum || 0;

                    // ① 이름 검색: 입력한 이름이 학생 이름에 포함되면 매칭
                    if (sName.includes(qLower)) return true;

                    // ② 순수 숫자 검색 (1~2자리 번호, 3~4자리 학번, 5자리 나이스 학번)
                    if (isDigitOnly) {
                        const qVal = parseInt(qLower, 10);

                        // 1~2자리 번호 (예: '1', '2', '15')
                        if (qLower.length <= 2) {
                            // 사용자가 '1'을 입력했을 때, 번호가 정확히 1인 학생만 필터링 (10~19번 섞이지 않음)
                            return sNum === qVal;
                        }

                        // 3자리 학번 (예: 101 -> 1반 1번, 215 -> 2반 15번)
                        const shortId = parseInt(`${cNum}${String(sNum).padStart(2, '0')}`, 10);
                        if (shortId === qVal) return true;

                        // 4자리 학번 (예: 3101 -> 3학년 1반 1번, 1001 -> 10반 1번)
                        const fourDigitId1 = parseInt(`3${cNum}${String(sNum).padStart(2, '0')}`, 10);
                        const fourDigitId2 = parseInt(`${cNum}${String(sNum).padStart(2, '0')}`, 10); // 10반 1번 -> 1001
                        if (fourDigitId1 === qVal || fourDigitId2 === qVal) return true;

                        // 5자리 학번 (예: 30101 -> 3학년 1반 1번, 31001 -> 3학년 10반 1번)
                        const fullId = parseInt(`3${String(cNum).padStart(2, '0')}${String(sNum).padStart(2, '0')}`, 10);
                        if (fullId === qVal) return true;
                    }

                    // ③ 하이픈 학번 (예: '1-1', '2-15')
                    if (qLower.includes('-')) {
                        const parts = qLower.split('-');
                        if (parts.length === 2) {
                            const targetClass = parseInt(parts[0], 10);
                            const targetNum = parseInt(parts[1], 10);
                            return cNum === targetClass && sNum === targetNum;
                        }
                    }

                    // ④ 한글 패턴 (예: '1반 1번', '1반1번')
                    const koreanPattern = `${cNum}반${sNum}번`;
                    if (koreanPattern === qLower) return true;
                    if (qLower.endsWith('반') && `${cNum}반` === qLower) return true;

                    return false;
                });
            }

            // 3. 정렬 적용
            filtered.sort((a, b) => {
                if (currentSortMode === 'num_asc') {
                    const cDiff = (a.classNum || 0) - (b.classNum || 0);
                    if (cDiff !== 0) return cDiff;
                    const numA = parseInt(a.studentNum) || 0;
                    const numB = parseInt(b.studentNum) || 0;
                    return numA - numB;
                } else if (currentSortMode === 'name_asc') {
                    return (a.name || '').localeCompare(b.name || '', 'ko');
                } else if (currentSortMode === 'avg_desc') {
                    return (b.allAverage || 0) - (a.allAverage || 0);
                } else if (currentSortMode === 'avg_asc') {
                    return (a.allAverage || 0) - (b.allAverage || 0);
                } else if (currentSortMode === 'general_asc') {
                    return (a.generalHSPercentile || 999) - (b.generalHSPercentile || 999);
                } else if (currentSortMode === 'meister_desc') {
                    return getStudentSchoolScore(b, '마이스터', trackMode) - getStudentSchoolScore(a, '마이스터', trackMode);
                } else if (currentSortMode === 'energy_desc') {
                    return getStudentSchoolScore(b, '에너지', trackMode) - getStudentSchoolScore(a, '에너지', trackMode);
                } else if (currentSortMode === 'hyundai_desc') {
                    return getStudentSchoolScore(b, '현대', trackMode) - getStudentSchoolScore(a, '현대', trackMode);
                }
                return 0;
            });

            // 화면 표시 인원수 및 헤더 뱃지 갱신
            const countEl = modalEl.querySelector('#matrixVisibleCount');
            if (countEl) countEl.textContent = filtered.length;

            const headerClassBadge = modalEl.querySelector('#matrixHeaderClassBadge');
            if (headerClassBadge) {
                headerClassBadge.textContent = currentClassFilter === 'all' 
                    ? `🏫 3학년 전교생 (총 ${classCount}개 학급)` 
                    : `🏫 3학년 ${currentClassFilter}반`;
            }

            const headerTotalBadge = modalEl.querySelector('#matrixHeaderTotalBadge');
            if (headerTotalBadge) {
                headerTotalBadge.textContent = `표시 ${filtered.length}명 / 전체 ${fullGrades.length}명`;
            }

            if (filtered.length === 0) {
                return `
                    <tr>
                        <td colspan="15" class="p-12 text-center text-slate-400 font-bold">
                            <span class="text-2xl block mb-2">🔍</span>
                            일치하는 학생 데이터가 없습니다. 검색어(이름 또는 학번)를 다시 확인해 보세요.
                        </td>
                    </tr>
                `;
            }

            let rowsHTML = '';
            filtered.forEach(s => {
                const getBadge = (schoolItem) => {
                    let r = null;
                    if (trackMode === 'special') {
                        r = s.schoolResults.find(x => x.schoolName.includes(schoolItem.key) && (x.trackName.includes('특별') || x.trackName.includes('취업')));
                    }
                    if (!r) {
                        r = s.schoolResults.find(x => x.schoolName.includes(schoolItem.key) && x.trackName.includes('일반'));
                    }
                    if (!r) return '<span class="text-slate-600 font-mono text-xs">-</span>';

                    const cutoffVal = getSchoolCutoffVal(schoolItem.key, trackMode, yearMode);
                    const score = Number(r.totalScore || 0);
                    const scoreStr = score.toFixed(2); // 소수 둘째자리 표기

                    if (cutoffVal && cutoffVal > 0) {
                        const diff = score - cutoffVal;
                        const diffStr = diff >= 0 ? `+${diff.toFixed(2)}` : `${diff.toFixed(2)}`;
                        const tooltip = `기준선: ${cutoffVal.toFixed(2)}점 (${diffStr}점 차이)`;

                        // whitespace-nowrap, inline-flex, leading-none으로 절대 줄바꿈 없이 한 화면 쏙 표시
                        if (score >= cutoffVal + 5) {
                            return `<span class="inline-flex items-center justify-center gap-1 leading-none font-black text-emerald-300 bg-emerald-950/80 border border-emerald-400/60 px-2 py-0.5 rounded-full text-[11px] shadow-xs whitespace-nowrap" title="${tooltip} - 안정">🟢 ${scoreStr}</span>`;
                        } else if (score >= cutoffVal) {
                            return `<span class="inline-flex items-center justify-center gap-1 leading-none font-black text-amber-200 bg-amber-950/80 border border-amber-400/60 px-2 py-0.5 rounded-full text-[11px] shadow-xs whitespace-nowrap" title="${tooltip} - 적정/경계">🟡 ${scoreStr}</span>`;
                        } else {
                            return `<span class="inline-flex items-center justify-center gap-1 leading-none font-bold text-rose-300 bg-rose-950/80 border border-rose-500/60 px-2 py-0.5 rounded-full text-[11px] shadow-xs whitespace-nowrap" title="${tooltip} - 소신/주의">🔴 ${scoreStr}</span>`;
                        }
                    }
                    return `<span class="text-slate-300 font-mono font-medium text-[11px] whitespace-nowrap">${scoreStr}</span>`;
                };

                const generalBadge = getGeneralGuideBadge(s.generalHSPercentile);
                const avgStr = Number(s.allAverage || 0).toFixed(2);

                rowsHTML += `
                    <tr class="hover:bg-slate-800/70 border-b border-slate-700/50 text-center transition-colors">
                        <td class="px-1 py-1.5 text-indigo-300 font-bold font-mono text-xs whitespace-nowrap">
                            <span class="px-1.5 py-0.5 rounded bg-indigo-950 border border-indigo-500/40">${s.classNum}반</span>
                        </td>
                        <td class="px-1 py-1.5 text-slate-400 font-mono font-bold whitespace-nowrap text-xs">${s.studentNum}</td>
                        <td class="px-1.5 py-1.5 font-bold text-white cursor-pointer hover:text-indigo-300 hover:underline matrix-student-name transition-colors whitespace-nowrap text-xs"
                            data-class="${s.classNum}" data-num="${s.studentNum}" data-name="${s.name}" title="클릭하여 1:1 진학 상담 열기">
                            ${s.name}
                        </td>
                        <td class="px-1 py-1.5 text-indigo-300 font-bold font-mono text-xs whitespace-nowrap">${avgStr}</td>
                        ${schoolKeywords.map(sch => `<td class="px-1 py-1.5 whitespace-nowrap text-center">${getBadge(sch)}</td>`).join('')}
                        <td class="px-2 py-1.5 font-bold whitespace-nowrap text-center">${generalBadge}</td>
                    </tr>
                `;
            });
            return rowsHTML;
        };

        const getModeDescription = (yearMode, trackMode) => {
            const yearText = yearMode === 'last' ? '🎯 <strong>직전 1개년(작년)</strong>'
                           : yearMode === 'avg3' ? '📊 <strong>최근 3개년 누적 평균선</strong>'
                           : '📈 <strong>최근 5개년 장기 추세선</strong>';
            const trackText = trackMode === 'special' ? '<span class="text-amber-300 font-bold">[특별전형 · 취업희망자]</span>'
                                                      : '<span class="text-indigo-300 font-bold">[일반전형]</span>';
            
            const meisterCutoff = getSchoolCutoffVal('마이스터', trackMode, yearMode);
            const meisterInfo = meisterCutoff > 0 ? ` · <span class="text-emerald-300">울산마이스터 기준선: ${meisterCutoff.toFixed(2)}점</span>` : '';

            return `${yearText} 기준 ${trackText} 학생 환산점수 및 합격선을 대조합니다.${meisterInfo}`;
        };

        modalEl.innerHTML = `
            <div class="glass-card print-document p-4 sm:p-6 w-full max-w-[1920px] max-h-[94vh] overflow-y-auto space-y-3.5">
                <!-- 모달 헤더 -->
                <div class="flex items-center justify-between border-b border-slate-700/50 pb-3 flex-wrap gap-3">
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <span id="matrixHeaderClassBadge" class="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-xs font-bold">
                                ${currentClassFilter === 'all' ? `🏫 3학년 전교생 (총 ${classCount}개 학급)` : `🏫 3학년 ${currentClassFilter}반`}
                            </span>
                            <span id="matrixHeaderTotalBadge" class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-bold">
                                총 ${fullGrades.length}명
                            </span>
                        </div>
                        <h2 class="text-2xl font-black text-white flex items-center gap-2 mt-1">
                            📊 관내 고교별 진학 신호등 종합 매트릭스
                        </h2>
                    </div>
                    <button id="closeMatrixBtn" class="no-print text-slate-400 hover:text-white p-2 text-2xl font-bold bg-transparent border-none cursor-pointer leading-none">✕</button>
                </div>

                <!-- 1열: 6개 원클릭 탭 바 & 실시간 설명 바 -->
                <div class="flex items-center justify-between gap-3 flex-wrap bg-slate-900/70 p-2.5 rounded-2xl border border-slate-700/60 shadow-inner">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs font-bold text-slate-300 flex items-center gap-1 mr-1">
                            <span>⚙️</span> 전형·연도 선택:
                        </span>
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <!-- 1. 직전 1개년 -->
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="last" data-track="general">
                                🎯 직전 1년 · 일반
                            </button>
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="last" data-track="special">
                                🌟 직전 1년 · 특별(취업)
                            </button>

                            <!-- 2. 최근 3개년 평균 -->
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="avg3" data-track="general">
                                📊 최근 3년 · 일반
                            </button>
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="avg3" data-track="special">
                                ✨ 최근 3년 · 특별(취업)
                            </button>

                            <!-- 3. 최근 5개년 장기 -->
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="avg5" data-track="general">
                                📈 최근 5년 · 일반
                            </button>
                            <button class="matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border" data-year="avg5" data-track="special">
                                🚀 최근 5년 · 특별(취업)
                            </button>
                        </div>
                    </div>
                    <div id="matrixModeDesc" class="text-xs text-indigo-200 font-medium">
                        ${getModeDescription(currentYearMode, currentTrackMode)}
                    </div>
                </div>

                <!-- 2열: 정렬, 검색, 학급 필터 도구 바 (전체/반별 매트릭스 모두 완벽 지원) -->
                <div class="flex items-center justify-between gap-3 flex-wrap bg-slate-900/50 p-2.5 rounded-2xl border border-slate-700/50">
                    <div class="flex items-center gap-2.5 flex-wrap">
                        <!-- 학급 필터 드롭다운 (반별 모달에서도 자유롭게 전체 및 타 학급 전환 가능) -->
                        <div class="flex items-center gap-1.5 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700 text-xs shadow-xs">
                            <span class="font-bold text-indigo-300">🏫 학급:</span>
                            <select id="matrixClassSelect" class="bg-slate-900 text-white font-bold text-xs rounded-lg border border-slate-600 px-2 py-0.5 outline-none cursor-pointer">
                                <option value="all" ${currentClassFilter === 'all' ? 'selected' : ''}>전체 학급 (${classCount}개 학급)</option>
                                ${Array.from({ length: classCount }, (_, i) => `<option value="${i + 1}" ${String(currentClassFilter) === String(i + 1) ? 'selected' : ''}>${i + 1}반</option>`).join('')}
                            </select>
                        </div>

                        <!-- 정밀 학생 검색창 -->
                        <div class="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700 text-xs shadow-xs">
                            <span class="text-slate-400">🔍</span>
                            <input type="text" id="matrixSearchInput" placeholder="학생 성명 또는 학번 검색 (예: 강감찬, 1, 101)" 
                                   class="bg-transparent text-white ph-muted font-medium text-xs outline-none w-44 sm:w-64" />
                            <button id="clearMatrixSearchBtn" class="text-slate-400 hover:text-white text-xs cursor-pointer hidden">✕</button>
                        </div>

                        <!-- 정렬 드롭다운 -->
                        <div class="flex items-center gap-1.5 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700 text-xs shadow-xs">
                            <span class="font-bold text-indigo-300">🔃 정렬:</span>
                            <select id="matrixSortSelect" class="bg-slate-900 text-white font-bold text-xs rounded-lg border border-slate-600 px-2 py-0.5 outline-none cursor-pointer">
                                <option value="num_asc">학번 기본순</option>
                                <option value="name_asc">성명 가나다순</option>
                                <option value="avg_desc">내신평균 높은순 (상위권)</option>
                                <option value="avg_asc">내신평균 낮은순</option>
                                <option value="general_asc">일반고 안정순 (석차백분율 낮은순)</option>
                                <option value="meister_desc">울산마이스터 환산점 높은순</option>
                                <option value="energy_desc">울산에너지고 환산점 높은순</option>
                                <option value="hyundai_desc">현대공업고 환산점 높은순</option>
                            </select>
                        </div>
                    </div>

                    <!-- 표시 인원수 뱃지 -->
                    <div class="text-xs font-bold text-slate-400 bg-slate-800/80 px-3 py-1 rounded-xl border border-slate-700">
                        표시 인원: <span class="text-emerald-400 font-mono text-sm font-black" id="matrixVisibleCount">${fullGrades.length}</span>명
                    </div>
                </div>

                <!-- 매트릭스 테이블 (가로 스크롤 없이 모니터 한 화면에 100% 쏙 들어가도록 유연한 반응형 구조 적용) -->
                <div class="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-800/30 custom-scrollbar">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr class="bg-slate-800/90 text-text-muted border-b border-slate-700/70 text-center whitespace-nowrap">
                                <th class="p-2 w-12 font-bold text-indigo-300">반</th>
                                <th class="p-2 w-10 font-bold">번호</th>
                                <th class="p-2 w-16 font-bold">성명</th>
                                <th class="p-2 w-16 font-bold text-indigo-300">내신평균</th>
                                <th class="p-1.5 text-amber-300 font-bold">🎓 울산마이스터</th>
                                <th class="p-1.5 text-amber-300 font-bold">🎓 에너지고</th>
                                <th class="p-1.5 text-amber-300 font-bold">🎓 현대공고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 울산상고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 울산여상</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 울산생과고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 울산공고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 울산산업고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 미용예술고</th>
                                <th class="p-1.5 text-cyan-300 font-bold">🏭 기술공고</th>
                                <th class="p-2 w-32 text-emerald-300 font-bold whitespace-nowrap">🏫 후기 일반계고</th>
                            </tr>
                        </thead>
                        <tbody id="matrixTableBody">
                            ${generateTableRows(currentYearMode, currentTrackMode)}
                        </tbody>
                    </table>
                </div>

                <!-- 하단 범례 및 인쇄 버튼 -->
                <div class="flex justify-between items-center text-xs text-text-muted flex-wrap gap-3 pt-1">
                    <div class="flex items-center gap-3 flex-wrap">
                        <span><strong>신호등 범례:</strong></span>
                        <span class="inline-flex items-center gap-1 text-emerald-300 font-black bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-400/50">🟢 안정 (기준선 +5점 이상)</span>
                        <span class="inline-flex items-center gap-1 text-amber-300 font-black bg-amber-950/80 px-2.5 py-0.5 rounded-full border border-amber-400/50">🟡 적정/경계 (기준선 이상)</span>
                        <span class="inline-flex items-center gap-1 text-rose-300 font-black bg-rose-950/80 px-2.5 py-0.5 rounded-full border border-rose-400/50">🔴 소신/주의 (기준선 미만)</span>
                        <span class="text-slate-400 font-medium">※ 학생 이름을 클릭하면 해당 학생의 1:1 세부 상담 화면으로 즉시 이동합니다.</span>
                    </div>
                    <button id="matrixPrintBtn" class="no-print btn-secondary text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5 rounded-xl cursor-pointer">
                        <span>🖨️</span> 매트릭스 인쇄
                    </button>
                </div>
            </div>
        `;

        // 탭 스타일 갱신 헬퍼 함수
        const updateTabStyles = () => {
            modalEl.querySelectorAll('.matrix-6tab').forEach(btn => {
                const y = btn.dataset.year;
                const t = btn.dataset.track;
                const isSelected = (y === currentYearMode && t === currentTrackMode);

                if (isSelected) {
                    if (t === 'special') {
                        btn.className = 'matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/25 scale-105';
                    } else {
                        btn.className = 'matrix-6tab px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer bg-primary text-white border-indigo-400 shadow-lg shadow-indigo-500/25 scale-105';
                    }
                } else {
                    if (t === 'special') {
                        btn.className = 'matrix-6tab px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer bg-amber-950/30 text-amber-300/80 border-amber-500/30 hover:bg-amber-900/40 hover:text-amber-200';
                    } else {
                        btn.className = 'matrix-6tab px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white';
                    }
                }
            });
        };

        const renderTableOnly = () => {
            const tbodyEl = modalEl.querySelector('#matrixTableBody');
            if (tbodyEl) {
                tbodyEl.innerHTML = generateTableRows(currentYearMode, currentTrackMode);
                bindStudentNameClick();
            }
        };

        updateTabStyles();

        // 6개 탭 클릭 이벤트 바인딩
        modalEl.querySelectorAll('.matrix-6tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const y = btn.dataset.year;
                const t = btn.dataset.track;
                if (currentYearMode === y && currentTrackMode === t) return;

                currentYearMode = y;
                currentTrackMode = t;
                updateTabStyles();

                const descEl = modalEl.querySelector('#matrixModeDesc');
                if (descEl) descEl.innerHTML = getModeDescription(currentYearMode, currentTrackMode);

                renderTableOnly();
            });
        });

        // 학급 필터 변경 이벤트
        modalEl.querySelector('#matrixClassSelect')?.addEventListener('change', (e) => {
            currentClassFilter = e.target.value;
            renderTableOnly();
        });

        // 정렬 모드 변경 이벤트
        modalEl.querySelector('#matrixSortSelect')?.addEventListener('change', (e) => {
            currentSortMode = e.target.value;
            renderTableOnly();
        });

        // 검색창 실시간 입력 이벤트
        const searchInput = modalEl.querySelector('#matrixSearchInput');
        const clearSearchBtn = modalEl.querySelector('#clearMatrixSearchBtn');
        searchInput?.addEventListener('input', (e) => {
            currentSearchQuery = e.target.value;
            if (clearSearchBtn) {
                clearSearchBtn.classList.toggle('hidden', !currentSearchQuery);
            }
            renderTableOnly();
        });
        clearSearchBtn?.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                currentSearchQuery = '';
                clearSearchBtn.classList.add('hidden');
                renderTableOnly();
                searchInput.focus();
            }
        });

        const bindStudentNameClick = () => {
            modalEl.querySelectorAll('.matrix-student-name').forEach(el => {
                el.addEventListener('click', (e) => {
                    const cNum = parseInt(e.currentTarget.dataset.class);
                    const sNum = e.currentTarget.dataset.num;
                    const sName = e.currentTarget.dataset.name;
                    modalEl.remove();
                    openStudentModal(cNum, sNum, sName);
                });
            });
        };

        bindStudentNameClick();
        document.getElementById('closeMatrixBtn').addEventListener('click', () => modalEl.remove());
        document.getElementById('matrixPrintBtn').addEventListener('click', () => printOnly('matrix', 'landscape'));

    } catch (err) {
        modalEl.innerHTML = `<div class="glass-card p-8 text-center text-danger font-bold">매트릭스 생성 실패: ${err}</div>`;
    }
}


// ===== 유틸리티 =====
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== 앱 업데이트 확인 (수동 버튼 및 시작 시) =====
async function checkUpdateOnStartup(localVer, isManual = false) {
    const statusEl = document.getElementById('startupUpdateStatus');
    if (statusEl) {
        statusEl.innerHTML = '<span class="spinner" style="width:10px;height:10px;border-width:1.5px;"></span> 서버 확인 중...';
    }

    // Wails 바인딩 주입 대기 (최대 3초)
    for (let i = 0; i < 30; i++) {
        if (window.go?.main?.App?.SyncWithServer) break;
        await delay(100);
    }

    try {
        if (window.go?.main?.App?.SyncWithServer) {
            const result = await window.go.main.App.SyncWithServer();
            if (result && result.hasUpdate) {
                if (statusEl) {
                    statusEl.innerHTML = `<span class="text-rose-400 font-bold animate-pulse">🚀 새 버전 v${result.latestVersion} 출시!</span>`;
                }
                showStartupUpdateModal(result);
            } else {
                const serverVer = result?.latestVersion || localVer || '';
                if (statusEl) {
                    statusEl.innerHTML = `<span class="text-emerald-400">✅ 최신 버전 (v${serverVer})</span>`;
                }
                if (isManual) {
                    await showModalAlert({
                        title: '최신 버전 확인',
                        message: `현재 최신 버전(<strong>v${serverVer}</strong>)을 사용하고 있습니다.<br>새로운 업데이트가 없습니다.`,
                        type: 'success'
                    });
                }
            }
        }
    } catch (e) {
        console.log("업데이트 확인 실패:", e);
        if (statusEl) {
            statusEl.innerHTML = `<span class="text-slate-400">오프라인 안전 모드</span>`;
        }
        if (isManual) {
            await showModalAlert({
                title: '오프라인 상태',
                message: '인터넷 연결이 필요합니다.<br>네트워크가 연결된 환경에서 다시 확인해 주세요.',
                type: 'warning'
            });
        }
    }
}

const FEEDBACK_BOARD_URL = "https://gguk.link/boards/phgc";
const GITHUB_RELEASE_URL = "https://github.com/purnpado/PHGC/releases/latest";

function openExternalUrlSafe(url) {
    try {
        if (window.go?.main?.App?.OpenExternalURL) {
            window.go.main.App.OpenExternalURL(url);
        } else if (window.runtime?.BrowserOpenURL) {
            window.runtime.BrowserOpenURL(url);
        } else {
            window.open(url, '_blank');
        }
    } catch (err) {
        console.error("외부 링크 열기 실패:", err);
    }
}

function quitAppSafe() {
    try {
        if (window.go?.main?.App?.QuitApp) {
            window.go.main.App.QuitApp();
        } else if (window.runtime?.Quit) {
            window.runtime.Quit();
        } else {
            window.close();
        }
    } catch (err) {
        console.error("프로그램 종료 실패:", err);
    }
}

function showStartupUpdateModal(result) {
    document.getElementById('startupUpdateModal')?.remove();

    const latestVer = result.latestVersion || '1.0.0';
    const currentVer = result.currentVersion || '1.0.0';
    const releaseNotes = result.releaseNotes || '새로운 기능 추가 및 시스템 안정화 패치가 포함되어 있습니다.';

    const modal = document.createElement('div');
    modal.id = 'startupUpdateModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200';
    modal.innerHTML = `
        <div class="glass-card max-w-lg w-full p-6 sm:p-7 border border-indigo-500/40 rounded-3xl shadow-2xl flex flex-col gap-4 text-left animate-in zoom-in-95 duration-200 break-keep-all select-none">
            
            <!-- 헤더 영역 -->
            <div class="flex items-start gap-3.5 border-b border-slate-700/60 pb-4">
                <div class="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-2xl shadow-inner shrink-0">
                    🚀
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                        <span class="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-bold border border-indigo-500/30">
                            NEW UPDATE
                        </span>
                        <span class="text-xs text-slate-400 font-mono">
                            v${currentVer} → <strong class="text-amber-300 font-bold">v${latestVer}</strong>
                        </span>
                    </div>
                    <h3 class="text-lg font-black text-white tracking-tight leading-snug">
                        새로운 버전(v${latestVer})이 출시되었습니다!
                    </h3>
                </div>
            </div>

            <!-- 안내 메시지 -->
            <div class="text-xs sm:text-sm text-slate-300 leading-relaxed">
                더욱 안정적이고 편리한 진학 상담을 위해 최신 버전 이용을 권장합니다.<br>
                <strong>공식 다운로드 페이지(GitHub Releases)</strong>로 이동하시겠습니까?
            </div>

            <!-- 주요 변경 사항 카드 -->
            <div class="space-y-1.5">
                <div class="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <span>📦</span> 업데이트 주요 내용:
                </div>
                <div class="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap font-sans select-text shadow-inner">
${releaseNotes}
                </div>
            </div>

            <!-- 안전 보장 안내 -->
            <div class="flex items-center gap-2 p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40 text-[11px] text-slate-400">
                <span class="text-emerald-400 text-sm shrink-0">🔒</span>
                <span>기존 학생 상담 데이터와 합격선 설정은 안전하게 그대로 유지됩니다.</span>
            </div>

            <!-- 하단 액션 버튼 영역 -->
            <div class="pt-2 flex flex-col gap-2.5">
                <div class="grid grid-cols-2 gap-3">
                    <button id="skipStartupUpdateBtn" 
                            type="button"
                            class="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-bold text-xs transition-colors cursor-pointer text-center">
                        나중에 하기
                    </button>
                    <button id="goToDownloadReleaseBtn" 
                            type="button"
                            class="w-full py-2.5 px-4 rounded-xl bg-linear-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-xs shadow-lg shadow-indigo-950/50 hover:shadow-indigo-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95">
                        <span>🌐</span> 다운로드 받으러 이동
                    </button>
                </div>
                <div class="text-center pt-1">
                    <button id="openFeedbackInUpdateBtn" 
                            type="button"
                            class="text-[11px] text-slate-400 hover:text-emerald-300 inline-flex items-center gap-1 transition-colors cursor-pointer underline underline-offset-2">
                        <span>💬</span> 질문이나 의견이 있으신가요? 꾹링크 피드백 게시판 바로가기
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('openFeedbackInUpdateBtn')?.addEventListener('click', () => {
        openExternalUrlSafe(FEEDBACK_BOARD_URL);
    });

    document.getElementById('skipStartupUpdateBtn')?.addEventListener('click', () => {
        modal.remove();
    });

    document.getElementById('goToDownloadReleaseBtn')?.addEventListener('click', () => {
        openExternalUrlSafe(GITHUB_RELEASE_URL);
        modal.remove();
        setTimeout(() => {
            quitAppSafe();
        }, 400);
    });
}

// ===== 프로그램 이용 및 학생 개인정보 보호 서약 모달창 =====
function renderAgreementModal(onAcceptCallback) {
    document.getElementById('securityAgreementModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'securityAgreementModal';
    modal.className = 'fixed inset-0 bg-black/90 backdrop-blur-md z-[50000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-300';

    modal.innerHTML = `
        <div class="glass-card max-w-3xl w-full p-6 sm:p-10 border border-indigo-500/40 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200 break-keep-all select-none">
            <!-- 모달 헤더 (해상도 반응형 및 단어 분리 방지) -->
            <div class="text-center pb-5 border-b border-slate-700/60">
                <div class="flex items-center justify-center gap-2 mb-3 flex-wrap">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 text-xs font-bold shadow-inner">
                        <span>🏫</span> 그래서? 넌 어디 갈래?
                    </span>
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold shadow-inner">
                        <span>🔒</span> 100% 오프라인 안전 모드
                    </span>
                </div>
                <h2 class="text-2xl sm:text-3xl font-black text-white tracking-tight leading-snug">
                    프로그램 이용 및 학생 개인정보 보호 서약서
                </h2>
                <p class="text-xs sm:text-sm text-slate-300 mt-2.5 leading-relaxed max-w-3xl mx-auto opacity-90 break-keep-all text-balance">
                    본 프로그램은 중학교 3학년 고입 진학 상담 및 내신 산출을 돕는 <strong>교원 전용 오프라인 업무 지원 도구</strong>입니다.<br>
                    안전한 학생 정보 보호와 책임 있는 진학 지도를 위해 아래 사항을 숙지하고 서약해 주시기 바랍니다.
                </p>
            </div>

            <!-- 서약서 전문 스크롤 영역 -->
            <div class="my-5 p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs sm:text-[13px] text-slate-300 leading-relaxed overflow-y-auto max-h-[48vh] space-y-4 font-sans select-text custom-scrollbar">
                <div class="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/25 shadow-xs">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-500/30 text-indigo-300 border border-indigo-400/40">제1조</span>
                        <h3 class="font-bold text-indigo-200 text-sm sm:text-base">100% 오프라인 구동 및 외부 전송 원천 차단</h3>
                    </div>
                    <ul class="list-disc list-inside space-y-1.5 text-slate-300 leading-relaxed">
                        <li>본 프로그램은 교육청 보안 지침을 준수하여 <strong class="text-white">외부 인터넷 서버와의 자동 통신을 일절 수행하지 않는 100% 오프라인 독립형 소프트웨어</strong>입니다.</li>
                        <li>나이스(NEIS) 엑셀에서 연동된 학생 성명, 학번, 성적 등 <strong class="text-white">모든 학생 정보는 사용자 로컬 PC에만 군사등급 AES-256-GCM 알고리즘으로 강력 암호화되어 안전하게 보관</strong>되며 외부로 전송되지 않습니다.</li>
                    </ul>
                </div>

                <div class="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/25 shadow-xs">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/30 text-emerald-300 border border-emerald-400/40">제2조</span>
                        <h3 class="font-bold text-emerald-200 text-sm sm:text-base">교내 안전 배포 및 파일 기반 오프라인 취합 체계</h3>
                    </div>
                    <ul class="list-disc list-inside space-y-1.5 text-slate-300 leading-relaxed">
                        <li>학년부장과 담임교사 간의 데이터 전달은 암호화된 학급별 배포 패키지(<span class="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono text-xs border border-emerald-500/30">.phgcpkg</span>)와 변경분 취합 파일(<span class="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono text-xs border border-emerald-500/30">.phgcpatch</span>)을 통해서만 안전하게 오프라인으로 교환됩니다.</li>
                        <li>관내 타 학교와의 커트라인 공유 파일(<span class="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-xs border border-indigo-500/30">.phgcdata</span>) 내보내기 시 <strong class="text-white">학생 개인 식별 정보(성명, 학번, 개별 성적 등)는 100% 원천 배제</strong>되며, 고교별 합격선 및 학교 단위 단순 통계 수치만 안전하게 포함됩니다.</li>
                    </ul>
                </div>

                <div class="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 shadow-xs">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-500/30 text-rose-300 border border-rose-400/40">제3조 (필독)</span>
                        <h3 class="font-bold text-rose-200 text-sm sm:text-base">개인정보 관리 책임의 사용자 전액 귀속</h3>
                    </div>
                    <ul class="list-disc list-inside space-y-1.5 text-slate-300 leading-relaxed">
                        <li class="text-rose-200 font-semibold">
                            ⚠️ <strong class="text-white">개인정보 관리 책임 전액 사용자 귀속:</strong> 본 프로그램은 네트워크 통신이 없는 로컬 오프라인 도구에 불과하며, 프로그램에 입력되는 나이스(NEIS) 엑셀 원본 파일, 학생 인적사항, 성적 및 산출 데이터의 <strong class="text-white underline underline-offset-2">취급·보관·관리·폐기 및 유출 방지에 대한 모든 법적·행정적 책임은 전적으로 사용자(이용 교원 및 소속 학교)에게 있습니다.</strong>
                        </li>
                        <li>비밀번호 분실, 학교 공용 데이터 암호 유출, PC 보안 관리 소홀(분실, 도난, 악성코드 감염 등)로 인하여 발생하는 일체의 개인정보 사고 및 데이터 유실에 대해 개발자는 어떠한 민·형사상 책임도 지지 않습니다.</li>
                        <li>사용자는 상담 완료 후 교실·교무실 이석 시 반드시 화면 잠금(<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-xs border border-slate-600">Win + L</span>) 및 프로그램 로그아웃을 실천해야 합니다.</li>
                    </ul>
                </div>

                <div class="p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 shadow-xs">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500/30 text-amber-300 border border-amber-400/40">제4조 (필독)</span>
                        <h3 class="font-bold text-amber-200 text-sm sm:text-base">진학 지도 보조 목적 고지 및 입시 결과 면책</h3>
                    </div>
                    <ul class="list-disc list-inside space-y-1.5 text-slate-300 leading-relaxed">
                        <li class="text-amber-200 font-semibold">
                            📢 <strong class="text-white">실제 입시와의 차이 및 최종 합격 미보증:</strong> 본 프로그램에서 제공하는 내신 환산 점수, 고교별 합격선, 5개년 추세선 및 합격 예측 진단은 교원의 진학 지도를 돕기 위한 <strong class="text-white underline underline-offset-2">'단순 보조 참고 자료'</strong>입니다. 실제 고입 입학전형 결과는 당해 연도 관내 전체 학생들의 지원 성향, 경쟁률, 면접·실기·신체검사 결과 등에 따라 크게 달라질 수 있으므로 법적 합격을 절대 보증하지 않습니다.
                        </li>
                        <li class="text-amber-200 font-semibold">
                            ⚖️ <strong class="text-white">입시 결과 관련 문제 발생 시 책임 귀속:</strong> 본 프로그램의 모의 산출값이나 합격 예측 진단을 신뢰하여 발생한 원서 접수 착오, 고교 불합격, 기타 입시 관련 분쟁이나 불이익에 대한 <strong class="text-white underline underline-offset-2">모든 책임은 전적으로 사용자(상담 교원 및 학교)에게 있으며, 개발자에게 어떠한 이의 제기나 법적 손해배상 책임을 물을 수 없습니다.</strong>
                        </li>
                        <li>
                            🔍 <strong class="text-white">필수 사전 교차 검증 의무:</strong> 고교별 전형 요강 세부 기준은 매년 변경될 수 있으므로, 사용자는 나이스 연동 후 <strong class="text-amber-300">반드시 지원 희망 고등학교의 공식 산출 프로그램(또는 산출표)에 표본 학생 성적을 입력하여 본 프로그램의 계산 결과와 100% 일치하는지 사전 대조·검증한 후 상담에 활용</strong>해야 합니다.
                        </li>
                    </ul>
                </div>

                <div class="p-4 rounded-xl bg-slate-950/60 border border-slate-700/50 shadow-xs">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-700 text-slate-300 border border-slate-600">제5조</span>
                        <h3 class="font-bold text-slate-200 text-sm sm:text-base">동의 거부 권리 및 프로그램 사용 제한</h3>
                    </div>
                    <ul class="list-disc list-inside space-y-1.5 text-slate-300 leading-relaxed">
                        <li>귀하는 본 서약 및 동의를 거부할 권리가 있습니다. 단, 학생 개인정보 보호 및 법적 책임 한계 명확화 규정에 따라 동의하지 않을 경우 프로그램의 모든 기능 사용이 원천 차단되며 즉시 프로그램이 종료됩니다.</li>
                    </ul>
                </div>
            </div>

            <!-- 동의 체크박스 -->
            <div class="pt-2 pb-5">
                <label class="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/90 cursor-pointer hover:bg-slate-800 transition-colors select-none shadow-sm">
                    <input type="checkbox" id="agreementCheckbox" class="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-600 cursor-pointer">
                    <span class="text-xs sm:text-sm font-bold text-white leading-tight">
                        위 서약 내용을 모두 충분히 확인하였으며, 학생 개인정보 보호 의무를 성실히 준수할 것에 동의합니다.
                    </span>
                </label>
            </div>

            <!-- 하단 버튼 영역 -->
            <div class="flex items-center justify-between gap-3 pt-3 border-t border-slate-700/60">
                <button type="button" id="rejectAgreementBtn" 
                        class="px-5 py-3 rounded-2xl border border-rose-500/50 bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 font-bold text-xs sm:text-sm transition-all cursor-pointer shadow-sm active:scale-95">
                    동의하지 않음 (프로그램 삭제 및 종료)
                </button>
                <button type="button" id="acceptAgreementBtn" disabled
                        class="flex-1 py-3 px-6 rounded-2xl bg-indigo-600 text-white font-bold text-xs sm:text-sm shadow-lg shadow-indigo-600/30 transition-all opacity-40 cursor-not-allowed">
                    서약하고 시작하기 →
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const checkbox = modal.querySelector('#agreementCheckbox');
    const acceptBtn = modal.querySelector('#acceptAgreementBtn');
    const rejectBtn = modal.querySelector('#rejectAgreementBtn');

    checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
            acceptBtn.disabled = false;
            acceptBtn.className = 'flex-1 py-3 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-primary text-white font-bold text-xs sm:text-sm shadow-xl shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer opacity-100';
        } else {
            acceptBtn.disabled = true;
            acceptBtn.className = 'flex-1 py-3 px-6 rounded-2xl bg-indigo-600 text-white font-bold text-xs sm:text-sm shadow-lg shadow-indigo-600/30 transition-all opacity-40 cursor-not-allowed';
        }
    });

    acceptBtn.addEventListener('click', async () => {
        if (!checkbox.checked) return;
        acceptBtn.disabled = true;
        acceptBtn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px;"></span> 처리 중...';
        try {
            await window.go.main.App.AcceptAgreement();
            modal.remove();
            if (typeof onAcceptCallback === 'function') {
                onAcceptCallback();
            }
        } catch (err) {
            alert('동의 정보 저장 실패: ' + err);
            acceptBtn.disabled = false;
            acceptBtn.textContent = '서약하고 시작하기 →';
        }
    });

    rejectBtn.addEventListener('click', async () => {
        const confirmed = await showModalConfirm({
            title: '🚨 프로그램 및 데이터 영구 파기 경고',
            message: `
                <div class="space-y-3 text-xs leading-relaxed text-left break-keep-all">
                    <div class="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200">
                        <p class="font-bold text-sm text-rose-100 mb-1">⚠️ 정말 동의하지 않으시겠습니까?</p>
                        <p>학생 개인정보 보호 규정에 따라 비동의 시 <strong>프로그램 실행 파일(.exe)과 모든 저장 데이터가 즉시 영구 삭제(파기)</strong>되며 프로그램이 완전히 종료됩니다.</p>
                    </div>
                    <p class="text-slate-300">삭제된 프로그램 및 데이터는 복구할 수 없습니다. 계속 진행하시겠습니까?</p>
                </div>
            `,
            type: 'error',
            confirmText: '네, 삭제하고 종료합니다',
            cancelText: '다시 생각하기'
        });

        if (!confirmed) return;

        rejectBtn.disabled = true;
        rejectBtn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px;"></span> 프로그램 파기 중...';
        try {
            await window.go.main.App.SelfDestruct();
        } catch (err) {
            alert('자가 삭제 처리 중 오류: ' + err);
        }
    });
}

// ===== 프로그램 사용 설명서(가이드) 모달 및 A4 인쇄 =====
function renderGuideModal(role = 'homeroom') {
    document.getElementById('programGuideModal')?.remove();

    const isMaster = (role === 'master' || window.currentUser?.Role === 'master');

    const modal = document.createElement('div');
    modal.id = 'programGuideModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[60000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200';

    modal.innerHTML = `
        <div class="glass-card max-w-4xl w-full p-6 sm:p-8 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] break-keep-all">
            <!-- 모달 상단 헤더 & 인쇄/닫기 버튼 (화면 전용) -->
            <div class="flex items-center justify-between pb-4 border-b border-slate-700/60 no-print flex-wrap gap-3">
                <div class="flex items-center gap-2.5">
                    <span class="text-2xl sm:text-3xl">📖</span>
                    <div>
                        <h2 class="text-xl sm:text-2xl font-black text-white">
                            『그래서? 넌 어디갈래?』 프로그램 사용 설명서
                        </h2>
                        <p class="text-xs text-text-muted mt-0.5">안전하고 효율적인 중3 고입 진학 지도를 위한 단계별 업무 매뉴얼</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button id="printGuideBtn" class="btn-secondary text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5 shadow-sm hover:scale-105 transition-all">
                        <span>🖨️</span> 설명서 인쇄 (A4)
                    </button>
                    <button id="closeGuideBtn" class="text-2xl text-slate-400 hover:text-white px-2 cursor-pointer transition-colors">&times;</button>
                </div>
            </div>

            <!-- 역할별 탭 (학년부장에게는 2개 탭 모두 노출, 담임에게는 담임용만 노출) -->
            <div class="flex gap-2 pt-4 pb-3 border-b border-slate-700/50 no-print">
                ${isMaster ? `
                <button id="tabMasterGuide" class="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 text-white transition-colors cursor-pointer">
                    👔 학년부장(마스터) 운영 매뉴얼
                </button>
                <button id="tabTeacherGuide" class="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer">
                    📘 담임·진로교사 진학지도 매뉴얼
                </button>
                ` : `
                <div class="px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 text-white">
                    📘 담임·진로교사 진학지도 매뉴얼
                </div>
                `}
            </div>

            <!-- 설명서 본문 스크롤 영역 -->
            <div class="my-4 overflow-y-auto max-h-[60vh] custom-scrollbar pr-2 space-y-6 text-slate-200 text-xs sm:text-sm leading-relaxed" id="guideContentArea">
                ${isMaster ? getMasterGuideHTML() : getTeacherGuideHTML()}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('#closeGuideBtn');
    const printBtn = modal.querySelector('#printGuideBtn');
    const tabMaster = modal.querySelector('#tabMasterGuide');
    const tabTeacher = modal.querySelector('#tabTeacherGuide');
    const contentArea = modal.querySelector('#guideContentArea');

    closeBtn.onclick = () => modal.remove();

    printBtn.onclick = () => {
        printOnly('guide', 'portrait');
    };

    if (isMaster && tabMaster && tabTeacher) {
        tabMaster.onclick = () => {
            tabMaster.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 text-white transition-colors cursor-pointer';
            tabTeacher.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer';
            contentArea.innerHTML = getMasterGuideHTML();
        };
        tabTeacher.onclick = () => {
            tabTeacher.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 text-white transition-colors cursor-pointer';
            tabMaster.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer';
            contentArea.innerHTML = getTeacherGuideHTML();
        };
    }
}
window.renderGuideModal = renderGuideModal;

// 담임교사용 가이드 HTML
function getTeacherGuideHTML() {
    return `
        <div class="space-y-4">
            <!-- 사전 검증 권장 주의 카드 -->
            <div class="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 shadow-xs">
                <h4 class="font-bold text-amber-100 text-sm sm:text-base mb-1.5 flex items-center gap-2">
                    <span>⚠️</span> [필수 점검] 상담 전 고교 공식 산출 프로그램과 계산값 대조
                </h4>
                <p class="text-xs sm:text-[13px] leading-relaxed">
                    본격적인 1:1 진학 상담 전, 표본 학생 성적을 <strong>지원 희망 고등학교의 공식 산출 프로그램(또는 산출표)</strong>에 직접 대입하여 <strong>본 프로그램의 계산값과 100% 일치하는지 사전 확인</strong> 후 상담에 활용해 주시기 바랍니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/20">
                <h3 class="font-bold text-indigo-300 text-base mb-2 flex items-center gap-2">
                    <span>1️⃣</span> 1단계: 배포 자료(.phgcpkg) 적용 및 안전 로그인
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • <strong>배포 패키지 적용:</strong> 학년부장 선생님께 전달받은 학급 패키지 파일(<strong>.phgcpkg</strong>)을 로그인 화면의 <strong>[📦 학년부장 배포 자료 가져오기]</strong> 버튼을 눌러 적용합니다.<br>
                    • <strong>상담 이력 자동 보존·병합:</strong> 학기 중 학년부장 배포 자료를 새로 다시 받더라도, <strong>기존에 담임이 입력해 둔 상담일지·희망학교·메모는 100% 안전하게 자동 보존</strong>됩니다.<br>
                    • <strong>안전 접속 및 초기 비밀번호:</strong> 본인 학급을 선택하고 접속합니다. 초기 비밀번호는 학급번호(예: 3반은 301)로 바로 로그인 가능합니다.<br>
                    • <strong>비밀번호 재설정 파일(.phgcreset) 지원:</strong> 비밀번호를 분실했을 경우, 학년부장에게 발급받은 재설정 파일을 <strong>[🔑 재설정 파일 가져오기]</strong> 버튼으로 불러와 즉시 복구할 수 있습니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-emerald-300 text-base mb-2 flex items-center gap-2">
                    <span>2️⃣</span> 2단계: 학급 진학 현황, 1:1 프라이버시 대시보드 & 종합 성적표 인쇄
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • <strong>🔒 1:1 프라이버시 상담 모드:</strong> 대시보드 상단 검색창에 학생 번호(예: 1, 15) 또는 이름을 입력하면 해당 학생만 화면에 단독 표시되어, <strong>학부모·학생 대면 상담 중 타 학생의 점수나 지망이 노출되지 않는 안심 상담 환경</strong>을 제공합니다.<br>
                    • <strong>다차원 실시간 정렬:</strong> 번호순, 성명 가나다순, 일반계고 안정순/위험순, 마이스터고 유망순 등으로 학생 목록을 자유롭게 정렬할 수 있습니다.<br>
                    • <strong>희망학교 원클릭 즉시 삭제([✕]):</strong> 대시보드 목록의 희망학교 배지 옆 <strong>[✕] 버튼</strong>을 눌러 상담 모달을 열지 않고도 지망 학교를 즉시 취소·삭제할 수 있습니다.<br>
                    • <strong>🖨️ 학생 종합 성적표(교과/출결/봉사) A4 1장 완벽 맞춤 인쇄:</strong> [🖨️ 성적표 인쇄] 버튼 클릭 시 교과 매트릭스와 출결, 봉사활동 요약이 <strong>A4 1장에 칼같이 쏙 들어가도록 자동 최적화</strong>되어 학부모 상담용으로 바로 배부할 수 있습니다.<br>
                    • <strong>전교 석차 스냅샷 기반 일반계고 합격 예측:</strong> 학년부장이 배포한 전교 석차 스냅샷을 기반으로 전교 석차백분율(%) 기준 🟢 안정, 🟡 경계선, 🔴 주의 판정을 정확하게 제공합니다.<br>
                    • <strong>📊 신호등 매트릭스 & 👥 우리 반 통계:</strong> [📊 신호등 매트릭스]로 전체 학생의 전기고 합격 가능성을 종합 비교하고, [우리 반 통계]에서 지망별 뱃지를 클릭하여 지원자 명단을 즉시 확인합니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-amber-300 text-base mb-2 flex items-center gap-2">
                    <span>3️⃣</span> 3단계: 1:1 심층 상담 (고정 닫기, 학과 중복 방지 & 학부모용 공식 서명 푸터)
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • 학생 성명 또는 <strong>[🎯 진학 상담]</strong> 버튼을 클릭하여 개인별 심층 상담창을 엽니다.<br>
                    • <strong>상단 고정(Sticky) 닫기 버튼 & ESC 키 지원:</strong> 모달을 아래로 끝까지 스크롤해도 <strong>우측 상단에 붉은빛 [✕ 창 닫기] 버튼이 계속 고정</strong>되며, 키보드 <strong>ESC 키</strong>를 누르거나 맨 아래의 [✕ 상담 모달 닫기] 버튼을 눌러도 즉시 안전하게 닫힙니다. (실수로 윈도우 창 X를 눌러 프로그램이 종료되는 현상 방지)<br>
                    • <strong>다각도 합격선 비교:</strong> [🎯 직전 1개년], [📊 최근 3년 평균], [📈 최근 5년 평균] 탭과 <strong>공식 최고점·평균점·최저점</strong>을 대조하여 합격 가능성을 정밀 진단합니다.<br>
                    • <strong>학과 지망 중복 방지 실시간 비활성화:</strong> 1~5지망 선택 시 이미 선택된 학과는 다른 지망 드롭다운에서 자동으로 비활성화(회색)되어 중복 접수 실수를 원천 방지합니다.<br>
                    • <strong>학부모 배부용 정갈한 공식 서명 푸터:</strong> '상담 메모 포함' 체크를 해제한 상태로 [🖨️ 인쇄 / PDF]를 누르면, 어색한 빈 상담 일지 박스는 100% 숨겨지고 맨 아래에 <strong>[📅 진학 상담 일자 | 담임교사 확인 (인) | 학생·학부모 확인 (인)]</strong> 공식 서명 라인이 정갈하게 출력됩니다. (선생님 상담 메모 보관용은 '상담 메모 포함' 체크 시 함께 인쇄)<br>
                    • <strong>합격(배정) 학과 최종 지정:</strong> 고교 합격자 발표 후 실제 배정된 학과를 지정하여 원서대장에 정확히 반영합니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-cyan-300 text-base mb-2 flex items-center gap-2">
                    <span>4️⃣</span> 4단계: 우리 반 고입원서대장 검토 & 배정고 입력 & 담임 결재
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • <strong>원서대장 서식 & 엑셀 다운로드:</strong> 상단의 [🖨️ 원서대장] 버튼을 누르면 정갈한 A4 대장이 열리며, [📊 엑셀 다운로드]를 통해 학교별 틀에 맞추어 자유롭게 편집·수정할 수 있습니다.<br>
                    • <strong>내신총점(취득점/만점):</strong> 울산마이스터고(/300), 울산에너지고(/230), 현대공업고(/200), 특성화고(/100), 일반고(%) 등 전형별 만점 대비 취득 점수가 정확히 표기됩니다.<br>
                    • <strong>후기 일반고 배정고 인라인 즉시 입력:</strong> 1월 말 일반고 배정 발표 후, 대장 화면에서 배정학교 칸을 클릭하여 학교명(예: 울산고)을 타이핑하면 즉시 DB에 영구 저장됩니다.<br>
                    • <strong>A4 1페이지 자동 맞춤:</strong> 학생 수에 맞춰 행 높이와 글자 크기가 한 페이지에 칼같이 맞춰져 출력됩니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-sky-300 text-base mb-2 flex items-center gap-2">
                    <span>5️⃣</span> 5단계: 변경분 취합자료(.phgcpatch) 학년부장 제출
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • 2학기 출결(미인정 결석/지각)이나 추가 봉사시간, 리더십 가산점을 상담창에서 수기 반영합니다.<br>
                    • 학급 상담이 마무리되면 화면 상단의 <strong>[📤 취합자료제출(담임)]</strong> 버튼을 눌러 공용 암호로 암호화된 변경분 파일(<strong>.phgcpatch</strong>)을 생성하여 학년부장 선생님께 전달합니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-rose-300 text-base mb-2 flex items-center gap-2">
                    <span>🔒</span> 6단계: 교무실 개인정보 보호 원클릭 화면 잠금 (Ctrl + L)
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • 상담 도중 잠시 자리를 비우거나 학생·학부모가 교무실에 출입할 때, 상단 도구 바의 <strong>[🔒 화면 잠금]</strong> 버튼이나 단축키 <strong>Ctrl + L</strong>을 누르면 즉시 화면이 안전하게 잠깁니다.<br>
                    • 본인의 비밀번호를 입력하면 작업 중이던 화면 그대로 안전하게 복귀할 수 있습니다.
                </p>
            </div>
        </div>
    `;
}

// 학년부장(마스터) 가이드 HTML
function getMasterGuideHTML() {
    return `
        <div class="space-y-4">
            <!-- 사전 검증 권장 주의 카드 -->
            <div class="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 shadow-xs">
                <h4 class="font-bold text-amber-100 text-sm sm:text-base mb-1.5 flex items-center gap-2">
                    <span>⚠️</span> [필수 점검] 나이스 연동 후 고교 공식 산출 프로그램과 계산값 사전 대조
                </h4>
                <p class="text-xs sm:text-[13px] leading-relaxed">
                    나이스 성적/출결/봉사 엑셀 3종 업로드 완료 후, 담임교사 배포 전 표본 학생 1~2명의 성적을 <strong>지원 희망 고등학교의 공식 산출 프로그램(또는 공식 산출표)</strong>에 직접 입력하여 <strong>본 프로그램의 산출 점수와 100% 일치하는지 반드시 사전 대조·검증</strong>해 주시기 바랍니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/20">
                <h3 class="font-bold text-indigo-300 text-base mb-2 flex items-center gap-2">
                    <span>1️⃣</span> 1단계: 학교 기초 설정, 입학년도 관리 & 공용 암호 관리
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • 최초 실행 시 학교명, 3학년 전체 학급 수, 고교 입학년도(예: 2026학년도 입학)를 설정합니다.<br>
                    • 담임교사 PC와 안전하게 오프라인 암호화 통신을 수행하기 위한 <strong>[공용 데이터 잠금 암호]</strong>를 지정합니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-emerald-300 text-base mb-2 flex items-center gap-2">
                    <span>2️⃣</span> 2단계: 나이스 엑셀 연동 및 공식 공개 입결자료 등록
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • 관리자 대시보드에서 나이스 출력 엑셀(<strong>교과성적, 출결, 봉사활동</strong>) 3종을 업로드하여 전교생 데이터를 연동합니다.<br>
                    • <strong>📊 공식 공개 입결자료 등록:</strong> [공식 공개자료 추가] 버튼으로 관내 고교별 <strong>최신 개편 학과명</strong>과 전형(일반/특별), <strong>최고점·평균점·최저점 3대 합격 지표</strong>를 등록하여 상담의 공신력을 극대화합니다.<br>
                    • <strong>타교 커트라인 다중 파일 일괄 병합:</strong> [관내자료 병합] 시 여러 학교의 <strong>.phgcdata</strong> 파일을 한꺼번에 다중 선택하여 1초 만에 일괄 병합할 수 있습니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-amber-300 text-base mb-2 flex items-center gap-2">
                    <span>3️⃣</span> 3단계: 담임교사용 배포 패키지(.phgcpkg) 생성 & 비밀번호 관리
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • <strong>전교 석차 스냅샷 자동 내장:</strong> 학급 배포 파일(<strong>.phgcpkg</strong>) 생성 시 전교생 석차백분율 스냅샷이 암호화 패키지에 자동 내장되어, 담임 PC에서도 학년부장 화면과 100% 동일한 전교 백분율이 산출됩니다.<br>
                    • <strong>비밀번호 재설정 파일(.phgcreset) 발급:</strong> 담임선생님이 비밀번호를 분실했을 경우, [사용자 관리]에서 비밀번호를 재설정한 뒤 <strong>[비밀번호 재설정 파일 저장]</strong> 버튼으로 발급하여 안전하게 전달할 수 있습니다.<br>
                    • <strong>[배포 자료 만들기]:</strong> 학급별 패키지 파일(<strong>.phgcpkg</strong>)을 생성하여 공용 암호와 함께 각 반 담임선생님께 전달합니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-sky-300 text-base mb-2 flex items-center gap-2">
                    <span>4️⃣</span> 4단계: 담임교사 취합 자료 '다중 파일 일괄 병합 (1초 완료)'
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • 담임선생님들이 상담 후 제출한 패치 파일(<strong>.phgcpatch</strong>)들을 수신합니다.<br>
                    • 관리자 도구 바의 <strong>[📥 취합자료병합]</strong> 버튼을 클릭하고 파일 선택 창에서 <strong>Ctrl 또는 Shift 키로 전 학급 파일을 한꺼번에 다중 선택</strong>합니다.<br>
                    • 1초 만에 전 학급의 변경 내역(출결, 봉사, 가산점, 지망학교)이 한 번에 검토 화면으로 로드되어 간편하게 승인·병합됩니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-purple-300 text-base mb-2 flex items-center gap-2">
                    <span>5️⃣</span> 5단계: 전교 스마트 통계 분석 및 고입원서대장 반별 분할 출력
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • <strong>[📊 신호등 매트릭스]:</strong> 3학년 전교생 또는 학급별 관내 10대 직업계고 및 후기 일반고 합격 가능성을 한눈에 조회하며, 검색 및 다차원 정렬(내신순, 고교별 점수순 등)을 지원합니다.<br>
                    • <strong>[🏫 우리학교 지원현황]:</strong> 학교-전형-학과별 1줄 요약과 1~5지망 가로 뱃지 통계를 제공하며, 클릭 시 전교 지원 학생 명단이 즉시 팝업됩니다.<br>
                    • <strong>[🖨️ 고입원서대장]:</strong><br>
                    &nbsp;&nbsp;① <strong>동적 결재라인 체크:</strong> 담임, 학년부장, 교무부장, 진로부장, 교감, 교장 직책을 체크하여 소규모 학교 및 학교 환경에 맞게 결재란을 즉시 변경합니다.<br>
                    &nbsp;&nbsp;② <strong>전교 반별 자동 분할 인쇄:</strong> [전교 일괄] 모드로 출력 시, 반이 바뀔 때마다 자동으로 새 A4 용지에서 시작되어 인쇄 버튼 한 번으로 학급별 대장이 1장씩 착착 분할 출력됩니다.<br>
                    &nbsp;&nbsp;③ <strong>한 페이지 자동 맞춤:</strong> 학급별 학생 수(20~30명 이상)에 맞춰 글자 크기와 행 간격이 자동으로 한 페이지에 딱 맞게 조절됩니다.<br>
                    &nbsp;&nbsp;④ <strong>특성화고 추가모집 자동 표기:</strong> 후기 일반고 탈락 후 추가모집에 합격한 학생은 비고란에 [추가모집] 뱃지가 자동 표기됩니다.<br>
                    &nbsp;&nbsp;⑤ <strong>원서대장 엑셀(.xls) 다운로드:</strong> [📊 엑셀 다운로드] 버튼으로 내려받아 학교별 고유 양식이나 틀에 맞게 자유롭게 편집·수정할 수 있습니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-rose-300 text-base mb-2 flex items-center gap-2">
                    <span>6️⃣</span> 6단계: 입시 확정, 최종 암호화 보관본 생성 및 차년도 전환
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • <strong>[🔒 입시 결과 확정]:</strong> 모든 고입 전형 종료 후 결과를 확정하여 당해 연도 최종 커트라인을 통계에 반영합니다.<br>
                    • <strong>[🗄️ 최종 보관본 생성]:</strong> 감사 및 차후 조회를 위한 100% 암호화 백업 아카이브를 생성합니다.<br>
                    • <strong>[📅 새 학년도 전환]:</strong> 졸업생 개인정보를 안전하게 비우고, 다음 학년도(예: 2027학년도 입학)로 5개년 커트라인 기준을 한 칸씩 자동 시프트(Shift)하여 완벽한 인수인계를 준비합니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-amber-300 text-base mb-2 flex items-center gap-2">
                    <span>🔒</span> 7단계: 개인정보 보호 화면 잠금 (Ctrl + L)
                </h3>
                <p class="text-slate-300 leading-relaxed">
                    • 전교생 성적 및 민감 정보를 다루는 학년부장 화면 특성상, 자리 비움 시 상단 도구 바의 <strong>[🔒 화면 잠금]</strong> 버튼이나 단축키 <strong>Ctrl + L</strong>을 누르면 즉시 암막 보호 화면으로 전환됩니다.<br>
                    • 관리자 비밀번호를 입력하면 작업 중이던 데이터 그대로 안전하게 복귀합니다.
                </p>
            </div>
        </div>
    `;
}


// 앱 정상 시작 진행 함수
async function proceedAppInit() {
    try {
        const isSetup = await CheckSetupComplete();
        if (isSetup) {
            renderLoginScreen(await window.go.main.App.GetLoginIndex());
        } else {
            renderFirstRunScreen();
        }
    } catch (err) {
        app.innerHTML = `<div class="p-10 text-center text-danger font-bold">계정 정보를 불러올 수 없습니다.<br>${err}</div>`;
    }
}

// ===== 앱 시작 =====
async function init() {
    try {
        // 최초 실행 시 개인정보 보호 서약 동의 여부 검사
        const isAgreed = await window.go.main.App.IsAgreementAccepted?.();
        if (!isAgreed) {
            renderAgreementModal(() => {
                // 서약서 동의 완료 후에만 서버 업데이트 확인 및 초기화 진행
                checkUpdateOnStartup();
                proceedAppInit();
            });
            return;
        }

        // 이미 서약에 동의한 경우 정상 초기화 진행
        checkUpdateOnStartup();
        proceedAppInit();
    } catch (err) {
        console.warn('동의 여부 확인 실패:', err);
        proceedAppInit();
    }
}

// 전역 플로팅 피드백 버튼 리스너 바인딩 (모든 페이지 공통)
function bindGlobalFeedbackListener() {
    const btn = document.getElementById('globalFeedbackFloatingBtn');
    if (btn && !btn.dataset.bound) {
        btn.dataset.bound = 'true';
        btn.addEventListener('click', () => {
            openExternalUrlSafe(FEEDBACK_BOARD_URL);
        });
    }
}
bindGlobalFeedbackListener();
document.addEventListener('DOMContentLoaded', bindGlobalFeedbackListener);

init();

// ==========================================
// ===== 로그인 화면 =====
async function renderLoginScreen(schoolName) {
    app.className = '';
    updateAppWindowTitle();
    try {
        const loginIndex = typeof schoolName === 'string' ? { schoolName, accounts: [] } : schoolName;
        schoolName = loginIndex.schoolName || '암호화된 학교 데이터';
        const roleOrder = { master: 0, homeroom: 1, viewer: 2 };
        const loginAccounts = [...(loginIndex.accounts || [])].sort((a, b) => {
            const roleDiff = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
            return roleDiff || (a.classNum || 0) - (b.classNum || 0) || a.username.localeCompare(b.username);
        });
        let localVer = '0.5.5';
        try {
            localVer = await window.go.main.App.GetAppVersion();
        } catch (e) {
            console.warn(e);
        }

        const savedLastUsername = localStorage.getItem('phgc_last_login_username') || '';

        app.innerHTML = `
            <div class="glass-card p-10 w-full max-w-md fade-in" style="margin: 2rem;">
                <div class="text-center mb-6">
                    <img src="${logoUniversal}" alt="로고" class="w-20 h-20 mx-auto mb-3 rounded-2xl shadow-xl border border-indigo-500/30 object-cover" style="animation: float 3s ease-in-out infinite;" />
                    <h1 class="text-2xl font-black text-white tracking-tight mb-1">그래서? 넌 어디 갈래?</h1>
                    <div class="flex items-center justify-center gap-1.5 mt-2 flex-wrap">
                        <span class="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-[11px] font-bold">🏫 ${schoolName}</span>
                        <span class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[11px] font-bold">🔒 100% 오프라인</span>
                    </div>
                </div>
                <form id="loginForm" class="space-y-4">
                    <div>
                        <label class="block text-xs font-semibold text-text-muted mb-1.5">로그인 계정 선택</label>
                        <select id="loginUsername" class="input-field cursor-pointer py-2 text-xs" required>
                            ${loginAccounts.map(account => {
                                const isSelected = savedLastUsername ? account.username === savedLastUsername : false;
                                return `<option value="${account.username}" ${isSelected ? 'selected' : ''}>${account.role === 'master' ? '학년부장' : account.role === 'viewer' ? '진로부장' : `${account.username} 담임`}</option>`;
                            }).join('') || '<option value="admin">학년부장 (admin)</option>'}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-text-muted mb-1.5">비밀번호</label>
                        <input type="password" id="loginPassword" class="input-field py-2 text-xs" placeholder="비밀번호 입력" required />
                    </div>
                    <div id="sharedPasswordRow" class="hidden">
                        <label class="block text-xs font-semibold text-amber-300 mb-1.5">공용 데이터 암호 <span class="text-slate-400 font-normal">(이 PC 첫 실행만)</span></label>
                        <input type="password" id="sharedLoginPassword" class="input-field py-2 text-xs" placeholder="학년부장에게 받은 공용 데이터 암호" />
                    </div>
                    <div class="pt-2">
                        <button type="submit" id="loginBtn" class="btn-primary py-2 text-xs font-bold">로그인</button>
                    </div>
                    <div id="loginError" class="error-msg text-center text-xs"></div>
                    <div class="space-y-2.5 mt-5 pt-4 border-t border-slate-700/60">
                        <button type="button" id="distributionPackageImportBtn" 
                                class="group w-full py-2.5 px-4 rounded-xl border border-emerald-500/40 bg-emerald-950/25 hover:bg-emerald-900/40 hover:border-emerald-400/70 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-[0.99]">
                            <span class="text-base group-hover:scale-110 transition-transform">📦</span>
                            <span class="font-bold text-emerald-300 text-xs tracking-wide">학년부장 배포 자료 가져오기 (.phgcpkg)</span>
                        </button>
                        <button type="button" id="passwordResetImportBtn" 
                                class="group w-full py-2.5 px-4 rounded-xl border border-sky-500/40 bg-sky-950/25 hover:bg-sky-900/40 hover:border-sky-400/70 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-[0.99]">
                            <span class="text-base group-hover:scale-110 transition-transform">🔑</span>
                            <span class="font-bold text-sky-300 text-xs tracking-wide">비밀번호 재설정 파일 가져오기 (.phgcreset)</span>
                        </button>
                        <button type="button" id="finalArchiveImportBtn" 
                                class="group w-full py-2.5 px-4 rounded-xl border border-amber-500/30 bg-amber-950/15 hover:bg-amber-900/30 hover:border-amber-400/60 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-[0.99]">
                            <span class="text-base group-hover:scale-110 transition-transform">🗄️</span>
                            <span class="font-bold text-amber-300/90 group-hover:text-amber-200 text-xs tracking-wide">암호화 최종 보관본 복원하기</span>
                        </button>
                    </div>
                </form>

                <!-- 현재 설치된 버전 -->
                <div class="mt-6 flex flex-col items-center justify-center text-xs text-text-muted gap-1.5">
                    <div>
                        <span>현재 버전: <strong class="text-indigo-300 font-mono font-bold">v${localVer}</strong></span>
                    </div>
                    <div id="startupUpdateStatus" class="text-[11px] text-slate-400"></div>
                </div>
            </div>
        `;

        const refreshSharedPasswordRequirement = async () => {
            const username = document.getElementById('loginUsername').value;
            const required = await window.go.main.App.NeedsSharedDataPassword(username);
            document.getElementById('sharedPasswordRow').classList.toggle('hidden', !required);
            document.getElementById('sharedLoginPassword').required = required;
        };
        document.getElementById('loginUsername').addEventListener('change', refreshSharedPasswordRequirement);
        await refreshSharedPasswordRequirement();

        document.getElementById('distributionPackageImportBtn').addEventListener('click', async () => {
            const button = document.getElementById('distributionPackageImportBtn');
            try {
                button.disabled = true;
                button.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px;"></span> <span class="text-xs font-bold text-emerald-200">배포 자료 적용 중...</span>';
                const username = await window.go.main.App.OpenDistributionPackage();
                if (!username) return;
                const accountSelect = document.getElementById('loginUsername');
                const exists = [...accountSelect.options].some(option => option.value === username);
                if (!exists) {
                    accountSelect.insertAdjacentHTML('beforeend', `<option value="${username}">${username}</option>`);
                }
                accountSelect.value = username;
                await refreshSharedPasswordRequirement();
                document.getElementById('loginPassword').focus();
                await showModalAlert(`'${username}' 계정의 배포 자료를 성공적으로 적용했습니다.\n(기존에 작성하신 상담 일지와 희망학교 데이터도 안전하게 보존되었습니다)\n\n학년부장에게 받은 공용 데이터 암호와 초기 비밀번호로 처음 로그인하세요.`, '배포 자료 적용 완료', 'success');
            } catch (err) {
                await showModalAlert('배포 자료 가져오기 실패: ' + err, '오류', 'error');
            } finally {
                button.disabled = false;
                button.innerHTML = '<span class="text-base group-hover:scale-110 transition-transform">📦</span><span class="font-bold text-emerald-300 text-xs tracking-wide">학년부장 배포 자료 가져오기 (.phgcpkg)</span>';
            }
        });

        document.getElementById('passwordResetImportBtn')?.addEventListener('click', async () => {
            const button = document.getElementById('passwordResetImportBtn');
            try {
                button.disabled = true;
                button.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px;"></span> <span class="text-xs font-bold text-sky-200">재설정 파일 확인 중...</span>';
                const username = await window.go.main.App.OpenPasswordResetPackage();
                if (!username) return;
                await showModalAlert(`'${username}' 계정의 비밀번호 재설정 파일이 성공적으로 적용되었습니다.\n기존 학급 상담 데이터는 안전하게 보존되며, 학년부장이 설정한 새 비밀번호로 로그인해 주세요.`, '비밀번호 재설정 완료', 'success');
                window.location.reload();
            } catch (err) {
                await showModalAlert('비밀번호 재설정 파일 적용 실패: ' + err, '오류', 'error');
            } finally {
                button.disabled = false;
                button.innerHTML = '<span class="text-base group-hover:scale-110 transition-transform">🔑</span><span class="font-bold text-sky-300 text-xs tracking-wide">비밀번호 재설정 파일 가져오기 (.phgcreset)</span>';
            }
        });

        document.getElementById('finalArchiveImportBtn').addEventListener('click', async () => {
            const button = document.getElementById('finalArchiveImportBtn');
            const password = await showModalPrompt({
                title: '최종 보관본 복원',
                message: '최종 보관본 암호를 입력하세요. 복원은 새 프로그램 폴더에서만 가능합니다.',
                isPassword: true
            });
            if (!password) return;
            try {
                button.disabled = true;
                button.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px;"></span> <span class="text-xs font-bold text-amber-200">최종 보관본 복원 중...</span>';
                const path = await window.go.main.App.OpenFinalArchive();
                if (!path) return;
                const school = await window.go.main.App.ImportFinalArchive(path, password);
                await showModalAlert(`${school} 최종 보관본을 복원했습니다.\n학년부장 개인 비밀번호로 로그인하세요.`, '복원 완료', 'success');
                window.location.reload();
            } catch (err) {
                await showModalAlert('최종 보관본 복원 실패: ' + err, '오류', 'error');
            } finally {
                button.disabled = false;
                button.innerHTML = '<span class="text-base group-hover:scale-110 transition-transform">🗄️</span><span class="font-bold text-amber-300/90 group-hover:text-amber-200 text-xs tracking-wide">암호화 최종 보관본 복원하기</span>';
            }
        });

        document.getElementById('loginPassword').focus();
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            const sharedRow = document.getElementById('sharedPasswordRow');
            const isSharedRequired = sharedRow && !sharedRow.classList.contains('hidden');
            const sharedPassword = isSharedRequired ? document.getElementById('sharedLoginPassword').value.trim() : '';
            const btn = document.getElementById('loginBtn');
            const errorDiv = document.getElementById('loginError');

            if (isSharedRequired && !sharedPassword) {
                errorDiv.textContent = '학년부장에게 받은 공용 데이터 암호를 입력해 주세요.';
                errorDiv.classList.add('show');
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span>확인 중...';
            errorDiv.classList.remove('show');

            try {
                const user = isSharedRequired
                    ? await window.go.main.App.UnlockSharedAndLogin(username, password, sharedPassword)
                    : await window.go.main.App.UnlockAndLogin(username, password);
                window.currentUser = user;
                ScreenLockManager.resetTimer();
                localStorage.setItem('phgc_last_login_username', username);

                if (user.MustChangePassword) {
                    renderPasswordChangeScreen(username);
                } else {
                    if (user.Role === 'homeroom') {
                        updateAppWindowTitle('homeroom', user.ClassNum);
                        renderTeacherScreen(schoolName, user.ClassNum);
                    } else if (user.Role === 'viewer') {
                        updateAppWindowTitle('viewer');
                        renderTeacherScreen(schoolName, null);
                    } else {
                        updateAppWindowTitle('master');
                        renderAdminScreen(schoolName);
                    }
                }
            } catch (err) {
                errorDiv.textContent = err;
                errorDiv.classList.add('show');
                btn.disabled = false;
                btn.innerHTML = '로그인';
            }
        });
    } catch (err) {
        app.innerHTML = `<div class="text-danger py-10 text-center">계정 정보를 불러오지 못했습니다. 데이터베이스를 확인해주세요.<br>${err}</div>`;
    }
}

// ===== 비밀번호 변경 화면 =====
function renderPasswordChangeScreen(username) {
    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-md fade-in" style="margin: 2rem;">
            <div class="text-center mb-8">
                <div class="text-5xl mb-4">🔑</div>
                <h1 class="text-2xl font-bold text-white mb-2">초기 비밀번호 변경</h1>
                <p class="text-text-muted text-sm">보안을 위해 비밀번호를 새로 설정해주세요.</p>
            </div>
            <form id="pwChangeForm" class="space-y-5">
                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">새 비밀번호</label>
                    <input type="password" id="newPassword" class="input-field" required />
                </div>
                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">새 비밀번호 확인</label>
                    <input type="password" id="newPasswordConfirm" class="input-field" required />
                </div>
                <div class="pt-3">
                    <button type="submit" id="pwChangeBtn" class="btn-primary">변경 완료 및 시작</button>
                </div>
                <div id="pwChangeError" class="error-msg text-center"></div>
            </form>
        </div>
    `;

    document.getElementById('newPassword').focus();
    document.getElementById('pwChangeForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pw = document.getElementById('newPassword').value;
        const pwC = document.getElementById('newPasswordConfirm').value;
        const btn = document.getElementById('pwChangeBtn');
        const err = document.getElementById('pwChangeError');

        if (pw !== pwC) {
            err.textContent = "비밀번호가 일치하지 않습니다.";
            err.classList.add('show');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>변경 중...';

        try {
            await window.go.main.App.ChangeUserPassword(username, pw);
            window.currentUser.MustChangePassword = false;
            const config = await window.go.main.App.GetSchoolConfig();
            if (window.currentUser.Role === 'homeroom') {
                renderTeacherScreen(config.schoolName, window.currentUser.ClassNum);
            } else if (window.currentUser.Role === 'viewer') {
                renderTeacherScreen(config.schoolName, null);
            } else {
                renderAdminScreen(config.schoolName);
            }
        } catch (e) {
            err.textContent = e;
            err.classList.add('show');
            btn.disabled = false;
            btn.innerHTML = '변경 완료 및 시작';
        }
    });
}

// ===== 사용자 및 권한 관리 화면 =====
async function renderUserManagementScreen(schoolName) {
    app.className = 'wide-layout';

    let classCount = 8;
    try {
        const config = await window.go.main.App.GetSchoolConfig();
        classCount = config.classCount;
    } catch (e) {
        console.error(e);
    }

    let classOptions = '';
    for (let i = 1; i <= classCount; i++) {
        classOptions += `<option value="${i}">${i}반</option>`;
    }

    app.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-[1700px] mx-auto min-h-[85vh]">
            <div class="flex items-center justify-between mb-8 pb-4 border-b border-slate-700/50">
                <div>
                    <h1 class="text-2xl font-bold text-white flex items-center gap-3">
                        👥 스마트 사용자 및 권한 관리
                    </h1>
                    <p class="text-text-muted text-sm mt-1">${schoolName} — 교사별 권한 및 계정을 자유롭게 추가/삭제/관리합니다.</p>
                </div>
                <div class="flex items-center gap-4">
                    <button id="backToAdminBtn" class="btn-secondary whitespace-nowrap text-xs px-4 py-2.5">
                        ← 대시보드로 돌아가기
                    </button>
                </div>
            </div>

            <div class="space-y-6">
                <!-- 새 사용자 계정 추가 폼 -->
                <div class="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
                    <h3 class="font-bold mb-4 flex items-center gap-2 text-white text-base">
                        <span>➕</span> 새 교사/관리자 계정 등록
                    </h3>
                    <form id="addUserForm" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
                        <div>
                            <label class="block text-xs text-text-muted mb-1">사용자 ID</label>
                            <input type="text" id="newUserId" class="input-field py-2 text-xs" placeholder="예: teacher1" required />
                        </div>
                        <div>
                            <label class="block text-xs text-text-muted mb-1">초기 비밀번호</label>
                            <input type="password" id="newUserPw" class="input-field py-2 text-xs" placeholder="초기 비밀번호" required />
                        </div>
                        <div>
                            <label class="block text-xs text-text-muted mb-1">역할 (권한)</label>
                            <select id="newUserRole" class="input-field py-2 text-xs">
                                <option value="viewer">진학/학년부장 (전체 조회)</option>
                                <option value="homeroom">담임교사 (학급 담당)</option>
                                <option value="master">관리자 (전체 관리)</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-text-muted mb-1">담당 학급 (담임용)</label>
                            <select id="newUserClass" class="input-field py-2 text-xs" disabled>
                                <option value="0">해당 없음</option>
                                ${classOptions}
                            </select>
                        </div>
                        <div class="pb-0.5">
                            <button type="submit" id="addUserBtn" class="btn-primary py-2 px-4 rounded-lg font-bold shadow whitespace-nowrap w-full text-xs flex items-center justify-center gap-1.5">
                                <span>➕</span> 계정 생성
                            </button>
                        </div>
                    </form>
                    <div id="addUserError" class="mt-2 text-xs text-danger hidden font-bold"></div>
                </div>

                <!-- 담임 계정 일괄 비밀번호 설정 -->
                <div class="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
                    <h3 class="font-bold mb-3 flex items-center gap-2 text-white text-base">
                        <span>🔑</span> 담임 계정 일괄 비밀번호 발급
                    </h3>
                    <form id="bulkPasswordForm" class="flex gap-4 items-end max-w-xl">
                        <div class="flex-1">
                            <label class="block text-xs text-text-muted mb-1">모든 담임(1반~N반) 공통 초기 비밀번호</label>
                            <input type="password" id="bulkPw" class="input-field py-2 text-xs" placeholder="공통 비밀번호 입력" required />
                        </div>
                        <div class="flex-none pb-0.5">
                            <button type="submit" id="bulkPwBtn" class="btn-primary py-2 px-4 rounded-lg font-bold shadow whitespace-nowrap text-xs" style="width: auto;">일괄 적용</button>
                        </div>
                    </form>
                    <div id="bulkPwError" class="mt-2 text-xs text-danger hidden font-bold"></div>
                </div>

                <!-- 계정 목록 -->
                <div>
                    <h3 class="font-bold mb-3 flex items-center gap-2 text-white text-base"><span>📋</span> 등록된 교사/관리자 계정 목록</h3>
                    <div class="bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden">
                        <table class="w-full text-left text-xs sm:text-sm">
                            <thead class="bg-slate-800/80 text-text-muted">
                                <tr>
                                    <th class="p-3.5 font-semibold">구분 (역할)</th>
                                    <th class="p-3.5 font-semibold">사용자 아이디</th>
                                    <th class="p-3.5 font-semibold">비번 상태</th>
                                    <th class="p-3.5 font-semibold text-center">비밀번호 재발급</th>
                                    <th class="p-3.5 font-semibold text-center">교사용 배포 자료</th>
                                    <th class="p-3.5 font-semibold text-center w-24">계정 삭제</th>
                                </tr>
                            </thead>
                            <tbody id="userListBody" class="divide-y divide-slate-700/50">
                                <tr><td colspan="6" class="p-8 text-center text-text-muted">불러오는 중...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('backToAdminBtn').addEventListener('click', () => {
        app.className = '';
        renderAdminScreen(schoolName);
    });

    const roleSelect = document.getElementById('newUserRole');
    const classSelect = document.getElementById('newUserClass');
    roleSelect.addEventListener('change', () => {
        if (roleSelect.value === 'homeroom') {
            classSelect.disabled = false;
            classSelect.value = "1";
        } else {
            classSelect.disabled = true;
            classSelect.value = "0";
        }
    });

    // 계정 추가 처리
    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('newUserId').value.trim();
        const pw = document.getElementById('newUserPw').value;
        const role = roleSelect.value;
        const classNum = parseInt(classSelect.value) || 0;
        const btn = document.getElementById('addUserBtn');
        const err = document.getElementById('addUserError');

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> 생성 중...';
        err.classList.add('hidden');

        try {
            await window.go.main.App.CreateUser(id, pw, role, classNum);
            document.getElementById('newUserId').value = '';
            document.getElementById('newUserPw').value = '';
            alert(`'${id}' 계정이 성공적으로 등록되었습니다.`);
            loadUserList();
        } catch (error) {
            err.textContent = '등록 실패: ' + error;
            err.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>➕</span> 계정 생성';
        }
    });

    // 담임 일괄 비밀번호 처리
    document.getElementById('bulkPasswordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pw = document.getElementById('bulkPw').value;
        const btn = document.getElementById('bulkPwBtn');
        const err = document.getElementById('bulkPwError');

        const confirmed = await showModalConfirm({
            title: '담임 비밀번호 일괄 설정',
            message: '모든 담임(1반~N반)의 비밀번호를 일괄 설정/초기화 하시겠습니까?',
            confirmText: '일괄 설정',
            type: 'warning'
        });
        if (!confirmed) return;

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>...';
        err.classList.add('hidden');

        try {
            const users = await window.go.main.App.GetUsers();
            const homerooms = users.filter(u => u.Role === 'homeroom');
            for (const hr of homerooms) {
                await window.go.main.App.SetUserPassword(hr.Username, pw);
            }
            document.getElementById('bulkPw').value = '';
            alert('모든 담임 계정의 비밀번호가 일괄 설정되었습니다.');
            loadUserList();
        } catch (error) {
            err.textContent = error;
            err.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.textContent = '일괄 적용';
        }
    });

    // 계정 목록 로드
    async function loadUserList() {
        const tbody = document.getElementById('userListBody');
        try {
            const users = await window.go.main.App.GetUsers();
            tbody.innerHTML = '';

            users.forEach(u => {
                const isInitial = u.MustChangePassword;
                let roleLabel = '학년부장 (관리자)';
                if (u.Role === 'homeroom') roleLabel = `${u.ClassNum}반 담임`;
                else if (u.Role === 'viewer') roleLabel = '진로부장 (조회전용)';

                let statusBadge = isInitial
                    ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-warning/20 text-warning border border-warning/30">초기 상태</span>`
                    : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-success/20 text-success border border-success/30">사용 중</span>`;

                const isMasterAdmin = u.Username === 'admin';

                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-800/30 transition-colors";
                tr.innerHTML = `
                    <td class="p-3.5 font-bold text-slate-200">${escapeHtml(roleLabel)}</td>
                    <td class="p-3.5 text-text-muted font-mono">${escapeHtml(u.Username)}</td>
                    <td class="p-3.5">${statusBadge}</td>
                    <td class="p-3.5 text-center">
                        <div class="flex items-center justify-center gap-1.5">
                            <input type="password" class="input-field py-1 px-2.5 text-xs w-28 input-user-pw" placeholder="새 비번" />
                            <button type="button" class="btn-primary py-1 px-2.5 text-xs whitespace-nowrap rounded font-bold btn-update-pw" style="width: auto;">
                                ${isInitial ? '비번 설정' : '재설정'}
                            </button>
                        </div>
                    </td>
                    <td class="p-3.5 text-center">
                        ${isMasterAdmin
                        ? '<span class="text-xs text-slate-600 font-bold">해당 없음</span>'
                        : `<button type="button" class="text-xs text-indigo-200 hover:text-white font-bold px-2 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-400/30 transition-colors btn-dist-pkg">배포 자료 만들기</button>`
                    }
                    </td>
                    <td class="p-3.5 text-center">
                        ${isMasterAdmin
                        ? '<span class="text-xs text-slate-600 font-bold">보호됨</span>'
                        : `<button type="button" class="text-xs text-danger hover:underline font-bold px-2 py-1 rounded bg-danger/10 hover:bg-danger/20 border border-danger/30 transition-colors btn-delete-user">삭제</button>`
                    }
                    </td>
                `;

                // 안전한 이벤트 리스너 바인딩 (인라인 onclick 제거)
                const pwInput = tr.querySelector('.input-user-pw');
                const btnPw = tr.querySelector('.btn-update-pw');
                if (btnPw && pwInput) {
                    btnPw.addEventListener('click', () => {
                        window.updateUserPassword(u.Username, pwInput.value);
                    });
                    pwInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            window.updateUserPassword(u.Username, pwInput.value);
                        }
                    });
                }
                const btnDist = tr.querySelector('.btn-dist-pkg');
                if (btnDist) {
                    btnDist.addEventListener('click', () => {
                        window.createDistributionPackage(u.Username);
                    });
                }
                const btnDel = tr.querySelector('.btn-delete-user');
                if (btnDel) {
                    btnDel.addEventListener('click', () => {
                        window.deleteUserAccount(u.Username);
                    });
                }

                tbody.appendChild(tr);
            });
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-danger font-bold">${escapeHtml(String(error))}</td></tr>`;
        }
    }

    window.updateUserPassword = async (username, directPw) => {
        let pw = directPw;
        let inputEl = document.getElementById(`pw_${username}`);
        if (typeof pw !== 'string' || !pw) {
            pw = inputEl ? inputEl.value : '';
        }
        if (!pw) {
            await showModalAlert('새 비밀번호를 입력하세요.', '입력 확인', 'warning');
            return;
        }

        const confirmed = await showModalConfirm({
            title: '비밀번호 설정',
            message: `'${username}' 계정의 비밀번호를 새로 설정하시겠습니까?`,
            confirmText: '설정하기',
            type: 'warning'
        });
        if (confirmed) {
            try {
                await window.go.main.App.SetUserPassword(username, pw);
                if (username !== 'admin') {
                    const resetPath = await window.go.main.App.SavePasswordResetPackage(username);
                    if (!resetPath) {
                        throw new Error('비밀번호는 설정되었지만 재설정 파일 저장이 취소되었습니다. 다시 재설정해 파일을 전달하세요.');
                    }
                    await showModalAlert(`비밀번호가 설정되고 재설정 파일이 만들어졌습니다.\n담임에게 프로그램과 함께 다음 파일을 전달하세요.\n\n${resetPath}`, '재설정 파일 생성 완료', 'success');
                } else {
                    await showModalAlert('관리자 비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.', '비밀번호 변경 완료', 'success');
                }
                if (inputEl) inputEl.value = '';
                loadUserList();
            } catch (err) {
                await showModalAlert('설정 실패: ' + err, '오류 발생', 'error');
            }
        }
    };

    window.deleteUserAccount = async (username) => {
        const confirmed = await showModalConfirm({
            title: '계정 삭제',
            message: `정말로 '${username}' 계정을 삭제하시겠습니까?`,
            confirmText: '삭제',
            type: 'error'
        });
        if (confirmed) {
            try {
                await window.go.main.App.DeleteUser(username);
                await showModalAlert('계정이 삭제되었습니다.', '완료', 'success');
                loadUserList();
            } catch (err) {
                await showModalAlert('삭제 실패: ' + err, '오류', 'error');
            }
        }
    };

    window.createDistributionPackage = async (username) => {
        const confirmed = await showModalConfirm({
            title: '배포 자료 생성',
            message: `'${username}' 계정용 교사용 배포 자료를 만들까요?\n\n담임용 자료에는 해당 반 DB만, 진로부장용 자료에는 조회용 전체 학급 DB가 포함됩니다. 관리자 계정과 다른 담임 계정은 포함되지 않습니다.`,
            confirmText: '생성하기',
            type: 'info'
        });
        if (!confirmed) return;
        try {
            const path = await window.go.main.App.SaveDistributionPackage(username);
            if (!path) return;
            await showModalAlert(`'${username}' 계정용 배포 자료 생성이 완료되었습니다!\n\n📂 저장 위치:\n${path}\n\n💡 [안내 사항]\n• 담임 선생님께 프로그램 실행 파일과 위 배포 자료(.phgcpkg), 그리고 학년부장의 [공용 데이터 암호]를 함께 전달해 주세요.\n• 담임 선생님은 로그인 화면에서 ‘배포 자료 가져오기’를 누른 후, 공용 데이터 암호를 입력하여 안전하게 최초 로그인하실 수 있습니다.`, '배포 자료 준비 완료', 'success');
        } catch (err) {
            await showModalAlert('배포 자료 생성 실패: ' + err, '오류', 'error');
        }
    };

    loadUserList();
}

// ===== 고교별 커트라인 관리 화면 (단일 페이지 통합 네비게이션 & 최저/최고/평균 입력 지원) =====
async function renderCutoffScreen(schoolName) {
    app.className = 'wide-layout';

    const currentMiddleSchoolYear = new Date().getFullYear();
    let currentAdmissionYear = currentMiddleSchoolYear + 1;
    try {
        const config = await GetSchoolConfig();
        if (config && config.admissionYear) {
            currentAdmissionYear = config.admissionYear;
        }
    } catch (e) {
        console.warn(e);
    }

    let allSavedCutoffs = [];
    try {
        allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
    } catch (e) {
        console.error(e);
    }

    // 각 연도별 저장된 유효 커트라인 건수 집계 헬퍼
    const getCutoffCountByYear = (yr) => {
        return (allSavedCutoffs || []).filter(c => Number(c.year) === Number(yr) && Number(c.minValue) > 0).length;
    };

    // DB에 존재하는 모든 연도 및 기준 5개년 포함 후보 연도 산출
    const existingYears = (allSavedCutoffs || []).map(c => Number(c.year)).filter(y => !isNaN(y) && y > 2000);
    const candidateYears = new Set([currentAdmissionYear, currentMiddleSchoolYear + 1, currentMiddleSchoolYear, ...existingYears]);
    for (let i = 0; i < 5; i++) {
        candidateYears.add((currentMiddleSchoolYear + 1) - i);
    }
    const admissionYears = Array.from(candidateYears).sort((a, b) => b - a);

    // 데이터가 가장 많이 등록된 연도가 있다면 기본 선택 우선 배정 (등록된 연도 바로 보여주기)
    const yearWithMostData = admissionYears.find(y => getCutoffCountByYear(y) > 0);
    if (getCutoffCountByYear(currentAdmissionYear) === 0 && yearWithMostData) {
        currentAdmissionYear = yearWithMostData;
    }

    // 기본 등록 고교 및 학과 목록 (동적 로드 전 빈 배열, 서버 데이터로 채워짐)
    let defaultSchoolSpecs = [];

    // 울산 관내 공용 고교 목록 동적 로드 (서버의 highschools.json에서 읽어옴)
    try {
        const highSchoolData = await window.go.main.App.GetHighSchoolsData();
        const schools = highSchoolData?.schools || [];
        const catalogSpecs = schools
            .filter(s => {
                const t = (s.type || s.Type || '').toLowerCase();
                const note = (s.note || s.Note || '');
                // 영문 코드 및 한글 타입 모두 호환
                return t === 'meister' || t === 'special' || t === '마이스터고' || t === '특성화고'
                    || note.includes('마이스터고') || note.includes('특성화고');
            })
            .map(s => {
                const t = (s.type || s.Type || '').toLowerCase();
                const note = (s.note || s.Note || '');
                const isMeister = t === 'meister' || t === '마이스터고' || note.includes('마이스터고');
                const tracks = isMeister ? ['일반', '특별'] : ['일반', '취업희망자'];
                const rawName = s.name || s.Name || '';
                const shortName = normalizeSchoolName(rawName);
                // 각 학교별 환산 만점을 Go 백엔드의 AllSchoolRules에서 가져옴 (프론트엔드 하드코딩 제거)
                let totalMax = '100점 만점';
                try {
                    const rules = window._allSchoolRules || [];
                    const matchRule = rules.find(r => normalizeSchoolName(r.schoolName) === shortName && r.trackName === '일반');
                    if (matchRule && matchRule.totalMax) {
                        totalMax = `${matchRule.totalMax}점 만점`;
                    }
                } catch (_) {}
                // 하드코딩 fallback (백엔드 규칙 로드 실패 시)
                if (totalMax === '100점 만점' && isMeister) {
                    if (shortName === '울산마이스터고') totalMax = '300점 만점';
                    else if (shortName === '울산에너지고') totalMax = '230점 만점';
                    else if (shortName === '현대공업고') totalMax = '200점 만점';
                }
                const depts = s.departments || s.Departments || [];
                const defaultItems = isMeister
                    ? [
                        { dept: '', track: '일반' },
                        { dept: '', track: '특별' },
                        ...depts.flatMap(dept => tracks.map(track => ({ dept, track })))
                    ]
                    : depts.flatMap(dept => tracks.map(track => ({ dept, track })));
                return {
                    name: shortName,
                    fullName: rawName,
                    category: isMeister ? 'meister' : 'special',
                    categoryLabel: isMeister ? '마이스터고' : '특성화고',
                    totalMax,
                    scoreType: 'total_score',
                    unit: '점',
                    placeholder: isMeister ? '예: 200.0' : '예: 75.0',
                    items: defaultItems.length > 0 ? defaultItems : [{ dept: '', track: '일반' }],
                };
            });
        if (catalogSpecs.length) {
            defaultSchoolSpecs = [
                ...catalogSpecs,
                {
                    name: '울산 후기 일반계고', category: 'general', categoryLabel: '후기 일반고',
                    totalMax: '석차 백분율', scoreType: 'percentile', unit: '%', placeholder: '예: 85.00',
                    items: [{ dept: '공통', track: '일반' }],
                },
            ];
        }
    } catch (e) {
        console.warn('공용 고교 목록을 불러오지 못해 빈 목록으로 시작합니다:', e);
    }

    // 전형명 정규화 헬퍼 ('일반전형' -> '일반', '특별전형' -> '특별')
    const normalizeTrack = (t) => {
        if (!t) return '일반';
        const s = String(t).trim();
        if (s === '일반' || s === '일반전형') return '일반';
        if (s === '특별' || s === '특별전형') return '특별';
        if (s === '취업' || s === '취업희망자' || s === '취업희망자전형') return '취업희망자';
        if (s === '일반계고' || s === '일반계고전형') return '일반계고';
        return s.replace(/전형$/, '');
    };

    // 학과명 정규화 헬퍼 ('공통', '전체', '학교 전체' -> '')
    const normalizeDept = (d) => {
        if (!d) return '';
        const s = String(d).trim();
        return (s === '공통' || s === '전체' || s === '학교 전체') ? '' : s;
    };

    // 브라우저 캐시 잔재(구버전 localStorage) 완전 삭제
    try {
        localStorage.removeItem('publicOfficialCutoffData');
    } catch (_) {}

    // 공식 공개 입결 데이터 (하드코딩 없이 백엔드 data/official_admission_data.json 기반 로드)
    let publicOfficialData = [];

    try {
        const officialResp = await window.go.main.App.GetOfficialAdmissionData().catch(() => null);
        if (officialResp?.items && Array.isArray(officialResp.items) && officialResp.items.length > 0) {
            publicOfficialData = officialResp.items.map(item => ({
                year: Number(item.admissionYear || item.year || currentAdmissionYear),
                school: item.schoolName || item.school || '',
                dept: item.department || '',
                track: item.track || '일반',
                min: Number(item.minAcceptedScore || item.minValue || item.min || 0) || '',
                max: Number(item.maxFailedScore || item.maxValue || item.max || 0) || '',
                avg: Number(item.avgAcceptedScore || item.avgValue || item.avg || 0) || '',
                unit: item.unit || '점',
                note: item.source || item.note || '공식자료'
            })).filter(x => {
                if (!x.school || x.school.includes('청량고')) return false;
                return true;
            });
        }
    } catch (e) {
        console.warn('공식 공개 데이터 불러오기 실패:', e);
        publicOfficialData = [];
    }

    // 공식 공개자료 백엔드 저장 헬퍼 (data/official_admission_data.json 동기화)
    const syncPublicOfficialData = async () => {
        try {
            if (window.go?.main?.App?.SaveOfficialAdmissionData) {
                const itemsToSave = publicOfficialData.map(p => ({
                    admissionYear: Number(p.year) || currentAdmissionYear,
                    schoolName: p.school || '',
                    department: p.dept || '',
                    track: p.track || '일반',
                    minAcceptedScore: Number(p.min) || 0,
                    maxFailedScore: Number(p.max) || 0,
                    avgAcceptedScore: Number(p.avg) || 0,
                    unit: p.unit || (String(p.school).includes('일반계고') ? '%' : '점'),
                    source: p.note || '공식자료'
                }));
                await window.go.main.App.SaveOfficialAdmissionData(itemsToSave);
            }
        } catch (e) {
            console.error('공식자료 저장 실패:', e);
        }
    };


    let currentTab = 'all'; // 'all', 'meister', 'special', 'general', 'public'
    let searchKeyword = '';
    let publicYearFilterMode = 'current'; // 'current': 상단 고교 입학년도 동기화, 'all': 전체 연도 모아보기
    let deletedCutoffList = []; // 사용자가 UI에서 삭제하거나 비운 커트라인 목록 (DB 삭제 동기화용)

    const renderMainScreen = () => {
        // 현재 선택된 입학년도의 커트라인 매핑 (다양한 학과명/전형명 표기 완벽 호환)
        const savedMap = {};
        allSavedCutoffs.filter(c => Number(c.year) === Number(currentAdmissionYear)).forEach(c => {
            const schKey = normalizeSchoolName(c.schoolName);
            const deptNorm = normalizeDept(c.department);
            const trackNorm = normalizeTrack(c.track);
            const entry = {
                min: c.minValue,
                max: c.maxValue,
                avg: c.avgValue
            };

            // 정규화 키 및 원본 키 모두 등록
            savedMap[`${schKey}_${deptNorm}_${trackNorm}`] = entry;
            savedMap[`${schKey}_${c.department}_${c.track}`] = entry;
            savedMap[`${schKey}_${deptNorm}_${c.track}`] = entry;
            savedMap[`${schKey}_${c.department}_${trackNorm}`] = entry;

            // 공통/학교 전체인 경우
            if (deptNorm === '') {
                savedMap[`${schKey}_공통_${trackNorm}`] = entry;
                savedMap[`${schKey}_공통_${c.track}`] = entry;
                savedMap[`${schKey}__${trackNorm}`] = entry;
                savedMap[`${schKey}__${c.track}`] = entry;
            }
        });

        // 탭 및 검색어 필터링
        const filteredSchools = defaultSchoolSpecs.filter(sch => {
            const matchTab = currentTab === 'all' || sch.category === currentTab;
            if (!matchTab) return false;
            if (!searchKeyword) return true;
            const q = searchKeyword.toLowerCase();
            return sch.name.toLowerCase().includes(q) || sch.items.some(it => (it.dept || '').toLowerCase().includes(q) || (it.track || '').toLowerCase().includes(q));
        });

        // 학교 목록 카드 HTML 생성
        let schoolsHTML = '';
        if (currentTab !== 'public') {
            if (filteredSchools.length === 0) {
                schoolsHTML = `
                    <div class="glass-card p-12 text-center text-text-muted">
                        <p class="text-3xl mb-2">🔍</p>
                        <p class="font-bold text-slate-300">검색 조건에 맞는 학교가 없습니다.</p>
                        <p class="text-xs mt-1">다른 검색어를 입력하거나 탭 필터를 변경해보세요.</p>
                    </div>
                `;
            } else {
                filteredSchools.forEach((sch, sIdx) => {
                    const schKey = normalizeSchoolName(sch.name);
                    // 저장된 커트라인 값 채우기 & 사용자 추가 학과 병합
                    const itemsToRender = [];

                    // 기본 스펙의 학과·전형 항목들 먼저 추가
                    sch.items.forEach(it => {
                        const dNorm = normalizeDept(it.dept);
                        const tNorm = normalizeTrack(it.track);
                        if (!itemsToRender.some(x => normalizeDept(x.dept) === dNorm && normalizeTrack(x.track) === tNorm)) {
                            itemsToRender.push({ dept: dNorm, track: it.track });
                        }
                    });

                    // DB에 저장된 해당 연도 해당 고교의 커트라인 항목 병합 (공통/학교전체 포함!)
                    allSavedCutoffs.filter(c => Number(c.year) === Number(currentAdmissionYear) && normalizeSchoolName(c.schoolName) === schKey).forEach(c => {
                        const dNorm = normalizeDept(c.department);
                        const tNorm = normalizeTrack(c.track);
                        const exists = itemsToRender.some(it => normalizeDept(it.dept) === dNorm && normalizeTrack(it.track) === tNorm);
                        if (!exists) {
                            itemsToRender.push({ dept: dNorm, track: c.track });
                        }
                    });

                    // 같은 학과는 하나의 셀로 묶고, 그 아래에서 일반·특별 등 전형별 점수만 구분
                    const itemGroups = new Map();
                    itemsToRender.forEach(item => {
                        const groupKey = normalizeDept(item.dept);
                        if (!itemGroups.has(groupKey)) itemGroups.set(groupKey, []);
                        itemGroups.get(groupKey).push(item);
                    });
                    const rowsHTML = [...itemGroups.entries()].map(([dept, group], groupIndex) =>
                        group.map((item, itemIndex) => {
                            const deptNorm = normalizeDept(item.dept);
                            const trackNorm = normalizeTrack(item.track);

                            // 1순위: 학과+전형 정확 매칭
                            let saved = savedMap[`${schKey}_${deptNorm}_${trackNorm}`] ||
                                savedMap[`${schKey}_${deptNorm}_${item.track}`] ||
                                savedMap[`${schKey}_${item.dept}_${item.track}`];

                            // 2순위: 학교 전체(공통) 행인 경우
                            if (!saved && deptNorm === '') {
                                saved = savedMap[`${schKey}_공통_${trackNorm}`] ||
                                    savedMap[`${schKey}_공통_${item.track}`] ||
                                    savedMap[`${schKey}__${trackNorm}`] ||
                                    savedMap[`${schKey}__${item.track}`];
                            }

                            // 3순위: 학과 행인데 학과별 저장값이 없으면 학교 전체(공통) 기준선 자동 매핑
                            if (!saved && deptNorm !== '') {
                                saved = savedMap[`${schKey}__${trackNorm}`] ||
                                    savedMap[`${schKey}__${item.track}`] ||
                                    savedMap[`${schKey}_공통_${trackNorm}`] ||
                                    savedMap[`${schKey}_공통_${item.track}`];
                            }

                            const minVal = saved && saved.min !== undefined && saved.min > 0 ? saved.min : '';
                            const maxVal = saved && saved.max !== undefined && saved.max > 0 ? saved.max : '';
                            const avgVal = saved && saved.avg !== undefined && saved.avg > 0 ? saved.avg : '';
                            const groupId = `${sIdx}-${groupIndex}`;
                            return `
                                <tr class="border-b border-slate-700/40 hover:bg-slate-800/40 transition-colors cutoff-item-row" data-school="${sch.name}" data-type="${sch.scoreType}" data-dept="${dept}" data-dept-group="${groupId}">
                                    ${itemIndex === 0 ? `<td class="p-3 align-middle" rowspan="${group.length}">
                                        <input type="text" class="input-field py-1.5 px-2.5 text-xs font-bold text-white row-dept-name" value="${dept}" placeholder="비우면 학교 전체" data-dept-group="${groupId}" />
                                    </td>` : ''}
                                    <td class="p-3"><input type="text" class="input-field py-1.5 px-2.5 text-xs text-indigo-300 row-track-name" value="${item.track}" placeholder="전형 (예: 일반, 특별)" /></td>
                                    <td class="p-3 text-center"><div class="flex items-center justify-center gap-1"><input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-bold text-emerald-300 w-28 row-min-score" value="${minVal}" placeholder="${sch.placeholder}" /><span class="text-xs text-slate-400">${sch.unit}</span></div></td>
                                    <td class="p-3 text-center"><div class="flex items-center justify-center gap-1"><input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-semibold text-sky-300 w-28 row-max-score" value="${maxVal}" placeholder="선택" /><span class="text-xs text-slate-400">${sch.unit}</span></div></td>
                                    <input type="hidden" class="row-avg-score" value="${avgVal}" />
                                    <td class="p-3 text-center"><button class="text-xs text-danger/80 hover:text-danger hover:bg-danger/10 p-1.5 rounded transition-colors btn-delete-row" title="행 삭제">🗑️</button></td>
                                </tr>`;
                        }).join('')
                    ).join('');

                    schoolsHTML += `
                        <div class="p-5 rounded-2xl bg-slate-800/70 border border-slate-700/60 space-y-3 school-cutoff-card shadow-lg" data-school="${sch.name}">
                            <div class="flex items-center justify-between border-b border-slate-700/50 pb-3 flex-wrap gap-2">
                                <div class="flex items-center gap-2.5 flex-wrap">
                                    <span class="text-xl">🏫</span>
                                    <h3 class="font-bold text-white text-base">${sch.name}</h3>
                                    <span class="text-xs px-2.5 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-500/30 font-semibold">${sch.categoryLabel} (${sch.totalMax})</span>
                                    <span class="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1">🏷️ ${currentAdmissionYear}년 입학 기준</span>
                                </div>
                                <button class="text-xs btn-secondary py-1.5 px-3 rounded-lg flex items-center gap-1.5 font-bold btn-add-dept" data-school="${sch.name}" data-type="${sch.scoreType}">
                                    <span>➕</span> 학과·전형 추가
                                </button>
                            </div>

                            <div class="overflow-x-auto">
                                <table class="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr class="text-text-muted border-b border-slate-700/60 font-semibold bg-slate-900/40">
                                            <th class="p-2.5 w-44">학과명 <span class="text-slate-500 font-normal">(비우면 학교 전체)</span></th>
                                            <th class="p-2.5 w-32">전형</th>
                                            <th class="p-2.5 text-center w-44 text-emerald-300">최저점 (합격선/필수)</th>
                                            <th class="p-2.5 text-center w-44 text-sky-300">최고 불합격점 (선택)</th>
                                            <th class="p-2.5 text-center w-16">관리</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${rowsHTML}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                });
            }
        } else {
            // 공식 공개 입결 데이터 탭 뷰 (상단 입학년도 동기화 & 고교/연도별 그룹 묶음 & 실시간 검색 지원)
            const q = (searchKeyword || '').toLowerCase().trim();
            const filteredPublicList = publicOfficialData.map((item, originalIndex) => ({ ...item, originalIndex }))
                .filter(p => {
                    const matchYear = publicYearFilterMode === 'all' || Number(p.year) === currentAdmissionYear;
                    if (!matchYear) return false;
                    if (!q) return true;
                    return (p.school || '').toLowerCase().includes(q) ||
                           (p.dept || '').toLowerCase().includes(q) ||
                           (p.track || '').toLowerCase().includes(q) ||
                           (p.note || '').toLowerCase().includes(q);
                });

            // 2. 입학년도 + 고교명으로 그룹핑 (Rowspan 및 시각적 일체화)
            const groupedPublic = new Map();
            filteredPublicList.forEach(p => {
                const groupKey = `${p.year}_${normalizeSchoolName(p.school)}`;
                if (!groupedPublic.has(groupKey)) {
                    groupedPublic.set(groupKey, {
                        year: p.year,
                        school: p.school,
                        items: []
                    });
                }
                groupedPublic.get(groupKey).items.push(p);
            });

            let publicRowsHTML = '';
            if (filteredPublicList.length === 0) {
                publicRowsHTML = `
                    <tr>
                        <td colspan="11" class="p-10 text-center text-text-muted">
                            <p class="text-3xl mb-2">📭</p>
                            <p class="font-bold text-slate-300 text-sm">${currentAdmissionYear}학년도 공식 공개 데이터가 없습니다.</p>
                            <p class="text-xs mt-1 text-slate-400">'전체 연도 모아보기'를 누르거나 우측 상단 '➕ 공개자료 추가'를 통해 등록할 수 있습니다.</p>
                        </td>
                    </tr>
                `;
            } else {
                publicRowsHTML = [...groupedPublic.values()].map(group => {
                    return group.items.map((p, itemIdx) => {
                        const isFirstInGroup = itemIdx === 0;
                        const rowSpan = group.items.length;
                        const trackClean = normalizeTrack(p.track);

                        // 학교 커트라인 DB(allSavedCutoffs)에 이미 반영되었는지 확인
                        const pYear = Number(group.year) || Number(p.year) || currentAdmissionYear;
                        const pSchoolNorm = normalizeSchoolName(group.school || p.school);
                        const pDeptNorm = normalizeDept(p.dept);
                        const pTrackNorm = normalizeTrack(p.track);
                        const isApplied = allSavedCutoffs.some(c => 
                            Number(c.year) === pYear &&
                            normalizeSchoolName(c.schoolName) === pSchoolNorm &&
                            (normalizeDept(c.department) === pDeptNorm || (!c.department && pDeptNorm === '공통') || (c.department === '공통' && !pDeptNorm)) &&
                            (normalizeTrack(c.track) === pTrackNorm || (!c.track && pTrackNorm === '일반') || (c.track === '일반' && !pTrackNorm)) &&
                            Number(c.minValue) > 0
                        );

                        return `
                            <tr class="border-b border-slate-700/40 hover:bg-slate-800/40 transition-colors text-center public-item-row" data-index="${p.originalIndex}">
                                <td class="p-3 text-center border-r border-slate-700/50">
                                    <input type="checkbox" class="public-item-check cursor-pointer w-4 h-4 rounded accent-indigo-500" data-index="${p.originalIndex}" />
                                </td>
                                ${isFirstInGroup ? `
                                    <td class="p-3 align-middle bg-slate-900/60 border-r border-slate-700/50 text-center" rowspan="${rowSpan}">
                                        <div class="flex flex-col items-center justify-center gap-1">
                                            <span class="px-2.5 py-1 rounded-lg bg-indigo-950/90 border border-indigo-500/50 text-indigo-300 font-black text-xs shadow-inner">
                                                ${group.year}학년도
                                            </span>
                                            <span class="text-[10px] text-slate-400">입학 기준</span>
                                            <input type="hidden" class="public-year" data-index="${p.originalIndex}" value="${group.year}" />
                                        </div>
                                    </td>
                                    <td class="p-3 align-middle text-left pl-3 bg-slate-900/40 border-r border-slate-700/50 min-w-40" rowspan="${rowSpan}">
                                        <div class="flex items-center gap-1.5 w-full">
                                            <span class="text-base shrink-0">🏫</span>
                                            <select class="input-field py-1 px-2.5 text-xs font-bold text-white bg-slate-800 border-slate-600 rounded-lg public-school-select w-full min-w-32.5" data-group-year="${group.year}" data-group-school="${group.school}">
                                                ${[
                                                    "울산마이스터고", "울산에너지고", "현대공업고",
                                                    "울산공업고", "울산기술공업고", "울산미용예술고", "울산산업고", "울산생활과학고", "울산여자상업고", "울산상업고", "울산애니원고",
                                                    "울산 후기 일반계고"
                                                ].map(sName => `<option value="${sName}" ${normalizeSchoolName(group.school) === normalizeSchoolName(sName) ? 'selected' : ''}>${sName}</option>`).join('')}
                                                ${!["울산마이스터고", "울산에너지고", "현대공업고", "울산공업고", "울산기술공업고", "울산미용예술고", "울산산업고", "울산생활과학고", "울산여자상업고", "울산상업고", "울산애니원고", "울산 후기 일반계고"].some(sName => normalizeSchoolName(group.school) === normalizeSchoolName(sName)) && group.school ? `<option value="${group.school}" selected>${group.school}</option>` : ''}
                                            </select>
                                        </div>
                                    </td>
                                ` : ''}
                                <td class="p-2.5">
                                    <input type="text" class="input-field py-1.5 px-2 text-xs text-indigo-200 text-center w-24 public-dept" 
                                           value="${p.dept === '공통' ? '' : (p.dept || '')}" placeholder="학교 전체" data-index="${p.originalIndex}" />
                                </td>
                                <td class="p-2.5">
                                    <input type="text" class="input-field py-1.5 px-2 text-xs font-bold text-sky-200 text-center w-20 public-track" 
                                           value="${p.track === '전체' ? '' : (p.track || '')}" placeholder="전체" data-index="${p.originalIndex}" />
                                </td>
                                <td class="p-2.5 text-center">
                                    <div class="flex items-center justify-center gap-1">
                                        <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-semibold text-sky-300 w-24 public-max-score" 
                                               value="${p.max ?? ''}" placeholder="최고점" data-index="${p.originalIndex}" />
                                        <span class="text-xs text-slate-400 font-semibold">${p.unit || '점'}</span>
                                    </div>
                                </td>
                                <td class="p-2.5 text-center">
                                    <div class="flex items-center justify-center gap-1">
                                        <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-semibold text-amber-300 w-24 public-avg-score" 
                                               value="${p.avg ?? ''}" placeholder="평균점" data-index="${p.originalIndex}" />
                                        <span class="text-xs text-slate-400 font-semibold">${p.unit || '점'}</span>
                                    </div>
                                </td>
                                <td class="p-2.5 text-center">
                                    <div class="flex items-center justify-center gap-1">
                                        <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-black text-emerald-400 w-24 public-min-score" 
                                               value="${p.min ?? ''}" placeholder="최저점" data-index="${p.originalIndex}" />
                                        <span class="text-xs text-slate-400 font-semibold">${p.unit || '점'}</span>
                                    </div>
                                </td>
                                <td class="p-2.5 text-center">
                                    <input type="text" class="input-field py-1.5 px-2.5 text-xs text-slate-300 w-28 public-note" 
                                           value="${p.note || ''}" placeholder="출처/비고" data-index="${p.originalIndex}" />
                                </td>
                                <td class="p-2.5 text-center">
                                    ${isApplied ? `
                                        <span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1 shadow-xs">
                                            <span>✅</span> 반영완료
                                        </span>
                                    ` : `
                                        <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700/60 inline-flex items-center gap-1">
                                            <span>⚪</span> 미반영
                                        </span>
                                    `}
                                </td>
                                <td class="p-2.5 text-center">
                                    <div class="flex items-center justify-center gap-1.5">
                                        <button class="px-2.5 py-1.5 rounded-lg ${isApplied ? 'bg-slate-700/60 hover:bg-slate-700 border border-slate-600 text-slate-200' : 'bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300'} text-xs font-bold transition-all flex items-center gap-1 btn-apply-public-item" 
                                                data-index="${p.originalIndex}" title="${group.year}학년도 커트라인으로 ${isApplied ? '다시 적용' : '즉시 적용'}">
                                            <span>${isApplied ? '🔄' : '📥'}</span> ${isApplied ? '재반영' : '반영'}
                                        </button>
                                        <button class="text-slate-400 hover:text-danger hover:bg-danger/10 p-1.5 rounded-lg transition-colors btn-delete-public-item" 
                                                data-index="${p.originalIndex}" title="행 삭제">
                                            🗑️
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('');
                }).join('');
            }

            schoolsHTML = `
                <div class="p-6 rounded-2xl bg-slate-800/70 border border-slate-700/60 space-y-3.5 shadow-lg">
                    <!-- 상단 헤더: 제목 & 기본 액션 (연도 필터, 추가) -->
                    <div class="flex items-center justify-between border-b border-slate-700/50 pb-3 flex-wrap gap-3">
                        <div>
                            <h3 class="font-bold text-white text-base flex items-center gap-2">
                                <span>📊</span> 울산광역시 고등학교 공식 공개 합격선 및 입결 데이터
                            </h3>
                            <p class="text-xs text-text-muted mt-1">고교에서 공식 발표한 입결 자료입니다. 개별 [반영] 또는 아래 [선택/전체 일괄 반영]을 누르면 실제 진학 상담 커트라인으로 즉시 적용됩니다.</p>
                        </div>
                        <div class="flex items-center gap-2.5 flex-wrap">
                            <!-- 연도 필터 토글 -->
                            <div class="inline-flex rounded-xl bg-slate-900/80 p-1 border border-slate-700/60 shadow-inner text-xs h-8.5 items-center">
                                <button id="btnFilterPublicCurrentYear" class="px-3 py-1 rounded-lg font-bold transition-all ${publicYearFilterMode === 'current' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                                    📅 ${currentAdmissionYear}학년도만 보기
                                </button>
                                <button id="btnFilterPublicAllYears" class="px-3 py-1 rounded-lg font-bold transition-all ${publicYearFilterMode === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                                    전체 연도 모아보기
                                </button>
                            </div>
                            <button id="addPublicDataBtn" class="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3.5 py-1 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer h-8.5" title="새 공식 공개자료를 등록합니다">
                                <span>➕</span> 공개자료 추가
                            </button>
                        </div>
                    </div>

                    <!-- 일괄 작업 툴바 (테이블 바로 위에 정갈하게 분리 배치) -->
                    <div class="flex items-center justify-between gap-3 flex-wrap bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/50 text-xs shadow-xs">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-indigo-300 font-bold ml-1 flex items-center gap-1">☑️ 체크 항목 관리:</span>
                            <button id="btnApplySelectedPublic" class="bg-indigo-600/80 hover:bg-indigo-500 text-white font-bold px-3 py-1 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer h-7.5" title="체크된 항목들을 커트라인에 일괄 반영합니다">
                                <span>📥</span> 선택 반영
                            </button>
                            <button id="btnDeleteSelectedPublic" class="bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/50 text-rose-300 font-bold px-3 py-1 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer h-7.5" title="체크된 항목들을 삭제합니다">
                                <span>🗑️</span> 선택 삭제
                            </button>
                        </div>
                        <div>
                            <button id="btnApplyAllPublic" class="bg-emerald-600/80 hover:bg-emerald-500 text-white font-bold px-3.5 py-1 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer h-7.5" title="현재 보이는 모든 공개 데이터를 커트라인에 일괄 반영합니다">
                                <span>⚡</span> 현재 목록 전체 일괄 반영
                            </button>
                        </div>
                    </div>

                    <div class="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-900/40">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead class="bg-slate-800/90 text-text-muted font-bold text-center border-b border-slate-700/60 whitespace-nowrap">
                                <tr>
                                    <th class="p-3 w-10 border-r border-slate-700/50 text-center">
                                        <input type="checkbox" id="checkAllPublicItems" class="cursor-pointer w-4 h-4 rounded accent-indigo-500" title="전체 선택/해제" />
                                    </th>
                                    <th class="p-3 w-28 border-r border-slate-700/50">입학년도</th>
                                    <th class="p-3 text-left pl-4 w-44 border-r border-slate-700/50">고교명</th>
                                    <th class="p-3 w-28">학과</th>
                                    <th class="p-3 w-24">전형</th>
                                    <th class="p-3 w-32 text-sky-300">최고점</th>
                                    <th class="p-3 w-32 text-amber-300">평균점</th>
                                    <th class="p-3 w-32 text-emerald-300">최저점 (합격선)</th>
                                    <th class="p-3 w-36">출처 / 구분</th>
                                    <th class="p-3 w-28 text-center">반영 상태</th>
                                    <th class="p-3 w-28 text-center">관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${publicRowsHTML}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        app.innerHTML = `
            <div class="glass-card p-6 md:p-8 w-full mx-auto min-h-[85vh] space-y-6 fade-in" style="max-width: 1500px;">
                <!-- 1. 상단 타이틀 & 입학년도 & 주요 액션 바 (버튼 크기 완벽 통일 h-[36px]) -->
                <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/50 pb-4">
                    <div>
                        <h1 class="text-2xl font-black text-white flex items-center gap-2.5">
                            <span>🎯</span> 고교별·학과별 입학 커트라인 통합 관리
                        </h1>
                        <p class="text-xs text-text-muted mt-1">
                            고교 입학년도별 합격선(최저점)과 최고 불합격점을 관리하며, 학생 진학 상담 시 실시간 합격 가능성 판정 기준으로 적용됩니다.
                        </p>
                        <div class="flex items-center gap-2 mt-2 flex-wrap">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-bold text-xs shadow-sm">
                                <span>🏷️</span> ${currentAdmissionYear}학년도 입학 (중3 ${currentAdmissionYear - 1}학년도)
                            </span>
                            <span class="text-xs text-text-muted">연도 선택 시 해당 입학년도의 저장값으로 즉시 전환됩니다.</span>
                        </div>
                    </div>

                    <div class="flex items-center gap-2 flex-wrap">
                        <!-- 입학년도(입시년도) 선택기: 선택 즉시 자동 전환 및 건수 현황 표시 -->
                        <div class="flex items-center gap-2 bg-slate-900/80 px-3 rounded-xl border border-indigo-500/40 shadow-inner h-9">
                            <label class="text-xs font-bold text-indigo-300 whitespace-nowrap">📅 고교 입학년도:</label>
                            <select id="admissionYearSelect" class="bg-slate-800 text-white font-bold text-xs px-2.5 py-0.5 rounded-lg border border-slate-700 outline-none cursor-pointer">
                                ${admissionYears.map(year => {
                                    const count = getCutoffCountByYear(year);
                                    const badge = count > 0 ? `(${count}건 등록)` : `(미등록)`;
                                    return `<option value="${year}" ${Number(currentAdmissionYear) === Number(year) ? 'selected' : ''}>${year}학년도 ${badge}</option>`;
                                }).join('')}
                            </select>
                        </div>

                        <button id="copyFromOtherYearBtn" class="text-xs bg-purple-600/30 border border-purple-500/50 text-purple-200 hover:bg-purple-600/50 px-3.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer h-9" title="다른 학년도의 커트라인을 현재 선택된 학년도로 그대로 복사해옵니다">
                            <span>📋</span> 다른 연도 복사
                        </button>
                        <button id="saveAllYearsCutoffsBtn" class="text-xs bg-emerald-600/30 border border-emerald-500/60 text-emerald-200 hover:bg-emerald-600/50 px-3.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer h-9 shadow-sm" title="현재 입력된 커트라인을 5개년 전체 연도에 한 번에 일괄 복제 저장합니다">
                            <span>🌐</span> 전체연도 일괄 저장
                        </button>
                        <button id="saveAllCutoffsBtn" class="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3.5 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer h-9" title="현재 선택된 학년도의 커트라인만 데이터베이스에 영구 저장합니다">
                            <span>💾</span> 커트라인 저장
                        </button>
                        <button id="resetCutoffsBtn" class="text-xs bg-rose-950/60 border border-rose-500/50 text-rose-300 hover:bg-rose-900/70 px-3.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer h-9" title="입력된 커트라인 데이터를 초기화합니다">
                            <span>🗑️</span> 커트라인 초기화
                        </button>
                        <button id="exportJointDataBtn" class="text-xs bg-indigo-600/30 border border-indigo-500/50 text-indigo-200 hover:bg-indigo-600/50 px-3.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer h-9">
                            <span>📤</span> 자료 내보내기
                        </button>
                        <button id="importJointDataBtn" class="text-xs bg-emerald-600/30 border border-emerald-500/50 text-emerald-200 hover:bg-emerald-600/50 px-3.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer h-9">
                            <span>📥</span> 타교자료 병합
                        </button>
                        <button id="backToAdminBtn" class="text-xs bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 px-3.5 rounded-xl font-bold flex items-center justify-center transition-colors cursor-pointer h-9">
                            ← 대시보드
                        </button>
                    </div>
                </div>

                ${(() => {
                    const curCount = getCutoffCountByYear(currentAdmissionYear);
                    const sourceYears = admissionYears.filter(y => Number(y) !== Number(currentAdmissionYear) && getCutoffCountByYear(y) > 0);
                    if (curCount === 0 && sourceYears.length > 0) {
                        const topYear = sourceYears[0];
                        return `
                            <div class="mb-4 p-3.5 rounded-2xl bg-linear-to-r from-indigo-950/70 via-purple-950/50 to-slate-900/80 border border-indigo-500/50 flex items-center justify-between flex-wrap gap-3 shadow-lg">
                                <div class="flex items-center gap-3">
                                    <span class="text-2xl">💡</span>
                                    <div>
                                        <div class="text-xs font-bold text-indigo-200">현재 <strong>${currentAdmissionYear}학년도</strong>에는 등록된 커트라인 점수가 없습니다.</div>
                                        <div class="text-[11px] text-slate-400 mt-0.5">이미 등록된 <strong>${topYear}학년도</strong>(${getCutoffCountByYear(topYear)}건)의 커트라인을 한 번의 클릭으로 그대로 가져와 사용하실 수 있습니다.</div>
                                    </div>
                                </div>
                                <button id="quickCopyYearBtn" data-year="${topYear}" class="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer">
                                    <span>📋</span> ${topYear}학년도 커트라인 바로 채우기
                                </button>
                            </div>
                        `;
                    }
                    return '';
                })()}

                <!-- 2. 카테고리 네비게이션 탭 바 & 스마트 실시간 검색 -->
                <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 pb-3">
                    <div class="flex items-center gap-2 overflow-x-auto custom-scrollbar">
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'all' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="all">
                            <span>🏷️</span> 전체 학교
                        </button>
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'meister' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="meister">
                            <span>🏛️</span> 마이스터고
                        </button>
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'special' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="special">
                            <span>🏭</span> 특성화고
                        </button>
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'general' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="general">
                            <span>🏫</span> 후기 일반고
                        </button>
                        <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'public' ? 'bg-amber-500 text-white shadow-md' : 'bg-amber-950/30 text-amber-300 border border-amber-500/30 hover:bg-amber-900/40'}" data-tab="public">
                            <span>📊</span> 고교 공식 공개 데이터 (참고자료)
                        </button>
                    </div>

                    <div class="relative w-64">
                        <input id="cutoffSchoolSearch" type="text" value="${searchKeyword}" placeholder="🔍 고교명·학과·전형 검색..." class="input-field py-1.5 pl-3 pr-8 text-xs w-full bg-slate-900/80 border border-slate-700/60 rounded-xl" />
                        ${searchKeyword ? `<button id="clearCutoffSearch" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white">✕</button>` : ''}
                    </div>
                </div>

                <!-- 3. 학교별 커트라인 목록 -->
                <div class="space-y-5">
                    ${schoolsHTML}
                </div>
            </div>
        `;

        bindEvents();
    };

    const bindEvents = () => {
        // 다른 학년도 커트라인 복사 공통 함수
        const executeCopyFromYear = async (sourceYear) => {
            const sourceData = (allSavedCutoffs || []).filter(c => Number(c.year) === Number(sourceYear) && Number(c.minValue) > 0);
            if (sourceData.length === 0) {
                await showModalAlert({
                    title: '복사 불가',
                    message: `<strong>${sourceYear}학년도</strong>에는 저장된 유효 커트라인 점수가 없습니다.`,
                    type: 'warning'
                });
                return;
            }

            const confirmed = await showModalConfirm({
                title: '커트라인 데이터 복사',
                message: `<strong>${sourceYear}학년도</strong>의 커트라인(총 <strong>${sourceData.length}건</strong>)을 현재 <strong>${currentAdmissionYear}학년도</strong>로 복사해 오시겠습니까?<br><br><span class="text-xs text-amber-300">※ 복사 후 상단의 <strong>[💾 커트라인 저장]</strong> 버튼을 누르시면 ${currentAdmissionYear}학년도 데이터로 DB에 최종 저장됩니다.</span>`,
                confirmText: '복사하기',
                type: 'info'
            });

            if (!confirmed) return;

            const rows = app.querySelectorAll('.cutoff-item-row');
            let filledCount = 0;
            rows.forEach(tr => {
                const schName = normalizeSchoolName(tr.dataset.school || '');
                const dept = normalizeDept(tr.querySelector('.row-dept-name')?.value || tr.dataset.dept || '');
                const track = normalizeTrack(tr.querySelector('.row-track-name')?.value || tr.dataset.track || '일반');

                const match = sourceData.find(c =>
                    normalizeSchoolName(c.schoolName) === schName &&
                    normalizeDept(c.department) === dept &&
                    normalizeTrack(c.track) === track
                );

                if (match) {
                    const minInput = tr.querySelector('.row-min-score');
                    const maxInput = tr.querySelector('.row-max-score');
                    const avgInput = tr.querySelector('.row-avg-score');
                    if (minInput) minInput.value = match.minValue || '';
                    if (maxInput) maxInput.value = match.maxValue || '';
                    if (avgInput) avgInput.value = match.avgValue || '';
                    filledCount++;
                }
            });

            await showModalAlert({
                title: '복사 완료',
                message: `<strong>${sourceYear}학년도</strong> 커트라인 중 <strong>${filledCount}개</strong> 항목이 현재 화면에 채워졌습니다!<br><br>내용을 확인하신 후 상단의 <strong>[💾 커트라인 저장]</strong> 버튼을 꼭 눌러주세요.`,
                type: 'success'
            });
        };

        // 0-1. 다른 학년도 복사 버튼 클릭 시
        document.getElementById('copyFromOtherYearBtn')?.addEventListener('click', async () => {
            const availableYears = admissionYears.filter(y => Number(y) !== Number(currentAdmissionYear) && getCutoffCountByYear(y) > 0);
            if (availableYears.length === 0) {
                await showModalAlert({
                    title: '복사 가능한 연도 없음',
                    message: '다른 학년도에 저장된 커트라인 데이터가 없습니다.<br>타교자료를 병합하거나 직접 커트라인을 먼저 입력해 주세요.',
                    type: 'info'
                });
                return;
            }

            if (availableYears.length === 1) {
                await executeCopyFromYear(availableYears[0]);
            } else {
                // 여러 연도가 있을 경우 가장 최근 등록 연도로 복사 확인
                await executeCopyFromYear(availableYears[0]);
            }
        });

        // 0-2. 배너의 바로 복사 버튼
        document.getElementById('quickCopyYearBtn')?.addEventListener('click', async (e) => {
            const yr = e.currentTarget.dataset.year;
            if (yr) {
                await executeCopyFromYear(yr);
            }
        });

        // 1. 입학년도 변경 이벤트: 선택 즉시 해당 연도 데이터 로드
        document.getElementById('admissionYearSelect')?.addEventListener('change', (e) => {
            currentAdmissionYear = parseInt(e.target.value, 10);
            renderMainScreen();
        });

        // 2. 스마트 실시간 검색 이벤트
        const searchInput = document.getElementById('cutoffSchoolSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchKeyword = e.target.value.trim();
                renderMainScreen();
                const freshInput = document.getElementById('cutoffSchoolSearch');
                if (freshInput) {
                    freshInput.focus();
                    freshInput.selectionStart = freshInput.selectionEnd = freshInput.value.length;
                }
            });
            document.getElementById('clearCutoffSearch')?.addEventListener('click', () => {
                searchKeyword = '';
                renderMainScreen();
            });
        }

        // 3. 탭 전환 이벤트
        app.querySelectorAll('.nav-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentTab = btn.dataset.tab;
                renderMainScreen();
            });
        });

        // 4. 행 삭제 이벤트 (UI 제거 및 백엔드 DB 삭제 즉시 연동)
        app.querySelectorAll('.btn-delete-row').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const tr = e.target.closest('tr');
                if (tr) {
                    const school = tr.dataset.school;
                    const dept = tr.querySelector('.row-dept-name')?.value.trim() ?? tr.dataset.dept ?? '';
                    const track = tr.querySelector('.row-track-name')?.value.trim() || '일반';
                    deletedCutoffList.push({
                        year: currentAdmissionYear,
                        schoolName: school,
                        department: normalizeDept(dept),
                        track: normalizeTrack(track)
                    });
                    tr.remove();
                    if (window.go?.main?.App?.DeleteCutoff) {
                        try {
                            await window.go.main.App.DeleteCutoff(currentAdmissionYear, school, normalizeDept(dept), normalizeTrack(track));
                            allSavedCutoffs = (allSavedCutoffs || []).filter(c => 
                                !(c.year === currentAdmissionYear && normalizeSchoolName(c.schoolName) === normalizeSchoolName(school) && normalizeDept(c.department) === normalizeDept(dept) && normalizeTrack(c.track) === normalizeTrack(track))
                            );
                            window.dispatchEvent(new CustomEvent('cutoffs-updated', { detail: allSavedCutoffs }));
                        } catch (delErr) {
                            console.warn('DB 커트라인 삭제 연동 경고:', delErr);
                        }
                    }
                }
            });
        });

        // 5. 병합된 학과 셀 수정 동기화
        app.querySelectorAll('.row-dept-name[data-dept-group]').forEach(input => {
            input.addEventListener('input', () => {
                const dept = input.value.trim();
                app.querySelectorAll(`.cutoff-item-row[data-dept-group="${input.dataset.deptGroup}"]`)
                    .forEach(row => { row.dataset.dept = dept; });
            });
        });

        // 6. 학과·전형 추가 이벤트
        app.querySelectorAll('.btn-add-dept').forEach(btn => {
            btn.addEventListener('click', () => {
                const schName = btn.dataset.school;
                const scoreType = btn.dataset.type;
                const card = btn.closest('.school-cutoff-card');
                const tbody = card.querySelector('tbody');
                if (tbody) {
                    const tr = document.createElement('tr');
                    tr.className = "border-b border-slate-700/40 hover:bg-slate-800/40 transition-colors cutoff-item-row";
                    tr.dataset.school = schName;
                    tr.dataset.type = scoreType;
                    const unit = scoreType === 'percentile' ? '%' : '점';
                    tr.innerHTML = `
                        <td class="p-3">
                            <input type="text" class="input-field py-1.5 px-2.5 text-xs font-bold text-white row-dept-name" value="" placeholder="비우면 학교 전체" />
                        </td>
                        <td class="p-3">
                            <input type="text" class="input-field py-1.5 px-2.5 text-xs text-indigo-300 row-track-name" value="일반" placeholder="전형 (예: 일반)" />
                        </td>
                        <td class="p-3 text-center">
                            <div class="flex items-center justify-center gap-1">
                                <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-bold text-emerald-300 w-28 row-min-score" 
                                       value="" placeholder="최저점" />
                                <span class="text-xs text-slate-400">${unit}</span>
                            </div>
                        </td>
                        <td class="p-3 text-center">
                            <div class="flex items-center justify-center gap-1">
                                <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-semibold text-sky-300 w-28 row-max-score" 
                                       value="" placeholder="선택" />
                                <span class="text-xs text-slate-400">${unit}</span>
                            </div>
                        </td>
                        <input type="hidden" class="row-avg-score" value="" />
                        <td class="p-3 text-center">
                            <button class="text-xs text-danger/80 hover:text-danger hover:bg-danger/10 p-1.5 rounded transition-colors btn-delete-row" title="행 삭제">🗑️</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                    tr.querySelector('.btn-delete-row').addEventListener('click', () => tr.remove());
                }
            });
        });

        // 공개 데이터 일괄/선택 반영 헬퍼 함수
        const applyPublicDataIndices = async (indices) => {
            if (!indices || indices.length === 0) {
                await showModalAlert({
                    title: '선택 확인',
                    message: '반영할 항목을 선택해주세요.',
                    type: 'warning'
                });
                return;
            }

            const newCutoffs = [];
            indices.forEach(idx => {
                const item = publicOfficialData[idx];
                if (!item || !item.school || !item.min || Number(item.min) <= 0) return;
                const min = parseFloat(item.min);
                const max = parseFloat(item.max);
                const avg = parseFloat(item.avg);
                const targetYear = item.year || currentAdmissionYear;
                const scoreType = String(item.school).includes('일반계고') ? 'percentile' : 'total_score';

                newCutoffs.push({
                    year: targetYear,
                    schoolName: item.school,
                    department: normalizeDept(item.dept),
                    track: normalizeTrack(item.track),
                    scoreType: scoreType,
                    minValue: min,
                    maxValue: Number.isFinite(max) && max > 0 ? max : min,
                    avgValue: Number.isFinite(avg) && avg > 0 ? avg : 0
                });
            });

            if (newCutoffs.length === 0) {
                await showModalAlert({
                    title: '반영 대상 없음',
                    message: '선택한 항목 중 유효한 고교명과 최저 합격선(양수)이 입력된 항목이 없습니다.',
                    type: 'warning'
                });
                return;
            }

            try {
                await window.go.main.App.SaveCutoffs(newCutoffs);
                allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                window.dispatchEvent(new CustomEvent('cutoffs-updated', { detail: allSavedCutoffs }));
                await showModalAlert({
                    title: '커트라인 반영 완료',
                    message: `총 <strong>${newCutoffs.length}건</strong>의 공식 입결 데이터가 각 연도별 고교 커트라인으로 성공적으로 반영되었습니다!<br><br>이제 신호등 종합 매트릭스와 진학 상담 화면에서 실시간 적용됩니다.`,
                    type: 'success'
                });
                renderMainScreen();
            } catch (err) {
                await showModalAlert({ title: '반영 실패', message: String(err), type: 'error' });
            }
        };

        // 7. 개별 공개 데이터 복사 적용 버튼
        app.querySelectorAll('.btn-apply-public-item').forEach(btn => {
            btn.addEventListener('click', async () => {
                const idx = Number(btn.dataset.index);
                await applyPublicDataIndices([idx]);
            });
        });

        document.getElementById('saveAllCutoffsBtn')?.addEventListener('click', () => saveAllCutoffs(false));

        // 7-1. 커트라인 초기화 버튼 이벤트 (연도별 선택 또는 전체 초기화)
        document.getElementById('resetCutoffsBtn')?.addEventListener('click', async () => {
            const confirmed = await showModalConfirm({
                title: '커트라인 초기화 확인',
                message: `현재 선택된 <strong>${currentAdmissionYear}학년도</strong> 커트라인을 초기화하시겠습니까?<br><br><span class="text-xs text-slate-400">※ 전체 5개년 모든 데이터를 완전 백지화하려면 다음 질문에서 전체 초기화를 선택할 수 있습니다.</span>`,
                confirmText: '초기화 진행',
                type: 'warning'
            });
            if (!confirmed) return;

            const isAllYears = await showModalConfirm({
                title: '전체 연도 초기화 선택',
                message: `모든 연도(5개년 전체)의 커트라인과 공개 입결 데이터를 완전 백지화하시겠습니까?<br><br>- <strong>[전체 백지화]</strong>: 5개년 전체 데이터 삭제<br>- <strong>[해당 연도만]</strong>: 현재 ${currentAdmissionYear}학년도 데이터만 삭제`,
                confirmText: '전체 백지화',
                cancelText: '해당 연도만',
                type: 'error'
            });

            try {
                if (isAllYears) {
                    if (window.go?.main?.App?.ResetCutoffs) {
                        await window.go.main.App.ResetCutoffs(0);
                    }
                    publicOfficialData = [];
                    await syncPublicOfficialData();
                } else {
                    if (window.go?.main?.App?.ResetCutoffs) {
                        await window.go.main.App.ResetCutoffs(currentAdmissionYear);
                    }
                    publicOfficialData = publicOfficialData.filter(item => Number(item.year) !== currentAdmissionYear);
                    await syncPublicOfficialData();
                }
                allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                window.dispatchEvent(new CustomEvent('cutoffs-updated', { detail: allSavedCutoffs }));
                await showModalAlert({
                    title: '초기화 완료',
                    message: isAllYears 
                        ? '전체 연도의 고교 커트라인 및 공개 입결 데이터가 완전히 초기화되었습니다.' 
                        : `<strong>${currentAdmissionYear}학년도</strong>의 고교 커트라인이 안전하게 초기화되었습니다.`,
                    type: 'success'
                });
                renderMainScreen();
            } catch (err) {
                await showModalAlert({ title: '초기화 실패', message: String(err), type: 'error' });
            }
        });

        if (currentTab === 'public') {
            // 연도 필터링 버튼 이벤트
            document.getElementById('btnFilterPublicCurrentYear')?.addEventListener('click', () => {
                publicYearFilterMode = 'current';
                renderMainScreen();
            });
            document.getElementById('btnFilterPublicAllYears')?.addEventListener('click', () => {
                publicYearFilterMode = 'all';
                renderMainScreen();
            });

            // 전체 선택 / 해제 체크박스 이벤트
            const checkAllBox = document.getElementById('checkAllPublicItems');
            checkAllBox?.addEventListener('change', (e) => {
                const checked = e.target.checked;
                app.querySelectorAll('.public-item-check').forEach(cb => { cb.checked = checked; });
            });

            // 전체 일괄 반영 버튼 이벤트
            document.getElementById('btnApplyAllPublic')?.addEventListener('click', async () => {
                const visibleCheckboxes = Array.from(app.querySelectorAll('.public-item-check'));
                const allIndices = visibleCheckboxes.map(cb => Number(cb.dataset.index));
                if (allIndices.length === 0) {
                    await showModalAlert({ title: '안내', message: '반영할 공개 데이터가 없습니다.', type: 'info' });
                    return;
                }
                const confirmed = await showModalConfirm({
                    title: '공개 데이터 일괄 반영',
                    message: `현재 화면에 표시된 <strong>${allIndices.length}개</strong> 공개 데이터를 각 연도별 고교 커트라인에 일괄 반영하시겠습니까?`,
                    confirmText: '일괄 반영',
                    type: 'info'
                });
                if (confirmed) {
                    await applyPublicDataIndices(allIndices);
                }
            });

            // 선택 항목 반영 버튼 이벤트
            document.getElementById('btnApplySelectedPublic')?.addEventListener('click', async () => {
                const checkedBoxes = Array.from(app.querySelectorAll('.public-item-check:checked'));
                const selectedIndices = checkedBoxes.map(cb => Number(cb.dataset.index));
                if (selectedIndices.length === 0) {
                    await showModalAlert({ title: '선택 확인', message: '반영할 항목의 체크박스를 1개 이상 선택해주세요.', type: 'warning' });
                    return;
                }
                await applyPublicDataIndices(selectedIndices);
            });

            // 선택 항목 삭제 버튼 이벤트
            document.getElementById('btnDeleteSelectedPublic')?.addEventListener('click', async () => {
                const checkedBoxes = Array.from(app.querySelectorAll('.public-item-check:checked'));
                const selectedIndices = checkedBoxes.map(cb => Number(cb.dataset.index)).sort((a, b) => b - a);
                if (selectedIndices.length === 0) {
                    await showModalAlert({ title: '선택 확인', message: '삭제할 항목의 체크박스를 1개 이상 선택해주세요.', type: 'warning' });
                    return;
                }
                const confirmed = await showModalConfirm({
                    title: '공개자료 삭제',
                    message: `선택한 <strong>${selectedIndices.length}개</strong> 공개자료 항목을 삭제하시겠습니까?`,
                    confirmText: '삭제',
                    type: 'warning'
                });
                if (confirmed) {
                    const toDelete = [];
                    selectedIndices.forEach(idx => {
                        if (idx >= 0 && idx < publicOfficialData.length) {
                            const item = publicOfficialData[idx];
                            if (item) {
                                toDelete.push({
                                    year: item.year || currentAdmissionYear,
                                    schoolName: item.school,
                                    department: normalizeDept(item.dept),
                                    track: normalizeTrack(item.track)
                                });
                            }
                            publicOfficialData.splice(idx, 1);
                        }
                    });
                    await syncPublicOfficialData();
                    if (toDelete.length > 0 && window.go?.main?.App?.DeleteCutoffs) {
                        try {
                            await window.go.main.App.DeleteCutoffs(toDelete);
                            allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                            window.dispatchEvent(new CustomEvent('cutoffs-updated', { detail: allSavedCutoffs }));
                        } catch (e) {
                            console.warn('DB 커트라인 삭제 연동 실패:', e);
                        }
                    }
                    renderMainScreen();
                }
            });

            // 테이블 학교명 셀 변경 동기화
            app.querySelectorAll('.public-school-select').forEach(sel => {
                sel.addEventListener('change', async (e) => {
                    const newSchool = e.target.value;
                    const oldSchool = sel.dataset.groupSchool;
                    const gYear = Number(sel.dataset.groupYear);
                    publicOfficialData.forEach(item => {
                        if (item.year === gYear && normalizeSchoolName(item.school) === normalizeSchoolName(oldSchool)) {
                            item.school = newSchool;
                            item.unit = newSchool.includes('일반계고') ? '%' : '점';
                        }
                    });
                    await syncPublicOfficialData();
                    renderMainScreen();
                });
            });

            // 인풋 실시간 동기화
            const updateField = async (input, field, isNum = false) => {
                const idx = Number(input.dataset.index);
                if (publicOfficialData[idx]) {
                    const val = input.value.trim();
                    publicOfficialData[idx][field] = isNum ? (parseFloat(val) || '') : val;
                    await syncPublicOfficialData();
                }
            };
            app.querySelectorAll('.public-dept').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'dept')));
            app.querySelectorAll('.public-track').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'track')));
            app.querySelectorAll('.public-min-score').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'min', true)));
            app.querySelectorAll('.public-max-score').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'max', true)));
            app.querySelectorAll('.public-avg-score').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'avg', true)));
            app.querySelectorAll('.public-note').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'note')));
            app.querySelectorAll('.public-year').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'year', true)));

            // 공식 공개자료 추가 버튼
            document.getElementById('addPublicDataBtn')?.addEventListener('click', async () => {
                await renderAddPublicDataModal(currentAdmissionYear, admissionYears, async (newEntry) => {
                    publicOfficialData.unshift(newEntry);
                    await syncPublicOfficialData();
                    renderMainScreen();
                });
            });

            // 개별 행 삭제 버튼 (UI 및 DB 즉시 삭제 연동)
            app.querySelectorAll('.btn-delete-public-item').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const index = Number(btn.dataset.index);
                    if (index >= 0 && index < publicOfficialData.length) {
                        const item = publicOfficialData[index];
                        if (item && window.go?.main?.App?.DeleteCutoff) {
                            try {
                                await window.go.main.App.DeleteCutoff(
                                    item.year || currentAdmissionYear,
                                    item.school,
                                    normalizeDept(item.dept),
                                    normalizeTrack(item.track)
                                );
                                allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                                window.dispatchEvent(new CustomEvent('cutoffs-updated', { detail: allSavedCutoffs }));
                            } catch (e) {
                                console.warn('DB 커트라인 삭제 연동 실패:', e);
                            }
                        }
                        publicOfficialData.splice(index, 1);
                        await syncPublicOfficialData();
                        renderMainScreen();
                    }
                });
            });
        }

        // 8. 전체 저장 함수 (공개자료 탭일 때는 공개자료 자동 일괄 반영 연동)
        const saveAllCutoffs = async (silent = false) => {
            // 만약 현재 공개자료 탭을 보고 있다면: 공개 데이터를 실제 고교 커트라인으로 일괄 반영 처리!
            if (currentTab === 'public') {
                const visibleCheckboxes = Array.from(app.querySelectorAll('.public-item-check'));
                const allIndices = visibleCheckboxes.map(cb => Number(cb.dataset.index));
                if (allIndices.length > 0) {
                    const confirmed = await showModalConfirm({
                        title: '공식 데이터 일괄 반영',
                        message: `공개자료 탭에 표시된 <strong>${allIndices.length}개</strong> 공식 데이터를 현재 입학년도 커트라인으로 일괄 반영 및 저장하시겠습니까?`,
                        confirmText: '반영 및 저장',
                        type: 'info'
                    });
                    if (confirmed) {
                        await applyPublicDataIndices(allIndices);
                        return true;
                    }
                }
            }

            const rows = app.querySelectorAll('.cutoff-item-row');
            const cutoffs = [];

            rows.forEach(tr => {
                const school = tr.dataset.school;
                const scoreType = tr.dataset.type;
                const dept = tr.querySelector('.row-dept-name')?.value.trim() ?? tr.dataset.dept ?? '';
                const track = tr.querySelector('.row-track-name')?.value.trim() || '일반';
                const minStr = tr.querySelector('.row-min-score')?.value.trim();
                const maxStr = tr.querySelector('.row-max-score')?.value.trim();
                const avgStr = tr.querySelector('.row-avg-score')?.value.trim();

                const minVal = parseFloat(minStr);
                const maxVal = parseFloat(maxStr);
                const avgVal = parseFloat(avgStr);

                if (!isNaN(minVal) && minVal > 0) {
                    cutoffs.push({
                        year: currentAdmissionYear,
                        schoolName: school,
                        department: dept,
                        track: track,
                        scoreType: scoreType,
                        minValue: minVal,
                        maxValue: !isNaN(maxVal) && maxVal > 0 ? maxVal : minVal,
                        avgValue: !isNaN(avgVal) && avgVal > 0 ? avgVal : 0
                    });
                } else if (school) {
                    // 점수란을 지워 비워둔 항목은 DB에서도 삭제 대상으로 등록
                    deletedCutoffList.push({
                        year: currentAdmissionYear,
                        schoolName: school,
                        department: normalizeDept(dept),
                        track: normalizeTrack(track)
                    });
                }
            });

            // 삭제 대기 중인 항목들이 있으면 DB에서 영구 삭제
            if (deletedCutoffList.length > 0 && window.go?.main?.App?.DeleteCutoffs) {
                try {
                    await window.go.main.App.DeleteCutoffs(deletedCutoffList);
                } catch (delErr) {
                    console.warn('DB 커트라인 삭제 연동 실패:', delErr);
                }
                deletedCutoffList = [];
            }

            if (cutoffs.length === 0) {
                allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                window.dispatchEvent(new CustomEvent('cutoffs-updated', { detail: allSavedCutoffs }));
                if (!silent) {
                    const totalAllYears = (allSavedCutoffs || []).length;
                    await showModalAlert({
                        title: '커트라인 저장 완료',
                        message: `<strong>${currentAdmissionYear}학년도</strong>에는 입력된 커트라인 점수가 없어 해당 학년도 커트라인이 빈 상태(초기화)로 저장되었습니다.<br><span class="text-xs text-slate-400 mt-1.5 block">※ 다른 학년도(2024, 2026 등)의 커트라인은 안전하게 보존됩니다. (전체 누적: 총 <strong>${totalAllYears}건</strong> 유지 중)</span>`,
                        type: 'info'
                    });
                }
                renderMainScreen();
                return true;
            }

            try {
                await window.go.main.App.SaveCutoffs(cutoffs);
                allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                window.dispatchEvent(new CustomEvent('cutoffs-updated', { detail: allSavedCutoffs }));
                if (!silent) {
                    const totalAllYears = (allSavedCutoffs || []).length;
                    await showModalAlert({
                        title: '커트라인 저장 완료',
                        message: `<strong>${currentAdmissionYear}학년도</strong> 총 <strong>${cutoffs.length}건</strong>의 고교·학과별 커트라인 및 공식 공개 입결 자료가 안전하게 저장되었습니다!<br><span class="text-xs text-slate-400 mt-1.5 block">※ 전체 학년도 누적 커트라인은 총 <strong>${totalAllYears}건</strong>이 안전하게 보관 중입니다.</span>`,
                        type: 'success'
                    });
                }
                renderMainScreen();
                return true;
            } catch (err) {
                await showModalAlert({ title: '저장 실패', message: String(err), type: 'error' });
                return false;
            }
        };

        // 8-1. 전체 연도 일괄 저장 함수 (현재 화면의 점수들을 최근 5개년 전체에 일괄 복제 저장)
        const saveAllYearsCutoffs = async () => {
            const rows = app.querySelectorAll('.cutoff-item-row');
            const baseCutoffs = [];

            rows.forEach(tr => {
                const school = tr.dataset.school;
                const scoreType = tr.dataset.type;
                const dept = tr.querySelector('.row-dept-name')?.value.trim() ?? tr.dataset.dept ?? '';
                const track = tr.querySelector('.row-track-name')?.value.trim() || '일반';
                const minStr = tr.querySelector('.row-min-score')?.value.trim();
                const maxStr = tr.querySelector('.row-max-score')?.value.trim();
                const avgStr = tr.querySelector('.row-avg-score')?.value.trim();

                const minVal = parseFloat(minStr);
                const maxVal = parseFloat(maxStr);
                const avgVal = parseFloat(avgStr);

                if (!isNaN(minVal) && minVal > 0) {
                    baseCutoffs.push({
                        schoolName: school,
                        department: dept,
                        track: track,
                        scoreType: scoreType,
                        minValue: minVal,
                        maxValue: !isNaN(maxVal) && maxVal > 0 ? maxVal : minVal,
                        avgValue: !isNaN(avgVal) && avgVal > 0 ? avgVal : 0
                    });
                }
            });

            if (baseCutoffs.length === 0) {
                await showModalAlert({
                    title: '저장할 점수 없음',
                    message: '현재 화면에 입력된 유효 커트라인 점수가 없습니다.<br>점수를 먼저 입력하거나 타 연도 데이터를 복사해온 후 일괄 저장을 실행해주세요.',
                    type: 'warning'
                });
                return false;
            }

            const yearListText = admissionYears.map(y => `<strong>${y}학년도</strong>`).join(', ');
            const confirmed = await showModalConfirm({
                title: '전체 연도 커트라인 일괄 저장',
                message: `현재 화면에 입력된 <strong>총 ${baseCutoffs.length}개</strong>의 고교·학과별 커트라인을<br>최근 5개년 전체(${yearListText})에 일괄 복제 저장하시겠습니까?<br><br>` +
                         `<span class="text-xs text-indigo-300">✓ 5개년 전체에 동일한 기준 커트라인이 한 번에 등록됩니다.<br>✓ 저장 후 어떤 학년도를 선택하셔도 커트라인이 정상 표시됩니다.<br>✓ 특정 학년도의 세부 점수는 언제든 개별 수정 가능합니다.</span>`,
                confirmText: '5개년 전체 일괄 저장',
                type: 'info'
            });

            if (!confirmed) return false;

            // 5개년 전체 연도에 대해 커트라인 레코드 생성
            const allYearsToSave = [];
            admissionYears.forEach(year => {
                baseCutoffs.forEach(item => {
                    allYearsToSave.push({
                        ...item,
                        year: Number(year)
                    });
                });
            });

            try {
                await window.go.main.App.SaveCutoffs(allYearsToSave);
                allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                window.dispatchEvent(new CustomEvent('cutoffs-updated', { detail: allSavedCutoffs }));
                await showModalAlert({
                    title: '전체 연도 일괄 저장 완료',
                    message: `최근 5개년 전체(${yearListText})에 걸쳐<br>총 <strong>${allYearsToSave.length}건</strong>(${baseCutoffs.length}개 항목 × ${admissionYears.length}개년)의 커트라인이 안전하게 일괄 저장되었습니다!<br><br>이제 상단 학년도를 어떤 연도로 바꾸셔도 등록된 커트라인을 바로 확인하실 수 있습니다.`,
                    type: 'success'
                });
                renderMainScreen();
                return true;
            } catch (err) {
                await showModalAlert({ title: '일괄 저장 실패', message: String(err), type: 'error' });
                return false;
            }
        };

        // 전체 연도 일괄 저장 버튼 이벤트 연결
        document.getElementById('saveAllYearsCutoffsBtn')?.addEventListener('click', () => {
            saveAllYearsCutoffs();
        });

        // 9. 관내 진학자료 내보내기 (커트라인 + 지원현황 통계 + 공식자료 오프라인 패키징)
        document.getElementById('exportJointDataBtn')?.addEventListener('click', async () => {
            const btn = document.getElementById('exportJointDataBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> 내보내는 중...';
            try {
                // 현재 수정 중인 커트라인 우선 자동 저장
                await saveAllCutoffs(true);
                const path = await window.go.main.App.ExportJointShareData(currentAdmissionYear);
                if (path) {
                    await showModalAlert({
                        title: '자료 내보내기 완료',
                        message: `<strong>${currentAdmissionYear}학년도</strong> 관내 진학자료가 안전하게 저장되었습니다!<br><br>📂 <strong>저장 파일:</strong><br><span class="text-xs text-indigo-300 font-mono break-all">${path}</span><br><br><span class="text-emerald-400 text-xs">✓ 학생 성명, 학급 등 개인정보는 100% 원천 배제되었습니다.<br>✓ 이 파일을 타 학교 진학 담당 선생님께 전달하여 공유하세요.</span>`,
                        type: 'success'
                    });
                }
            } catch (err) {
                await showModalAlert({ title: '내보내기 실패', message: String(err), type: 'error' });
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>📤</span> 자료 내보내기';
            }
        });

        // 10. 타교 진학자료 병합 (타 학교 커트라인, 합격결과, 공식자료 스마트 병합)
        document.getElementById('importJointDataBtn')?.addEventListener('click', async () => {
            const btn = document.getElementById('importJointDataBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> 병합 중...';
            try {
                const res = await window.go.main.App.ImportJointShareData(currentAdmissionYear);
                if (res) {
                    allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                    const totalAllYears = (allSavedCutoffs || []).length;
                    await showModalAlert({
                        title: '타교자료 일괄 병합 완료',
                        message: `선택하신 타 학교 진학자료가 성공적으로 병합되었습니다!<br><br>` +
                                 `• 처리된 파일: <strong>${res.files || 1}개 학교 자료</strong><br>` +
                                 `• 커트라인 갱신: 총 <strong>${res.cutoffs || 0}건</strong> (전체 학년도 누적 병합)<br>` +
                                 `• 타교 지원현황 합격선 반영: <strong>${res.applications || 0}건</strong><br>` +
                                 `• 공식 공개자료 보완: <strong>${res.official || 0}건</strong><br><br>` +
                                 `<span class="text-xs text-slate-400 block">💡 상단 학년도(2026, 2025 등)를 전환하시면 각 학년도별로 분할 저장된 커트라인(${res.cutoffs || 0}건 중 해당 연도분)을 확인하실 수 있습니다. (전체 보관: ${totalAllYears}건)</span>`,
                        type: 'success'
                    });
                    renderMainScreen();
                }
            } catch (err) {
                await showModalAlert({ title: '병합 실패', message: String(err), type: 'error' });
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>📥</span> 타교자료 병합';
            }
        });

        // 11. 대시보드로 돌아가기
        document.getElementById('backToAdminBtn')?.addEventListener('click', () => {
            renderAdminScreen(schoolName);
        });
    };

    renderMainScreen();
}

// 울산 관내 고교 공식 공개자료 신규 추가 모달 (학교별 학과·전형 자동 연동 & 최고/평균/최저점)
async function renderAddPublicDataModal(defaultYear, availableYears, onAddCallback) {
    document.getElementById('addPublicDataModal')?.remove();

    // 서버의 highschools.json에서 고교 목록 동적 로드 (하드코딩 제거)
    let ulsanSchools = [];
    let schoolDeptMap = {};
    try {
        const highSchoolData = await window.go.main.App.GetHighSchoolsData();
        const schools = highSchoolData?.schools || [];
        schools.forEach(s => {
            const t = (s.type || s.Type || '').toLowerCase();
            const note = (s.note || s.Note || '');
            const isMeister = t === 'meister' || t === '마이스터고' || note.includes('마이스터고');
            const isSpecial = t === 'special' || t === '특성화고' || note.includes('특성화고');
            if (!isMeister && !isSpecial) return;
            const rawName = s.name || s.Name || '';
            const shortName = normalizeSchoolName(rawName);
            const category = isMeister ? '마이스터고' : '특성화고';
            ulsanSchools.push({ name: shortName, category, unit: '점' });
            schoolDeptMap[shortName] = s.departments || s.Departments || [];
        });
        // 후기 일반고 추가
        ulsanSchools.push({ name: '울산 후기 일반계고', category: '후기 일반고', unit: '%' });
        schoolDeptMap['울산 후기 일반계고'] = [];
    } catch (e) {
        console.warn('공식자료 모달: 고교 목록 동적 로드 실패', e);
    }

    // 입학년도 기준: 초기설정의 직전 5개년(예: 2026, 2025, 2024, 2023, 2022) 연동
    const fallbackYear = new Date().getFullYear();
    const yearOptions = (availableYears && availableYears.length > 0)
        ? availableYears
        : Array.from({ length: 5 }, (_, idx) => fallbackYear - idx);

    const selectedYear = (yearOptions.includes(defaultYear)) ? defaultYear : yearOptions[0];

    const modal = document.createElement('div');
    modal.id = 'addPublicDataModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200';
    modal.innerHTML = `
        <div class="glass-card max-w-lg w-full p-6 border border-indigo-500/40 rounded-3xl shadow-2xl flex flex-col gap-4 text-left animate-in zoom-in-95 duration-200 break-keep-all select-none">
            <div class="flex items-center justify-between border-b border-slate-700/60 pb-3">
                <div class="flex items-center gap-2">
                    <span class="text-xl">📊</span>
                    <h3 class="font-bold text-white text-base">공식 공개 입결자료 추가</h3>
                </div>
                <button id="closeAddPublicModalBtn" class="text-slate-400 hover:text-white p-1.5 rounded-lg text-base cursor-pointer transition-colors">✕</button>
            </div>

            <div class="space-y-3.5 text-xs">
                <!-- 1. 입학년도 (직전 5개년 자동 연동) -->
                <div>
                    <label class="text-slate-300 font-bold mb-1 flex items-center justify-between">
                        <span>📅 입학년도</span>
                        <span class="text-[11px] text-slate-400 font-normal">결과 발표된 최근 5개년 기준</span>
                    </label>
                    <select id="modalPublicYear" class="input-field w-full py-2.5 px-3 bg-slate-900 border-slate-700 rounded-xl text-white font-bold cursor-pointer text-xs">
                        ${yearOptions.map(y => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}학년도 입학 기준</option>`).join('')}
                    </select>
                </div>

                <!-- 2. 대상 고등학교 (학교 이름만 깔끔하게 표시) -->
                <div>
                    <label class="block text-slate-300 font-bold mb-1">🏫 울산 관내 대상 고등학교</label>
                    <select id="modalPublicSchool" class="input-field w-full py-2.5 px-3 bg-slate-900 border-slate-700 rounded-xl text-white font-bold cursor-pointer text-xs">
                        ${ulsanSchools.map(s => `<option value="${s.name}" data-category="${s.category}" data-unit="${s.unit}">[${s.category}] ${s.name}</option>`).join('')}
                    </select>
                </div>

                <!-- 3. 학과명 (최신 공식 학과 자동 연동) & 전형 (비우면 전체) -->
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-slate-300 font-bold mb-1">학과명 <span class="text-indigo-400 font-normal">(최신 개편 학과)</span></label>
                        <select id="modalPublicDeptSelect" class="input-field w-full py-2.5 px-2.5 bg-slate-900 border-slate-700 rounded-xl text-white font-semibold cursor-pointer text-xs">
                            <option value="">학교 전체 (공통)</option>
                        </select>
                        <input id="modalPublicDeptCustom" type="text" placeholder="학과 직접 입력" class="input-field w-full py-2 px-2.5 mt-1.5 bg-slate-900 border-indigo-500/50 rounded-lg text-white hidden text-xs" />
                    </div>
                    <div>
                        <label class="block text-slate-300 font-bold mb-1">전형 <span class="text-indigo-400 font-normal">(비우면 전체)</span></label>
                        <select id="modalPublicTrackSelect" class="input-field w-full py-2.5 px-2.5 bg-slate-900 border-slate-700 rounded-xl text-indigo-300 font-bold cursor-pointer text-xs">
                            <option value="">전체 (비움)</option>
                            <option value="일반" selected>일반</option>
                            <option value="특별">특별</option>
                        </select>
                    </div>
                </div>

                <!-- 4. 점수 입력 (최고점, 평균점, 최저점) & 전형별 점수 기준 동적 뱃지 -->
                <div>
                    <label class="text-slate-300 font-bold mb-1.5 flex items-center justify-between">
                        <span>🎯 입결 점수 입력</span>
                        <span id="modalScoreHintBadge" class="text-[11px] font-bold text-indigo-300 px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-500/30"></span>
                    </label>
                    <div class="grid grid-cols-3 gap-2.5">
                        <!-- 최고점 -->
                        <div class="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                            <label class="block text-sky-300 font-bold mb-1 text-[11px] text-center">최고점 (선택)</label>
                            <div class="flex items-center justify-center gap-1">
                                <input id="modalPublicMax" type="text" inputmode="decimal" placeholder="선택" class="input-field w-full py-1.5 px-1 text-right font-bold text-sky-300 bg-slate-900 border-slate-700 rounded-lg text-xs" />
                                <span class="modal-unit text-slate-400 text-[11px] shrink-0">점</span>
                            </div>
                        </div>

                        <!-- 평균점 -->
                        <div class="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                            <label class="block text-amber-300 font-bold mb-1 text-[11px] text-center">평균점 (선택)</label>
                            <div class="flex items-center justify-center gap-1">
                                <input id="modalPublicAvg" type="text" inputmode="decimal" placeholder="선택" class="input-field w-full py-1.5 px-1 text-right font-bold text-amber-300 bg-slate-900 border-slate-700 rounded-lg text-xs" />
                                <span class="modal-unit text-slate-400 text-[11px] shrink-0">점</span>
                            </div>
                        </div>

                        <!-- 최저점 (합격선/필수) -->
                        <div class="bg-slate-900/60 p-2.5 rounded-xl border border-emerald-500/40">
                            <label class="block text-emerald-400 font-black mb-1 text-[11px] text-center">최저점 (합격선) *</label>
                            <div class="flex items-center justify-center gap-1">
                                <input id="modalPublicMin" type="text" inputmode="decimal" placeholder="필수" class="input-field w-full py-1.5 px-1 text-right font-black text-emerald-400 bg-slate-900 border-emerald-500/50 rounded-lg text-xs" />
                                <span class="modal-unit text-slate-400 text-[11px] shrink-0">점</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 5. 출처 / 비고 -->
                <div>
                    <label class="block text-slate-300 font-semibold mb-1">출처 / 비고</label>
                    <input id="modalPublicNote" type="text" value="공식 합격선" placeholder="예: 고교 입시설명회 발표 자료" class="input-field w-full py-2 px-3 bg-slate-900 border-slate-700 rounded-xl text-slate-300 text-xs" />
                </div>
            </div>

            <!-- 하단 취소 및 추가하기 버튼 (시원한 5:5 그리드) -->
            <div class="grid grid-cols-2 gap-3 pt-3 border-t border-slate-700/60 mt-2">
                <button id="cancelAddPublicModalBtn" type="button" class="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-bold text-xs transition-colors cursor-pointer text-center">
                    취소
                </button>
                <button id="submitAddPublicModalBtn" type="button" class="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg shadow-indigo-950/50 hover:shadow-indigo-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 text-center">
                    <span>➕</span> 추가하기
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const schoolSel = document.getElementById('modalPublicSchool');
    const deptSel = document.getElementById('modalPublicDeptSelect');
    const deptCustom = document.getElementById('modalPublicDeptCustom');
    const trackSel = document.getElementById('modalPublicTrackSelect');

    // 학교와 전형에 따른 실시간 점수 만점 힌트 계산 함수
    const getSchoolTrackHint = (schoolName, trackName, category) => {
        const sch = (schoolName || '').trim();
        const trk = (trackName || '').trim();

        if (sch.includes('일반고') || category === '후기 일반고') {
            return '석차 백분율 (%) 기준';
        }

        if (sch.includes('마이스터') || sch.includes('울산마이스터')) {
            if (trk.includes('특별')) return '300점 만점 기준 (특별전형)';
            return '300점 만점 기준 (일반전형)';
        }

        if (sch.includes('에너지') || sch.includes('울산에너지')) {
            if (trk.includes('특별')) return '230점 만점 기준 (특별전형)';
            return '230점 만점 기준 (일반전형)';
        }

        if (sch.includes('현대공업') || sch.includes('현대공고')) {
            if (trk.includes('특별')) return '200점 만점 기준 (특별전형)';
            return '200점 만점 기준 (일반전형)';
        }

        // 특성화고
        if (trk.includes('취업') || trk.includes('특별')) {
            return '100점 만점 기준 (취업희망자/특별전형)';
        }
        return '100점 만점 기준 (일반전형)';
    };

    // 점수 입력창의 힌트 텍스트 및 placeholder 동적 업데이트
    const updateScoreHint = () => {
        const selectedOpt = schoolSel.options[schoolSel.selectedIndex];
        const schoolName = selectedOpt ? selectedOpt.value : '';
        const category = selectedOpt ? selectedOpt.dataset.category : '';
        const unit = (selectedOpt ? selectedOpt.dataset.unit : '') || '점';
        const trackName = trackSel ? trackSel.value : '';

        const hintText = getSchoolTrackHint(schoolName, trackName, category);
        const badge = modal.querySelector('#modalScoreHintBadge');
        if (badge) badge.textContent = hintText;

        const minInput = modal.querySelector('#modalPublicMin');
        const maxInput = modal.querySelector('#modalPublicMax');
        const avgInput = modal.querySelector('#modalPublicAvg');

        if (unit === '%') {
            if (minInput) minInput.placeholder = '예: 142.44';
            if (avgInput) avgInput.placeholder = '예: 166.44';
            if (maxInput) maxInput.placeholder = '선택';
        } else {
            if (schoolName.includes('마이스터')) {
                if (minInput) minInput.placeholder = '예: 245.22';
                if (avgInput) avgInput.placeholder = '예: 272.60';
                if (maxInput) maxInput.placeholder = '예: 300.0';
            } else if (schoolName.includes('에너지')) {
                if (minInput) minInput.placeholder = '예: 185.0';
                if (avgInput) avgInput.placeholder = '선택';
                if (maxInput) maxInput.placeholder = '선택';
            } else if (schoolName.includes('현대공업')) {
                if (minInput) minInput.placeholder = '예: 160.0';
                if (avgInput) avgInput.placeholder = '선택';
                if (maxInput) maxInput.placeholder = '선택';
            } else {
                if (minInput) minInput.placeholder = '예: 70.0';
                if (avgInput) avgInput.placeholder = '선택';
                if (maxInput) maxInput.placeholder = '선택';
            }
        }
    };

    // 학교 변경 시 최신 학과 목록 및 전형 목록, 단위 자동 연동
    const syncSchoolFields = () => {
        const selectedOpt = schoolSel.options[schoolSel.selectedIndex];
        const schoolName = selectedOpt.value;
        const category = selectedOpt.dataset.category;
        const unit = selectedOpt.dataset.unit || '점';

        // 1. 점수 단위 업데이트
        modal.querySelectorAll('.modal-unit').forEach(el => el.textContent = unit);

        // 2. 최신 학과 드롭다운 자동 갱신
        const depts = schoolDeptMap[schoolName] || [];
        let deptHTML = `<option value="">학교 전체 (공통)</option>`;
        depts.forEach(d => {
            deptHTML += `<option value="${d}">${d}</option>`;
        });
        deptHTML += `<option value="__custom__">✏️ 직접 입력...</option>`;
        deptSel.innerHTML = deptHTML;
        deptCustom.classList.add('hidden');
        deptCustom.value = '';

        // 3. 전형 드롭다운 학교 유형별 맞춤 갱신
        let trackHTML = `<option value="">전체 (비움)</option>`;
        if (category === '마이스터고') {
            trackHTML += `<option value="일반" selected>일반</option>`;
            trackHTML += `<option value="특별">특별</option>`;
        } else if (category === '특성화고') {
            trackHTML += `<option value="일반" selected>일반</option>`;
            trackHTML += `<option value="취업희망자">취업희망자</option>`;
        } else {
            // 후기 일반고
            trackHTML += `<option value="일반" selected>일반</option>`;
        }
        trackSel.innerHTML = trackHTML;

        // 4. 점수 힌트 갱신
        updateScoreHint();
    };

    deptSel.addEventListener('change', () => {
        if (deptSel.value === '__custom__') {
            deptCustom.classList.remove('hidden');
            deptCustom.focus();
        } else {
            deptCustom.classList.add('hidden');
        }
    });

    trackSel.addEventListener('change', updateScoreHint);
    schoolSel.addEventListener('change', syncSchoolFields);
    syncSchoolFields();

    const closeModal = () => modal.remove();
    document.getElementById('closeAddPublicModalBtn').addEventListener('click', closeModal);
    document.getElementById('cancelAddPublicModalBtn').addEventListener('click', closeModal);

    document.getElementById('submitAddPublicModalBtn').addEventListener('click', async () => {
        const year = parseInt(document.getElementById('modalPublicYear').value, 10);
        const school = schoolSel.value;
        
        let dept = deptSel.value;
        if (dept === '__custom__') {
            dept = deptCustom.value.trim();
        }

        const track = trackSel.value.trim(); // 비우면 '' (전체)
        const minStr = document.getElementById('modalPublicMin').value.trim();
        const maxStr = document.getElementById('modalPublicMax').value.trim();
        const avgStr = document.getElementById('modalPublicAvg').value.trim();
        const note = document.getElementById('modalPublicNote').value.trim() || '공식 합격선';

        const minVal = parseFloat(minStr);
        if (isNaN(minVal) || minVal <= 0) {
            await showModalAlert({
                title: '입력 확인',
                message: '최저점(합격선/필수)을 올바른 숫자로 입력해 주세요.',
                type: 'warning'
            });
            document.getElementById('modalPublicMin').focus();
            return;
        }

        const maxVal = parseFloat(maxStr);
        const avgVal = parseFloat(avgStr);
        const unit = school.includes('일반계고') ? '%' : '점';

        onAddCallback({
            year,
            school,
            dept,
            track,
            min: minVal,
            max: !isNaN(maxVal) && maxVal > 0 ? maxVal : '',
            avg: !isNaN(avgVal) && avgVal > 0 ? avgVal : '',
            unit,
            note
        });

        closeModal();
    });
}
