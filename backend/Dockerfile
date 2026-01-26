# FEniCSx 공식 이미지 사용 (v0.10.0)
#FROM dolfinx/dolfinx:v0.10.0

#WORKDIR /app

# 추가 패키지 설치
#COPY requirements.txt .
#RUN pip3 install --no-cache-dir -r requirements.txt

# 애플리케이션 코드 복사
#COPY . .

# 결과 디렉토리 생성
#RUN mkdir -p /app/results

# 포트 노출
#EXPOSE 8000

# FastAPI 서버 실행
#CMD ["python3", "main.py"]

# ============================================================

# 1. dolfinx 최신 안정화 버전 사용 (v0.10.0)
FROM dolfinx/dolfinx:v0.10.0

WORKDIR /app

# 2. 캐시를 끄고 최소한으로 설치 (메모리 절약)
COPY requirements.txt .
# uvicorn은 FastAPI를 클라우드에서 실행하기 위한 필수 엔진입니다.
RUN pip3 install --no-cache-dir -r requirements.txt uvicorn

COPY . .

RUN mkdir -p /app/results

# 3. Render는 고정 포트(8000) 대신 자체 배정 포트($PORT)를 사용해야 합니다.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]