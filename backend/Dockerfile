# Dockerfile - FEniCSx v0.10.0

FROM dolfinx/dolfinx:v0.10.0

WORKDIR /app

# 시스템 패키지 업데이트
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Python 패키지 설치
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# 애플리케이션 코드 복사
COPY app.py .

# 임시 디렉토리 생성
RUN mkdir -p /tmp

# Hugging Face Spaces용 포트
EXPOSE 7860

ENV PORT=7860

# FastAPI 서버 실행
CMD ["python3", "app.py"]