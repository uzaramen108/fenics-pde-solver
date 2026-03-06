const idInput = document.getElementById('exec-id-input');
const statusBadge = document.getElementById('status-badge');
const runBtn = document.getElementById('run-btn');
const stopBtn = document.getElementById('stop-btn');
const saveBtn = document.getElementById('save-btn');
const stdoutBox = document.getElementById('stdout-box');
const stderrBox = document.getElementById('stderr-box');

let currentExecId = null;
let pollInterval = null;

// UI 상태 업데이트 함수
function updateUI(status) {
    statusBadge.textContent = status.toUpperCase();
    statusBadge.className = 'badge';

    if (status === 'anonymous') {
        statusBadge.classList.add('bg-gray');
        runBtn.disabled = false; stopBtn.disabled = true; saveBtn.disabled = true;
    } else if (status === 'ready') {
        statusBadge.classList.add('bg-blue');
        runBtn.disabled = false; stopBtn.disabled = true; saveBtn.disabled = true;
    } else if (status === 'working') {
        statusBadge.classList.add('bg-yellow');
        runBtn.disabled = true; stopBtn.disabled = false; saveBtn.disabled = true;
    } else if (status === 'done') {
        statusBadge.classList.add('bg-green');
        runBtn.disabled = false; stopBtn.disabled = true; saveBtn.disabled = false;
    } else if (status === 'stopped' || status === 'error') {
        statusBadge.classList.add('bg-gray');
        runBtn.disabled = false; stopBtn.disabled = true; saveBtn.disabled = false; // 에러여도 남은 로그 저장을 위해 활성화
    }
}

// 초기 상태 세팅
updateUI('anonymous');
idInput.addEventListener('input', () => {
    if(!idInput.value.trim() && !currentExecId) updateUI('anonymous');
});

// 백엔드에 상태 물어보기 (Polling)
async function fetchStatus(execId) {
    try {
        const response = await fetch(`${API_URL}/api/status/${execId}`);
        if (!response.ok) {
            let errorMsg = "ID를 찾을 수 없습니다.";
            try { const errData = await response.json(); errorMsg = errData.detail || errorMsg; } catch(e) {}
            throw new Error(errorMsg);
        }
        
        const data = await response.json();
        stdoutBox.textContent = data.stdout || "출력 로그 대기 중...";
        stderrBox.textContent = data.stderr || "";
        
        updateUI(data.status);

        if (data.status === 'done' || data.status === 'error' || data.status === 'stopped') {
            clearInterval(pollInterval);
        }
    } catch (error) {
        clearInterval(pollInterval);
        stdoutBox.textContent = error.message;
        updateUI('ready');
    }
}

// 1. 조회 버튼 (Load ID)
document.getElementById('load-id-btn').addEventListener('click', () => {
    const execId = idInput.value.trim();
    if (!execId) return alert("ID를 입력해주세요.");
    
    currentExecId = execId;
    updateUI('ready'); // 일단 Ready
    if(pollInterval) clearInterval(pollInterval);
    
    fetchStatus(execId);
    // 아직 진행 중일 수 있으니 3초마다 조회 시작
    pollInterval = setInterval(() => fetchStatus(execId), 3000);
});

// 2. 실행 버튼 (Run)
runBtn.addEventListener('click', async () => {
    const code = document.getElementById('python-editor').value;
    const cliArgs = document.getElementById('cli-args').value;

    if (!code.trim()) return alert("코드를 입력해주세요.");

    updateUI('working');
    stdoutBox.textContent = "요청을 서버로 전송했습니다...";
    stderrBox.textContent = "";

    try {
        const response = await fetch(`${API_URL}/api/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ python_code: code, cli_args: cliArgs })
        });
        
        if (!response.ok) {
            let errorMsg = `서버 응답 오류 (상태 코드: ${response.status})`;
            try { const errData = await response.json(); errorMsg = errData.detail || errorMsg; } catch(e) {}
            throw new Error(errorMsg);
        }
        
        const data = await response.json();
        currentExecId = data.execution_id;
        idInput.value = currentExecId; 
        
        if(pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(() => fetchStatus(currentExecId), 3000);

    } catch (error) {
        stderrBox.textContent = "실행 요청 실패: " + error.message;
        updateUI('ready');
    }
});

// 3. 실행 중지 버튼 (Stop)
stopBtn.addEventListener('click', async () => {
    if (!currentExecId) return;
    
    try {
        await fetch(`${API_URL}/api/stop/${currentExecId}`, { method: 'POST' });
        // 즉각 상태 업데이트를 위해 한번 호출
        fetchStatus(currentExecId);
    } catch (error) {
        alert("중지 요청 실패: " + error.message);
    }
});

// 4. 결과 저장 버튼 (Save & Delete)
saveBtn.addEventListener('click', () => {
    if (!currentExecId) return;
    window.location.href = `${API_URL}/api/download/${currentExecId}`;
    
    // 다운로드(동시에 삭제) 후 상태 초기화
    setTimeout(() => {
        currentExecId = null;
        idInput.value = '';
        updateUI('anonymous');
        stdoutBox.textContent = "결과가 저장되고 서버에서 파일이 삭제되었습니다.";
    }, 2000);
});