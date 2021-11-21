
const express = require('express');
const app = express();

const server = require('http').Server(app);
const io = require('socket.io')(server, {
    cors: {
        origin: '*'
    }
});

app.set('views', './views');
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

const rooms = {};

app.get('/', (req, res) => {
  res.render('index', { rooms: rooms });
});

app.post('/room', (req, res) => {
  if (rooms[req.body.room] != null) {
    return res.redirect('/');
  }
  rooms[req.body.room] = { users: {}, id: null };
  res.redirect(req.body.room);
  io.emit('room-created', req.body.room);
})

app.get('/private', (req, res) => {
  res.render('private.ejs', {});
});

app.post('/privateroom', (req, res) => {
  if (rooms[req.body.room] != null) {
    return res.redirect('/private');
  }
  rooms[req.body.room] = { users: {}, id: req.body.pass};
  res.redirect(req.body.room);
});

app.post('/joinprivate', (req, res) => {
  if (rooms[req.body.room] == null) {
    return res.redirect('/private');
  }
  return res.redirect(req.body.room);
});

app.get('/:room', (req, res) => {
  if (rooms[req.params.room] == null) {
    return res.redirect('/');
  }
  res.render('room', { roomName: req.params.room, roomPass: rooms[req.params.room].id });
});

server.listen(5500, () =>
console.log('Listening on port *:5500'));

io.on('connection', socket => {
  socket.on('new-user', (room,name) => {
    socket.join(room);
    rooms[room].users[socket.id] = name;
    socket.to(room).emit('user-connected', name);
  });
  socket.on('send-chat-message', (room, message) => {
    socket.to(room).emit('chat-message', { message: message, name: rooms[room].users[socket.id] });
  });
  socket.on('drawing', (room, data) => {
    socket.to(room).emit('drawing-data', data)
  });
  socket.on('drawing-end', (room) => {
    socket.to(room).emit('drawing-end')
  });
  socket.on('disconnect', () => {
    getUserRooms(socket).forEach(room => {
      socket.to(room).emit('user-disconnected', rooms[room].users[socket.id]);
      delete rooms[room].users[socket.id];
    })
  });
})

function getUserRooms(socket) {
  return Object.entries(rooms).reduce((names, [name, room]) => {
    if (room.users[socket.id] != null) names.push(name)
    return names;
  }, []);
}
