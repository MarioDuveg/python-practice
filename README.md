# Python Practice Judge — 22 problemas

Mini plataforma tipo LeetCode para practicar **22 problemas de algoritmos en Python 3**. Incluye editor Monaco, casos visibles y ocultos, ejecución real con Python y verdicts automáticos.

## Problemas incluidos

| # | Problema | Técnica |
|---:|---|---|
| 1 | Assign Cookies | Greedy |
| 2 | Activity Selection | Greedy |
| 3 | Coin Change canónico | Greedy |
| 4 | Min-Max `< 1.5n` | Comparación por parejas |
| 5 | Pow(x, n) | Divide & Conquer |
| 6 | Jump Game | Greedy |
| 7 | eraseOverlapIntervals | Greedy |
| 8 | Minimum Number of Arrows to Burst Balloons | Greedy |
| 9 | Gas Station | Greedy |
| 10 | Find First and Last Position | Binary Search |
| 11 | Search in Rotated Sorted Array | Binary Search |
| 12 | Jump Game II | Greedy / BFS implícito |
| 13 | Subsets II | Backtracking |
| 14 | Generate Parentheses | Backtracking |
| 15 | Combination Sum II | Backtracking |
| 16 | Permutations II | Backtracking |
| 17 | Beautiful Array | Divide & Conquer |
| 18 | Kth Largest / Quickselect | Divide & Conquer |
| 19 | N-Knights | Backtracking + poda |
| 20 | Candy | Greedy |
| 21 | Median of Two Sorted Arrays | Binary Search / Divide & Conquer |
| 22 | N-Queens | Backtracking + poda |

Las plantillas usan el formato `class Solution` habitual de LeetCode.

## Características

- Editor **Monaco** con resaltado de Python.
- Botón **Ejecutar** para casos visibles.
- Botón **Enviar** para evaluar todos los casos.
- Verdicts: `Accepted`, `Wrong Answer`, `Syntax Error`, `Runtime Error`, `Time Limit Exceeded` y `Output Limit Exceeded`.
- Código guardado localmente por problema mediante `localStorage`.
- Comparación con tolerancia para resultados de punto flotante.
- Comparación sin importar el orden para problemas con múltiples respuestas.
- Validadores especiales para Activity Selection, Coin Change canónico, Beautiful Array, N-Knights y N-Queens.
- Dockerfile y `render.yaml` listos para Render.

## Ejecutar localmente

Requisitos:

- Node.js 20+
- Python 3

```bash
npm install
npm start
```

Abre:

```text
http://localhost:10000
```

## Estructura

```text
python-practice-judge/
├── Dockerfile
├── render.yaml
├── package.json
├── README.md
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── src/
    ├── server.js
    ├── judge.js
    └── problems.json
```

## API útil

- `GET /api/health` — estado del servicio y número de problemas.
- `GET /api/diagnostics/runtime` — comprueba la instalación de Python.
- `GET /api/problems` — lista de problemas.
- `GET /api/problems/:id` — detalle de un problema.
- `POST /api/judge/:id` — ejecuta o envía una solución.

## Desplegar en Render

1. Sube el proyecto a GitHub.
2. En Render crea un nuevo **Blueprint** o un **Web Service** con Docker.
3. Render detectará `render.yaml` y construirá el `Dockerfile`.
4. El health check utiliza `/api/health`.

El contenedor instala Node.js y Python 3. El servidor escucha en `0.0.0.0` usando `process.env.PORT`.

## Seguridad

El código enviado se ejecuta dentro del mismo contenedor del servicio como un usuario no privilegiado y con límites de tiempo y salida. Esto **no es un sandbox de seguridad fuerte**.

El proyecto está pensado para práctica personal, demostraciones o un salón con usuarios de confianza. Para exponerlo públicamente a código arbitrario de usuarios desconocidos, conviene reemplazar el runner por infraestructura aislada como Judge0, nsjail o un servicio equivalente.
