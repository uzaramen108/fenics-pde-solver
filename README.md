---
title: FEniCSx PDE Solver
emoji: 🔬
colorFrom: purple
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# FEniCSx PDE Solver API

편미분 방정식을 풀고 시각화하는 백엔드 API입니다.

## 🚀 Features

- Poisson 방정식 수치 해석
- FEniCSx (DOLFINx v0.9.0) 기반
- FastAPI REST API
- ParaView 호환 결과 파일 생성

## 📖 API Endpoints

### POST /api/solve
PDE를 풉니다.

**Request Body:**
```json
{
  "boundary_condition": "1 + x[0]**2 + 2*x[1]**2",
  "source_function": "-6",
  "mesh_size": 8
}
```

**Response:**
```json
{
  "error_L2": "4.35e-15",
  "error_max": "8.88e-16",
  "xdmf_file": "results/fundamentals.xdmf",
  "h5_file": "results/fundamentals.h5",
  "computation_time": "0.563s"
}
```

### GET /api/download
결과 파일을 ZIP으로 다운로드합니다.

### GET /health
서비스 상태를 확인합니다.

## 🔗 Links

- Frontend: [GitHub Pages](https://YOUR_USERNAME.github.io/fenics-pde-solver/)
- Source Code: [GitHub](https://github.com/YOUR_USERNAME/fenics-pde-solver)

## 📄 License

MIT