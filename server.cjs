// server.cjs
const express = require('express')
const http = require('http')
const { Server: IOServer } = require('socket.io')
const path = require('path')
// 不需要 fileURLToPath

// ——— 在 ES 模块里手动定义 __dirname ———
// const __filename = fileURLToPath(import.meta.url)
// const __dirname = path.dirname(__filename)

const app = express()

// —— 1) 全局允许跨域 ——
// 这样既对 express 请求生效，也对 socket.io 轮询的 HTTP 请求生效
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,DELETE,OPTIONS'
  )
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  )
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// —— 2) 再挂载 express.static（或其它路由），不要在它前面拦截 /socket.io ——  
app.use(express.static(path.join(__dirname, 'dist')))

const server = http.createServer(app)

// —— 3) 创建 Socket.IO 并启用其自身的 CORS ——  
const io = new IOServer(server, {
  path: '/socket.io',                // 默认即可，可省略
  cors: {
    origin: '*',
    methods: ['GET','POST','OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }
})

io.on('connection', socket => {
  console.log('Client connected:', socket.id)
  socket.on('submitData', data => {
    io.emit('newData', data)
  })
  socket.on('disconnect', () => {
    console.log('Client disconnected')
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
)
