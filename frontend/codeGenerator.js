// codeGenerator.js - FEniCSx v0.10.0 + gmsh 코드 생성기

class FEniCSCodeGenerator {
    constructor() {
        this.version = '0.10.0';
    }

    generateImports() {
        return `# FEniCSx v0.10.0 + gmsh 자동 생성 코드
import sys
import json
import numpy as np
from pathlib import Path

# FEniCSx imports
from mpi4py import MPI
from dolfinx import mesh, fem, default_scalar_type
from dolfinx.fem.petsc import LinearProblem
import ufl
from dolfinx import io
from dolfinx.io import gmshio

# gmsh imports
import gmsh

`;
    }

    generateGmshMesh(dimension, meshConfig) {
        const { nx, ny, nz, shape, lc } = meshConfig;
        const characteristicLength = lc || 0.1;

        if (dimension === '1d') {
            return `# gmsh 1D 메시 생성
if not gmsh.isInitialized():
    gmsh.initialize()

gmsh.model.add("1d_domain")

# 1D 도메인: [0, 1]
p1 = gmsh.model.geo.addPoint(0.0, 0.0, 0.0, ${characteristicLength})
p2 = gmsh.model.geo.addPoint(1.0, 0.0, 0.0, ${characteristicLength})
line = gmsh.model.geo.addLine(p1, p2)

gmsh.model.geo.synchronize()

# Physical groups
gmsh.model.addPhysicalGroup(1, [line], 1)
gmsh.model.setPhysicalName(1, 1, "Domain")

# Mesh generation
gmsh.option.setNumber("Mesh.CharacteristicLengthMin", ${characteristicLength})
gmsh.option.setNumber("Mesh.CharacteristicLengthMax", ${characteristicLength})
gmsh.model.mesh.generate(1)

# Convert to DOLFINx
gdim = 1
gmsh_model_rank = 0
mesh_comm = MPI.COMM_WORLD
mesh_data = gmshio.model_to_mesh(gmsh.model, mesh_comm, gmsh_model_rank, gdim=gdim)
domain = mesh_data.mesh

gmsh.finalize()
`;
        } else if (dimension === '2d') {
            if (shape === 'circle') {
                return `# gmsh 2D 원형 메시 생성
if not gmsh.isInitialized():
    gmsh.initialize()

gmsh.model.add("circle_domain")

# 원형 도메인 (반지름 0.5, 중심 (0.5, 0.5))
circle = gmsh.model.occ.addDisk(0.5, 0.5, 0.0, 0.5, 0.5)

gmsh.model.occ.synchronize()

# Physical groups
gdim = 2
gmsh.model.addPhysicalGroup(gdim, [circle], 1)
gmsh.model.setPhysicalName(gdim, 1, "Domain")

# Mesh generation
gmsh.option.setNumber("Mesh.CharacteristicLengthMin", ${characteristicLength})
gmsh.option.setNumber("Mesh.CharacteristicLengthMax", ${characteristicLength})
gmsh.model.mesh.generate(gdim)

# Convert to DOLFINx
gmsh_model_rank = 0
mesh_comm = MPI.COMM_WORLD
mesh_data = gmshio.model_to_mesh(gmsh.model, mesh_comm, gmsh_model_rank, gdim=gdim)
domain = mesh_data.mesh

gmsh.finalize()
`;
            } else if (shape === 'rectangle') {
                return `# gmsh 2D 사각형 메시 생성
if not gmsh.isInitialized():
    gmsh.initialize()

gmsh.model.add("rectangle_domain")

# 사각형 도메인 [0,1] x [0,1]
rect = gmsh.model.occ.addRectangle(0.0, 0.0, 0.0, 1.0, 1.0)

gmsh.model.occ.synchronize()

# Physical groups
gdim = 2
gmsh.model.addPhysicalGroup(gdim, [rect], 1)
gmsh.model.setPhysicalName(gdim, 1, "Domain")

# Mesh generation
gmsh.option.setNumber("Mesh.CharacteristicLengthMin", ${characteristicLength})
gmsh.option.setNumber("Mesh.CharacteristicLengthMax", ${characteristicLength})
gmsh.model.mesh.generate(gdim)

# Convert to DOLFINx
gmsh_model_rank = 0
mesh_comm = MPI.COMM_WORLD
mesh_data = gmshio.model_to_mesh(gmsh.model, mesh_comm, gmsh_model_rank, gdim=gdim)
domain = mesh_data.mesh

gmsh.finalize()
`;
            } else if (shape === 'lshape') {
                return `# gmsh 2D L-shape 메시 생성
if not gmsh.isInitialized():
    gmsh.initialize()

gmsh.model.add("lshape_domain")

# L-shape: 큰 사각형에서 작은 사각형 빼기
rect1 = gmsh.model.occ.addRectangle(0.0, 0.0, 0.0, 1.0, 1.0)
rect2 = gmsh.model.occ.addRectangle(0.5, 0.5, 0.0, 0.5, 0.5)

lshape = gmsh.model.occ.cut([(2, rect1)], [(2, rect2)])[0]

gmsh.model.occ.synchronize()

# Physical groups
gdim = 2
gmsh.model.addPhysicalGroup(gdim, [lshape[0][1]], 1)
gmsh.model.setPhysicalName(gdim, 1, "Domain")

# Mesh generation
gmsh.option.setNumber("Mesh.CharacteristicLengthMin", ${characteristicLength})
gmsh.option.setNumber("Mesh.CharacteristicLengthMax", ${characteristicLength})
gmsh.model.mesh.generate(gdim)

# Convert to DOLFINx
gmsh_model_rank = 0
mesh_comm = MPI.COMM_WORLD
mesh_data = gmshio.model_to_mesh(gmsh.model, mesh_comm, gmsh_model_rank, gdim=gdim)
domain = mesh_data.mesh

gmsh.finalize()
`;
            } else {
                // triangle (기본)
                return `# gmsh 2D 사각형 메시 생성 (삼각형 요소)
if not gmsh.isInitialized():
    gmsh.initialize()

gmsh.model.add("triangle_domain")

rect = gmsh.model.occ.addRectangle(0.0, 0.0, 0.0, 1.0, 1.0)

gmsh.model.occ.synchronize()

gdim = 2
gmsh.model.addPhysicalGroup(gdim, [rect], 1)
gmsh.model.setPhysicalName(gdim, 1, "Domain")

# 삼각형 요소 강제
gmsh.option.setNumber("Mesh.Algorithm", 6)  # Frontal-Delaunay
gmsh.option.setNumber("Mesh.CharacteristicLengthMin", ${characteristicLength})
gmsh.option.setNumber("Mesh.CharacteristicLengthMax", ${characteristicLength})
gmsh.model.mesh.generate(gdim)

gmsh_model_rank = 0
mesh_comm = MPI.COMM_WORLD
mesh_data = gmshio.model_to_mesh(gmsh.model, mesh_comm, gmsh_model_rank, gdim=gdim)
domain = mesh_data.mesh

gmsh.finalize()
`;
            }
        } else if (dimension === '3d') {
            if (shape === 'sphere') {
                return `# gmsh 3D 구 메시 생성
if not gmsh.isInitialized():
    gmsh.initialize()

gmsh.model.add("sphere_domain")

# 구 도메인 (반지름 0.5, 중심 (0.5, 0.5, 0.5))
sphere = gmsh.model.occ.addSphere(0.5, 0.5, 0.5, 0.5)

gmsh.model.occ.synchronize()

# Physical groups
gdim = 3
gmsh.model.addPhysicalGroup(gdim, [sphere], 1)
gmsh.model.setPhysicalName(gdim, 1, "Domain")

# Mesh generation
gmsh.option.setNumber("Mesh.CharacteristicLengthMin", ${characteristicLength})
gmsh.option.setNumber("Mesh.CharacteristicLengthMax", ${characteristicLength})
gmsh.model.mesh.generate(gdim)

# Convert to DOLFINx
gmsh_model_rank = 0
mesh_comm = MPI.COMM_WORLD
mesh_data = gmshio.model_to_mesh(gmsh.model, mesh_comm, gmsh_model_rank, gdim=gdim)
domain = mesh_data.mesh

gmsh.finalize()
`;
            } else {
                // box (기본)
                return `# gmsh 3D 박스 메시 생성
if not gmsh.isInitialized():
    gmsh.initialize()

gmsh.model.add("box_domain")

# 박스 도메인 [0,1]^3
box = gmsh.model.occ.addBox(0.0, 0.0, 0.0, 1.0, 1.0, 1.0)

gmsh.model.occ.synchronize()

# Physical groups
gdim = 3
gmsh.model.addPhysicalGroup(gdim, [box], 1)
gmsh.model.setPhysicalName(gdim, 1, "Domain")

# Mesh generation
gmsh.option.setNumber("Mesh.CharacteristicLengthMin", ${characteristicLength})
gmsh.option.setNumber("Mesh.CharacteristicLengthMax", ${characteristicLength})
gmsh.model.mesh.generate(gdim)

# Convert to DOLFINx
gmsh_model_rank = 0
mesh_comm = MPI.COMM_WORLD
mesh_data = gmshio.model_to_mesh(gmsh.model, mesh_comm, gmsh_model_rank, gdim=gdim)
domain = mesh_data.mesh

gmsh.finalize()
`;
            }
        }
    }

    generateFunctionSpace(elementType = 'Lagrange', degree = 1) {
        return `# 함수 공간 정의
V = fem.functionspace(domain, ("${elementType}", ${degree}))
`;
    }

    generateBoundaryCondition(dimension, expression, bcType = 'dirichlet_all') {
        if (dimension === '1d') {
            return `# Dirichlet 경계 조건 (1D - 양 끝점)
uD = fem.Function(V)
uD.interpolate(lambda x: ${expression})

def boundary(x):
    return np.logical_or(np.isclose(x[0], 0.0), np.isclose(x[0], 1.0))

boundary_dofs = fem.locate_dofs_geometrical(V, boundary)
bc = fem.dirichletbc(uD, boundary_dofs)
`;
        } else if (dimension === '2d') {
            if (bcType === 'circle_boundary') {
                return `# Dirichlet 경계 조건 (원형 경계)
uD = fem.Function(V)
uD.interpolate(lambda x: ${expression})

def on_boundary(x):
    # 원의 경계: sqrt((x-0.5)^2 + (y-0.5)^2) = 0.5
    return np.isclose(np.sqrt((x[0]-0.5)**2 + (x[1]-0.5)**2), 0.5)

boundary_dofs = fem.locate_dofs_geometrical(V, on_boundary)
bc = fem.dirichletbc(default_scalar_type(0), boundary_dofs, V)
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
        } else {
            // 3D
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
f = fem.Constant(domain, default_scalar_type(${params.source || 0}))

a = ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx
L = f * v * ufl.dx
`;
        } else if (equationType === 'heat') {
            return `# Heat 방정식 약형식 (시간 이산화)
# ∂u/∂t - ∇²u = f
u = ufl.TrialFunction(V)
v = ufl.TestFunction(V)

# 파라미터
f = fem.Constant(domain, default_scalar_type(${params.source || 0}))
dt = fem.Constant(domain, default_scalar_type(${params.dt || 0.01}))

# 이전 시간 단계 해
u_n = fem.Function(V)
u_n.interpolate(lambda x: ${params.initial || '0'})

# 후방 Euler 스킴: (u - u_n)/dt - ∇²u = f
# u/dt + ∇²u = u_n/dt + f
a = (u / dt) * v * ufl.dx + ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx
L = (u_n / dt + f) * v * ufl.dx
`;
        } else if (equationType === 'helmholtz') {
            return `# Helmholtz 방정식 약형식
# -∇²u + k²u = f
u = ufl.TrialFunction(V)
v = ufl.TestFunction(V)
f = fem.Constant(domain, default_scalar_type(${params.source || 0}))
k = fem.Constant(domain, default_scalar_type(${params.k || 1.0}))

a = (ufl.dot(ufl.grad(u), ufl.grad(v)) + k**2 * u * v) * ufl.dx
L = f * v * ufl.dx
`;
        } else if (equationType === 'elasticity') {
            return `# 선형 탄성 방정식 약형식
# -div(σ(u)) = f
# σ(u) = λ tr(ε(u))I + 2με(u)
# ε(u) = (∇u + (∇u)ᵀ)/2

# 벡터 함수 공간 (변위)
V_vec = fem.functionspace(domain, ("Lagrange", ${params.degree || 1}, (domain.geometry.dim,)))

u = ufl.TrialFunction(V_vec)
v = ufl.TestFunction(V_vec)

# 재료 파라미터
E = ${params.E || 1e5}  # Young's modulus
nu = ${params.nu || 0.3}  # Poisson's ratio
mu = E / (2 * (1 + nu))
lmbda = E * nu / ((1 + nu) * (1 - 2 * nu))

# 변형률 텐서
def epsilon(u):
    return ufl.sym(ufl.grad(u))

# 응력 텐서
def sigma(u):
    return lmbda * ufl.tr(epsilon(u)) * ufl.Identity(len(u)) + 2 * mu * epsilon(u)

# 체적력
f = fem.Constant(domain, default_scalar_type((0.0, 0.0)))

a = ufl.inner(sigma(u), epsilon(v)) * ufl.dx
L = ufl.dot(f, v) * ufl.dx

# 경계 조건 수정 필요
V = V_vec
`;
        } else {
            // Custom
            return `# 사용자 정의 약형식
u = ufl.TrialFunction(V)
v = ufl.TestFunction(V)

${params.custom_a || 'a = ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx'}
${params.custom_L || 'L = fem.Constant(domain, default_scalar_type(0)) * v * ufl.dx'}
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

# 기본 통계
solution_norm = float(np.linalg.norm(uh.x.array))
solution_min = float(np.min(uh.x.array))
solution_max = float(np.max(uh.x.array))

# 결과 데이터
result = {
    "xdmf_file": str(filename.with_suffix(".xdmf")),
    "h5_file": str(filename.with_suffix(".h5")),
    "solution_norm": solution_norm,
    "solution_min": solution_min,
    "solution_max": solution_max,
    "dofs": uh.x.array.size
}
`;

        if (hasExactSolution && exactSolution) {
            const degree = dimension === '1d' ? 3 : dimension === '2d' ? 3 : 4;
            code += `
# 정확해와 비교
V_exact = fem.functionspace(domain, ("Lagrange", ${degree}))
u_exact = fem.Function(V_exact, name="u_exact")
u_exact.interpolate(lambda x: ${exactSolution})

# L2 오차 계산
L2_error = fem.form(ufl.inner(uh - u_exact, uh - u_exact) * ufl.dx)
error_local = fem.assemble_scalar(L2_error)
error_L2 = np.sqrt(domain.comm.allreduce(error_local, op=MPI.SUM))

# H1 오차 계산 (gradient)
H1_error = fem.form(
    ufl.inner(ufl.grad(uh) - ufl.grad(u_exact), 
              ufl.grad(uh) - ufl.grad(u_exact)) * ufl.dx
)
h1_error_local = fem.assemble_scalar(H1_error)
error_H1 = np.sqrt(domain.comm.allreduce(h1_error_local, op=MPI.SUM))

# 최대 오차 (절댓값)
try:
    error_max = float(np.max(np.abs(uD.x.array - uh.x.array)))
except:
    error_max = 0.0

result["error_L2"] = f"{error_L2:.2e}"
result["error_H1"] = f"{error_H1:.2e}"
result["error_max"] = f"{error_max:.2e}"

# 정확해도 저장
with io.XDMFFile(domain.comm, (results_folder / "exact_solution").with_suffix(".xdmf"), "w") as xdmf:
    xdmf.write_mesh(domain)
    xdmf.write_function(u_exact)
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
            mesh: { 
                shape: 'rectangle' | 'circle' | 'lshape' | 'box' | 'sphere',
                lc: 0.1  // characteristic length
            },
            functionSpace: { type: 'Lagrange', degree: 1 },
            boundaryCondition: { 
                expression: '0',
                type: 'dirichlet_all' | 'circle_boundary'
            },
            equation: { 
                type: 'poisson' | 'heat' | 'helmholtz' | 'elasticity' | 'custom',
                params: {...}
            },
            exactSolution: '1 + x[0]**2 + 2*x[1]**2' (optional)
        }
        */

        let code = '';

        // 1. Imports
        code += this.generateImports();

        // 2. gmsh Mesh
        code += this.generateGmshMesh(config.dimension, config.mesh);

        // 3. Function Space
        code += '\n' + this.generateFunctionSpace(
            config.functionSpace.type,
            config.functionSpace.degree
        );

        // 4. Boundary Condition
        code += '\n' + this.generateBoundaryCondition(
            config.dimension,
            config.boundaryCondition.expression,
            config.boundaryCondition.type
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