// 고정된 백엔드 API 주소
const API_URL = 'https://uzaramen108-fenics-backend.hf.space';
let currentExecutionId = null;

document.getElementById('run-btn').addEventListener('click', async () => {
    // ⚠️ 주의: HTML의 textarea id가 'python-code'인지 꼭 확인하세요!
    const code = document.getElementById('python-code').value; 
    const runBtn = document.getElementById('run-btn');
    const statusText = document.getElementById('status-text');
    const stdoutBox = document.getElementById('stdout-box');
    const stderrBox = document.getElementById('stderr-box');
    const downloadBtn = document.getElementById('download-btn');

    if (!code.trim()) {
        alert("실행할 코드를 입력해주세요.");
        return;
    }

    // UI 초기화
    runBtn.disabled = true;
    runBtn.textContent = "⏳ 실행 중...";
    statusText.textContent = "(최대 3분 소요될 수 있습니다)";
    stdoutBox.textContent = "";
    stderrBox.textContent = "";
    downloadBtn.style.display = "none";
    currentExecutionId = null;

    try {
        console.log(`요청 전송: ${API_URL}/api/execute`);
        
        const response = await fetch(`${API_URL}/api/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ python_code: code })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: 백엔드 서버(${API_URL})와 통신할 수 없습니다.`);
        }

        const data = await response.json();

        // 결과 출력
        statusText.textContent = `상태: ${data.status.toUpperCase()} | 소요 시간: ${data.execution_time}`;
        stdoutBox.textContent = data.stdout || "출력 내용이 없습니다.";
        stderrBox.textContent = data.stderr || "에러/경고가 없습니다.";

        // 파일 생성 시 다운로드 버튼 활성화
        if (data.status === 'success' && data.result && data.result.generated_files && data.result.generated_files.length > 0) {
            currentExecutionId = data.execution_id;
            downloadBtn.style.display = "inline-block";
        }

    } catch (error) {
        statusText.textContent = "❌ 통신 오류 발생";
        stderrBox.textContent = error.message;
        console.error(error);
    } finally {
        runBtn.disabled = false;
        runBtn.textContent = "▶️ 계산 실행";
    }
});

document.getElementById('download-btn').addEventListener('click', () => {
    if (!currentExecutionId) return;
    
    const downloadUrl = `${API_URL}/api/download/${currentExecutionId}`;
    window.location.href = downloadUrl;
});