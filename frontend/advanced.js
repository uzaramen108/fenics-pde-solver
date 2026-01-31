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
    meshLc: $('meshLc'),
    elementType: $('elementType'),
    degree: $('degree'),
    boundaryExpression: $('boundaryExpression'),
    // Poisson
    poissonParams: $('poissonParams'),
    poissonSource: $('poissonSource'),
    // Heat
    heatParams: $('heatParams'),
    heatDt: $('heatDt'),
    heatT: $('heatT'),
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
    customTimeDep: $('customTimeDep'),
    customTimeGroup: $('customTimeGroup'),
    customT: $('customT'),
    customDt: $('customDt'),
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
    const dim = ui.dimension.value;
    
    // 메시 형태 옵션 변경
    if (dim === '1d') {
        ui.meshShapeGroup.style.display = 'none';
        // 1D로 가면 편집 버튼 숨김
        document.getElementById('polygonConfigBtn').style.display = 'none'; 
    } else if (dim === '2d') {
        ui.meshShapeGroup.style.display = 'block';
        ui.meshShape.innerHTML = `
            <option value="rectangle">Rectangle</option>
            <option value="circle">Circle</option>
            <option value="lshape">L-Shape</option>
            <option value="triangle">Triangle</option>
            <option value="polygon">Custom Polygon (2D)</option> `;
    } else if (dim === '3d') {
        ui.meshShapeGroup.style.display = 'block';
        ui.meshShape.innerHTML = `
            <option value="box">Box</option>
            <option value="sphere">Sphere</option>
        `;
        document.getElementById('polygonConfigBtn').style.display = 'none';
    }
    
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

ui.customTimeDep.addEventListener('change', function() {
    ui.customTimeGroup.style.display = this.checked ? 'block' : 'none';
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
    
    // 1. 메시 설정을 먼저 변수로 분리합니다.
    let meshConfig = {
        shape: ui.meshShape.value,
        lc: parseFloat(ui.meshLc.value || 0.1)
    };

    // 2. 만약 'polygon' 모드라면, 전역 변수 polygonPoints에서 좌표를 가져와 추가합니다.
    if (meshConfig.shape === 'polygon' && typeof polygonPoints !== 'undefined') {
        // {x:0, y:0} 형태를 파이썬이 좋아하는 [0, 0] 배열 형태로 변환
        meshConfig.points = polygonPoints.map(pt => [pt.x, pt.y]);
    }

    // 3. 완성된 meshConfig를 config 객체에 넣습니다.
    const config = {
        dimension: dim,
        mesh: meshConfig, // ✅ 수정됨: 위에서 만든 변수 사용
        functionSpace: {
            type: ui.elementType.value,
            degree: parseInt(ui.degree.value)
        },
        boundaryCondition: {
            expression: ui.boundaryExpression.value,
            type: 'dirichlet_all'
        },
        equation: {
            type: eqType,
            params: {}
        },
        exactSolution: ui.hasExactSolution.checked ? ui.exactSolution.value : null
    };
    
    // 방정식별 파라미터 처리 (기존 코드 유지)
    if (eqType === 'poisson') {
        config.equation.params.source = ui.poissonSource.value;
    } else if (eqType === 'heat') {
        config.equation.params = {
            source: ui.heatSource.value,
            T: ui.heatT.value,
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
            custom_L: ui.customL.value,
            time_dependent: ui.customTimeDep.checked,
            T: parseFloat(ui.customT.value),
            dt: parseFloat(ui.customDt.value)
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

// ==========================================
// 다각형(Polygon) 설정 로직
// ==========================================

// 상태 관리
let polygonPoints = [
    { x: 0.0, y: 0.0 },
    { x: 1.0, y: 0.0 },
    { x: 0.5, y: 1.0 }
]; // 초기값 (삼각형)
let polygonChart = null;

const meshShapeSelect = document.getElementById('meshShape');
const polygonConfigBtn = document.getElementById('polygonConfigBtn');
const polygonModal = document.getElementById('polygonModal');

// 1. 메시 형태 변경 시 버튼 표시 제어
meshShapeSelect.addEventListener('change', (e) => {
    const isPolygon = e.target.value === 'polygon';
    polygonConfigBtn.style.display = isPolygon ? 'block' : 'none';
    
    // 차원 선택 체크 (Polygon은 2D에서만)
    const dimension = document.getElementById('dimension').value;
    if (isPolygon && dimension !== '2d') {
        alert("Custom Polygon은 현재 2D에서만 지원됩니다.");
        document.getElementById('dimension').value = '2d';
    }
});

// 2. 모달 열기/닫기
polygonConfigBtn.addEventListener('click', () => {
    openPolygonModal();
});

document.querySelectorAll('.close-modal, #cancelPolygonBtn').forEach(btn => {
    btn.addEventListener('click', () => {
        polygonModal.style.display = 'none';
    });
});

// 적용 버튼 클릭
document.getElementById('applyPolygonBtn').addEventListener('click', () => {
    if (polygonPoints.length < 3) {
        alert("최소 3개의 점이 필요합니다.");
        return;
    }
    polygonModal.style.display = 'none';
    // 여기에 실제 config 객체에 저장하는 로직이 들어감 (나중에 generate 호출 시 사용)
    console.log("Polygon saved:", polygonPoints);
});

// 3. 모달 초기화 및 차트 생성
function openPolygonModal() {
    polygonModal.style.display = 'flex';
    renderCoordinateList();
    initOrUpdateChart();
}

// 4. 좌표 리스트 렌더링
function renderCoordinateList() {
    const list = document.getElementById('coordinateList');
    list.innerHTML = '';

    polygonPoints.forEach((pt, index) => {
        const row = document.createElement('div');
        row.className = 'coord-row';
        row.innerHTML = `
            <input type="number" step="0.1" value="${pt.x}" onchange="updatePoint(${index}, 'x', this.value)">
            <input type="number" step="0.1" value="${pt.y}" onchange="updatePoint(${index}, 'y', this.value)">
            <button class="remove-pt" onclick="removePoint(${index})">×</button>
        `;
        list.appendChild(row);
    });
}

// 5. 포인트 추가/삭제/수정
document.getElementById('addPointBtn').addEventListener('click', () => {
    // 마지막 점과 같은 위치 혹은 약간 이동해서 추가
    const last = polygonPoints[polygonPoints.length - 1] || { x: 0, y: 0 };
    polygonPoints.push({ x: last.x + 0.2, y: last.y + 0.2 });
    renderCoordinateList();
    initOrUpdateChart();
});

window.removePoint = function(index) {
    if (polygonPoints.length <= 3) {
        alert("최소 3개의 점은 유지해야 합니다.");
        return;
    }
    polygonPoints.splice(index, 1);
    renderCoordinateList();
    initOrUpdateChart();
};

window.updatePoint = function(index, axis, value) {
    polygonPoints[index][axis] = parseFloat(value);
    initOrUpdateChart();
};

// 6. Chart.js 시각화
function initOrUpdateChart() {
    const ctx = document.getElementById('polygonCanvas').getContext('2d');
    
    // 차트용 데이터: 마지막 점을 첫 점과 연결하여 닫힌 도형으로 표시
    const chartData = [...polygonPoints];
    if (chartData.length > 0) {
        chartData.push(chartData[0]); // 루프 닫기
    }

    if (polygonChart) {
        polygonChart.data.datasets[0].data = chartData;
        polygonChart.update();
    } else {
        polygonChart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Domain Geometry',
                    data: chartData,
                    showLine: true,
                    borderColor: '#a855f7', // 테마 색상 (보라색)
                    backgroundColor: 'rgba(168, 85, 247, 0.2)',
                    fill: true,
                    pointBackgroundColor: '#fff',
                    pointRadius: 5,
                    tension: 0 // 직선 연결
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: '#ccc' }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: '#ccc' }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `(${context.parsed.x}, ${context.parsed.y})`;
                            }
                        }
                    }
                }
            }
        });
    }
}

