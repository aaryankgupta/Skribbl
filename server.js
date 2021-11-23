
const express = require('express');
const app = express();
var EventEmitter = require('events').EventEmitter
var emitter = new EventEmitter();

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

const words = ['angel', 'angry', 'eyeball', 'pizza', 'book', 'giraffe', 'bible', 'cat', 'lion', 'stairs', 'tire', 'sun', 'camera', 'river'];

var current_word = null;

var round_number = 1;

var current_player = null;

app.get('/', (req, res) => {
  res.render('index', { rooms: rooms });
});

app.post('/room', (req, res) => {
  if (rooms[req.body.room] != null) {
    return res.redirect('/');
  }
  rooms[req.body.room] = { users: {}, id: null, played: {}, vote: 0 };
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
  rooms[req.body.room] = { users: {}, id: req.body.pass, played: {}};
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
    rooms[room].played[socket.id] = false;
    socket.to(room).emit('user-connected', name);
  });
  socket.on('send-chat-message', (room, message, guessed) => {
    if(!guessed)
    {
      if(message == current_word)
      {
        io.to(socket.id).emit('correct-guess');
        socket.to(room).emit('made-guess', rooms[room].users[socket.id])
      }
      else
      {
        socket.to(room).emit('chat-message', { message: message, name: rooms[room].users[socket.id]}, guessed);
      }
    }
    else
    {
     socket.to(room).emit('chat-message', { message: message, name: rooms[room].users[socket.id]}, guessed);
    }
  });
  
  // utkarsh's part
  socket.on('send-vote', (room , voter_name) => {
    rooms[room].vote++; // vote for each room would be made 0 after each round
    const num_players = Object.keys(rooms[room].users).length 
    let kicked_out = Boolean(rooms[room].vote == num_players-1)
    io.to(room).emit('votekick-message', voter_name , rooms[room].users[current_player], rooms[room].vote, num_players, kicked_out)
    if(kicked_out){
      delete rooms[room].users[current_player];
      delete rooms[room].played[current_player];
      socket.to(current_player).emit('redirect', '/');
      roundFunc(room);
      setInterval(roundFunc, 90000, room);
    }
  });

  socket.on('drawing', (room, data) => {
    socket.to(room).emit('drawing-data', data)
  });
  socket.on('drawing-end', (room) => {
    socket.to(room).emit('drawing-end')
  });
  socket.on('start-game', (room) => {
    roundFunc(room);
    setInterval(roundFunc, 90000, room);
  });
  socket.on('word-length', (room, num) => {
    socket.to(room).emit('guess-length', num);
  });
  socket.on('disconnect', () => {
    getUserRooms(socket).forEach(room => {
      socket.to(room).emit('user-disconnected', rooms[room].users[socket.id]);
      delete rooms[room].users[socket.id];
      delete rooms[room].played[socket.id];
    })
  });
})
emitter.on('start-round', (room, next) => {
    var keys = Object.keys(words);
    current_word = words[keys[Math.floor(keys.length * Math.random())]];
    io.to(next).emit('round-begin', current_word, room);
  });

function getUserRooms(socket) {
  return Object.entries(rooms).reduce((names, [name, room]) => {
    if (room.users[socket.id] != null) names.push(name)
    return names;
  }, []);
}

function roundFunc(room) {
  if (getKeyByValue(rooms[room].played, false) === undefined)
  {
    round_number = round_number + 1;
    Object.keys(rooms[room].played).forEach(v => rooms[room].played[v] = false)
  }
  next = getKeyByValue(rooms[room].played, false);
  current_player = next;
  rooms[room].played[next] = true;
  rooms[room].vote = 0;
  emitter.emit('start-round', room, next);
}

function getKeyByValue(object, value) {
  return Object.keys(object).find(key => object[key] === value);
}
