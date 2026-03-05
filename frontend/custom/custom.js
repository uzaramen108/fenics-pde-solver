document.getElementById('run-btn').addEventListener('click', async () => {
    const code = document.getElementById('python-code').value;
    const runBtn = document.getElementById('run-btn');
    const statusText = document.getElementById('status-text');
    const stdoutBox = document.getElementById('stdout-box');
    const stderrBox = document.getElementById('stderr-box');
    const downloadBtn = document.getElementById('download-btn');

    if (!code.trim()) {
        alert("코드를 입력해주세요.");
        return;
    }

    // UI 초기화
    runBtn.disabled = true;
    statusText.textContent = "⏳ 실행 중... (최대 3분 소요)";
    stdoutBox.textContent = "";
    stderrBox.textContent = "";
    downloadBtn.style.display = "none";

    try {
        // 백엔드 URL이 다를 경우 (예: http://localhost:7860/api/execute) 전체 URL 입력 필요
        const response = await fetch('/api/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ python_code: code })
        });

        const data = await response.json();

        // 상태 및 실행 시간 표시
        statusText.textContent = `상태: ${data.status.toUpperCase()} (소요 시간: ${data.execution_time})`;
        stdoutBox.textContent = data.stdout || "출력 없음";
        stderrBox.textContent = data.stderr || "에러/경고 없음";

        // 결과 파일이 존재하면 다운로드 버튼 활성화
        if (data.status === 'success' && data.result.generated_files && data.result.generated_files.length > 0) {
            downloadBtn.style.display = "block";
            downloadBtn.onclick = () => {
                // 다운로드 엔드포인트 호출
                window.location.href = `/api/download/${data.execution_id}`;
            };
        }
    } catch (error) {
        statusText.textContent = "❌ 서버 통신 오류";
        stderrBox.textContent = error.message;
    } finally {
        runBtn.disabled = false;
    }
});