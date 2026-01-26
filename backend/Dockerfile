# FEniCSx 공식 이미지 사용 (v0.10.0)
FROM dolfinx/dolfinx:v0.10.0

WORKDIR /app

# 추가 패키지 설치
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# 애플리케이션 코드 복사
COPY . .

# 결과 디렉토리 생성
RUN mkdir -p /app/results

# 포트 노출
EXPOSE 8000

# FastAPI 서버 실행
CMD ["python3", "main.py"]