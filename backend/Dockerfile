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

# Hugging Face Spaces용 Dockerfile
FROM dolfinx/dolfinx:v0.9.0

WORKDIR /app

# 시스템 패키지 업데이트
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python 패키지 설치
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# 애플리케이션 코드 복사
COPY . .

# 결과 디렉토리 생성
RUN mkdir -p /app/results

# Hugging Face Spaces는 7860 포트 사용
EXPOSE 7860

# 환경변수 설정
ENV PORT=7860

# FastAPI 서버 실행 (Hugging Face 포트 사용)
CMD ["python3", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]