// codeGenerator.js - FEniCSx v0.10.0 검증된 템플릿 기반

class FEniCSCodeGenerator {
    constructor() {
        this.version = '0.10.0';
    }

    _wrapExpr(expr) {
        if (String(expr).includes('x[')) {
            return expr;
        }
        return `np.full(x.shape[1], ${expr})`;
    }

    generate(config) {
        /*
        config = {
            dimension: '1d' | '2d' | '3d',
            mesh: { 
                shape: 'rectangle' | 'circle' | 'lshape' | 'polygon' | 'box' | 'sphere',
                lc: 0.1
            },
            functionSpace: { type: 'Lagrange', degree: 1 },
            boundaryCondition: { 
                expression: '0',
                type: 'dirichlet_all' | 'circle_boundary'
            },
            equation: { 
                type: 'poisson' | 'heat' | 'helmholtz' | 'custom',
                params: {...}
            },
            exactSolution: '1 + x[0]**2 + 2*x[1]**2' (optional)
        }
        */

        let code = this.generateHeader(config.equation);
        code += this.generateTimeSet(config.equation);
        code += this.generateGmshMesh(config.dimension, config.mesh);
        code += this.generateFunctionSpace(config.functionSpace);
        code += this.generateBoundaryCondition(config.dimension, config.boundaryCondition, config.equation);
        code += this.generateWeakForm(config.equation);
        code += this.generateSolver(config.equation);
        code += this.generateErrorAnalysis(config.exactSolution, config.boundaryCondition.expression, config.equation);
        code += this.generatePostprocess(!!config.exactSolution, config.equation);

        return code;
    }

    generateHeader(equation) {
        const { type, params } = equation;
        let pass = true;
        if (type === 'heat') {
            pass = false;
        } else if (type === 'custom') {
            str = (params.custom_a || '') + (params.custom_L || '');
            const conditionDt = /(?<![a-zA-Z])dt(?![a-zA-Z])/.test(str);
            const conditionT = /(?<![a-zA-Z])t(?![a-zA-Z])/.test(str);
            if (conditionDt || conditionT) {
                pass = false;
            }
        }
        if (pass) {
            return `# FEniCSx v0.10.0 Auto-generated Code
import gmsh
from mpi4py import MPI
from dolfinx import mesh, fem, default_scalar_type
from dolfinx.io import gmsh as gmshio
from dolfinx.fem.petsc import LinearProblem
import numpy as np
import ufl

# XDMF/HDF5 파일로 저장 (ParaView 사용)
from dolfinx import io
from pathlib import Path

# Results folder
results_folder = Path("results")
results_folder.mkdir(exist_ok=True, parents=True)
filename = results_folder / "solution"

`;      } else {
            return `# FEniCSx v0.10.0 Auto-generated Code
import gmsh
from mpi4py import MPI
from dolfinx import mesh, fem, default_scalar_type
from dolfinx.io import gmsh as gmshio
from dolfinx.fem.petsc import assemble_matrix, assemble_vector, apply_lifting, set_bc
import numpy as np
import ufl

# XDMF/HDF5 파일로 저장 (ParaView 사용)
from dolfinx import io
from pathlib import Path
from petsc4py import PETSc

# Results folder
results_folder = Path("results")
results_folder.mkdir(exist_ok=True, parents=True)
filename = results_folder / "solution"

`;      }
    }

    generateTimeSet(equation) {
        const { type, params } = equation;
        if (type === 'custom') {
            let code = `# T-dependent settings
t = 0.0
T = ${params.T || 1.0}
dt = ${params.dT || 0.1}
num_steps = int(T / dt)

`;      
        return code;
        }
        return '';
    }

    generateGmshMesh(dimension, meshConfig) {
        const { shape, lc } = meshConfig;
        const characteristicLength = lc || 0.1;

        let code = `# ============================================
# gmsh Mesh Generation
# ============================================
if not gmsh.isInitialized():
    gmsh.initialize()

gmsh.model.add("domain")

`;

        if (dimension === '1d') {
            code += `# 1D domain: [0, 1]
p1 = gmsh.model.geo.addPoint(0.0, 0.0, 0.0, ${characteristicLength})
p2 = gmsh.model.geo.addPoint(1.0, 0.0, 0.0, ${characteristicLength})
line = gmsh.model.geo.addLine(p1, p2)

gmsh.model.geo.synchronize()
gdim = 1
gmsh.model.addPhysicalGroup(1, [line], 1)
gmsh.model.setPhysicalName(1, 1, "Domain")
`;
        } else if (dimension === '2d') {
            if (shape === 'circle') {
                code += `# 2D Circle: center (0.5, 0.5), radius 0.5
circle = gmsh.model.occ.addDisk(0.5, 0.5, 0.0, 0.5, 0.5)
gmsh.model.occ.synchronize()
gdim = 2
gmsh.model.addPhysicalGroup(gdim, [circle], 1)
gmsh.model.setPhysicalName(gdim, 1, "Domain")
`;
            } else if (shape === 'lshape') {
                code += `# 2D L-shape
rect1 = gmsh.model.occ.addRectangle(0.0, 0.0, 0.0, 1.0, 1.0)
rect2 = gmsh.model.occ.addRectangle(0.5, 0.5, 0.0, 0.5, 0.5)
lshape = gmsh.model.occ.cut([(2, rect1)], [(2, rect2)])[0]
gmsh.model.occ.synchronize()
gdim = 2
gmsh.model.addPhysicalGroup(gdim, [lshape[0][1]], 1)
gmsh.model.setPhysicalName(gdim, 1, "Domain")
`;
            } else if (shape === 'polygon') {
                const points = meshConfig.points || [[0,0], [1,0], [0,1]];
                
                code += `# 2D Custom Polygon
# Points 정의
poly_points = []
`;
                // 1. 점 생성 (Javascript에서 좌표를 순회하며 파이썬 코드 생성)
                points.forEach((pt, i) => {
                    code += `poly_points.append(gmsh.model.geo.addPoint(${pt[0]}, ${pt[1]}, 0.0, ${characteristicLength}))\n`;
                });

                code += `
# Lines 연결 (마지막 점 -> 첫 점 자동 연결)
poly_lines = []
for i in range(len(poly_points)):
    p_start = poly_points[i]
    p_end = poly_points[(i + 1) % len(poly_points)] # Wrap around
    poly_lines.append(gmsh.model.geo.addLine(p_start, p_end))

# Curve Loop & Surface 생성
curve_loop = gmsh.model.geo.addCurveLoop(poly_lines)
plane_surface = gmsh.model.geo.addPlaneSurface([curve_loop])

gmsh.model.geo.synchronize()

gdim = 2
gmsh.model.addPhysicalGroup(gdim, [plane_surface], 1)
gmsh.model.setPhysicalName(gdim, 1, "Domain")
`;
            } else {
                // rectangle (default)
                code += `# 2D Rectangle: [0,1] x [0,1]
rect = gmsh.model.occ.addRectangle(0.0, 0.0, 0.0, 1.0, 1.0)
gmsh.model.occ.synchronize()
gdim = 2
gmsh.model.addPhysicalGroup(gdim, [rect], 1)
gmsh.model.setPhysicalName(gdim, 1, "Domain")
`;
            }
        } else if (dimension === '3d') {
            if (shape === 'sphere') {
                code += `# 3D Sphere: center (0.5, 0.5, 0.5), radius 0.5
sphere = gmsh.model.occ.addSphere(0.5, 0.5, 0.5, 0.5)
gmsh.model.occ.synchronize()
gdim = 3
gmsh.model.addPhysicalGroup(gdim, [sphere], 1)
gmsh.model.setPhysicalName(gdim, 1, "Domain")
`;
            } else {
                // box (default)
                code += `# 3D Box: [0,1]^3
box = gmsh.model.occ.addBox(0.0, 0.0, 0.0, 1.0, 1.0, 1.0)
gmsh.model.occ.synchronize()
gdim = 3
gmsh.model.addPhysicalGroup(gdim, [box], 1)
gmsh.model.setPhysicalName(gdim, 1, "Domain")
`;
            }
        }

        code += `
# Mesh options
gmsh.option.setNumber("Mesh.CharacteristicLengthMin", ${characteristicLength})
gmsh.option.setNumber("Mesh.CharacteristicLengthMax", ${characteristicLength})
`;

        if (dimension === '2d' && shape === 'rectangle') {
            code += `gmsh.option.setNumber("Mesh.RecombineAll", 1)  # Quadrilateral elements
gmsh.option.setNumber("Mesh.Algorithm", 8)  # Frontal-Delaunay for Quads
`;
        }

        code += `
gmsh.model.mesh.generate(gdim)

# Convert to DOLFINx
gmsh_model_rank = 0
mesh_comm = MPI.COMM_WORLD
mesh_data = gmshio.model_to_mesh(gmsh.model, mesh_comm, gmsh_model_rank, gdim=gdim)
domain = mesh_data.mesh

gmsh.finalize()

if mesh_comm.rank == 0:
    num_cells = domain.topology.index_map(gdim).size_global
    num_vertices = domain.topology.index_map(0).size_global
    print(f"✅ Mesh created: {num_vertices} vertices, {num_cells} cells")

`;
        return code;
    }

    generateFunctionSpace(functionSpace) {
        const { type, degree } = functionSpace;
        return `# ============================================
# Function Space
# ============================================
V = fem.functionspace(domain, ("${type}", ${degree}))

`;
    }

    generateBoundaryCondition(dimension, bc, equation) {
        const { expression, type } = bc;

        let code = `# ============================================
# Boundary Conditions
# ============================================
`;
        if (equation.type === 'heat' || (equation.type === 'custom' && equation.params.time_dependent)) {
            const initial = equation.params.initial || 0;
            const safeInitial = this._wrapExpr(initial);
            code +=`
u_n = fem.Function(V, name="u_n")
u_n.interpolate(lambda x: ${safeInitial})

uh = fem.Function(V, name="u")
uh.x.array[:] = u_n.x.array

uD = fem.Function(V)
`;
        } else {
            code +=`
uD = fem.Function(V)
uD.interpolate(lambda x: ${expression})
`;
        }

        if (dimension === '1d') {
            code += `# 1D: Fix both endpoints
def boundary(x):
    return np.logical_or(np.isclose(x[0], 0.0), np.isclose(x[0], 1.0))

boundary_dofs = fem.locate_dofs_geometrical(V, boundary)
bc = fem.dirichletbc(uD, boundary_dofs)
`;
        } else if (type === 'circle_boundary') {
            code += `# Circle boundary: sqrt((x-0.5)^2 + (y-0.5)^2) = 0.5
def on_boundary(x):
    return np.isclose(np.sqrt((x[0]-0.5)**2 + (x[1]-0.5)**2), 0.5)

boundary_dofs = fem.locate_dofs_geometrical(V, on_boundary)
bc = fem.dirichletbc(default_scalar_type(0), boundary_dofs, V)
`;
        } else {
            // All exterior boundaries (default)
            code += `# All exterior boundaries
tdim = domain.topology.dim
fdim = tdim - 1
domain.topology.create_connectivity(fdim, tdim)
boundary_facets = mesh.exterior_facet_indices(domain.topology)

boundary_dofs = fem.locate_dofs_topological(V, fdim, boundary_facets)
bc = fem.dirichletbc(uD, boundary_dofs)
`;
        }

        code += `
if mesh_comm.rank == 0:
    print(f"✅ Boundary conditions applied")

`;
        return code;
    }

    generateWeakForm(equation) {
        const { type, params } = equation;

        let code = `# ============================================
# Weak Formulation
# ============================================
u = ufl.TrialFunction(V)
v = ufl.TestFunction(V)

`;

        if (type === 'poisson') {
            const source = params.source || 0;
            code += `# Poisson: -∇²u = f
f = fem.Constant(domain, default_scalar_type(${source}))

a = ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx
L = f * v * ufl.dx
`;
        } else if (type === 'heat') {
            const source = params.source || 0;
            const T = params.T || 1.0;
            const dt = params.dt || 0.01;
            const initial = params.initial || 0;

            const safeInitial = this._wrapExpr(initial); // 추후 변경 예정(불균일 배경)

            code += `# Heat: ∂u/∂t - ∇²u = f (Backward Euler)
f = fem.Constant(domain, default_scalar_type(${source}))
dt = ${dt}
t = 0.0
T = ${T}
num_steps = int(T / dt)

#u_n = fem.Function(V)
#u_n.interpolate(lambda x: ${safeInitial})

a = (u / dt) * v * ufl.dx + ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx
L = (u_n / dt + f) * v * ufl.dx
`;
        } else if (type === 'helmholtz') {
            const source = params.source || 0;
            const k = params.k || 1.0;
            code += `# Helmholtz: -∇²u + k²u = f
f = fem.Constant(domain, default_scalar_type(${source}))
k = fem.Constant(domain, default_scalar_type(${k}))

a = (ufl.dot(ufl.grad(u), ufl.grad(v)) + k**2 * u * v) * ufl.dx
L = f * v * ufl.dx
`;
        } else {
            const source = params.source || 0;
            // custom
            code += `# Custom weak form
f = fem.Constant(domain, default_scalar_type(${source}))
${params.custom_a || 'a = ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx'}
${params.custom_L || 'L = fem.Constant(domain, default_scalar_type(0)) * v * ufl.dx'}
`;
        }

        return code + '\n';
    }

    generateSolver(equation) {
        const { type, params } = equation;
        if (type === 'heat' || (type === 'custom' && params.time_dependent)) {
            return `# ============================================
# Solve
# ============================================
# Form 컴파일
a_form = fem.form(a)
L_form = fem.form(L)

# ---------------------------
# 6. 행렬 및 벡터 사전 조립
# ---------------------------
A = assemble_matrix(a_form, bcs=[bc])
A.assemble()

# ✅ [수정됨] create_vector 대신 assemble_vector로 벡터 생성 및 초기화
# 이렇게 하면 API 호환성 문제 없이 안전하게 PETSc 벡터가 생성됩니다.
b = assemble_vector(L_form)

# KSP 솔버 설정
ksp = PETSc.KSP().create(domain.comm)
ksp.setOperators(A)
ksp.setType("cg")
ksp.getPC().setType("gamg")
ksp.setTolerances(rtol=1e-10)
ksp.setFromOptions()

# ---------------------------
# 7. 시간 루프
# ---------------------------
with io.XDMFFile(domain.comm, filename.with_suffix(".xdmf"), "w") as xdmf:
    xdmf.write_mesh(domain)
    xdmf.write_function(uh, t)

    if mesh_comm.rank == 0:
        print(f"✅ Time loop started (T={T}, dt={dt:.4f})")

    for n in range(num_steps):
        t += dt

        # RHS 벡터 리셋 (0으로 초기화)
        with b.localForm() as loc:
            loc.set(0)
        
        # 현재 스텝의 L_form으로 벡터 재조립
        assemble_vector(b, L_form)
        
        # BC 적용
        apply_lifting(b, [a_form], [[bc]], x0=[uh.x.petsc_vec])
        b.ghostUpdate(addv=PETSc.InsertMode.ADD, mode=PETSc.ScatterMode.REVERSE)
        set_bc(b, [bc], uh.x.petsc_vec, 1.0)

        # 풀이
        ksp.solve(b, uh.x.petsc_vec)
        uh.x.scatter_forward()

        # 업데이트
        u_n.x.array[:] = uh.x.array

        # 저장
        xdmf.write_function(uh, t)

        if mesh_comm.rank == 0 and (n % 10 == 0 or n == num_steps - 1):
            min_val = np.min(uh.x.array)
            max_val = np.max(uh.x.array)
            print(f"   Step {n+1:3d}/{num_steps}, t={t:.3f}, u range=[{min_val:.3e}, {max_val:.3e}]")

if mesh_comm.rank == 0:
    print("✅ Simulation complete")

`;
        } else {
            return `# ============================================
# Solve
# ============================================
problem = LinearProblem(
    a, L,
    bcs=[bc],
    petsc_options={"ksp_type": "preonly", "pc_type": "lu"},
    petsc_options_prefix="solve"
)
uh = problem.solve()
uh.name = "u"

if mesh_comm.rank == 0:
    print(f"✅ Problem solved")

`;
        }
    }

    generateErrorAnalysis(exactSolution, boundaryExpression, equation) {
        const { type, params } = equation;
        if (type === 'heat' || (type === 'custom' && params.time_dependent)) {
            return '';
        }
        if (!exactSolution) {
            return `# ============================================
# Statistics
# ============================================
solution_min = float(np.min(uh.x.array))
solution_max = float(np.max(uh.x.array))
solution_norm = float(np.linalg.norm(uh.x.array))

if mesh_comm.rank == 0:
    print(f"\\nSolution statistics:")
    print(f"  Min: {solution_min:.6e}")
    print(f"  Max: {solution_max:.6e}")
    print(f"  Norm: {solution_norm:.6e}")

`;
        } else {

        return `# ============================================
# Error Analysis
# ============================================
V2 = fem.functionspace(domain, ("Lagrange", 2))
uex = fem.Function(V2, name="u_exact")
uex.interpolate(lambda x: ${exactSolution})

# L2 error
L2_error = fem.form(ufl.inner(uh - uex, uh - uex) * ufl.dx)
error_local = fem.assemble_scalar(L2_error)
error_L2 = np.sqrt(domain.comm.allreduce(error_local, op=MPI.SUM))

# Max error
error_max = np.max(np.abs(uD.x.array - uh.x.array))

if mesh_comm.rank == 0:
    print(f"\\nError Analysis:")
    print(f"  Error_L2  : {error_L2:.2e}")
    print(f"  Error_max : {error_max:.2e}")

`; 
        }
    }

    generatePostprocess(hasExactSolution, equation) {
        const { type, params } = equation;
        if (type === 'heat' || (type === 'custom' && params.time_dependent)) {
            return '';
        }
        let code = `# ============================================
# Save Results (XDMF/HDF5)
# ============================================
with io.XDMFFile(domain.comm, filename.with_suffix(".xdmf"), "w") as xdmf:
    xdmf.write_mesh(domain)
    xdmf.write_function(uh)

`;

        code += `if mesh_comm.rank == 0:
    print(f"\\n✅ Files saved:")
    print(f"   - {filename.with_suffix('.xdmf')}")
    print(f"   - {filename.with_suffix('.h5')}")
`;

        code += `    print(f"\\n📊 To visualize in ParaView:")
    print(f"   1. Open ParaView")
    print(f"   2. File → Open → solution.xdmf")
    print(f"   3. Click 'Apply'")
    print(f"   4. Select 'u' variable")

# JSON output for web interface
import json
result = {
    "xdmf_file": str(filename.with_suffix(".xdmf")),
    "h5_file": str(filename.with_suffix(".h5")),
    "dofs": uh.x.array.size
}
`;

        if (hasExactSolution) {
            code += `result["error_L2"] = f"{error_L2:.2e}"
result["error_max"] = f"{error_max:.2e}"
`;
        } else {
            code += `result["solution_norm"] = f"{solution_norm:.2e}"
result["solution_min"] = f"{solution_min:.2e}"
result["solution_max"] = f"{solution_max:.2e}"
`;
        }

        code += `
if mesh_comm.rank == 0:
    print(json.dumps(result))
`;

        return code;
    }
}

// Export
window.FEniCSCodeGenerator = FEniCSCodeGenerator;