import './style.css';
import './app.css';

import { CheckSetupComplete, GetSchoolConfig, VerifyAdminPassword, SyncWithServer, GetAppVersion, OpenExcelFile, ProcessExcel, GetClassStatus, GetClassGrades } from '../wailsjs/go/main/App';
import middleSchools from './assets/middleschools.json';
import logoUniversal from './assets/images/logo-universal.png';

const app = document.querySelector('#app');

// 현재 로그인한 사용자 세션 (role, classNum, username 등 저장)
window.currentUser = null;

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

// ===== SweetAlert2 스타일 커스텀 모달 알림창 =====
function showModalAlert({ title = '알림', message = '', type = 'info', confirmText = '확인' } = {}) {
    return new Promise((resolve) => {
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

        modal.innerHTML = `
            <div class="glass-card max-w-md w-full p-6 text-center shadow-2xl border border-slate-700/80 rounded-2xl animate-in zoom-in-95 duration-200">
                <div class="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center border-2 ${iconConfig.bg} shadow-lg">
                    ${iconConfig.icon}
                </div>
                <h3 class="text-xl font-bold text-white mb-2">${title}</h3>
                <div class="text-sm text-slate-300 mb-6 leading-relaxed text-left max-h-[60vh] overflow-y-auto">
                    ${typeof message === 'string' && !message.includes('<') ? `<p class="text-center text-slate-200">${message}</p>` : message}
                </div>
                <button id="modalAlertConfirmBtn" class="w-full py-2.5 px-5 rounded-xl text-white font-bold text-sm ${iconConfig.btnBg} shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer">
                    ${confirmText}
                </button>
            </div>
        `;

        document.body.appendChild(modal);

        const confirmBtn = modal.querySelector('#modalAlertConfirmBtn');
        const handleClose = () => {
            modal.remove();
            resolve(true);
        };

        confirmBtn.onclick = handleClose;
        modal.onclick = (e) => {
            if (e.target === modal) handleClose();
        };

        const onKeyDown = (e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
                window.removeEventListener('keydown', onKeyDown);
                handleClose();
            }
        };
        window.addEventListener('keydown', onKeyDown);
    });
}
window.showModalAlert = showModalAlert;

// ===== SweetAlert2 스타일 커스텀 모달 확인창 (브라우저 confirm 대체) =====
function showModalConfirm({ title = '확인', message = '', type = 'warning', confirmText = '확인', cancelText = '취소' } = {}) {
    return new Promise((resolve) => {
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

        modal.innerHTML = `
            <div class="glass-card max-w-md w-full p-6 text-center shadow-2xl border border-slate-700/80 rounded-2xl animate-in zoom-in-95 duration-200">
                <div class="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center border-2 ${iconConfig.bg} shadow-lg">
                    ${iconConfig.icon}
                </div>
                <h3 class="text-xl font-bold text-white mb-2">${title}</h3>
                <div class="text-sm text-slate-300 mb-6 leading-relaxed text-left max-h-[60vh] overflow-y-auto">
                    ${typeof message === 'string' && !message.includes('<') ? `<p class="text-center text-slate-200">${message}</p>` : message}
                </div>
                <div class="flex items-center justify-center gap-3">
                    <button id="modalConfirmCancelBtn" class="flex-1 py-2.5 px-4 rounded-xl text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-600 font-bold text-sm transition-all cursor-pointer">
                        ${cancelText}
                    </button>
                    <button id="modalConfirmOkBtn" class="flex-1 py-2.5 px-4 rounded-xl text-white font-bold text-sm ${iconConfig.btnBg} shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer">
                        ${confirmText}
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
            alert(`'${username}' 계정의 배포자료를 적용했습니다.\n공용 데이터 암호와 학년부장이 정한 초기 비밀번호로 로그인하세요.`);
            window.location.reload();
        } catch (err) {
            alert('배포자료 가져오기 실패: ' + err);
        } finally {
            button.disabled = false;
            button.innerHTML = '<div class="font-bold text-white text-base">📦 학년부장 배포자료 가져오기</div><p class="text-xs text-slate-300 mt-2">담임·진로부장이 받은 <strong>.phgcpkg</strong> 파일을 적용합니다. 적용 후 본인 초기 비밀번호로 로그인합니다.</p>';
        }
    });
    document.getElementById('firstRunArchiveImportBtn').addEventListener('click', async () => {
        const password = prompt('최종 보관본 암호를 입력하세요.');
        if (!password) return;
        const button = document.getElementById('firstRunArchiveImportBtn');
        try {
            button.disabled = true;
            button.textContent = '최종 보관본 복원 중...';
            const path = await window.go.main.App.OpenFinalArchive();
            if (!path) return;
            const school = await window.go.main.App.ImportFinalArchive(path, password);
            alert(`${school} 최종 보관본을 복원했습니다.\n학년부장 개인 비밀번호로 로그인하세요.`);
            window.location.reload();
        } catch (err) {
            alert('최종 보관본 복원 실패: ' + err);
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
            <div class="p-4 rounded-xl bg-warning/10 border border-warning/30 mb-4 text-sm space-y-3 text-left">
                <div class="font-bold text-warning flex items-center justify-between text-base">
                    <span>⬆️ 새 버전 업데이트 발견 (${result.latestVersion})</span>
                    <span class="text-xs px-2 py-0.5 rounded bg-warning/20 text-warning">v${result.latestVersion}</span>
                </div>
                <div class="text-text-muted text-xs leading-relaxed">${result.releaseNotes}</div>
                <div class="flex items-center gap-3 pt-1">
                    <button id="autoUpdateBtn" class="btn-primary text-xs px-4 py-2.5 font-bold flex items-center gap-2" style="background: linear-gradient(135deg, #f59e0b, #d97706); width: auto;">
                        🚀 원클릭 자동 업데이트 실행
                    </button>
                    <a href="${result.downloadUrl}" target="_blank"
                       class="text-xs text-text-muted hover:text-slate-200 transition-colors underline">
                        수동 다운로드
                    </a>
                </div>
                <div id="updateStatusMsg" class="text-xs font-bold text-warning hidden"></div>
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

    // 원클릭 자동 업데이트 버튼 이벤트
    document.getElementById('autoUpdateBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('autoUpdateBtn');
        const statusMsg = document.getElementById('updateStatusMsg');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> <span>최신 파일 다운로드 중...</span>';
        statusMsg.className = 'text-xs font-bold text-warning';
        statusMsg.textContent = '최신 업데이트 파일을 다운로드하고 있습니다. 다운로드가 완료되면 프로그램이 자동으로 재시작됩니다...';
        statusMsg.classList.remove('hidden');

        try {
            await window.go.main.App.PerformAutoUpdate(result.downloadUrl);
        } catch (err) {
            btn.disabled = false;
            btn.textContent = '🚀 다시 시도';
            statusMsg.className = 'text-xs font-bold text-danger';
            statusMsg.textContent = '자동 업데이트 실패: ' + err + ' (수동 다운로드를 이용해 주세요)';
        }
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
                    <!-- 통계 및 대장 -->
                    <button id="openAdminSchoolStatsBtn" class="btn-secondary text-xs px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 hover:border-indigo-400/50" style="width: auto;" title="전교 고교별 지원현황 및 학교 통계">
                        🏫 전교 학교 통계
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
    document.getElementById('backBtn').addEventListener('click', async () => {
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
        const nextYear = prompt("새 입시학년도를 입력하세요 (예: 2028):", new Date().getFullYear() + 1);
        if (!nextYear) return;

        if (confirm(`입시년도를 [${nextYear}학년도]로 전환하시겠습니까?\n\n※ 고교별 커트라인 데이터는 안전하게 보존되며, 학생들의 성적/출결/봉사 데이터만 깔끔하게 초기화됩니다.`)) {
            try {
                await window.go.main.App.ResetAcademicYear(parseInt(nextYear));
                alert(`${nextYear}학년도로 성공적으로 전환되었습니다!`);
                renderAdminScreen(schoolName);
            } catch (err) {
                alert("입시년도 전환 실패: " + err);
            }
        }
    });

    document.getElementById('resetDataBtn')?.addEventListener('click', async () => {
        if (confirm("정말 모든 데이터를 완전 초기화하시겠습니까?\n학교 설정과 업로드된 모든 성적 파일이 삭제되며 되돌릴 수 없습니다.")) {
            try {
                await window.go.main.App.ResetAllData();
                alert("모든 데이터가 초기화되었습니다. 프로그램이 재시작됩니다.");
                window.location.reload();
            } catch (err) {
                alert("데이터 초기화 실패: " + err);
            }
        }
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
        renderAdminScreen(schoolName);
    });

    document.getElementById('openAdminSchoolStatsBtn')?.addEventListener('click', openApplicationSummaryModal);
    document.getElementById('openAdminRegisterBtn')?.addEventListener('click', openApplicationRegisterModal);

    document.getElementById('finalArchiveBtn')?.addEventListener('click', async () => {
        const password = prompt('최종 보관본을 보호할 새 암호를 입력하세요.\n이 암호는 복원할 때 반드시 필요하며 공용 데이터 암호와 별도로 보관하세요.');
        if (!password) return;
        const confirmPassword = prompt('보관본 암호를 한 번 더 입력하세요.');
        if (password !== confirmPassword) return alert('보관본 암호가 일치하지 않습니다.');
        try {
            const path = await window.go.main.App.SaveFinalArchive(password);
            if (path) alert(`암호화된 최종 보관본을 만들었습니다.\n${path}\n\n새 프로그램 폴더의 로그인 화면에서 복원할 수 있습니다.`);
        } catch (err) { alert('최종 보관본 생성 실패: ' + err); }
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

    document.getElementById('importPatchBtn')?.addEventListener('click', async () => {
        const password = prompt('공용 데이터 잠금 비밀번호를 입력하세요.');
        if (!password) return;
        try {
            const preview = await window.go.main.App.OpenTeacherPatchPreview(password);
            openPatchMergeSelection(preview, password, schoolName);
        } catch (err) {
            alert('취합자료 가져오기 실패: ' + err);
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
        return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-success/20 text-success border border-success/30">🟢 일반고 안정 (${percentile.toFixed(2)}%)</span>`;
    } else if (percentile <= border) {
        return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-warning/20 text-warning border border-warning/30">🟡 일반고 경계 (${percentile.toFixed(2)}%)</span>`;
    } else {
        return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-danger/20 text-danger border border-danger/30">🔴 일반고 주의 (${percentile.toFixed(2)}%)</span>`;
    }
}
window.getGeneralGuideCutoff = getGeneralGuideCutoff;
window.setGeneralGuideCutoff = setGeneralGuideCutoff;
window.getGeneralGuideBadge = getGeneralGuideBadge;

// 화면 전체가 아닌 선택한 문서만 A4로 인쇄한다.
// 매트릭스는 열 수가 많아 A4 가로, 개인 문서는 A4 세로를 기본값으로 사용한다.
function printOnly(kind, orientation = 'portrait') {
    const allowedKinds = new Set(['report', 'transcript', 'matrix', 'register', 'summary', 'guide']);
    const safeKind = allowedKinds.has(kind) ? kind : 'report';
    const safeOrientation = orientation === 'landscape' ? 'landscape' : 'portrait';
    const previous = document.getElementById('runtimePrintPageStyle');
    previous?.remove();

    const pageStyle = document.createElement('style');
    pageStyle.id = 'runtimePrintPageStyle';
    pageStyle.textContent = `@page { size: A4 ${safeOrientation}; margin: 10mm; }`;
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
                    ${window.currentUser && window.currentUser.Role === 'homeroom' ? `<button id="exportCurrentClassPatchBtn" class="btn-secondary whitespace-nowrap text-xs px-3 py-2 flex items-center gap-1.5"><span>📤</span> 취합자료제출(담임)</button>` : ''}
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

    document.getElementById('classGridHomeBtn')?.addEventListener('click', () => {
        loadClass(null);
    });

    document.getElementById('openTeacherGuideBtn')?.addEventListener('click', () => {
        renderGuideModal(window.currentUser?.Role || 'homeroom');
    });

    document.getElementById('backBtn').addEventListener('click', async () => {
        app.className = '';
        if (window.currentUser && (window.currentUser.Role === 'homeroom' || window.currentUser.Role === 'viewer')) {
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
        .replace(/\s+/gu, '')
        .trim();
}

function isSameTrack(left, right) {
    const a = String(left || '').replace('전형', '');
    const b = String(right || '').replace('전형', '');
    return a.includes(b) || b.includes(a);
}

// ===== 마이스터고 및 특성화고 합격 가능 예측 뱃지 렌더러 =====
function renderPredictionBadges(results, cutoffs, schoolGroup) {
    const isMeister = schoolGroup === 'meister';
    const schoolNames = isMeister
        ? new Set(['울산마이스터고', '울산에너지고', '현대공업고'])
        : new Set(['울산상업고', '울산여자상업고', '울산생활과학고', '울산공업고', '울산산업고', '울산미용예술고', '울산기술공업고']);

    // 해당 학교군에 등록된 커트라인이 존재하는지 확인
    const relevantCutoffs = (cutoffs || []).filter(c =>
        schoolNames.has(normalizeSchoolName(c.schoolName)) && Number(c.minValue) > 0
    );

    if (!relevantCutoffs.length) {
        return '<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/60 text-[11px] shadow-xs">커트라인 미등록</span>';
    }

    const badges = [];
    const seen = new Set();

    (results || []).filter(r => schoolNames.has(normalizeSchoolName(r.schoolName))).forEach(r => {
        const candidates = relevantCutoffs
            .filter(c => normalizeSchoolName(c.schoolName) === normalizeSchoolName(r.schoolName)
                && isSameTrack(c.track, r.trackName))
            .sort((a, b) => Number(b.year || 0) - Number(a.year || 0));

        candidates.forEach(c => {
            const deptLabel = (!c.department || c.department === '공통') ? '' : c.department;
            const key = `${normalizeSchoolName(r.schoolName)}_${deptLabel}_${r.trackName}`;

            if (!seen.has(key) && Number(r.totalScore) >= Number(c.minValue)) {
                seen.add(key);
                const displayLabel = deptLabel
                    ? `${r.schoolName} · ${deptLabel}`
                    : `${r.schoolName} (${r.trackName})`;

                const badgeColor = isMeister
                    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                    : 'border-cyan-400/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25';

                badges.push(`<span class="inline-flex items-center rounded-full border ${badgeColor} px-2.5 py-0.5 text-[11px] font-bold shadow-xs whitespace-nowrap transition-colors">${displayLabel}</span>`);
            }
        });
    });

    if (!badges.length) {
        return '<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-950/40 text-rose-300/80 border border-rose-500/30 text-[11px] font-medium shadow-xs">지원권 밖</span>';
    }
    const visible = badges.slice(0, 3).join('');
    const extra = badges.length > 3 ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded-full bg-indigo-950/60 border border-indigo-500/40 text-[10px] font-bold text-indigo-300 ml-1">+${badges.length - 3}</span>` : '';
    return `<div class="flex flex-wrap justify-center items-center gap-1.5">${visible}${extra}</div>`;
}

// ===== 희망학교 세로 1열 스택(Vertical Stack) 렌더러 =====
function renderApplicationSummary(applications) {
    const completed = (applications || []).filter(a => a.status && a.status !== '미입력');
    if (!completed.length) {
        return '<span class="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-800/80 text-slate-400 text-xs border border-slate-700/60 font-medium shadow-xs">미입력</span>';
    }

    const getStatusTheme = (status) => {
        switch (status) {
            case '합격':
            case '최종 진학':
            case '최종진학':
                return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold';
            case '불합격':
                return 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-medium';
            case '지원 완료':
                return 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-semibold';
            case '미진학':
                return 'bg-slate-700/50 text-slate-400 border-slate-600/40 font-medium';
            case '지원 예정':
            default:
                return 'bg-amber-500/15 text-amber-300 border-amber-500/30 font-medium';
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
            <div class="inline-flex items-center justify-between w-full max-w-56 px-2.5 py-1 rounded-xl text-[11px] border ${theme} shadow-xs">
                <span class="truncate max-w-36 font-semibold" title="${school}">${school}</span>
                <span class="ml-1.5 text-[10px] px-2 py-0.5 rounded-full bg-black/30 font-bold whitespace-nowrap border border-white/10">${a.status}</span>
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

    const [fullStudents, dbCutoffs, officialResp] = await Promise.all([
        window.go.main.App.GetClassFullGrades(classNum).catch(() => []),
        window.go.main.App.GetCutoffs().catch(() => []),
        window.go.main.App.GetOfficialAdmissionData().catch(() => null),
    ]);

    // 공식 공개 자료를 커트라인 형태로 정규화 및 결합
    const officialCutoffs = (officialResp?.items || []).map(item => ({
        schoolName: item.schoolName || '',
        department: item.department || '',
        track: item.track || '일반전형',
        minValue: Number(item.minAcceptedScore || item.minValue || 0),
        year: item.admissionYear || item.year || 0,
        isOfficial: true,
    })).filter(c => c.minValue > 0);

    let localOfficials = [];
    try {
        const raw = localStorage.getItem('publicOfficialCutoffData');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                localOfficials = parsed.map(item => ({
                    schoolName: item.school || item.schoolName || '',
                    department: item.dept || item.department || '',
                    track: item.track || '일반전형',
                    minValue: Number(item.min || item.minValue || 0),
                    year: item.year || 0,
                    isOfficial: true,
                })).filter(c => c.minValue > 0);
            }
        }
    } catch (e) {
        console.warn(e);
    }

    const cutoffs = [...(dbCutoffs || []), ...officialCutoffs, ...localOfficials];
    const fullByStudent = new Map((fullStudents || []).map(s => [`${s.studentNum}|${s.name}`, s]));
    const applicationRows = await Promise.all(students.map(async (s) => {
        const records = await window.go.main.App.GetStudentApplications(classNum, s.StudentNum, s.Name).catch(() => []);
        return [`${s.StudentNum}|${s.Name}`, records];
    }));
    const applicationsByStudent = new Map(applicationRows);

    let tbody = '';
    students.forEach((s) => {
        let generalBadge = getGeneralGuideBadge(s.Percentile);
        const full = fullByStudent.get(`${s.StudentNum}|${s.Name}`);
        const meisterBadges = renderPredictionBadges(full?.schoolResults, cutoffs, 'meister');
        const specialBadges = renderPredictionBadges(full?.schoolResults, cutoffs, 'special');
        const applications = applicationsByStudent.get(`${s.StudentNum}|${s.Name}`) || [];
        const applicationSummary = renderApplicationSummary(applications);
        const isPassed = (st) => ['합격', '최종 진학', '최종진학'].includes((st || '').trim());
        const isFinalizedStudent = applications.some(a => {
            if (!isPassed(a.status)) return false;
            if (['meister', 'special'].includes(a.category)) {
                return !!(a.assignedDepartment && a.assignedDepartment.trim());
            }
            if (a.category === 'general') {
                return !!(a.assignedSchool && a.assignedSchool.trim());
            }
            return true;
        });

        let appCellHTML = '';
        if (!applications.length || applications.every(a => !a.status || a.status === '미입력')) {
            appCellHTML = `
                <button class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-dashed border-indigo-500/50 bg-indigo-500/10 hover:bg-indigo-500/25 hover:border-indigo-400 text-indigo-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-xs btn-student-application active:scale-95"
                        data-class="${classNum}" data-num="${s.StudentNum}" data-name="${s.Name}" title="클릭하여 희망학교 입력">
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
                                data-class="${classNum}" data-num="${s.StudentNum}" data-name="${s.Name}" title="희망학교 변경 및 수정">
                            <svg class="w-3.5 h-3.5 text-indigo-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            <span>변경</span>
                        </button>
                    `}
                </div>
            `;
        }

        tbody += `
            <tr class="hover:bg-slate-800/70 transition-colors border-b border-slate-700/50">
                <td class="p-3.5 text-center font-mono font-bold text-slate-400">
                    <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-300 shadow-inner">
                        ${s.StudentNum || '-'}
                    </span>
                </td>
                <td class="p-3.5 font-bold text-white text-center text-lg cursor-pointer hover:text-indigo-300 hover:underline text-student-name transition-colors"
                    data-class="${classNum}" data-num="${s.StudentNum}" data-name="${s.Name}" title="클릭하여 진학 상담 시작">
                    ${s.Name}
                </td>
                <td class="p-3.5 text-center">${generalBadge}</td>
                <td class="p-3.5 text-center min-w-68">
                    <div class="flex flex-col gap-2 justify-center items-center">
                        <div class="flex items-center gap-2 text-xs w-full justify-center">
                            <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold whitespace-nowrap shadow-xs">마이스터</span>
                            <div class="flex-1 text-center">${meisterBadges}</div>
                        </div>
                        <div class="flex items-center gap-2 text-xs w-full justify-center">
                            <span class="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold whitespace-nowrap shadow-xs">특성화</span>
                            <div class="flex-1 text-center">${specialBadges}</div>
                        </div>
                    </div>
                </td>
                <td class="p-3.5 text-center min-w-56">${appCellHTML}</td>
                <td class="p-3.5 text-center w-36">
                    <button class="btn-primary w-full text-xs px-3.5 py-2 font-bold inline-flex items-center justify-center gap-1.5 rounded-xl btn-student-counsel transition-all hover:scale-105 shadow-md shadow-indigo-500/20 cursor-pointer active:scale-95"
                            data-class="${classNum}" data-num="${s.StudentNum}" data-name="${s.Name}">
                        <svg class="w-3.5 h-3.5 text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                        <span class="whitespace-nowrap">진학 상담</span>
                    </button>
                </td>
            </tr>
        `;
    });

    document.getElementById('teacherContent').innerHTML = `
        <div class="flex items-center justify-between mb-4 flex-wrap gap-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
            <div class="text-sm text-text-muted flex-1 min-w-50">
                <span class="text-white font-semibold">학생 목록</span> (총 <span class="font-bold text-indigo-400">${students.length}</span>명)
                <div class="text-[11px] mt-1 text-slate-400">개인정보 보호를 위해 상세 점수는 상담창에서만 노출됩니다</div>
            </div>
            <div class="flex gap-2 flex-wrap">
                <button id="openMatrixBtn" class="btn-secondary text-xs px-3 py-2 font-bold flex items-center gap-1.5" title="우리 반 전체 고교별 신호등 매트릭스 보기">
                    <svg class="w-3.5 h-3.5 text-indigo-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                    <span>신호등 매트릭스</span>
                </button>
                <button id="openClassApplicationSummaryBtn" class="btn-secondary text-xs px-3 py-2 font-bold flex items-center gap-1.5" title="우리 반 지원희망 통계">
                    <svg class="w-3.5 h-3.5 text-emerald-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                    <span>우리 반 통계</span>
                </button>
            </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-800/30">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-slate-800/90 text-text-muted text-sm border-b border-slate-700/70">
                        <th class="p-3.5 font-semibold text-center w-16">번호</th>
                        <th class="p-3.5 font-semibold text-center w-32">성명</th>
                        <th class="p-3.5 font-semibold text-center w-48">일반계고 합격 예측</th>
                        <th class="p-3.5 font-semibold text-center min-w-64">마이스터 및 특성화고 지원가능</th>
                        <th class="p-3.5 font-semibold text-center min-w-56">희망학교</th>
                        <th class="p-3.5 font-semibold text-center w-36">진학 상담</th>
                    </tr>
                </thead>
                <tbody>
                    ${tbody}
                </tbody>
            </table>
        </div>
        <div class="mt-4 text-xs text-text-muted text-right">
            * 일반고 지표는 3학년 1학기 성적 기준 간이 참고치이며, 정식 일반고 내신은 교육청 프로그램을 따릅니다.
        </div>
    `;

    // 신호등 매트릭스 버튼
    document.getElementById('openMatrixBtn').addEventListener('click', () => {
        openMatrixModal(classNum);
    });

    document.getElementById('openClassApplicationSummaryBtn')?.addEventListener('click', () => {
        openClassApplicationSummaryModal(classNum);
    });

    document.getElementById('exportCurrentClassPatchBtn')?.addEventListener('click', async () => {
        const password = prompt('학년부장이 안내한 공용 데이터 암호를 입력하세요.');
        if (!password) return;
        try {
            const path = await window.go.main.App.SaveCurrentClassPatch(password);
            alert(`취합자료 파일을 저장했습니다.\n${path}\n\n이 파일을 학년부장에게 전달하세요.`);
        } catch (err) {
            alert('취합자료 제출 실패: ' + err);
        }
    });

    // 1. 학생 고교별 진학 상담 버튼 클릭 이벤트 바인딩
    document.querySelectorAll('.btn-student-counsel').forEach(el => {
        el.addEventListener('click', (e) => {
            const target = e.currentTarget;
            const cNum = parseInt(target.dataset.class);
            const sNum = target.dataset.num;
            const sName = target.dataset.name;
            openStudentModal(cNum, sNum, sName);
        });
    });

    document.querySelectorAll('.btn-student-application').forEach(el => {
        el.addEventListener('click', (e) => {
            const target = e.currentTarget;
            openStudentApplicationModal(parseInt(target.dataset.class), target.dataset.num, target.dataset.name);
        });
    });

    // 2. 학생 이름 클릭 시: 전과목 전학년 교과/비교과 종합 성적표 모달 호출
    document.querySelectorAll('.text-student-name').forEach(el => {
        el.addEventListener('click', (e) => {
            const target = e.currentTarget;
            const cNum = parseInt(target.dataset.class);
            const sNum = target.dataset.num;
            const sName = target.dataset.name;
            openStudentTranscriptModal(cNum, sNum, sName);
        });
    });
}

// Homeroom teachers need a compact view of their own students' intended
// applications, without receiving any other class's data or school-wide
// result-management controls.
async function openApplicationRegisterModal() {
    document.getElementById('applicationRegisterModal')?.remove();
    const records = await window.go.main.App.GetSchoolApplicationRecords();
    const rows = records.map((r, i) => {
        let schoolDisplay = r.schoolName || (r.category === 'general' ? '후기 일반고' : (r.category === 'none' ? '미진학' : '-'));
        if (r.category === 'general' && r.assignedSchool) {
            schoolDisplay = `후기 일반고 <span class="text-xs text-indigo-300 font-semibold">[배정: ${r.assignedSchool}]</span>`;
        }
        let deptDisplay = '-';
        if (r.category === 'general') {
            deptDisplay = r.assignedSchool ? `[배정고] ${r.assignedSchool}` : '-';
        } else {
            deptDisplay = r.assignedDepartment ? `[배정] ${r.assignedDepartment}` : (r.preferences?.join(' → ') || '-');
        }
        return `<tr><td>${i + 1}</td><td>${r.classNum}반</td><td>${r.studentNum}</td><td><b>${r.studentName}</b></td><td>${r.admissionYear}</td><td>${schoolDisplay}</td><td>${r.track || '-'}</td><td>${deptDisplay}</td><td>${r.score ? r.score.toFixed(2) : '-'}</td><td>${r.status}</td></tr>`;
    }).join('') || '<tr><td colspan="10">기록된 지원현황이 없습니다.</td></tr>';
    const modal = document.createElement('div'); modal.id = 'applicationRegisterModal'; modal.className = 'fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = `<div class="glass-card print-document p-7 w-full max-w-7xl"><div class="flex justify-between mb-4"><div><h2 class="text-2xl font-bold">🗂️ 학교 내부 원서대장</h2><p class="text-xs text-text-muted">학교 내부 관리용이며 공식 원서 서식을 대체하지 않습니다.</p></div><div class="no-print"><button id="printRegister" class="btn-secondary px-3 py-2">🖨️ 인쇄 / PDF</button><button id="closeRegister" class="ml-2 text-xl">×</button></div></div><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr><th>번호</th><th>반</th><th>번</th><th>성명</th><th>입학년도</th><th>지원학교</th><th>전형</th><th>학과/지망(배정)</th><th>점수</th><th>결과</th></tr></thead><tbody>${rows}</tbody></table></div></div>`; document.body.appendChild(modal); document.getElementById('closeRegister').onclick = () => modal.remove(); document.getElementById('printRegister').onclick = () => printOnly('register');
}

async function openClassApplicationSummaryModal(classNum) {
    document.getElementById('classApplicationSummaryModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'classApplicationSummaryModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.innerHTML = '<div class="glass-card p-7"><span class="spinner"></span> 우리 반 지원희망을 집계하는 중...</div>';
    document.body.appendChild(modal);
    try {
        const summaries = await window.go.main.App.GetClassApplicationSummaries(classNum);
        const categoryLabel = category => ({ meister: '마이스터고', special: '특성화고', self_foreign: '자사고·외고', general: '후기 일반고', other: '기타 (전기 기타고/타시도 등)', none: '미진학' }[category] || category);
        let rows = '<tr><td colspan="11" class="p-10 text-center text-text-muted">우리 반에 기록된 지원희망이 없습니다.</td></tr>';
        if (summaries.length) {
            let currentSchool = null, currentCategory = null, currentYear = null;
            let currentDept = null, currentRank = null;
            const groupedRows = [];

            summaries.forEach(s => {
                const isSameGroup = currentSchool === s.schoolName && currentCategory === s.category && currentYear === s.admissionYear;
                const isSameDept = isSameGroup && currentDept === s.department;
                const isSameRank = isSameDept && currentRank === s.preferenceRank;

                let rowSpanSchool = 0, rowSpanDept = 0, rowSpanRank = 0;

                if (!isSameGroup) {
                    currentSchool = s.schoolName; currentCategory = s.category; currentYear = s.admissionYear;
                    rowSpanSchool = summaries.filter(x => x.schoolName === currentSchool && x.category === currentCategory && x.admissionYear === currentYear).length;
                }
                if (!isSameDept) {
                    currentDept = s.department;
                    rowSpanDept = summaries.filter(x => x.schoolName === currentSchool && x.category === currentCategory && x.admissionYear === currentYear && x.department === currentDept).length;
                }
                if (!isSameRank) {
                    currentRank = s.preferenceRank;
                    rowSpanRank = summaries.filter(x => x.schoolName === currentSchool && x.category === currentCategory && x.admissionYear === currentYear && x.department === currentDept && x.preferenceRank === currentRank).length;
                }

                groupedRows.push({
                    ...s,
                    isFirstGroup: !isSameGroup, rowSpanSchool,
                    isFirstDept: !isSameDept, rowSpanDept,
                    isFirstRank: !isSameRank, rowSpanRank
                });
            });

            rows = groupedRows.map(s => {
                const groupCells = s.isFirstGroup ? `<td class="p-3 border-r border-slate-700/50" rowspan="${s.rowSpanSchool}">${s.admissionYear}학년도</td><td class="p-3 border-r border-slate-700/50" rowspan="${s.rowSpanSchool}">${categoryLabel(s.category)}</td><td class="p-3 font-bold text-white border-r border-slate-700/50" rowspan="${s.rowSpanSchool}">${s.schoolName || '후기 일반고'}</td>` : '';
                const deptCell = s.isFirstDept ? `<td class="p-3 border-r border-slate-700/50" rowspan="${s.rowSpanDept}">${s.department || '-'}</td>` : '';
                const rankCell = s.isFirstRank ? `<td class="p-3 text-center border-r border-slate-700/50" rowspan="${s.rowSpanRank}">${s.preferenceRank ? `${s.preferenceRank}지망` : '-'}</td>` : '';

                return `<tr class="border-b border-slate-700/60 hover:bg-slate-800/40 transition-colors">
                    ${groupCells}
                    ${deptCell}
                    ${rankCell}
                    <td class="p-3">${s.track || '-'}</td>
                    <td class="p-3 text-center text-cyan-200 font-medium">${s.plannedCount}</td>
                    <td class="p-3 text-center text-indigo-200 font-medium">${s.submittedCount}</td>
                    <td class="p-3 text-center text-emerald-300 font-medium">${s.acceptedCount}</td>
                    <td class="p-3 text-center text-rose-300 font-medium">${s.rejectedCount}</td>
                    <td class="p-3 text-center font-bold text-white">${s.finalCount}</td>
                </tr>`;
            }).join('');
        }
        modal.innerHTML = `<div class="glass-card print-document p-7 w-full max-w-6xl"><div class="flex justify-between items-start gap-4 mb-5"><div><h2 class="text-2xl font-bold text-white">📋 ${classNum}반 지원희망</h2><p class="text-sm text-text-muted mt-1">본인 학급 자료만 집계합니다. 다른 학급·학교 전체 자료는 표시하지 않습니다.</p></div><div class="no-print flex items-center gap-2"><button id="printClassSummary" class="btn-secondary px-3 py-2 text-sm">🖨️ 인쇄 / PDF</button><button id="closeClassApplicationSummary" class="text-3xl text-text-muted">×</button></div></div><div class="overflow-auto max-h-[70vh] border border-slate-700 rounded-xl"><table class="w-full text-sm"><thead class="sticky top-0 bg-slate-800"><tr><th class="p-3">입학년도</th><th class="p-3">구분</th><th class="p-3">학교</th><th class="p-3">학과</th><th class="p-3">지망</th><th class="p-3">전형</th><th class="p-3">예정</th><th class="p-3">지원</th><th class="p-3">합격</th><th class="p-3">불합격</th><th class="p-3">최종</th></tr></thead><tbody>${rows}</tbody></table></div><p class="mt-4 text-xs text-text-muted">* 학생별 입력·수정은 목록의 ‘지원 현황’ 버튼에서 합니다. 취합자료는 학년부장에게 전달해 병합할 수 있습니다.</p></div>`;
        document.getElementById('closeClassApplicationSummary').onclick = () => modal.remove();
        document.getElementById('printClassSummary').onclick = () => printOnly('summary', 'landscape');
    } catch (err) {
        modal.innerHTML = `<div class="glass-card p-7 max-w-lg"><h2 class="text-xl font-bold mb-3">우리 반 지원희망을 불러올 수 없습니다</h2><p class="text-text-muted">${err}</p><button id="closeClassApplicationSummary" class="btn-secondary w-auto px-4 py-2 mt-5">닫기</button></div>`;
        document.getElementById('closeClassApplicationSummary').onclick = () => modal.remove();
    }
}

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
        const [summaries, config] = await Promise.all([
            window.go.main.App.GetApplicationSummaries(),
            window.go.main.App.GetSchoolConfig(),
        ]);
        const admissionYear = config?.admissionYear || new Date().getFullYear() + 1;
        const [closure, review] = await Promise.all([
            window.go.main.App.GetAdmissionClosure(admissionYear),
            window.go.main.App.GetAdmissionClosureReview(admissionYear),
        ]);
        const rows = summaries.length ? summaries.map(s => `<tr class="border-b border-slate-700/60"><td class="p-3">${s.admissionYear}학년도</td><td class="p-3">${s.category === 'meister' ? '마이스터고' : s.category === 'special' ? '특성화고' : s.category === 'self_foreign' ? '자사고·외고' : s.category === 'general' ? '후기 일반고' : s.category === 'none' ? '미진학' : '기타'}</td><td class="p-3 font-bold">${s.schoolName || (s.category === 'general' ? '후기 일반고' : (s.category === 'none' ? '미진학' : '-'))}</td><td class="p-3">${s.track || '-'}</td><td class="p-3">${s.department || '-'}</td><td class="p-3 text-center">${s.preferenceRank ? `${s.preferenceRank}지망` : '-'}</td><td class="p-3 text-center">${s.plannedCount}</td><td class="p-3 text-center">${s.submittedCount}</td><td class="p-3 text-center text-success">${s.acceptedCount}</td><td class="p-3 text-center text-danger">${s.rejectedCount}</td><td class="p-3 text-center">${s.finalCount}</td><td class="p-3 text-right">${s.acceptedCount ? `${s.maxAcceptedScore.toFixed(2)} / ${s.minAcceptedScore.toFixed(2)} / ${s.avgAcceptedScore.toFixed(2)}` : '-'}</td><td class="p-3 text-right">${s.rejectedCount ? s.maxRejectedScore.toFixed(2) : '-'}</td></tr>`).join('') : '<tr><td colspan="13" class="p-10 text-center text-text-muted">기록된 지원현황이 없습니다.</td></tr>';
        const canApplyCutoffs = window.currentUser?.Role === 'master';
        const canViewExpected = window.currentUser?.Role === 'master' || window.currentUser?.Role === 'viewer';
        const closeInfo = closure
            ? `<div class="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4"><p class="font-bold text-emerald-200">🔒 ${admissionYear}학년도 입시 결과 확정됨</p><p class="text-xs text-slate-300 mt-1">확정자: ${closure.closedBy || '학년부장'} · 결과 커트라인 ${closure.cutoffsApplied || 0}건 반영됨${closure.note ? ` · 메모: ${closure.note}` : ''}</p></div>`
            : `<div class="rounded-xl border ${review.pendingCount ? 'border-amber-400/40 bg-amber-500/10' : 'border-sky-400/40 bg-sky-500/10'} p-4"><p class="font-bold ${review.pendingCount ? 'text-amber-200' : 'text-sky-200'}">${admissionYear}학년도 결과 확정 전</p><p class="text-xs text-slate-300 mt-1">기록 ${review.totalRecorded}건 · 진행 중 ${review.pendingCount}건 · 합격 ${review.acceptedCount}건 · 불합격 ${review.rejectedCount}건 · 포기 ${review.withdrawnCount}건 · 최종 진학 ${review.finalCount}건</p><p class="text-xs text-slate-400 mt-1">진행 중 기록을 모두 결과 상태로 바꾼 뒤 확정하면 수정이 잠기고, 합격 결과가 우리 학교 커트라인에 자동 반영됩니다.</p></div>`;
        const closeControls = canApplyCutoffs
            ? (closure
                ? '<button id="reopenAdmissionYear" class="btn-secondary w-auto px-4 py-2 text-sm font-medium">🔓 결과 확정 해제</button>'
                : `<input id="admissionClosureNote" class="input-field w-44 py-2 text-xs" placeholder="확정 메모 (선택)"><button id="closeAdmissionYear" class="btn-primary w-auto px-4 py-2 text-sm font-medium">🔒 입시 결과 확정</button>`)
            : '';
        modal.innerHTML = `
            <div class="glass-card p-6 sm:p-7 w-full max-w-7xl max-h-[92vh] flex flex-col my-auto shadow-2xl">
                <div class="shrink-0 flex justify-between items-start gap-4 mb-4 pb-3 border-b border-slate-700/60">
                    <div>
                        <h2 class="text-2xl font-bold text-white flex items-center gap-2">📋 우리 학교 지원현황</h2>
                        <p class="text-sm text-text-muted mt-1">기본 화면은 학교 내부 암호화 자료입니다. 중앙 전송은 학년부장이 아래 버튼을 눌러야만 진행됩니다.</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="closeApplicationSummary" class="text-2xl text-slate-400 hover:text-white px-3 py-1 rounded-lg hover:bg-slate-700/50 transition-colors" title="닫기 (ESC)">✕</button>
                    </div>
                </div>
                <div class="shrink-0 mb-3">${closeInfo}</div>
                <div class="overflow-auto flex-1 min-h-40 border border-slate-700 rounded-xl mb-4 bg-slate-900/40">
                    <table class="w-full text-sm">
                        <thead class="sticky top-0 bg-slate-800 z-10">
                            <tr>
                                <th class="p-3">입학년도</th><th class="p-3">구분</th><th class="p-3">학교</th><th class="p-3">전형</th><th class="p-3">학과</th><th class="p-3">지망</th><th class="p-3">예정</th><th class="p-3">지원</th><th class="p-3">합격</th><th class="p-3">불합격</th><th class="p-3">최종</th><th class="p-3">합격 최고 / 최저 / 평균</th><th class="p-3">최고 불합격</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div class="shrink-0 pt-3 border-t border-slate-700/60 flex flex-wrap justify-between items-center gap-3">
                    <p class="text-xs text-text-muted">* 최고·최저·평균은 수기 입력값이 아니라 합격·최종진학 기록의 점수 스냅샷으로 자동 계산됩니다.</p>
                    <div class="flex flex-wrap items-center gap-2">
                        <button id="closeApplicationSummaryBottom" class="btn-secondary w-auto px-4 py-2 text-sm font-bold flex items-center gap-1.5 hover:bg-slate-700">← 닫기 (목록으로)</button>
                        <span class="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm">🔒 100% 오프라인 안전 모드 (외부 유출 원천 차단)</span>
                        ${canApplyCutoffs ? '<button id="applyApplicationCutoffs" class="btn-secondary w-auto px-4 py-2 text-sm">📈 합격 결과를 우리 학교 커트라인에 반영</button>' : ''}
                        ${closeControls}
                    </div>
                </div>
            </div>`;
        document.getElementById('closeApplicationSummary').onclick = closeModal;
        document.getElementById('closeApplicationSummaryBottom').onclick = closeModal;
        document.getElementById('applyApplicationCutoffs')?.addEventListener('click', async () => {
            if (!confirm('합격·최종진학 결과의 최고·최저·평균 점수를 우리 학교 커트라인으로 반영할까요?\n기존 같은 연도·학교·전형·학과의 커트라인은 결과값으로 갱신됩니다.')) return;
            try {
                const count = await window.go.main.App.ApplyApplicationCutoffs();
                alert(count ? `${count}건의 우리 학교 커트라인을 반영했습니다.` : '반영할 합격 결과가 없습니다.');
            } catch (err) { alert('커트라인 반영 실패: ' + err); }
        });
        document.getElementById('closeAdmissionYear')?.addEventListener('click', async () => {
            if (review.pendingCount) return alert(`진행 중인 기록이 ${review.pendingCount}건 있습니다. 모두 합격·불합격·포기·최종 진학으로 결과를 입력한 뒤 확정해주세요.`);
            if (!confirm(`${admissionYear}학년도 입시 결과를 확정할까요?\n\n확정하면 해당 연도 지원현황을 수정할 수 없고, 합격 결과의 최고·최저·평균이 우리 학교 커트라인에 자동 반영됩니다.`)) return;
            try {
                const note = document.getElementById('admissionClosureNote')?.value?.trim() || '';
                const result = await window.go.main.App.CloseAdmissionYear(admissionYear, note);
                alert(`${admissionYear}학년도 입시 결과를 확정했습니다.\n커트라인 ${result.cutoffsApplied || 0}건이 반영되었습니다.`);
                closeModal();
                openApplicationSummaryModal();
            } catch (err) { alert('입시 결과 확정 실패: ' + err); }
        });
        document.getElementById('reopenAdmissionYear')?.addEventListener('click', async () => {
            if (!confirm(`${admissionYear}학년도 입시 결과 확정을 해제할까요?\n\n지원현황을 다시 수정할 수 있습니다. 이미 반영된 커트라인은 자동으로 지워지지 않으므로 필요하면 커트라인 관리에서 검토해주세요.`)) return;
            try {
                await window.go.main.App.ReopenAdmissionYear(admissionYear);
                alert('입시 결과 확정을 해제했습니다.');
                closeModal();
                openApplicationSummaryModal();
            } catch (err) { alert('입시 결과 확정 해제 실패: ' + err); }
        });
    } catch (err) {
        modal.innerHTML = `<div class="glass-card p-7 my-auto max-w-lg"><h2 class="text-xl font-bold mb-3">지원현황 집계 실패</h2><p class="text-text-muted mb-4">${err}</p><button id="closeApplicationSummaryError" class="btn-secondary w-auto px-4 py-2">← 닫기</button></div>`;
        document.getElementById('closeApplicationSummaryError').onclick = closeModal;
    }
}

// ===== 학생별 지원·합격 결과 (학교 내부 암호화 DB 전용) =====
async function openStudentApplicationModal(classNum, studentNum, name) {
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
            return `<option value="">학교 선택</option>${schools.map(name => `<option value="${name}" ${name === selected ? 'selected' : ''}>${name}</option>`).join('')}`;
        }
        if (category === 'other') {
            const schools = ['울산예술고등학교', '울산스포츠과학고등학교', '울산고운고등학교', '울산애니원고등학교', '울산과학고등학교', '타시도 고등학교', '기타'];
            return `<option value="">선택 안 함</option>${schools.map(name => `<option value="${name}" ${name === selected ? 'selected' : ''}>${name}</option>`).join('')}`;
        }
        if (category === 'none') {
            return `<option value="미진학" selected>미진학</option>`;
        }
        const filtered = catalog.filter(s => typeMatches(s.type, category));
        if (!filtered.length) {
            if (category === 'meister') {
                const meisterDefaults = ['울산마이스터고등학교', '울산에너지고등학교', '현대공업고등학교'];
                return `<option value="">학교 선택</option>${meisterDefaults.map(name => `<option value="${name}" ${name === selected ? 'selected' : ''}>${name}</option>`).join('')}`;
            }
            if (category === 'special') {
                const specialDefaults = ['울산공업고등학교', '울산기술공업고등학교', '울산미용예술고등학교', '울산산업고등학교', '울산생활과학고등학교', '울산상업고등학교', '울산여자기술공업고등학교'];
                return `<option value="">학교 선택</option>${specialDefaults.map(name => `<option value="${name}" ${name === selected ? 'selected' : ''}>${name}</option>`).join('')}`;
            }
            return '<option value="">해당 없음</option>';
        }
        return `<option value="">학교 선택</option>${filtered.map(s => `<option value="${s.name}" ${s.name === selected ? 'selected' : ''}>${s.name}</option>`).join('')}`;
    };
    const departmentOptions = (schoolName, selected = '', placeholder = '', allPreferences = [], currentIndex = -1) => {
        const school = catalog.find(s => s.name === schoolName);
        return `<option value="">${placeholder}</option>${(school?.departments || []).map(d => {
            const isSelectedHere = d === selected;
            const otherIndex = allPreferences.findIndex((p, i) => i !== currentIndex && p === d && p !== '');
            if (otherIndex !== -1) {
                return `<option value="${d}" disabled>${d} (${otherIndex + 1}지망에 선택됨)</option>`;
            }
            return `<option value="${d}" ${isSelectedHere ? 'selected' : ''}>${d}</option>`;
        }).join('')}`;
    };
    const departmentControls = (schoolName, preferences = [], assignedDepartment = '') => {
        const departments = catalog.find(s => s.name === schoolName)?.departments || [];
        if (!schoolName) return '<p class="text-xs text-text-muted">지원 학교를 선택하면 해당 학교의 학과 수에 맞춰 지망 입력란이 표시됩니다.</p>';
        if (!departments.length) return '<p class="text-xs text-amber-300">이 학교의 학과 목록을 불러오지 못했습니다. 학년부장에게 최신 배포자료를 받아 다시 적용하세요.</p>';
        const count = Math.min(5, departments.length);
        const paddedPrefs = Array.from({ length: count }, (_, i) => preferences[i] || '');
        return `<p class="text-sm font-bold mb-2">학과 지망 <span class="text-text-muted font-normal">(다른 지망에 선택된 학과는 비활성화됩니다)</span></p><div class="grid grid-cols-1 md:grid-cols-2 gap-3">${paddedPrefs.map((selected, i) => `<select class="input-field app-pref text-sm">${departmentOptions(schoolName, selected, `${i + 1}지망`, paddedPrefs, i)}</select>`).join('')}</div><label class="text-sm font-bold block mt-3">최종 배정 학과<select id="appAssigned" class="input-field mt-1 w-full text-sm">${departmentOptions(schoolName, assignedDepartment, '최종 배정 학과 선택')}</select></label>`;
    };
    const render = async (selectedIndex = 0) => {
        const records = await withFallback(
            () => window.go?.main?.App?.GetStudentApplications?.(classNum, studentNum, name),
            [],
        );
        const record = records[selectedIndex] || { admissionYear: new Date().getFullYear() + 1, category: 'meister', status: '지원희망', preferences: [] };
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

        const list = records.length ? records.map((r, i) => {
            const isRecNone = r.category === 'none';
            const nameLabel = isRecNone ? '미진학' : (r.schoolName || (r.category === 'general' ? (r.assignedSchool ? `일반고[${r.assignedSchool}]` : '후기 일반고') : '기타'));
            const trackPart = ['meister', 'special'].includes(r.category) ? formatTrack(r.track) : '';
            const statusPart = isRecNone ? '미진학' : ((r.status === '지원예정' || r.status === '지원 예정' || !r.status) ? '지원희망' : r.status);
            const isRecPassed = ['합격', '최종 진학', '최종진학'].includes((r.status || '').trim());
            const isRecFin = isRecPassed && ((['meister', 'special'].includes(r.category) && !!r.assignedDepartment) || (r.category === 'general' && !!r.assignedSchool) || (!['meister', 'special', 'general'].includes(r.category)));
            const lockIcon = isRecFin ? '🔒 ' : '';
            return `<button class="app-record-tab px-3 py-2 rounded-lg text-xs font-bold ${i === selectedIndex ? 'bg-primary text-white' : 'bg-slate-800 text-text-muted'}" data-index="${i}">${lockIcon}${nameLabel}${trackPart} · ${statusPart}</button>`;
        }).join('') : '<span class="text-sm text-text-muted">기록된 지원 이력이 없습니다.</span>';

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
          <div class="glass-card p-7 w-full max-w-3xl max-h-[90vh] overflow-y-auto"><div class="flex justify-between items-start gap-4 mb-5"><div><h2 class="text-2xl font-bold text-white">📝 ${name} 지원·합격 현황</h2><p class="text-sm text-text-muted mt-1">이 자료는 학급 암호화 DB와 취합자료 파일에만 저장됩니다. 중앙 서버로 전송되지 않습니다.</p></div><button id="closeApplicationModal" class="text-3xl text-text-muted">×</button></div>
          <div class="flex flex-wrap gap-2 mb-5">${list}</div>
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
        if (!canEdit || isLocked) modal.querySelectorAll('#appPreferenceArea select').forEach(el => { el.disabled = true; });
        modal.querySelectorAll('.app-record-tab').forEach(btn => btn.onclick = () => render(parseInt(btn.dataset.index)));

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
                select.onchange = () => refreshDepartmentControls();
            });
        };
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
            if (!confirm(`'${displayName}' 지원 기록을 완전히 삭제하시겠습니까?`)) return;
            try {
                await window.go.main.App.DeleteStudentApplication(classNum, studentNum, name, record.category, record.schoolName, record.track);
                await render(0);
                if (typeof window.refreshCurrentClass === 'function') window.refreshCurrentClass();
            } catch (err) {
                alert('희망학교 삭제 실패: ' + err);
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
            <span class="spinner"></span> <span class="text-white ml-2">${name} 학생의 전학년 종합 성적표를 조회하는 중...</span>
        </div>
    `;
    document.body.appendChild(modalEl);

    try {
        const data = await window.go.main.App.GetStudentTranscript(classNum, studentNum, name);

        // 1. 교과 성적 행(Tr) 생성
        let subjectRows = '';
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
                    // 키와 값의 공백('과 목' -> '과목', '학 년' -> '학년')을 완전히 제거하여 매칭
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

                // 나이스 엑셀의 병합 셀 처리 (빈칸이면 직전 행의 학년/학기 계승)
                if (grade) lastGrade = grade;
                else grade = lastGrade;

                if (sem) lastSem = sem;
                else sem = lastSem;

                // 유효하지 않은 과목명 또는 잡음 행 필터링 (슬래시, 숫자만 있는 행, 학교명 등)
                if (!subject || !achieve || subject === '/' || !isNaN(Number(subject)) || subject.length < 2) return;
                // 성취도가 A, B, C, D, E, P 로 시작하지 않으면 건너뜀 (예: 수강자수 단독 행 등)
                const firstChar = achieve[0].toUpperCase();
                if (!['A', 'B', 'C', 'D', 'E', 'P'].includes(firstChar)) return;

                let badgeColor = 'text-slate-300';
                if (achieve.startsWith('A')) badgeColor = 'text-emerald-400 font-bold';
                else if (achieve.startsWith('B')) badgeColor = 'text-sky-400 font-bold';
                else if (achieve.startsWith('C')) badgeColor = 'text-amber-400 font-bold';
                else if (achieve.startsWith('D')) badgeColor = 'text-orange-400 font-bold';
                else if (achieve.startsWith('E')) badgeColor = 'text-rose-400 font-bold';
                else if (achieve.startsWith('P')) badgeColor = 'text-indigo-300 font-semibold';

                subjectRows += `
                    <tr class="hover:bg-slate-800/40 border-b border-slate-700/40 text-center">
                        <td class="p-2 text-slate-400">${grade}학년</td>
                        <td class="p-2 text-slate-400">${sem}학기</td>
                        <td class="p-2 font-bold text-white text-left pl-4">${subject}</td>
                        <td class="p-2 ${badgeColor}">${achieve}</td>
                        <td class="p-2 text-slate-400 text-xs font-mono">${rawScore || '-'}</td>
                    </tr>
                `;
            });
        }

        if (!subjectRows) {
            subjectRows = `<tr><td colspan="5" class="p-8 text-center text-text-muted">업로드된 교과 성적 데이터가 없거나 파싱할 과목이 없습니다.</td></tr>`;
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
                            <span>📄</span> ${classNum}반 ${studentNum}번 <span class="text-primary font-bold">${name}</span> 종합 성적표
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

                <!-- 2. 전학년 전과목 교과 성적표 -->
                <div class="space-y-2">
                    <h3 class="text-sm font-bold text-white flex items-center gap-1.5">
                        <span>📚</span> 전학년 학기별 과목 성적 상세 내역
                    </h3>
                    <div class="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-900/40 max-h-72 custom-scrollbar">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead class="sticky top-0 bg-slate-800 border-b border-slate-700/70 text-text-muted text-center z-10">
                                <tr>
                                    <th class="p-2.5 w-16">학년</th>
                                    <th class="p-2.5 w-16">학기</th>
                                    <th class="p-2.5 text-left pl-4">교과목명</th>
                                    <th class="p-2.5 w-24">성취도</th>
                                    <th class="p-2.5 w-44">원점수/평균(표준편차)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${subjectRows}
                            </tbody>
                        </table>
                    </div>
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

    } catch (err) {
        modalEl.innerHTML = `
            <div class="glass-card p-8 w-full max-w-md text-center">
                <div class="text-danger text-4xl mb-3">⚠️</div>
                <div class="text-white font-bold mb-4">성적표를 불러오지 못했습니다</div>
                <div class="text-text-muted text-sm mb-6">${err}</div>
                <button class="btn-secondary w-full" onclick="document.getElementById('studentTranscriptModal').remove()">닫기</button>
            </div>
        `;
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
            <span class="spinner"></span> <span class="text-white ml-2">${name} 학생의 고교별 산출 데이터를 분석하는 중...</span>
        </div>
    `;
    document.body.appendChild(modalEl);

    try {
        const [fullData, cutoffs, official] = await Promise.all([
            window.go.main.App.GetStudentFullDetail(classNum, studentNum, name),
            window.go.main.App.GetCutoffs().catch(() => []),
            window.go.main.App.GetOfficialAdmissionData().catch(() => ({ items: [] })),
        ]);

        renderStudentModalContent(modalEl, classNum, studentNum, name, fullData, cutoffs, official?.items || []);
    } catch (err) {
        modalEl.innerHTML = `
            <div class="glass-card p-8 w-full max-w-md text-center">
                <div class="text-danger text-4xl mb-3">⚠️</div>
                <div class="text-white font-bold mb-4">데이터를 불러오지 못했습니다</div>
                <div class="text-text-muted text-sm mb-6">${err}</div>
                <button class="btn-secondary w-full" onclick="document.getElementById('studentDetailModal').remove()">닫기</button>
            </div>
        `;
    }
}

// 모달 내용 렌더링
function renderStudentModalContent(modalEl, classNum, studentNum, name, data, cutoffs, officialItems = []) {
    // 학교별 합격 가능성 카드 목록 생성
    let cardsHTML = '';

    data.schoolResults.forEach((r, rIdx) => {
        const officialForSchool = (officialItems || []).filter(item =>
            String(item.schoolName || '').includes(r.schoolName.substring(0, 4)) &&
            (!item.track || String(item.track).includes(r.trackName) || r.trackName.includes(String(item.track)))
        ).sort((a, b) => Number(b.admissionYear || 0) - Number(a.admissionYear || 0));
        const officialPrimary = officialForSchool.find(item => Number(item.minAcceptedScore || item.minValue || 0) > 0);
        // 해당 학교 및 전형의 학과별 커트라인 목록 찾기
        const deptsForSchool = (cutoffs || []).filter(c =>
            c.schoolName.includes(r.schoolName.substring(0, 4)) &&
            (c.track.includes(r.trackName) || r.trackName.includes(c.track)) &&
            c.department && c.department !== '공통' && c.minValue > 0
        ).sort((a, b) => b.year - a.year || a.department.localeCompare(b.department, 'ko'));

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
        if (officialPrimary) {
            defaultCutoff = Number(officialPrimary.minAcceptedScore || officialPrimary.minValue);
        } else if (deptsForSchool.length > 0) {
            defaultCutoff = deptsForSchool[0].minValue;
            defaultAvg = deptsForSchool[0].avgValue;
        } else if (cutoffs && cutoffs.length > 0) {
            const found = cutoffs.find(c => c.schoolName.includes(r.schoolName.substring(0, 4)) && c.track.includes(r.trackName));
            if (found && found.minValue > 0) {
                defaultCutoff = found.minValue;
                defaultAvg = found.avgValue;
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

        cardsHTML += `
            <div class="p-4 rounded-xl bg-slate-800/70 border border-slate-700/70 space-y-2.5 school-counsel-card" id="card_${rIdx}"
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
                    <div id="badge_${rIdx}">${initialBadge}</div>
                </div>

                <!-- 학과별 커트라인 선택 드롭다운 (학과가 있는 경우) -->
                ${deptsForSchool.length > 0 ? `
                <div class="flex items-center justify-between bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-700/50 text-xs">
                    <span class="text-indigo-200 font-bold flex items-center gap-1">🎯 목표 학과:</span>
                    <select class="dept-selector bg-slate-800 text-white font-bold border border-slate-600 rounded px-2 py-1 outline-none cursor-pointer"
                            data-card="${rIdx}" data-score="${r.totalScore}" data-max="${r.totalMax}">
                        ${deptsForSchool.map((d, dIdx) => `
                            <option value="${d.minValue}" data-avg="${d.avgValue || 0}" ${dIdx === 0 ? 'selected' : ''}>
                                ${d.department} (최저: ${d.minValue}점${d.avgValue > 0 ? `, 평균: ${d.avgValue}점` : ''})
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

    modalEl.innerHTML = `
        <div class="glass-card print-document p-6 md:p-8 w-full max-w-6xl max-h-[92vh] overflow-y-auto space-y-6 print-modal" id="printReportArea">
            <!-- 모달 헤더 (인쇄 제외 버튼 포함) -->
            <div class="flex items-center justify-between border-b border-slate-700/50 pb-4">
                <div>
                    <h2 class="text-2xl font-black text-white flex items-center gap-2">
                        👨‍🎓 ${name} <span class="text-base text-slate-400 font-normal">(${classNum}반 ${studentNum}번)</span>
                    </h2>
                    <p class="text-xs text-text-muted mt-1">울산 특목·마이스터·특성화고 진학 상담 분석표 (3-1 누적)</p>
                </div>
                <div class="flex items-center gap-2 no-print">
                    <button id="printReportBtn" class="btn-secondary text-xs px-3 py-2 font-bold flex items-center gap-1">
                        🖨️ 인쇄 / PDF
                    </button>
                    <button id="closeModalBtn" class="text-slate-400 hover:text-white p-2 text-xl font-bold bg-transparent border-none cursor-pointer">
                        ✕
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

            <!-- 2. 수기 입력 가산점 및 9/30 출결 영역 (담임용) -->
            ${(() => {
            const isViewer = window.currentUser && window.currentUser.Role === 'viewer';
            const defaultAbsence = data.hasSeptAbsence ? data.septAbsenceDays : (data.rawAbsenceDays || 0);
            const defaultLateEtc = data.hasSeptAbsence ? (data.septLateEtc || 0) : ((data.rawLateCount || 0) + (data.rawEarlyCount || 0) + (data.rawResultCount || 0));
            const defaultOctAbsence = data.hasOctAbsence ? data.octAbsenceDays : defaultAbsence;
            const defaultOctLateEtc = data.hasOctAbsence ? (data.octLateEtc || 0) : defaultLateEtc;

            return `
                <div class="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 space-y-3">
                    <div class="flex items-center justify-between">
                        <h3 class="font-bold text-sm text-indigo-300 flex items-center gap-1.5">
                            <span>✏️</span> 전형별 비교과 입력
                            ${isViewer ? '<span class="text-[11px] text-warning font-normal ml-2">※ 진로부장은 조회 전용 모드입니다.</span>' : ''}
                        </h3>
                        ${!isViewer ? `
                        <button id="saveExtraBtn" class="btn-primary text-xs font-bold no-print" style="width:auto; min-width:130px; padding:8px 12px;">
                            💾 저장·재계산
                        </button>
                        ` : ''}
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                        <div class="rounded-lg border border-indigo-500/30 bg-indigo-950/30 px-3 py-2"><b class="text-indigo-200">마이스터고</b> · 출결·봉사·리더십 <span class="text-amber-300">9/30 마감</span></div>
                        <div class="rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-3 py-2"><b class="text-cyan-200">특성화고</b> · 취업희망자 <span class="text-amber-300">9/30</span> · 일반 <span class="text-amber-300">10/31 마감</span></div>
                        <div class="rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-3 py-2"><b class="text-emerald-200">후기 일반고</b> · 출결·봉사·행발·창체 <span class="text-amber-300">11/30 마감</span></div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 text-xs">
                        <section class="lg:col-span-5 bg-slate-900/60 p-4 rounded-lg border border-indigo-500/30 space-y-3">
                            <div><b class="text-indigo-200 text-sm">① 마이스터·특성화고 비교과</b><span class="ml-2 text-slate-400">취업희망 9/30 · 특성화 일반 10/31</span></div>
                            <div class="grid grid-cols-2 gap-2">
                                <label class="text-slate-300">9/30 결석(일)<input type="number" id="inputSeptAbsence" min="0" max="100" class="input-field w-full text-center mt-1" value="${defaultAbsence}" ${isViewer ? 'disabled' : ''}/></label>
                                <label class="text-slate-300">9/30 지각·조퇴·결과(회)<input type="number" id="inputSeptLateEtc" min="0" max="100" class="input-field w-full text-center mt-1" value="${defaultLateEtc}" ${isViewer ? 'disabled' : ''}/></label>
                                <label class="text-slate-300">10/31 결석(일)<input type="number" id="inputOctAbsence" min="0" max="100" class="input-field w-full text-center mt-1" value="${defaultOctAbsence}" ${isViewer ? 'disabled' : ''}/></label>
                                <label class="text-slate-300">10/31 지각·조퇴·결과(회)<input type="number" id="inputOctLateEtc" min="0" max="100" class="input-field w-full text-center mt-1" value="${defaultOctLateEtc}" ${isViewer ? 'disabled' : ''}/></label>
                                <label class="text-slate-300">추가 봉사(시간)<input type="number" id="inputAddVolunteer" min="0" max="100" class="input-field w-full text-center mt-1" value="${data.addVolunteerHours || 0}" ${isViewer ? 'disabled' : ''}/></label>
                                <label class="text-slate-300">리더십 인정(학기)<input type="number" id="inputLeadershipTerms" min="0" max="4" step="1" class="input-field w-full text-center mt-1" value="${data.leadershipTerms || 0}" ${isViewer ? 'disabled' : ''}/></label>
                            </div>
                            <p class="text-[10px] text-slate-400">출결은 결석 + 기타 3회당 1일입니다. 10/31 확정 전에는 9/30과 같은 누적값을 넣어 예상 점수로 확인하세요. 리더십은 반장·부반장·전교회장·부회장만, 한 학기 2.5점입니다.</p>
                        </section>

                        <section class="lg:col-span-7 bg-slate-900/60 p-4 rounded-lg border border-emerald-500/30 space-y-3">
                            <div><b class="text-emerald-200 text-sm">② 후기 일반고 비교과</b><span class="ml-2 text-slate-400">11/30 마감 · 현재는 3학년 1학기 누적자료로 예상 산출</span></div>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                                ${[1, 2, 3].map(g => `<div class="rounded border border-slate-700/70 p-2"><b class="text-slate-200">${g}학년</b><div class="grid grid-cols-2 gap-1 mt-1"><input type="number" id="inputGeneralAbsence${g}" min="0" class="input-field text-center" value="${extra['general_absence_' + g] ?? ''}" placeholder="결" title="미인정 결석 환산일수" aria-label="${g}학년 미인정 결석 환산일수" ${isViewer ? 'disabled' : ''}/><input type="number" id="inputGeneralVolunteer${g}" min="0" class="input-field text-center" value="${extra['general_volunteer_' + g] ?? ''}" placeholder="봉" title="봉사시간" aria-label="${g}학년 봉사시간" ${isViewer ? 'disabled' : ''}/></div></div>`).join('')}
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div class="rounded border border-slate-700/70 p-2"><b class="text-emerald-200">창체 가산점</b><span class="ml-1 text-slate-400">(+1점씩)</span><div class="flex gap-3 mt-2">${[1, 2, 3].map(g => `<label><input type="checkbox" id="checkChangche${g}" ${extra['changche_' + g] ? 'checked' : ''} ${isViewer ? 'disabled' : ''}/> ${g}학년</label>`).join('')}</div></div>
                                <div class="rounded border border-slate-700/70 p-2"><b class="text-emerald-200">행발 가산점</b><span class="ml-1 text-slate-400">(+1점씩)</span><div class="flex gap-3 mt-2">${[1, 2, 3].map(g => `<label><input type="checkbox" id="checkHaengbal${g}" ${extra['haengbal_' + g] ? 'checked' : ''} ${isViewer ? 'disabled' : ''}/> ${g}학년</label>`).join('')}</div></div>
                            </div>
                            <p class="text-[10px] text-slate-400">11/30에 학년별 결석 환산일수·봉사시간을 확정 입력하면 예상 점수가 확정 점수로 바뀝니다.</p>
                        </section>
                    </div>
                </div>
                `;
        })()}

            <!-- 3. 학교별 합격 가능성 리스트 -->
            <div class="space-y-3">
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <h3 class="font-bold text-sm text-white">🏫 목표 고교별 산출 점수 및 합격 가능성</h3>
                        <p class="text-[11px] text-text-muted mt-0.5">* 면접 점수를 제외한 1차 서류 전형 기준</p>
                    </div>
                    <!-- 탭 메뉴: 직전년도 / 최근 3개년 평균 / 최근 5개년 평균 -->
                    <div class="flex items-center gap-2 flex-wrap">
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

                <div class="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60 flex items-center justify-between text-xs">
                    <span id="cutoffBaselineDesc" class="text-indigo-200 font-medium">🎯 <strong>직전 1개년(작년)</strong> 커트라인 및 공식 발표자료를 기준으로 합격 가능성을 판정합니다.</span>
                    <span class="text-[11px] text-slate-400">탭을 클릭하면 실시간으로 신호등·게이지가 재계산됩니다</span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3" id="schoolCardsContainer">
                    ${cardsHTML}
                </div>
            </div>
        </div>
    `;

    // 닫기 이벤트
    document.getElementById('closeModalBtn').addEventListener('click', () => {
        modalEl.remove();
    });

    // 배경 클릭 시 닫기
    modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) modalEl.remove();
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

            const addVol = parseInt(document.getElementById('inputAddVolunteer').value) || 0;
            const septAbsence = parseInt(document.getElementById('inputSeptAbsence').value) || 0;
            const septLateEtc = parseInt(document.getElementById('inputSeptLateEtc').value) || 0;
            const octAbsence = parseInt(document.getElementById('inputOctAbsence').value) || 0;
            const octLateEtc = parseInt(document.getElementById('inputOctLateEtc').value) || 0;
            const newExtra = {
                add_volunteer: addVol,
                sept_absence: septAbsence,
                sept_late_etc: septLateEtc,
                oct_absence: octAbsence,
                oct_late_etc: octLateEtc,
                leadership_terms: Math.min(4, Math.max(0, parseInt(document.getElementById('inputLeadershipTerms').value) || 0)),
                general_absence_1: parseInt(document.getElementById('inputGeneralAbsence1').value),
                general_absence_2: parseInt(document.getElementById('inputGeneralAbsence2').value),
                general_absence_3: parseInt(document.getElementById('inputGeneralAbsence3').value),
                general_volunteer_1: parseInt(document.getElementById('inputGeneralVolunteer1').value),
                general_volunteer_2: parseInt(document.getElementById('inputGeneralVolunteer2').value),
                general_volunteer_3: parseInt(document.getElementById('inputGeneralVolunteer3').value),
                changche_1: document.getElementById('checkChangche1').checked,
                changche_2: document.getElementById('checkChangche2').checked,
                changche_3: document.getElementById('checkChangche3').checked,
                haengbal_1: document.getElementById('checkHaengbal1').checked,
                haengbal_2: document.getElementById('checkHaengbal2').checked,
                haengbal_3: document.getElementById('checkHaengbal3').checked,
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
    document.getElementById('printReportBtn').addEventListener('click', () => printOnly('report'));
}

// ===== 우리 반 전체 고교 신호등 매트릭스 모달 =====
async function openMatrixModal(classNum) {
    document.getElementById('matrixModal')?.remove();

    const modalEl = document.createElement('div');
    modalEl.id = 'matrixModal';
    modalEl.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modalEl.innerHTML = `
        <div class="glass-card p-8 w-full max-w-[1680px] text-center">
            <span class="spinner"></span> <span class="text-white ml-2">${classNum}반 학생들의 신호등 매트릭스를 구성하는 중...</span>
        </div>
    `;
    document.body.appendChild(modalEl);

    try {
        const fullGrades = await window.go.main.App.GetClassFullGrades(classNum);
        const cutoffs = await window.go.main.App.GetCutoffs().catch(() => []);

        let matrixRows = '';
        fullGrades.forEach(s => {
            // 고교별 배지 생성 헬퍼 함수
            const getBadge = (schoolSubstr, track = '일반') => {
                const r = s.schoolResults.find(x => x.schoolName.includes(schoolSubstr) && x.trackName.includes(track));
                if (!r) return '<span class="text-slate-500">-</span>';

                let foundCutoff = null;
                if (cutoffs) {
                    foundCutoff = cutoffs.find(c => c.schoolName.includes(schoolSubstr) && (c.track.includes(track) || c.department === '공통'));
                }

                if (foundCutoff && foundCutoff.minValue > 0) {
                    if (r.totalScore >= foundCutoff.minValue + 5) {
                        return `<span class="text-success font-bold" title="최저선: ${foundCutoff.minValue}점 (안정)">🟢 ${r.totalScore.toFixed(2)}</span>`;
                    } else if (r.totalScore >= foundCutoff.minValue) {
                        return `<span class="text-warning font-bold" title="최저선: ${foundCutoff.minValue}점 (경계)">🟡 ${r.totalScore.toFixed(2)}</span>`;
                    } else {
                        return `<span class="text-danger font-bold" title="최저선: ${foundCutoff.minValue}점 (주의)">🔴 ${r.totalScore.toFixed(2)}</span>`;
                    }
                }
                return `<span class="text-slate-300 font-medium">${r.totalScore.toFixed(2)}점</span>`;
            };

            const meister = getBadge('마이스터');
            const energy = getBadge('에너지');
            const hyundai = getBadge('현대');
            const sangop = getBadge('상업고');
            const yeosang = getBadge('여자상업고');
            const saenggwa = getBadge('생활과학');
            const gongop = getBadge('공업고');
            const sanup = getBadge('산업고');
            const miyong = getBadge('미용예술');
            const gisul = getBadge('기술공업');
            const general = s.generalHSPercentile <= 80 ? '🟢 안정' : (s.generalHSPercentile <= 90 ? '🟡 경계' : '🔴 주의');

            matrixRows += `
                <tr class="hover:bg-slate-800/60 border-b border-slate-700/50 text-center">
                    <td class="p-2.5 text-slate-400 font-mono">${s.studentNum}</td>
                    <td class="p-2.5 font-bold text-white cursor-pointer hover:underline matrix-student-name"
                        data-class="${classNum}" data-num="${s.studentNum}" data-name="${s.name}">
                        ${s.name}
                    </td>
                    <td class="p-2.5 text-primary font-bold">${s.allAverage.toFixed(2)}</td>
                    <td class="p-2.5">${meister}</td>
                    <td class="p-2.5">${energy}</td>
                    <td class="p-2.5">${hyundai}</td>
                    <td class="p-2.5">${sangop}</td>
                    <td class="p-2.5">${yeosang}</td>
                    <td class="p-2.5">${saenggwa}</td>
                    <td class="p-2.5">${gongop}</td>
                    <td class="p-2.5">${sanup}</td>
                    <td class="p-2.5">${miyong}</td>
                    <td class="p-2.5">${gisul}</td>
                    <td class="p-2.5 font-bold whitespace-nowrap">${general} <span class="text-[11px] text-slate-400">(${s.generalHSPercentile.toFixed(2)}%)</span></td>
                </tr>
            `;
        });

        modalEl.innerHTML = `
            <div class="glass-card print-document p-6 md:p-8 w-full max-w-[1760px] max-h-[92vh] overflow-y-auto space-y-5">
                <div class="flex items-center justify-between border-b border-slate-700/50 pb-4">
                    <div>
                        <h2 class="text-2xl font-black text-white flex items-center gap-2">
                            📊 ${classNum}반 전체 관내 고교별 진학 신호등 매트릭스
                        </h2>
                        <p class="text-xs text-text-muted mt-1">학생 이름을 클릭하면 해당 학생의 세부 상담창으로 즉시 이동합니다. (초록: 안정 / 노랑: 경계 / 빨강: 주의 ※ 실기고사를 치르는 학교는 제외)</p>
                    </div>
                    <button id="closeMatrixBtn" class="no-print text-slate-400 hover:text-white p-2 text-xl font-bold bg-transparent border-none cursor-pointer">✕</button>
                </div>

                <div class="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-800/30">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr class="bg-slate-800/80 text-text-muted border-b border-slate-700/70 text-center whitespace-nowrap">
                                <th class="p-2.5 w-10">번호</th>
                                <th class="p-2.5 w-16">성명</th>
                                <th class="p-2.5 w-14">평균</th>
                                <th class="p-2.5 text-amber-400">🎓 마이스터고</th>
                                <th class="p-2.5 text-amber-400">🎓 에너지고</th>
                                <th class="p-2.5 text-amber-400">🎓 현대공고</th>
                                <th class="p-2.5 text-indigo-400">🛠️ 울산상고</th>
                                <th class="p-2.5 text-indigo-400">🛠️ 울산여상</th>
                                <th class="p-2.5 text-indigo-400">🛠️ 울산생과고</th>
                                <th class="p-2.5 text-indigo-400">🛠️ 울산공고</th>
                                <th class="p-2.5 text-indigo-400">🛠️ 울산산업고</th>
                                <th class="p-2.5 text-indigo-400">🛠️ 미용예술고</th>
                                <th class="p-2.5 text-indigo-400">🛠️ 기술공고</th>
                                <th class="p-2.5 text-emerald-400">🏫 후기 일반계고</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${matrixRows}
                        </tbody>
                    </table>
                </div>
                <div class="flex justify-between items-center text-xs text-text-muted">
                    <div>* 점수 뒤 신호등은 등록된 커트라인 대비 5점 이상 초과 시 안정(🟢), 기준점 이상 시 경계(🟡), 미만 시 주의(🔴)로 표시됩니다.</div>
                    <button id="matrixPrintBtn" class="no-print btn-secondary text-xs px-3 py-1.5 font-bold">🖨️ 매트릭스 인쇄</button>
                </div>
            </div>
        `;

        document.getElementById('closeMatrixBtn').addEventListener('click', () => modalEl.remove());
        document.getElementById('matrixPrintBtn').addEventListener('click', () => printOnly('matrix', 'landscape'));

        // 학생 이름 클릭 시 해당 학생의 상담창으로 이동
        modalEl.querySelectorAll('.matrix-student-name').forEach(el => {
            el.addEventListener('click', (e) => {
                const cNum = parseInt(e.target.dataset.class);
                const sNum = e.target.dataset.num;
                const sName = e.target.dataset.name;
                modalEl.remove();
                openStudentModal(cNum, sNum, sName);
            });
        });

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

function showStartupUpdateModal(result) {
    document.getElementById('startupUpdateModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'startupUpdateModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4 fade-in';
    modal.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-lg border border-warning/40 space-y-5 text-left">
            <div class="flex items-center gap-3 border-b border-slate-700/60 pb-3">
                <span class="text-3xl">🚀</span>
                <div>
                    <h3 class="text-lg font-black text-white">새로운 버전이 출시되었습니다!</h3>
                    <div class="text-xs text-warning font-bold">v${result.latestVersion} (현재 버전: v${result.currentVersion})</div>
                </div>
            </div>

            <div class="space-y-2">
                <div class="text-xs font-bold text-slate-300">📦 업데이트 주요 내용:</div>
                <div class="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 text-xs text-slate-300 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap font-sans">
                    ${result.releaseNotes || '새로운 기능 추가 및 시스템 안정화 패치'}
                </div>
            </div>

            <div id="startupUpdateStatusMsg" class="text-xs font-bold text-warning hidden"></div>

            <div class="flex items-center justify-between gap-3 pt-2 flex-wrap">
                <button id="openDistributionBoardBtn" class="btn-secondary text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5 text-indigo-300 border-indigo-500/40 hover:bg-indigo-950/40" style="width: auto;">
                    🌐 공식 배포자료실 바로가기
                </button>
                <div class="flex items-center gap-2">
                    <button id="skipStartupUpdateBtn" class="btn-secondary text-xs px-4 py-2 font-bold" style="width: auto;">
                        닫기
                    </button>
                    <button id="applyStartupUpdateBtn" class="btn-primary text-xs px-4 py-2 font-bold flex items-center gap-2" style="background: linear-gradient(135deg, #f59e0b, #d97706); width: auto;">
                        🚀 자동 업데이트 다운로드
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const boardUrl = "https://gguk.link/boards/phgc?category=%EB%B0%B0%ED%8F%AC%EC%9E%90%EB%A3%8C";

    document.getElementById('openDistributionBoardBtn')?.addEventListener('click', async () => {
        try {
            if (window.go?.main?.App?.OpenExternalURL) {
                await window.go.main.App.OpenExternalURL(boardUrl);
            } else if (window.runtime?.BrowserOpenURL) {
                window.runtime.BrowserOpenURL(boardUrl);
            } else {
                window.open(boardUrl, '_blank');
            }
        } catch (err) {
            console.error(err);
        }
    });

    document.getElementById('skipStartupUpdateBtn').addEventListener('click', () => {
        modal.remove();
    });

    document.getElementById('applyStartupUpdateBtn').addEventListener('click', async () => {
        const btn = document.getElementById('applyStartupUpdateBtn');
        const skipBtn = document.getElementById('skipStartupUpdateBtn');
        const statusMsg = document.getElementById('startupUpdateStatusMsg');

        btn.disabled = true;
        skipBtn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> <span>다운로드 중...</span>';
        statusMsg.className = 'text-xs font-bold text-warning';
        statusMsg.textContent = '최신 업데이트 파일을 다운로드하고 있습니다. 완료되면 프로그램이 자동으로 재시작됩니다...';
        statusMsg.classList.remove('hidden');

        try {
            await window.go.main.App.PerformAutoUpdate(result.downloadUrl);
        } catch (err) {
            btn.disabled = false;
            skipBtn.disabled = false;
            btn.textContent = '🚀 다시 시도';
            statusMsg.className = 'text-xs font-bold text-danger';
            statusMsg.textContent = '자동 업데이트 실패: ' + err;
        }
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
                <p class="text-slate-300">
                    • 학년부장 선생님께 전달받은 학급 패키지 파일(<strong>.phgcpkg</strong>)을 로그인 화면의 <strong>[📦 학년부장 배포 자료 가져오기]</strong> 버튼을 눌러 적용합니다.<br>
                    • 본인 학급(예: 3반 담임)을 선택하고, 학년부장이 안내한 공용 데이터 암호와 초기 비밀번호를 입력하여 접속합니다. (접속 후 개인 비밀번호 변경 가능)
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-emerald-300 text-base mb-2 flex items-center gap-2">
                    <span>2️⃣</span> 2단계: 학급 진학 현황 및 신호등 매트릭스 분석
                </h3>
                <p class="text-slate-300">
                    • <strong>일반계고 합격 예측:</strong> 전교 석차백분율(%) 기준 🟢 안정, 🟡 경계선, 🔴 주의 판정을 한눈에 확인합니다.<br>
                    • <strong>전기 고교 지원가능 신호등:</strong> 마이스터고 및 특성화고의 합격선 대비 지원 가능 여부가 카드별로 자동 표시됩니다.<br>
                    • <strong>📊 신호등 매트릭스:</strong> 상단의 [📊 신호등 매트릭스] 버튼을 클릭하면 우리 반 전체 학생의 관내 전기고교 지원 가능 여부를 한 장의 종합 표로 비교·출력할 수 있습니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-amber-300 text-base mb-2 flex items-center gap-2">
                    <span>3️⃣</span> 3단계: 1:1 심층 상담 (1년/3년평균/5년평균 탭 비교)
                </h3>
                <p class="text-slate-300">
                    • 학생 성명 또는 <strong>[🎯 진학 상담]</strong> 버튼을 클릭하여 개인별 심층 상담창을 엽니다.<br>
                    • <strong>다각도 합격선 비교 탭:</strong> 상단의 <strong>[🎯 직전 1개년]</strong>, <strong>[📊 최근 3년 평균]</strong>, <strong>[📈 최근 5년 평균]</strong> 탭을 클릭하여 고교별 판정 변화와 점수차(±점)를 입체적으로 분석하며 상담합니다.<br>
                    • <strong>희망학교 및 학과 지망 등록:</strong> 상담을 통해 1~5지망 학과를 선택하고 저장합니다. 합격 및 최종 배정 시 데이터 잠금으로 오입력을 방지합니다.<br>
                    • <strong>상담표 인쇄:</strong> 상담창 상단의 [📄 진학 상담 결과표] 버튼으로 학부모 상담용 A4 상담표를 즉시 인쇄/PDF 저장할 수 있습니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-sky-300 text-base mb-2 flex items-center gap-2">
                    <span>4️⃣</span> 4단계: 변경분 취합자료(.phgcpatch) 학년부장 제출
                </h3>
                <p class="text-slate-300">
                    • 2학기 출결(미인정 결석/지각)이나 추가 봉사시간, 리더십 가산점을 상담창에서 수기 반영합니다.<br>
                    • 학급 상담이 마무리되면 화면 상단의 <strong>[📤 취합자료제출(담임)]</strong> 버튼을 눌러 공용 암호로 암호화된 변경분 파일(<strong>.phgcpatch</strong>)을 생성하여 학년부장 선생님께 USB 또는 교내 메신저로 전달합니다.
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
                    <span>1️⃣</span> 1단계: 학교 기초 설정 및 공용 암호 관리
                </h3>
                <p class="text-slate-300">
                    • 최초 실행 시 학교명, 3학년 전체 학급 수, 고교 입학년도를 설정합니다.<br>
                    • 담임교사 PC와 안전하게 오프라인 암호화 통신을 수행하기 위한 <strong>[공용 데이터 잠금 암호]</strong>를 지정합니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-emerald-300 text-base mb-2 flex items-center gap-2">
                    <span>2️⃣</span> 2단계: 나이스(NEIS) 엑셀 3종 데이터 교내 연동
                </h3>
                <p class="text-slate-300">
                    • 관리자 대시보드에서 나이스 출력 엑셀을 순서대로 업로드합니다:<br>
                    &nbsp;&nbsp;① <strong>교과 성적 엑셀:</strong> 전체 학생 명단 및 성취도 자동 추출<br>
                    &nbsp;&nbsp;② <strong>출결 엑셀:</strong> 학년별 미인정 결석/지각/조퇴 자동 연동<br>
                    &nbsp;&nbsp;③ <strong>봉사활동 엑셀:</strong> 3개년 누적 봉사시간 자동 연동
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-amber-300 text-base mb-2 flex items-center gap-2">
                    <span>3️⃣</span> 3단계: 담임교사용 배포 패키지(.phgcpkg) 생성 및 배포
                </h3>
                <p class="text-slate-300">
                    • <strong>[사용자 및 권한 관리]</strong> 메뉴로 이동합니다.<br>
                    • 각 반 담임선생님의 초기 비밀번호를 설정하거나 확인합니다.<br>
                    • <strong>[배포 자료 만들기]</strong> 버튼을 눌러 각 반별 패키지(<strong>.phgcpkg</strong>)를 생성하여 공용 암호와 함께 담임선생님께 전달합니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-sky-300 text-base mb-2 flex items-center gap-2">
                    <span>4️⃣</span> 4단계: 담임교사 취합 자료 선택 병합 (Merge)
                </h3>
                <p class="text-slate-300">
                    • 담임선생님들이 상담 후 제출한 패치 파일(<strong>.phgcpatch</strong>)을 수신합니다.<br>
                    • 관리자 도구 바의 <strong>[📥 취합자료병합]</strong> 버튼을 클릭하고 공용 암호를 확인합니다.<br>
                    • 학생별 변경 항목(출결, 봉사, 가산점, 지원희망)을 확인하고 체크하여 학년부 전체 데이터에 안전하게 병합합니다.
                </p>
            </div>

            <div class="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60">
                <h3 class="font-bold text-purple-300 text-base mb-2 flex items-center gap-2">
                    <span>5️⃣</span> 5단계: 전교 학교 통계 분석 및 원서대장 일괄 출력
                </h3>
                <p class="text-slate-300">
                    • <strong>[🏫 전교 학교 통계]:</strong> 3학년 전체의 고교별/전형별 지망 인원 및 전교생 진학 통계를 한눈에 종합 분석합니다.<br>
                    • <strong>[🖨️ 원서대장]:</strong> 교육청 제출용 교내 원서대장을 정렬/검토하고 A4로 즉시 일괄 출력합니다.<br>
                    • <strong>[커트라인 관리 & 관내 자료 내보내기/병합]:</strong> 최근 5개년 커트라인을 관리하며, 타 학교와 개인정보 없는 순수 통계 파일(<strong>.phgcdata</strong>)을 상호 교환하여 입결 정확도를 극대화합니다.<br>
                    • <strong>[🗄️ 최종 보관본 / 📅 입시년도 전환]:</strong> 입시 종료 후 암호화 최종 보관본을 생성하고, 새 학년도 전환으로 학생 데이터를 안전하게 정리합니다.
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

init();

// ==========================================
// ===== 로그인 화면 =====
export async function renderLoginScreen(schoolName) {
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
                            <span class="font-bold text-emerald-300 text-xs tracking-wide">학년부장 배포 자료 가져오기</span>
                        </button>
                        <button type="button" id="finalArchiveImportBtn" 
                                class="group w-full py-2.5 px-4 rounded-xl border border-amber-500/30 bg-amber-950/15 hover:bg-amber-900/30 hover:border-amber-400/60 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-[0.99]">
                            <span class="text-base group-hover:scale-110 transition-transform">🗄️</span>
                            <span class="font-bold text-amber-300/90 group-hover:text-amber-200 text-xs tracking-wide">암호화 최종 보관본 복원하기</span>
                        </button>
                    </div>
                </form>

                <!-- 현재 설치된 버전 및 수동 업데이트 확인 버튼 -->
                <div class="mt-6 flex flex-col items-center justify-center text-xs text-text-muted gap-2">
                    <div class="flex items-center gap-2 flex-wrap justify-center">
                        <span>현재 버전: <strong class="text-indigo-300 font-mono font-bold">v${localVer}</strong></span>
                        <button type="button" id="manualCheckUpdateBtn" class="text-[11px] py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-bold transition-colors inline-flex items-center gap-1 cursor-pointer">
                            <span>🔄</span> 업데이트 확인
                        </button>
                        <button type="button" id="loginBoardLinkBtn" class="text-[11px] py-1 px-2.5 rounded-lg bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-300 hover:text-indigo-200 border border-indigo-500/40 font-bold transition-colors inline-flex items-center gap-1 cursor-pointer" title="공식 배포자료실 열기">
                            <span>🌐</span> 배포자료실
                        </button>
                    </div>
                    <div id="startupUpdateStatus" class="text-[11px] text-slate-400"></div>
                </div>
            </div>
        `;

        const boardUrl = "https://gguk.link/boards/phgc?category=%EB%B0%B0%ED%8F%AC%EC%9E%90%EB%A3%8C";

        document.getElementById('loginBoardLinkBtn')?.addEventListener('click', async () => {
            try {
                if (window.go?.main?.App?.OpenExternalURL) {
                    await window.go.main.App.OpenExternalURL(boardUrl);
                } else if (window.runtime?.BrowserOpenURL) {
                    window.runtime.BrowserOpenURL(boardUrl);
                } else {
                    window.open(boardUrl, '_blank');
                }
            } catch (err) {
                console.error(err);
            }
        });

        document.getElementById('manualCheckUpdateBtn')?.addEventListener('click', async () => {
            const btn = document.getElementById('manualCheckUpdateBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner" style="width:10px;height:10px;border-width:1.5px;"></span> 확인 중...';
            await checkUpdateOnStartup(localVer, true);
            btn.disabled = false;
            btn.innerHTML = '<span>🔄</span> 업데이트 확인';
        });

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
                alert(`'${username}' 계정의 배포 자료를 적용했습니다.\n학년부장에게 받은 공용 데이터 암호와 초기 비밀번호로 처음 로그인하세요.`);
            } catch (err) {
                alert('배포 자료 가져오기 실패: ' + err);
            } finally {
                button.disabled = false;
                button.innerHTML = '<span class="text-base group-hover:scale-110 transition-transform">📦</span><span class="font-bold text-emerald-300 text-xs tracking-wide">학년부장 배포 자료 가져오기</span>';
            }
        });

        document.getElementById('finalArchiveImportBtn').addEventListener('click', async () => {
            const button = document.getElementById('finalArchiveImportBtn');
            const password = prompt('최종 보관본 암호를 입력하세요. 복원은 새 프로그램 폴더에서만 가능합니다.');
            if (!password) return;
            try {
                button.disabled = true;
                button.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px;"></span> <span class="text-xs font-bold text-amber-200">최종 보관본 복원 중...</span>';
                const path = await window.go.main.App.OpenFinalArchive();
                if (!path) return;
                const school = await window.go.main.App.ImportFinalArchive(path, password);
                alert(`${school} 최종 보관본을 복원했습니다.\n학년부장 개인 비밀번호로 로그인하세요.`);
                window.location.reload();
            } catch (err) {
                alert('최종 보관본 복원 실패: ' + err);
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
export async function renderUserManagementScreen(schoolName) {
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

        if (!confirm('모든 담임(1반~N반)의 비밀번호를 일괄 설정/초기화 하시겠습니까?')) return;

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
                    <td class="p-3.5 font-bold text-slate-200">${roleLabel}</td>
                    <td class="p-3.5 text-text-muted font-mono">${u.Username}</td>
                    <td class="p-3.5">${statusBadge}</td>
                    <td class="p-3.5 text-center">
                        <div class="flex items-center justify-center gap-1.5">
                            <input type="password" id="pw_${u.Username}" class="input-field py-1 px-2.5 text-xs w-28" placeholder="새 비번" />
                            <button class="btn-primary py-1 px-2.5 text-xs whitespace-nowrap rounded font-bold" style="width: auto;" onclick="updateUserPassword('${u.Username}')">
                                ${isInitial ? '비번 설정' : '재설정'}
                            </button>
                        </div>
                    </td>
                    <td class="p-3.5 text-center">
                        ${isMasterAdmin
                        ? '<span class="text-xs text-slate-600 font-bold">해당 없음</span>'
                        : `<button class="text-xs text-indigo-200 hover:text-white font-bold px-2 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-400/30 transition-colors" onclick="createDistributionPackage('${u.Username}')">배포 자료 만들기</button>`
                    }
                    </td>
                    <td class="p-3.5 text-center">
                        ${isMasterAdmin
                        ? '<span class="text-xs text-slate-600 font-bold">보호됨</span>'
                        : `<button class="text-xs text-danger hover:underline font-bold px-2 py-1 rounded bg-danger/10 hover:bg-danger/20 border border-danger/30 transition-colors" onclick="deleteUserAccount('${u.Username}')">삭제</button>`
                    }
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-danger font-bold">${error}</td></tr>`;
        }
    }

    window.updateUserPassword = async (username) => {
        const input = document.getElementById(`pw_${username}`);
        const pw = input.value;
        if (!pw) {
            alert('새 비밀번호를 입력하세요.');
            return;
        }

        if (confirm(`'${username}' 계정의 비밀번호를 설정하시겠습니까?`)) {
            try {
                await window.go.main.App.SetUserPassword(username, pw);
                if (username !== 'admin') {
                    const resetPath = await window.go.main.App.SavePasswordResetPackage(username);
                    if (!resetPath) {
                        throw new Error('비밀번호는 설정되었지만 재설정 파일 저장이 취소되었습니다. 다시 재설정해 파일을 전달하세요.');
                    }
                    alert(`비밀번호가 설정되고 재설정 파일이 만들어졌습니다.\n담임에게 프로그램과 함께 다음 파일을 전달하세요.\n${resetPath}`);
                } else {
                    alert('관리자 비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.');
                }
                input.value = '';
                loadUserList();
            } catch (err) {
                alert('설정 실패: ' + err);
            }
        }
    };

    window.deleteUserAccount = async (username) => {
        if (confirm(`정말로 '${username}' 계정을 삭제하시겠습니까?`)) {
            try {
                await window.go.main.App.DeleteUser(username);
                alert('계정이 삭제되었습니다.');
                loadUserList();
            } catch (err) {
                alert('삭제 실패: ' + err);
            }
        }
    };

    window.createDistributionPackage = async (username) => {
        if (!confirm(`'${username}' 계정용 교사용 배포 자료를 만들까요?\n\n담임용 자료에는 해당 반 DB만, 진로부장용 자료에는 조회용 전체 학급 DB가 포함됩니다. 관리자 계정과 다른 담임 계정은 포함되지 않습니다.`)) return;
        try {
            const path = await window.go.main.App.SaveDistributionPackage(username);
            if (!path) return;
            alert(`'${username}' 계정용 배포 자료 생성이 완료되었습니다!\n\n📂 저장 위치:\n${path}\n\n💡 [안내 사항]\n• 담임 선생님께 프로그램 실행 파일과 위 배포 자료(.phgcpkg), 그리고 학년부장의 [공용 데이터 암호]를 함께 전달해 주세요.\n• 담임 선생님은 로그인 화면에서 ‘배포 자료 가져오기’를 누른 후, 공용 데이터 암호를 입력하여 안전하게 최초 로그인하실 수 있습니다.`);
        } catch (err) {
            alert('배포 자료 생성 실패: ' + err);
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

    // 최근 5개년 자료 구성 (올해 제외하고 직전 학년도부터 5개년, 5년 초과 자료는 DB에서 자동 정리)
    const baseAdmissionYear = currentAdmissionYear - 1;
    currentAdmissionYear = baseAdmissionYear; // 기본 선택 연도를 직전 학년도로 설정
    const admissionYears = Array.from({ length: 5 }, (_, index) => baseAdmissionYear - index);

    // 기본 등록 고교 및 학과 목록
    let defaultSchoolSpecs = [
        // 1. 마이스터고
        {
            name: "울산마이스터고",
            category: "meister",
            categoryLabel: "마이스터고",
            totalMax: "300점 만점",
            scoreType: "total_score",
            unit: "점",
            placeholder: "예: 245.2",
            items: [
                { dept: "정밀기계과", track: "일반" },
                { dept: "정밀기계과", track: "특별" },
                { dept: "산업설비과", track: "일반" },
                { dept: "산업설비과", track: "특별" }
            ]
        },
        {
            name: "울산에너지고",
            category: "meister",
            categoryLabel: "마이스터고",
            totalMax: "230점 만점",
            scoreType: "total_score",
            unit: "점",
            placeholder: "예: 185.0",
            items: [
                { dept: "전력제어과", track: "일반" },
                { dept: "전력제어과", track: "특별" },
                { dept: "신재생에너지과", track: "일반" },
                { dept: "신재생에너지과", track: "특별" }
            ]
        },
        {
            name: "현대공업고",
            category: "meister",
            categoryLabel: "마이스터고",
            totalMax: "200점 만점",
            scoreType: "total_score",
            unit: "점",
            placeholder: "예: 160.0",
            items: [
                { dept: "정밀기계과", track: "일반" },
                { dept: "정밀기계과", track: "특별" },
                { dept: "산업설비과", track: "일반" },
                { dept: "산업설비과", track: "특별" },
                { dept: "전기제어과", track: "일반" },
                { dept: "전기제어과", track: "특별" }
            ]
        },
        // 2. 특성화고
        {
            name: "울산상업고",
            category: "special",
            categoryLabel: "특성화고",
            totalMax: "100점 만점",
            scoreType: "total_score",
            unit: "점",
            placeholder: "예: 75.0",
            items: [
                { dept: "물류경영과", track: "일반" },
                { dept: "물류경영과", track: "취업희망자" },
                { dept: "공공사무행정과", track: "일반" },
                { dept: "공공사무행정과", track: "취업희망자" },
                { dept: "군사행정과", track: "일반" }
            ]
        },
        {
            name: "울산여자상업고",
            category: "special",
            categoryLabel: "특성화고",
            totalMax: "100점 만점",
            scoreType: "total_score",
            unit: "점",
            placeholder: "예: 70.0",
            items: [
                { dept: "금융사무과", track: "일반" },
                { dept: "금융사무과", track: "취업희망자" },
                { dept: "글로벌비즈니스과", track: "일반" },
                { dept: "글로벌비즈니스과", track: "취업희망자" },
                { dept: "관광레저과", track: "일반" },
                { dept: "관광레저과", track: "취업희망자" }
            ]
        },
        {
            name: "울산생활과학고",
            category: "special",
            categoryLabel: "특성화고",
            totalMax: "100점 만점",
            scoreType: "total_score",
            unit: "점",
            placeholder: "예: 68.0",
            items: [
                { dept: "조리과", track: "일반" },
                { dept: "조리과", track: "취업희망자" },
                { dept: "제과제빵과", track: "일반" },
                { dept: "제과제빵과", track: "취업희망자" },
                { dept: "뷰티예술과", track: "일반" },
                { dept: "뷰티예술과", track: "취업희망자" }
            ]
        },
        {
            name: "울산공업고등학교", category: "special", categoryLabel: "특성화고", totalMax: "100점 만점", scoreType: "total_score", unit: "점", placeholder: "예: 70.0",
            items: ["건축과", "기계과", "전기과", "전자통신과", "토목과", "화공과"].map(dept => ({ dept, track: "일반" }))
        },
        {
            name: "울산산업고등학교", category: "special", categoryLabel: "특성화고", totalMax: "100점 만점", scoreType: "total_score", unit: "점", placeholder: "예: 70.0",
            items: ["농식품가공과", "보건간호과", "원예디자인과", "금융경영과"].map(dept => ({ dept, track: "일반" }))
        },
        {
            name: "울산기술공업고등학교", category: "special", categoryLabel: "특성화고", totalMax: "100점 만점", scoreType: "total_score", unit: "점", placeholder: "예: 70.0",
            items: ["기계과", "전기과"].map(dept => ({ dept, track: "일반" }))
        },
        // 3. 후기 일반고
        {
            name: "울산 후기 일반계고",
            category: "general",
            categoryLabel: "후기 일반고",
            totalMax: "석차 백분율",
            scoreType: "percentile",
            unit: "%",
            placeholder: "예: 85.00",
            items: [
                { dept: "공통", track: "일반" }
            ]
        }
    ];

    // 학과·학교명은 화면에 별도 하드코딩하지 않고 공용 고교 목록을 기준으로
    // 구성한다. 이 목록을 바꾸면 커트라인 입력 화면도 함께 바뀐다.
    try {
        const highSchoolData = await window.go.main.App.GetHighSchoolsData();
        const schools = highSchoolData?.schools || [];
        const catalogSpecs = schools
            .filter(s => s.type === '마이스터고' || s.type === '특성화고')
            .map(s => {
                const isMeister = s.type === '마이스터고';
                const tracks = isMeister ? ['일반', '특별'] : ['일반', '취업희망자'];
                const shortName = normalizeSchoolName(s.name);
                const totalMax = shortName === '울산마이스터고' ? '300점 만점'
                    : shortName === '울산에너지고' ? '230점 만점'
                        : shortName === '현대공업고' ? '200점 만점'
                            : '100점 만점';
                const defaultItems = isMeister
                    ? [
                        { dept: '', track: '일반' },
                        { dept: '', track: '특별' },
                        ...(s.departments || []).flatMap(dept => tracks.map(track => ({ dept, track })))
                    ]
                    : (s.departments || []).flatMap(dept => tracks.map(track => ({ dept, track })));
                return {
                    name: s.name,
                    category: isMeister ? 'meister' : 'special',
                    categoryLabel: s.type,
                    totalMax,
                    scoreType: 'total_score',
                    unit: '점',
                    placeholder: isMeister ? '예: 200.0' : '예: 75.0',
                    items: defaultItems,
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
        console.warn('공용 고교 목록을 불러오지 못해 기본 목록을 사용합니다:', e);
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

    // 공식 공개 입결 레퍼런스 데이터 (울산마이스터고등학교 2024, 2025, 2026 3개년 공식 공개 입결)
    const publicOfficialDefaults = [
        // 울산마이스터고 (300점 만점 고교 공식 공개 자료)
        { year: 2026, school: "울산마이스터고", track: "일반전형", dept: "공통", min: 245.22, max: 300.00, avg: 272.60, unit: "점", note: "공식 합격선" },
        { year: 2026, school: "울산마이스터고", track: "특별전형", dept: "공통", min: 241.03, max: 260.37, avg: 250.70, unit: "점", note: "공식 합격선" },
        { year: 2025, school: "울산마이스터고", track: "일반전형", dept: "공통", min: 218.04, max: 299.09, avg: 258.50, unit: "점", note: "공식 입결" },
        { year: 2025, school: "울산마이스터고", track: "특별전형", dept: "공통", min: 206.33, max: 285.59, avg: 245.90, unit: "점", note: "공식 입결" },
        { year: 2024, school: "울산마이스터고", track: "일반전형", dept: "공통", min: 215.82, max: 291.69, avg: 253.75, unit: "점", note: "공식 입결" },
        { year: 2024, school: "울산마이스터고", track: "특별전형", dept: "공통", min: 212.85, max: 287.15, avg: 250.00, unit: "점", note: "공식 입결" }
    ];
    let publicOfficialData = publicOfficialDefaults;
    try {
        const savedPublicData = localStorage.getItem('publicOfficialCutoffData');
        if (savedPublicData) {
            const parsed = JSON.parse(savedPublicData);
            // 공식 공개자료인 울산마이스터고만 엄선 유지 (이전 비공식 테스트 데이터 정리)
            const cleaned = parsed.filter(x => normalizeSchoolName(x.school) === '울산마이스터고' || !x.school);
            publicOfficialData = cleaned.length > 0 ? cleaned : publicOfficialDefaults;
            localStorage.setItem('publicOfficialCutoffData', JSON.stringify(publicOfficialData));
        } else {
            // 서버에 배포된 공식 입결 자료(official_admission_data.json) 자동 조회
            const officialResp = await window.go.main.App.GetOfficialAdmissionData().catch(() => null);
            if (officialResp?.items && Array.isArray(officialResp.items) && officialResp.items.length > 0) {
                const serverOfficialList = officialResp.items.map(item => ({
                    year: item.admissionYear || item.year || currentAdmissionYear,
                    school: item.schoolName || item.school || '',
                    dept: item.department || '',
                    track: item.track || '일반',
                    min: Number(item.minAcceptedScore || item.minValue || item.min || 0) || '',
                    max: Number(item.maxFailedScore || item.maxValue || item.max || 0) || '',
                    avg: Number(item.avgAcceptedScore || item.avgValue || item.avg || 0) || '',
                    unit: '점',
                    note: item.source || item.note || '공식자료'
                })).filter(x => x.school);

                if (serverOfficialList.length > 0) {
                    publicOfficialData = serverOfficialList;
                    localStorage.setItem('publicOfficialCutoffData', JSON.stringify(publicOfficialData));
                }
            }
        }
    } catch (e) {
        console.warn('공개 데이터 불러오기 실패:', e);
    }

    let currentTab = 'all'; // 'all', 'meister', 'special', 'general', 'public'
    let searchKeyword = '';
    let publicYearFilterMode = 'current'; // 'current': 상단 고교 입학년도 동기화, 'all': 전체 연도 모아보기

    const renderMainScreen = () => {
        // 현재 선택된 입학년도의 커트라인 매핑 (다양한 학과명/전형명 표기 완벽 호환)
        const savedMap = {};
        allSavedCutoffs.filter(c => c.year === currentAdmissionYear).forEach(c => {
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
                    allSavedCutoffs.filter(c => c.year === currentAdmissionYear && normalizeSchoolName(c.schoolName) === schKey).forEach(c => {
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
            // 공식 공개 입결 데이터 탭 뷰 (상단 입학년도 동기화 & 고교/연도별 그룹 묶음)
            const filteredPublicList = publicOfficialData.map((item, originalIndex) => ({ ...item, originalIndex }))
                .filter(p => {
                    if (publicYearFilterMode === 'all') return true;
                    return Number(p.year) === currentAdmissionYear;
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
                        <td colspan="8" class="p-10 text-center text-text-muted">
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

                        return `
                            <tr class="border-b border-slate-700/40 hover:bg-slate-800/40 transition-colors text-center public-item-row" data-index="${p.originalIndex}">
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
                                    <td class="p-3 align-middle text-left pl-4 bg-slate-900/40 border-r border-slate-700/50" rowspan="${rowSpan}">
                                        <div class="flex items-center gap-2">
                                            <span class="text-lg">🏫</span>
                                            <span class="font-bold text-white text-sm">${group.school}</span>
                                            <input type="hidden" class="public-school" data-index="${p.originalIndex}" value="${group.school}" />
                                        </div>
                                    </td>
                                ` : ''}
                                <td class="p-2.5">
                                    <input type="text" class="input-field py-1.5 px-2 text-xs text-indigo-200 text-center w-24 public-dept" 
                                           value="${p.dept === '공통' ? '' : (p.dept || '')}" placeholder="학교 전체" data-index="${p.originalIndex}" />
                                </td>
                                <td class="p-2.5">
                                    <input type="text" class="input-field py-1.5 px-2 text-xs font-bold text-sky-200 text-center w-20 public-track" 
                                           value="${trackClean}" placeholder="일반/특별" data-index="${p.originalIndex}" />
                                </td>
                                <td class="p-2.5 text-center">
                                    <div class="flex items-center justify-center gap-1">
                                        <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-black text-emerald-400 w-24 public-min-score" 
                                               value="${p.min ?? ''}" placeholder="최저점" data-index="${p.originalIndex}" />
                                        <span class="text-xs text-slate-400 font-semibold">${p.unit || '점'}</span>
                                    </div>
                                </td>
                                <td class="p-2.5 text-center">
                                    <div class="flex items-center justify-center gap-1">
                                        <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-semibold text-sky-300 w-24 public-max-score" 
                                               value="${p.max ?? ''}" placeholder="선택" data-index="${p.originalIndex}" />
                                        <span class="text-xs text-slate-400 font-semibold">${p.unit || '점'}</span>
                                    </div>
                                </td>
                                <td class="p-2.5 text-center">
                                    <div class="flex items-center justify-center gap-1">
                                        <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-semibold text-amber-300 w-24 public-avg-score" 
                                               value="${p.avg ?? ''}" placeholder="선택" data-index="${p.originalIndex}" />
                                        <span class="text-xs text-slate-400 font-semibold">${p.unit || '점'}</span>
                                    </div>
                                </td>
                                <td class="p-2.5 text-center">
                                    <input type="text" class="input-field py-1.5 px-2.5 text-xs text-slate-300 w-32 public-note" 
                                           value="${p.note || ''}" placeholder="출처/비고" data-index="${p.originalIndex}" />
                                </td>
                                <td class="p-2.5 text-center">
                                    <div class="flex items-center justify-center gap-1.5">
                                        <button class="px-2.5 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-all flex items-center gap-1 btn-apply-public-item" 
                                                data-index="${p.originalIndex}" title="${group.year}학년도 커트라인으로 즉시 적용">
                                            <span>📥</span> 반영
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
                <div class="p-6 rounded-2xl bg-slate-800/70 border border-slate-700/60 space-y-4 shadow-lg">
                    <div class="flex items-center justify-between border-b border-slate-700/50 pb-3 flex-wrap gap-3">
                        <div>
                            <h3 class="font-bold text-white text-base flex items-center gap-2">
                                <span>📊</span> 울산광역시 고등학교 공식 공개 합격선 및 입결 데이터
                            </h3>
                            <p class="text-xs text-text-muted mt-1">고교에서 공식 발표한 입결 자료입니다. 같은 고교·연도별로 묶어 제공되며, [반영] 시 해당 연도 커트라인으로 바로 적용됩니다.</p>
                        </div>
                        <div class="flex items-center gap-2.5 flex-wrap">
                            <!-- 연도 필터 토글 -->
                            <div class="inline-flex rounded-xl bg-slate-900/80 p-1 border border-slate-700/60 shadow-inner text-xs">
                                <button id="btnFilterPublicCurrentYear" class="px-3 py-1.5 rounded-lg font-bold transition-all ${publicYearFilterMode === 'current' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                                    📅 ${currentAdmissionYear}학년도만 보기
                                </button>
                                <button id="btnFilterPublicAllYears" class="px-3 py-1.5 rounded-lg font-bold transition-all ${publicYearFilterMode === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}">
                                    전체 연도 모아보기
                                </button>
                            </div>
                            <button id="resetPublicDataBtn" class="btn-secondary text-xs px-3 py-1.5 font-bold flex items-center gap-1 text-slate-300" title="공식 데이터 기본값으로 새로고침">
                                <span>🔄</span> 기본값 복원
                            </button>
                            <button id="addPublicDataBtn" class="btn-primary text-xs px-3.5 py-1.5 font-bold flex items-center gap-1 shadow-sm" style="width: auto;">
                                <span>➕</span> 공개자료 추가
                            </button>
                        </div>
                    </div>

                    <div class="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-900/40">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead class="bg-slate-800/90 text-text-muted font-bold text-center border-b border-slate-700/60">
                                <tr>
                                    <th class="p-3 w-28 border-r border-slate-700/50">입학년도</th>
                                    <th class="p-3 text-left pl-4 w-44 border-r border-slate-700/50">고교명</th>
                                    <th class="p-3 w-28">학과</th>
                                    <th class="p-3 w-24">전형</th>
                                    <th class="p-3 w-32 text-emerald-300">최저점 (합격선)</th>
                                    <th class="p-3 w-32 text-sky-300">최고 불합격점</th>
                                    <th class="p-3 w-32 text-amber-300">평균점</th>
                                    <th class="p-3 w-36">출처 / 구분</th>
                                    <th class="p-3 w-28">관리</th>
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
                <!-- 1. 상단 타이틀 & 입학년도 & 주요 액션 바 -->
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
                        <!-- 입학년도(입시년도) 선택기: 선택 즉시 자동 전환 -->
                        <div class="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-indigo-500/40 shadow-inner">
                            <label class="text-xs font-bold text-indigo-300 whitespace-nowrap">📅 고교 입학년도:</label>
                            <select id="admissionYearSelect" class="bg-slate-800 text-white font-bold text-xs px-2.5 py-1 rounded-lg border border-slate-700 outline-none cursor-pointer">
                                ${admissionYears.map(year => `<option value="${year}" ${currentAdmissionYear === year ? 'selected' : ''}>${year}학년도 (${year - 1}학년도 중3${year - 1 === currentMiddleSchoolYear ? ' - 현재' : ''})</option>`).join('')}
                            </select>
                        </div>

                        <button id="saveAllCutoffsBtn" class="btn-primary text-xs px-3.5 py-2 font-bold flex items-center gap-1.5 shadow-sm" style="width: auto;">
                            <span>💾</span> 커트라인 저장
                        </button>
                        <button id="exportJointDataBtn" class="text-xs bg-indigo-600/30 border border-indigo-500/50 text-indigo-200 hover:bg-indigo-600/50 px-3 py-2 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer" style="width: auto;">
                            <span>📤</span> 자료 내보내기
                        </button>
                        <button id="importJointDataBtn" class="text-xs bg-emerald-600/30 border border-emerald-500/50 text-emerald-200 hover:bg-emerald-600/50 px-3 py-2 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer" style="width: auto;">
                            <span>📥</span> 타교자료 병합
                        </button>
                        <button id="backToAdminBtn" class="btn-secondary text-xs px-3.5 py-2 font-bold">
                            ← 대시보드
                        </button>
                    </div>
                </div>

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

                    ${currentTab !== 'public' ? `
                    <div class="relative w-64">
                        <input id="cutoffSchoolSearch" type="text" value="${searchKeyword}" placeholder="🔍 고교명·학과 검색..." class="input-field py-1.5 pl-3 pr-8 text-xs w-full bg-slate-900/80 border border-slate-700/60 rounded-xl" />
                        ${searchKeyword ? `<button id="clearCutoffSearch" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white">✕</button>` : ''}
                    </div>` : ''}
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

        // 4. 행 삭제 이벤트
        app.querySelectorAll('.btn-delete-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tr = e.target.closest('tr');
                if (tr) tr.remove();
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

        // 6. 학과·전형 추가 이벤트 (평균점 컬럼 없이 시원한 5열 구조)
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

        // 7. 공개 데이터 복사 적용 버튼
        app.querySelectorAll('.btn-apply-public-item').forEach(btn => {
            btn.addEventListener('click', async () => {
                const idx = Number(btn.dataset.index);
                const item = publicOfficialData[idx];
                if (!item || !item.school || !item.min || Number(item.min) <= 0) {
                    await showModalAlert({
                        title: '입력 확인',
                        message: '고교명과 최저 합격선(양수)을 먼저 입력해주세요.',
                        type: 'warning'
                    });
                    return;
                }
                const min = parseFloat(item.min);
                const max = parseFloat(item.max);
                const avg = parseFloat(item.avg);
                const targetYear = item.year || currentAdmissionYear;
                const scoreType = String(item.school).includes('일반계고') ? 'percentile' : 'total_score';

                const newCutoff = {
                    year: targetYear,
                    schoolName: item.school,
                    department: normalizeDept(item.dept),
                    track: normalizeTrack(item.track),
                    scoreType: scoreType,
                    minValue: min,
                    maxValue: Number.isFinite(max) && max > 0 ? max : min,
                    avgValue: Number.isFinite(avg) && avg > 0 ? avg : 0
                };

                try {
                    await window.go.main.App.SaveCutoffs([newCutoff]);
                    allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                    await showModalAlert({
                        title: '커트라인 반영 완료',
                        message: `<strong>[${item.school} - ${item.dept || '학교 전체'}(${item.track})]</strong><br>공식 입결 데이터(최저 ${min} / 최고 ${max || min} / 평균 ${avg || '-'})가 <strong>${targetYear}학년도 커트라인</strong>으로 성공적으로 반영되었습니다!`,
                        type: 'success'
                    });
                    currentTab = 'all';
                    renderMainScreen();
                } catch (err) {
                    await showModalAlert({ title: '반영 실패', message: String(err), type: 'error' });
                }
            });
        });

        document.getElementById('saveAllCutoffsBtn')?.addEventListener('click', () => saveAllCutoffs(false));

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

            // 공식 공개자료 기본값 복원 버튼
            document.getElementById('resetPublicDataBtn')?.addEventListener('click', async () => {
                const confirmed = await showModalConfirm({
                    title: '공식 공개자료 기본값 복원',
                    message: '울산마이스터고의 공식 공개자료(2024~2026학년도) 기본값으로 초기화하시겠습니까?<br><span class="text-xs text-slate-400">비공식 테스트 데이터나 임의 수정 내역이 정리됩니다.</span>'
                });
                if (confirmed) {
                    publicOfficialData = JSON.parse(JSON.stringify(publicOfficialDefaults));
                    localStorage.setItem('publicOfficialCutoffData', JSON.stringify(publicOfficialData));
                    renderMainScreen();
                }
            });

            // 인풋 실시간 동기화
            const updateField = (input, field, isNum = false) => {
                const idx = Number(input.dataset.index);
                if (publicOfficialData[idx]) {
                    const val = input.value.trim();
                    publicOfficialData[idx][field] = isNum ? (parseFloat(val) || '') : val;
                    localStorage.setItem('publicOfficialCutoffData', JSON.stringify(publicOfficialData));
                }
            };
            app.querySelectorAll('.public-dept').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'dept')));
            app.querySelectorAll('.public-track').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'track')));
            app.querySelectorAll('.public-min-score').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'min', true)));
            app.querySelectorAll('.public-max-score').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'max', true)));
            app.querySelectorAll('.public-avg-score').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'avg', true)));
            app.querySelectorAll('.public-note').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'note')));
            app.querySelectorAll('.public-school').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'school')));
            app.querySelectorAll('.public-year').forEach(inp => inp.addEventListener('change', () => updateField(inp, 'year', true)));

            // 행 추가 버튼
            document.getElementById('addPublicDataBtn')?.addEventListener('click', () => {
                publicOfficialData.unshift({
                    year: currentAdmissionYear,
                    school: '울산마이스터고',
                    dept: '',
                    track: '일반',
                    min: '',
                    max: '',
                    avg: '',
                    unit: '점',
                    note: '공식 공개자료'
                });
                localStorage.setItem('publicOfficialCutoffData', JSON.stringify(publicOfficialData));
                renderMainScreen();
            });

            // 행 삭제 버튼
            app.querySelectorAll('.btn-delete-public-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    const index = Number(btn.dataset.index);
                    if (index >= 0 && index < publicOfficialData.length) {
                        publicOfficialData.splice(index, 1);
                        localStorage.setItem('publicOfficialCutoffData', JSON.stringify(publicOfficialData));
                        renderMainScreen();
                    }
                });
            });
        }

        // 8. 전체 저장 함수 (공식 공개데이터도 함께 DB에 동기화 보관)
        const saveAllCutoffs = async (silent = false) => {
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
                }
            });

            // 고교 공식 공개자료(참고자료)도 함께 영구 저장하여 서버 전송에 포함
            publicOfficialData.forEach(p => {
                const minVal = parseFloat(p.min);
                if (p.school && !isNaN(minVal) && minVal > 0) {
                    const maxVal = parseFloat(p.max);
                    const avgVal = parseFloat(p.avg);
                    cutoffs.push({
                        year: p.year || currentAdmissionYear,
                        schoolName: p.school,
                        department: p.dept === '공통' ? '' : (p.dept || ''),
                        track: p.track || '공식 합격선',
                        scoreType: p.unit === '%' ? 'percentile' : 'total_score',
                        minValue: minVal,
                        maxValue: !isNaN(maxVal) && maxVal > 0 ? maxVal : minVal,
                        avgValue: !isNaN(avgVal) && avgVal > 0 ? avgVal : 0
                    });
                }
            });

            if (cutoffs.length === 0) {
                if (!silent) {
                    await showModalAlert({
                        title: '저장 대상 없음',
                        message: '저장할 유효한 커트라인 점수가 없습니다. 최저 합격선을 입력해주세요.',
                        type: 'warning'
                    });
                }
                return false;
            }

            try {
                await window.go.main.App.SaveCutoffs(cutoffs);
                allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                if (!silent) {
                    await showModalAlert({
                        title: '커트라인 저장 완료',
                        message: `<strong>${currentAdmissionYear}학년도</strong> 총 <strong>${cutoffs.length}건</strong>의 고교·학과별 커트라인 및 공식 공개 입결 자료가 안전하게 저장되었습니다!`,
                        type: 'success'
                    });
                }
                return true;
            } catch (err) {
                await showModalAlert({ title: '저장 실패', message: String(err), type: 'error' });
                return false;
            }
        };

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
                    await showModalAlert({
                        title: '타교자료 병합 완료',
                        message: `타 학교 진학자료가 성공적으로 병합되었습니다!<br><br>` +
                                 `• 커트라인 갱신: <strong>${res.cutoffs || 0}건</strong><br>` +
                                 `• 타교 지원현황 합격선 반영: <strong>${res.applications || 0}건</strong><br>` +
                                 `• 공식 공개자료 보완: <strong>${res.official || 0}건</strong>`,
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
