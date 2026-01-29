// codeGenerator.js - FEniCSx v0.10.0 Python 코드 생성기

class FEniCSCodeGenerator {
    constructor() {
        this.version = '0.10.0';
    }

    generateImports() {
        return `# FEniCSx v0.10.0 자동 생성 코드
import sys
import json
from mpi4py import MPI
from dolfinx import mesh, fem, default_scalar_type
from dolfinx.fem.petsc import LinearProblem
import numpy as np
import ufl
from dolfinx import io
from pathlib import Path

`;
    }

    generateMesh(dimension, nx, ny = 8, nz = 8, shape = 'rectangle') {
        if (dimension === '1d') {
            return `# 1D 메시 생성
domain = mesh.create_interval(MPI.COMM_WORLD, ${nx}, [0.0, 1.0])
`;
        } else if (dimension === '2d') {
            const cellType = shape === 'triangle' ? 'mesh.CellType.triangle' : 'mesh.CellType.quadrilateral';
            return `# 2D 메시 생성 (${shape})
domain = mesh.create_rectangle(
    MPI.COMM_WORLD,
    [[0.0, 0.0], [1.0, 1.0]],
    [${nx}, ${ny}],
    ${cellType}
)
`;
        } else if (dimension === '3d') {
            const cellType = shape === 'tetrahedron' ? 'mesh.CellType.tetrahedron' : 'mesh.CellType.hexahedron';
            return `# 3D 메시 생성 (${shape})
domain = mesh.create_box(
    MPI.COMM_WORLD,
    [[0.0, 0.0, 0.0], [1.0, 1.0, 1.0]],
    [${nx}, ${ny}, ${nz}],
    ${cellType}
)
`;
        }
    }

    generateFunctionSpace(elementType = 'Lagrange', degree = 1) {
        return `# 함수 공간 정의
V = fem.functionspace(domain, ("${elementType}", ${degree}))
`;
    }

    generateBoundaryCondition(dimension, expression) {
        if (dimension === '1d') {
            return `# Dirichlet 경계 조건 (1D - 양 끝점)
uD = fem.Function(V)
uD.interpolate(lambda x: ${expression})

def boundary(x):
    return np.logical_or(np.isclose(x[0], 0.0), np.isclose(x[0], 1.0))

boundary_facets = mesh.locate_entities_boundary(domain, 0, boundary)
boundary_dofs = fem.locate_dofs_topological(V, 0, boundary_facets)
bc = fem.dirichletbc(uD, boundary_dofs)
`;
        } else {
            return `# Dirichlet 경계 조건 (전체 경계)
uD = fem.Function(V)
uD.interpolate(lambda x: ${expression})

tdim = domain.topology.dim
fdim = tdim - 1
domain.topology.create_connectivity(fdim, tdim)
boundary_facets = mesh.exterior_facet_indices(domain.topology)
boundary_dofs = fem.locate_dofs_topological(V, fdim, boundary_facets)
bc = fem.dirichletbc(uD, boundary_dofs)
`;
        }
    }

    generateWeakForm(equationType, params) {
        if (equationType === 'poisson') {
            return `# Poisson 방정식 약형식
# -∇²u = f
u = ufl.TrialFunction(V)
v = ufl.TestFunction(V)
f = fem.Constant(domain, default_scalar_type(${params.source}))

a = ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx
L = f * v * ufl.dx
`;
        } else if (equationType === 'heat') {
            return `# Heat 방정식 약형식
# ∂u/∂t - ∇²u = f
u = ufl.TrialFunction(V)
v = ufl.TestFunction(V)
f = fem.Constant(domain, default_scalar_type(${params.source}))
dt = fem.Constant(domain, default_scalar_type(${params.dt}))

# 초기 조건
u_n = fem.Function(V)
u_n.interpolate(lambda x: ${params.initial})

a = u * v * ufl.dx + dt * ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx
L = (u_n + dt * f) * v * ufl.dx
`;
        } else if (equationType === 'helmholtz') {
            return `# Helmholtz 방정식 약형식
# -∇²u + k²u = f
u = ufl.TrialFunction(V)
v = ufl.TestFunction(V)
f = fem.Constant(domain, default_scalar_type(${params.source}))
k = fem.Constant(domain, default_scalar_type(${params.k}))

a = (ufl.dot(ufl.grad(u), ufl.grad(v)) + k**2 * u * v) * ufl.dx
L = f * v * ufl.dx
`;
        } else {
            // Custom
            return `# 사용자 정의 약형식
u = ufl.TrialFunction(V)
v = ufl.TestFunction(V)

${params.custom_a}
${params.custom_L}
`;
        }
    }

    generateSolver() {
        return `# 선형 문제 풀이 (FEniCSx v0.10.0)
problem = LinearProblem(
    a, L, 
    bcs=[bc],
    petsc_options={"ksp_type": "preonly", "pc_type": "lu"},
    petsc_options_prefix="solve"
)
uh = problem.solve()
`;
    }

    generatePostprocess(hasExactSolution, exactSolution = null, dimension = '2d') {
        let code = `# 후처리 및 결과 저장
results_folder = Path("results")
results_folder.mkdir(exist_ok=True, parents=True)
filename = results_folder / "solution"

# XDMF 형식으로 저장 (ParaView 호환)
with io.XDMFFile(domain.comm, filename.with_suffix(".xdmf"), "w") as xdmf:
    xdmf.write_mesh(domain)
    xdmf.write_function(uh)

# 결과 데이터
result = {
    "xdmf_file": str(filename.with_suffix(".xdmf")),
    "h5_file": str(filename.with_suffix(".h5")),
    "solution_norm": float(np.linalg.norm(uh.x.array)),
    "dofs": uh.x.array.size
}
`;

        if (hasExactSolution && exactSolution) {
            const degree = dimension === '1d' ? 2 : dimension === '2d' ? 2 : 3;
            code += `
# 정확해와 비교
V_exact = fem.functionspace(domain, ("Lagrange", ${degree}))
u_exact = fem.Function(V_exact, name="u_exact")
u_exact.interpolate(lambda x: ${exactSolution})

# L2 오차 계산
L2_error = fem.form(ufl.inner(uh - u_exact, uh - u_exact) * ufl.dx)
error_local = fem.assemble_scalar(L2_error)
error_L2 = np.sqrt(domain.comm.allreduce(error_local, op=MPI.SUM))

# 최대 오차
error_max = float(np.max(np.abs(uD.x.array - uh.x.array)))

result["error_L2"] = f"{error_L2:.2e}"
result["error_max"] = f"{error_max:.2e}"
`;
        }

        code += `
# JSON 결과 출력 (마지막 줄에 출력해야 파싱됨)
print(json.dumps(result))
`;
        return code;
    }

    generate(config) {
        /*
        config = {
            dimension: '1d' | '2d' | '3d',
            mesh: { nx: 8, ny: 8, nz: 8, shape: 'rectangle' | 'triangle' | 'box' | 'tetrahedron' },
            functionSpace: { type: 'Lagrange' | 'DG' | 'RT' | 'BDM', degree: 1 },
            boundaryCondition: { expression: '1 + x[0]**2 + 2*x[1]**2' },
            equation: { 
                type: 'poisson' | 'heat' | 'helmholtz' | 'custom',
                params: { source: -6, ... }
            },
            exactSolution: '1 + x[0]**2 + 2*x[1]**2' (optional)
        }
        */

        let code = '';

        // 1. Imports
        code += this.generateImports();

        // 2. Mesh
        code += this.generateMesh(
            config.dimension,
            config.mesh.nx,
            config.mesh.ny,
            config.mesh.nz,
            config.mesh.shape
        );

        // 3. Function Space
        code += '\n' + this.generateFunctionSpace(
            config.functionSpace.type,
            config.functionSpace.degree
        );

        // 4. Boundary Condition
        code += '\n' + this.generateBoundaryCondition(
            config.dimension,
            config.boundaryCondition.expression
        );

        // 5. Weak Form
        code += '\n' + this.generateWeakForm(
            config.equation.type,
            config.equation.params
        );

        // 6. Solver
        code += '\n' + this.generateSolver();

        // 7. Postprocess
        code += '\n' + this.generatePostprocess(
            !!config.exactSolution,
            config.exactSolution,
            config.dimension
        );

        return code;
    }
}

// Export
window.FEniCSCodeGenerator = FEniCSCodeGenerator;