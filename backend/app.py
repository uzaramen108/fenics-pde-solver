from fastapi import FastAPI, HTTPException, BackgroundTasks
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
import asyncio # 추가됨
from contextlib import asynccontextmanager # 추가됨

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- 5일 지난 파일 자동 청소부 로직 ---
async def cleanup_old_files_loop():
    while True:
        try:
            now = time.time()
            tmp_dir = Path("/tmp")
            
            # /tmp 폴더 안의 fenics_ 로 시작하는 폴더들을 전부 검사
            for p in tmp_dir.glob("fenics_*"):
                if p.is_dir():
                    # 폴더가 생성(수정)된 시간 확인
                    folder_age_seconds = now - p.stat().st_mtime
                    # 5일(5일 * 24시간 * 60분 * 60초 = 432,000초)이 지났는지 확인
                    if folder_age_seconds > (5 * 24 * 60 * 60):
                        shutil.rmtree(p, ignore_errors=True)
                        logger.info(f"🧹 5일 경과 폴더 삭제됨: {p.name}")
                        
        except Exception as e:
            logger.error(f"청소부 에러: {e}")
            
        # 1시간(3600초) 동안 대기했다가 다시 검사
        await asyncio.sleep(3600)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 서버 켜질 때 청소부 루프 백그라운드에서 실행 시작
    cleanup_task = asyncio.create_task(cleanup_old_files_loop())
    yield
    # 서버 꺼질 때 청소부 루프 종료
    cleanup_task.cancel()

# lifespan을 app에 등록!
app = FastAPI(title="FEniCSx Async Executor", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 실행 중인 프로세스를 추적하기 위한 딕셔너리 (메모리)
running_processes = {}

class CodeExecutionRequest(BaseModel):
    python_code: str
    cli_args: str = ""

def get_work_dir(exec_id: str) -> Path:
    return Path(f"/tmp/fenics_{exec_id}")

def update_status(exec_id: str, status_data: dict):
    """상태를 JSON 파일로 저장하여 창을 껐다 켜도 유지되게 함"""
    status_file = get_work_dir(exec_id) / "status.json"
    with open(status_file, "w", encoding="utf-8") as f:
        json.dump(status_data, f, ensure_ascii=False)

def read_status(exec_id: str) -> dict:
    status_file = get_work_dir(exec_id) / "status.json"
    if status_file.exists():
        with open(status_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return None

def run_fenics_task(exec_id: str, code_file: Path, work_dir: Path, cli_args: str):
    """백그라운드에서 실행되는 실제 연산 함수"""
    start_time = time.time()
    command = ["python3", str(code_file)]
    if cli_args:
        command.extend(shlex.split(cli_args))
    
    try:
        # Popen을 사용하여 비동기 실행 및 프로세스 제어권 획득
        process = subprocess.Popen(
            command,
            cwd=work_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env={**os.environ, "PYTHONUNBUFFERED": "1"}
        )
        running_processes[exec_id] = process
        
        stdout, stderr = process.communicate()
        returncode = process.returncode
        
        exec_time = f"{time.time() - start_time:.3f}s"
        
        if returncode == 0:
            status = "done"
        elif returncode == -9 or returncode == 137: # SIGKILL (강제 종료됨)
            status = "stopped"
            stderr = "사용자에 의해 실행이 강제 중지되었습니다.\n" + stderr
        else:
            status = "error"

        update_status(exec_id, {
            "status": status,
            "stdout": stdout[-3000:],
            "stderr": stderr[-3000:],
            "execution_time": exec_time
        })

    except Exception as e:
        update_status(exec_id, {"status": "error", "error": str(e)})
    finally:
        # 실행 끝난 프로세스는 추적 목록에서 제거
        if exec_id in running_processes:
            del running_processes[exec_id]

@app.post("/api/execute")
async def execute_code(request: CodeExecutionRequest, background_tasks: BackgroundTasks):
    exec_id = str(uuid.uuid4())[:8]
    work_dir = get_work_dir(exec_id)
    work_dir.mkdir(exist_ok=True, parents=True)
    (work_dir / "results").mkdir(exist_ok=True)
    
    code_file = work_dir / "user_code.py"
    code_file.write_text(request.python_code, encoding='utf-8')
    
    # 초기 상태 설정
    update_status(exec_id, {"status": "working", "start_time": time.time()})
    
    # 백그라운드 작업 시작 (웹 응답은 즉시 반환)
    background_tasks.add_task(run_fenics_task, exec_id, code_file, work_dir, request.cli_args)
    
    return {"execution_id": exec_id, "status": "working", "message": "Execution started"}

@app.get("/api/status/{execution_id}")
async def check_status(execution_id: str):
    status_data = read_status(execution_id)
    if not status_data:
        raise HTTPException(status_code=404, detail="해당 ID의 실행 기록이 없습니다.")
    return status_data

@app.post("/api/stop/{execution_id}")
async def stop_execution(execution_id: str):
    process = running_processes.get(execution_id)
    if process:
        process.kill() # 프로세스 강제 종료
        del running_processes[execution_id]
        update_status(execution_id, {"status": "stopped", "message": "사용자에 의해 중지됨"})
        return {"status": "stopped", "message": "실행이 중지되었습니다."}
    else:
        # 이미 끝났거나 없는 경우
        return {"status": "error", "message": "현재 실행 중인 프로세스가 아닙니다."}

def cleanup_job(exec_id: str):
    """다운로드 후 폴더 삭제"""
    shutil.rmtree(get_work_dir(exec_id), ignore_errors=True)

@app.get("/api/download/{execution_id}")
async def download_results(execution_id: str, background_tasks: BackgroundTasks):
    results_dir = get_work_dir(execution_id) / "results"
    if not results_dir.exists():
        raise HTTPException(status_code=404, detail="결과 폴더가 없습니다.")
    
    all_files = [f for f in results_dir.rglob('*') if f.is_file()]
    zip_path = get_work_dir(execution_id) / f"results_{execution_id}.zip"
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file_path in all_files:
            arcname = file_path.relative_to(results_dir)
            zipf.write(str(file_path), str(arcname))
    
    # 다운로드 완료 후 백그라운드에서 폴더 통째로 삭제 (서버 용량 관리)
    background_tasks.add_task(cleanup_job, execution_id)
    
    return FileResponse(zip_path, media_type='application/zip', filename=f'fenics_{execution_id}.zip')

# --- (선택사항) 5일 지난 폴더 자동 정리 로직 ---
# 실제 환경에서는 Linux crontab에 `find /tmp/fenics_* -mtime +5 -exec rm -rf {} +` 를 등록하는 것이 가장 깔끔합니다.