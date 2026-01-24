// ui.js - UI 업데이트 관련 함수들

const UI = {
    // 메시 크기 슬라이더 업데이트
    updateMeshSize: function(value) {
        document.getElementById('meshValue').textContent = value;
        document.getElementById('meshValue2').textContent = value;
    },

    // 경계 조건 표시 업데이트
    updateBoundaryEquation: function(equation) {
        document.getElementById('boundaryEq').textContent = `u = ${equation} on ∂Ω`;
    },

    // Python 코드 생성 및 표시
    updatePythonCode: function(equation, source, meshSize) {
        const code = `from mpi4py import MPI
from dolfinx import mesh, fem, default_scalar_type
from dolfinx.fem.petsc import LinearProblem
import numpy
import ufl
from dolfinx import io
from pathlib import Path

# 메시 생성
domain = mesh.create_unit_square(MPI.COMM_WORLD, ${meshSize}, ${meshSize}, mesh.CellType.quadrilateral)
V = fem.functionspace(domain, ("Lagrange", 1))

# 경계 조건 설정
uD = fem.Function(V)
uD.interpolate(lambda x: ${equation})

tdim = domain.topology.dim
fdim = tdim - 1
domain.topology.create_connectivity(fdim, tdim)
boundary_facets = mesh.exterior_facet_indices(domain.topology)
boundary_dofs = fem.locate_dofs_topological(V, fdim, boundary_facets)
bc = fem.dirichletbc(uD, boundary_dofs)

# 약형식 정의
u = ufl.TrialFunction(V)
v = ufl.TestFunction(V)
f = fem.Constant(domain, default_scalar_type(${source}))

a = ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx
L = f * v * ufl.dx

# 문제 풀이
problem = LinearProblem(
    a, L, bcs=[bc],
    petsc_options={"ksp_type": "preonly", "pc_type": "lu"}
)
uh = problem.solve()

# 오차 계산
V2 = fem.functionspace(domain, ("Lagrange", 2))
uex = fem.Function(V2, name="u_exact")
uex.interpolate(lambda x: ${equation})

L2_error = fem.form(ufl.inner(uh - uex, uh - uex) * ufl.dx)
error_local = fem.assemble_scalar(L2_error)
error_L2 = numpy.sqrt(domain.comm.allreduce(error_local, op=MPI.SUM))
error_max = numpy.max(numpy.abs(uD.x.array - uh.x.array))

# 결과 저장
results_folder = Path("results")
results_folder.mkdir(exist_ok=True, parents=True)
filename = results_folder / "fundamentals"

with io.XDMFFile(domain.comm, filename.with_suffix(".xdmf"), "w") as xdmf:
    xdmf.write_mesh(domain)
    xdmf.write_function(uh)

print(f"Error_L2: {error_L2:.2e}")
print(f"Error_max: {error_max:.2e}")`;

        document.querySelector('#pythonCode code').textContent = code;
    },

    // 로딩 상태 표시
    showLoading: function(button) {
        button.disabled = true;
        button.innerHTML = `
            <div class="spinner"></div>
            계산 중...
        `;
    },

    // 로딩 상태 해제
    hideLoading: function(button) {
        button.disabled = false;
        button.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            PDE 풀이 시작
        `;
    },

    // 에러 표시
    showError: function(message) {
        const errorAlert = document.getElementById('errorAlert');
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.textContent = message;
        errorAlert.style.display = 'flex';
        
        document.getElementById('resultsContainer').style.display = 'none';
        document.getElementById('emptyState').style.display = 'block';
    },

    // 에러 숨기기
    hideError: function() {
        document.getElementById('errorAlert').style.display = 'none';
    },

    // 결과 표시
    showResults: function(data) {
        document.getElementById('errorL2').textContent = data.error_L2;
        document.getElementById('errorMax').textContent = data.error_max;
        document.getElementById('compTime').textContent = data.computation_time;
        document.getElementById('xdmfFile').textContent = `📄 ${data.xdmf_file}`;
        document.getElementById('h5File').textContent = `📄 ${data.h5_file}`;
        
        document.getElementById('resultsContainer').style.display = 'block';
        document.getElementById('emptyState').style.display = 'none';
    }
};