// 페이지 로드 시 config.js의 API URL을 가져와 입력창에 설정
document.addEventListener('DOMContentLoaded', () => {
    const apiUrlInput = document.getElementById('api-url');
    if (window.APP_CONFIG && window.APP_CONFIG.API_URL) {
        apiUrlInput.value = window.APP_CONFIG.API_URL;
    } else {
        apiUrlInput.value = "http://localhost:7860"; // fallback
        console.warn("config.js를 불러오지 못했습니다. 기본값을 사용합니다.");
    }
});

let currentExecutionId = null;

document.getElementById('run-btn').addEventListener('click', async () => {
    // 입력창의 주소를 최우선으로 사용 (끝의 슬래시 제거)
    const apiUrl = document.getElementById('api-url').value.replace(/\/$/, ''); 
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
        console.log(`요청 전송: ${apiUrl}/api/execute`);
        
        const response = await fetch(`${apiUrl}/api/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ python_code: code })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: 백엔드 서버(${apiUrl})와 통신할 수 없습니다.`);
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
    
    const apiUrl = document.getElementById('api-url').value.replace(/\/$/, '');
    const downloadUrl = `${apiUrl}/api/download/${currentExecutionId}`;
    
    window.location.href = downloadUrl;
});