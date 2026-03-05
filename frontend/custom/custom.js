document.addEventListener('DOMContentLoaded', () => {
    // config.js가 로드되어 있다면 API URL 기본값 덮어쓰기
    if (window.APP_CONFIG && window.APP_CONFIG.API_URL) {
        document.getElementById('api-url').value = window.APP_CONFIG.API_URL;
    }
});

let currentExecutionId = null;

document.getElementById('run-btn').addEventListener('click', async () => {
    const apiUrl = document.getElementById('api-url').value.replace(/\/$/, ''); // 끝에 슬래시 제거
    const code = document.getElementById('python-editor').value;
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
        const response = await fetch(`${apiUrl}/api/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ python_code: code })
        });

        // 405 에러 등 HTTP 에러 처리
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: 백엔드 서버를 찾을 수 없거나 통신이 거부되었습니다. (API 주소를 확인하세요)`);
        }

        const data = await response.json();

        // 결과 출력
        statusText.textContent = `상태: ${data.status.toUpperCase()} | 소요 시간: ${data.execution_time}`;
        stdoutBox.textContent = data.stdout || "출력 내용이 없습니다.";
        stderrBox.textContent = data.stderr || "에러/경고가 없습니다.";

        // 파일이 생성되었다면 다운로드 버튼 활성화
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
    
    const apiUrl = document.getElementById('api-url').value.replace(/\/$/, '');
    const downloadUrl = `${apiUrl}/api/download/${currentExecutionId}`;
    
    // 브라우저를 통해 직접 다운로드 트리거
    window.location.href = downloadUrl;
});