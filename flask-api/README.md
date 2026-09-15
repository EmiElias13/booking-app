# flask-api

Minimal Flask API backing the `react-app` booking UI. Appointments are stored in a
local SQLite file (`appointments.db`, created on first run).

## Run

```bash
cd flask-api
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Serves on `http://127.0.0.1:5001`. The Vite dev server proxies `/api` here, so start
this before `npm run dev` in `react-app`.

## Endpoints

| Method | Path                        | Purpose                                          |
| ------ | --------------------------- | ------------------------------------------------ |
| GET    | `/api/health`               | Liveness check                                   |
| GET    | `/api/appointments`         | All appointments, ordered by date and time       |
| POST   | `/api/appointments`         | Create a request (`pending`); 409 if slot is taken |
| PATCH  | `/api/appointments/<id>`    | Set `status` to pending/approved/declined         |

Validation errors come back as `{"errors": {"field": "message"}}` with status 400, which
is the shape the React form renders inline.
