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
import uuid
import shutil
import shlex
import threading

# 로깅 설정
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="FEniCSx Dynamic Code Executor",
    description="Execute user-generated FEniCSx Python code (Async version)",
    version="2.1.0"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 실행 중인 프로세스(강제 종료용) 추적 딕셔너리
running_processes = {}

class CodeExecutionRequest(BaseModel):
    python_code: str
    execution_id: str = None
    cli_args: str = ""  # CLI 인자 추가

# --- 5일 지난 파일 자동 삭제 (서버 켜질 때 백그라운드 작동) ---
def cleanup_old_folders_loop():
    while True:
        try:
            now = time.time()
            tmp_dir = Path("/tmp")
            for p in tmp_dir.glob("fenics_*"):
                if p.is_dir():
                    # 5일(5 * 24 * 3600초 = 432000초) 경과 시 삭제
                    if (now - p.stat().st_mtime) > 432000:
                        shutil.rmtree(p, ignore_errors=True)
                        logger.info(f"🧹 5일 경과 폴더 삭제됨: {p.name}")
        except Exception as e:
            logger.error(f"Cleanup error: {e}")
        time.sleep(3600) # 1시간마다 검사

@app.on_event("startup")
def startup_event():
    # FastAPI 시작 시 청소부 스레드 가동
    threading.Thread(target=cleanup_old_folders_loop, daemon=True).start()
    logger.info("🧹 Background cleanup thread started.")

# --- 상태 관리 유틸리티 ---
def get_work_dir(exec_id: str) -> Path:
    return Path(f"/tmp/fenics_{exec_id}")

def update_status(exec_id: str, status_data: dict):
    status_file = get_work_dir(exec_id) / "status.json"
    with open(status_file, "w", encoding="utf-8") as f:
        json.dump(status_data, f, ensure_ascii=False)

def read_status(exec_id: str) -> dict:
    status_file = get_work_dir(exec_id) / "status.json"
    if status_file.exists():
        with open(status_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return None

# --- [중요] Hugging Face 기상 확인용 엔드포인트 (절대 삭제 금지) ---
@app.get("/")
async def root():
    return {"message": "FEniCSx Async Executor is running", "status": "healthy"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "fenics-executor"}

# --- 실제 백그라운드 연산 스레드 ---
def run_fenics_task(exec_id: str, command: list, work_dir: Path):
    start_time = time.time()
    try:
        process = subprocess.Popen(
            command,
            cwd=work_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env={**os.environ, "PYTHONUNBUFFERED": "1"}
        )
        running_processes[exec_id] = process
        
        stdout, stderr = process.communicate() # 연산이 끝날 때까지 여기서 대기
        
        if process.returncode == 0:
            status = "done"
        elif process.returncode in [-9, 137]: # 강제 종료(Kill)된 경우
            status = "stopped"
            stderr = "사용자에 의해 강제 중지되었습니다.\n" + stderr
        else:
            status = "error"
            
        update_status(exec_id, {
            "status": status,
            "stdout": stdout[-3000:], # 로그 텍스트 용량 제한
            "stderr": stderr[-3000:],
            "execution_time": f"{time.time() - start_time:.3f}s"
        })
    except Exception as e:
        logger.error(f"Task error: {e}")
        update_status(exec_id, {"status": "error", "error": str(e)})
    finally:
        if exec_id in running_processes:
            del running_processes[exec_id]

# --- 핵심 API 엔드포인트 ---
@app.post("/api/execute")
async def execute_code(request: CodeExecutionRequest):
    """코드 실행 요청 (ID 발급 후 즉시 응답)"""
    execution_id = request.execution_id or str(uuid.uuid4())[:8]
    work_dir = get_work_dir(execution_id)
    work_dir.mkdir(exist_ok=True, parents=True)
    (work_dir / "results").mkdir(exist_ok=True)
    
    code_file = work_dir / "user_code.py"
    code_file.write_text(request.python_code, encoding='utf-8')
    
    command = ["python3", str(code_file)]
    if request.cli_args:
        command.extend(shlex.split(request.cli_args))
    
    # 초기 상태 기록
    update_status(execution_id, {"status": "working", "start_time": time.time()})
    
    # 백그라운드 스레드로 실행 넘김 (시간제한 없음)
    threading.Thread(target=run_fenics_task, args=(execution_id, command, work_dir)).start()
    
    logger.info(f"🚀 Execution started in background for ID: {execution_id}")
    return {"execution_id": execution_id, "status": "working"}

@app.get("/api/status/{execution_id}")
async def check_status(execution_id: str):
    """현재 연산 진행 상태 및 로그 조회"""
    data = read_status(execution_id)
    if not data:
        raise HTTPException(status_code=404, detail="ID를 찾을 수 없습니다.")
    return data

@app.post("/api/stop/{execution_id}")
async def stop_execution(execution_id: str):
    """실행 중인 연산 강제 중지"""
    process = running_processes.get(execution_id)
    if process:
        process.kill()
        return {"status": "stopped", "message": "중지 명령 전송 완료"}
    return {"status": "error", "message": "현재 실행 중이지 않거나 이미 종료되었습니다."}

@app.get("/api/download/{execution_id}")
async def download_results(execution_id: str):
    """결과 다운로드 및 자동 폴더 삭제 (전체 작업 폴더 압축으로 개선)"""
    work_dir = get_work_dir(execution_id)
    
    if not work_dir.exists():
        raise HTTPException(status_code=404, detail="작업 폴더를 찾을 수 없습니다. (이미 삭제되었거나 존재하지 않음)")
    
    # 1. 다운로드 시점에 현재까지의 로그를 텍스트 파일로 저장하여 포함
    status_data = read_status(execution_id)
    if status_data:
        (work_dir / "stdout_log.txt").write_text(status_data.get("stdout", "No output"), encoding="utf-8")
        (work_dir / "stderr_log.txt").write_text(status_data.get("stderr", "No errors"), encoding="utf-8")
    
    # 2. 특정 폴더(results)만 고집하지 않고, 작업 폴더 내부의 모든 결과 파일을 수집
    # 단, 실행 코드 원본과 상태 정보 파일은 제외
    exclude_files = ["user_code.py", "status.json"]
    all_files = [f for f in work_dir.rglob('*') if f.is_file() and f.name not in exclude_files]
    
    if not all_files:
        raise HTTPException(status_code=404, detail="압축할 내용물이 없습니다.")
    
    # 3. ZIP 파일 생성 (폴더 구조 유지)
    zip_path = Path(f"/tmp/results_{execution_id}.zip")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file_path in all_files:
            arcname = file_path.relative_to(work_dir)
            zipf.write(str(file_path), str(arcname))
            
    # 4. 다운로드 전송 후 서버 용량 정리를 위한 삭제 스레드
    def cleanup_after_download():
        time.sleep(15) # 다운로드 완료를 위한 충분한 대기 시간
        shutil.rmtree(work_dir, ignore_errors=True)
        if zip_path.exists(): zip_path.unlink()
        logger.info(f"🗑️ Downloaded files deleted for ID: {execution_id}")
        
    threading.Thread(target=cleanup_after_download).start()
    
    return FileResponse(zip_path, media_type='application/zip', filename=f'fenics_{execution_id}.zip')

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"❌ Global exception: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": str(exc)})

# --- 원본 포트 바인딩 구조 유지 ---
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 7860))
    logger.info(f"🚀 Starting Async FEniCSx Code Executor on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="debug")