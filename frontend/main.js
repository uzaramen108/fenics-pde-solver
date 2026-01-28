// main.js - 디버깅 코드 추가

function getApiBaseUrl() {
    const hostname = window.location.hostname;
    const port = window.location.port;
    
    // 로컬 개발 환경
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        if (port.startsWith('55')) {
            return 'http://localhost:8000';
        }
        return window.location.origin;
    }
    
    // GitHub Pages (프로덕션)
    return 'https://YOUR_USERNAME-fenics-backend.hf.space';  // Hugging Face URL
}

const API_BASE_URL = getApiBaseUrl();
console.log('🔧 [DEBUG] API Base URL:', API_BASE_URL);

// API 엔드포인트 설정
// const API_BASE_URL = window.location.origin; // 로컬 개발용

console.log('🔧 [DEBUG] API Base URL:', API_BASE_URL);

// 상태 관리
const state = {
    equation: '1 + x[0]**2 + 2*x[1]**2',
    source: '-6',
    meshSize: 8
};

// API 통신
async function solvePDE(equation, source, meshSize) {
    const requestData = {
        boundary_condition: equation,
        source_function: source,
        mesh_size: meshSize,
    };
    
    console.log('📤 [DEBUG] Sending request:', requestData);
    console.log('📤 [DEBUG] Request URL:', `${API_BASE_URL}/api/solve`);
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/solve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
        });

        console.log('📥 [DEBUG] Response status:', response.status);
        console.log('📥 [DEBUG] Response headers:', [...response.headers.entries()]);
        
        // 응답 텍스트를 먼저 확인
        const responseText = await response.text();
        console.log('📥 [DEBUG] Response text:', responseText);

        if (!response.ok) {
            console.error('❌ [DEBUG] Response not OK:', response.status, responseText);
            
            // JSON 파싱 시도
            try {
                const errorData = JSON.parse(responseText);
                throw new Error(errorData.detail || '계산 중 오류가 발생했습니다.');
            } catch (parseError) {
                console.error('❌ [DEBUG] JSON parse error:', parseError);
                throw new Error(`서버 오류 (${response.status}): ${responseText.substring(0, 100)}`);
            }
        }

        // 성공 응답 파싱
        try {
            const data = JSON.parse(responseText);
            console.log('✅ [DEBUG] Parsed response:', data);
            return data;
        } catch (parseError) {
            console.error('❌ [DEBUG] JSON parse error on success:', parseError);
            throw new Error('응답 데이터 파싱 실패: ' + responseText.substring(0, 100));
        }
        
    } catch (error) {
        console.error('❌ [DEBUG] Fetch error:', error);
        throw error;
    }
}

// 이벤트 핸들러
async function handleSolve() {
    const button = document.getElementById('solveBtn');
    
    console.log('🚀 [DEBUG] Starting PDE solve...');
    console.log('🚀 [DEBUG] Current state:', state);
    
    UI.hideError();
    UI.showLoading(button);

    try {
        const result = await solvePDE(state.equation, state.source, state.meshSize);
        console.log('✅ [DEBUG] Result received:', result);
        UI.showResults(result);
    } catch (error) {
        console.error('❌ [DEBUG] Error in handleSolve:', error);
        UI.showError(error.message);
    } finally {
        UI.hideLoading(button);
    }
}

// 파일 다운로드
async function handleDownload() {
    console.log('📥 [DEBUG] Starting download...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/download`);
        console.log('📥 [DEBUG] Download response status:', response.status);
        
        if (!response.ok) {
            throw new Error('파일 다운로드 실패');
        }
        
        const blob = await response.blob();
        console.log('📥 [DEBUG] Blob size:', blob.size);
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fundamentals.zip';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        console.log('✅ [DEBUG] Download complete');
    } catch (error) {
        console.error('❌ [DEBUG] Download error:', error);
        UI.showError('파일 다운로드 중 오류가 발생했습니다.');
    }
}

// 초기화
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎯 [DEBUG] DOM Content Loaded');
    console.log('🎯 [DEBUG] Current location:', window.location.href);
    
    // 입력 요소들
    const equationInput = document.getElementById('equation');
    const sourceInput = document.getElementById('source');
    const meshInput = document.getElementById('mesh');
    const solveBtn = document.getElementById('solveBtn');
    const downloadBtn = document.getElementById('downloadBtn');

    // 이벤트 리스너 등록
    equationInput.addEventListener('input', function(e) {
        state.equation = e.target.value;
        console.log('📝 [DEBUG] Equation updated:', state.equation);
        UI.updateBoundaryEquation(state.equation);
        UI.updatePythonCode(state.equation, state.source, state.meshSize);
    });

    sourceInput.addEventListener('input', function(e) {
        state.source = e.target.value;
        console.log('📝 [DEBUG] Source updated:', state.source);
        UI.updatePythonCode(state.equation, state.source, state.meshSize);
    });

    meshInput.addEventListener('input', function(e) {
        state.meshSize = parseInt(e.target.value);
        console.log('📝 [DEBUG] Mesh size updated:', state.meshSize);
        UI.updateMeshSize(state.meshSize);
        UI.updatePythonCode(state.equation, state.source, state.meshSize);
    });

    solveBtn.addEventListener('click', () => {
        console.log('🖱️ [DEBUG] Solve button clicked');
        handleSolve();
    });
    
    downloadBtn.addEventListener('click', () => {
        console.log('🖱️ [DEBUG] Download button clicked');
        handleDownload();
    });

    // 초기 코드 생성
    UI.updatePythonCode(state.equation, state.source, state.meshSize);
    
    console.log('✅ [DEBUG] Initialization complete');
});