# app.py - FEniCSx v0.10.0 코드 실행 백엔드

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import subprocess
import json
import time
import zipfile
from pathlib import Path
import logging
import os
import tempfile
import uuid
import shutil

# 로깅 설정
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="FEniCSx Dynamic Code Executor",
    description="Execute user-generated FEniCSx Python code",
    version="2.0.0"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CodeExecutionRequest(BaseModel):
    python_code: str
    execution_id: str = None

class CodeExecutionResponse(BaseModel):
    execution_id: str
    status: str
    result: dict
    stdout: str
    stderr: str
    execution_time: str

@app.get("/")
async def root():
    return {
        "message": "FEniCSx Dynamic Code Executor",
        "version": "2.0.0",
        "fenics_version": "0.10.0",
        "endpoints": {
            "execute": "POST /api/execute",
            "download": "GET /api/download/{execution_id}",
            "health": "GET /health"
        },
        "status": "healthy"
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "fenics-executor"}

@app.post("/api/execute", response_model=CodeExecutionResponse)
async def execute_code(request: CodeExecutionRequest):
    """
    프론트엔드에서 생성한 FEniCSx Python 코드를 실행합니다.
    """
    execution_id = request.execution_id or str(uuid.uuid4())[:8]
    logger.info(f"🚀 Executing code for ID: {execution_id}")
    logger.info(f"📝 Code length: {len(request.python_code)} characters")
    
    try:
        start_time = time.time()
        
        # 임시 작업 디렉토리 생성
        work_dir = Path(f"/tmp/fenics_{execution_id}")
        work_dir.mkdir(exist_ok=True, parents=True)
        
        results_dir = work_dir / "results"
        results_dir.mkdir(exist_ok=True)
        
        logger.debug(f"📁 Work directory: {work_dir}")
        logger.debug(f"📁 Results directory: {results_dir}")
        
        # Python 코드 파일로 저장
        code_file = work_dir / "user_code.py"
        
        # 코드에 결과 경로 자동 주입 (만약 없다면)
        modified_code = request.python_code
        if 'results_folder = Path("results")' in modified_code:
            modified_code = modified_code.replace(
                'results_folder = Path("results")',
                f'results_folder = Path("{results_dir}")'
            )
        
        code_file.write_text(modified_code, encoding='utf-8')
        logger.debug(f"✅ Code written to: {code_file}")
        
        # 간단한 보안 검사
        dangerous_patterns = ['subprocess', 'os.system', '__import__', 'open(']
        code_lower = request.python_code.lower()
        
        # eval과 exec는 FEniCS에서 필요할 수 있으므로 허용
        for pattern in dangerous_patterns:
            if pattern in code_lower and pattern not in ['open(']:
                logger.warning(f"⚠️ Potentially dangerous pattern found: {pattern}")
                # 경고만 하고 계속 진행 (필요시 차단)
        
        # 코드 실행
        logger.info("▶️ Executing user-generated code...")
        
        result = subprocess.run(
            ["python3", str(code_file)],
            capture_output=True,
            text=True,
            timeout=18000,  # 300분 타임아웃
            cwd=work_dir,
            env={**os.environ, "PYTHONUNBUFFERED": "1"}
        )
        
        logger.debug(f"📥 Return code: {result.returncode}")
        logger.debug(f"📥 Stdout: {result.stdout[:500]}...")
        logger.debug(f"📥 Stderr: {result.stderr[:500]}...")
        
        # 실행 실패
        if result.returncode != 0:
            logger.error(f"❌ Execution failed with code {result.returncode}")
            return CodeExecutionResponse(
                execution_id=execution_id,
                status="error",
                result={"error": "Execution failed"},
                stdout=result.stdout[-2000:],  # 마지막 2000자
                stderr=result.stderr[-2000:],
                execution_time=f"{time.time() - start_time:.3f}s"
            )
        
        # stdout에서 JSON 결과 파싱
        result_data = {}
        try:
            # 마지막 줄에서 JSON 찾기
            lines = result.stdout.strip().split('\n')
            for line in reversed(lines):
                line = line.strip()
                if line.startswith('{') and line.endswith('}'):
                    result_data = json.loads(line)
                    break
        except json.JSONDecodeError as e:
            logger.warning(f"⚠️ Could not parse JSON from output: {e}")
            result_data = {"raw_output": result.stdout[-500:]}
        
        # 생성된 파일 목록
        generated_files = []
        if results_dir.exists():
            generated_files = [f.name for f in results_dir.iterdir()]
        
        result_data["generated_files"] = generated_files
        result_data["execution_id"] = execution_id
        
        computation_time = time.time() - start_time
        logger.info(f"✅ Execution completed in {computation_time:.3f}s")
        logger.info(f"📄 Generated files: {generated_files}")
        
        return CodeExecutionResponse(
            execution_id=execution_id,
            status="success",
            result=result_data,
            stdout=result.stdout[-2000:],
            stderr=result.stderr[-1000:],
            execution_time=f"{computation_time:.3f}s"
        )
        
    except subprocess.TimeoutExpired:
        logger.error(f"❌ Timeout after 180 seconds")
        return CodeExecutionResponse(
            execution_id=execution_id,
            status="timeout",
            result={"error": "Execution timeout"},
            stdout="",
            stderr="Execution exceeded 18000 seconds",
            execution_time="18000s+"
        )
    except Exception as e:
        logger.error(f"❌ Unexpected error: {e}", exc_info=True)
        return CodeExecutionResponse(
            execution_id=execution_id,
            status="error",
            result={"error": str(e)},
            stdout="",
            stderr=str(e),
            execution_time=f"{time.time() - start_time:.3f}s"
        )
    finally:
        # 5분 후 자동 정리 (선택사항)
        # import threading
        # threading.Timer(300, lambda: shutil.rmtree(work_dir, ignore_errors=True)).start()
        pass

@app.get("/api/download/{execution_id}")
async def download_results(execution_id: str):
    """
    실행 결과 파일들을 ZIP으로 다운로드합니다.
    """
    logger.info(f"📥 Download request for execution ID: {execution_id}")
    
    try:
        results_dir = Path(f"/tmp/fenics_{execution_id}/results")
        
        if not results_dir.exists():
            logger.error(f"❌ Results directory not found: {results_dir}")
            raise HTTPException(status_code=404, detail="결과 파일을 찾을 수 없습니다.")
        
        files = list(results_dir.glob("*"))
        if not files:
            raise HTTPException(status_code=404, detail="다운로드할 파일이 없습니다.")
        
        # ZIP 파일 생성
        zip_path = Path(f"/tmp/results_{execution_id}.zip")
        
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file in files:
                if file.is_file():
                    zipf.write(file, file.name)
                    logger.debug(f"📦 Added to ZIP: {file.name}")
        
        logger.info(f"✅ ZIP created: {zip_path}")
        
        return FileResponse(
            zip_path,
            media_type='application/zip',
            filename=f'fenics_results_{execution_id}.zip'
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Download error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"❌ Global exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 7860))
    logger.info(f"🚀 Starting FEniCSx Code Executor on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="debug")