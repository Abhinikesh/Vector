import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Room from './models/Room';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Enable CORS for Express REST routes
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());

// Socket.io initialization with CORS configuration
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// REST Health Check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Root route for uptime monitoring
app.get('/', (req, res) => {
  res.send('Vector server is running');
});

// Helper function to generate unique 6-digit room code
async function generateUniqueRoomCode(): Promise<string> {
  let isUnique = false;
  let code = '';
  while (!isUnique) {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    const existing = await Room.findOne({ code });
    if (!existing) {
      isUnique = true;
    }
  }
  return code;
}

// REST Create Room endpoint
app.post('/api/rooms', async (req, res) => {
  try {
    const code = await generateUniqueRoomCode();
    
    // Default workspace files to help user understanding
    const defaultFiles = [
      {
        filename: 'welcome.md',
        content: [
          '# Welcome to Vector',
          '',
          'Vector is a live, synced workspace for code and notes — no sign-up needed.',
          '',
          '## Getting started',
          '',
          '- **Add files** — click **+** in the tab bar. Name it anything: `main.py`, `notes.md`, `idea.txt` — any extension works.',
          '- **Rename files** — double-click a tab name to rename it inline.',
          '- **Delete files** — hover a tab and click the × to remove it.',
          '- **Share this session** — your 6-digit room code is in the header. Hit **Share** and send it to a collaborator.',
          '- **Join a session** — enter someone\'s 6-digit code in the **"Receive a code"** box to instantly switch into their room.',
          '- **Download** — click **Download** to get a zip of every file in this workspace.',
          '',
          'Files sync live between everyone in the room. Start typing — your collaborator will see it appear in real time.',
        ].join('\n'),
        language: 'markdown',
        order: 0
      },
      {
        filename: 'index.html',
        content: [
          '<!-- Welcome to Vector HTML! -->',
          '<!DOCTYPE html>',
          '<html lang="en">',
          '<head>',
          '  <meta charset="UTF-8">',
          '  <title>Vector HTML</title>',
          '</head>',
          '<body>',
          '  <h1>Hello from Vector!</h1>',
          '</body>',
          '</html>',
        ].join('\n'),
        language: 'html',
        order: 1
      },
      {
        filename: 'main.py',
        content: [
          '# Welcome to Vector Python!',
          'print("Hello from Vector!")',
        ].join('\n'),
        language: 'python',
        order: 2
      }
    ];

    const room = new Room({
      code,
      files: defaultFiles
    });
    await room.save();
    res.status(201).json(room);
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// REST Get Room by code endpoint
app.get('/api/rooms/:code', async (req, res) => {
  try {
    const { code } = req.params;

    // Validate code length and format
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid room code format. Must be 6 digits.' });
    }

    const room = await Room.findOne({ code });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.json(room);
  } catch (error) {
    console.error('Error fetching room:', error);
    res.status(500).json({ error: 'Failed to fetch room' });
  }
});

// Socket connection check and handlers
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Client joins a room
  socket.on('join-room', (code: unknown) => {
    try {
      if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
        console.warn(`Socket ${socket.id} tried to join invalid room code:`, code);
        return;
      }
      
      socket.join(code);
      socket.data = socket.data || {};
      socket.data.roomCode = code;
      console.log(`Socket ${socket.id} joined room ${code}`);

      // Broadcast room presence count
      const count = io.sockets.adapter.rooms.get(code)?.size || 0;
      io.to(code).emit('room:presence', { count });
    } catch (err) {
      console.error('Error in socket join-room:', err);
    }
  });

  // Client leaves a room
  socket.on('leave-room', () => {
    try {
      const code = socket.data?.roomCode;
      if (code && typeof code === 'string') {
        socket.leave(code);
        socket.data.roomCode = undefined;
        const count = io.sockets.adapter.rooms.get(code)?.size || 0;
        io.to(code).emit('room:presence', { count });
      }
    } catch (err) {
      console.error('Error in socket leave-room:', err);
    }
  });

  // Client edits file content
  socket.on('file:edit', async (payload: any) => {
    try {
      if (!payload || typeof payload !== 'object') return;
      const { code, filename, content } = payload;
      if (typeof code !== 'string' || typeof filename !== 'string' || typeof content !== 'string') {
        console.warn('Invalid file:edit payload parameters');
        return;
      }

      const room = await Room.findOne({ code });
      if (room) {
        const file = room.files.find(f => f.filename === filename);
        if (file) {
          file.content = content;
          await room.save();
          // Broadcast to everyone else in the room
          socket.to(code).emit('file:edit', { filename, content });
        }
      }
    } catch (error) {
      console.error('Error handling file:edit:', error);
    }
  });

  // Client adds a new file
  socket.on('file:add', async (payload: any) => {
    try {
      if (!payload || typeof payload !== 'object') return;
      const { code, filename, language } = payload;
      if (typeof code !== 'string' || typeof filename !== 'string' || typeof language !== 'string') {
        console.warn('Invalid file:add payload parameters');
        return;
      }

      const room = await Room.findOne({ code });
      if (room) {
        // Enforce uniqueness of filename inside the room
        const exists = room.files.some(f => f.filename === filename);
        if (!exists) {
          const order = room.files.length;
          
          // Language-specific templates
          const defaultTemplates: Record<string, string> = {
            html: `<!-- Welcome to Vector HTML! -->\n<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Vector HTML</title>\n</head>\n<body>\n  <h1>Hello from Vector!</h1>\n</body>\n</html>\n`,
            css: `/* Welcome to Vector CSS! */\nbody {\n  font-family: system-ui, sans-serif;\n  background-color: #111113;\n  color: #e4e4e7;\n  padding: 2rem;\n}\n`,
            js: `// Welcome to Vector JavaScript!\nconsole.log("Hello from Vector!");\n`,
            py: `# Welcome to Vector Python!\nprint("Hello from Vector!")\n`,
            md: `# Vector Markdown\n\nUse this file for plain notes, ideas, or formatted documentation.\n`,
            txt: `Vector Plain Text\n=================\nWrite anything here.\n`,
          };
          
          const ext = filename.split('.').pop()?.toLowerCase() || '';
          const initialContent = defaultTemplates[ext] || '';
          
          const newFile = { filename, content: initialContent, language, order };
          room.files.push(newFile);
          await room.save();
          // Broadcast the new file to everyone in the room
          io.to(code).emit('file:add', newFile);
        }
      }
    } catch (error) {
      console.error('Error handling file:add:', error);
    }
  });

  // Client renames a file
  socket.on('file:rename', async (payload: any) => {
    try {
      if (!payload || typeof payload !== 'object') return;
      const { code, oldFilename, newFilename, language } = payload;
      if (typeof code !== 'string' || typeof oldFilename !== 'string' || typeof newFilename !== 'string' || typeof language !== 'string') {
        console.warn('Invalid file:rename payload parameters');
        return;
      }

      const room = await Room.findOne({ code });
      if (room) {
        const file = room.files.find(f => f.filename === oldFilename);
        if (file) {
          file.filename = newFilename;
          file.language = language;
          await room.save();
          // Broadcast the renaming to everyone in the room
          io.to(code).emit('file:rename', { oldFilename, newFilename, language });
        }
      }
    } catch (error) {
      console.error('Error handling file:rename:', error);
    }
  });

  // Client deletes a file
  socket.on('file:delete', async (payload: any) => {
    try {
      if (!payload || typeof payload !== 'object') return;
      const { code, filename } = payload;
      if (typeof code !== 'string' || typeof filename !== 'string') {
        console.warn('Invalid file:delete payload parameters');
        return;
      }

      const room = await Room.findOne({ code });
      if (room) {
        // Enforce minimum 1 file rule
        if (room.files.length > 1) {
          room.files = room.files.filter(f => f.filename !== filename) as any;
          // Re-index order field of remaining files
          room.files.forEach((f, idx) => {
            f.order = idx;
          });
          await room.save();
          // Broadcast deletion to everyone in the room
          io.to(code).emit('file:delete', { filename });
        }
      }
    } catch (error) {
      console.error('Error handling file:delete:', error);
    }
  });

  socket.on('disconnect', () => {
    try {
      console.log(`Socket disconnected: ${socket.id}`);
      const code = socket.data?.roomCode;
      if (code && typeof code === 'string') {
        const count = io.sockets.adapter.rooms.get(code)?.size || 0;
        io.to(code).emit('room:presence', { count });
      }
    } catch (err) {
      console.error('Error in socket disconnect:', err);
    }
  });
});

// Database connection & Server start
const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vector';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Successfully connected to MongoDB.');
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });
