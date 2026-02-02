// codeGenerator.js - FEniCSx v0.10.0 검증된 템플릿 기반

class FEniCSCodeGenerator {
    constructor() {
        this.version = '0.10.0';
        this.isComplexProblem = false;
    }

    DetectComplexProblem(config) {
        if (config.equation.type === 'poisson') {
            if (this.isJStandalone(config.equation.params.source)) {
                this.isComplexProblem = true;
            }
        } else if (config.equation.type === 'heat') {
            if (this.isJStandalone(config.equation.params.source)) {
                this.isComplexProblem = true;
            }
        } else if (config.equation.type === 'helmholtz') {
            if (this.isJStandalone(config.equation.params.k)) {
                this.isComplexProblem = true;
            } else if (this.isJStandalone(config.equation.params.source)) {
                this.isComplexProblem = true;
            }
        } else if (config.equation.type === 'custom') {
            if (this.isJStandalone(config.equation.params.custom_a)) {
                this.isComplexProblem = true;
            } else if (this.isJStandalone(config.equation.params.custom_L)) {
                this.isComplexProblem = true;
            }
        }
    }

    _wrapExpr(expr) {
        if (String(expr).includes('x[')) {
            return expr;
        }
        return `np.full(x.shape[1], ${expr})`;
    }

    /**
     * 입력 문자열의 타입을 분석하는 함수
     * @param {string|number} expr - 입력값
     * @returns {object} - { isScalar, isSpatial, isComplex, isTimeDep }
     */
    _analyzeInput(expr) {
        const str = String(expr).trim();
        const isSpatial = str.includes('x[');
        const isComplex = /[0-9\.]j/.test(str);
        const isTimeDep = /(?<![a-zA-Z])t(?![a-zA-Z])/.test(str) || /(?<![a-zA-Z])dt(?![a-zA-Z])/.test(str);
        const isScalar = !isSpatial;

        return {
            isScalar,    // fem.Constant 사용 가능 여부
            isSpatial,   // ufl.SpatialCoordinate 필요 여부
            isComplex,   // PETSc ScalarType 확인용 (심화)
            isTimeDep    // 시간 루프 갱신 필요 여부
        };
    }

    /**
     * 문자열 내의 j가 문자나 숫자와 붙어있는지 확인하는 함수
     * @param {string} text - 검사할 문자열
     * @returns {boolean} - j가 독립적이면 true, 문자/숫자와 붙어있으면 false
     */
    isJStandalone(text) {
        if (!text) return false;

        // 1. j가 아예 없으면 false 반환
        if (!text.toLowerCase().includes('j')) {
            return false;
        }

        // 2. j가 영문자(a-z, A-Z) 바로 앞이나 뒤에 붙어있는지 검사
        // [a-z]j : aj, bj, oj ... (변수명처럼 보임)
        // j[a-z] : ja, jb, jo ... (변수명처럼 보임)
        // (숫자 0-9는 정규식에서 뺐으므로 1j, 2j 등은 이 패턴에 걸리지 않음 -> 통과)
        const attachedToLetterPattern = /[a-zA-Z]j|j[a-zA-Z]/i;

        // 영문자와 붙어있다면(변수명이면) false, 아니면(독립적이거나 숫자 옆이면) true
        return !attachedToLetterPattern.test(text);
    }

    /**
     * 값을 복소수 형식으로 변환
     */
    _toComplexValue(value) {
        if (typeof value === 'string') {
            // 이미 복소수 형식인지 체크 (예: "1+2j", "3.0+1.5j")
            if (value.includes('j') || value.includes('J')) {
                return value;
            }
            // 수식인 경우 그대로 반환
            if (value.includes('x[') || value.includes('ufl.')) {
                return value;
            }
        }
        // 실수를 복소수로 변환
        return `${value}+0j`;
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
        this.DetectComplexProblem(config);
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
                let radius = meshConfig.radius || 0.5;
                let center = meshConfig.center || [0.5, 0.5];
                code += `# 2D Circle: center (${center[0]}, ${center[1]}), radius ${radius}
circle = gmsh.model.occ.addDisk(${center[0]}, ${center[1]}, 0.0, ${radius}, ${radius})
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

        if (elemType === 'quad' || elemType === 'hexa') {
            code += `
# Element Type: Quadrilateral (2D) or Hexahedron (3D)
gmsh.option.setNumber("Mesh.RecombineAll", 1)
gmsh.option.setNumber("Mesh.Algorithm", 8) # Frontal-Delaunay for Quads
`;
            // 3D Hexa의 경우 추가 알고리즘 설정이 도움이 될 수 있음
            if (dimension === '3d') {
                code += `gmsh.option.setNumber("Mesh.Algorithm3D", 1) # 3D Delaunay\n`;
            }
        } else {
            code += `
# Element Type: Triangle (2D) or Tetrahedron (3D)
gmsh.option.setNumber("Mesh.RecombineAll", 0)
gmsh.option.setNumber("Mesh.Algorithm", 6) # Frontal-Delaunay
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
        if (!this.isComplexProblem) { // 실수 영역 계산
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
uD.interpolate(lambda x: ${this._wrapExpr(expression)})
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
        } else { //복소수 영역 계산의 경우
            if (equation.type === 'heat' || (equation.type === 'custom' && equation.params.time_dependent)) {
                const initial = equation.params.initial || 0;
                const safeInitial = this._wrapExpr(initial);
                code +=`
u_n = fem.Function(V, name="u_n")
u_n.interpolate(lambda x: np.full(x.shape[1], ${safeInitial}, dtype=np.complex128))

uh = fem.Function(V, name="u")
uh.x.array[:] = u_n.x.array

uD = fem.Function(V)
`;
            } else {
                code +=`
uD = fem.Function(V)
uD.interpolate(lambda x: np.full(x.shape[1], ${this._wrapExpr(expression)}, dtype=np.complex128))
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
bc = fem.dirichletbc(np.complex128(0), boundary_dofs, V)
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
    }

    generateWeakForm(equation) {
        const { type, params } = equation;

        let code = `# ============================================
# Weak Formulation
# ============================================
u = ufl.TrialFunction(V)
v = ufl.TestFunction(V)

`;  
        if (!this.isComplexProblem) { // 실수 영역 계산
            const generateSourceTerm = (sourceVal) => {
                const analysis = this._analyzeInput(sourceVal);
                
                if (analysis.isSpatial) {
                    // [Case 1] 공간 변수(x)가 포함된 식 -> UFL Expression 사용
                    return `# Source term 'f' is a spatial expression
x = ufl.SpatialCoordinate(domain)
#Q = fem.functionspace(domain, ("Lagrange", 5))
f = ${sourceVal}
`;
                } else {
                    // [Case 2] 단순 상수 -> fem.Constant 사용
                    // 혹시 모를 배열 입력 방지를 위해 _wrapExpr 대신 단순 문자열 처리
                    return `# Source term 'f' is a constant
f = fem.Constant(domain, default_scalar_type(${sourceVal}))
`;
                }
            };

            if (type === 'poisson') {
                const source = params.source || 0;
                code += `# Poisson: -∇²u = f
    ${generateSourceTerm(source)}

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
${generateSourceTerm(source)}
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
${generateSourceTerm(source)}
k = fem.Constant(domain, default_scalar_type(${k}))

a = (ufl.dot(ufl.grad(u), ufl.grad(v)) + k**2 * u * v) * ufl.dx
L = f * v * ufl.dx
`;
                    } else {
                        const source = params.source || 0;
                        // custom
                        code += `# Custom weak form
${generateSourceTerm(source)}
${params.custom_a || 'a = ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx'}
${params.custom_L || 'L = fem.Constant(domain, default_scalar_type(0)) * v * ufl.dx'}
`;
                    }

                    return code + '\n';
                } else { // 복소수 영역 계산의 경우
            const generateSourceTerm = (sourceVal) => {
                const analysis = this._analyzeInput(sourceVal);
                
                if (analysis.isSpatial) {
                    // [Case 1] 공간 변수(x)가 포함된 식 -> UFL Expression 사용
                    return `# Source term 'f' is a spatial expression (complex)
x = ufl.SpatialCoordinate(domain)
f = ${sourceVal}
`;
                } else {
                    // [Case 2] 단순 상수 -> fem.Constant 사용 (복소수)
                    const complexValue = this._toComplexValue(sourceVal);
                    return `# Source term 'f' is a constant (complex)
f = fem.Constant(domain, np.complex128(${complexValue}))
`;
                }
            };

            if (type === 'poisson') {
                const source = params.source || 0;
                code += `# Poisson: -∇²u = f (Complex domain)
${generateSourceTerm(source)}

a = ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx
L = f * v * ufl.dx
`;
            } else if (type === 'heat') {
                const source = params.source || 0;
                const T = params.T || 1.0;
                const dt = params.dt || 0.01;

                code += `# Heat: ∂u/∂t - ∇²u = f (Backward Euler, Complex)
${generateSourceTerm(source)}
dt = np.complex128(${dt})
t = 0.0
T = ${T}
num_steps = int(T / dt.real)

a = (u / dt) * v * ufl.dx + ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx
L = (u_n / dt + f) * v * ufl.dx
`;
            } else if (type === 'helmholtz') {
                const source = params.source || 0;
                const k = params.k || 1.0;
                const complexK = this._toComplexValue(k);
                code += `# Helmholtz: -∇²u + k²u = f (Complex domain)
${generateSourceTerm(source)}
k = fem.Constant(domain, np.complex128(${complexK}))

a = (ufl.dot(ufl.grad(u), ufl.grad(v)) + k**2 * u * v) * ufl.dx
L = f * v * ufl.dx
`;
            } else {
                const source = params.source || 0;
                // custom
                code += `# Custom weak form (Complex domain)
${generateSourceTerm(source)}
${params.custom_a || 'a = ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx'}
${params.custom_L || 'L = fem.Constant(domain, np.complex128(0)) * v * ufl.dx'}
`;
            }
            return code + '\n';
        }
    }

    generateSolver(equation) {
        const { type, params } = equation;
        if (!this.isComplexProblem) { // 실수 영역 계산
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
        } else { // 복소수 영역 계산
            if (type === 'heat' || (type === 'custom' && params.time_dependent)) {
                return `# ============================================
# Solve (Complex Time-Dependent)
# ============================================
# Form 컴파일
a_form = fem.form(a)
L_form = fem.form(L)

# ---------------------------
# 행렬 및 벡터 사전 조립
# ---------------------------
A = assemble_matrix(a_form, bcs=[bc])
A.assemble()

b = assemble_vector(L_form)

# KSP 솔버 설정 (복소수 지원)
ksp = PETSc.KSP().create(domain.comm)
ksp.setOperators(A)
ksp.setType("gmres")  # 복소수는 GMRES 권장
ksp.getPC().setType("ilu")  # ILU preconditioner
ksp.setTolerances(rtol=1e-10)
ksp.setFromOptions()

# ---------------------------
# 시간 루프
# ---------------------------
# 실수부와 허수부 저장을 위한 함수 생성
uh_real = fem.Function(V)
uh_imag = fem.Function(V)

with io.XDMFFile(domain.comm, filename.with_suffix("_real.xdmf"), "w") as xdmf_real, \\
     io.XDMFFile(domain.comm, filename.with_suffix("_imag.xdmf"), "w") as xdmf_imag:
    
    xdmf_real.write_mesh(domain)
    xdmf_imag.write_mesh(domain)
    
    # 초기 조건 저장
    uh_real.x.array[:] = uh.x.array.real
    uh_imag.x.array[:] = uh.x.array.imag
    uh_real.name = "u_real"
    uh_imag.name = "u_imag"
    
    xdmf_real.write_function(uh_real, t)
    xdmf_imag.write_function(uh_imag, t)

    if mesh_comm.rank == 0:
        print(f"✅ Time loop started (T={T}, dt={dt:.4f})")

    for n in range(num_steps):
        t += dt

        # RHS 벡터 리셋
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

        # 실수부/허수부 분리 저장
        uh_real.x.array[:] = uh.x.array.real
        uh_imag.x.array[:] = uh.x.array.imag
        
        xdmf_real.write_function(uh_real, t)
        xdmf_imag.write_function(uh_imag, t)

        if mesh_comm.rank == 0 and (n % 10 == 0 or n == num_steps - 1):
            min_real = np.min(uh.x.array.real)
            max_real = np.max(uh.x.array.real)
            min_imag = np.min(uh.x.array.imag)
            max_imag = np.max(uh.x.array.imag)
            magnitude = np.linalg.norm(uh.x.array)
            print(f"   Step {n+1:3d}/{num_steps}, t={t:.3f}")
            print(f"      Real: [{min_real:.3e}, {max_real:.3e}]")
            print(f"      Imag: [{min_imag:.3e}, {max_imag:.3e}]")
            print(f"      |u|: {magnitude:.3e}")

if mesh_comm.rank == 0:
    print("✅ Simulation complete")
    print(f"📁 Output files:")
    print(f"   - {filename.with_suffix('_real.xdmf')} (Real part)")
    print(f"   - {filename.with_suffix('_imag.xdmf')} (Imaginary part)")

`;
            } else {
                return `# ============================================
# Solve (Complex Static)
# ============================================
problem = LinearProblem(
    a, L,
    bcs=[bc],
    petsc_options={"ksp_type": "gmres", "pc_type": "ilu", "ksp_rtol": 1e-10},
    petsc_options_prefix="solve"
)
uh = problem.solve()
uh.name = "u"

if mesh_comm.rank == 0:
    print(f"✅ Problem solved")

# ---------------------------
# 복소수 결과 분리 저장
# ---------------------------
uh_real = fem.Function(V)
uh_imag = fem.Function(V)
uh_abs = fem.Function(V)

uh_real.x.array[:] = uh.x.array.real
uh_imag.x.array[:] = uh.x.array.imag
uh_abs.x.array[:] = np.abs(uh.x.array)

uh_real.name = "u_real"
uh_imag.name = "u_imag"
uh_abs.name = "u_magnitude"

# 실수부 저장
with io.XDMFFile(domain.comm, filename.with_suffix("_real.xdmf"), "w") as xdmf:
    xdmf.write_mesh(domain)
    xdmf.write_function(uh_real)

# 허수부 저장
with io.XDMFFile(domain.comm, filename.with_suffix("_imag.xdmf"), "w") as xdmf:
    xdmf.write_mesh(domain)
    xdmf.write_function(uh_imag)

# 절댓값 저장
with io.XDMFFile(domain.comm, filename.with_suffix("_abs.xdmf"), "w") as xdmf:
    xdmf.write_mesh(domain)
    xdmf.write_function(uh_abs)

if mesh_comm.rank == 0:
    print(f"📁 Output files:")
    print(f"   - {filename.with_suffix('_real.xdmf')} (Real part)")
    print(f"   - {filename.with_suffix('_imag.xdmf')} (Imaginary part)")
    print(f"   - {filename.with_suffix('_abs.xdmf')} (Magnitude)")

`;
            }
        }
    }

    generateErrorAnalysis(exactSolution, boundaryExpression, equation) {
        const { type, params } = equation;
        if (!this.isComplexProblem) { // 실수 영역 계산
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
        } else { // 복소수 영역 계산의 경우
            if (type === 'heat' || (type === 'custom' && params.time_dependent)) {
                return ''; // Time-dependent는 시간 루프에서 이미 통계 출력
            }
            
            if (!exactSolution) {
                return `# ============================================
# Statistics (Complex)
# ============================================
solution_real_min = float(np.min(uh.x.array.real))
solution_real_max = float(np.max(uh.x.array.real))
solution_imag_min = float(np.min(uh.x.array.imag))
solution_imag_max = float(np.max(uh.x.array.imag))
solution_abs_min = float(np.min(np.abs(uh.x.array)))
solution_abs_max = float(np.max(np.abs(uh.x.array)))
solution_norm = float(np.linalg.norm(uh.x.array))

if mesh_comm.rank == 0:
    print(f"\\nSolution statistics (Complex):")
    print(f"  Real part:")
    print(f"    Min: {solution_real_min:.6e}")
    print(f"    Max: {solution_real_max:.6e}")
    print(f"  Imaginary part:")
    print(f"    Min: {solution_imag_min:.6e}")
    print(f"    Max: {solution_imag_max:.6e}")
    print(f"  Magnitude:")
    print(f"    Min: {solution_abs_min:.6e}")
    print(f"    Max: {solution_abs_max:.6e}")
    print(f"  L2 Norm: {solution_norm:.6e}")

`;
            } else {
                return `# ============================================
# Error Analysis (Complex)
# ============================================
V2 = fem.functionspace(domain, ("Lagrange", 2))
uex = fem.Function(V2, name="u_exact")
uex.interpolate(lambda x: np.full(x.shape[1], ${exactSolution}, dtype=np.complex128))

# L2 error (복소수)
L2_error = fem.form(ufl.inner(uh - uex, ufl.conj(uh - uex)) * ufl.dx)
error_local = fem.assemble_scalar(L2_error)
error_L2 = np.sqrt(domain.comm.allreduce(error_local.real, op=MPI.SUM))

# Max error (magnitude)
error_max = np.max(np.abs(uh.x.array - uex.x.array))

# Real part error
error_real = np.linalg.norm(uh.x.array.real - uex.x.array.real)

# Imaginary part error
error_imag = np.linalg.norm(uh.x.array.imag - uex.x.array.imag)

if mesh_comm.rank == 0:
    print(f"\\nError Analysis (Complex):")
    print(f"  L2 Error (magnitude) : {error_L2:.2e}")
    print(f"  Max Error (magnitude): {error_max:.2e}")
    print(f"  Real part L2 error   : {error_real:.2e}")
    print(f"  Imag part L2 error   : {error_imag:.2e}")

`;
            }
        }
    }

    generatePostprocess(hasExactSolution, equation) {
        const { type, params } = equation;
        if (!this.isComplexProblem) { // 실수 영역 계산
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
        } else { // 복소수 영역 계산의 경우
            if (type === 'heat' || (type === 'custom' && params.time_dependent)) {
                return ''; // Time-dependent는 이미 루프에서 저장됨
            }
    
            let code = `# ============================================
# Save Results (XDMF/HDF5) - Complex Domain
# ============================================
# ParaView는 복소수를 직접 표시할 수 없으므로 실수부/허수부/절댓값을 분리 저장

# 실수부 저장
with io.XDMFFile(domain.comm, filename.with_suffix("_real.xdmf"), "w") as xdmf:
    xdmf.write_mesh(domain)
    xdmf.write_function(uh_real)

# 허수부 저장
with io.XDMFFile(domain.comm, filename.with_suffix("_imag.xdmf"), "w") as xdmf:
    xdmf.write_mesh(domain)
    xdmf.write_function(uh_imag)

# 절댓값 저장
with io.XDMFFile(domain.comm, filename.with_suffix("_abs.xdmf"), "w") as xdmf:
    xdmf.write_mesh(domain)
    xdmf.write_function(uh_abs)

`;

            code += `if mesh_comm.rank == 0:
    print(f"\\n✅ Files saved (Complex domain):")
    print(f"   Real part:")
    print(f"     - {filename.with_suffix('_real.xdmf')}")
    print(f"     - {filename.with_suffix('_real.h5')}")
    print(f"   Imaginary part:")
    print(f"     - {filename.with_suffix('_imag.xdmf')}")
    print(f"     - {filename.with_suffix('_imag.h5')}")
    print(f"   Magnitude:")
    print(f"     - {filename.with_suffix('_abs.xdmf')}")
    print(f"     - {filename.with_suffix('_abs.h5')}")
`;

            code += `    print(f"\\n📊 To visualize in ParaView:")
    print(f"   1. Open ParaView")
    print(f"   2. File → Open → Select one of:")
    print(f"      - solution_real.xdmf (Real part)")
    print(f"      - solution_imag.xdmf (Imaginary part)")
    print(f"      - solution_abs.xdmf (Magnitude)")
    print(f"   3. Click 'Apply'")
    print(f"   4. Select 'u_real', 'u_imag', or 'u_magnitude' variable")

# JSON output for web interface
import json
result = {
    "xdmf_file_real": str(filename.with_suffix("_real.xdmf")),
    "xdmf_file_imag": str(filename.with_suffix("_imag.xdmf")),
    "xdmf_file_abs": str(filename.with_suffix("_abs.xdmf")),
    "h5_file_real": str(filename.with_suffix("_real.h5")),
    "h5_file_imag": str(filename.with_suffix("_imag.h5")),
    "h5_file_abs": str(filename.with_suffix("_abs.h5")),
    "dofs": uh.x.array.size,
    "is_complex": True
}
`;

            if (hasExactSolution) {
                code += `result["error_L2"] = f"{error_L2:.2e}"
result["error_max"] = f"{error_max:.2e}"
result["error_real"] = f"{error_real:.2e}"
result["error_imag"] = f"{error_imag:.2e}"
`;
            } else {
                code += `result["solution_norm"] = f"{solution_norm:.2e}"
result["solution_real_min"] = f"{solution_real_min:.2e}"
result["solution_real_max"] = f"{solution_real_max:.2e}"
result["solution_imag_min"] = f"{solution_imag_min:.2e}"
result["solution_imag_max"] = f"{solution_imag_max:.2e}"
result["solution_abs_min"] = f"{solution_abs_min:.2e}"
result["solution_abs_max"] = f"{solution_abs_max:.2e}"
`;
    }

            code += `
if mesh_comm.rank == 0:
    print(json.dumps(result))
`;

            return code;
        }
    }
}

// Export
window.FEniCSCodeGenerator = FEniCSCodeGenerator;