// advanced.js - 고급 UI 로직

const generator = new FEniCSCodeGenerator();
let currentExecutionId = null;

// UI 요소
const $ = (id) => document.getElementById(id);

const ui = {
    dimension: $('dimension'),
    equationType: $('equationType'),
    meshNx: $('meshNx'),
    meshNy: $('meshNy'),
    meshNz: $('meshNz'),
    meshNyGroup: $('meshNyGroup'),
    meshNzGroup: $('meshNzGroup'),
    meshShape: $('meshShape'),
    meshShapeGroup: $('meshShapeGroup'),
    elementType: $('elementType'),
    degree: $('degree'),
    boundaryExpression: $('boundaryExpression'),
    // Poisson
    poissonParams: $('poissonParams'),
    poissonSource: $('poissonSource'),
    // Heat
    heatParams: $('heatParams'),
    heatDt: $('heatDt'),
    heatSource: $('heatSource'),
    heatInitial: $('heatInitial'),
    // Helmholtz
    helmholtzParams: $('helmholtzParams'),
    helmholtzK: $('helmholtzK'),
    helmholtzSource: $('helmholtzSource'),
    // Custom
    customParams: $('customParams'),
    customA: $('customA'),
    customL: $('customL'),
    // Exact solution
    hasExactSolution: $('hasExactSolution'),
    exactSolution: $('exactSolution'),
    exactSolutionGroup: $('exactSolutionGroup'),
    // Buttons
    generateBtn: $('generateBtn'),
    downloadBtn: $('downloadBtn'),
    // Display
    generatedCode: $('generatedCode'),
    resultsSection: $('resultsSection'),
    errorAlert: $('errorAlert'),
    errorMessage: $('errorMessage'),
    successResults: $('successResults')
};

// 차원 변경 시
ui.dimension.addEventListener('change', function() {
    const dim = this.value;
    
    ui.meshNyGroup.style.display = dim === '1d' ? 'none' : 'block';
    ui.meshNzGroup.style.display = dim === '3d' ? 'block' : 'none';
    
    // 메시 형태 옵션 변경
    if (dim === '1d') {
        ui.meshShapeGroup.style.display = 'none';
    } else if (dim === '2d') {
        ui.meshShapeGroup.style.display = 'block';
        ui.meshShape.innerHTML = `
            <option value="rectangle">Rectangle (Quad)</option>
            <option value="triangle">Triangle</option>
        `;
    } else if (dim === '3d') {
        ui.meshShapeGroup.style.display = 'block';
        ui.meshShape.innerHTML = `
            <option value="box">Box (Hex)</option>
            <option value="tetrahedron">Tetrahedron</option>
        `;
    }
    
    // 경계 조건 예제 업데이트
    updateBoundaryExample(dim);
});

// 방정식 유형 변경 시
ui.equationType.addEventListener('change', function() {
    const type = this.value;
    
    ui.poissonParams.style.display = type === 'poisson' ? 'block' : 'none';
    ui.heatParams.style.display = type === 'heat' ? 'block' : 'none';
    ui.helmholtzParams.style.display = type === 'helmholtz' ? 'block' : 'none';
    ui.customParams.style.display = type === 'custom' ? 'block' : 'none';
});

// 정확해 체크박스
ui.hasExactSolution.addEventListener('change', function() {
    ui.exactSolutionGroup.style.display = this.checked ? 'block' : 'none';
});

// 경계 조건 예제 업데이트
function updateBoundaryExample(dim) {
    const examples = {
        '1d': 'x[0]**2',
        '2d': '1 + x[0]**2 + 2*x[1]**2',
        '3d': 'x[0]**2 + x[1]**2 + x[2]**2'
    };
    ui.boundaryExpression.placeholder = examples[dim];
    if (!ui.boundaryExpression.value) {
        ui.boundaryExpression.value = examples[dim];
    }
}

// 설정 수집
function collectConfig() {
    const dim = ui.dimension.value;
    const eqType = ui.equationType.value;
    
    const config = {
        dimension: dim,
        mesh: {
            nx: parseInt(ui.meshNx.value),
            ny: parseInt(ui.meshNy.value),
            nz: parseInt(ui.meshNz.value),
            shape: ui.meshShape.value
        },
        functionSpace: {
            type: ui.elementType.value,
            degree: parseInt(ui.degree.value)
        },
        boundaryCondition: {
            expression: ui.boundaryExpression.value
        },
        equation: {
            type: eqType,
            params: {}
        },
        exactSolution: ui.hasExactSolution.checked ? ui.exactSolution.value : null
    };
    
    // 방정식별 파라미터
    if (eqType === 'poisson') {
        config.equation.params.source = ui.poissonSource.value;
    } else if (eqType === 'heat') {
        config.equation.params = {
            source: ui.heatSource.value,
            dt: ui.heatDt.value,
            initial: ui.heatInitial.value
        };
    } else if (eqType === 'helmholtz') {
        config.equation.params = {
            source: ui.helmholtzSource.value,
            k: ui.helmholtzK.value
        };
    } else if (eqType === 'custom') {
        config.equation.params = {
            custom_a: ui.customA.value,
            custom_L: ui.customL.value
        };
    }
    
    return config;
}

// 코드 생성 및 실행
async function generateAndExecute() {
    console.log('🚀 Generating and executing code...');
    
    try {
        // 버튼 비활성화
        ui.generateBtn.disabled = true;
        ui.generateBtn.innerHTML = `
            <div class="spinner"></div>
            실행 중...
        `;
        
        // 설정 수집
        const config = collectConfig();
        console.log('📋 Config:', config);
        
        // 코드 생성
        const pythonCode = generator.generate(config);
        console.log('🐍 Generated code length:', pythonCode.length);
        
        // 코드 표시
        ui.generatedCode.innerHTML = `<code style="color: #86efac;">${escapeHtml(pythonCode)}</code>`;
        
        // 백엔드로 전송
        const response = await fetch(`${window.APP_CONFIG.API_URL}/api/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                python_code: pythonCode
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('✅ Execution result:', result);
        
        // 결과 표시
        displayResults(result);
        
    } catch (error) {
        console.error('❌ Error:', error);
        showError(error.message);
    } finally {
        // 버튼 활성화
        ui.generateBtn.disabled = false;
        ui.generateBtn.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>
            </svg>
            코드 생성 및 실행
        `;
    }
}

// 결과 표시
function displayResults(result) {
    ui.resultsSection.style.display = 'block';
    
    if (result.status === 'success') {
        ui.errorAlert.style.display = 'none';
        ui.successResults.style.display = 'block';
        
        currentExecutionId = result.execution_id;
        
        // 기본 정보
        $('executionId').textContent = result.execution_id;
        $('status').textContent = '✅ ' + result.status;
        $('status').style.color = '#10b981';
        $('execTime').textContent = result.execution_time;
        
        // DOFs
        if (result.result.dofs) {
            $('dofs').textContent = result.result.dofs.toLocaleString();
        }
        
        // 오차 정보 (있는 경우)
        if (result.result.error_L2) {
            $('errorMetrics').style.display = 'block';
            $('errorL2').textContent = result.result.error_L2;
            $('errorMax').textContent = result.result.error_max;
        } else {
            $('errorMetrics').style.display = 'none';
        }
        
        // 생성된 파일
        const filesDiv = $('generatedFiles');
        if (result.result.generated_files && result.result.generated_files.length > 0) {
            filesDiv.innerHTML = result.result.generated_files
                .map(f => `<div class="file-item">📄 ${f}</div>`)
                .join('');
            ui.downloadBtn.style.display = 'block';
        } else {
            filesDiv.innerHTML = '<div style="color: #fbbf24;">파일이 생성되지 않았습니다.</div>';
            ui.downloadBtn.style.display = 'none';
        }
        
    } else {
        ui.successResults.style.display = 'none';
        showError(`실행 실패: ${result.stderr || result.stdout || '알 수 없는 오류'}`);
    }
}

// 오류 표시
function showError(message) {
    ui.resultsSection.style.display = 'block';
    ui.errorAlert.style.display = 'flex';
    ui.errorMessage.textContent = message;
    ui.successResults.style.display = 'none';
}

// 파일 다운로드
async function downloadResults() {
    if (!currentExecutionId) {
        alert('다운로드할 결과가 없습니다.');
        return;
    }
    
    try {
        const url = `${window.APP_CONFIG.API_URL}/api/download/${currentExecutionId}`;
        window.open(url, '_blank');
    } catch (error) {
        console.error('❌ Download error:', error);
        alert('다운로드 중 오류가 발생했습니다.');
    }
}

// HTML 이스케이프
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 이벤트 리스너
ui.generateBtn.addEventListener('click', generateAndExecute);
ui.downloadBtn.addEventListener('click', downloadResults);

console.log('✅ Advanced UI initialized');
console.log('🔧 API URL:', window.APP_CONFIG.API_URL);