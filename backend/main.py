# main.py - FastAPI 백엔드 서버 (디버깅 버전)

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

# 로깅 설정
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="FEniCSx PDE Solver API")

# CORS 설정 (프론트엔드와 통신하기 위해 필수)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PDERequest(BaseModel):
    boundary_condition: str
    source_function: str
    mesh_size: int

class PDEResponse(BaseModel):
    error_L2: str
    error_max: str
    xdmf_file: str
    h5_file: str
    computation_time: str

@app.get("/")
async def root():
    logger.info("Root endpoint called")
    return {
        "message": "FEniCSx PDE Solver API",
        "version": "1.0.0",
        "endpoints": {
            "solve": "POST /api/solve",
            "download": "GET /api/download"
        }
    }

@app.post("/api/solve", response_model=PDEResponse)
async def solve_pde(request: PDERequest):
    """
    FEniCSx를 사용하여 PDE를 풀고 결과를 반환합니다.
    """
    logger.info(f"🚀 Received solve request: {request}")
    
    try:
        start_time = time.time()
        
        input_data = {
            "boundary_condition": request.boundary_condition,
            "source_function": request.source_function,
            "mesh_size": request.mesh_size
        }
        
        logger.debug(f"📤 Input data: {input_data}")
        
        # solver.py 호출
        logger.info("Calling solver.py...")
        result = subprocess.run(
            ["python3", "solver.py"],
            input=json.dumps(input_data),
            capture_output=True,
            text=True,
            timeout=60,
            cwd=Path(__file__).parent
        )
        
        logger.debug(f"📥 Solver return code: {result.returncode}")
        logger.debug(f"📥 Solver stdout: {result.stdout}")
        logger.debug(f"📥 Solver stderr: {result.stderr}")
        
        if result.returncode != 0:
            logger.error(f"❌ Solver failed: {result.stderr}")
            raise HTTPException(
                status_code=500, 
                detail=f"계산 오류: {result.stderr}"
            )
        
        # 결과 파싱
        try:
            output_data = json.loads(result.stdout)
            logger.info(f"✅ Parsed output: {output_data}")
        except json.JSONDecodeError as e:
            logger.error(f"❌ JSON parse error: {e}")
            logger.error(f"Raw output: {result.stdout}")
            raise HTTPException(
                status_code=500, 
                detail=f"솔버 출력 파싱 오류: {result.stdout[:200]}"
            )
        
        computation_time = time.time() - start_time
        logger.info(f"⏱️ Computation time: {computation_time:.3f}s")
        
        response = PDEResponse(
            error_L2=output_data["error_L2"],
            error_max=output_data["error_max"],
            xdmf_file=output_data["xdmf_file"],
            h5_file=output_data["h5_file"],
            computation_time=f"{computation_time:.3f}s"
        )
        
        logger.info(f"✅ Sending response: {response}")
        return response
        
    except subprocess.TimeoutExpired:
        logger.error("❌ Solver timeout")
        raise HTTPException(status_code=504, detail="계산 시간 초과 (60초)")
    except Exception as e:
        logger.error(f"❌ Unexpected error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download")
async def download_results():
    """
    계산 결과 파일들을 ZIP으로 압축하여 다운로드합니다.
    """
    logger.info("📥 Download request received")
    
    try:
        results_folder = Path(__file__).parent / "results"
        logger.debug(f"Results folder: {results_folder}")
        
        if not results_folder.exists():
            logger.error("❌ Results folder not found")
            raise HTTPException(status_code=404, detail="결과 파일이 없습니다.")
        
        # ZIP 파일 생성
        zip_path = Path(__file__).parent / "results.zip"
        logger.info(f"Creating ZIP: {zip_path}")
        
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file in results_folder.glob("*"):
                if file.is_file():
                    logger.debug(f"Adding to ZIP: {file.name}")
                    zipf.write(file, file.name)
        
        logger.info("✅ ZIP created successfully")
        return FileResponse(
            zip_path,
            media_type='application/zip',
            filename='fundamentals.zip'
        )
        
    except Exception as e:
        logger.error(f"❌ Download error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# 에러 핸들러
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"❌ Global exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
    )

#if __name__ == "__main__":
#    import uvicorn
#    logger.info("🚀 Starting FastAPI server...")
#    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="debug")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    logger.info(f"🚀 Starting FastAPI server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="debug")