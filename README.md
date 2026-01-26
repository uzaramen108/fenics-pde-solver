# FEniCSx PDE Solver

편미분 방정식을 풀고 시각화하는 웹 애플리케이션입니다.

![Screenshot](screenshot.png)

## 🚀 Features

- 실시간 PDE 계산
- FEniCSx 기반 유한요소법
- ParaView 호환 결과 파일 생성
- 직관적인 웹 인터페이스

## 🛠️ Technology Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: FastAPI, FEniCSx (DOLFINx v0.10.0)
- **Containerization**: Docker, Docker Compose

## 📦 Installation

### Prerequisites

- Docker Desktop
- Git

### Local Development
```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/FEniCS_web_project.git
cd FEniCS_web_project

# Start containers
docker compose up --build -d

# Open browser
http://localhost:3000
```

## 🌐 Deployment

### Backend (Render)

1. Fork this repository
2. Create account on [Render](https://render.com)
3. Create new Web Service
4. Connect your GitHub repository
5. Configure:
   - Root Directory: `backend`
   - Environment: Docker
   - Instance Type: Free

### Frontend (GitHub Pages)

1. Go to repository Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main` → `/frontend`
4. Save

## 📖 Usage

1. 경계 조건 입력 (예: `1 + x[0]**2 + 2*x[1]**2`)
2. 소스 함수 입력 (예: `-6`)
3. 메시 크기 선택
4. "PDE 풀이 시작" 클릭
5. 결과 확인 및 다운로드

## 🧪 Example Problems

### Example 1: Poisson Equation
```
Boundary: 1 + x[0]**2 + 2*x[1]**2
Source: -6
```

### Example 2: Trigonometric Solution
```
Boundary: np.sin(np.pi * x[0]) * np.sin(np.pi * x[1])
Source: 2 * np.pi**2 * np.sin(np.pi * x[0]) * np.sin(np.pi * x[1])
```

## 📄 License

MIT License

## 👤 Author

Your Name - [@uzaramen108](https://github.com/uzaramen108)