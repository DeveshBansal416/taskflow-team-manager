const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ethara_ai_secret_2026';

// Database
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ====== DB INIT ======
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'member',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      owner_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(20) DEFAULT 'member',
      PRIMARY KEY (project_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      status VARCHAR(20) DEFAULT 'todo',
      priority VARCHAR(20) DEFAULT 'medium',
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      assignee_id INTEGER REFERENCES users(id),
      due_date DATE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('DB initialized!');
}

// ====== MIDDLEWARE ======
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// ====== AUTH ROUTES ======
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (existing.rows.length) return res.status(400).json({ error: 'Email already exists' });
    const hash = await bcrypt.hash(password, 10);
    const userRole = role === 'admin' ? 'admin' : 'member';
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role',
      [name, email, hash, userRole]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (!result.rows.length) return res.status(400).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  const result = await pool.query('SELECT id, name, email, role FROM users WHERE id=$1', [req.user.id]);
  res.json(result.rows[0]);
});

// ====== USERS ROUTES ======
app.get('/api/users', auth, async (req, res) => {
  const result = await pool.query('SELECT id, name, email, role FROM users ORDER BY name');
  res.json(result.rows);
});

// ====== PROJECT ROUTES ======
app.get('/api/projects', auth, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await pool.query(`
        SELECT p.*, u.name as owner_name, COUNT(DISTINCT pm.user_id) as member_count, COUNT(DISTINCT t.id) as task_count
        FROM projects p LEFT JOIN users u ON p.owner_id=u.id
        LEFT JOIN project_members pm ON p.id=pm.project_id
        LEFT JOIN tasks t ON p.id=t.project_id
        GROUP BY p.id, u.name ORDER BY p.created_at DESC
      `);
    } else {
      result = await pool.query(`
        SELECT p.*, u.name as owner_name, COUNT(DISTINCT pm2.user_id) as member_count, COUNT(DISTINCT t.id) as task_count
        FROM projects p LEFT JOIN users u ON p.owner_id=u.id
        LEFT JOIN project_members pm ON p.id=pm.project_id AND pm.user_id=$1
        LEFT JOIN project_members pm2 ON p.id=pm2.project_id
        LEFT JOIN tasks t ON p.id=t.project_id
        WHERE p.owner_id=$1 OR pm.user_id=$1
        GROUP BY p.id, u.name ORDER BY p.created_at DESC
      `, [req.user.id]);
    }
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects', auth, async (req, res) => {
  try {
    const { name, description, members } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const result = await pool.query(
      'INSERT INTO projects (name, description, owner_id) VALUES ($1,$2,$3) RETURNING *',
      [name, description, req.user.id]
    );
    const project = result.rows[0];
    await pool.query('INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [project.id, req.user.id, 'admin']);
    if (members && members.length) {
      for (const uid of members) {
        await pool.query('INSERT INTO project_members (project_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [project.id, uid]);
      }
    }
    res.json(project);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/projects/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, u.name as owner_name FROM projects p
      LEFT JOIN users u ON p.owner_id=u.id WHERE p.id=$1`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    const members = await pool.query(`
      SELECT u.id, u.name, u.email, pm.role FROM project_members pm
      JOIN users u ON pm.user_id=u.id WHERE pm.project_id=$1`, [req.params.id]);
    res.json({ ...result.rows[0], members: members.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/projects/:id', auth, async (req, res) => {
  try {
    const project = await pool.query('SELECT * FROM projects WHERE id=$1', [req.params.id]);
    if (!project.rows.length) return res.status(404).json({ error: 'Not found' });
    if (project.rows[0].owner_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM projects WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== TASK ROUTES ======
app.get('/api/projects/:id/tasks', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, u.name as assignee_name FROM tasks t
      LEFT JOIN users u ON t.assignee_id=u.id
      WHERE t.project_id=$1 ORDER BY t.created_at DESC`, [req.params.id]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects/:id/tasks', auth, async (req, res) => {
  try {
    const { title, description, assignee_id, due_date, priority } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const result = await pool.query(
      'INSERT INTO tasks (title, description, project_id, assignee_id, due_date, priority) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [title, description, req.params.id, assignee_id || null, due_date || null, priority || 'medium']
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/tasks/:id', auth, async (req, res) => {
  try {
    const { title, description, status, priority, assignee_id, due_date } = req.body;
    const result = await pool.query(`
      UPDATE tasks SET title=COALESCE($1,title), description=COALESCE($2,description),
      status=COALESCE($3,status), priority=COALESCE($4,priority),
      assignee_id=COALESCE($5,assignee_id), due_date=COALESCE($6,due_date)
      WHERE id=$7 RETURNING *`,
      [title, description, status, priority, assignee_id, due_date, req.params.id]);
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/tasks/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== DASHBOARD ======
app.get('/api/dashboard', auth, async (req, res) => {
  try {
    let tasksQuery, projectsQuery;
    if (req.user.role === 'admin') {
      tasksQuery = await pool.query(`
        SELECT t.*, p.name as project_name, u.name as assignee_name FROM tasks t
        LEFT JOIN projects p ON t.project_id=p.id LEFT JOIN users u ON t.assignee_id=u.id
        ORDER BY t.created_at DESC LIMIT 20`);
      projectsQuery = await pool.query('SELECT COUNT(*) as count FROM projects');
    } else {
      tasksQuery = await pool.query(`
        SELECT t.*, p.name as project_name, u.name as assignee_name FROM tasks t
        LEFT JOIN projects p ON t.project_id=p.id LEFT JOIN users u ON t.assignee_id=u.id
        LEFT JOIN project_members pm ON t.project_id=pm.project_id
        WHERE t.assignee_id=$1 OR pm.user_id=$1
        ORDER BY t.created_at DESC LIMIT 20`, [req.user.id]);
      projectsQuery = await pool.query(`
        SELECT COUNT(DISTINCT p.id) as count FROM projects p
        LEFT JOIN project_members pm ON p.id=pm.project_id
        WHERE p.owner_id=$1 OR pm.user_id=$1`, [req.user.id]);
    }
    const tasks = tasksQuery.rows;
    const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done');
    const stats = {
      total: tasks.length,
      todo: tasks.filter(t => t.status === 'todo').length,
      inprogress: tasks.filter(t => t.status === 'inprogress').length,
      done: tasks.filter(t => t.status === 'done').length,
      overdue: overdue.length,
      projects: projectsQuery.rows[0].count
    };
    res.json({ stats, tasks, overdue });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initDB().then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)));
