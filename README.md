# ⚡ TaskFlow — Team Task Manager

A full-stack web application for team project and task management with role-based access control.

**Built by:** Devesh Bansal | Ethara AI Assignment

## 🚀 Features

- **Authentication** — Signup/Login with JWT tokens
- **Role-based Access** — Admin and Member roles
- **Project Management** — Create, manage, delete projects
- **Team Management** — Add members to projects
- **Task Tracking** — Create tasks, assign to members, track status
- **Kanban Board** — Visual task management (Todo / In Progress / Done)
- **Dashboard** — Stats overview with overdue task alerts
- **Admin Panel** — User management for admins

## 🛠 Tech Stack

- **Backend:** Node.js + Express.js
- **Database:** PostgreSQL
- **Auth:** JWT + bcryptjs
- **Frontend:** Vanilla HTML/CSS/JS (Single Page App)
- **Deployment:** Railway

## 📦 Setup & Run Locally

```bash
# Clone repo
git clone <your-repo-url>
cd taskflow-team-manager

# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET

# Run
npm start
```

## 🌐 Deployment on Railway

1. Push code to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. Add PostgreSQL database service
4. Set environment variables:
   - `DATABASE_URL` — auto-set by Railway PostgreSQL
   - `JWT_SECRET` — any random string
5. Deploy!

## 🔐 Environment Variables

```
DATABASE_URL=postgresql://...
JWT_SECRET=your_secret_key
PORT=3000
```

## 📋 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/signup | Register user |
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Get current user |
| GET | /api/projects | List projects |
| POST | /api/projects | Create project |
| GET | /api/projects/:id | Project details |
| DELETE | /api/projects/:id | Delete project |
| GET | /api/projects/:id/tasks | List tasks |
| POST | /api/projects/:id/tasks | Create task |
| PUT | /api/tasks/:id | Update task |
| DELETE | /api/tasks/:id | Delete task |
| GET | /api/dashboard | Dashboard data |
| GET | /api/users | List all users |
