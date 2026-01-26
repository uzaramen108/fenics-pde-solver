# solver.py - FEniCSx PDE 솔버 (수정 버전)

import sys
import json
from mpi4py import MPI
from dolfinx import mesh, fem, default_scalar_type
from dolfinx.fem.petsc import LinearProblem
import numpy as np
import ufl
from dolfinx import io
from pathlib import Path
import traceback

def log(message):
    """디버깅 로그 (stderr로 출력)"""
    print(f"[SOLVER] {message}", file=sys.stderr, flush=True)

def solve_pde(boundary_condition, source_function, mesh_size):
    """
    Poisson 방정식을 풉니다.
    -∇²u = f in Ω
    u = boundary_condition on ∂Ω
    """
    
    try:
        log(f"🚀 Starting PDE solve")
        log(f"  Boundary condition: {boundary_condition}")
        log(f"  Source function: {source_function}")
        log(f"  Mesh size: {mesh_size}")
        
        # 메시 생성
        log("Creating mesh...")
        domain = mesh.create_unit_square(
            MPI.COMM_WORLD, 
            mesh_size, 
            mesh_size, 
            mesh.CellType.quadrilateral
        )
        V = fem.functionspace(domain, ("Lagrange", 1))
        log(f"  Mesh created with {domain.topology.index_map(0).size_global} vertices")
        
        # 경계 조건 설정
        log("Setting boundary conditions...")
        uD = fem.Function(V)
        
        try:
            uD.interpolate(lambda x: eval(boundary_condition, {"__builtins__": {}}, {"x": x, "np": np}))
            log("  Boundary condition interpolated successfully")
        except Exception as e:
            log(f"❌ Error in boundary condition evaluation: {e}")
            raise ValueError(f"Invalid boundary condition: {e}")
        
        tdim = domain.topology.dim
        fdim = tdim - 1
        domain.topology.create_connectivity(fdim, tdim)
        boundary_facets = mesh.exterior_facet_indices(domain.topology)
        boundary_dofs = fem.locate_dofs_topological(V, fdim, boundary_facets)
        bc = fem.dirichletbc(uD, boundary_dofs)
        log(f"  Boundary DOFs: {len(boundary_dofs)}")
        
        # 약형식 정의
        log("Defining weak form...")
        u = ufl.TrialFunction(V)
        v = ufl.TestFunction(V)
        
        try:
            f_value = float(eval(source_function, {"__builtins__": {}}, {"np": np}))
            f = fem.Constant(domain, default_scalar_type(f_value))
            log(f"  Source function value: {f_value}")
        except Exception as e:
            log(f"❌ Error in source function evaluation: {e}")
            raise ValueError(f"Invalid source function: {e}")
        
        a = ufl.dot(ufl.grad(u), ufl.grad(v)) * ufl.dx
        L = f * v * ufl.dx
        
        # 문제 풀이 (수정됨: petsc_options_prefix 추가)
        log("Solving linear problem...")
        problem = LinearProblem(
            a, L, 
            bcs=[bc],
            petsc_options={"ksp_type": "preonly", "pc_type": "lu"},
            petsc_options_prefix="poisson"  # 필수 인자 추가!
        )
        uh = problem.solve()
        log("  Solution computed")
        
        # 오차 계산
        log("Computing errors...")
        V2 = fem.functionspace(domain, ("Lagrange", 2))
        uex = fem.Function(V2, name="u_exact")
        uex.interpolate(lambda x: eval(boundary_condition, {"__builtins__": {}}, {"x": x, "np": np}))
        
        L2_error = fem.form(ufl.inner(uh - uex, uh - uex) * ufl.dx)
        error_local = fem.assemble_scalar(L2_error)
        error_L2 = np.sqrt(domain.comm.allreduce(error_local, op=MPI.SUM))
        error_max = np.max(np.abs(uD.x.array - uh.x.array))
        
        log(f"  L2 error: {error_L2:.2e}")
        log(f"  Max error: {error_max:.2e}")
        
        # 결과 저장
        log("Saving results...")
        results_folder = Path("results")
        results_folder.mkdir(exist_ok=True, parents=True)
        filename = results_folder / "fundamentals"
        
        with io.XDMFFile(domain.comm, filename.with_suffix(".xdmf"), "w") as xdmf:
            xdmf.write_mesh(domain)
            xdmf.write_function(uh)
        
        log(f"  Files saved: {filename}")
        log("✅ PDE solve complete")
        
        return {
            "error_L2": f"{error_L2:.2e}",
            "error_max": f"{error_max:.2e}",
            "xdmf_file": str(filename.with_suffix(".xdmf")),
            "h5_file": str(filename.with_suffix(".h5"))
        }
    
    except Exception as e:
        log(f"❌ Error in solve_pde: {e}")
        log(f"Traceback: {traceback.format_exc()}")
        raise  # 에러를 상위로 전달

if __name__ == "__main__":
    try:
        log("Reading input from stdin...")
        input_text = sys.stdin.read()
        log(f"Raw input: {input_text}")
        
        input_data = json.loads(input_text)
        log(f"Parsed input: {input_data}")
        
        result = solve_pde(
            input_data["boundary_condition"],
            input_data["source_function"],
            input_data["mesh_size"]
        )
        
        # JSON으로 출력 (stdout)
        output = json.dumps(result)
        log(f"Output: {output}")
        print(output)
        
    except Exception as e:
        log(f"❌ Fatal error: {e}")
        log(f"Traceback: {traceback.format_exc()}")
        # 에러도 JSON으로 출력
        error_output = json.dumps({
            "error": str(e),
            "error_L2": "N/A",
            "error_max": "N/A",
            "xdmf_file": "",
            "h5_file": ""
        })
        print(error_output)
        sys.exit(1)