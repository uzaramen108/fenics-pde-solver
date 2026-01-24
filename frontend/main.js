// main.js - 메인 애플리케이션 로직

// API 엔드포인트 설정
const API_BASE_URL = 'http://localhost:8000';

// 상태 관리
const state = {
    equation: '1 + x[0]**2 + 2*x[1]**2',
    source: '-6',
    meshSize: 8
};

// API 통신
async function solvePDE(equation, source, meshSize) {
    const response = await fetch(`${API_BASE_URL}/api/solve`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            boundary_condition: equation,
            source_function: source,
            mesh_size: meshSize,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '계산 중 오류가 발생했습니다.');
    }

    return await response.json();
}

// 이벤트 핸들러
async function handleSolve() {
    const button = document.getElementById('solveBtn');
    
    UI.hideError();
    UI.showLoading(button);

    try {
        const result = await solvePDE(state.equation, state.source, state.meshSize);
        UI.showResults(result);
    } catch (error) {
        UI.showError(error.message);
    } finally {
        UI.hideLoading(button);
    }
}

// 파일 다운로드
async function handleDownload() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/download`);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fundamentals.zip';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        UI.showError('파일 다운로드 중 오류가 발생했습니다.');
    }
}

// 초기화
document.addEventListener('DOMContentLoaded', function() {
    // 입력 요소들
    const equationInput = document.getElementById('equation');
    const sourceInput = document.getElementById('source');
    const meshInput = document.getElementById('mesh');
    const solveBtn = document.getElementById('solveBtn');
    const downloadBtn = document.getElementById('downloadBtn');

    // 이벤트 리스너 등록
    equationInput.addEventListener('input', function(e) {
        state.equation = e.target.value;
        UI.updateBoundaryEquation(state.equation);
        UI.updatePythonCode(state.equation, state.source, state.meshSize);
    });

    sourceInput.addEventListener('input', function(e) {
        state.source = e.target.value;
        UI.updatePythonCode(state.equation, state.source, state.meshSize);
    });

    meshInput.addEventListener('input', function(e) {
        state.meshSize = parseInt(e.target.value);
        UI.updateMeshSize(state.meshSize);
        UI.updatePythonCode(state.equation, state.source, state.meshSize);
    });

    solveBtn.addEventListener('click', handleSolve);
    downloadBtn.addEventListener('click', handleDownload);

    // 초기 코드 생성
    UI.updatePythonCode(state.equation, state.source, state.meshSize);
});