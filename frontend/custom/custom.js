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
        
        // 1. 상태 코드가 503이거나 통신 에러면 기상 중으로 간주
        if (response.status === 503) throw new Error("WAKING_UP");
        
        // 2. 일단 텍스트로 응답을 받음
        const text = await response.text();
        let data;
        try {
            // 3. JSON 변환 시도
            data = JSON.parse(text);
        } catch (e) {
            // JSON이 아니라면(Hugging Face HTML 안내 페이지 등) 기상 중으로 간주
            throw new Error("WAKING_UP");
        }

        if (!response.ok) throw new Error(data.detail || "ID를 찾을 수 없습니다.");
        
        stdoutBox.textContent = data.stdout || "출력 로그 대기 중...";
        stderrBox.textContent = data.stderr || "";
        
        updateUI(data.status);

        if (data.status === 'done' || data.status === 'error' || data.status === 'stopped') {
            clearInterval(pollInterval);
        }
    } catch (error) {
        clearInterval(pollInterval);
        if (error.message === "WAKING_UP" || error.message.includes("Failed to fetch")) {
            stdoutBox.textContent = "💤 서버(Hugging Face)가 깨어나거나 빌드 중입니다.\n약 2~3분 뒤에 다시 조회 버튼을 눌러주세요.";
        } else {
            stdoutBox.textContent = error.message;
        }
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
    stdoutBox.textContent = "요청을 서버로 전송했습니다... (서버 상태 확인 중)";
    stderrBox.textContent = "";

    try {
        const response = await fetch(`${API_URL}/api/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ python_code: code, cli_args: cliArgs })
        });
        
        if (response.status === 503) throw new Error("WAKING_UP");
        
        // 일단 텍스트로 응답을 받음
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            // HTML 등 엉뚱한 텍스트가 오면 허깅페이스 로딩 중으로 판단
            throw new Error("WAKING_UP");
        }
        
        if (!response.ok) throw new Error(data.detail || `서버 응답 오류 (상태 코드: ${response.status})`);
        
        currentExecId = data.execution_id;
        idInput.value = currentExecId; 
        
        if(pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(() => fetchStatus(currentExecId), 3000);

    } catch (error) {
        if (error.message === "WAKING_UP" || error.message.includes("Failed to fetch")) {
            stderrBox.textContent = "💤 서버(Hugging Face)가 깨어나거나 빌드 중입니다.\n페이지를 나가지 마시고 약 2~3분 뒤에 다시 [▶️ 계산 실행]을 눌러주세요.";
        } else {
            stderrBox.textContent = "실행 요청 실패: " + error.message;
        }
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