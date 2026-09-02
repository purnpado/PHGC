// ==========================================
// 글로벌 피드백 모달 로직
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const feedbackModal = document.createElement('div');
    feedbackModal.id = 'feedbackModal';
    feedbackModal.className = 'hidden fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4';
    feedbackModal.innerHTML = `
        <div class="glass-card max-w-2xl w-full flex flex-col fade-in">
            <div class="p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/30 rounded-t-2xl">
                <h2 class="text-xl font-bold text-white flex items-center gap-2">
                    <span>💬</span> 피드백 및 문의하기
                </h2>
                <button id="closeFeedbackBtn" class="text-text-muted hover:text-white transition-colors bg-transparent border-none text-xl">&times;</button>
            </div>
            <div class="p-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
                
                <div class="flex gap-2 mb-6 border-b border-slate-700/50 pb-2">
                    <button id="tabWrite" class="font-bold text-primary border-b-2 border-primary pb-2 px-2 transition-colors">문의 작성</button>
                    <button id="tabList" class="font-bold text-text-muted hover:text-white pb-2 px-2 transition-colors">내 문의 내역</button>
                </div>

                <div id="feedbackWriteView">
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm text-text-muted mb-1">답변 받을 이메일 (선택)</label>
                            <input type="email" id="fbEmail" class="input-field" placeholder="example@email.com">
                        </div>
                        <div>
                            <label class="block text-sm text-text-muted mb-1">제목</label>
                            <input type="text" id="fbTitle" class="input-field" placeholder="개선 사항 또는 버그 제보" required>
                        </div>
                        <div>
                            <label class="block text-sm text-text-muted mb-1">내용</label>
                            <textarea id="fbContent" class="input-field min-h-[150px] resize-none" placeholder="자세한 내용을 적어주세요..." required></textarea>
                        </div>
                        <button id="submitFeedbackBtn" class="btn-primary w-full mt-4">제출하기</button>
                    </div>
                </div>

                <div id="feedbackListView" class="hidden space-y-4">
                    <div id="fbListContent" class="text-center text-text-muted py-8"><span class="spinner"></span> 목록을 불러오는 중...</div>
                </div>

            </div>
        </div>
    `;
    document.body.appendChild(feedbackModal);

    const btn = document.getElementById('globalFeedbackBtn');
    if (btn) {
        btn.addEventListener('click', () => {
            feedbackModal.classList.remove('hidden');
            document.getElementById('tabWrite').click();
        });
    }

    document.getElementById('closeFeedbackBtn').addEventListener('click', () => {
        feedbackModal.classList.add('hidden');
    });

    document.getElementById('tabWrite').addEventListener('click', (e) => {
        e.target.classList.add('text-primary', 'border-b-2', 'border-primary');
        e.target.classList.remove('text-text-muted');
        document.getElementById('tabList').classList.remove('text-primary', 'border-b-2', 'border-primary');
        document.getElementById('tabList').classList.add('text-text-muted');
        document.getElementById('feedbackWriteView').classList.remove('hidden');
        document.getElementById('feedbackListView').classList.add('hidden');
    });

    document.getElementById('tabList').addEventListener('click', async (e) => {
        e.target.classList.add('text-primary', 'border-b-2', 'border-primary');
        e.target.classList.remove('text-text-muted');
        document.getElementById('tabWrite').classList.remove('text-primary', 'border-b-2', 'border-primary');
        document.getElementById('tabWrite').classList.add('text-text-muted');
        document.getElementById('feedbackWriteView').classList.add('hidden');
        document.getElementById('feedbackListView').classList.remove('hidden');
        
        const listContent = document.getElementById('fbListContent');
        listContent.innerHTML = '<div class="text-center py-8"><span class="spinner"></span> 목록을 불러오는 중...</div>';
        
        try {
            const issues = await window.go.main.App.GetLocalFeedbacks();
            if (!issues || issues.length === 0) {
                listContent.innerHTML = '<div class="text-center text-text-muted py-8">작성한 문의 내역이 없습니다.</div>';
                return;
            }
            
            let html = '';
            for (const issue of issues) {
                let statusBadge = issue.status === 'open' ? '<span class="text-xs bg-warning/20 text-warning px-2 py-1 rounded">답변 대기</span>' : '<span class="text-xs bg-success/20 text-success px-2 py-1 rounded">답변 완료</span>';
                html += `
                    <div class="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 cursor-pointer hover:bg-slate-700/50 transition-colors" onclick="loadIssueDetails(${issue.issue_id})">
                        <div class="flex justify-between items-center mb-2">
                            <h4 class="font-bold text-white text-sm">${issue.title}</h4>
                            ${statusBadge}
                        </div>
                        <div class="text-xs text-text-muted">${new Date(issue.created_at).toLocaleString()}</div>
                    </div>
                `;
            }
            listContent.innerHTML = html;
        } catch(err) {
            listContent.innerHTML = `<div class="text-danger text-center text-sm">${err}</div>`;
        }
    });

    document.getElementById('submitFeedbackBtn').addEventListener('click', async () => {
        const title = document.getElementById('fbTitle').value.trim();
        const content = document.getElementById('fbContent').value.trim();
        const email = document.getElementById('fbEmail').value.trim();
        
        if (!title || !content) {
            return alert('제목과 내용을 입력해주세요.');
        }

        const btn = document.getElementById('submitFeedbackBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> 전송 중...';

        try {
            await window.go.main.App.SubmitFeedback(title, content, email);
            alert('피드백이 성공적으로 등록되었습니다.');
            document.getElementById('fbTitle').value = '';
            document.getElementById('fbContent').value = '';
            document.getElementById('tabList').click();
        } catch(err) {
            alert('등록 실패: ' + err);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '제출하기';
        }
    });
});

window.loadIssueDetails = async (issueID) => {
    const listContent = document.getElementById('fbListContent');
    const originalHTML = listContent.innerHTML;
    listContent.innerHTML = '<div class="text-center py-8"><span class="spinner"></span> 상세 내용을 불러오는 중...</div>';
    
    try {
        const details = await window.go.main.App.GetFeedbackDetails(issueID);
        let commentsHtml = '';
        if (details.comments && details.comments.length > 0) {
            details.comments.forEach(c => {
                commentsHtml += `
                    <div class="mt-4 p-3 bg-primary/10 border border-primary/30 rounded-lg">
                        <div class="font-bold text-xs text-primary mb-1">관리자 답변 (${new Date(c.created_at).toLocaleString()})</div>
                        <div class="text-sm text-white whitespace-pre-wrap">${c.body}</div>
                    </div>
                `;
            });
        } else {
            commentsHtml = '<div class="mt-4 text-xs text-text-muted text-center">아직 답변이 등록되지 않았습니다.</div>';
        }

        listContent.innerHTML = `
            <div class="mb-4">
                <button class="text-xs text-text-muted hover:text-white" onclick="document.getElementById('tabList').click()">← 목록으로 돌아가기</button>
            </div>
            <div class="bg-slate-800/80 p-4 rounded-xl border border-slate-700/50">
                <h3 class="font-bold text-white mb-2">상태: ${details.state === 'open' ? '열림' : '닫힘'}</h3>
                ${commentsHtml}
            </div>
        `;
    } catch(err) {
        alert('상세 내용 불러오기 실패: ' + err);
        listContent.innerHTML = originalHTML;
    }
};
