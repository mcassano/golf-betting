import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import apiRouter, { setIo } from './routes/api.js';
import { getJSON, setJSON } from './services/redis.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

setIo(io);

app.use(express.json());
if (!process.env.COOKIE_SECRET) {
  throw new Error('COOKIE_SECRET environment variable is required');
}
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(express.static(join(__dirname, 'public')));
app.use('/api', apiRouter);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Seed default users if not set
async function seedUsers() {
  const existing = await getJSON('users');
  if (!existing) {
    const names = process.env.GOLF_USERS
      ? process.env.GOLF_USERS.split(',').map((s) => s.trim())
      : ['Mike', 'Caleb', 'Marshall'];
    await setJSON('users', names);
    console.log('Seeded users:', names);
  }
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, async () => {
  await seedUsers();
  console.log(`Golf betting app running on http://localhost:${PORT}`);
});
