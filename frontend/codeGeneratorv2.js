// codeGenerator_v2.js - FEniCSx v0.10.0 (4-class architecture)
// 선형/비선형 × 정상/비정상 = 4가지 클래스

// ============================================
// Base Class: 공통 기능
// ============================================
class FEniCSCodeGeneratorBase {
    constructor() {
        this.version = '0.10.0';
    }

    _wrapExpr(expr) {
        if (String(expr).includes('x[')) {
            return expr;
        }
        return `np.full(x.shape[1], ${expr})`;
    }

    _wrapExprForSource(expr) {
        if (String(expr).includes('x[')) {
            return expr;
        }
        return `fem.Constant(domain, default_scalar_type(${expr}))`;
    }

    generateHeader(isTimeDependent) {
        if (isTimeDependent) {
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

`;
        } else {
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

`;
        }
    }

    generateGmshMesh(dimension, meshConfig) {
        const { shape, lc, elemType } = meshConfig;
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
                const cx = meshConfig.center ? meshConfig.center[0] : 0.5;
                const cy = meshConfig.center ? meshConfig.center[1] : 0.5;
                const r = meshConfig.radius || 0.5;
                code += `# 2D Circle: center (${cx}, ${cy}), radius ${r}
circle = gmsh.model.occ.addDisk(${cx}, ${cy}, 0.0, ${r}, ${r})
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
poly_points = []
`;
                points.forEach((pt) => {
                    code += `poly_points.append(gmsh.model.geo.addPoint(${pt[0]}, ${pt[1]}, 0.0, ${characteristicLength}))\n`;
                });

                code += `
poly_lines = []
for i in range(len(poly_points)):
    p_start = poly_points[i]
    p_end = poly_points[(i + 1) % len(poly_points)]
    poly_lines.append(gmsh.model.geo.addLine(p_start, p_end))

curve_loop = gmsh.model.geo.addCurveLoop(poly_lines)
plane_surface = gmsh.model.geo.addPlaneSurface([curve_loop])

gmsh.model.geo.synchronize()

gdim = 2
gmsh.model.addPhysicalGroup(gdim, [plane_surface], 1)
gmsh.model.setPhysicalName(gdim, 1, "Domain")
`;
            } else {
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
                const cx = meshConfig.center ? meshConfig.center[0] : 0.5;
                const cy = meshConfig.center ? meshConfig.center[1] : 0.5;
                const cz = meshConfig.center ? meshConfig.center[2] : 0.5;
                const r = meshConfig.radius || 0.5;

                code += `# 3D Sphere: center (${cx}, ${cy}, ${cz}), radius ${r}
sphere = gmsh.model.occ.addSphere(${cx}, ${cy}, ${cz}, ${r})
gmsh.model.occ.synchronize()
gdim = 3
gmsh.model.addPhysicalGroup(gdim, [sphere], 1)
gmsh.model.setPhysicalName(gdim, 1, "Domain")
`;
            } else {
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

        if (elemType === 'quad' || elemType === 'hexa') {
            code += `
# Element Type: Quadrilateral (2D) or Hexahedron (3D)
gmsh.option.setNumber("Mesh.RecombineAll", 1)
gmsh.option.setNumber("Mesh.Algorithm", 8)
`;
            if (dimension === '3d') {
                code += `gmsh.option.setNumber("Mesh.Algorithm3D", 1)\n`;
            }
        } else {
            code += `
# Element Type: Triangle (2D) or Tetrahedron (3D)
gmsh.option.setNumber("Mesh.RecombineAll", 0)
gmsh.option.setNumber("Mesh.Algorithm", 6)
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
x = ufl.SpatialCoordinate(domain)

`;
    }

    generateBoundaryCondition(dimension, bc, isTimeDependent, initial) {
        const { expression } = bc;
        const safeExpression = this._wrapExpr(expression);

        let code = `# ============================================
# Boundary Conditions
# ============================================
`;
        if (isTimeDependent) {
            const safeInitial = this._wrapExpr(initial || 0);
            code += `
u_n = fem.Function(V, name="u_n")
u_n.interpolate(lambda x: ${safeInitial})

uh = fem.Function(V, name="u")
uh.x.array[:] = u_n.x.array

uD = fem.Function(V)
uD.interpolate(lambda x: ${safeExpression})
`;
        } else {
            code += `
uD = fem.Function(V)
uD.interpolate(lambda x: ${safeExpression})
`;
        }

        if (dimension === '1d') {
            code += `# 1D: Fix both endpoints
def boundary(x):
    return np.logical_or(np.isclose(x[0], 0.0), np.isclose(x[0], 1.0))

boundary_dofs = fem.locate_dofs_geometrical(V, boundary)
bc = fem.dirichletbc(uD, boundary_dofs)
`;
        } else {
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
}

// ============================================
// Class 1: 정상 선형 (Steady Linear)
// ============================================
class SteadyLinearGenerator extends FEniCSCodeGeneratorBase {
    generate(config) {
        let code = this.generateHeader(false);
        code += this.generateGmshMesh(config.dimension, config.mesh);
        code += this.generateFunctionSpace(config.functionSpace);
        code += this.generateBoundaryCondition(config.dimension, config.boundaryCondition, false, null);
        code += this.generateWeakForm(config.equation);
        code += this.generateSolver();
        code += this.generateErrorAnalysis(config.exactSolution);
        code += this.generatePostprocess(!!config.exactSolution);
        return code;
    }

    generateWeakForm(equation) {
        const { type, params } = equation;

        let code = `# ============================================
# Weak Formulation (Steady Linear)
# ============================================
u = ufl.TrialFunction(V)
v = ufl.TestFunction(V)

`;

        if (type === 'poisson') {
            const source = params.source || 0;
            code += `# Poisson: -∇²u = f
f = ${this._wrapExprForSource(source)}

a = ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx
L = f * v * ufl.dx
`;
        } else if (type === 'helmholtz') {
            const source = params.source || 0;
            const k = params.k || 1.0;
            code += `# Helmholtz: -∇²u + k²u = f
f = ${this._wrapExprForSource(source)}
k = fem.Constant(domain, default_scalar_type(${k}))

a = (ufl.dot(ufl.grad(u), ufl.grad(v)) + k**2 * u * v) * ufl.dx
L = f * v * ufl.dx
`;
        } else {
            const source = params.source || 0;
            code += `# Custom weak form (Linear)
f = ${this._wrapExprForSource(source)}
${params.custom_a || 'a = ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx'}
${params.custom_L || 'L = f * v * ufl.dx'}
`;
        }

        return code + '\n';
    }

    generateSolver() {
        return `# ============================================
# Solve (Linear Problem)
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

    generateErrorAnalysis(exactSolution) {
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

    generatePostprocess(hasExactSolution) {
        let code = `# ============================================
# Save Results (XDMF/HDF5)
# ============================================
with io.XDMFFile(domain.comm, filename.with_suffix(".xdmf"), "w") as xdmf:
    xdmf.write_mesh(domain)
    xdmf.write_function(uh)

if mesh_comm.rank == 0:
    print(f"\\n✅ Files saved:")
    print(f"   - {filename.with_suffix('.xdmf')}")
    print(f"   - {filename.with_suffix('.h5')}")
    print(f"\\n📊 To visualize in ParaView:")
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

// ============================================
// Class 2: 비정상 선형 (Time-dependent Linear)
// ============================================
class TimeDependentLinearGenerator extends FEniCSCodeGeneratorBase {
    generate(config) {
        let code = this.generateHeader(true);
        code += this.generateTimeSettings(config.equation);
        code += this.generateGmshMesh(config.dimension, config.mesh);
        code += this.generateFunctionSpace(config.functionSpace);
        code += this.generateBoundaryCondition(config.dimension, config.boundaryCondition, true, config.equation.params.initial);
        code += this.generateWeakForm(config.equation);
        code += this.generateSolver(config.equation);
        return code;
    }

    generateTimeSettings(equation) {
        const { params } = equation;
        const T = params.T || 1.0;
        const dt = params.dt || 0.01;

        return `# Time-dependent settings
t = 0.0
T = ${T}
dt = ${dt}
num_steps = int(T / dt)

`;
    }

    generateWeakForm(equation) {
        const { type, params } = equation;

        let code = `# ============================================
# Weak Formulation (Time-dependent Linear)
# ============================================
u = ufl.TrialFunction(V)
v = ufl.TestFunction(V)

`;

        if (type === 'heat') {
            const source = params.source || 0;
            code += `# Heat: ∂u/∂t - ∇²u = f (Backward Euler)
f = ${this._wrapExprForSource(source)}

a = (u / dt) * v * ufl.dx + ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx
L = (u_n / dt + f) * v * ufl.dx
`;
        } else {
            const source = params.source || 0;
            code += `# Custom time-dependent weak form (Linear)
f = ${this._wrapExprForSource(source)}
${params.custom_a || 'a = (u / dt) * v * ufl.dx + ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx'}
${params.custom_L || 'L = (u_n / dt + f) * v * ufl.dx'}
`;
        }

        return code + '\n';
    }

    generateSolver(equation) {
        return `# ============================================
# Solve (Time-stepping with KSP)
# ============================================
# Form compilation
a_form = fem.form(a)
L_form = fem.form(L)

# Assemble matrix (constant in time)
A = assemble_matrix(a_form, bcs=[bc])
A.assemble()

# Create vector
b = assemble_vector(L_form)

# KSP solver setup
ksp = PETSc.KSP().create(domain.comm)
ksp.setOperators(A)
ksp.setType("cg")
ksp.getPC().setType("gamg")
ksp.setTolerances(rtol=1e-10)
ksp.setFromOptions()

# Time loop
with io.XDMFFile(domain.comm, filename.with_suffix(".xdmf"), "w") as xdmf:
    xdmf.write_mesh(domain)
    xdmf.write_function(uh, t)

    if mesh_comm.rank == 0:
        print(f"✅ Time loop started (T={T}, dt={dt:.4f})")

    for n in range(num_steps):
        t += dt

        # Reset RHS vector
        with b.localForm() as loc:
            loc.set(0)
        
        # Reassemble RHS
        assemble_vector(b, L_form)
        
        # Apply BC
        apply_lifting(b, [a_form], [[bc]], x0=[uh.x.petsc_vec])
        b.ghostUpdate(addv=PETSc.InsertMode.ADD, mode=PETSc.ScatterMode.REVERSE)
        set_bc(b, [bc], uh.x.petsc_vec, 1.0)

        # Solve
        ksp.solve(b, uh.x.petsc_vec)
        uh.x.scatter_forward()

        # Update
        u_n.x.array[:] = uh.x.array

        # Save
        xdmf.write_function(uh, t)

        if mesh_comm.rank == 0 and (n % 10 == 0 or n == num_steps - 1):
            min_val = np.min(uh.x.array)
            max_val = np.max(uh.x.array)
            print(f"   Step {n+1:3d}/{num_steps}, t={t:.3f}, u range=[{min_val:.3e}, {max_val:.3e}]")

if mesh_comm.rank == 0:
    print("\\n✅ Simulation complete")
    print(f"\\n📁 Files saved:")
    print(f"   - {filename.with_suffix('.xdmf')}")
    print(f"   - {filename.with_suffix('.h5')}")

# JSON output
import json
result = {
    "xdmf_file": str(filename.with_suffix(".xdmf")),
    "h5_file": str(filename.with_suffix(".h5")),
    "dofs": uh.x.array.size,
    "num_steps": num_steps,
    "final_time": t
}

if mesh_comm.rank == 0:
    print(json.dumps(result))
`;
    }
}

// ============================================
// Class 3: 정상 비선형 (Steady Nonlinear)
// ============================================
class SteadyNonlinearGenerator extends FEniCSCodeGeneratorBase {
    generate(config) {
        let code = this.generateHeader(false);
        code += this.generateNonlinearImports();
        code += this.generateGmshMesh(config.dimension, config.mesh);
        code += this.generateFunctionSpace(config.functionSpace);
        code += this.generateBoundaryCondition(config.dimension, config.boundaryCondition, false, null);
        code += this.generateWeakForm(config.equation);
        code += this.generateSolver();
        code += this.generateErrorAnalysis(config.exactSolution);
        code += this.generatePostprocess(!!config.exactSolution);
        return code;
    }

    generateNonlinearImports() {
        return `# Nonlinear solver imports
from dolfinx.fem.petsc import NonlinearProblem
from dolfinx.nls.petsc import NewtonSolver

`;
    }

    generateWeakForm(equation) {
        const { params } = equation;

        let code = `# ============================================
# Weak Formulation (Steady Nonlinear)
# ============================================
uh = fem.Function(V, name="u")
v = ufl.TestFunction(V)

`;

        const source = params.source || 0;
        code += `# Nonlinear problem: F(u) = 0
f = ${this._wrapExprForSource(source)}
${params.custom_F || 'F = ufl.dot(ufl.grad(uh), ufl.grad(v)) * ufl.dx - f * v * ufl.dx'}
`;

        return code + '\n';
    }

    generateSolver() {
        return `# ============================================
# Solve (Newton Solver)
# ============================================
problem = NonlinearProblem(F, uh, bcs=[bc])
solver = NewtonSolver(MPI.COMM_WORLD, problem)
solver.convergence_criterion = "incremental"
solver.rtol = 1e-6
solver.max_it = 50

if mesh_comm.rank == 0:
    print("✅ Starting Newton solver...")

n_iterations, converged = solver.solve(uh)

if mesh_comm.rank == 0:
    if converged:
        print(f"✅ Newton solver converged in {n_iterations} iterations")
    else:
        print(f"⚠️  Newton solver did not converge")

`;
    }

    generateErrorAnalysis(exactSolution) {
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
error_max = np.max(np.abs(uex.x.array - uh.x.array))

if mesh_comm.rank == 0:
    print(f"\\nError Analysis:")
    print(f"  Error_L2  : {error_L2:.2e}")
    print(f"  Error_max : {error_max:.2e}")

`;
        }
    }

    generatePostprocess(hasExactSolution) {
        let code = `# ============================================
# Save Results (XDMF/HDF5)
# ============================================
with io.XDMFFile(domain.comm, filename.with_suffix(".xdmf"), "w") as xdmf:
    xdmf.write_mesh(domain)
    xdmf.write_function(uh)

if mesh_comm.rank == 0:
    print(f"\\n✅ Files saved:")
    print(f"   - {filename.with_suffix('.xdmf')}")
    print(f"   - {filename.with_suffix('.h5')}")

# JSON output
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

// ============================================
// Class 4: 비정상 비선형 (Time-dependent Nonlinear)
// ============================================
class TimeDependentNonlinearGenerator extends FEniCSCodeGeneratorBase {
    generate(config) {
        let code = this.generateHeader(true);
        code += this.generateNonlinearImports();
        code += this.generateTimeSettings(config.equation);
        code += this.generateGmshMesh(config.dimension, config.mesh);
        code += this.generateFunctionSpace(config.functionSpace);
        code += this.generateBoundaryCondition(config.dimension, config.boundaryCondition, true, config.equation.params.initial);
        code += this.generateWeakForm(config.equation);
        code += this.generateSolver(config.equation);
        return code;
    }

    generateNonlinearImports() {
        return `# Nonlinear solver imports
from dolfinx.fem.petsc import NonlinearProblem
from dolfinx.nls.petsc import NewtonSolver

`;
    }

    generateTimeSettings(equation) {
        const { params } = equation;
        const T = params.T || 1.0;
        const dt = params.dt || 0.01;

        return `# Time-dependent settings
t = 0.0
T = ${T}
dt = ${dt}
num_steps = int(T / dt)

`;
    }

    generateWeakForm(equation) {
        const { params } = equation;

        let code = `# ============================================
# Weak Formulation (Time-dependent Nonlinear)
# ============================================
uh = fem.Function(V, name="u")
uh.x.array[:] = u_n.x.array
v = ufl.TestFunction(V)

`;

        const source = params.source || 0;
        code += `# Time-dependent nonlinear problem: F(u) = 0
f = ${this._wrapExprForSource(source)}
${params.custom_F || 'F = ((uh - u_n) / dt) * v * ufl.dx + ufl.dot(ufl.grad(uh), ufl.grad(v)) * ufl.dx - f * v * ufl.dx'}
`;

        return code + '\n';
    }

    generateSolver(equation) {
        return `# ============================================
# Solve (Time-stepping with Newton)
# ============================================
problem = NonlinearProblem(F, uh, bcs=[bc])
solver = NewtonSolver(MPI.COMM_WORLD, problem)
solver.convergence_criterion = "incremental"
solver.rtol = 1e-6
solver.max_it = 50

# Time loop
with io.XDMFFile(domain.comm, filename.with_suffix(".xdmf"), "w") as xdmf:
    xdmf.write_mesh(domain)
    xdmf.write_function(uh, t)

    if mesh_comm.rank == 0:
        print(f"✅ Time loop started (T={T}, dt={dt:.4f})")

    for n in range(num_steps):
        t += dt

        # Solve nonlinear problem
        n_iterations, converged = solver.solve(uh)

        if not converged:
            if mesh_comm.rank == 0:
                print(f"⚠️  Newton did not converge at t={t:.3f}")

        # Update
        u_n.x.array[:] = uh.x.array

        # Save
        xdmf.write_function(uh, t)

        if mesh_comm.rank == 0 and (n % 10 == 0 or n == num_steps - 1):
            min_val = np.min(uh.x.array)
            max_val = np.max(uh.x.array)
            print(f"   Step {n+1:3d}/{num_steps}, t={t:.3f}, Newton iters={n_iterations}, u range=[{min_val:.3e}, {max_val:.3e}]")

if mesh_comm.rank == 0:
    print("\\n✅ Simulation complete")
    print(f"\\n📁 Files saved:")
    print(f"   - {filename.with_suffix('.xdmf')}")
    print(f"   - {filename.with_suffix('.h5')}")

# JSON output
import json
result = {
    "xdmf_file": str(filename.with_suffix(".xdmf")),
    "h5_file": str(filename.with_suffix(".h5")),
    "dofs": uh.x.array.size,
    "num_steps": num_steps,
    "final_time": t
}

if mesh_comm.rank == 0:
    print(json.dumps(result))
`;
    }
}

// ============================================
// Main Generator Factory
// ============================================
class FEniCSCodeGenerator {
    constructor() {
        this.version = '0.10.0';
    }

    generate(config) {
        const { type, params } = config.equation;
        
        // 시간 의존성 판단
        const isTimeDependent = 
            type === 'heat' || 
            (type === 'custom' && params.time_dependent);
        
        // 비선형성 판단
        const isNonlinear = 
            (type === 'custom' && params.pdeType === 'nonlinear');
        
        // 적절한 generator 선택
        let generator;
        if (isTimeDependent && isNonlinear) {
            generator = new TimeDependentNonlinearGenerator();
        } else if (isTimeDependent && !isNonlinear) {
            generator = new TimeDependentLinearGenerator();
        } else if (!isTimeDependent && isNonlinear) {
            generator = new SteadyNonlinearGenerator();
        } else {
            generator = new SteadyLinearGenerator();
        }
        
        if (config.mesh_comm && config.mesh_comm.rank === 0) {
            console.log(`✅ Using generator: ${generator.constructor.name}`);
        }
        
        return generator.generate(config);
    }
}

// Export
window.FEniCSCodeGenerator = FEniCSCodeGenerator;